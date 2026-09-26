"""Synthetic host-confirmed pins; these fixtures are not real public giveaways."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from src.lib.location.events import create_event, cancel_event, search_events, geocode_address
from src.lib.location.nearby import search_sources
from src.lib.location.deduplicate import reconcile_locations
from src.lib.location.overpass import format_summary

NOW = "2026-09-25T16:00:00-04:00"
AT = "2026-09-25T18:30:00-04:00"


def sally(**changes):
    return {"host_name": "Sally", "message": "Hey y'all! Come to my apartment on Friday Night, 25 September 2026, for some yummy pasta and smoothies!",
            "address": "736 Peachtree St NE, Atlanta, GA 30308", "foods": ["Pasta", "smoothies"],
            "latitude": 33.7745, "longitude": -84.3847,
            "starts_at": "2026-09-25T18:00:00-04:00", "ends_at": "2026-09-25T20:00:00-04:00",
            "public_location_confirmed": True, **changes}


class EventTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = Path(self.temp.name) / "events.sqlite3"

    def create(self, **changes):
        return create_event(sally(**changes), db_path=self.db, now=NOW)

    def search(self, at=AT, window=0, lat=33.7756, lon=-84.3963, radius=5000):
        return search_sources(lat, lon, radius, sources=["events"], events_db=self.db,
                              at=at, event_window_hours=window)

    def test_sally_persists_and_appears_in_assistance_without_private_token(self):
        created = self.create()
        result = self.search()
        event = result["ui_categories"]["snap_and_assistance"][0]
        self.assertEqual(event["foods"], ["Pasta", "smoothies"])
        self.assertEqual(event["availability"]["status"], "scheduled_active")
        self.assertEqual(result["ui_categories"]["general_food_resources"], [])
        self.assertNotIn(created["edit_token"], json.dumps(result))
        self.assertNotIn("token_hash", json.dumps(result))
        text = format_summary(result)
        self.assertIn("Pasta, smoothies", text)
        self.assertIn("18:00:00-04:00", text)

    def test_start_inclusive_end_exclusive_and_past_event(self):
        self.create()
        for at, expected in [("2026-09-25T17:59:59-04:00", 0),
                             ("2026-09-25T18:00:00-04:00", 1),
                             ("2026-09-25T19:59:59-04:00", 1),
                             ("2026-09-25T20:00:00-04:00", 0),
                             ("2026-09-26T18:00:00-04:00", 0)]:
            with self.subTest(at=at):
                self.assertEqual(len(self.search(at)["locations"]), expected)

    def test_upcoming_and_window_end_boundary(self):
        self.create()
        self.assertEqual(self.search(NOW, 2)["locations"], [])
        event = self.search(NOW, 3)["locations"][0]
        self.assertEqual(event["availability"]["status"], "upcoming")

    def test_overnight_and_equivalent_utc(self):
        self.create(starts_at="2026-09-25T23:00:00-04:00", ends_at="2026-09-26T01:00:00-04:00")
        self.assertEqual(len(self.search("2026-09-26T04:30:00Z")["locations"]), 1)
        self.assertEqual(self.search("2026-09-26T05:00:00Z")["locations"], [])

    def test_dst_fall_back_offsets_are_distinct(self):
        self.create(starts_at="2026-11-01T01:30:00-04:00", ends_at="2026-11-01T01:15:00-05:00")
        self.assertEqual(len(self.search("2026-11-01T06:00:00Z")["locations"]), 1)

    def test_validation(self):
        invalid = [{"message": " "}, {"foods": []}, {"foods": "pasta"}, {"foods": [None]},
                   {"latitude": float("nan")}, {"latitude": True}, {"longitude": 181},
                   {"public_location_confirmed": False}, {"address": ""},
                   {"starts_at": "2026-09-25T18:00:00"}, {"starts_at": None},
                   {"ends_at": "2026-09-25T17:00:00-04:00"}]
        for fields in invalid:
            with self.subTest(fields=fields), self.assertRaises(ValueError):
                self.create(**fields)
        with self.assertRaises(ValueError):
            create_event(sally(), db_path=self.db, now="2026-09-26T00:00:00Z")
        for window in [-1, float("nan"), 8761, True]:
            with self.subTest(window=window), self.assertRaises(ValueError):
                search_events(33, -84, db_path=self.db, at=AT, window_hours=window)

    def test_cancel_requires_token_and_is_idempotent(self):
        created = self.create()
        event_id = created["event"]["place_id"]
        with self.assertRaises(ValueError):
            cancel_event(event_id, "wrong", db_path=self.db)
        self.assertEqual(len(self.search()["locations"]), 1)
        for _ in range(2):
            cancel_event(event_id, created["edit_token"], db_path=self.db)
        self.assertEqual(self.search()["locations"], [])

    def test_same_venue_distinct_events_and_store_not_merged(self):
        self.create()
        self.create(message="Second independent giveaway")
        raw = self.search()
        store = {**raw["community_events"][0], "place_id": "osm:node/1"}
        raw["nearby_food_access"] = [store]
        result = reconcile_locations(raw)
        self.assertEqual(len(result["locations"]), 3)
        self.assertTrue(all(not r["possible_duplicate_ids"] for r in result["locations"]))
        raw["community_events"].append(raw["community_events"][0])
        repeated = reconcile_locations(raw)
        self.assertEqual(len(repeated["locations"]), 3)
        event = next(p for p in repeated["locations"] if p["place_id"] == raw["community_events"][0]["place_id"])
        self.assertEqual(event["availability"]["status"], "scheduled_active")

    def test_all_sources_include_event_and_preserve_hours_and_categories(self):
        self.create()
        base = {"name": "Store", "address_parts": {"street": "10 Main St"},
                "latitude": 33.7756, "longitude": -84.3963, "distance_m": 0, "distance_miles": 0}
        osm = {"nearby_food_access": [{**base, "place_id": "osm:1", "opening_hours": "24/7"}]}
        snap = {"snap_retailers": [{**base, "place_id": "snap:1"}]}
        feedam = {"feedam_resources": [{**base, "name": "Pantry", "place_id": "feedam:1", "hours_json": None}]}
        with patch("src.lib.location.nearby.search_food_access", return_value=osm), \
                patch("src.lib.location.nearby.search_snap_retailers", return_value=snap), \
                patch("src.lib.location.nearby.search_feedam", return_value=feedam):
            result = search_sources(33.7756, -84.3963, sources=["osm", "snap", "feedam", "events"],
                                    events_db=self.db, at=AT, event_window_hours=0)
        self.assertEqual(len(result["locations"]), 3)
        self.assertEqual(len(result["ui_categories"]["snap_and_assistance"]), 3)
        self.assertTrue(all("availability" in p for p in result["locations"]))
        self.assertFalse(result["partial_results"])

    def test_multiple_cities_near_and_far_users(self):
        cities = [("Atlanta", 33.7745, -84.3847, "-04:00"),
                  ("Chicago", 41.8819, -87.6278, "-05:00"),
                  ("Los Angeles", 34.0522, -118.2437, "-07:00"),
                  ("New York", 40.7128, -74.0060, "-04:00"),
                  ("Seattle", 47.6062, -122.3321, "-07:00")]
        for city, lat, lon, offset in cities:
            self.create(host_name=city, address=f"Synthetic {city} venue", latitude=lat, longitude=lon,
                        starts_at=f"2026-09-25T18:00:00{offset}", ends_at=f"2026-09-25T20:00:00{offset}")
        for city, lat, lon, offset in cities:
            with self.subTest(city=city):
                nearby = self.search(f"2026-09-25T18:30:00{offset}", lat=lat + .002, lon=lon)
                self.assertEqual([p["host_name"] for p in nearby["locations"]], [city])
                self.assertGreater(nearby["locations"][0]["distance_m"], 200)
                self.assertLess(nearby["locations"][0]["distance_m"], 250)
                self.assertEqual(self.search(AT, lat=lat + 1, lon=lon)["locations"], [])

    def test_missing_db_empty_corrupt_db_partial_with_other_provider(self):
        self.assertEqual(self.search()["locations"], [])
        self.assertFalse(self.db.exists())
        self.db.write_text("broken")
        with patch("src.lib.location.nearby.search_food_access", return_value={}):
            result = search_sources(33, -84, events_db=self.db)
        self.assertTrue(result["partial_results"])
        self.assertEqual(result["source_status"]["events"], "error")

    def test_geocoder_candidates_must_be_confirmed(self):
        payload = {"result": {"addressMatches": [{"matchedAddress": "TEST ADDRESS", "coordinates": {"x": -84.38, "y": 33.77}}]}}
        with patch("src.lib.location.events.urlopen") as request:
            request.return_value.__enter__.return_value.read.return_value = json.dumps(payload)
            matches = geocode_address("test address")
        self.assertEqual(matches[0]["longitude"], -84.38)
        self.assertTrue(matches[0]["requires_host_confirmation"])

    def test_hours_preserved_across_merged_sources(self):
        base = {"name": "Market", "address_parts": {"street": "10 Main St"},
                "latitude": 33, "longitude": -84, "distance_m": 0, "distance_miles": 0}
        result = reconcile_locations({
            "nearby_food_access": [{**base, "place_id": "osm:1", "opening_hours": "Mo-Fr 09:00-18:00"}],
            "snap_retailers": [{**base, "place_id": "snap:1"}],
            "feedam_resources": [{**base, "place_id": "feedam:1", "hours_json": '{"monday": "10-12"}', "live_status": "open"}]})
        availability = result["locations"][0]["availability"]
        self.assertEqual(len(availability["schedules"]), 3)
        self.assertTrue(availability["hours_known"])
        self.assertEqual(availability["status"], "unknown")
        snap = reconcile_locations({"snap_retailers": [{**base, "place_id": "snap:1"}]})
        self.assertFalse(snap["locations"][0]["availability"]["hours_known"])
        self.assertIn("does not provide hours", snap["locations"][0]["availability"]["schedules"][0]["note"])


if __name__ == "__main__":
    unittest.main()
