"""Manual live read-only check: python -m src.lib.nutrition.test_supabase"""
import json
from collections import Counter
from datetime import datetime, timezone

from .catalog import load_foundation_foods
from .knn import NUTRIENTS, extract_nutrients, find_nearest_foods
from .supabase_catalog import PROJECT_ROOT, load_supabase_foods


def main():
    records = load_supabase_foods()
    local = {r["food"]["fdcId"]: r for r in load_foundation_foods()}
    remote = {r["food"]["fdcId"]: r for r in records}
    coverage = Counter()
    for record in records:
        coverage.update(extract_nutrients(record)["nutrients"].keys())

    # Each food must retrieve itself at distance zero when queried with its own
    # available nutrient vector. Include all results to avoid cutting off ties.
    self_matches = 0
    for record in records:
        vector = extract_nutrients(record)["nutrients"]
        if not vector:
            continue
        result = find_nearest_foods(records, {key: {"amount": value} for key, value in vector.items()}, k=len(records))
        match = next((f for f in result["matches"] if f["fdc_id"] == record["food"]["fdcId"]), None)
        if match is None or match["distance"] != 0:
            raise ValueError("Live exact self-match check failed.")
        self_matches += 1

    scenarios = {
        "protein_fiber_low_sodium": {
            "targets": {"protein": {"amount": 10, "mode": "min", "weight": 2},
                        "fiber": {"amount": 3, "mode": "min"}, "sodium": {"amount": 100, "mode": "max"}},
            "limits": {"sodium": {"max": 300}},
        },
        "macro_target": {"targets": {"protein": {"amount": 15},
                         "carbohydrates": {"amount": 20}, "fat": {"amount": 5}}},
        "energy_target_native": {"targets": {"energy": {"amount": 150}}},
        "energy_target_estimates_allowed": {"targets": {"energy": {"amount": 150}}, "allow_estimated_energy": True},
        "unverified_vegan": {"targets": {"protein": {"amount": 10}}, "required_restrictions": ["vegan"]},
    }
    results = {}
    for name, query in scenarios.items():
        result = find_nearest_foods(records, **query)
        if result["eligible_count"] + len(result["excluded"]) != len(records):
            raise ValueError("Live result accounting failed.")
        if name == "unverified_vegan" and result["matches"]:
            raise ValueError("Unverified restriction was not enforced.")
        if name == "protein_fiber_low_sodium" and any(f["nutrients"]["sodium"] > 300 for f in result["matches"]):
            raise ValueError("Hard sodium limit was not enforced.")
        results[name] = result
        print(f"{name}: {result['eligible_count']} eligible; {len(result['excluded'])} excluded")
        for match in result["matches"][:3]:
            print(f"  {match['name']}: distance {match['distance']:.4f}")
    report = {
        "checked_at": datetime.now(timezone.utc).isoformat(), "visible_food_count": len(records),
        "local_food_count": len(local), "missing_local_ids_in_database": sorted(local.keys() - remote.keys()),
        "extra_database_ids": sorted(remote.keys() - local.keys()),
        "source_records_different_from_local": sorted(i for i in local.keys() & remote.keys() if local[i] != remote[i]),
        "exact_self_matches_passed": self_matches,
        "native_nutrient_coverage": {key: coverage[key] for key in NUTRIENTS},
        "basis_grams": 100, "scenarios": results,
        "note": "Illustrative targets, not dietary recommendations. Source JSON uses KNN energy preference, not database calorie columns.",
    }
    output = PROJECT_ROOT / "test-results"
    output.mkdir(exist_ok=True)
    (output / "supabase-foods.json").write_text(json.dumps(records, indent=2, allow_nan=False), encoding="utf-8")
    (output / "supabase-knn-report.json").write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    print(f"Read {len(records)} foods; {self_matches} exact self-matches passed.")
    print("Native nutrient coverage:", report["native_nutrient_coverage"])
    print("Local comparison:", {key: report[key] for key in ("missing_local_ids_in_database", "extra_database_ids", "source_records_different_from_local")})
    print("Saved food snapshot and KNN report under test-results/ (gitignored).")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError) as error:
        print(str(error))
        raise SystemExit(1) from None
