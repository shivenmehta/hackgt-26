"""Load reviewed Foundation foods, excluding experimental JSON files."""

import json
from pathlib import Path


def load_foundation_foods(root=None):
    """Default data path is relative to this module, not the working directory."""
    root = Path(root) if root is not None else Path(__file__).resolve().parents[3] / "data/usda"
    root = root.resolve()
    manifest = json.loads((root / "foundation-manifest.json").read_text(encoding="utf-8"))
    if not isinstance(manifest, list):
        raise ValueError("Expected a catalog manifest array.")
    records = []
    seen_ids = set()
    for entry in manifest:
        if not isinstance(entry, dict) or not isinstance(entry.get("file"), str):
            raise ValueError("Invalid catalog manifest entry.")
        path = (root / entry["file"]).resolve()
        if not path.is_relative_to(root / "foundation") or path.suffix != ".json":
            raise ValueError("Catalog entry must be a Foundation JSON file.")
        record = json.loads(path.read_text(encoding="utf-8"))
        food = record.get("food") if isinstance(record, dict) else None
        if not isinstance(food, dict):
            raise ValueError(f"Invalid Foundation record: {entry['file']}")
        nutrients = food.get("foodNutrients")
        fdc_id = food.get("fdcId")
        if (not isinstance(record.get("name"), str)
                or type(fdc_id) is not int or fdc_id <= 0
                or fdc_id != entry.get("fdcId") or fdc_id in seen_ids
                or food.get("dataType") != "Foundation"
                or not isinstance(food.get("description"), str)
                or not isinstance(nutrients, list)
                or any(not isinstance(n, dict) or any(not isinstance(n.get(field), str)
                       for field in ("number", "name", "unitName")) for n in nutrients)):
            raise ValueError(f"Invalid Foundation record: {entry['file']}")
        seen_ids.add(fdc_id)
        records.append(record)
    return records
