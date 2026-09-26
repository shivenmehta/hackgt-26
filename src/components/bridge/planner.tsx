"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@chakra-ui/react";
import Link from "next/link";
import Community from "@/components/location/community";
import {
  ALLERGENS,
  CUISINES,
  DIETS,
  initialDraft,
  validatePreferences,
  parsePreferences,
  buildSamplePlan,
  money,
  perServingCents,
  type PreferenceDraft,
  type InputKey,
  type PlannedMeal,
  type WeeklyPlan,
} from "@/lib/planner";
import { sampleRecipes } from "@/lib/sample-recipes";
import { BridgeMark, FoodArt } from "./food-art";

function Arrow() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 12h14m-5-5 5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
const dateObject = (date: string) => new Date(`${date}T12:00:00`);
const dateLabel = (date: string, options: Intl.DateTimeFormatOptions) =>
  dateObject(date).toLocaleDateString("en-US", options);

export default function Planner() {
  const [tab, setTab] = useState<"planner" | "community">("planner");
  const [draft, setDraft] = useState<PreferenceDraft>({ ...initialDraft });
  const [errors, setErrors] = useState<Partial<Record<InputKey, string>>>({});
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [editing, setEditing] = useState(true);
  const [activeDay, setActiveDay] = useState(0);
  const [selected, setSelected] = useState<{
    meal: PlannedMeal;
    date: string;
  } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const focusHeading = () =>
    requestAnimationFrame(() => heading.current?.focus());
  function update(key: InputKey | "notes", value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
    if (key !== "notes") setErrors((e) => ({ ...e, [key]: undefined }));
  }
  function toggle(key: "diets" | "allergens" | "cuisines", value: string) {
    setDraft((d) => {
      const values = d[key] as string[];
      return {
        ...d,
        [key]: values.includes(value)
          ? values.filter((v) => v !== value)
          : [...values, value],
      };
    });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const issues = validatePreferences(draft);
    setErrors(issues);
    if (Object.keys(issues).length) {
      const key = (
        ["budget", "location", "people", "meals", "age", "bmi"] as const
      ).find((k) => issues[k]);
      form.current?.querySelector<HTMLInputElement>(`[name="${key}"]`)?.focus();
      return;
    }
    setPlan(buildSamplePlan(parsePreferences(draft), sampleRecipes));
    setEditing(false);
    setActiveDay(0);
    focusHeading();
  }
  function edit() {
    setEditing(true);
    focusHeading();
  }
  function field(
    key: InputKey,
    label: string,
    props: {
      type?: string;
      placeholder?: string;
      prefix?: string;
      hint?: string;
    } = {},
  ) {
    return (
      <div className="field">
        <label htmlFor={key}>
          {label}
          <span className="required" aria-hidden="true">
            {" "}
            *
          </span>
        </label>
        <div className={`input-wrap ${errors[key] ? "invalid" : ""}`}>
          {props.prefix && <span className="input-prefix">{props.prefix}</span>}
          <input
            id={key}
            name={key}
            type={props.type ?? "number"}
            step={["budget", "bmi"].includes(key) ? "any" : "1"}
            min={props.type === "text" ? undefined : "0"}
            required
            value={draft[key]}
            placeholder={props.placeholder}
            onChange={(e) => update(key, e.target.value)}
            aria-invalid={!!errors[key]}
            aria-describedby={
              errors[key]
                ? `${key}-error`
                : props.hint
                  ? `${key}-hint`
                  : undefined
            }
          />
        </div>
        {errors[key] ? (
          <p className="field-error" id={`${key}-error`}>
            {errors[key]}
          </p>
        ) : (
          props.hint && (
            <p className="field-hint" id={`${key}-hint`}>
              {props.hint}
            </p>
          )
        )}
      </div>
    );
  }
  function chips(
    key: "diets" | "allergens" | "cuisines",
    options: readonly string[],
  ) {
    return (
      <div className="chips">
        {options.map((option) => (
          <button
            type="button"
            key={option}
            className={`chip ${draft[key].includes(option as never) ? "chosen" : ""}`}
            aria-pressed={draft[key].includes(option as never)}
            onClick={() => toggle(key, option)}
          >
            <span className="chip-indicator" aria-hidden="true">
              {draft[key].includes(option as never) ? "✓" : "+"}
            </span>
            {option}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="bridge">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" href="/" aria-label="Bridge home">
            <BridgeMark />
            bridge<span className="brand-period">.</span>
          </Link>
          <nav aria-label="Main navigation">
            <button
              className={tab === "planner" ? "nav-active" : ""}
              aria-current={tab === "planner" ? "page" : undefined}
              onClick={() => {
                setTab("planner");
                focusHeading();
              }}
            >
              Weekly planner
            </button>
            <button
              className={tab === "community" ? "nav-active" : ""}
              aria-current={tab === "community" ? "page" : undefined}
              onClick={() => {
                setTab("community");
                focusHeading();
              }}
            >
              Community
            </button>
          </nav>
          <span className="header-note">
            <span /> A little more within reach
          </span>
        </div>
      </header>
      <main id="main" className="page-shell">
        {tab === "community" ? (
          <>
            <Community />
            <button
              className="location-secondary"
              onClick={() => {
                setTab("planner");
                focusHeading();
              }}
            >
              Back to weekly planner
            </button>
          </>
        ) : editing ? (
          <>
            <div className="page-intro">
              <div>
                <div className="breadcrumb">
                  Your kitchen. Your budget. Your week.
                </div>
                <h1 ref={heading} tabIndex={-1}>
                  Tell us about your week.
                </h1>
                <p className="intro-copy">
                  Food you enjoy, with a little less figuring it all out.
                </p>
              </div>
              <button
                className="text-button example-button"
                onClick={() => {
                  setDraft({
                    ...initialDraft,
                    location: "Atlanta, GA",
                    age: "24",
                    bmi: "22",
                  });
                  setErrors({});
                }}
              >
                Use example preferences
              </button>
            </div>
            <div className="setup-layout">
              <form
                ref={form}
                onSubmit={submit}
                noValidate
                className="preferences-form"
              >
                <section className="form-section">
                  <div className="section-heading">
                    <h2>Make room at the table</h2>
                    <span>All fields marked * are required</span>
                  </div>
                  <p className="section-copy">
                    Start with the everyday details. You can change them
                    anytime.
                  </p>
                  <div className="field-grid">
                    {field("budget", "Weekly food budget", {
                      prefix: "$",
                      hint: "Estimated cost of ingredients used, in USD.",
                    })}
                    {field("location", "Where are you planning?", {
                      type: "text",
                      placeholder: "City or ZIP code",
                      hint: "Location won’t change prices in this demo.",
                    })}
                    {field("people", "People to feed", {
                      hint: "Including you.",
                    })}
                    <div className="field">
                      <label htmlFor="meals">
                        Meals per day <span className="required">*</span>
                      </label>
                      <div className="input-wrap">
                        <select
                          id="meals"
                          name="meals"
                          value={draft.meals}
                          onChange={(e) => update("meals", e.target.value)}
                          required
                          aria-invalid={!!errors.meals}
                          aria-describedby={
                            errors.meals ? "meals-error" : undefined
                          }
                        >
                          {[1, 2, 3, 4, 5, 6].map((n) => (
                            <option key={n} value={n}>
                              {n} {n === 1 ? "meal" : "meals"}
                            </option>
                          ))}
                        </select>
                      </div>
                      {errors.meals && (
                        <p className="field-error" id="meals-error">
                          {errors.meals}
                        </p>
                      )}
                      <p className="field-hint">
                        We’ll make space for each one.
                      </p>
                    </div>
                  </div>
                </section>
                <section className="form-section">
                  <h2>What feels like your kind of food?</h2>
                  <p className="section-copy">
                    Keep the things you love. Leave out the things you don’t.
                  </p>
                  <fieldset>
                    <legend>
                      Dietary preferences <span>Optional</span>
                    </legend>
                    {chips("diets", DIETS)}
                  </fieldset>
                  <fieldset>
                    <legend>
                      Allergens to avoid <span>Optional</span>
                    </legend>
                    {chips("allergens", ALLERGENS)}
                    <p className="field-hint">
                      Filters use sample recipe tags, not verified product
                      allergen labels.
                    </p>
                  </fieldset>
                  <fieldset>
                    <legend>
                      Favorite cuisines <span>Optional</span>
                    </legend>
                    {chips("cuisines", CUISINES)}
                    <p className="field-hint">
                      Choose a few, or leave open for a mix of everything.
                    </p>
                  </fieldset>
                </section>
                <section className="form-section">
                  <h2>A little about you</h2>
                  <p className="section-copy">
                    Collected for the profile preview. Age and BMI do not set
                    nutrition targets here.
                  </p>
                  <div className="field-grid personal-fields">
                    {field("age", "Age", { placeholder: "Years" })}
                    {field("bmi", "BMI", { placeholder: "e.g. 22.5" })}
                  </div>
                  <div className="field notes-field">
                    <label htmlFor="notes">
                      Anything else we should know?{" "}
                      <span className="optional">Optional</span>
                    </label>
                    <textarea
                      id="notes"
                      name="notes"
                      rows={3}
                      value={draft.notes}
                      onChange={(e) => update("notes", e.target.value)}
                      placeholder="I have 20 minutes to cook, love spicy food, and already have rice…"
                    />
                    <p className="field-hint">
                      Saved while this page is open. Interpreting these notes is
                      coming later.
                    </p>
                  </div>
                </section>
                <div className="form-submit">
                  <p>
                    <strong>
                      A plan to explore, not a final grocery bill.
                    </strong>
                    <br />
                    Sample meals, illustrative prices. Your information stays on
                    this page.
                  </p>
                  <Button unstyled type="submit" className="primary-button">
                    Build my week <Arrow />
                  </Button>
                </div>
              </form>
              <aside className="setup-aside">
                <div className="preview-panel">
                  <div className="preview-heading">
                    <span className="status-pill">A taste of what’s ahead</span>
                    <span className="preview-spark" aria-hidden="true">
                      ✳
                    </span>
                  </div>
                  <h2>
                    Seven days.
                    <br />
                    One less thing
                    <br />
                    on your plate.
                  </h2>
                  <div className="hero-plate">
                    <FoodArt />
                  </div>
                  <div className="preview-meals">
                    <div>
                      <span className="meal-dot slot-0" />
                      Breakfast<span>Apple cinnamon oats</span>
                    </div>
                    <div>
                      <span className="meal-dot slot-1" />
                      Lunch<span>Lemony chickpea bowl</span>
                    </div>
                    <div>
                      <span className="meal-dot slot-2" />
                      Dinner<span>Sweet potato tacos</span>
                    </div>
                  </div>
                  <p className="preview-caption">
                    An example day. Your selections shape the mix.
                  </p>
                </div>
                <div className="how-it-works">
                  <h3>Simple by design</h3>
                  <p>
                    <span>✓</span>A full week, all in one place
                  </p>
                  <p>
                    <span>✓</span>Recipes with clear ingredient quantities
                  </p>
                  <p>
                    <span>✓</span>Costs and nutrition you can inspect
                  </p>
                </div>
                <div className="small-note">
                  Built for real life. Room for leftovers, familiar favorites,
                  and a little variety.
                </div>
              </aside>
            </div>
          </>
        ) : (
          plan && (
            <>
              <div className="page-intro plan-intro">
                <div>
                  <div className="breadcrumb">
                    Weekly planner <span>/</span> Your sample plan
                  </div>
                  <h1 ref={heading} tabIndex={-1}>
                    A week at your table.
                  </h1>
                  <p className="intro-copy">
                    {plan.preferences.people}{" "}
                    {plan.preferences.people === 1 ? "person" : "people"} ·{" "}
                    {plan.preferences.meals} meals a day ·{" "}
                    {plan.preferences.location}
                  </p>
                </div>
                <Button unstyled className="secondary-button" onClick={edit}>
                  Edit preferences
                </Button>
              </div>
              <div className="demo-banner">
                <span className="demo-tag">Demo plan</span>
                <p>
                  Sample recipes and nutrition. Prices estimate ingredients
                  used, not whole packages or live local prices.
                </p>
              </div>
              {!plan.days.length ? (
                <div className="empty-plan">
                  <FoodArt />
                  <h2>No matching sample meals yet</h2>
                  <p>
                    Our small sample collection doesn’t cover this combination.
                    Edit your selections, or wait for a larger recipe
                    collection. Your restrictions haven’t been relaxed.
                  </p>
                  <Button unstyled className="primary-button" onClick={edit}>
                    Edit preferences
                  </Button>
                </div>
              ) : (
                <>
                  <div className="week-toolbar">
                    <div>
                      <h2>
                        {dateLabel(plan.days[0].date, {
                          month: "long",
                          day: "numeric",
                        })}
                        –
                        {dateLabel(plan.days[6].date, {
                          day: "numeric",
                          month: "short",
                        })}
                      </h2>
                      <p>Tap a meal to see what goes into it.</p>
                    </div>
                    <div className="budget-summary">
                      <div>
                        <span>Estimated week</span>
                        <strong>{money(plan.totalCents)}</strong>
                      </div>
                      <span className="budget-divider">/</span>
                      <div>
                        <span>Your budget</span>
                        <strong>
                          {money(Math.round(plan.preferences.budget * 100))}
                        </strong>
                      </div>
                      <span
                        className={`budget-status ${plan.totalCents > plan.preferences.budget * 100 ? "over-budget" : ""}`}
                      >
                        {money(
                          Math.abs(
                            Math.round(plan.preferences.budget * 100) -
                              plan.totalCents,
                          ),
                        )}{" "}
                        {plan.totalCents > plan.preferences.budget * 100
                          ? "over budget"
                          : "remaining"}
                      </span>
                    </div>
                  </div>
                  {plan.totalCents > plan.preferences.budget * 100 && (
                    <p className="overage-note" role="status">
                      This sample plan exceeds your budget. Edit your
                      preferences to explore a different plan; the demo does not
                      optimize costs.
                    </p>
                  )}
                  <div className="mobile-days" aria-label="Choose a day">
                    {plan.days.map((day, i) => (
                      <button
                        key={day.date}
                        aria-pressed={activeDay === i}
                        onClick={() => setActiveDay(i)}
                        className={activeDay === i ? "active" : ""}
                      >
                        <span>{dateLabel(day.date, { weekday: "short" })}</span>
                        <strong>{dateObject(day.date).getDate()}</strong>
                      </button>
                    ))}
                  </div>
                  <div className="week-board">
                    {plan.days.map((day, i) => (
                      <section
                        key={day.date}
                        className={`day-column ${activeDay === i ? "selected-day" : ""}`}
                        aria-label={dateLabel(day.date, {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        })}
                      >
                        <div className="day-heading">
                          <h3>{dateLabel(day.date, { weekday: "short" })}</h3>
                          <span>{dateObject(day.date).getDate()}</span>
                        </div>
                        {day.meals.map((meal) => (
                          <button
                            key={meal.id}
                            className={`meal-card slot-${meal.slotIndex % 3}`}
                            onClick={() =>
                              setSelected({ meal, date: day.date })
                            }
                            aria-label={`${meal.slot}, ${meal.recipe.name}, ${money(perServingCents(meal.recipe))} per serving`}
                          >
                            <span className="meal-slot">{meal.slot}</span>
                            <FoodArt
                              kind={meal.recipe.art}
                              variant={i + meal.slotIndex}
                            />
                            <h4>{meal.recipe.name}</h4>
                            <div className="meal-card-bottom">
                              <span>
                                {money(perServingCents(meal.recipe))}
                                <small> / serving</small>
                              </span>
                              <span aria-hidden="true">＋</span>
                            </div>
                          </button>
                        ))}
                        <p className="day-total">
                          {money(
                            day.meals.reduce(
                              (n, m) =>
                                n +
                                perServingCents(m.recipe) *
                                  plan.preferences.people,
                              0,
                            ),
                          )}{" "}
                          for the day
                        </p>
                      </section>
                    ))}
                  </div>
                  <div className="plan-footnotes">
                    <p>
                      <span className="meal-dot slot-1" />
                      Same ingredients, different possibilities. Repeated meals
                      keep this small demo practical.
                    </p>
                    <p>
                      Profile and additional notes are retained but don’t affect
                      nutrition targets or prices.
                    </p>
                  </div>
                </>
              )}
            </>
          )
        )}
      </main>
      <footer className="site-footer">
        <span className="footer-brand">bridge.</span>
        <p>Good food should feel within reach.</p>
        <span>Interactive prototype · Resets on refresh</span>
      </footer>
      {selected && plan && (
        <MealDetails
          meal={selected.meal}
          date={selected.date}
          people={plan.preferences.people}
          onDismiss={() => setSelected(null)}
        />
      )}
    </div>
  );
}
function MealDetails({
  meal,
  date,
  people,
  onDismiss,
}: {
  meal: PlannedMeal;
  date: string;
  people: number;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    close.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  const r = meal.recipe;
  return (
    <dialog
      ref={ref}
      className="meal-dialog"
      aria-labelledby="meal-title"
      onCancel={onDismiss}
      onClose={onDismiss}
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div className="detail-inner">
        <header className="detail-header">
          <span>
            {dateLabel(date, { weekday: "long" })} · {meal.slot}
          </span>
          <button
            ref={close}
            className="close-button"
            onClick={onDismiss}
            aria-label="Close meal details"
          >
            ✕
          </button>
        </header>
        <div className={`detail-art slot-${meal.slotIndex % 3}`}>
          <FoodArt kind={r.art} />
          <span className="status-pill">{r.cuisine}</span>
        </div>
        <div className="detail-content">
          <h2 id="meal-title">{r.name}</h2>
          <p className="detail-description">{r.description}</p>
          <div className="recipe-facts">
            <span>
              <strong>{r.minutes} min</strong>Preparation
            </span>
            <span>
              <strong>
                {people} {people === 1 ? "serving" : "servings"}
              </strong>
              For your household
            </span>
            <span>
              <strong>{money(perServingCents(r))}</strong>Per serving
            </span>
          </div>
          <p className="detail-cost">
            Estimated meal cost for {people}:{" "}
            <strong>{money(perServingCents(r) * people)}</strong>
          </p>
          <p className="field-hint">
            Illustrative ingredient cost, not a store quote or package total.
          </p>
          <h3>What you’ll need</h3>
          <ul className="ingredient-list">
            {r.ingredients.map((i) => (
              <li key={i.name}>
                <span>{i.name}</span>
                <strong>{Math.round(i.grams * people * 10) / 10} g</strong>
              </li>
            ))}
          </ul>
          <h3>Let’s make it</h3>
          <ol className="recipe-steps">
            {r.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <h3>
            Sample nutrition <span>Per serving</span>
          </h3>
          <div className="nutrition-grid">
            {Object.entries(r.nutrition).map(([key, value]) => (
              <div key={key}>
                <strong>
                  {value}
                  <small>{key === "calories" ? " kcal" : " g"}</small>
                </strong>
                <span>{key}</span>
              </div>
            ))}
          </div>
          <p className="detail-disclaimer">
            Illustrative estimates, not calculated from your age or BMI. Always
            check the actual ingredients and product labels for allergens.
          </p>
          <div className="allergen-info">
            <strong>Sample allergen tags:</strong>{" "}
            {r.allergens.length ? r.allergens.join(", ") : "None listed"}
          </div>
        </div>
      </div>
    </dialog>
  );
}
