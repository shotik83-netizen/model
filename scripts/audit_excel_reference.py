"""Read-only audit of cached accounting identities in the source Excel model.

The source workbook contains invalid defined names, so this tool reads sheet XML
directly. It does not evaluate formulas, modify the workbook, or assert parity
with the application's model. Exit nonzero when a tested cached identity fails.
"""

import argparse
import datetime as dt
import math
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
DATE_ORIGIN = dt.datetime(1899, 12, 30)
MONTH_ROW = 9
SHEET = "xl/worksheets/sheet3.xml"  # «Детальная модель»


def cached_cells(path):
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read(SHEET))
    cells = {}
    for row in root.findall(".//m:sheetData/m:row", NS):
        row_number = int(row.get("r"))
        if row_number != MONTH_ROW and not 42 <= row_number <= 141:
            continue
        for cell in row.findall("m:c", NS):
            ref = cell.get("r")
            if not re.fullmatch(r"[A-Z]+\d+", ref):
                continue
            value = cell.find("m:v", NS)
            if value is None or value.text is None or cell.get("t") in {"e", "s", "str"}:
                continue
            try:
                number = float(value.text)
            except ValueError:
                continue
            if math.isfinite(number):
                cells[ref] = number
    return cells


def audit(cells, year=None, absolute_tolerance=1e-7, relative_tolerance=1e-8):
    checks = (
        ("выручка = СМР + МТР", 42, (43, 44)),
        ("расходы = прямые + косвенные", 45, (46, 59)),
        ("прямые = статьи", 46, tuple(range(47, 59))),
        ("косвенные = статьи", 59, tuple(range(60, 79))),
        ("финрезультат = выручка + расходы", 79, (42, 45)),
        ("платежи = статьи + НДС", 96, (*range(97, 132), 139)),
        ("NCF итого = поступления + платежи", 140, (85, 87, 93, 96)),
    )
    tested = 0
    failures = []
    months = []
    for column in range(13, 44):  # M:AQ; reject columns outside the cached time series
        label = ""
        n = column
        while n:
            n, rem = divmod(n - 1, 26)
            label = chr(65 + rem) + label
        serial = cells.get(f"{label}{MONTH_ROW}")
        if serial is None:
            continue
        period = (DATE_ORIGIN + dt.timedelta(days=serial)).date()
        if year is not None and period.year != year:
            continue
        months.append(period.isoformat())
        for name, target, sources in checks:
            references = [f"{label}{r}" for r in (target, *sources)]
            if references[0] not in cells:
                failures.append((period, name, "нет кэшированного итога: " + references[0]))
                continue
            tested += 1
            lhs = cells[references[0]]
            # Excel SUM and direct addition treat empty optional source cells as zero.
            rhs = math.fsum(cells.get(ref, 0) for ref in references[1:])
            if not math.isclose(lhs, rhs, rel_tol=relative_tolerance, abs_tol=absolute_tolerance):
                failures.append((period, name, f"расхождение {lhs - rhs:.9g} в {references[0]}"))
    return months, tested, failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", help="путь к исходной model.xlsx (только чтение)")
    parser.add_argument("--year", type=int, help="ограничить проверку указанным годом")
    args = parser.parse_args()
    try:
        months, tested, failures = audit(cached_cells(args.workbook), args.year)
    except (OSError, KeyError, ET.ParseError, zipfile.BadZipFile) as exc:
        parser.error(f"не удалось прочитать исходную книгу: {exc}")
    print(f"EXCEL SOURCE AUDIT: {len(months)} months, {tested} identities, {len(failures)} issues")
    for period, name, detail in failures[:30]:
        print(f"- {period} {name}: {detail}")
    if len(failures) > 30:
        print(f"- ещё {len(failures) - 30} проблем")
    if not months:
        print("Нет месяцев для проверки; год или исходный ряд не распознан", file=sys.stderr)
        return 2
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
