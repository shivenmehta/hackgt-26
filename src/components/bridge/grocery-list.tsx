"use client";
import { useEffect, useRef, useState } from "react";
import {
  groceryList,
  isGroceryExtra,
  groceryQuantity,
  grocerySections,
  groceryText,
} from "@/lib/groceries";
import { money, type WeeklyPlan } from "@/lib/planner";

export default function GroceryList({ plan }: { plan: WeeklyPlan }) {
  const [open, setOpen] = useState(false);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [showStaples, setShowStaples] = useState(false);
  const allItems = groceryList(plan);
  const stapleCount = allItems.filter((item) =>
    isGroceryExtra(item.name),
  ).length;
  const items = allItems.filter(
    (item) => showStaples || !isGroceryExtra(item.name),
  );
  const remaining = items.filter((item) => !owned.has(item.key));
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const opener = trigger.current;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      opener?.focus();
    };
  }, [open]);
  function close() {
    dialog.current?.close();
    setOpen(false);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(groceryText(items, owned));
      setMessage("Grocery list copied.");
    } catch {
      setMessage("Copy is unavailable. Download the list instead.");
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([groceryText(items, owned)], {
        type: "text/plain;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "bridge-grocery-list.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Grocery list downloaded.");
  }
  return (
    <>
      <button
        ref={trigger}
        className="secondary-button"
        onClick={() => setOpen(true)}
      >
        Grocery list
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="meal-dialog grocery-dialog"
          aria-labelledby="grocery-title"
          onCancel={close}
          onClose={() => setOpen(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="grocery-content">
            <header className="grocery-heading">
              <h2 id="grocery-title">Your weekly grocery list</h2>
              <button
                className="secondary-button"
                onClick={close}
                aria-label="Close grocery list"
              >
                Close
              </button>
            </header>
            <p>
              {remaining.length} of {items.length} ingredients to get · For{" "}
              {plan.preferences.people}{" "}
              {plan.preferences.people === 1 ? "person" : "people"}
            </p>
            <p className="grocery-note">
              Start with the main ingredients for your week. Quantities combine
              your planned meals and household portions, not package sizes.
            </p>
            <label className="grocery-staples-toggle">
              <input
                type="checkbox"
                checked={showStaples}
                onChange={(event) => setShowStaples(event.target.checked)}
              />
              Show full ingredient list ({stapleCount} extras)
            </label>
            <p className="grocery-note">
              Essentials view leaves out sauces, seasonings, garnishes, and
              pantry basics. These may still be needed to follow a recipe
              exactly. Show the full list to review them. Subtotal and exports
              reflect this view.
            </p>
            <div className="grocery-tools">
              <button className="secondary-button" onClick={copy}>
                Copy list
              </button>
              <button className="secondary-button" onClick={download}>
                Download list
              </button>
            </div>
            <p role="status">{message}</p>
            <div className="grocery-cost">
              <strong>
                {money(
                  remaining.reduce((sum, item) => sum + item.costCents, 0),
                )}
              </strong>{" "}
              estimated ingredient-use cost for unchecked items
              <p>
                Not a grocery checkout total. Pantry checkboxes do not change
                your meal plan’s cost. Checkmarks reset when you refresh.
              </p>
            </div>
            {grocerySections.map((section) => {
              const rows = items.filter((item) => item.section === section);
              return rows.length ? (
                <section className="grocery-section" key={section}>
                  <h3>{section}</h3>
                  <ul>
                    {rows.map((item) => (
                      <li
                        key={item.key}
                        className={owned.has(item.key) ? "grocery-owned" : ""}
                      >
                        <div className="grocery-item-heading">
                          <strong>{item.name}</strong>
                          <span>{groceryQuantity(item.grams)}</span>
                        </div>
                        <p className="grocery-meals">
                          For: {item.meals.join(", ")}
                        </p>
                        {item.preparation && (
                          <details>
                            <summary>
                              Ingredient form & quantity assumptions
                            </summary>
                            <p>{item.preparation}</p>
                          </details>
                        )}
                        <label>
                          <input
                            type="checkbox"
                            checked={owned.has(item.key)}
                            onChange={() =>
                              setOwned((previous) => {
                                const next = new Set(previous);
                                if (next.has(item.key)) next.delete(item.key);
                                else next.add(item.key);
                                return next;
                              })
                            }
                          />{" "}
                          Already have this
                          <span className="grocery-sr">: {item.name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null;
            })}
          </div>
        </dialog>
      )}
    </>
  );
}
