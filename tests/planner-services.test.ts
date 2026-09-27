import { POST as cancelPlan } from "../src/app/api/plans/[id]/cancel/route";
import { updateJob, assertActive } from "../src/lib/meal-planning/store";
import test from "node:test";
import assert from "node:assert/strict";
import { ingredientPrice, findStore } from "../src/lib/meal-planning/pricing";
import { priceStep } from "../src/lib/meal-planning/pipeline";
import { GET as getPlan } from "../src/app/api/plans/[id]/route";
import { session } from "../src/lib/meal-planning/http";
import { NextRequest } from "next/server";
import type { PreparedMeal } from "../src/lib/meal-planning/types";
const ingredient: PreparedMeal["ingredients"][number] = {
  position: 1,
  name: "Brown rice",
  measurement: "100 g",
  grams: 100,
  assumptions: "dry rice",
};
const store = { id: "01100346", name: "Reference", reference: true };
function fakeServices(
  mode: "match" | "converted" | "missing" | "failed" | "stores" | "owner",
) {
  const old = globalThis.fetch;
  const oldEnv = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://database.example",
    SUPABASE_SECRET_KEY: "test-server-key",
    GROK_API_KEY: "test-grok-key",
    KROGER_CLIENT_ID: "test-id",
    KROGER_CLIENT_SECRET: "test-secret",
    PLANNER_SESSION_SECRET: "test-session-secret-with-more-than-32-characters",
  });
  const cache = new Map<string, { value: unknown; expires_at: string }>();
  const calls: string[] = [];
  const owner = session(new NextRequest("http://localhost"), true)!;
  const job = {
    id: "00000000-0000-4000-8000-000000000001",
    owner_hash: owner.owner,
    status: "queued",
    stage: "Queued",
    version: 1,
    images_done: false,
  };
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    calls.push(url.host + url.pathname);
    if (url.host === "database.example") {
      if (url.pathname.endsWith("/planner_jobs")) {
        const ownerFilter = url.searchParams.get("owner_hash");
        const states = url.searchParams.get("status");
        if (ownerFilter && ownerFilter !== `eq.${owner.owner}`)
          return Response.json([]);
        if (states && !states.slice(4, -1).split(",").includes(job.status))
          return Response.json([]);
        if (method === "PATCH")
          Object.assign(job, JSON.parse(String(init?.body)));
        return Response.json([job]);
      }
      if (method === "POST") {
        const body = JSON.parse(String(init?.body));
        cache.set(body.key, body);
        return new Response(null, { status: 201 });
      }
      const row = cache.get(url.searchParams.get("key")?.slice(3) ?? "");
      return Response.json(
        row && row.expires_at > new Date().toISOString()
          ? [{ value: row.value }]
          : [],
      );
    }
    if (url.pathname.endsWith("/token"))
      return Response.json({ access_token: "test-token", expires_in: 3600 });
    if (url.host === "api.zippopotam.us")
      return Response.json({ places: [{ latitude: "33", longitude: "-84" }] });
    if (url.pathname.endsWith("/locations"))
      return Response.json({
        data:
          url.searchParams.get("filter.radiusInMiles") === "50"
            ? [
                {
                  locationId: "far",
                  name: "Far",
                  geolocation: { latitude: 33.4, longitude: -84 },
                },
                {
                  locationId: "near",
                  name: "Near",
                  geolocation: { latitude: 33.01, longitude: -84 },
                },
              ]
            : [],
      });
    if (url.pathname.endsWith("/products"))
      return Response.json({
        data:
          mode === "match" || mode === "converted"
            ? [
                {
                  productId: "rice",
                  description: "Dry brown rice",
                  items: [{ size: "1 kg", price: { regular: 4.99 } }],
                },
              ]
            : [],
      });
    if (url.host === "api.x.ai") {
      if (mode === "failed")
        return new Response("Unavailable", { status: 503 });
      const content =
        mode === "match" || mode === "converted"
          ? {
              candidateIndex: 0,
              packageGrams: 123,
              preparationYieldFactor: mode === "converted" ? 2.5 : 1,
              assumptions: "Same dry state",
            }
          : {
              priceUsd: 3,
              quantityGrams: 500,
              assumptions: "Typical model estimate, not a store quote",
            };
      return Response.json({
        choices: [{ message: { content: JSON.stringify(content) } }],
      });
    }
    throw new Error("Unexpected request in test: " + url.host + url.pathname);
  };
  return {
    cache,
    job,
    calls,
    owner,
    restore() {
      globalThis.fetch = old;
      for (const key of Object.keys(process.env))
        if (!(key in oldEnv)) delete process.env[key];
      Object.assign(process.env, oldEnv);
    },
  };
}
test("Kroger matching preserves known package weight and cache avoids repeated calls", async () => {
  const fake = fakeServices("match");
  try {
    const first = await ingredientPrice(ingredient, store);
    assert.equal(first.source, "kroger");
    assert.equal(first.packageGrams, 1000);
    assert.equal(first.centsPerGram, 0.499);
    const calls = fake.calls.filter((x) => x.includes("api.x.ai")).length;
    assert.deepEqual(
      await ingredientPrice(
        { ...ingredient, measurement: "200 g", grams: 200 },
        store,
      ),
      first,
    );
    assert.equal(
      fake.calls.filter((x) => x.includes("api.x.ai")).length,
      calls,
    );
    assert.ok(
      [...fake.cache.values()].every(
        (c) => Date.parse(c.expires_at) - Date.now() <= 24 * 3600000,
      ),
    );
  } finally {
    fake.restore();
  }
});
test("missing store products use explicit seven-day model price estimates", async () => {
  const fake = fakeServices("missing");
  try {
    const price = await ingredientPrice(ingredient, store);
    assert.equal(price.source, "grok-average");
    assert.equal(price.centsPerGram, 0.6);
    assert.match(price.assumptions, /No suitable priced Kroger product/);
    assert.ok(
      Date.parse([...fake.cache.values()][0].expires_at) - Date.now() >
        6 * 24 * 3600000,
    );
  } finally {
    fake.restore();
  }
});
test("unavailable model pricing excludes ingredients instead of assigning zero", async () => {
  const fake = fakeServices("failed");
  try {
    assert.equal(await priceStep(ingredient, store), null);
  } finally {
    fake.restore();
  }
});
test("expanded Kroger search chooses closest coordinates rather than response order", async () => {
  const fake = fakeServices("stores");
  try {
    const result = await findStore("30318");
    assert.equal(result.id, "near");
    assert.equal(result.reference, false);
    assert.equal(fake.calls.filter((x) => x.endsWith("/locations")).length, 3);
  } finally {
    fake.restore();
  }
});
test("plan endpoint enforces owner filter and never returns owner identifiers", async () => {
  const fake = fakeServices("owner");
  try {
    const params = Promise.resolve({
      id: "00000000-0000-4000-8000-000000000001",
    });
    const valid = await getPlan(
      new NextRequest("http://localhost/api/plans/x", {
        headers: { cookie: `bridge-planner-session=${fake.owner.cookie}` },
      }),
      { params },
    );
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).owner_hash, undefined);
    const other = session(new NextRequest("http://localhost"), true)!;
    const denied = await getPlan(
      new NextRequest("http://localhost/api/plans/x", {
        headers: { cookie: `bridge-planner-session=${other.cookie}` },
      }),
      { params },
    );
    assert.equal(denied.status, 404);
  } finally {
    fake.restore();
  }
});

