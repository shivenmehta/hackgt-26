import { test, expect } from "@playwright/test";

test("host, public share, nearby map, private cancellation and expired status", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/community/host");
  await page
    .getByLabel("Your public display name")
    .fill("Sally integration test");
  await page
    .getByLabel("Public message")
    .fill("Come for pasta and smoothies! Fictional test event.");
  await page.getByLabel("Food provided").fill("Pasta, smoothies");
  await page
    .getByLabel("Public event address")
    .fill("736 Peachtree St NE, Atlanta, GA 30308");
  await page.getByLabel("Event latitude").fill("33.77475");
  await page.getByLabel("Event longitude").fill("-84.38473");
  const start = new Date(Date.now() + 3600000).toISOString().slice(0, 16);
  const end = new Date(Date.now() + 7200000).toISOString().slice(0, 16);
  await page.getByLabel("Starts (local time").fill(start);
  await page.getByLabel("Ends (local time").fill(end);
  await page.getByLabel("Start timezone offset").selectOption("+00:00");
  await page.getByLabel("End timezone offset").selectOption("+00:00");
  await page.getByLabel("I confirm the public address").check();
  await page.getByRole("button", { name: "Publish food event" }).click();
  await expect(
    page.getByRole("heading", { name: "Your event is posted." }),
  ).toBeVisible();
  const publicLink = await page
    .getByLabel("Public event link", { exact: true })
    .inputValue();
  const privateLink = await page
    .getByLabel("Private management link", { exact: true })
    .inputValue();
  const token = new URLSearchParams(new URL(privateLink).hash.slice(1)).get(
    "token",
  )!;
  await page.screenshot({
    path: "test-results/location-host-success.png",
    fullPage: true,
    mask: [page.getByLabel("Private management link", { exact: true })],
  });
  await page.goto(publicLink);
  await expect(page.getByText("Upcoming", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel event", exact: true }),
  ).toHaveCount(0);
  const identifier = decodeURIComponent(
    new URL(publicLink).pathname.split("/").pop()!,
  );
  const publicData = await request.get(
    `/api/location/events/${encodeURIComponent(identifier)}`,
  );
  expect(await publicData.text()).not.toContain(token);
  const forbidden = await request.post(
    `/api/location/events/${encodeURIComponent(identifier)}/cancel`,
    {
      data: { edit_token: token },
      headers: { Origin: "https://other-site.example" },
    },
  );
  expect(forbidden.status()).toBe(403);
  await page.goto("/community");
  await page.getByText("Enter coordinates manually").click();
  await page.getByLabel("Latitude", { exact: true }).fill("33.7756");
  await page.getByLabel("Longitude", { exact: true }).fill("-84.3963");
  await page.getByRole("button", { name: "Use these coordinates" }).click();
  for (const source of ["OpenStreetMap", "USDA SNAP", "Feed America"])
    await page.getByLabel(source, { exact: true }).uncheck();
  await page
    .getByRole("button", { name: "Search nearby", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "1 nearby options" }),
  ).toBeVisible();
  await expect(
    page.getByText("Pasta, smoothies", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".food-map-marker")).toHaveCount(1);
  await page.locator(".food-map-marker").click();
  await expect(page.locator(".resource-card.selected")).toHaveCount(1);
  await page.screenshot({
    path: "test-results/location-map-desktop.png",
    fullPage: true,
  });
  await page.goto(privateLink);
  await expect(page).not.toHaveURL(/token=/);
  await page.getByLabel("Yes, cancel this event.").check();
  await page.getByRole("button", { name: "Cancel event", exact: true }).click();
  await expect(page.getByText("Canceled", { exact: true })).toBeVisible();
  await page.goto(publicLink);
  await expect(page.getByText("Canceled", { exact: true })).toBeVisible();
  const nearby = await request.get(
    "/api/location/nearby?lat=33.7756&lon=-84.3963&sources=events",
  );
  expect((await nearby.json()).locations).toEqual([]);
  expect(errors).toEqual([]);
});

test("mobile search, unavailable geolocation, partial sources, map/list and missing hours", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: (_ok: unknown, fail: () => void) => fail() },
    }),
  );
  await page.route("**/api/location/geocode", (route) =>
    route.fulfill({
      json: {
        candidates: [
          { address: "Test Chicago venue", latitude: 41.88, longitude: -87.63 },
        ],
      },
    }),
  );
  const place = {
    place_id: "snap:1",
    name: "Neighborhood market",
    address: "10 Test St, Chicago",
    latitude: 41.88,
    longitude: -87.63,
    distance_miles: 0.2,
    ui_category: "snap_and_assistance",
    service_labels: ["SNAP retailer — paid groceries"],
    availability: { status: "unknown", hours_known: false, schedules: [] },
  };
  await page.route("**/api/location/nearby?**", (route) =>
    route.fulfill({
      json: {
        ui_categories: {
          general_food_resources: [],
          snap_and_assistance: [place],
        },
        source_status: { osm: "error", snap: "ok" },
        source_errors: ["osm: unavailable; try again later."],
        limitations: [],
      },
    }),
  );
  await page.goto("/community");
  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(page.locator(".location-error[role=alert]")).toContainText(
    "Location permission was unavailable",
  );
  await page
    .getByLabel("Find a US street address")
    .fill("10 Test Street, Chicago");
  await page.getByRole("button", { name: "Find address", exact: true }).click();
  await page.getByRole("button", { name: "Use Test Chicago venue" }).click();
  await page
    .getByRole("button", { name: "Search nearby", exact: true })
    .click();
  await expect(
    page.getByText("Hours unknown · contact the provider"),
  ).toBeVisible();
  await expect(
    page.getByText("osm: unavailable; try again later."),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/location-mobile-list.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.locator(".food-map")).toBeVisible();
  await page.screenshot({
    path: "test-results/location-mobile-map.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(
    page.getByText("Neighborhood market", { exact: true }),
  ).toBeVisible();
});

test("past events expire from the visible list without another search", async ({
  page,
}) => {
  await page.clock.install();
  const now = Date.now();
  const place = {
    place_id: "community_event:test",
    name: "Ending soon",
    address: "Test venue",
    latitude: 33.77,
    longitude: -84.39,
    starts_at: new Date(now - 60000).toISOString(),
    ends_at: new Date(now + 1000).toISOString(),
    availability: {
      status: "scheduled_active",
      hours_known: true,
      schedules: [],
    },
  };
  await page.route("**/api/location/nearby?**", (route) =>
    route.fulfill({
      json: {
        ui_categories: {
          general_food_resources: [],
          snap_and_assistance: [place],
        },
        source_status: { events: "ok" },
        source_errors: [],
        limitations: [],
      },
    }),
  );
  await page.goto("/community");
  await page.getByText("Enter coordinates manually").click();
  await page.getByLabel("Latitude", { exact: true }).fill("33.77");
  await page
    .getByRole("button", { name: "Search nearby", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "1 nearby options" }),
  ).toBeVisible();
  await page.clock.fastForward(61000);
  await expect(
    page.getByRole("heading", { name: "0 nearby options" }),
  ).toBeVisible();
});
