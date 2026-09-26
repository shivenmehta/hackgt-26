import unittest
from unittest.mock import patch

from src.lib.location.feedam import search_feedam
from src.lib.location.deduplicate import reconcile_locations
from src.lib.location.nearby import search_sources
from src.lib.location.overpass import format_summary


def resource(identifier=1, **changes):
    return {"id": identifier, "name": "Helping Pantry", "address": "10 Main Street", "city": "Atlanta",
            "state": "GA", "lat": 33.7756, "lng": -84.3963, "resource_type": "food_pantry",
            "is_active": 1, "hours_status": "unknown", "data_source": "example", **changes}


def payload(*records, **changes):
    return {"success": True, "resources": list(records), **changes}


class FeedamTests(unittest.TestCase):
    @patch("src.lib.location.feedam._get")
    def test_both_endpoints_miles_and_same_id_urgent_merge(self, get):
        get.side_effect = [payload(resource()), payload(resource(hours_status="open"))]
        result = search_feedam(33.7756, -84.3963, 1609.344)
        self.assertEqual(get.call_args_list[0].args[1]["radius"], 1)
        self.assertEqual(get.call_args_list[0].args[1]["mode"], "free")
        self.assertTrue(get.call_args_list[1].args[0].endswith("/urgent"))
        locations = reconcile_locations(result)["locations"]
        self.assertEqual(len(locations), 1)
        self.assertTrue(locations[0]["reported_by_urgent_endpoint"])
        self.assertEqual(len(locations[0]["source_records"]), 2)
        self.assertEqual(locations[0]["source_records"][1]["hours_status"], "open")

    @patch("src.lib.location.feedam._get")
    def test_radius_invalid_inactive_and_nonfood_filtered(self, get):
        get.side_effect = [payload(resource(), resource(2, lat=34), resource(3, lat=None),
                                   resource(4, is_active=0), resource(5, resource_type="snap_retailer"),
                                   expanded=True, total_available=1000), payload()]
        result = search_feedam(33.7756, -84.3963)
        self.assertEqual(len(result["feedam_resources"]), 1)
        self.assertTrue(result["feedam_endpoints"]["/api/resources/nearby"]["possibly_truncated"])

    @patch("src.lib.location.feedam._get")
    def test_one_endpoint_failure_is_partial(self, get):
        get.side_effect = [payload(resource()), RuntimeError("urgent unavailable")]
        result = search_sources(33.7756, -84.3963, sources=("feedam",))
        self.assertTrue(result["partial_results"])
        self.assertEqual(result["source_status"]["feedam"], "partial")
        self.assertEqual(len(result["locations"]), 1)
        self.assertNotIn("Nearby food access", format_summary(result))

    @patch("src.lib.location.feedam._get")
    def test_both_fail(self, get):
        get.side_effect = RuntimeError("unavailable")
        with self.assertRaises(RuntimeError):
            search_feedam(33.7756, -84.3963)

    @patch("src.lib.location.feedam._get")
    def test_empty_urgent_does_not_mean_closed(self, get):
        get.side_effect = [payload(resource()), payload()]
        result = search_feedam(33.7756, -84.3963)
        self.assertFalse(result["feedam_resources"][0]["reported_by_urgent_endpoint"])
        self.assertEqual(result["feedam_resources"][0]["hours_status"], "unknown")


def place(identifier, name="Pantry", street="10 Main Street", lon=-84.3963):
    return {"place_id": identifier, "name": name, "latitude": 33.7756, "longitude": lon,
            "distance_m": 0, "distance_miles": 0, "address_parts": {"street": street}}


class DeduplicationTests(unittest.TestCase):
    def test_exact_cross_source_match_retains_all_evidence(self):
        result = reconcile_locations({"feedam_resources": [place("feedam:1")],
                                      "food_assistance": [place("osm:node/1", street="10 Main St.")]})
        self.assertEqual(len(result["locations"]), 1)
        self.assertEqual(result["locations"][0]["source_ids"], ["feedam:1", "osm:node/1"])

    def test_same_chain_different_addresses_not_merged(self):
        result = reconcile_locations({"nearby_food_access": [place("osm:node/1", name="Store")],
                                      "snap_retailers": [place("usda_snap:1", name="Store", street="12 Main Street")]})
        self.assertEqual(len(result["locations"]), 2)
        self.assertTrue(result["locations"][0]["possible_duplicate_ids"])

    def test_colocated_different_programs_not_merged(self):
        result = reconcile_locations({"feedam_resources": [place("feedam:1"), place("feedam:2", name="Senior Meals")]})
        self.assertEqual(len(result["locations"]), 2)

    def test_unnamed_or_missing_address_not_merged(self):
        for changes in ({"name": "Unnamed pantry"}, {"street": ""}):
            result = reconcile_locations({"feedam_resources": [place("feedam:1", **changes), place("feedam:2", **changes)]})
            self.assertEqual(len(result["locations"]), 2)

    def test_no_transitive_merge_chain(self):
        result = reconcile_locations({"feedam_resources": [place("feedam:1", lon=0),
                                      place("feedam:2", lon=0.0007), place("feedam:3", lon=0.0014)]})
        self.assertEqual(len(result["locations"]), 2)

    def test_snap_membership_survives_osm_merge(self):
        result = reconcile_locations({"nearby_food_access": [place("osm:node/1")],
                                      "snap_retailers": [place("usda_snap:1")]})
        location = result["locations"][0]
        self.assertEqual(location["display_group"], "snap_retailers")
        self.assertTrue(location["snap_listed"])


if __name__ == "__main__":
    unittest.main()
