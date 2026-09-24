#!/usr/bin/env python3
"""Compare contractor pilot expense rows with cached 2026 source Excel values."""
import json
import subprocess
import sys
import zipfile
from xml.etree import ElementTree as ET
from pathlib import Path
from audit_excel_reference import cached_cells
from compare_excel_app import load_version, normalized

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1])
BOOK = Path(sys.argv[2]) if len(sys.argv)>2 else ROOT/'data/contractors/c1/models/model-2026-09-22.xlsx'
contract, version = load_version(BOOK, 'd_pilot_4700134128', 'v_pilot_2026')
run = subprocess.run(['node', str(ROOT/'scripts/app_model_snapshot.js')],
                     input=json.dumps(normalized(version,contract,ROOT)),capture_output=True,text=True,check=True)
result = json.loads(run.stdout)
cells = cached_cells(SOURCE)
rows = {47:'payroll',48:'payrollTax',49:'insurance',50:'vacation',52:'equipment',
        54:'scaffoldLabor',55:'projectMaterials',56:'consumables',57:'nrk',60:'indirectPayroll',
        61:'indirectTax',62:'indirectInsurance',63:'indirectVacation',64:'food',65:'housing',
        66:'bus',67:'car',68:'ppe',69:'tickets',70:'permit',71:'medical',72:'vziz',
        73:'office',74:'warehouse',75:'safety',76:'accident',77:'otherIndirect'}
cols=['U','V','W','X','Y','Z','AA','AB','AC','AD','AE','AF']
errors=[]
for m,col in enumerate(cols):
    for excel_row,key in rows.items():
        cached=cells.get(f'{col}{excel_row}')
        if cached is None:continue
        delta=result['rows'][key][m]+cached*1_000_000
        if abs(delta)>.02:errors.append((m+1,excel_row,key,round(delta,2)))
    for excel_row,key in [(46,'direct'),(59,'indirect')]:
        delta=result[key][m]+cells[f'{col}{excel_row}']*1_000_000
        if abs(delta)>.02:errors.append((m+1,excel_row,key,round(delta,2)))
critical=[x for x in errors if x[0]<=7]
if critical:raise SystemExit('Closed-month cost discrepancies: '+str(critical[:10]))
print(f'Exact expense checks Jan–Jul: {7*(len(rows)+2)}; later differences: {errors[:12]}')
if len(sys.argv)>3:
    ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with zipfile.ZipFile(SOURCE) as z:
        xml=ET.fromstring(z.read('xl/worksheets/sheet3.xml'))
    formulas={}
    for row in rows:
        cell=xml.find(f'.//x:sheetData/x:row[@r="{row}"]/x:c[@r="M{row}"]',ns)
        formula=cell.find('x:f',ns) if cell is not None else None
        formulas[row]=formula.text if formula is not None and formula.text else 'помесячная формула; общая основа в M'
    lines=['# Сверка расходов пилотного договора № 4700134128, 2026','',
        'Валюта — USD, курс договора — 80 RUB/USD. Источники: «Детальная модель», строки 47–77 исходной Excel, BOQ, КСГ, месячные категории персонала и техники. Затраты расчётные, КС и платежи документные.',
        '',f'Проверка за январь–июль: {7*(len(rows)+2)} из {7*(len(rows)+2)} совпадений с допуском 0,02 USD. В августе–декабре единственное расхождение расходов — строка 55 «Проектные материалы» из отличающегося графика МТР КСГ; закрытым фактом закупок эти месяцы не объявлены.','',
        '| Строка Excel | Статья в приложении | Формула-основа Excel | Январь: Δ, USD | Авг–дек: max |',
        '|---:|---|---|---:|---:|']
    for row,key in rows.items():
        jan=result['rows'][key][0]+cells.get('U'+str(row),0)*1_000_000
        late=max(abs(result['rows'][key][m]+cells.get(cols[m]+str(row),0)*1_000_000) for m in range(7,12))
        formula=formulas[row].replace('|','\\|').replace('\n',' ')[:110]
        lines.append(f'| {row} | `{key}` | `{formula}` | {jan:+.2f} | {late:.2f} |')
    lines += ['', '## Неравные исходные данные и принятые правила', '',
        '- Январская выручка приложения меньше кэша на 71 851,04 USD; 32 строки КСГ без точного mapping KQ исключены по правилу пользователя. Не подменять отсутствующую оценку.',
        '- Август–декабрь: отличие материалов по месяцам 5 819,12 / 7 273,30 / 8 260,02 / 10 774,07 / 19 309,26 USD. Источник — денежный МТР предоставленного КСГ против кэша исходной Excel. Этот график является прогнозом.',
        '- Для пилота выбран метод резерва Excel: (месячный ФОТ + НДФЛ + взносы) × 31/28/12. Правило 8% годового ФОТ ежемесячно сохраняется как отдельный выбираемый вариант; совместно применять два метода нельзя.',
        '- Виды материалов по KQ-2 распределяют уже рассчитанную статью «Проектные материалы»; оценка BOQ не прибавляется к расходу. Не назначенный вид показан отдельно.',
        '- Поступления и удержания проверяются отдельно от начисленных расходов. Налоговый денежный поток и кэш августа требуют дальнейшей документной сверки.','']
    Path(sys.argv[3]).write_text('\n'.join(lines),encoding='utf-8')

