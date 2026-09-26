"""Conservative location reconciliation with source evidence retained."""
import re
import unicodedata

from .overpass import distance_meters
from .availability import availability_for
from .output import CATEGORY_LABELS, group_for_ui

GROUPS = ("community_events", "food_assistance", "feedam_resources", "snap_retailers", "nearby_food_access",
          "alternative_food_retail", "potential_assistance")


def _text(value):
    text = unicodedata.normalize("NFKD", str(value or "")).casefold()
    return " ".join(re.findall(r"[a-z0-9]+", text))


def _street(place):
    parts = place.get("address_parts") or {}
    tags = place.get("tags") or {}
    value = parts.get("street") or " ".join(str(tags.get(k, "")) for k in ("addr:housenumber", "addr:street"))
    # Do not use incomplete/free-form whole-address matches for automatic merging.
    text = _text(value)
    aliases = {"street": "st", "road": "rd", "avenue": "ave", "boulevard": "blvd", "drive": "dr", "lane": "ln"}
    return " ".join(aliases.get(word, word) for word in text.split())


def _close(a, b, meters):
    return distance_meters(a["latitude"], a["longitude"], b["latitude"], b["longitude"]) <= meters


def same_location(a, b):
    if a["place_id"] == b["place_id"]:
        return True
    if any(p["place_id"].startswith("community_event:") for p in (a, b)):
        return False
    name = _text(a.get("name"))
    street = _street(a)
    return bool(name and not name.startswith("unnamed") and name == _text(b.get("name"))
                and street and any(char.isdigit() for char in street)
                and street == _street(b) and _close(a, b, 75))


def reconcile_locations(result):
    """One canonical entry per certain match; ambiguous matches remain separate.

    Match every existing member (complete linkage) to avoid transitive chain merges.
    Source IDs merge nearby/urgent records even when optional fields differ.
    """
    clusters = []
    for group in GROUPS:
        for place in result.get(group, []):
            record = {**place, "source_group": group}
            matches = [cluster for cluster in clusters if all(same_location(record, other) for other in cluster)]
            if len(matches) == 1:
                matches[0].append(record)
            else:
                clusters.append([record])
    canonical = []
    for cluster in clusters:
        first = cluster[0]
        memberships = sorted({record["source_group"] for record in cluster})
        if "feedam_resources" in memberships or "food_assistance" in memberships:
            display_group = "food_assistance"
        elif "snap_retailers" in memberships:
            display_group = "snap_retailers"
        else:
            display_group = first["source_group"]
        canonical.append({**first, "display_group": display_group,
                          "source_ids": sorted({record["place_id"] for record in cluster}),
                          "source_groups": memberships, "source_records": cluster,
                          "availability": availability_for(cluster),
                          "reported_by_urgent_endpoint": any(r.get("reported_by_urgent_endpoint") for r in cluster),
                          "snap_listed": "snap_retailers" in memberships,
                          "merge_reason": "same_source_id_or_exact_name_street_within_75m" if len(cluster) > 1 else None,
                          "possible_duplicate_ids": []})
    # Expose uncertainty rather than dropping co-located programs or same-name branches.
    for index, a in enumerate(canonical):
        for b in canonical[index + 1:]:
            if any(p["place_id"].startswith("community_event:") for p in (a, b)):
                continue
            shared_id = bool(set(a["source_ids"]) & set(b["source_ids"]))
            similar = (_text(a.get("name")) == _text(b.get("name")) or (_street(a) and _street(a) == _street(b)))
            if shared_id or (similar and _close(a, b, 150)):
                a["possible_duplicate_ids"].append(b["place_id"])
                b["possible_duplicate_ids"].append(a["place_id"])
    canonical.sort(key=lambda place: (place["distance_m"], place["place_id"]))
    return {"locations": canonical,
            "ui_categories": group_for_ui(canonical),
            "ui_category_labels": CATEGORY_LABELS.copy(),
            "deduplication": {"input_records": sum(len(result.get(key, [])) for key in GROUPS),
                              "unique_display_locations": len(canonical),
                              "ambiguous_locations": sum(bool(p["possible_duplicate_ids"]) for p in canonical),
                              "policy": "Events merge only by event ID; other places use exact source ID or exact normalized name + numbered street + <=75m; ambiguous records retained."}}
