"""Offline unit and real-catalog tests: python -m unittest discover -s tests -v"""
import json
import tempfile
import unittest
from pathlib import Path

from src.lib.nutrition.catalog import load_foundation_foods
from src.lib.nutrition.knn import extract_nutrients, find_nearest_foods


def food(fdc_id, protein=None, sodium=None):
    return {"name": f"Food {fdc_id}", "food": {
        "fdcId": fdc_id, "description": f"Food {fdc_id}", "dataType": "Foundation",
        "foodNutrients": [
            {"number": "203", "name": "Protein", "amount": protein, "unitName": "G"},
            {"number": "307", "name": "Sodium", "amount": sodium, "unitName": "MG"},
        ],
    }}


class KnnTests(unittest.TestCase):
    def test_exact_match_ties_and_k(self):
        result = find_nearest_foods([food(3, 10), food(2, 5), food(1, 5)],
                                    {"protein": {"amount": 5}}, k=2)
        self.assertEqual([f["fdc_id"] for f in result["matches"]], [1, 2])
        self.assertEqual(result["matches"][0]["distance"], 0)

    def test_units_and_energy_preference(self):
        record = food(1, 5000)
        entries = record["food"]["foodNutrients"]
        entries[0]["unitName"] = "MG"
        entries.extend([
            {"number": "957", "name": "Energy", "amount": 120, "unitName": "KCAL"},
            {"number": "958", "name": "Energy", "amount": 418.4, "unitName": "KJ"},
            {"number": "328", "name": "Vitamin D", "amount": 3, "unitName": "µg"},
        ])
        vector = extract_nutrients(record)["nutrients"]
        self.assertEqual(vector["protein"], 5)
        self.assertAlmostEqual(vector["energy"], 100)
        self.assertEqual(vector["vitamin_d"], 3)

    def test_missing_invalid_and_conflicting_values_are_unknown(self):
        conflict = food(3, 4)
        conflict["food"]["foodNutrients"].append(
            {"number": "203", "name": "Protein", "amount": 9, "unitName": "G"})
        result = find_nearest_foods([food(1), food(2, 0), conflict, food(4, True), food(5, -1)],
                                    {"protein": {"amount": 0}})
        self.assertEqual([f["fdc_id"] for f in result["matches"]], [2])
        self.assertEqual(len(result["excluded"]), 4)
        self.assertTrue(extract_nutrients(conflict)["warnings"])

    def test_normalization(self):
        result = find_nearest_foods([food(1, 0, 1000), food(2, 10, 0)],
                                    {"protein": {"amount": 0}, "sodium": {"amount": 0}})
        self.assertEqual(result["scales"], {"protein": 5, "sodium": 500})
        self.assertEqual(result["matches"][0]["distance"], result["matches"][1]["distance"])

    def test_min_and_max_goals(self):
        result = find_nearest_foods([food(1, 20, 50), food(2, 10, 100), food(3, 5, 200)], {
            "protein": {"amount": 10, "mode": "min"},
            "sodium": {"amount": 100, "mode": "max"},
        })
        self.assertEqual([f["distance"] for f in result["matches"][:2]], [0, 0])
        self.assertGreater(result["matches"][2]["distance"], 0)

    def test_hard_limits_and_verified_restrictions(self):
        result = find_nearest_foods(
            [food(1, 10, 400), food(2, 10, 20), food(3, 10, 20), food(4, 10)],
            {"protein": {"amount": 10}}, limits={"sodium": {"max": 100}},
            required_restrictions=["vegan"],
            compatibility={1: {"vegan": True}, 2: {"vegan": True}, 4: {"vegan": True}},
        )
        self.assertEqual([f["fdc_id"] for f in result["matches"]], [2])
        self.assertEqual(len(result["excluded"]), 3)

    def test_portion_scaling(self):
        result = find_nearest_foods([food(1, 10, 100)], {"protein": {"amount": 5}},
                                    portion_grams=50, limits={"sodium": {"max": 50}})
        self.assertEqual(result["matches"][0]["nutrients"]["protein"], 5)
        self.assertEqual(result["matches"][0]["distance"], 0)

    def test_exclusions_do_not_change_scales(self):
        records = [food(1, 0), food(2, 10), food(3, 20)]
        targets = {"protein": {"amount": 0}}
        a = find_nearest_foods(records, targets)
        b = find_nearest_foods(records, targets, excluded_fdc_ids=[1])
        self.assertEqual(a["scales"], b["scales"])
        self.assertEqual(b["matches"][0]["fdc_id"], 2)

    def test_explicit_scales_and_weights(self):
        result = find_nearest_foods([food(1, 2, 4)], {
            "protein": {"amount": 0, "scale": 2, "weight": 3},
            "sodium": {"amount": 0, "scale": 2},
        })
        self.assertEqual(result["matches"][0]["contributions"], {"protein": 0.75, "sodium": 1})
        self.assertAlmostEqual(result["matches"][0]["distance"], 1.75 ** 0.5)

    def test_invalid_queries_and_empty_catalog(self):
        for targets in ({}, {"unknown": {"amount": 1}}, {"protein": {"amount": float("nan")}},
                        {"protein": {"amount": True}}, {"protein": {"amount": 1, "scale": 0}}):
            with self.subTest(targets=targets), self.assertRaises(ValueError):
                find_nearest_foods([], targets)
        targets = {"protein": {"amount": 1}}
        for kwargs in ({"k": 0}, {"k": True}, {"portion_grams": -1},
                       {"limits": {"sodium": {"min": 2, "max": 1}}}):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                find_nearest_foods([], targets, **kwargs)
        with self.assertRaises(ValueError):
            find_nearest_foods([food(1), food(1)], targets)
        self.assertEqual(find_nearest_foods([], targets)["matches"], [])

    def test_real_catalog_and_estimated_zero_energy(self):
        records = load_foundation_foods()
        self.assertEqual(len(records), 100)
        ids = {f["food"]["fdcId"] for f in records}
        self.assertEqual(len(ids), 100)
        self.assertNotIn(1104812, ids)
        salt = next(f for f in records if f["food"]["fdcId"] == 746775)
        self.assertNotIn("energy", extract_nutrients(salt)["nutrients"])
        estimate = extract_nutrients(salt, allow_estimated_energy=True)
        self.assertEqual(estimate["nutrients"]["energy"], 0)
        self.assertEqual(estimate["energy_estimate"]["source"]["fdcId"], 173468)
        broccoli = next(f for f in records if f["food"]["fdcId"] == 747447)
        amount = extract_nutrients(broccoli)["nutrients"]["protein"]
        result = find_nearest_foods(records, {"protein": {"amount": amount}}, k=100)
        match = next(f for f in result["matches"] if f["fdc_id"] == 747447)
        self.assertEqual(match["distance"], 0)
        self.assertEqual(result["eligible_count"] + len(result["excluded"]), 100)

    def test_loader_rejects_paths_outside_catalog(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "foundation-manifest.json").write_text(
                json.dumps([{"file": "../secret.json", "fdcId": 1}]), encoding="utf-8")
            with self.assertRaises(ValueError):
                load_foundation_foods(root)


if __name__ == "__main__":
    unittest.main()
