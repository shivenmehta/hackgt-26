"""Nearby food access from OpenStreetMap. Standard library; no API key."""
import os
import hashlib
import json
import math
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

ENDPOINT = "https://overpass-api.de/api/interpreter"
PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CACHE = Path(os.environ.get("LOCATION_CACHE_PATH", PROJECT_ROOT / "test-results/osm-cache.sqlite3"))
ATTRIBUTION = "© OpenStreetMap contributors — https://www.openstreetmap.org/copyright"
SHOP_TYPES = {"supermarket", "grocery", "convenience"}
ASSISTANCE_TYPES = {"food_bank", "soup_kitchen"}


def _number(value):
    return type(value) in (int, float) and math.isfinite(value)


def validate_search(latitude, longitude, radius_m):
    if not _number(latitude) or not -90 <= latitude <= 90:
        raise ValueError("Latitude must be between -90 and 90.")
    if not _number(longitude) or not -180 <= longitude <= 180:
        raise ValueError("Longitude must be between -180 and 180.")
    if not _number(radius_m) or not 0 < radius_m <= 25000:
        raise ValueError("Radius must be greater than zero and at most 25,000 meters.")


def build_query(latitude, longitude, radius_m=5000):
    validate_search(latitude, longitude, radius_m)
    around = f"(around:{radius_m:.3f},{latitude:.7f},{longitude:.7f})"
    return f'''[out:json][timeout:25];
(
  nwr["shop"~"^(supermarket|grocery|convenience|farm)$"]{around};
  nwr["social_facility"~"(^|;)[[:space:]]*(food_bank|soup_kitchen)[[:space:]]*(;|$)"]{around};
  nwr["amenity"="food_sharing"]{around};
  nwr["amenity"="marketplace"]{around};
  nwr["amenity"="community_centre"]{around};
);
out center tags;'''


