"""Only the document-backed pilot may appear in the working portfolio."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from compare_excel_app import load_version

book = ROOT / 'data/contractors/c1/models/model-2026-09-22.xlsx'
_, pilot = load_version(book, 'd_pilot_4700134128', 'v_pilot_2026')
assert pilot['workSourceMeta']['primaryRows'] > 0
for contract_id, version_id in (
    ('d_pilot_4700134128', 'v_factor_example_2026'),
    ('d_scenario_b_4700134128', 'v_scenario_b_2026'),
):
    try:
        load_version(book, contract_id, version_id)
    except ValueError:
        pass
    else:
        raise AssertionError(f'Synthetic version was exported: {version_id}')
app = (ROOT / 'src/app.js').read_text()
assert '.filter(v=>!v.scenarioDerived&&!v.exampleEdits)' in app
assert "if(v?.scenarioDerived||v?.exampleEdits)throw Error" in app
assert 'applyExample(' not in app
print('LIVE DATA GATE: OK')
