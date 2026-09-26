"""CLI: python -m src.lib.location.nearby --lat 33.7756 --lon -84.3963"""
import argparse
import json
from pathlib import Path

from .overpass import DEFAULT_CACHE, ENDPOINT, format_summary, search_food_access
from .snap import DEFAULT_SNAP_DB, search_snap_retailers
from .feedam import search_feedam
from .deduplicate import reconcile_locations
from .events import DEFAULT_EVENTS_DB, search_events


def search_sources(latitude, longitude, radius_m=5000, *, sources=("osm", "events"),
                   snap_db=DEFAULT_SNAP_DB, events_db=DEFAULT_EVENTS_DB,
                   at=None, event_window_hours=24, **osm_options):
    """Run selected providers independently; clearly report partial failures."""
    from .overpass import validate_search
    validate_search(latitude, longitude, radius_m)
    if not sources or any(source not in ("osm", "snap", "feedam", "events") for source in sources):
        raise ValueError("Choose at least one source: osm, snap, feedam or events.")
    result = {"origin": {"latitude": latitude, "longitude": longitude}, "radius_m": radius_m,
              "distance_method": "straight_line_haversine", "limitations": [], "source_status": {}}
    errors = []
    succeeded = 0
    for source in dict.fromkeys(sources):
        try:
            if source == "osm":
                result.update(search_food_access(latitude, longitude, radius_m, **osm_options))
            elif source == "snap":
                snap = search_snap_retailers(latitude, longitude, radius_m, db_path=snap_db)
                result.update(snap)
            elif source == "events":
                result.update(search_events(latitude, longitude, radius_m, db_path=events_db,
                                            at=at, window_hours=event_window_hours))
            else:
                result.update(search_feedam(latitude, longitude, radius_m))
            result["source_status"][source] = "ok"
            succeeded += 1
            if source == "feedam" and result.get("feedam_errors"):
                errors.extend(result["feedam_errors"])
                result["source_status"][source] = "partial"
        except (ValueError, RuntimeError, OSError) as error:
            result["source_status"][source] = "error"
            errors.append(f"{source.upper()}: {error}")
    if not succeeded:
        raise RuntimeError("; ".join(errors))
    result["source_errors"] = errors
    result["partial_results"] = bool(errors)
    if "Distances are straight-line estimates, not walking/driving routes." not in result["limitations"]:
        result["limitations"].append("Distances are straight-line estimates, not walking/driving routes.")
    result["limitations"].extend(result.get("snap_limitations", []))
    result["limitations"].extend(result.get("feedam_limitations", []))
    result["limitations"].extend(result.get("event_limitations", []))
    result.update(reconcile_locations(result))
    return result


def main():
    parser = argparse.ArgumentParser(description="Find OSM, USDA SNAP and Feedam food resources; straight-line distances.")
    parser.add_argument("--lat", type=float, required=True)
    parser.add_argument("--lon", type=float, required=True)
    parser.add_argument("--radius-m", type=float, default=5000)
    parser.add_argument("--limit", type=int, default=10, help="Display limit per group; JSON includes all results")
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--cache-hours", type=float, default=24)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--endpoint", default=ENDPOINT)
    parser.add_argument("--sources", nargs="+", choices=("osm", "snap", "feedam", "events"), default=["osm", "events"])
    parser.add_argument("--snap-db", type=Path, default=DEFAULT_SNAP_DB)
    parser.add_argument("--output", type=Path, help="Optional JSON snapshot, e.g. test-results/nearby-food-access.json")
    parser.add_argument("--events-db", type=Path, default=DEFAULT_EVENTS_DB)
    parser.add_argument("--at", help="Event search instant, ISO 8601 with UTC offset")
    parser.add_argument("--event-window-hours", type=float, default=24, help="Upcoming event window; 0 means active only")
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit must be positive")
    try:
        result = search_sources(args.lat, args.lon, args.radius_m, sources=args.sources,
                                    snap_db=args.snap_db, events_db=args.events_db, at=args.at,
                                    event_window_hours=args.event_window_hours, cache_path=args.cache,
                                    cache_hours=args.cache_hours, refresh=args.refresh, endpoint=args.endpoint)
        print(format_summary(result, args.limit))
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8")
            print(f"Saved all results to {args.output}")
    except (ValueError, RuntimeError, OSError) as error:
        parser.exit(1, f"Food-access lookup failed: {error}\n")


if __name__ == "__main__":
    main()
