"use client";
import { useState } from "react";
import { CUISINES, type PreferenceDraft } from "@/lib/planner";
import { nutrientKeys, presets, type Level } from "@/lib/meal-planning/types";
export function CuisineDropdown({
  values,
  onToggle,
}: {
  values: PreferenceDraft["cuisines"];
  onToggle: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  return (
    <div className="cuisine-picker">
      <details>
        <summary>
          {values.length
            ? `${values.length} cuisines selected`
            : "All cuisines · choose your favorites"}
        </summary>
        <div className="cuisine-popover">
          <label htmlFor="cuisine-search">Search cuisines</label>
          <input
            id="cuisine-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search 21 cuisines…"
          />
          <div className="cuisine-options">
            {CUISINES.filter((c) =>
              c.toLowerCase().includes(search.toLowerCase()),
            ).map((c) => (
              <label key={c}>
                <input
                  type="checkbox"
                  checked={values.includes(c)}
                  onChange={() => onToggle(c)}
                />
                {c}
              </label>
            ))}
            {!CUISINES.some((c) =>
              c.toLowerCase().includes(search.toLowerCase()),
            ) && <p>No matching cuisines.</p>}
          </div>
        </div>
      </details>
      <div className="chips selected-cuisines">
        {values.map((c) => (
          <button
            type="button"
            className="chip chosen"
            key={c}
            onClick={() => onToggle(c)}
            aria-label={`Remove ${c}`}
          >
            {c}
            <span aria-hidden="true"> ×</span>
          </button>
        ))}
      </div>
    </div>
  );
}
export function NutrientControls({
  draft,
  onChange,
}: {
  draft: PreferenceDraft;
  onChange: (draft: PreferenceDraft) => void;
}) {
  const levels: Level[] = ["low", "medium", "high"];
  return (
    <fieldset className="nutrient-controls">
      <legend>Your nutrition preferences</legend>
      <p className="field-hint">
        Daily goals per person. These guide matching; actual meals will vary.
      </p>
      <div className="nutrient-sliders">
        {nutrientKeys.map((key) => {
          const level = draft.nutrientLevels?.[key] ?? "medium";
          return (
            <div className="nutrient-control" key={key}>
              <label htmlFor={`nutrient-${key}`}>
                {key === "carbs"
                  ? "Carbohydrates"
                  : key[0].toUpperCase() + key.slice(1)}
                <span>{level[0].toUpperCase() + level.slice(1)}</span>
              </label>
              <input
                id={`nutrient-${key}`}
                type="range"
                min="0"
                max="2"
                step="1"
                value={levels.indexOf(level)}
                aria-valuetext={level}
                onChange={(e) => {
                  const next = levels[Number(e.target.value)];
                  onChange({
                    ...draft,
                    nutrientLevels: {
                      calories: "medium",
                      protein: "medium",
                      fat: "medium",
                      fiber: "medium",
                      carbs: "medium",
                      ...draft.nutrientLevels,
                      [key]: next,
                    },
                    ...(key === "calories"
                      ? { dailyCalories: String(presets.calories[next]) }
                      : {}),
                  });
                }}
              />
              <div className="range-labels" aria-hidden="true">
                <span>Low</span>
                <span>Medium</span>
                <span>High</span>
              </div>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
