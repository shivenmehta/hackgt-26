"""Persistent, local community giveaways. Public records never contain edit tokens."""
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
from pathlib import Path
import secrets
import sqlite3
import uuid
from urllib.parse import urlencode
from urllib.request import urlopen

from . import hosted_events
from .overpass import PROJECT_ROOT, distance_meters, validate_search

DEFAULT_EVENTS_DB = PROJECT_ROOT / ".local/community-events.sqlite3"


def timestamp(value):
    """Require an explicit offset; never guess the host machine's timezone."""
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if result.tzinfo is None or result.utcoffset() is None:
            raise ValueError()
        return result.astimezone(timezone.utc)
    except (ValueError, AttributeError, TypeError):
        raise ValueError("Times must be ISO 8601 strings with an offset, e.g. 2026-09-25T18:00:00-04:00.") from None


def _now(value):
    return timestamp(value) if value is not None else datetime.now(timezone.utc)


def _text(value, field, maximum):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValueError(f"{field} must contain 1–{maximum} characters.")
    return value.strip()


def _connect(db_path):
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.execute("""CREATE TABLE IF NOT EXISTS community_events (
        id TEXT PRIMARY KEY, payload TEXT NOT NULL, starts REAL NOT NULL,
        ends REAL NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
        token_hash TEXT NOT NULL, cancelled INTEGER NOT NULL DEFAULT 0)""")
    connection.execute("CREATE INDEX IF NOT EXISTS event_time ON community_events(ends, starts)")
    return connection


def create_event(data, *, db_path=DEFAULT_EVENTS_DB, now=None, request_id=None):
    """Create one free-food event; return public event plus a private cancellation token.

    Coordinates and public address must be confirmed by the host. Text is stored as
    plain text: future HTML clients must escape it. No account identity is implied.
    """
    if not isinstance(data, dict):
        raise ValueError("Event must be a JSON object.")
    message = _text(data.get("message"), "message", 4000)
    address = _text(data.get("address"), "address", 500)
    host = _text(data.get("host_name"), "host_name", 100)
    foods = data.get("foods")
    if not isinstance(foods, list) or not 1 <= len(foods) <= 50:
        raise ValueError("foods must be a list of 1–50 food descriptions.")
    foods = list(dict.fromkeys(_text(food, "food", 200) for food in foods))
    lat, lon = data.get("latitude"), data.get("longitude")
    validate_search(lat, lon, 1)
    if data.get("public_location_confirmed") is not True:
        raise ValueError("Confirm that this address and map coordinates may be shared publicly.")
    start, end = timestamp(data.get("starts_at")), timestamp(data.get("ends_at"))
    current = _now(now)
    if end <= start:
        raise ValueError("ends_at must be after starts_at.")
    if end <= current:
        raise ValueError("Cannot publish an already-ended event.")
    identifier = "community_event:" + str(uuid.uuid4())
    event = {"place_id": identifier, "name": f"{host}'s community giveaway",
             "host_name": host, "message": message, "address": address, "foods": foods,
             "latitude": lat, "longitude": lon, "coordinate_source": "host_confirmed",
             "starts_at": data["starts_at"], "ends_at": data["ends_at"],
             "starts_at_utc": start.isoformat(), "ends_at_utc": end.isoformat(),
             "created_at": current.isoformat(), "categories": ["community_giveaway"],
             "services_verified": False, "inventory_verified": False,
             "eligibility_verified": False, "source": "community_events"}
    # A browser-generated UUID is a private retry capability, never a public ID.
    request_hash = None
    if request_id is not None:
        try:
            parsed = uuid.UUID(request_id)
            if parsed.version != 4 or str(parsed) != request_id:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise ValueError("request_id must be a private UUID v4.") from None
        request_hash = hashlib.sha256(request_id.encode()).hexdigest()
    token = hashlib.sha256(("event-cancel:" + request_id).encode()).hexdigest() if request_id else secrets.token_urlsafe(32)
    body_hash = hashlib.sha256(json.dumps(data, sort_keys=True, allow_nan=False).encode()).hexdigest()
    if hosted_events.enabled():
        stored = hosted_events.create(event, start.timestamp(), end.timestamp(),
            hashlib.sha256(token.encode()).hexdigest(), request_hash, body_hash)
        return {"event": stored, "edit_token": token}
    connection = _connect(db_path)
    try:
        with connection:
            connection.execute("CREATE TABLE IF NOT EXISTS event_requests (request_hash TEXT PRIMARY KEY, body_hash TEXT NOT NULL, event_id TEXT NOT NULL)")
            connection.execute("BEGIN IMMEDIATE")
            if request_hash:
                previous = connection.execute("SELECT body_hash, event_id FROM event_requests WHERE request_hash=?", (request_hash,)).fetchone()
                if previous:
                    if previous[0] != body_hash:
                        raise ValueError("This submission ID was already used for different details. Start a new post.")
                    stored = connection.execute("SELECT payload FROM community_events WHERE id=?", (previous[1],)).fetchone()
                    return {"event": json.loads(stored[0]), "edit_token": token}
            connection.execute("INSERT INTO community_events VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
                               (identifier, json.dumps(event, allow_nan=False), start.timestamp(),
                                end.timestamp(), lat, lon, hashlib.sha256(token.encode()).hexdigest()))
            if request_hash:
                connection.execute("INSERT INTO event_requests VALUES (?, ?, ?)", (request_hash, body_hash, identifier))
    finally:
        connection.close()
    return {"event": event, "edit_token": token}