def distance_meters(lat1, lon1, lat2, lon2):
    """Haversine great-circle distance, not a driving/walking route."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371008.8 * 2 * math.asin(math.sqrt(min(1, max(0, a))))


def normalize_places(payload, latitude, longitude, radius_m):
    """Normalize nodes and way/relation bounding-box centers into sorted groups."""
    validate_search(latitude, longitude, radius_m)
    if not isinstance(payload, dict) or not isinstance(payload.get("elements"), list):
        raise ValueError("Overpass returned an invalid data structure.")
    if payload.get("remark"):
        raise RuntimeError("Overpass reported an incomplete query; retry later or reduce the radius.")
    groups = {"nearby_food_access": [], "alternative_food_retail": [],
              "food_assistance": [], "potential_assistance": []}
    seen = set()
    skipped = 0
    for element in payload["elements"]:
        if not isinstance(element, dict):
            skipped += 1
            continue
        osm_type, osm_id = element.get("type"), element.get("id")
        if osm_type not in ("node", "way", "relation") or type(osm_id) is not int or osm_id <= 0:
            skipped += 1
            continue
        identity = f"{osm_type}/{osm_id}"
        if identity in seen:
            continue
        tags = element.get("tags", {})
        if not isinstance(tags, dict):
            skipped += 1
            continue
        # Do not present explicitly closed/proposed places as current food access.
        if any(tags.get(flag) in ("yes", "true", "1") for flag in ("disused", "abandoned", "demolished", "proposed", "construction")):
            continue
        if tags.get("access") in ("no", "private"):
            continue
        social = {value.strip() for value in str(tags.get("social_facility", "")).split(";")}
        categories = sorted(social & ASSISTANCE_TYPES)
        tagging_warnings = []
        notes = []
        if categories and tags.get("amenity") != "social_facility":
            tagging_warnings.append("Food-assistance subtag matched without amenity=social_facility.")
        if tags.get("amenity") == "food_sharing":
            categories.append("food_sharing")
        if categories:
            group = "food_assistance"
            assistance_evidence = "explicit_osm_tag"
        elif tags.get("shop") in SHOP_TYPES:
            categories = [tags["shop"]]
            group = "nearby_food_access"
            assistance_evidence = "not_indicated"
        elif tags.get("shop") == "farm" or tags.get("amenity") == "marketplace":
            categories = []
            if tags.get("shop") == "farm":
                categories.append("farm")
            if tags.get("amenity") == "marketplace":
                categories.append("marketplace")
            group = "alternative_food_retail"
            assistance_evidence = "not_indicated"
            notes.append("Verify food vendors and operating days; a marketplace tag does not guarantee food sales.")
        elif tags.get("amenity") == "community_centre":
            categories = ["community_centre"]
            group = "potential_assistance"
            assistance_evidence = "community_centre_only"
            notes.append("Potential contact only: no explicit food-assistance tag; verify services before visiting.")
        else:
            continue
        coordinates = element if osm_type == "node" else element.get("center", {})
        if not isinstance(coordinates, dict):
            skipped += 1
            continue
        lat, lon = coordinates.get("lat"), coordinates.get("lon")
        if not _number(lat) or not _number(lon) or not -90 <= lat <= 90 or not -180 <= lon <= 180:
            skipped += 1
            continue
        distance = distance_meters(latitude, longitude, lat, lon)
        if distance > radius_m:
            continue
        seen.add(identity)
        fallback = "Unnamed " + categories[0].replace("_", " ")
        name = tags.get("name") or tags.get("brand") or tags.get("operator") or fallback
        address = " ".join(str(tags[key]) for key in ("addr:housenumber", "addr:street", "addr:city", "addr:postcode") if tags.get(key))
        groups[group].append({
            "place_id": "osm:" + identity, "osm_type": osm_type, "osm_id": osm_id,
            "name": name, "categories": categories, "latitude": lat, "longitude": lon,
            "coordinate_source": "node" if osm_type == "node" else "bounding_box_center",
            "distance_m": distance, "distance_miles": distance / 1609.344,
            "address": address or None, "opening_hours": tags.get("opening_hours"),
            "phone": tags.get("contact:phone") or tags.get("phone"),
            "website": tags.get("contact:website") or tags.get("website"),
            "wheelchair": tags.get("wheelchair"), "access": tags.get("access"),
            "serves": tags.get("social_facility:for") or tags.get("community_centre:for"),
            "assistance_evidence": assistance_evidence, "tagging_warnings": tagging_warnings,
            "notes": notes, "services_verified": False,
            "osm_url": f"https://www.openstreetmap.org/{identity}", "tags": tags,
            "inventory_verified": False, "eligibility_verified": False,
        })
    for places in groups.values():
        places.sort(key=lambda place: (place["distance_m"], place["place_id"]))
    return {**groups, "skipped_malformed_elements": skipped}


def _fetch(query, endpoint):
    request = Request(endpoint, data=urlencode({"data": query}).encode(), headers={
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "HackGT26-FoodAccess/0.1 (https://github.com/shivenmehta/hackgt-26)",
    }, method="POST")  # POST submits a read-only Overpass query; it does not edit OSM.
    try:
        with urlopen(request, timeout=40) as response:
            return json.load(response)
    except HTTPError as error:
        if error.code in (429, 504):
            raise RuntimeError(f"Overpass is busy (HTTP {error.code}). Wait before retrying; do not poll repeatedly.") from None
        raise RuntimeError(f"Overpass request failed (HTTP {error.code}).") from None
    except (URLError, TimeoutError, OSError):
        raise RuntimeError("Could not reach Overpass. Retry later; cached data is not silently substituted.") from None
    except (ValueError, UnicodeError):
        raise RuntimeError("Overpass did not return valid JSON.") from None


def search_food_access(latitude, longitude, radius_m=5000, *, cache_path=DEFAULT_CACHE,
                       cache_hours=24, refresh=False, endpoint=ENDPOINT):
    """Return grouped locations; cache successful queries in a local SQLite database."""
    query = build_query(latitude, longitude, radius_m)
    parsed = urlsplit(endpoint)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Overpass endpoint must be an HTTPS URL without credentials or query parameters.")
    if not _number(cache_hours) or cache_hours < 0:
        raise ValueError("cache_hours must be finite and nonnegative.")
    key = hashlib.sha256((endpoint + query).encode()).hexdigest()
    cache_path = Path(cache_path)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(cache_path)
    try:
        connection.execute("CREATE TABLE IF NOT EXISTS osm_search_cache (query_key TEXT PRIMARY KEY, fetched_at REAL NOT NULL, payload TEXT NOT NULL)")
        row = connection.execute("SELECT fetched_at, payload FROM osm_search_cache WHERE query_key=?", (key,)).fetchone()
        now = time.time()
        cache_hit = bool(not refresh and row and 0 <= now - row[0] < cache_hours * 3600)
        if cache_hit:
            fetched_at, serialized = row
            try:
                payload = json.loads(serialized)
            except ValueError:
                raise RuntimeError("Cached OSM response is damaged. Run with --refresh.") from None
        else:
            payload = _fetch(query, endpoint)
            # Never cache an HTTP-200 Overpass timeout/partial response.
            normalize_places(payload, latitude, longitude, radius_m)
            fetched_at = time.time()
            connection.execute("INSERT OR REPLACE INTO osm_search_cache VALUES (?, ?, ?)",
                               (key, fetched_at, json.dumps(payload, allow_nan=False)))
            connection.commit()
    finally:
        connection.close()
    return {
        "origin": {"latitude": latitude, "longitude": longitude}, "radius_m": radius_m,
        "distance_method": "straight_line_haversine", "cache_hit": cache_hit,
        "fetched_at": datetime.fromtimestamp(fetched_at, timezone.utc).isoformat(),
        "osm_base_timestamp": payload.get("osm3s", {}).get("timestamp_osm_base"),
        "attribution": ATTRIBUTION,
        "limitations": ["Distances are straight-line estimates, not walking/driving routes.",
                        "OSM coverage can be incomplete or outdated; no matches does not mean no services exist.",
                        "Hours, pantry eligibility, stock, prices and SNAP acceptance are not verified.",
                        "Community centres are potential contacts, not confirmed food assistance; markets may not sell food."],
        **normalize_places(payload, latitude, longitude, radius_m),
    }


def format_summary(result, limit=10):
    if type(limit) is not int or limit < 1:
        raise ValueError("Display limit must be a positive integer.")
    lines = []
    from .output import CATEGORY_LABELS, group_for_ui
    if "ui_categories" in result:
        display = result["ui_categories"]
    elif "locations" in result:
        display = group_for_ui(result["locations"])
    else:
        from .deduplicate import reconcile_locations
        display = reconcile_locations(result)["ui_categories"]
    for key, label in CATEGORY_LABELS.items():
        places = display[key]
        lines.append(f"{label} ({len(places)} listed):")
        for place in places[:limit]:
            name = " ".join(str(place["name"]).split())
            badges = list(place.get("service_labels", []))
            if place.get("reported_by_urgent_endpoint"):
                badges.append("Feedam urgent listing; call to confirm")
            if place.get("possible_duplicate_ids"):
                badges.append("possible duplicate")
            suffix = " [" + "; ".join(badges) + "]" if badges else ""
            lines.append(f"  {name:<44} {place['distance_miles']:.1f} mi{suffix}")
            availability = place.get("availability", {})
            if availability.get("starts_at"):
                lines.append(f"    {availability['status']}: {availability['starts_at']} to {availability['ends_at']}")
                lines.append("    Food: " + ", ".join(place.get("foods", [])))
                lines.append("    Address: " + " ".join(place.get("address", "").split()))
            else:
                hours = [str(s["hours"]) for s in availability.get("schedules", []) if s.get("hours")]
                lines.append("    Hours: " + ("; ".join(hours) + " (source reported; confirm)" if hours else "unknown; contact provider"))

        if not places:
            lines.append("  No listings from the available selected sources; coverage may be incomplete.")
        if len(places) > limit:
            lines.append(f"  ... {len(places) - limit} more in the JSON output")
        lines.append("")
    lines.extend(result["limitations"])
    if result.get("attribution"):
        lines.append(result["attribution"])
        lines.append(f"Fetched: {result['fetched_at']} | cache hit: {result['cache_hit']}")
    if result.get("snap_snapshot"):
        lines.append(f"USDA SNAP CSV retrieved: {result['snap_snapshot']['retrieved_on']} | https://www.fna.usda.gov/snap/retailer-locator")
    if result.get("feedam_attribution"):
        lines.append(result["feedam_attribution"])
        for endpoint, metadata in result["feedam_endpoints"].items():
            lines.append(f"Feedam {endpoint}: {metadata['status']} | fetched: {metadata.get('fetched_at', 'unavailable')}")
            if metadata.get("possibly_truncated"):
                lines.append("  Provider reports additional/capped results; this is not an exhaustive list.")
    if result.get("deduplication"):
        stats = result["deduplication"]
        lines.append(f"Reconciliation: {stats['input_records']} source records -> {stats['unique_display_locations']} displayed locations; {stats['ambiguous_locations']} possible duplicates retained.")
    for error in result.get("source_errors", []):
        lines.append("PARTIAL RESULTS — " + error)
    return "\n".join(lines)
