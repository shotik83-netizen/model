"""Keep the document-backed pilot intact and mark restored examples explicitly."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from compare_excel_app import load_version

original = ROOT / 'data/contractors/c1/models/model-2026-09-22.xlsx'
book = ROOT / 'data/contractors/c1/models/model-2026-09-28-demo.xlsx'
_, pilot = load_version(book, 'd_pilot_4700134128', 'v_pilot_2026')
_, original_pilot = load_version(original, 'd_pilot_4700134128', 'v_pilot_2026')
assert pilot == original_pilot
assert pilot['workSourceMeta']['primaryRows'] > 0
_, factor = load_version(book, 'd_pilot_4700134128', 'v_factor_example_2026')
_, scenario = load_version(book, 'd_scenario_b_4700134128', 'v_scenario_b_2026')
assert factor['exampleEdits'] and 'Факторный пример' in factor['name']
assert scenario['scenarioDerived'] and 'Расчётный' in scenario['name']
app = (ROOT / 'src/app.js').read_text()
assert "const exampleVersion=!!(v.exampleEdits||v.scenarioDerived" in app
assert 'ДЕМОНСТРАЦИОННЫЙ СЦЕНАРИЙ' in app
assert 'applyExample(' not in app
print('LIVE DATA GATE: DEMO LABELS OK')
