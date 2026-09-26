"""Explainable nutrient nearest neighbors using only Python's standard library.

Targets describe one food portion, not an entire day's requirements.
See README.md for units, scientific scope, and a runnable example.
"""

import math
import statistics

# USDA nutrient numbers, in preference order, and the canonical output unit.
NUTRIENTS = {
    "energy": (("958", "957", "208"), "KCAL"),
    "protein": (("203",), "G"),
    "carbohydrates": (("205",), "G"),
    "fat": (("204",), "G"),
    "fiber": (("291",), "G"),
    "sodium": (("307",), "MG"),
    "saturated_fat": (("606",), "G"),
    "calcium": (("301",), "MG"),
    "iron": (("303",), "MG"),
    "potassium": (("306",), "MG"),
    "vitamin_d": (("328",), "UG"),
}


def _nonnegative(value):
    """Reject missing values, booleans, negative amounts, NaN and infinity."""
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def _positive(value):
    return _nonnegative(value) and value > 0


def _convert(amount, source_unit, target_unit):
    unit = source_unit.upper().replace("Μ", "U").replace("µ", "U")
    if unit == target_unit:
        return amount
    if unit == "KJ" and target_unit == "KCAL":
        return amount / 4.184
    grams = {"G": 1, "MG": 0.001, "UG": 0.000001}
    if unit in grams and target_unit in grams:
        return amount * grams[unit] / grams[target_unit]
    return None


def extract_nutrients(record, allow_estimated_energy=False):
    """Extract known nutrient amounts per 100 g; absent keys mean unknown."""
    nutrients = {}
    warnings = []
    for key, (numbers, unit) in NUTRIENTS.items():
        for number in numbers:
            values = []
            for entry in record["food"]["foodNutrients"]:
                if entry["number"] != number or not _nonnegative(entry.get("amount")):
                    continue
                value = _convert(entry["amount"], entry["unitName"], unit)
                if value is not None and math.isfinite(value):
                    values.append(value)
            if not values:
                continue
            if any(abs(value - values[0]) > 1e-9 for value in values):
                warnings.append(f"Conflicting values for {key} ({number}); unknown.")
                break
            nutrients[key] = values[0]
            break  # Prefer specific Atwater, then general, then legacy; never sum.

    estimate = None
    fallback = record.get("nutritionFallbacks", {}).get("energy")
    if ("energy" not in nutrients and allow_estimated_energy and fallback
            and fallback.get("isEstimate") is True
            and fallback.get("basisGrams") == 100
            and _nonnegative(fallback.get("amount"))):
        value = _convert(fallback["amount"], fallback["unitName"], "KCAL")
        if value is not None and math.isfinite(value):
            nutrients["energy"] = value
            estimate = fallback
            warnings.append("Energy is an estimate from a different USDA food record.")
    return {"nutrients": nutrients, "warnings": warnings, "energy_estimate": estimate}


def _validate_query(targets, k, portion_grams, limits):
    if type(k) is not int or k < 1:
        raise ValueError("k must be a positive integer.")
    if not _positive(portion_grams):
        raise ValueError("portion_grams must be positive.")
    if not isinstance(targets, dict) or not targets:
        raise ValueError("Supply at least one nutrient target.")
    for key, goal in targets.items():
        if (key not in NUTRIENTS or not isinstance(goal, dict)
                or not _nonnegative(goal.get("amount"))
                or goal.get("mode", "target") not in ("target", "min", "max")
                or not _positive(goal.get("weight", 1))
                or ("scale" in goal and not _positive(goal["scale"]))):
            raise ValueError(f"Invalid target: {key}")
    if not isinstance(limits, dict):
        raise ValueError("limits must be a dictionary.")
    for key, bounds in limits.items():
        if (key not in NUTRIENTS or not isinstance(bounds, dict)
                or not ({"min", "max"} & bounds.keys())
                or any(not _nonnegative(bounds[b]) for b in ("min", "max") if b in bounds)
                or ("min" in bounds and "max" in bounds and bounds["min"] > bounds["max"])):
            raise ValueError(f"Invalid limit: {key}")


