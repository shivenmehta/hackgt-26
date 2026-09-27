"""Import USDA's CURRENT retailer CSV; query nearby SNAP retailers offline."""
import os
import argparse
import csv
import hashlib
import json
import math
import re
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path

from .overpass import PROJECT_ROOT, distance_meters, validate_search

DEFAULT_SNAP_DB = Path(os.environ.get("LOCATION_SNAP_DB", PROJECT_ROOT / "test-results/snap-retailers.sqlite3"))
SOURCE_URL = "https://www.fna.usda.gov/snap/retailer-locator"
CSV_URL = "https://hub.arcgis.com/api/download/v1/items/8b260f9a10b0459aa441ad8588c2251c/csv?layers=0"


def _header(value):
    return re.sub(r"[^a-z0-9]", "", value.lower())


def import_snap_csv(csv_path, db_path=DEFAULT_SNAP_DB, *, retrieved_on=None, source_url=CSV_URL):
    """Replace the local snapshot atomically. Never ingest historical authorizations.

    Use only the current USDA locator export. Header checks detect common historical
    formats but cannot prove provenance; the caller must choose the current export.
    Geographic X/Y export columns can be projected meters: use Latitude/Longitude.
    """
    csv_path, db_path = Path(csv_path), Path(db_path)
    retrieved_on = retrieved_on or date.today().isoformat()
    if date.fromisoformat(retrieved_on) > date.today():
        raise ValueError("Retrieval date cannot be in the future.")
    digest = hashlib.sha256()
    with csv_path.open("rb") as raw:
        for chunk in iter(lambda: raw.read(1024 * 1024), b""):
            digest.update(chunk)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    counts = {"rows_read": 0, "imported": 0, "invalid_rows": 0, "duplicate_rows": 0}
    with csv_path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        fields = {_header(field): field for field in reader.fieldnames or []}
        historical = ("enddate", "authorization", "authorisation", "deauthorization", "startdate")
        if any(any(marker in name for marker in historical) for name in fields):
            raise ValueError("Historical/authorization-date CSV detected. Download the CURRENT retailer locator export instead.")
        required = ("recordid", "storename", "storetype", "latitude", "longitude", "storestreetaddress", "city", "state", "zipcode")
        missing = [field for field in required if field not in fields]
        if missing:
            raise ValueError("Missing current USDA CSV columns: " + ", ".join(missing))
        connection = sqlite3.connect(db_path)
        try:
            connection.execute("BEGIN")
            connection.execute("CREATE TABLE IF NOT EXISTS snap_retailers (record_id TEXT PRIMARY KEY, name TEXT NOT NULL, retailer_type TEXT, latitude REAL NOT NULL, longitude REAL NOT NULL, address_json TEXT NOT NULL)")
            connection.execute("CREATE INDEX IF NOT EXISTS snap_latitude ON snap_retailers(latitude)")
            connection.execute("CREATE TABLE IF NOT EXISTS snap_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            connection.execute("DELETE FROM snap_retailers")
            connection.execute("DELETE FROM snap_metadata")
            for row in reader:
                counts["rows_read"] += 1
                def value(key):
                    return (row.get(fields.get(key, "")) or "").strip()
                try:
                    identifier, name = value("recordid"), value("storename")
                    lat, lon = float(value("latitude")), float(value("longitude"))
                    if not identifier.isdigit() or int(identifier) <= 0 or not name:
                        raise ValueError("Missing identity")
                    if not math.isfinite(lat) or not math.isfinite(lon) or not -90 <= lat <= 90 or not -180 <= lon <= 180 or (lat == 0 and lon == 0):
                        raise ValueError("Invalid coordinates")
                    identifier = str(int(identifier))
                except (ValueError, TypeError):
                    counts["invalid_rows"] += 1
                    continue
                address = {"street": value("storestreetaddress"),
                           "additional": value("additonaladdress") or value("additionaladdress"),
                           "city": value("city"), "state": value("state"),
                           "zip_code": value("zipcode"), "zip4": value("zip4"), "county": value("county")}
                record = (identifier, name, value("storetype"), lat, lon, json.dumps(address))
                previous = connection.execute("SELECT * FROM snap_retailers WHERE record_id=?", (identifier,)).fetchone()
                if previous:
                    if previous != record:
                        raise ValueError(f"Conflicting duplicate SNAP record ID: {identifier}")
                    counts["duplicate_rows"] += 1
                    continue
                connection.execute("INSERT INTO snap_retailers VALUES (?, ?, ?, ?, ?, ?)", record)
                counts["imported"] += 1
            if counts["imported"] == 0:
                raise ValueError("No valid SNAP retailer records; existing snapshot was preserved.")
            metadata = {**counts, "retrieved_on": retrieved_on,
                        "imported_at": datetime.now(timezone.utc).isoformat(), "source_url": source_url,
                        "csv_sha256": digest.hexdigest(), "dataset_kind": "current_locator_export",
                        "source_data_as_of": None}
            connection.execute("INSERT INTO snap_metadata VALUES ('snapshot', ?)", (json.dumps(metadata),))
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()
    return metadata


def search_snap_retailers(latitude, longitude, radius_m=5000, *, db_path=DEFAULT_SNAP_DB):
    """Use a latitude index to narrow candidates, then exact Haversine distance."""
    validate_search(latitude, longitude, radius_m)
    path = Path(db_path).resolve()
    if not path.is_file():
        raise ValueError("SNAP database not found. First run python -m src.lib.location.snap --csv <current-export.csv>.")
    connection = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
    try:
        metadata_row = connection.execute("SELECT value FROM snap_metadata WHERE key='snapshot'").fetchone()
        if not metadata_row:
            raise ValueError("SNAP database has no snapshot metadata; reimport the CSV.")
        metadata = json.loads(metadata_row[0])
        delta = math.degrees(radius_m / 6371008.8)
        rows = connection.execute("SELECT * FROM snap_retailers WHERE latitude BETWEEN ? AND ?", (latitude - delta, latitude + delta))
        places = []
        for identifier, name, retailer_type, lat, lon, address_text in rows:
            distance = distance_meters(latitude, longitude, lat, lon)
            if distance > radius_m:
                continue
            address = json.loads(address_text)
            places.append({"place_id": f"usda_snap:{identifier}", "record_id": identifier,
                           "name": name, "retailer_type": retailer_type, "source": "USDA SNAP Retailer Locator",
                           "latitude": lat, "longitude": lon, "distance_m": distance,
                           "distance_miles": distance / 1609.344, "address_parts": address,
                           "address": ", ".join(address[k] for k in ("street", "additional", "city", "state", "zip_code") if address[k]),
                           "snap_status": "listed_in_current_locator_export", "retrieved_on": metadata["retrieved_on"],
                           "snap_acceptance_verified_live": False, "inventory_verified": False,
                           "free_food": False, "source_url": SOURCE_URL})
    except sqlite3.DatabaseError:
        raise ValueError("Invalid SNAP database; import a current CSV again.") from None
    finally:
        connection.close()
    places.sort(key=lambda place: (place["distance_m"], place["place_id"]))
    return {"snap_retailers": places, "snap_snapshot": metadata,
            "snap_limitations": ["SNAP retailers sell food and accept benefits according to the source snapshot; they are not free-food services.",
                                 "Retrieval date is not an authorization guarantee or source update date. Verify SNAP acceptance before visiting.",
                                 "Source lists can overlap; canonical locations merge only strong identity matches and flag uncertain duplicates."]}


def main():
    parser = argparse.ArgumentParser(description="Import a CURRENT USDA SNAP retailer CSV into local SQLite (no API key).")
    parser.add_argument("--csv", required=True, type=Path)
    parser.add_argument("--db", type=Path, default=DEFAULT_SNAP_DB)
    parser.add_argument("--retrieved-on", help="YYYY-MM-DD when you downloaded the export; defaults to today")
    parser.add_argument("--source-url", default=CSV_URL)
    args = parser.parse_args()
    try:
        print(json.dumps(import_snap_csv(args.csv, args.db, retrieved_on=args.retrieved_on, source_url=args.source_url), indent=2))
    except (ValueError, OSError, sqlite3.DatabaseError, csv.Error) as error:
        parser.exit(1, f"SNAP import failed: {error}\n")


if __name__ == "__main__":
    main()
