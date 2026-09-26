import unittest

from src.lib.location.deduplicate import reconcile_locations
from src.lib.location.output import group_for_ui
from src.lib.location.overpass import format_summary


def place(identifier, groups, distance=0):
    return {"place_id": identifier, "name": "Example", "source_groups": groups,
            "distance_m": distance, "distance_miles": distance / 1609.344,
            "latitude": 35, "longitude": -84, "address_parts": {"street": "10 Main St"}}


class LocationOutputTests(unittest.TestCase):
    def test_partition_sort_and_subtypes(self):
        records = [place("store", ["nearby_food_access"], 500),
                   place("market", ["alternative_food_retail"], 10),
                   place("snap", ["snap_retailers"], 200),
                   place("pantry", ["feedam_resources"], 100),
                   place("centre", ["potential_assistance"], 300)]
        groups = group_for_ui(records)
        self.assertEqual(list(groups), ["general_food_resources", "snap_and_assistance"])
        self.assertEqual([p["place_id"] for p in groups["general_food_resources"]], ["market", "store"])
        self.assertEqual([p["place_id"] for p in groups["snap_and_assistance"]], ["pantry", "snap", "centre"])
        self.assertIn("paid groceries", groups["snap_and_assistance"][1]["service_labels"][0])
        self.assertIn("unverified", groups["snap_and_assistance"][2]["service_labels"][0])

    def test_deduplicated_snap_store_appears_in_only_one_category(self):
        result = reconcile_locations({"nearby_food_access": [place("osm:node/1", [])],
                                      "snap_retailers": [place("usda_snap:1", [])]})
        self.assertEqual(len(result["locations"]), 1)
        self.assertEqual(result["ui_categories"]["general_food_resources"], [])
        match = result["ui_categories"]["snap_and_assistance"][0]
        self.assertEqual(len(match["source_records"]), 2)
        self.assertEqual(match["ui_category"], "snap_and_assistance")

    def test_empty_and_partial_output_has_two_headers(self):
        result = {"locations": [], "limitations": [], "source_errors": ["OSM: unavailable"]}
        text = format_summary(result)
        self.assertIn("General food resources (0 listed)", text)
        self.assertIn("SNAP & food assistance (0 listed)", text)
        self.assertIn("available selected sources", text)
        self.assertIn("PARTIAL RESULTS", text)

    def test_urgent_and_duplicate_flags_survive(self):
        resource = {**place("pantry", ["feedam_resources"]),
                    "reported_by_urgent_endpoint": True, "possible_duplicate_ids": ["another"]}
        result = {"locations": [resource], "limitations": []}
        text = format_summary(result)
        self.assertIn("urgent listing", text)
        self.assertIn("possible duplicate", text)
        self.assertNotIn("Potential assistance (services unverified)", text)


if __name__ == "__main__":
    unittest.main()
