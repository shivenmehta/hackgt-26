import { test, expect } from "@playwright/test";
test("desktop form, sample plan, dialog focus, editing and Community", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "test-results/bridge-desktop-setup.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Build my week" }).click();
  await expect(page.getByLabel("Where are you planning?")).toBeFocused();
  await expect(page.getByText("Enter your city or ZIP code.")).toBeVisible();
  await page.getByRole("button", { name: "Use example preferences" }).click();
  await page.getByRole("button", { name: "Build my week" }).click();
  await expect(
    page.getByRole("heading", { name: "A week at your table." }),
  ).toBeFocused();
  await expect(page.locator(".meal-card")).toHaveCount(21);
  await page.screenshot({
    path: "test-results/bridge-desktop-week.png",
    fullPage: true,
  });
  const first = page.locator(".meal-card").first();
  await first.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close meal details" }),
  ).toBeFocused();
  await expect(page.getByText("What you’ll need")).toBeVisible();
  await page.screenshot({
    path: "test-results/bridge-desktop-detail.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(first).toBeFocused();
  await page.getByRole("button", { name: "Edit preferences" }).click();
  await expect(page.getByLabel("Where are you planning?")).toHaveValue(
    "Atlanta, GA",
  );
  await page
    .getByLabel("Anything else we should know?")
    .fill("I have rice already");
  await page.getByLabel("Weekly food budget").fill("1");
  await page.getByRole("button", { name: "Build my week" }).click();
  await expect(page.getByRole("status")).toContainText("exceeds your budget");
  await page.getByRole("button", { name: "Community" }).click();
  await expect(page.getByText("Coming later", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to weekly planner" }).click();
  await expect(page.locator(".meal-card")).toHaveCount(21);
  await page.getByRole("button", { name: "Edit preferences" }).click();
  await expect(page.getByLabel("Anything else we should know?")).toHaveValue(
    "I have rice already",
  );
  await page.reload();
  await expect(page.getByLabel("Age", { exact: false })).toHaveValue("");
  expect(errors).toEqual([]);
});
test("mobile day selection, six slots, dietary filters and scaled details", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Use example preferences" }).click();
  await page.getByLabel("People to feed").fill("2");
  await page.getByLabel("Meals per day").selectOption("6");
  await page.getByRole("button", { name: "Vegan", exact: false }).click();
  await page.screenshot({
    path: "test-results/bridge-mobile-setup.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Build my week" }).click();
  await expect(page.locator(".selected-day .meal-card")).toHaveCount(6);
  await page.locator(".mobile-days button").nth(2).click();
  await expect(page.locator(".mobile-days button").nth(2)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".selected-day")).toHaveAttribute(
    "aria-label",
    /Wednesday/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/bridge-mobile-week.png",
    fullPage: true,
  });
  await page.locator(".selected-day .meal-card").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("2 servings", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/bridge-mobile-detail.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close meal details" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