def find_nearest_foods(records, targets, *, k=5, portion_grams=100,
                       limits=None, excluded_fdc_ids=(), required_restrictions=(),
                       compatibility=None, allow_estimated_energy=False):
    """Return the k closest eligible foods and explanations for exclusions.

    targets example: {"protein": {"amount": 10, "mode": "min", "weight": 2}}
    modes: target = exact match, min = penalize shortfall, max = penalize excess.
    limits are hard constraints. Missing dietary compatibility fails closed.
    Nutrient keys and keyword arguments use Python snake_case; USDA JSON is unchanged.
    """
    limits = {} if limits is None else limits
    compatibility = {} if compatibility is None else compatibility
    _validate_query(targets, k, portion_grams, limits)

    # 1. Extract nutrient vectors and convert all foods to the same portion size.
    catalog = []
    seen_ids = set()
    for record in records:
        fdc_id = record["food"]["fdcId"]
        if type(fdc_id) is not int or fdc_id <= 0 or fdc_id in seen_ids:
            raise ValueError("Catalog must contain unique positive FDC IDs.")
        seen_ids.add(fdc_id)
        extracted = extract_nutrients(record, allow_estimated_energy)
        nutrients = {key: value * (portion_grams / 100)
                     for key, value in extracted["nutrients"].items()}
        if not all(math.isfinite(value) for value in nutrients.values()):
            raise ValueError("Portion nutrient amount overflow.")
        catalog.append({**extracted, "fdc_id": fdc_id, "name": record["name"],
                        "description": record["food"]["description"], "nutrients": nutrients})

    # 2. Fit scales BEFORE exclusions, so filters do not redefine nutrient importance.
    scales = {}
    warnings = []
    for key, goal in targets.items():
        if "scale" in goal:
            scales[key] = goal["scale"]
            continue
        values = [food["nutrients"][key] for food in catalog if key in food["nutrients"]]
        deviation = statistics.pstdev(values) if values else 0
        mean = statistics.mean(values) if values else 0
        scales[key] = deviation if deviation > 0 else max(abs(mean), 1)
        if deviation == 0:
            warnings.append(f"{key}: no variation; using mean magnitude or one unit as scale.")

    # 3. Apply hard constraints before measuring similarity.
    eligible = []
    excluded = []
    for food in catalog:
        reasons = []
        fdc_id = food["fdc_id"]
        if fdc_id in excluded_fdc_ids:
            reasons.append("Explicitly excluded.")
        for restriction in required_restrictions:
            if compatibility.get(fdc_id, {}).get(restriction) is not True:
                reasons.append(f"No verified compatibility: {restriction}")
        for key in targets:
            if key not in food["nutrients"]:
                reasons.append(f"Missing target nutrient: {key}")
        for key, bounds in limits.items():
            value = food["nutrients"].get(key)
            if value is None:
                reasons.append(f"Missing limit nutrient: {key}")
            elif (("min" in bounds and value < bounds["min"])
                  or ("max" in bounds and value > bounds["max"])):
                reasons.append(f"Outside hard limit: {key}")
        if reasons:
            excluded.append({"fdc_id": fdc_id, "name": food["name"], "reasons": reasons})
        else:
            eligible.append(food)

    # 4. Compute weighted, normalized Euclidean distance and take the nearest k.
    weight_sum = sum(goal.get("weight", 1) for goal in targets.values())
    if not math.isfinite(weight_sum):
        raise ValueError("Weight sum overflow.")
    matches = []
    for food in eligible:
        contributions = {}
        for key, goal in targets.items():
            error = food["nutrients"][key] - goal["amount"]
            if goal.get("mode") == "min":
                error = min(0, error)
            elif goal.get("mode") == "max":
                error = max(0, error)
            normalized_error = error / scales[key]
            contributions[key] = (goal.get("weight", 1) / weight_sum) * normalized_error * normalized_error
        distance = math.sqrt(sum(contributions.values()))
        if not math.isfinite(distance):
            raise ValueError("Distance overflow; check targets, weights and scales.")
        matches.append({**food, "distance": distance, "contributions": contributions})
    matches.sort(key=lambda food: (food["distance"], food["fdc_id"]))
    return {"matches": matches[:k], "excluded": excluded, "scales": scales,
            "warnings": warnings, "portion_grams": portion_grams,
            "eligible_count": len(eligible)}
