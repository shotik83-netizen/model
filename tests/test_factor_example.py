"""Reproduce the published factor example from the copied workbooks and contractor book."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from compare_excel_app import load_version, normalized
root=Path(__file__).resolve().parents[1]
book=root/'data/contractors/c1/models/model-2026-09-22.xlsx'
contract,base=load_version(book,'d_pilot_4700134128','v_pilot_2026')
_,example=load_version(book,'d_pilot_4700134128','v_factor_example_2026')
assert base['year']==example['year']==2026
assert example['exampleDescription'].startswith('Копия исходных BOQ и КСГ')
assert example['exampleEdits']=={'boq':{'row':64,'column':'Y','factor':1.05},'ksg':{'row':5,'column':'Y','factor':1.1}}
for key in ('boq','ksg'):
    source=root/'data/sources'/f'{key}.xlsx'
    assert source.is_file()
    private_copy=root/'data/examples/factor'/f'{key}.xlsx'
    if private_copy.is_file():
        assert hashlib.sha256(private_copy.read_bytes()).digest()!=hashlib.sha256(source.read_bytes()).digest()
assert len(base['workItems'])==len(example['workItems'])>100
assert any(a['volumes']!=b['volumes'] for a,b in zip(base['workItems'],example['workItems']))
assert any(a['rate']!=b['rate'] for a,b in zip(base['workItems'],example['workItems']))
script='''const core=require('./src/calculation-core.js');let data='';process.stdin.on('data',x=>data+=x);process.stdin.on('end',()=>{const [base,example]=JSON.parse(data);const r=core.compareWorkItems(base.workItems,example.workItems,{baseFx:80,currentFx:80});console.log(JSON.stringify(r.total));});'''
factor=json.loads(subprocess.run(['node','-e',script],input=json.dumps([base,example]),cwd=root,text=True,capture_output=True,check=True).stdout)
assert abs(factor['volume'])>100 and abs(factor['price'])>100 and abs(factor['control'])<1e-5
snapshots=[]
for version in (base,example):
    run=subprocess.run(['node',str(root/'scripts/app_model_snapshot.js')],input=json.dumps(normalized(version,contract,root)),text=True,capture_output=True,check=True)
    snapshots.append(json.loads(run.stdout))
assert abs(sum(snapshots[0]['revenue'])-sum(snapshots[1]['revenue']))>100
print('FACTOR EXAMPLE: OK',round(factor['volume'],2),round(factor['price'],2))
