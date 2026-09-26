"""Stable two-category UI contract over reconciled locations."""

CATEGORY_LABELS = {
    "general_food_resources": "General food resources",
    "snap_and_assistance": "SNAP & food assistance",
}


def group_for_ui(locations):
    """Each canonical location appears once; assistance/SNAP membership takes priority.

    This categorization is for display, not a claim of eligibility or free food.
    Source records, subtype labels and possible-duplicate flags remain available.
    """
    groups = {key: [] for key in CATEGORY_LABELS}
    for location in locations:
        memberships = set(location.get("source_groups", []))
        labels = []
        if "community_events" in memberships:
            labels.append("Community giveaway — host reported")
        if "snap_retailers" in memberships or location.get("snap_listed"):
            labels.append("SNAP retailer — paid groceries")
        explicit_assistance = bool(memberships & {"food_assistance", "feedam_resources"})
        if explicit_assistance:
            labels.append("Food assistance listing — verify services")
        if "potential_assistance" in memberships and not explicit_assistance:
            labels.append("Potential assistance — food services unverified")
        if "nearby_food_access" in memberships:
            labels.append("Grocery / convenience store")
        if "alternative_food_retail" in memberships:
            labels.append("Market / farm shop — verify food sales")
        assistance = bool(memberships & {"community_events", "snap_retailers", "food_assistance", "feedam_resources", "potential_assistance"}) or location.get("snap_listed", False)
        category = "snap_and_assistance" if assistance else "general_food_resources"
        groups[category].append({**location, "ui_category": category, "service_labels": labels})
    for places in groups.values():
        places.sort(key=lambda place: (place["distance_m"], place["place_id"]))
    return groups
