"""Small, bounded Photon search-as-you-type adapter (OSM data)."""
from collections import OrderedDict
import json
import os
import threading
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from .overpass import validate_search

CACHE = OrderedDict()
LOCK = threading.Lock()


def suggest_addresses(query):
    if not isinstance(query, str) or len(query) > 200:
        raise ValueError("Location text must be at most 200 characters.")
    query = " ".join(query.split())
    if len(query) < 3:
        return []
    key = query.casefold()
    with LOCK:
        cached = CACHE.get(key)
        if cached and time.monotonic() - cached[0] < 300:
            return cached[1]
    endpoint = os.environ.get("LOCATION_AUTOCOMPLETE_URL", "https://photon.komoot.io/api/")
    request = Request(endpoint + "?" + urlencode({"q": query, "limit": 6, "lang": "en", "countrycode": "US"}),
                      headers={"User-Agent": "BridgeFoodAccess/1.0", "Accept": "application/json"})
    try:
        with urlopen(request, timeout=8) as response:
            payload = json.load(response)
        features = payload.get("features")
        if not isinstance(features, list):
            raise ValueError("Invalid geocoder response")
        candidates, seen = [], set()
        for feature in features:
            try:
                props = feature["properties"]
                lon, lat = feature["geometry"]["coordinates"]
                validate_search(lat, lon, 1)
                if props.get("countrycode", "").upper() != "US":
                    continue
                street = " ".join(str(props[k]) for k in ("housenumber", "street") if props.get(k))
                parts = [props.get("name"), street, props.get("city") or props.get("district"), props.get("state"), props.get("postcode")]
                label = ", ".join(dict.fromkeys(str(p) for p in parts if p))
                identity = (label, lat, lon)
                if not label or identity in seen:
                    continue
                seen.add(identity)
                candidates.append({"address": label, "latitude": lat, "longitude": lon})
            except (KeyError, ValueError, TypeError, AttributeError):
                continue
        candidates = candidates[:6]
    except (OSError, ValueError, TypeError, AttributeError) as error:
        raise RuntimeError("Address suggestions are temporarily unavailable. Use the map or device location.") from error
    with LOCK:
        CACHE[key] = (time.monotonic(), candidates)
        CACHE.move_to_end(key)
        while len(CACHE) > 128:
            CACHE.popitem(last=False)
    return candidates
