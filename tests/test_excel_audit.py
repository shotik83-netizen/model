import importlib.util
import pathlib
import tempfile
import unittest
import zipfile

MODULE = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "audit_excel_reference.py"
spec = importlib.util.spec_from_file_location("audit_excel_reference", MODULE)
audit_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit_module)


class ExcelAuditTests(unittest.TestCase):
    def test_sparse_month_and_mismatch(self):
        ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        xml = (f'<worksheet xmlns="{ns}"><sheetData>'
               '<row r="9"><c r="M9"><v>46023</v></c></row>'
               '<row r="42"><c r="M42"><v>10</v></c></row>'
               '<row r="43"><c r="M43"><v>9</v></c></row>'
               '<row r="44"><c r="M44"><v>1</v></c></row>'
               '<row r="45"><c r="M45"><v>2</v></c></row>'
               '<row r="46"><c r="M46"><v>2</v></c></row>'
               '</sheetData></worksheet>')
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "source.xlsx"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("xl/worksheets/sheet3.xml", xml)
            values = audit_module.cached_cells(path)
        months, tested, issues = audit_module.audit(values)
        self.assertEqual(len(months), 1)
        self.assertEqual(tested, 3)
        self.assertEqual(len(issues), 5)  # one numeric mismatch and four missing totals
        self.assertTrue(any("прямые = статьи" in issue[1] for issue in issues))
        self.assertTrue(any("расхождение" in issue[2] for issue in issues))
        self.assertEqual(audit_module.audit(values, year=2025)[0], [])


if __name__ == "__main__":
    unittest.main()
