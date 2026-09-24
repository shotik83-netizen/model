"""Read-only, provenance-aware monthly comparison of Excel and a saved app version.

The report never labels a raw difference a formula defect if input provenance,
contract identity, currency, or calculation methods have not been reconciled.
"""

import argparse
import datetime as dt
import hashlib
import json
import subprocess
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from audit_excel_reference import DATE_ORIGIN, cached_cells


ROWS = (
    ("Выручка", 42, "revenue", 1, "условно"),
    ("Прямые расходы", 46, "direct", -1, "структура статей"),
    ("Косвенные расходы", 59, "indirect", -1, "структура статей"),
    ("Финансовый результат", 79, "profit", 1, "условно"),
    ("Поступления по работам", 85, "payments", 1, "методика платежей"),
    ("Авансы", 93, "advances", 1, "методика платежей"),
    ("Выплаты и НДС", 96, "operatingPayments", -1, "НДС и лаг платежей"),
    ("Чистый денежный поток", 140, "ncf", 1, "состав потока"),
)
SERIES = ("physicalVolume", "boqRate", "revenue", "otherRevenue", "materials",
          "directPeople", "auxiliaryPeople", "indirectPeople", "equipmentHours",
          "nrkVolume", "payments", "advances", "advanceOffset", "factoring")
NO_VAT = {"payroll", "payrollTax", "insurance", "vacation", "indirectPayroll",
          "indirectTax", "indirectInsurance", "indirectVacation"}


def readiness(version, contract, source_contract_number=None):
    """Return independent blockers; an unknown identity is not an approved match."""
    issues = []
    if version.get("dataMode") != "imported":
        issues.append("режим demo: нет подтверждённых исходных данных" if version.get("dataMode") == "demo" else "сохранённая версия не имеет полного подтверждения факта затрат и всех прогнозных входов")
    if version.get("currency") != "USD":
        issues.append("валюта версии не совпадает с указанной валютой эталона USD")
    if version.get("currency") != "RUB" and not (isinstance(version.get("fxRate"), (int, float)) and version["fxRate"] > 0):
        issues.append("нет положительного курса для рублёвого эквивалента")
    if not source_contract_number or source_contract_number != contract.get("number"):
        issues.append("не подтверждено соответствие договора исходной книги и версии приложения")
    if version.get("vacationBasis", contract.get("vacationBasis", "annual")) == "annual":
        issues.append("правило резерва отпусков отличается от исходной Excel-книги")
    return issues


def load_version(path, contract_id, version_id):
    # Read only the internal JSON cell, without evaluating formulas or needing
    # third-party packages in GitHub Actions.
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
          "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
    with zipfile.ZipFile(path) as book:
        workbook = ET.fromstring(book.read("xl/workbook.xml"))
        sheet = next(s for s in workbook.findall(".//x:sheet", ns) if s.get("name") == "_DATA")
        rid = sheet.get("{" + ns["r"] + "}id")
        rels = ET.fromstring(book.read("xl/_rels/workbook.xml.rels"))
        target = next(r.get("Target") for r in rels if r.get("Id") == rid)
        sheet_path = target.lstrip("/") if target.startswith("/") else "xl/" + target
        xml = ET.fromstring(book.read(sheet_path))
        cells = xml.findall(".//x:sheetData/x:row/x:c", ns)
        cells = [cell for cell in cells if cell.get('r', '').startswith('A') and cell.get('r') != 'A1']
        if not cells:
            raise ValueError("_DATA!A2 is absent")
        strings = None
        parts = []
        for cell in cells:
            if cell.get("t") == "s":
                if strings is None:
                    strings = ET.fromstring(book.read("xl/sharedStrings.xml"))
                index = int(cell.find("x:v", ns).text)
                parts.append("".join(strings.findall("x:si", ns)[index].itertext()))
            elif cell.get("t") == "inlineStr":
                parts.append("".join(cell.find("x:is", ns).itertext()))
            else:
                parts.append(cell.find("x:v", ns).text)
        payload_text = "".join(parts)
        payload = json.loads(payload_text)
    for contract in payload["contractor"]["contracts"]:
        if contract["id"] == contract_id:
            for version in contract["versions"]:
                if version["id"] == version_id:
                    return contract, version
    raise ValueError(f"contract/version {contract_id}/{version_id} not found")


def normalized(version, contract, root):
    source = (root / "src/app.js").read_text(encoding="utf-8")
    import re
    names = re.findall(r"\['(?:direct|indirect)','[^']*','([^']+)'", source)
    defaults = {k: {"value": 0, "enabled": True, "method": "manual", "lag": 0,
                    "cash": k not in {"vacation", "indirectVacation"}, "vat": k not in NO_VAT}
                for k in names}
    # Browser defaults supply missing settings; recover exactly from its literal.
    if not re.search(r"const COST_DEFS=(\[[\s\S]*?\]);\s*const PERCENT_RATE_METHODS=", source):
        raise ValueError("app COST_DEFS not found")
    # Array has JavaScript strings, integers and no expressions; convert through Node snapshot helper.
    # Parameter values present in saved versions are authoritative; missing ones are ineligible for parity.
    params = {**contract.get("parameters", {}), **version.get("parameters", {})}
    if set(defaults) - set(params):
        raise ValueError("saved version has missing calculation parameters")
    params = {k: {**defaults[k], **params[k]} for k in defaults}
    d = {**version.get("drivers", {}),
         **{key: (version.get("drivers", {}).get(key) or [0] * 12) for key in SERIES}}
    if any(len(x) != 12 for x in d.values() if isinstance(x, list)):
        raise ValueError("driver series length differs from 12")
    return {**version, "year": version.get("year", contract.get("year", 2026)),
            "vatRate": version.get("vatRate", contract.get("vatRate", 22)),
            "vacationBasis": version.get("vacationBasis", contract.get("vacationBasis", "annual")),
            "parameters": params, "drivers": d,
            "manualCosts": version.get("manualCosts") or {},
            "manualPayments": version.get("manualPayments") or {},
            "workItems": version.get("workItems") or []}


