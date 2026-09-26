"""CLI: python -m src.lib.location.nearby --lat 33.7756 --lon -84.3963"""
import argparse
import json
from pathlib import Path

from .overpass import DEFAULT_CACHE, ENDPOINT, format_summary, search_food_access


def main():
    parser = argparse.ArgumentParser(description="Find OSM grocery stores and food assistance; straight-line distances.")
    parser.add_argument("--lat", type=float, required=True)
    parser.add_argument("--lon", type=float, required=True)
    parser.add_argument("--radius-m", type=float, default=5000)
    parser.add_argument("--limit", type=int, default=10, help="Display limit per group; JSON includes all results")
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--cache-hours", type=float, default=24)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--endpoint", default=ENDPOINT)
    parser.add_argument("--output", type=Path, help="Optional JSON snapshot, e.g. test-results/nearby-food-access.json")
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit must be positive")
    try:
        result = search_food_access(args.lat, args.lon, args.radius_m, cache_path=args.cache,
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
