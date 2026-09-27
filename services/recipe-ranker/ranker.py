"""Stateless recipe nearest-neighbor ranking. All nutrition is per serving."""
from math import isfinite, sqrt
from statistics import pstdev

NUTRIENTS = ('calories', 'protein', 'fat', 'fiber', 'carbs')
CATEGORIES = ('breakfast', 'lunch', 'dinner')
PORTIONS = tuple(i / 4 for i in range(2, 9))


def nutrition(value):
    if not isinstance(value, dict) or set(value) != set(NUTRIENTS):
        raise ValueError('All five nutrient values are required.')
    for v in value.values():
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not isfinite(v) or v < 0 or v > 1e7:
            raise ValueError('Nutrients must be finite, nonnegative numbers.')
    return value


def rank(payload):
    if not isinstance(payload, dict) or payload.get('schemaVersion') != 1:
        raise ValueError('Unsupported schema version.')
    catalog = payload.get('catalog')
    eligible = payload.get('eligible')
    if not isinstance(catalog, list) or not 1 <= len(catalog) <= 1000 or not isinstance(eligible, list):
        raise ValueError('Invalid catalog or eligible recipes.')
    target = {k: v / 3 for k, v in nutrition(payload.get('dailyTargets')).items()}
    lookup = {}
    for row in catalog:
        recipe_id = row.get('id')
        if not isinstance(recipe_id, str) or not recipe_id or recipe_id in lookup:
            raise ValueError('Recipe IDs must be unique strings.')
        lookup[recipe_id] = nutrition(row.get('nutrition'))
    scales = {k: pstdev([n[k] for n in lookup.values()]) or 1.0 for k in NUTRIENTS}
    result = {c: [] for c in CATEGORIES}
    seen = set()
    for row in eligible:
        recipe_id = row.get('id')
        categories = row.get('categories')
        if recipe_id not in lookup or recipe_id in seen:
            raise ValueError('Eligible IDs must be unique and belong to the catalog.')
        if not isinstance(categories, list) or not categories or len(categories) != len(set(categories)) or any(c not in CATEGORIES for c in categories):
            raise ValueError('Invalid meal categories.')
        seen.add(recipe_id)
        options = []
        for portion in PORTIONS:
            deviations = {k: lookup[recipe_id][k] * portion - target[k] for k in NUTRIENTS}
            distance = sqrt(sum((deviations[k] / scales[k]) ** 2 for k in NUTRIENTS))
            options.append({'portion': portion, 'distance': distance, 'deviations': deviations})
        options.sort(key=lambda x: (x['distance'], abs(x['portion'] - 1), x['portion']))
        entry = {'id': recipe_id, **options[0], 'options': options}
        for category in categories:
            result[category].append(entry)
    for entries in result.values():
        entries.sort(key=lambda x: (x['distance'], x['id']))
    return {'schemaVersion': 1, 'scales': scales, 'rankings': result}
