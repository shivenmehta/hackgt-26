import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from src.lib.location.overpass import build_query, distance_meters, normalize_places, search_food_access, format_summary


def node(identifier, tags, lat=0, lon=0):
    return {"type": "node", "id": identifier, "tags": tags, "lat": lat, "lon": lon}


class LocationTests(unittest.TestCase):
    def test_query_covers_all_requested_tags_and_geometry_types(self):
        query = build_query(33.7756, -84.3963, 5000)
        for tag in ("supermarket", "grocery", "convenience", "farm", "marketplace", "community_centre", "food_bank", "soup_kitchen", "food_sharing"):
            self.assertIn(tag, query)
        self.assertEqual(query.count("nwr["), 5)
        self.assertNotIn('["amenity"="social_facility"]', query)
        self.assertIn("out center tags", query)

    def test_invalid_inputs(self):
        for values in ((91, 0, 500), (0, 181, 500), (0, 0, 0), (0, 0, 25001),
                       (float("nan"), 0, 500), (True, 0, 500)):
            with self.subTest(values=values), self.assertRaises(ValueError):
                build_query(*values)

    def test_alternative_retail_and_potential_assistance_are_separate(self):
        result = normalize_places({"elements": [
            node(1, {"amenity": "marketplace"}), node(2, {"shop": "farm"}),
            node(3, {"amenity": "community_centre", "community_centre:for": "senior"}),
            node(4, {"amenity": "social_facility"}),
        ]}, 0, 0, 500)
        self.assertEqual(len(result["alternative_food_retail"]), 2)
        self.assertEqual(len(result["potential_assistance"]), 1)
        self.assertEqual(result["food_assistance"], [])
        centre = result["potential_assistance"][0]
        self.assertEqual(centre["assistance_evidence"], "community_centre_only")
        self.assertEqual(centre["serves"], "senior")
        self.assertFalse(centre["services_verified"])

    def test_explicit_assistance_with_or_without_companion_tag(self):
        result = normalize_places({"elements": [
            node(1, {"amenity": "social_facility", "social_facility": "food_bank"}),
            node(2, {"social_facility": "soup_kitchen"}),
            node(3, {"amenity": "community_centre", "social_facility": "food_bank; soup_kitchen "}),
        ]}, 0, 0, 500)
        self.assertEqual(len(result["food_assistance"]), 3)
        self.assertEqual(result["potential_assistance"], [])
        places = result["food_assistance"]
        self.assertEqual(places[0]["tagging_warnings"], [])
        self.assertTrue(places[1]["tagging_warnings"])
        self.assertEqual(places[2]["categories"], ["food_bank", "soup_kitchen"])
        self.assertTrue(all(p["assistance_evidence"] == "explicit_osm_tag" for p in places))

    def test_expansion_keeps_closed_or_private_centres_excluded(self):
        result = normalize_places({"elements": [
            node(1, {"amenity": "community_centre", "access": "private"}),
            node(2, {"amenity": "marketplace", "disused": "yes"}),
            node(3, {"shop": "farm", "access": "no"}),
        ]}, 0, 0, 500)
        for key in ("nearby_food_access", "alternative_food_retail", "food_assistance", "potential_assistance"):
            self.assertEqual(result[key], [])

    def test_distance(self):
        self.assertEqual(distance_meters(0, 0, 0, 0), 0)
        self.assertAlmostEqual(distance_meters(0, 0, 0, 1), 111195, delta=2)
        self.assertAlmostEqual(distance_meters(0, 179.9, 0, -179.9), 22239, delta=2)

    def test_grouping_sorting_and_duplicate_ids(self):
        store = node(1, {"name": "Store", "shop": "supermarket"}, lon=0.01)
        payload = {"elements": [store, store, node(2, {"shop": "grocery"}),
                               node(3, {"social_facility": "food_bank;soup_kitchen"}),
                               node(4, {"amenity": "food_sharing"}),
                               node(5, {"shop": "convenience"})]}
        result = normalize_places(payload, 0, 0, 2000)
        self.assertEqual(len(result["nearby_food_access"]), 3)
        self.assertEqual(len(result["food_assistance"]), 2)
        self.assertEqual(result["nearby_food_access"][-1]["name"], "Store")
        self.assertEqual(result["food_assistance"][0]["categories"], ["food_bank", "soup_kitchen"])
        self.assertFalse(result["food_assistance"][0]["inventory_verified"])

    def test_way_relation_centers_and_separate_osm_namespaces(self):
        elements = [node(1, {"shop": "supermarket"})]
        for kind in ("way", "relation"):
            elements.append({"type": kind, "id": 1, "tags": {"shop": "supermarket"},
                             "center": {"lat": 0, "lon": 0.001}})
        result = normalize_places({"elements": elements}, 0, 0, 500)
        self.assertEqual(len(result["nearby_food_access"]), 3)
        self.assertEqual(result["nearby_food_access"][1]["coordinate_source"], "bounding_box_center")

    def test_private_closed_outside_and_missing_coordinates(self):
        elements = [node(1, {"shop": "supermarket", "access": "private"}),
                    node(2, {"shop": "supermarket", "disused": "yes"}),
                    node(3, {"shop": "supermarket"}, lon=1),
                    {"type": "way", "id": 4, "tags": {"shop": "supermarket"}},
                    node(5, {"disused:shop": "supermarket"})]
        result = normalize_places({"elements": elements}, 0, 0, 500)
        self.assertEqual(result["nearby_food_access"], [])
        self.assertEqual(result["skipped_malformed_elements"], 1)

    def test_partial_or_malformed_response_fails(self):
        with self.assertRaises(RuntimeError):
            normalize_places({"elements": [], "remark": "runtime timeout"}, 0, 0, 500)
        with self.assertRaises(ValueError):
            normalize_places({}, 0, 0, 500)

    @patch("src.lib.location.overpass._fetch")
    def test_cache_hit_refresh_expiry_and_separate_queries(self, fetch):
        fetch.return_value = {"elements": [node(1, {"shop": "supermarket"})]}
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / "cache.sqlite3"
            first = search_food_access(0, 0, 500, cache_path=cache)
            second = search_food_access(0, 0, 500, cache_path=cache)
            self.assertFalse(first["cache_hit"])
            self.assertTrue(second["cache_hit"])
            self.assertEqual(fetch.call_count, 1)
            search_food_access(0, 0, 500, cache_path=cache, refresh=True)
            search_food_access(0, 0, 500, cache_path=cache, cache_hours=0)
            search_food_access(0, 0, 600, cache_path=cache)
            self.assertEqual(fetch.call_count, 4)

    @patch("src.lib.location.overpass._fetch")
    def test_partial_response_is_not_cached(self, fetch):
        fetch.side_effect = [{"elements": [], "remark": "timeout"}, {"elements": []}]
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / "cache.sqlite3"
            with self.assertRaises(RuntimeError):
                search_food_access(0, 0, cache_path=cache)
            result = search_food_access(0, 0, cache_path=cache)
            self.assertFalse(result["cache_hit"])
            self.assertIn("coverage may be incomplete", format_summary(result))

    @patch("src.lib.location.overpass._fetch")
    def test_invalid_endpoint_never_fetches(self, fetch):
        with self.assertRaises(ValueError):
            search_food_access(0, 0, endpoint="http://example.com")
        fetch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
