"""Offline synthetic giveaways in five cities; never publishes to the real event DB."""
import argparse
import json
from pathlib import Path
import tempfile

from .events import create_event
from .nearby import search_sources


def run_examples():
    cities = [("Atlanta", 33.7745, -84.3847, "-04:00"),
              ("Chicago", 41.8819, -87.6278, "-05:00"),
              ("Los Angeles", 34.0522, -118.2437, "-07:00"),
              ("New York", 40.7128, -74.0060, "-04:00"),
              ("Seattle", 47.6062, -122.3321, "-07:00")]
    report = {"fixture_notice": "Fictional posts and approximate test pins; not real giveaways or verified address geocodes.", "scenarios": []}
    with tempfile.TemporaryDirectory() as directory:
        db = Path(directory) / "demo.sqlite3"
        for city, lat, lon, offset in cities:
            sally = city == "Atlanta"
            create_event({"host_name": "Sally" if sally else f"Demo host in {city}",
                          "message": "Hey y'all! Come to my apartment on Friday Night, 25 September 2026, for some yummy pasta and smoothies!" if sally else f"Fictional community dinner in {city}.",
                          "foods": ["Pasta", "smoothies"] if sally else ["Rice", "vegetables"],
                          "address": "736 Peachtree St NE, Atlanta, GA 30308" if sally else f"Synthetic {city} venue",
                          "latitude": lat, "longitude": lon, "public_location_confirmed": True,
                          "starts_at": f"2026-09-25T18:00:00{offset}", "ends_at": f"2026-09-25T20:00:00{offset}"},
                         db_path=db, now="2026-09-25T12:00:00Z")
        for city, lat, lon, offset in cities:
            for label, user_lat, local_time, window in [("nearby_active", lat + .002, "18:30:00", 0),
                                                       ("nearby_upcoming", lat + .002, "17:00:00", 24),
                                                       ("far_away", lat + 1, "18:30:00", 0),
                                                       ("ended", lat + .002, "20:00:00", 0)]:
                result = search_sources(user_lat, lon, sources=["events"], events_db=db,
                                        at=f"2026-09-25T{local_time}{offset}", event_window_hours=window)
                expected = 1 if label in ("nearby_active", "nearby_upcoming") else 0
                if len(result["locations"]) != expected:
                    raise AssertionError(f"Unexpected results for {city}: {label}")
                report["scenarios"].append({"city": city, "case": label, "expected_count": expected, "result": result})
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = run_examples()
    for scenario in report["scenarios"]:
        print(f"{scenario['city']:<14} {scenario['case']:<18} {len(scenario['result']['locations'])} matches")
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Saved public example results to {args.output}")


if __name__ == "__main__":
    main()