def cancel_event(event_id, edit_token, *, db_path=DEFAULT_EVENTS_DB):
    """Idempotent cancellation with an unguessable capability; no unauthenticated edit."""
    if not isinstance(edit_token, str) or not edit_token:
        raise ValueError("A valid private edit token is required.")
    if hosted_events.enabled():
        hosted_events.cancel(event_id, hashlib.sha256(edit_token.encode()).hexdigest())
        return
    connection = _connect(db_path)
    try:
        with connection:
            row = connection.execute("SELECT token_hash FROM community_events WHERE id=?", (event_id,)).fetchone()
            digest = hashlib.sha256(edit_token.encode()).hexdigest()
            if not row or not secrets.compare_digest(row[0], digest):
                raise ValueError("Event not found or edit token invalid.")
            connection.execute("UPDATE community_events SET cancelled=1 WHERE id=?", (event_id,))
    finally:
        connection.close()


def search_events(latitude, longitude, radius_m=5000, *, db_path=DEFAULT_EVENTS_DB,
                  at=None, window_hours=24):
    """Return active and upcoming events overlapping [at, at + window).

    Zero window means active at that instant. End times are exclusive. Missing
    stores mean no local posts; malformed/unreadable existing stores are errors.
    """
    validate_search(latitude, longitude, radius_m)
    if isinstance(window_hours, bool) or not isinstance(window_hours, (int, float)) or not math.isfinite(window_hours) or not 0 <= window_hours <= 8760:
        raise ValueError("Event window must be 0–8760 hours.")
    current = _now(at)
    until = current + timedelta(hours=window_hours)
    result = {"community_events": [], "event_search": {"at": current.isoformat(),
              "until": until.isoformat(), "window_hours": window_hours},
              "event_limitations": ["Community giveaways are host-reported; food availability and hosts are not verified.",
                                    "Event time filters apply only to community events, not external provider hours."]}
    if hosted_events.enabled():
        rows = hosted_events.search(current.timestamp(), until.timestamp(), window_hours == 0)
    else:
        path = Path(db_path)
        if not path.exists():
            return result
        try:
            connection = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)
            try:
                operator = "<=" if window_hours == 0 else "<"
                rows = connection.execute(f"SELECT payload FROM community_events WHERE cancelled=0 AND ends>? AND starts{operator}?",
                                          (current.timestamp(), until.timestamp())).fetchall()
            finally:
                connection.close()
        except sqlite3.Error as error:
            raise RuntimeError(f"Community event database could not be read: {error}") from error
    for (payload,) in rows:
        event = json.loads(payload)
        distance = distance_meters(latitude, longitude, event["latitude"], event["longitude"])
        if distance > radius_m:
            continue
        status = "scheduled_active" if timestamp(event["starts_at"]) <= current else "upcoming"
        event.update(distance_m=round(distance, 1), distance_miles=round(distance / 1609.344, 3),
                     availability={"status": status, "verified": False, "evaluated_at": current.isoformat(),
                                   "starts_at": event["starts_at"], "ends_at": event["ends_at"],
                                   "hours_known": True, "schedules": [{"source": "community_events",
                                   "source_id": event["place_id"], "starts_at": event["starts_at"], "ends_at": event["ends_at"]}]})
        result["community_events"].append(event)
    result["community_events"].sort(key=lambda item: (item["distance_m"], item["place_id"]))
    return result


def geocode_address(address):
    """US Census candidate matches, NOT an automatic confirmation of a host's pin."""
    address = _text(address, "address", 500)
    url = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?" + urlencode(
        {"address": address, "benchmark": "Public_AR_Current", "format": "json"})
    try:
        with urlopen(url, timeout=30) as response:
            payload = json.load(response)
        candidates = []
        for match in payload["result"]["addressMatches"]:
            lat, lon = match["coordinates"]["y"], match["coordinates"]["x"]
            validate_search(lat, lon, 1)
            candidates.append({"address": match["matchedAddress"], "latitude": lat, "longitude": lon,
                               "source": "US Census geocoder", "requires_host_confirmation": True})
        return candidates
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise RuntimeError(f"Address lookup failed: {error}") from error


def get_event(event_id, *, db_path=DEFAULT_EVENTS_DB, now=None):
    """Public details remain readable after cancellation/expiration; no token fields."""
    if hosted_events.enabled():
        row = hosted_events.get(event_id)
    else:
        path = Path(db_path)
        if not path.exists():
            return None
        connection = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)
        try:
            row = connection.execute("SELECT payload, cancelled FROM community_events WHERE id=?", (event_id,)).fetchone()
        finally:
            connection.close()
    if not row:
        return None
    event = json.loads(row[0])
    current = _now(now)
    event["status"] = ("cancelled" if row[1] else "ended" if timestamp(event["ends_at"]) <= current
                       else "scheduled_active" if timestamp(event["starts_at"]) <= current else "upcoming")
    return event


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_EVENTS_DB)
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create")
    create.add_argument("--input", type=Path, required=True, help="Event JSON; creation prints a private edit token")
    geocode = commands.add_parser("geocode")
    geocode.add_argument("address")
    cancel = commands.add_parser("cancel")
    cancel.add_argument("event_id")
    args = parser.parse_args()
    try:
        if args.command == "geocode":
            output = geocode_address(args.address)
        elif args.command == "create":
            output = create_event(json.loads(args.input.read_text(encoding="utf-8")), db_path=args.db)
        else:
            from getpass import getpass
            cancel_event(args.event_id, getpass("Private edit token: "), db_path=args.db)
            output = {"cancelled": True, "event_id": args.event_id}
        print(json.dumps(output, indent=2, ensure_ascii=False))
    except (ValueError, RuntimeError, OSError, sqlite3.Error) as error:
        parser.exit(1, f"Community event operation failed: {error}\n")


if __name__ == "__main__":
    main()
