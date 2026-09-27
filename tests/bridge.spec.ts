import { test, expect, type Page } from "@playwright/test";
import { type WeeklyPlan } from "../src/lib/planner";
import { buildSamplePlan } from "../src/lib/planner";
import { sampleRecipes } from "../src/lib/sample-recipes";
async function mockPlanner(page: Page) {
  let plan: WeeklyPlan;
  let version = 1;
  let polls = 0;
  await page.route("**/api/plans", async (route) => {
    const body = route.request().postDataJSON();
    plan = buildSamplePlan(
      body.preferences,
      sampleRecipes,
      new Date(2026, 8, 26),
    );
    plan.warnings = ["Nutrition and ingredient prices are estimates."];
    polls = 0;
    await route.fulfill({
      status: 202,
      json: { id: "00000000-0000-4000-8000-000000000001" },
    });
  });
  await page.route("**/api/plans/*", async (route) => {
    polls++;
    await route.fulfill({
      json:
        polls === 1
          ? { status: "running", stage: "Pricing ingredients", version }
          : {
              status: "ready",
              stage: "Ready",
              version,
              imagesDone: true,
              plan,
            },
    });
  });
  await page.route("**/api/plans/*/replacements*", async (route) => {
    if (route.request().method() === "POST") {
      version++;
      await route.fulfill({ json: { plan, version } });
    } else
      await route.fulfill({
        json: {
          version,
          choices: [
            {
              id: "other",
              name: "Another eligible meal",
              portion: 1,
              costDeltaCents: 120,
              nutritionDelta: {
                calories: 10,
                protein: 2,
                fat: 1,
                fiber: 0,
                carbs: 1,
              },
            },
          ],
        },
      });
  });
}
test("desktop async plan, dropdown, dialog focus, replacements and resume", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mockPlanner(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Build my week" }).click();
  await expect(page.getByLabel("Where are you planning?")).toBeFocused();
  await expect(page.getByText("Enter a five-digit US ZIP code.")).toBeVisible();
  await page.getByRole("button", { name: "Use example preferences" }).click();
  await page.locator(".cuisine-picker summary").click();
  await page.getByLabel("Search cuisines").fill("ind");
  await page.getByLabel("Indian", { exact: true }).check();
  await page.getByRole("button", { name: "Remove Indian" }).click();
  await page.locator(".cuisine-picker summary").click();
  await expect(
    page.getByLabel("Daily calorie target", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/playwright-bridge/desktop-setup.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Build my week" }).click();
  await expect(
    page.getByText("Pricing ingredients", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".meal-card")).toHaveCount(21);
  await page.screenshot({
    path: "test-results/playwright-bridge/desktop-week.png",
    fullPage: true,
  });
  const first = page.locator(".meal-card").first();
  await first.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect((await page.getByRole("dialog").boundingBox())?.y).toBe(0);
  await expect(
    page.getByRole("button", { name: "Close meal details" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Find a replacement" }).click();
  await expect(page.getByText("Another eligible meal")).toBeVisible();
  await page.screenshot({
    path: "test-results/playwright-bridge/desktop-detail.png",
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(first).toBeFocused();
  await page.reload();
  await expect(page.locator(".meal-card")).toHaveCount(21);
  await page.getByRole("button", { name: "Edit preferences" }).click();
  await expect(page.getByLabel("Where are you planning?")).toHaveValue("30318");
  expect(errors).toEqual([]);
});
test("mobile household target, three slots, scaling and accessible controls", async ({
  page,
}) => {
  await mockPlanner(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Use example preferences" }).click();
  await page.getByLabel("People to feed").fill("2");
  await expect(
    page.getByLabel("Daily calorie target", { exact: false }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Meals per day").locator("option")).toHaveCount(
    1,
  );
  await page.screenshot({
    path: "test-results/playwright-bridge/mobile-setup.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Build my week" }).click();
  await expect(page.locator(".selected-day .meal-card")).toHaveCount(3);
  await page.locator(".mobile-days button").nth(2).click();
  await expect(page.locator(".selected-day")).toHaveAttribute(
    "aria-label",
    /Wednesday/,
  );
  await page.screenshot({
    path: "test-results/playwright-bridge/mobile-week.png",
    fullPage: true,
  });
  await page.locator(".selected-day .meal-card").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect((await page.getByRole("dialog").boundingBox())?.y).toBe(0);
  await page.screenshot({
    path: "test-results/playwright-bridge/mobile-detail.png",
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("API failure is actionable without inventing a plan", async ({ page }) => {
  await page.route("**/api/plans", (r) =>
    r.fulfill({
      status: 503,
      json: { error: "Pricing unavailable. Try again." },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Use example preferences" }).click();
  await page.getByRole("button", { name: "Build my week" }).click();
  await expect(page.locator(".planner-error")).toContainText(
    "Pricing unavailable",
  );
  await expect(page.locator(".meal-card")).toHaveCount(0);
});

test("a running plan can be cancelled and another request becomes available", async ({
  page,
}) => {
  await page.route("**/api/plans", (r) =>
    r.fulfill({
      status: 202,
      json: { id: "00000000-0000-4000-8000-000000000001" },
    }),
  );
  await page.route("**/api/plans/*", (r) =>
    r.fulfill({
      json: {
        status: "running",
        stage: "Pricing ingredients 424 of 845",
        version: 1,
      },
    }),
  );
  await page.route("**/api/plans/*/cancel", (r) =>
    r.fulfill({ json: { status: "cancelled" } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Use example preferences" }).click();
  await page.getByRole("button", { name: "Build my week" }).click();
  await page.getByRole("button", { name: "Cancel plan", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Build my week" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() => localStorage.getItem("bridge-plan-id")),
  ).toBeNull();
  await expect(page.getByLabel("Where are you planning?")).toHaveValue("30318");
});
test("blocked submissions expose resume and cancel controls for the existing job", async ({
  page,
}) => {
  await page.route("**/api/plans", (r) =>
    r.fulfill({
      status: 409,
      json: {
        error: "A plan is already running.",
        activeJobId: "00000000-0000-4000-8000-000000000001",
      },
    }),
  );
  await page.route("**/api/plans/*/cancel", (r) =>
    r.fulfill({ json: { status: "cancelled" } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Use example preferences" }).click();
  await page.getByRole("button", { name: "Build my week" }).click();
  await expect(
    page.getByRole("button", { name: "Resume existing plan" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel existing plan" }).click();
  await expect(
    page.getByRole("button", { name: "Build my week" }),
  ).toBeEnabled();
  await expect(page.locator(".planner-error")).toHaveCount(0);
});

test("grocery list supports pantry checks, export, and keyboard dismissal on mobile", async ({
  page,
}) => {
  await mockPlanner(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Use example preferences" }).click();
  await page.getByRole("button", { name: "Build my week" }).click();
  const trigger = page.getByRole("button", {
    name: "Grocery list",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Your weekly grocery list" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("checkbox", { name: /Already have this/ })
    .first()
    .check();
  await expect(
    dialog.getByRole("checkbox", { name: /Already have this/ }).first(),
  ).toBeChecked();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download list" }).click();
  expect((await download).suggestedFilename()).toBe("bridge-grocery-list.txt");
  await page.screenshot({
    path: "test-results/playwright-bridge/grocery-mobile.png",
  });
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await trigger.click();
  await expect(
    dialog.getByRole("checkbox", { name: /Already have this/ }).first(),
  ).toBeChecked();
  await page.screenshot({
    path: "test-results/playwright-bridge/grocery-desktop.png",
  });
});
