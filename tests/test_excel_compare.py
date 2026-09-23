"""Synthetic checks for the guarded Excel/app comparison (no private workbook)."""
import datetime as dt
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
from compare_excel_app import month_columns, readiness


class ComparisonTests(unittest.TestCase):
    def test_demo_cannot_be_certified_as_parity(self):
        version = {"dataMode": "demo", "currency": "USD", "fxRate": 0,
                   "vacationBasis": "annual"}
        issues = readiness(version, {"number": "A-1"})
        self.assertEqual(len(issues), 4)
        self.assertIn("demo", " ".join(issues))
        self.assertIn("курса", " ".join(issues))
        self.assertIn("договора", " ".join(issues))

    def test_months_must_cover_exactly_one_year(self):
        origin = dt.date(1899, 12, 30)
        cells = {f"{chr(85 + i)}9": (dt.date(2026, i + 1, 1) - origin).days
                 for i in range(6)}
        with self.assertRaises(ValueError):
            month_columns(cells, 2026)


if __name__ == "__main__":
    unittest.main()
