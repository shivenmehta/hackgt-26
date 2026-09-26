"""Run from the repository root: python -m src.lib.nutrition.example"""

from .catalog import load_foundation_foods
from .knn import find_nearest_foods


def main():
    # Illustrative targets, not dietary recommendations. Edit these to experiment.
    targets = {
        "protein": {"amount": 10, "mode": "min", "weight": 2},
        "fiber": {"amount": 3, "mode": "min"},
        "sodium": {"amount": 100, "mode": "max"},
    }
    result = find_nearest_foods(
        load_foundation_foods(), targets, k=5, portion_grams=100,
        limits={"sodium": {"max": 300}},
    )
    for food in result["matches"]:
        print(f"{food['name']}: distance={food['distance']:.4f}")
        print({key: food["nutrients"][key] for key in targets})
    print(f"Eligible: {result['eligible_count']}; excluded: {len(result['excluded'])}")


if __name__ == "__main__":
    main()
