"""Private loopback HTTP adapter. Access it through the Next.js same-origin proxy."""
from collections import deque
from concurrent.futures import ThreadPoolExecutor
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import sqlite3
import threading
import time
from urllib.parse import urlsplit, parse_qs, unquote

from .events import DEFAULT_EVENTS_DB, create_event, cancel_event, get_event, geocode_address
from .nearby import search_sources
from .deduplicate import reconcile_locations
from .overpass import validate_search

DB = Path(os.environ.get("LOCATION_EVENTS_DB", DEFAULT_EVENTS_DB))
TOKEN = os.environ.get("LOCATION_SERVICE_TOKEN", "")
LOCK = threading.Lock()
REQUESTS = {"read": deque(), "write": deque()}
SLOTS = threading.BoundedSemaphore(8)


def limited(kind):
    """Global per-process bounds for the local/demo service (not spoofable by IP)."""
    now = time.monotonic()
    with LOCK:
        queue = REQUESTS[kind]
        while queue and queue[0] <= now - 60:
            queue.popleft()
        if len(queue) >= (20 if kind == "write" else 180):
            return True
        queue.append(now)
    return False


def nearby(query):
    lat, lon = float(query.get("lat", "")), float(query.get("lon", ""))
    radius = float(query.get("radius", "5000"))
    validate_search(lat, lon, radius)
    sources = query.get("sources", "osm,snap,feedam,events").split(",")
    if not sources or any(s not in ("osm", "snap", "feedam", "events") for s in sources):
        raise ValueError("Invalid food sources.")
    options = dict(events_db=DB, at=query.get("at"), event_window_hours=float(query.get("window", "24")))
    result = {"origin": {"latitude": lat, "longitude": lon}, "radius_m": radius,
              "distance_method": "straight_line_haversine", "limitations": [],
              "source_status": {}, "source_errors": []}
    # Slow external providers run independently; event reads stay local.
    with ThreadPoolExecutor(max_workers=4) as pool:
        jobs = [(source, pool.submit(search_sources, lat, lon, radius, sources=[source], **options))
                for source in dict.fromkeys(sources)]
        for source, job in jobs:
            try:
                part = job.result()
                for key, value in part.items():
                    if key in ("locations", "ui_categories", "deduplication", "ui_category_labels", "partial_results"):
                        continue
                    if key in ("source_status",):
                        result[key].update(value)
                    elif key in ("source_errors", "limitations"):
                        result[key].extend(value)
                    else:
                        result[key] = value
            except (ValueError, RuntimeError, OSError) as error:
                result["source_status"][source] = "error"
                # Do not expose internal file paths or response bodies.
                result["source_errors"].append(f"{source}: unavailable; try again later.")
    result["limitations"] = list(dict.fromkeys(result["limitations"]))
    result["partial_results"] = bool(result["source_errors"])
    result.update(reconcile_locations(result))
    return result


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Never log addresses, bodies or private management capabilities.

    def setup(self):
        super().setup()
        self.connection.settimeout(100)

    def respond(self, status, data):
        encoded = json.dumps(data, ensure_ascii=False, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        self.dispatch(False)

    def do_POST(self):
        self.dispatch(True)

    def dispatch(self, write):
        if not TOKEN or not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + TOKEN):
            self.respond(401, {"error": "Unauthorized service request."})
            return
        if limited("write" if write else "read") or not SLOTS.acquire(blocking=False):
            self.respond(429, {"error": "Too many requests. Please wait a minute and retry."})
            return
        try:
            parsed = urlsplit(self.path)
            path = unquote(parsed.path)
            query = {k: v[0] for k, v in parse_qs(parsed.query).items()}
            body = {}
            if write:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > 20000:
                    self.respond(413, {"error": "Request must contain at most 20 KB of JSON."})
                    return
                body = json.loads(self.rfile.read(length))
                if not isinstance(body, dict):
                    raise ValueError("Expected a JSON object.")
            if not write and path == "/health":
                self.respond(200, {"status": "ok"})
            elif not write and path == "/nearby":
                self.respond(200, nearby(query))
            elif write and path == "/geocode":
                self.respond(200, {"candidates": geocode_address(body.get("address"))})
            elif write and path == "/events":
                self.respond(201, create_event(body.get("event"), db_path=DB, request_id=body.get("request_id")))
            elif path.startswith("/events/"):
                identifier = path[len("/events/"):]
                if write and identifier.endswith("/cancel"):
                    identifier = identifier[:-len("/cancel")]
                    cancel_event(identifier, body.get("edit_token"), db_path=DB)
                    self.respond(200, {"cancelled": True})
                elif not write and "/" not in identifier:
                    event = get_event(identifier, db_path=DB)
                    self.respond(200 if event else 404, {"event": event} if event else {"error": "Event not found."})
                else:
                    self.respond(404, {"error": "Not found."})
            else:
                self.respond(404, {"error": "Not found."})
        except (ValueError, TypeError) as error:
            self.respond(400, {"error": str(error) if isinstance(error, ValueError) else "Invalid request fields."})
        except (RuntimeError, OSError, sqlite3.Error):
            self.respond(503, {"error": "Food service unavailable. Please retry shortly."})
        finally:
            SLOTS.release()


def main():
    if len(TOKEN) < 32:
        raise SystemExit("Set LOCATION_SERVICE_TOKEN to a private random value of at least 32 characters.")
    server = ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("LOCATION_SERVICE_PORT", "8765"))), Handler)
    print("Location service ready (loopback only).", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
