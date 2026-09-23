"""Read-only monthly resource drivers and category rates from source model."""
import json
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

source = Path(sys.argv[1]); output = Path(sys.argv[2])
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(source) as book:
    root = ET.fromstring(book.read('xl/worksheets/sheet3.xml'))
cells = {}
for c in root.findall('.//m:sheetData/m:row/m:c', ns):
    val = c.findtext('m:v', None, ns)
    if val is not None and c.get('t') not in ('s', 'e', 'str'):
        try: cells[c.get('r')] = float(val)
        except ValueError: pass

months = [chr(ord('U')+i) if i < 6 else 'A'+chr(ord('A')+i-6) for i in range(12)]
assert months == ['U','V','W','X','Y','Z','AA','AB','AC','AD','AE','AF']
rows = [15,23,24,25,26,27,28,29,30,31,32,33,34,35,37,39,83,84]
driver = {'rows': {str(r): [cells.get(f'{col}{r}', 0) for col in months] for r in rows},
          'direct': [{'row': r, 'rate': cells[f'E{r}'], 'insurance': cells[f'F{r}']}
                     for r in range(25,30)],
          'indirect': [{'row': r, 'rate': cells[f'E{r}'], 'insurance': cells[f'F{r}']}
                       for r in range(31,36)],
          'source': 'Исходная модель, Детальная модель (кэшированных значений 2026 года)'}
output.write_text(json.dumps(driver,ensure_ascii=False,separators=(',',':')))
print(output, output.stat().st_size)
