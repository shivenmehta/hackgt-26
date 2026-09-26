"""Preserve reported schedules without guessing open-now status or missing hours."""
import json


def availability_for(records):
    if records and all(r.get("source_group") == "community_events" for r in records):
        return records[0]["availability"]
    schedules = []
    for record in records:
        source = record.get("source_group")
        raw = record.get("opening_hours")
        if source == "feedam_resources":
            raw = record.get("hours_json")
            if isinstance(raw, str):
                try:
                    raw = json.loads(raw)
                except ValueError:
                    pass
        schedules.append({"source": source, "source_id": record["place_id"],
                          "hours": raw or None, "reported_hours_status": record.get("hours_status"),
                          "reported_live_status": record.get("live_status"),
                          "fetched_at": record.get("fetched_at"),
                          "note": "USDA SNAP CSV does not provide hours." if source == "snap_retailers" else
                                  "Source-reported schedule; confirm with the provider."})
    return {"status": "unknown", "hours_known": any(bool(s["hours"]) for s in schedules),
            "verified": False, "schedules": schedules,
            "note": "Open-now status is not computed from external schedules; hours may conflict or be outdated."}
