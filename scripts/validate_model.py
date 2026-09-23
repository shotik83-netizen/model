#!/usr/bin/env python3
"""Offline validation for the deployable financial model.

Uses only the Python standard library so it can run before publication and in
GitHub Actions. Nothing is executed in SharePoint.
"""

from __future__ import annotations

import json
import math
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []


def fail(message: str) -> None:
    ERRORS.append(message)


def load_json(relative: str):
    path = ROOT / relative
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"{relative}: {exc}")
        return None


def workbook_sheet_names(path: Path) -> set[str]:
    try:
        with zipfile.ZipFile(path) as book:
            xml = book.read("xl/workbook.xml")
    except (OSError, KeyError, zipfile.BadZipFile) as exc:
        fail(f"{path.relative_to(ROOT)}: некорректный XLSX ({exc})")
        return set()
    root = ET.fromstring(xml)
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    return {sheet.attrib.get("name", "") for sheet in root.findall(".//x:sheet", ns)}


def validate_config() -> None:
    config = load_json("config/config.json")
    if not isinstance(config, dict):
        return
    if config.get("application") != "financial-economic-model":
        fail("config/config.json: неверный application")
    if not isinstance(config.get("schemaVersion"), int) or config["schemaVersion"] < 1:
        fail("config/config.json: schemaVersion должен быть положительным целым")
    if not isinstance(config.get("unit"), (int, float)) or config["unit"] <= 0:
        fail("config/config.json: unit должен быть положительным")
    contractors = config.get("contractors")
    if not isinstance(contractors, list) or not contractors:
        fail("config/config.json: отсутствуют contractors")
        return
    ids: set[str] = set()
    for index, contractor in enumerate(contractors, 1):
        if not isinstance(contractor, dict):
            fail(f"contractors[{index}]: ожидается объект")
            continue
        contractor_id = str(contractor.get("id", "")).strip()
        if not contractor_id or contractor_id in ids:
            fail(f"contractors[{index}]: пустой или повторяющийся id")
        ids.add(contractor_id)
        file_url = contractor.get("fileUrl")
        if not isinstance(file_url, str) or not file_url.endswith(".xlsx"):
            fail(f"contractors[{index}]: некорректный fileUrl")
            continue
        workbook = ROOT / file_url
        if not workbook.is_file():
            fail(f"{file_url}: файл модели не найден")
            continue
        if "_DATA" not in workbook_sheet_names(workbook):
            fail(f"{file_url}: отсутствует обязательный лист _DATA")


def validate_source_mapping() -> None:
    mapping = load_json("config/source-mapping.json")
    if not isinstance(mapping, dict):
        return
    sources = mapping.get("sources")
    if not isinstance(sources, dict):
        fail("config/source-mapping.json: отсутствует объект sources")
        return
    for source_name in ("boq", "ksg"):
        source = sources.get(source_name)
        if not isinstance(source, dict):
            fail(f"source-mapping: отсутствует обязательный источник {source_name}")
            continue
        required = source.get("requiredFields")
        fields = source.get("fields")
        if not isinstance(required, list) or not required:
            fail(f"source-mapping.{source_name}: requiredFields пуст")
        if not isinstance(fields, dict):
            fail(f"source-mapping.{source_name}: fields отсутствует")
            continue
        for field in required or []:
            aliases = fields.get(field)
            if not isinstance(aliases, list) or not aliases:
                fail(f"source-mapping.{source_name}: нет заголовков для {field}")
        path = source.get("path")
        if not isinstance(path, str) or not (ROOT / path).is_file():
            fail(f"source-mapping.{source_name}: обязательный файл {path!r} не найден")
        elif not workbook_sheet_names(ROOT / path):
            fail(f"source-mapping.{source_name}: книга не содержит листов")


def factor_bridge(q0, p0, q1, p1) -> tuple[float, float, float, float]:
    q0 = float(q0 or 0)
    q1 = float(q1 or 0)
    if p0 is None and p1 is None:
        raise ValueError("нет ставки в обеих версиях")
    if p0 is None:
        p1 = float(p1)
        base, current = 0.0, q1 * p1
        return base, current, current, 0.0
    if p1 is None:
        p0 = float(p0)
        base, current = q0 * p0, 0.0
        return base, current, -base, 0.0
    p0, p1 = float(p0), float(p1)
    base, current = q0 * p0, q1 * p1
    return base, current, (q1 - q0) * p0, q1 * (p1 - p0)


def validate_factor_cases() -> None:
    cases = load_json("tests/factor-analysis-cases.json")
    if not isinstance(cases, list) or not cases:
        fail("tests/factor-analysis-cases.json: нет контрольных случаев")
        return
    for case in cases:
        try:
            base, current, volume, price = factor_bridge(
                case.get("q0"), case.get("p0"), case.get("q1"), case.get("p1")
            )
        except (TypeError, ValueError) as exc:
            fail(f"factor {case.get('name')}: {exc}")
            continue
        if not math.isclose(volume, case["expectedVolume"], abs_tol=1e-9):
            fail(f"factor {case['name']}: неверный фактор объёма {volume}")
        if not math.isclose(price, case["expectedPrice"], abs_tol=1e-9):
            fail(f"factor {case['name']}: неверный фактор цены {price}")
        if not math.isclose(base + volume + price, current, abs_tol=1e-9):
            fail(f"factor {case['name']}: не сходится контрольный мост")


def validate_deployable_html() -> None:
    html = ROOT / "index.html"
    if not html.is_file():
        fail("index.html: файл не найден")
        return
    text = html.read_text(encoding="utf-8")
    if "<script src=" in text.lower() or "<link rel=\"stylesheet\" href=\"http" in text.lower():
        fail("index.html: найдена внешняя исполняемая зависимость")
    for marker in ("const DataAdapter=", "const CalculationCore=", "APP='financial-economic-model'", "DEFAULT_MAPPING", "function calcModel"):
        if marker not in text:
            fail(f"index.html: отсутствует контрольный маркер {marker}")


def main() -> int:
    validate_config()
    validate_source_mapping()
    validate_factor_cases()
    validate_deployable_html()
    if ERRORS:
        print("MODEL VALIDATION: FAILED")
        for error in ERRORS:
            print(f"- {error}")
        return 1
    print("MODEL VALIDATION: OK")
    print("- config and contractor workbooks")
    print("- required BOQ/KSG mappings and files")
    print("- factor-analysis bridge cases")
    print("- standalone index.html markers")
    return 0


if __name__ == "__main__":
    sys.exit(main())
