"""Guard against publishing synthetic pilot output as confirmed financial fact."""
import sys
import json
import subprocess
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from compare_excel_app import load_version, normalized

root = Path(__file__).resolve().parents[1]
book = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'data/contractors/c1/models/model-2026-09-22.xlsx'
pilot, version = load_version(book, 'd_pilot_4700134128', 'v_pilot_2026')
assert pilot['number'] == version['workSourceMeta']['sourceContractNumber'] == '4700134128'
assert pilot['sourceIdentityConfirmed']
assert pilot['sourceIdentities']['primary_documents']['contractNumber'] == 'НКНХ.10321'
assert pilot['sourceIdentities']['payments']['contractNumber'] == '120001358474'
assert version['workSourceMeta']['primaryPaymentMatches'] >= 3
assert version['dataMode'] == 'source_partial'
assert version['currency'] == 'USD'
assert len(version['workItems']) > 100
assert sum(version['drivers']['ksgRevenue']) > 0
if version.get('materialForecastByKq'):
    assert all(abs(sum(values[m] for values in version['materialForecastByKq'].values()) - version['drivers']['ksgMaterialsRevenue'][m]) < .02 for m in range(12))
assert version['actualThroughMonth'] == 0 and version['primaryIdentityConfirmed']
assert len(version['drivers']['ks2Accepted']) == 12
assert version['workSourceMeta']['unmatchedRows'] == 0
assert version['workSourceMeta']['ignoredRows'] == 32
assert version['workSourceMeta']['primaryRows'] == 28
assert abs(version['drivers']['primaryExecuted'][0] - 1421531.78) < 0.01
assert version['workSourceMeta']['primaryCacheDifferences'] == [8, 9, 10, 11, 12]
assert version['workSourceMeta']['resourceCacheDifferences'] == [8, 9, 10, 11, 12]
assert len(version['drivers']['primaryExecuted']) == 12
assert abs(version['drivers']['primaryExecuted'][7] - 1306310.04) < 0.01
assert len(version['personnelCategories']['direct']) == 5
assert len(version['personnelCategories']['indirect']) == 5
calculated = subprocess.run(['node', str(root / 'scripts/app_model_snapshot.js')],
                            input=json.dumps(normalized(version, pilot, root)),
                            text=True, capture_output=True, check=True)
result = json.loads(calculated.stdout)
rows = result['rows']
if version.get('materialForecastByKq'):
    assert all(abs(sum(values[m] for values in result['materialCostsByKind'].values()) - rows['projectMaterials'][m]) < .02 for m in range(12))
assert abs(rows['payroll'][0] - 382981.96414333646) < 0.001
assert abs(rows['insurance'][0] - 101503.97318406111) < 0.001
if version.get('cashFlowBasis') == 'source_model':
    assert abs(result['inflow'][2] - version['drivers']['factoring'][2]) < 0.01
    assert abs(result['receivable'][2] - result['receivable'][1] - (version['drivers']['primaryExecuted'][2] - version['drivers']['primaryGuaranteeHold'][2] - version['drivers']['primaryDeductions'][2] - version['drivers']['payments'][2] - version['drivers']['factoring'][2] - version['drivers']['advanceOffset'][2])) < 0.01
    assert abs(result['inflow'][0] * version['fxRate'] - 120768180.8) < 0.01
    assert version['workSourceMeta']['bankRows'] == 6
    assert version['workSourceMeta']['factoringRows'] == 25
    assert version['cashFlowBasis'] == 'source_model'
    assert version['fxRate'] == 80
    assert round(version['drivers']['payments'][0], 2) == 1509602.26
    assert round(version['drivers']['payments'][1], 2) == 757302.57
    assert round(version['drivers']['factoring'][2], 2) == 855793.46
    assert sum(version['drivers']['advances']) == 0
    assert round(version['drivers']['advanceOffset'][2],2) == 855582.93
else:
    # The checked-in workbook may predate the document-level cash correction.
    # The browser refreshes source reports on startup; the stored baseline is pending publication.
    assert version['workSourceMeta']['paymentRows'] == 13
    assert round(sum(version['drivers']['payments']), 2) == 2720285.8
    assert sum(version['drivers']['advances']) > 0
    print('PILOT BASELINE: saved workbook requires source refresh', file=sys.stderr)
assert version['paymentActualMonths'][:6] == [True] * 6
assert len(version['workSourceMeta']['blockers']) == 2
assert version['workSourceMeta']['resourceForecastPolicy'].startswith('Август–декабрь')
print('PILOT READINESS GUARD: OK')
