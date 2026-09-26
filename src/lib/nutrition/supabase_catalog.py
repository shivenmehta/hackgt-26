"""Read-only Supabase foods loader. Credentials never appear in output or URLs."""
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener

PROJECT_ROOT = Path(__file__).resolve().parents[3]


def read_env_file(path):
    """Read simple KEY=value entries; process environment takes precedence later."""
    values = {}
    if not Path(path).exists():
        return values
    for line in Path(path).read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        name, separator, value = line.partition("=")
        if not separator:
            continue
        value = value.strip()
        if value.startswith(("'", '"')):
            end = value.find(value[0], 1)
            if end < 0:
                raise ValueError("Unclosed quote in environment file.")
            value = value[1:end]
        else:
            value = value.split(" #", 1)[0].strip()
        values[name.strip()] = value
    return values


class _NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _get_page(url, key, offset, page_size):
    query = urlencode({"select": "fdc_id,source_record", "order": "fdc_id.asc",
                       "limit": page_size, "offset": offset})
    headers = {"apikey": key, "Prefer": "count=exact", "Accept": "application/json"}
    if key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {key}"
    request = Request(f"{url}/rest/v1/foods?{query}", headers=headers, method="GET")
    try:
        with build_opener(_NoRedirects()).open(request, timeout=30) as response:
            rows = json.load(response)
            total_text = response.headers.get("Content-Range", "").rsplit("/", 1)[-1]
    except HTTPError as error:
        raise RuntimeError(f"Supabase read failed (HTTP {error.code}); check the key, table and SELECT permissions.") from None
    except (URLError, TimeoutError, OSError):
        raise RuntimeError("Supabase connection failed; check network access and configured URL.") from None
    if not isinstance(rows, list) or not total_text.isdigit():
        raise ValueError("Supabase returned invalid rows or omitted the exact visible count.")
    return rows, int(total_text)


def load_supabase_foods(env_path=None, page_size=100):
    """Fetch every visible foods row, ordered by FDC ID, using SELECT only.

    Uses source_record instead of denormalized calories, preserving KNN's energy
    preference and estimate opt-in. An empty visible catalog is an explicit error.
    """
    if type(page_size) is not int or not 1 <= page_size <= 1000:
        raise ValueError("page_size must be an integer between 1 and 1000.")
    config = {**read_env_file(env_path or PROJECT_ROOT / ".env.local"), **os.environ}
    url = config.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    key = config.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
    parsed = urlsplit(url)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username
            or parsed.password or parsed.query or parsed.fragment or parsed.path):
        raise ValueError("Set NEXT_PUBLIC_SUPABASE_URL to the HTTPS project origin.")
    if not key or key == "your-publishable-key":
        raise ValueError("Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.")
    records = []
    seen_ids = set()
    total = None
    while total is None or len(records) < total:
        rows, visible_count = _get_page(url, key, len(records), page_size)
        if total is not None and total != visible_count:
            raise ValueError("Food count changed during pagination; retry on a stable catalog.")
        total = visible_count
        if not rows:
            raise ValueError("No food rows returned before completion; check table contents and SELECT/RLS access.")
        for row in rows:
            if not isinstance(row, dict):
                raise ValueError("Invalid food row.")
            record = row.get("source_record")
            food = record.get("food") if isinstance(record, dict) else None
            if not isinstance(food, dict):
                raise ValueError("Missing USDA source_record.food.")
            fdc_id = row.get("fdc_id")
            nutrients = food.get("foodNutrients")
            if (type(fdc_id) is not int or fdc_id <= 0 or fdc_id in seen_ids
                    or food.get("fdcId") != fdc_id or food.get("dataType") != "Foundation"
                    or not isinstance(record.get("name"), str)
                    or not isinstance(food.get("description"), str)
                    or not isinstance(nutrients, list)
                    or any(not isinstance(n, dict) or any(not isinstance(n.get(field), str)
                           for field in ("number", "name", "unitName")) for n in nutrients)):
                raise ValueError("Invalid, duplicate, or mismatched USDA food row.")
            seen_ids.add(fdc_id)
            records.append(record)
        if len(records) > total:
            raise ValueError("Received more foods than the reported count.")
    return records