test("cooked-state pricing uses whole-package yield rather than recipe quantity", async () => {
  const fake = fakeServices("converted");
  try {
    const price = await ingredientPrice(
      { ...ingredient, grams: 600, assumptions: "cooked rice" },
      store,
    );
    assert.equal(price.packageGrams, 2500);
    assert.equal(Math.round(price.centsPerGram * 600), 120);
  } finally {
    fake.restore();
  }
});

test("cancellation is owner-scoped, idempotent, and fences late worker updates", async () => {
  const fake = fakeServices("owner");
  try {
    const params = Promise.resolve({ id: fake.job.id });
    const other = session(new NextRequest("http://localhost"), true)!;
    const request = (cookie: string) =>
      new NextRequest(`http://localhost/api/plans/${fake.job.id}/cancel`, {
        method: "POST",
        headers: {
          origin: "http://localhost",
          cookie: `bridge-planner-session=${cookie}`,
        },
      });
    assert.equal(
      (await cancelPlan(request(other.cookie), { params })).status,
      404,
    );
    assert.equal(fake.job.status, "queued");
    assert.equal(
      (await cancelPlan(request(fake.owner.cookie), { params })).status,
      200,
    );
    assert.equal(fake.job.status, "cancelled");
    assert.equal(
      (await cancelPlan(request(fake.owner.cookie), { params })).status,
      200,
    );
    await assert.rejects(
      updateJob(fake.job.id, { status: "running" }),
      /stopped/,
    );
    await assert.rejects(
      updateJob(fake.job.id, { status: "ready" }),
      /stopped/,
    );
    await assert.rejects(assertActive(fake.job.id), /stopped/);
    assert.equal(fake.job.status, "cancelled");
  } finally {
    fake.restore();
  }
});