def app_snapshot(version, contract, root):
    data = normalized(version, contract, root)
    completed = subprocess.run(["node", str(root / "scripts/app_model_snapshot.js")],
                               input=json.dumps(data), text=True, capture_output=True, check=True)
    return json.loads(completed.stdout), data


def month_columns(cells, year):
    columns = []
    for i in range(13, 44):
        number = i
        label = ""
        while number:
            number, r = divmod(number - 1, 26)
            label = chr(65 + r) + label
        serial = cells.get(f"{label}9")
        if serial is not None:
            date = (DATE_ORIGIN + dt.timedelta(days=serial)).date()
            if date.year == year:
                columns.append((date, label))
    if len(columns) != 12 or [d.month for d, _ in columns] != list(range(1, 13)):
        raise ValueError("source does not contain exactly twelve ordered monthly columns")
    return columns


def money(n):
    return f"{n:,.3f}".replace(",", " ").replace(".", ",")


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def report(cells, result, columns, issues, source, saved, contract, version, data):
    lines = ["# Предварительная помесячная сверка Excel и приложения — 2026",
             "", "Статус: **пилотный договор сопоставлен частично; числовая эквивалентность всей модели не подтверждена**.",
             "Ни одна разность ниже не квалифицируется как ошибка формулы. Пользовательская приёмка ожидается.",
             "", "## Происхождение и единицы", "",
             f"- Исходная книга: `{Path(source).name}`, SHA-256 `{sha256(source)}`; лист «Детальная модель», сохранённые кэшированные значения (не новый пересчёт формул).",
             f"- Сохранённая книга приложения: `{Path(saved).name}`, SHA-256 `{sha256(saved)}`; договор `{contract['number']}`, версия `{version['id']}`, режим `{version.get('dataMode')}`.",
             f"- Период: {data['year']}, 12 месяцев; исходная книга — млн USD по подписи модели; приложение — сохранённые денежные ряды, делённые на 1 000 000, с меткой `{version.get('currency')}`. Валюта исходных величин требует подтверждения по исходным документам.",
             "- Снимок приложения рассчитан из сохранённой версии. Автоматически загружаемые при открытии BOQ/КСГ не подставлялись; это не имитация открытого в браузере состояния.",
             "", "## Блокирующие условия", ""]
    lines.extend(f"- {x}." for x in issues)
    lines += ["- Выполнение BOQ/КСГ и остальные входные ряды обеих моделей не выверены по документам.",
              "- Поступления и зачёты проверяются раздельно; налоговые выплаты и расчётные затраты пока не сверены постатейно с Excel.",
              "", "## Карта и помесячные значения", "",
              "В каждой строке первое число — Excel, второе — сохранённый снимок приложения. Оба указаны в миллионах единиц, обозначенных USD; их нельзя вычитать до согласования источников и методик. Расходы Excel приведены к положительному знаку. Для строки «Выплаты и НДС» число приложения — только операционные выплаты, без налогового платежа.", ""]
    for label, row, field, sign, limitation in ROWS:
        lines += [f"### {label} — Excel строка {row}, приложение `{field}`", "",
                  f"Ограничение карты: {limitation}. Совпадение значений: не проверено.", "",
                  "| Месяц | Excel | Приложение |", "|---|---:|---:|"]
        for m, (date, col) in enumerate(columns):
            excel = sign * cells.get(f"{col}{row}", 0)
            app = (data["drivers"][field][m] if field in ("payments", "advances")
                   else result[field][m]) / 1_000_000
            lines.append(f"| {date:%Y-%m} | {money(excel)} | {money(app)} |")
        lines.append("")
    lines += ["## Порядок закрытия расхождений", "",
              "1. Проверить подтверждённый договор и его курс 80 RUB/USD во всех строках; уточнить недостающие входные данные и расхождение августовского кэша с документами.",
              "2. Согласовать состав показателей, НДС, графики факта и плановых платежей, метод начисления отпускного резерва.",
              "3. Повторить расчёт на одном наборе входов, затем сравнить помесячные дельты с допуском и классифицировать только оставшиеся формульные расхождения.",
              "4. Предъявить итог пользователю для поэлементной приёмки; текущий статус FM-2026-007/019 не закрывать.", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("saved", type=Path)
    parser.add_argument("--contract", default="d1")
    parser.add_argument("--version", default="v2")
    parser.add_argument("--source-contract-number", help="only if verified against the source workbook")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    contract, version = load_version(args.saved, args.contract, args.version)
    result, data = app_snapshot(version, contract, root)
    cells = cached_cells(args.source)
    months = month_columns(cells, data["year"])
    issues = readiness(version, contract, args.source_contract_number)
    if not issues:
        raise ValueError("No blockers: this preliminary report cannot certify parity; complete input and formula review first")
    args.output.write_text(report(cells, result, months, issues, args.source, args.saved,
                                  contract, version, data), encoding="utf-8")
    print(f"PRELIMINARY: {len(months)} months, {len(ROWS)} indicators, {len(issues)} blockers; {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
