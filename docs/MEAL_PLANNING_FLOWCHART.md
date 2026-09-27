# Meal-planning backend

Each request runs through Next.js and Vercel Workflow using prepared MealDB
recipes, Grok nutrition estimates, serving yields, and dietary metadata.

```mermaid
flowchart TD
    A["Validate preferences and create private job"] --> B["Load prepared recipe catalog"]
    B --> C["Parse notes with Grok; enforce cuisine, diet, and allergen filters"]
    C --> D["Python KNN: rank meals and portions by nutrition targets"]
    D --> E["Shortlist top 20 per category: breakfast, lunch, dinner"]
    E --> F["Find nearby Kroger or use Atlanta reference store"]
    F --> G["Price unique ingredients: cache, Kroger, then Grok estimates"]
    G --> H["Calculate recipe costs; exclude meals with missing prices"]
    H --> I["Grok selects 21 meals and portions"]
    I --> J["Validate; retry once, then deterministic fallback if needed"]
    J --> K["Adjust for budget and scale quantities for household"]
    K --> L["Save plan and rankings; return results"]
    L -.-> M["Generate and cache images without blocking the plan"]
```

- KNN compares calories, protein, fat, fiber, and carbohydrates using standardized
  Euclidean distance, testing portions from 0.5 to 2 servings per person.
- Budget adjustments and replacements use priced shortlisted meals. Costs reflect
  ingredients consumed, not grocery checkout totals. Unavoidable overages are shown.
- No suitable or fully priced options produces an actionable error. Dietary
  restrictions are never relaxed; missing breakfasts may use labeled main meals.
- Saved rankings support replacements. MealDB images remain available while
  optional generated images are pending.

Source: [workflow](../src/lib/meal-planning/workflow.ts) and
[pipeline steps](../src/lib/meal-planning/pipeline.ts).
