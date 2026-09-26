"""Read-only Feed America (feedam.org) nearby + urgent directory integration."""
import json
import math
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .overpass import distance_meters, validate_search

BASE_URL = "https://feedam.org"


def _get(endpoint, params):
    request = Request(BASE_URL + endpoint + "?" + urlencode(params), headers={
        "Accept": "application/json",
        "User-Agent": "HackGT26-FoodAccess/0.1 (https://github.com/shivenmehta/hackgt-26)",
    })
    try:
        with urlopen(request, timeout=30) as response:
            payload = json.load(response)
    except HTTPError as error:
        raise RuntimeError(f"Feedam {endpoint} failed (HTTP {error.code}); retry later.") from None
    except (URLError, TimeoutError, OSError, ValueError):
        raise RuntimeError(f"Feedam {endpoint} connection or JSON response failed.") from None
    if not isinstance(payload, dict) or payload.get("success") is not True or not isinstance(payload.get("resources"), list):
        raise ValueError(f"Feedam {endpoint} returned an unsuccessful or invalid response.")
    return payload


def normalize_resource(record, endpoint, latitude, longitude, radius_m, fetched_at):
    if not isinstance(record, dict):
        return None
    identifier = record.get("id")
    lat, lon = record.get("lat"), record.get("lng")
    if (type(identifier) is not int or identifier <= 0 or not record.get("name")
            or type(lat) not in (int, float) or type(lon) not in (int, float)
            or not math.isfinite(lat) or not math.isfinite(lon)
            or not -90 <= lat <= 90 or not -180 <= lon <= 180
            or record.get("is_active") in (0, False)):
        return None
    # Do not mix benefit offices/retailers or health facilities into food assistance.
    if record.get("resource_type") in ("snap_retailer", "snap_office", "wic_office", "health_center", "mental_health_facility"):
        return None
    distance = distance_meters(latitude, longitude, lat, lon)
    if distance > radius_m:
        return None  # Independently enforce radius even when the provider expands it.
    street = record.get("address") or ""
    address_parts = {"street": street, "city": record.get("city"), "state": record.get("state"), "zip_code": record.get("zip")}
    return {
        "place_id": f"feedam:{identifier}", "name": record["name"],
        "latitude": lat, "longitude": lon, "distance_m": distance, "distance_miles": distance / 1609.344,
        "address": ", ".join(str(v) for v in address_parts.values() if v), "address_parts": address_parts,
        "phone": record.get("phone"), "website": record.get("website"),
        "categories": [record.get("resource_type") or "food_assistance"],
        "source": "Feed America (feedam.org)", "data_source": record.get("data_source"),
        "source_url": f"{BASE_URL}/resource/{identifier}", "endpoint": endpoint,
        "reported_by_urgent_endpoint": endpoint.endswith("/urgent"),
        "hours_status": record.get("hours_status"), "hours_json": record.get("hours_json"),
        "live_status": record.get("live_status"), "requirements_text": record.get("requirements_text"),
        "services_offered_json": record.get("services_offered_json"),
        "verification_status": record.get("verification_status"), "last_verified_date": record.get("last_verified_date"),
        "requires_appointment": record.get("requires_appointment"), "accepts_walkins": record.get("accepts_walkins"),
        "fetched_at": fetched_at, "services_verified": False, "eligibility_verified": False,
    }


def search_feedam(latitude, longitude, radius_m=5000, *, limit=100):
    validate_search(latitude, longitude, radius_m)
    if type(limit) is not int or not 1 <= limit <= 100:
        raise ValueError("Feedam limit must be between 1 and 100.")
    params = {"lat": latitude, "lng": longitude, "radius": radius_m / 1609.344}
    resources, errors, metadata = [], [], {}
    for endpoint in ("/api/resources/nearby", "/api/resources/urgent"):
        query = {**params, "mode": "free", "limit": limit} if endpoint.endswith("/nearby") else params
        try:
            payload = _get(endpoint, query)
            fetched_at = datetime.now(timezone.utc).isoformat()
            accepted = []
            for record in payload["resources"]:
                place = normalize_resource(record, endpoint, latitude, longitude, radius_m, fetched_at)
                if place is not None:
                    accepted.append(place)
            resources.extend(accepted)
            total = payload.get("total_available")
            metadata[endpoint] = {
                "status": "ok", "fetched_at": fetched_at, "returned": len(payload["resources"]),
                "accepted": len(accepted), "excluded": len(payload["resources"]) - len(accepted),
                "provider_total_available": total, "provider_expanded": payload.get("expanded"),
                "provider_radius_miles": payload.get("search_radius_mi"),
                "possibly_truncated": (isinstance(total, int) and total > len(payload["resources"])) or len(payload["resources"]) >= limit,
                "provider_message": payload.get("message"), "provider_metadata": payload.get("_data_provider"),
            }
        except (ValueError, RuntimeError) as error:
            errors.append(str(error))
            metadata[endpoint] = {"status": "error"}
    if all(item["status"] == "error" for item in metadata.values()):
        raise RuntimeError("; ".join(errors))
    return {"feedam_resources": resources, "feedam_endpoints": metadata,
            "feedam_errors": errors, "feedam_attribution": "Directory published by Feed America (feedam.org). Original data_source retained per record.",
            "feedam_limitations": [
                "Feed America (feedam.org) is the directory publisher; do not label it as Feeding America.",
                "Urgent listings and hours are provider-reported, not a guarantee of current opening or food availability. Call first.",
                "Feedam search may be capped or expanded; results are locally filtered to the requested radius and may not be exhaustive.",
            ]}
