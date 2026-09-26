import csv
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from src.lib.location.snap import import_snap_csv, search_snap_retailers
from src.lib.location.nearby import search_sources
from src.lib.location.overpass import format_summary

FIELDS = ["Record_ID", "Store_Name", "Store_Type", "Latitude", "Longitude",
          "Store_Street_Address", "City", "State", "Zip_Code", "X", "Y"]


class SnapTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.csv = Path(self.temp.name) / "retailers.csv"
        self.db = Path(self.temp.name) / "retailers.sqlite3"

    def write_rows(self, rows, fields=FIELDS):
        with self.csv.open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.writer(stream)
            writer.writerow(fields)
            writer.writerows(rows)

    def row(self, identifier=1, lat=35, lon=-84, name="Store"):
        return [identifier, name, "Grocery Store", lat, lon, "1 Main St", "City", "TN", "01234", -9000000, 4000000]

    def test_import_search_uses_degrees_preserves_zip_and_types(self):
        self.write_rows([self.row(), self.row(2, 36)])
        report = import_snap_csv(self.csv, self.db)
        self.assertEqual(report["imported"], 2)
        result = search_snap_retailers(35, -84, 1000, db_path=self.db)
        self.assertEqual(len(result["snap_retailers"]), 1)
        place = result["snap_retailers"][0]
        self.assertEqual(place["distance_m"], 0)
        self.assertEqual(place["address_parts"]["zip_code"], "01234")
        self.assertEqual(place["retailer_type"], "Grocery Store")
        self.assertFalse(place["snap_acceptance_verified_live"])

    def test_invalid_coordinates_and_duplicate_rows_reported(self):
        self.write_rows([self.row(), self.row(), self.row(2, "NaN"), self.row(3, 0, 0), self.row(4, 999)])
        report = import_snap_csv(self.csv, self.db)
        self.assertEqual(report["imported"], 1)
        self.assertEqual(report["invalid_rows"], 3)
        self.assertEqual(report["duplicate_rows"], 1)

    def test_conflicting_import_rolls_back_existing_snapshot(self):
        self.write_rows([self.row()])
        import_snap_csv(self.csv, self.db)
        self.write_rows([self.row(2), self.row(2, name="Different")])
        with self.assertRaises(ValueError):
            import_snap_csv(self.csv, self.db)
        places = search_snap_retailers(35, -84, db_path=self.db)["snap_retailers"]
        self.assertEqual([p["record_id"] for p in places], ["1"])

    def test_missing_columns_and_historical_data_fail(self):
        for fields in (["Name", "X", "Y"], FIELDS + ["End Date"]):
            self.write_rows([], fields)
            with self.assertRaises(ValueError):
                import_snap_csv(self.csv, self.db)

    def test_refresh_removes_old_rows(self):
        self.write_rows([self.row()])
        import_snap_csv(self.csv, self.db)
        self.write_rows([self.row(2)])
        import_snap_csv(self.csv, self.db)
        self.assertEqual(search_snap_retailers(35, -84, db_path=self.db)["snap_retailers"][0]["record_id"], "2")

    def test_radius_sorting_and_antimeridian(self):
        self.write_rows([self.row(1, 0, -179.99), self.row(2, 0, 179.995), self.row(3, 0, 179)])
        import_snap_csv(self.csv, self.db)
        places = search_snap_retailers(0, 179.99, 5000, db_path=self.db)["snap_retailers"]
        self.assertEqual([p["record_id"] for p in places], ["2", "1"])

    @patch("src.lib.location.nearby.search_food_access", side_effect=RuntimeError("busy"))
    def test_osm_failure_keeps_snap_results_and_marks_partial(self, osm):
        self.write_rows([self.row()])
        import_snap_csv(self.csv, self.db)
        result = search_sources(35, -84, sources=("osm", "snap"), snap_db=self.db)
        self.assertTrue(result["partial_results"])
        self.assertEqual(result["source_status"], {"osm": "error", "snap": "ok"})
        self.assertIn("PARTIAL RESULTS", format_summary(result))
        self.assertIn("SNAP & food assistance", format_summary(result))

    @patch("src.lib.location.nearby.search_food_access")
    def test_snap_only_is_offline(self, osm):
        self.write_rows([self.row()])
        import_snap_csv(self.csv, self.db)
        result = search_sources(35, -84, sources=("snap",), snap_db=self.db)
        self.assertFalse(result["partial_results"])
        osm.assert_not_called()

    def test_all_sources_failed_is_an_error(self):
        with self.assertRaises(RuntimeError):
            search_sources(35, -84, sources=("snap",), snap_db=self.db)


if __name__ == "__main__":
    unittest.main()
