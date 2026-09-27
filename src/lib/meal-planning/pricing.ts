import { createHash } from "node:crypto";
import { z } from "zod";
import { grokJSON } from "./grok";
import { cacheGet, cachePut } from "./store";
import {
  ingredientPriceKey,
  type PreparedMeal,
  type Price,
  type PricedMeal,
  type Store,
} from "./types";
let token: { value: string; expires: number } | undefined;
async function kroger(path: string, params: Record<string, string>) {
  if (!token || token.expires < Date.now()) {
    const id = process.env.KROGER_CLIENT_ID?.trim(),
      secret = process.env.KROGER_CLIENT_SECRET?.trim();
    if (!id || !secret)
      throw new Error("Kroger credentials are not configured.");
    const response = await fetch(
      "https://api.kroger.com/v1/connect/oauth2/token",
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials&scope=product.compact",
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) throw new Error("Kroger authentication is unavailable.");
    const data = await response.json();
    if (typeof data.access_token !== "string")
      throw new Error("Invalid Kroger token.");
    token = {
      value: data.access_token,
      expires: Date.now() + (Number(data.expires_in) || 1800) * 1000 - 60000,
    };
  }
  const response = await fetch(
    `https://api.kroger.com/v1/${path}?${new URLSearchParams(params)}`,
    {
      headers: { Authorization: `Bearer ${token.value}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) {
    if (response.status === 401) token = undefined;
    throw new Error("Kroger pricing is temporarily unavailable.");
  }
  return response.json();
}
export function distanceMiles(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const radians = (x: number) => (x * Math.PI) / 180;
  const dlat = radians(b.latitude - a.latitude),
    dlon = radians(b.longitude - a.longitude);
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(dlon / 2) ** 2;
  return (
    3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
  );
}
export async function findStore(zip: string): Promise<Store> {
  const key = `store-v2:${zip}`;
  const cached = await cacheGet<Store>(key);
  if (cached) return cached;
  let store: Store = {
    id: "01100346",
    name: "Kroger · 1715 Howell Mill Rd NW",
    reference: true,
    reason: "No nearby Kroger was returned within the searched area.",
  };
  try {
    let center = await cacheGet<{ latitude: number; longitude: number }>(
      `zip:${zip}`,
    );
    if (!center) {
      const response = await fetch(`https://api.zippopotam.us/us/${zip}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("ZIP coordinates unavailable.");
      const body = await response.json();
      const places = z
        .array(
          z.object({
            latitude: z.coerce.number().min(-90).max(90),
            longitude: z.coerce.number().min(-180).max(180),
          }),
        )
        .min(1)
        .parse(body.places);
      center = places[0];
      await cachePut(`zip:${zip}`, center, 24 * 30);
    }
    for (const radius of [15, 30, 50]) {
      const result = await kroger("locations", {
        "filter.zipCode.near": zip,
        "filter.radiusInMiles": String(radius),
        "filter.limit": "200",
      });
      const rows = z
        .array(
          z.object({
            locationId: z.string(),
            name: z.string(),
            geolocation: z
              .object({ latitude: z.number(), longitude: z.number() })
              .optional(),
          }),
        )
        .parse(result.data ?? [])
        .filter((r) => r.geolocation)
        .sort(
          (a, b) =>
            distanceMiles(center!, a.geolocation!) -
              distanceMiles(center!, b.geolocation!) ||
            a.locationId.localeCompare(b.locationId),
        );
      if (rows.length) {
        store = {
          id: rows[0].locationId,
          name: rows[0].name,
          reference: false,
        };
        break;
      }
    }
  } catch {
    store.reason =
      "Location lookup was unavailable; reference-store estimates are shown.";
  }
  await cachePut(key, store, store.reference ? 1 : 24);
  return store;
}
export function packageGrams(size: string): number | null {
  const normalized = size.toLowerCase().trim();
  const match = normalized.match(
    /^(?:(\d+)\s*(?:ct\s*\/|x)\s*)?(\d+(?:\.\d+)?)\s*(kg|g|oz|lb|lbs)$/,
  );
  if (!match) return null;
  return (
    Number(match[1] ?? 1) *
    Number(match[2]) *
    { kg: 1000, g: 1, oz: 28.349523125, lb: 453.59237, lbs: 453.59237 }[
      match[3]
    ]!
  );
}
const matchSchema = z.object({
  candidateIndex: z.number().int().min(-1),
  packageGrams: z.number().positive().max(1000000),
  preparationYieldFactor: z.number().min(0.02).max(20),
  assumptions: z.string(),
});
const fallbackSchema = z.object({
  priceUsd: z.number().positive().max(10000),
  quantityGrams: z.number().positive().max(1000000),
  assumptions: z.string(),
});
export async function ingredientPrice(
  ingredient: PreparedMeal["ingredients"][number],
  store: Store,
): Promise<Price> {
  const identity = ingredientPriceKey(ingredient);
  const hash = createHash("sha256")
    .update(JSON.stringify(identity))
    .digest("hex");
  const key = `price-v3:${store.id}:${hash}`;
  const cached = await cacheGet<Price>(key);
  if (cached) return cached;
  let candidates: {
    productId: string;
    description: string;
    size: string;
    regularCents: number;
    grams: number | null;
  }[] = [];
  let unavailable = false;
  try {
    const result = await kroger("products", {
      "filter.term": ingredient.name,
      "filter.locationId": store.id,
      "filter.limit": "8",
    });
    const parsed = z
      .array(
        z.object({
          productId: z.string(),
          description: z.string(),
          items: z
            .array(
              z.object({
                size: z.string().optional(),
                price: z
                  .object({ regular: z.number().nonnegative() })
                  .optional(),
              }),
            )
            .optional(),
        }),
      )
      .parse(result.data ?? []);
    candidates = parsed.flatMap((p) =>
      (p.items ?? [])
        .filter((i) => i.price?.regular)
        .map((i) => ({
          productId: p.productId,
          description: p.description,
          size: i.size ?? "",
          regularCents: Math.round(i.price!.regular * 100),
          grams: packageGrams(i.size ?? ""),
        })),
    );
  } catch {
    unavailable = true;
  }
  let price: Price | undefined;
  if (candidates.length) {
    const match = await grokJSON(
      "Choose the closest equivalent grocery product for this recipe ingredient and preparation state. candidateIndex is zero-based, -1 if none. packageGrams is the mass of the ENTIRE RETAIL PACKAGE, independent of how much this recipe uses. Use the provided grams when available. preparationYieldFactor is grams in recipe preparation state obtained from ONE gram of packaged product. Same state = 1; dry rice converted to cooked rice is typically 2.5 to 3; drained canned foods may be below 1. Equivalent full-package recipe-state mass = packageGrams * preparationYieldFactor. NEVER use the recipe ingredient quantity as the package quantity, and NEVER use recipeQuantity/packageQuantity as the yield factor. Example: a 907g dry rice bag yielding 2.5g cooked per g dry supplies 2267.5g cooked regardless of whether the recipe uses 100g or 600g. Explain densities, count-to-mass assumptions, or cooking yield. No deferred conversions: provide the factor here. Never invent a product or price.",
      { ingredient, candidates },
      matchSchema,
    );
    const item = candidates[match.candidateIndex];
    if (item) {
      const packageMass = item.grams ?? match.packageGrams;
      const grams = packageMass * match.preparationYieldFactor;
      price = {
        centsPerGram: item.regularCents / grams,
        source: "kroger",
        storeId: store.id,
        productId: item.productId,
        description: item.description,
        regularCents: item.regularCents,
        packageGrams: grams,
        assumptions: match.assumptions,
        fetchedAt: new Date().toISOString(),
      };
    }
  }
  if (!price) {
    const estimate = await grokJSON(
      "Provide a best-effort typical US grocery price for this ingredient, with priceUsd for quantityGrams in the ingredient preparation state. This is an unverified model estimate, not a live national survey. Explain assumptions; do not claim access to current store prices.",
      { ingredient },
      fallbackSchema,
    );
    price = {
      centsPerGram: (estimate.priceUsd * 100) / estimate.quantityGrams,
      source: "grok-average",
      storeId: store.id,
      description: ingredient.name,
      packageGrams: estimate.quantityGrams,
      regularCents: estimate.priceUsd * 100,
      assumptions:
        (unavailable
          ? "Kroger lookup unavailable. "
          : "No suitable priced Kroger product. ") + estimate.assumptions,
      fetchedAt: new Date().toISOString(),
    };
  }
  await cachePut(key, price, price.source === "kroger" ? 24 : 168);
  return price;
}
export function priceRecipe(recipe: PreparedMeal, prices: Price[]): PricedMeal {
  if (
    prices.length !== recipe.ingredients.length ||
    prices.some((p) => !Number.isFinite(p.centsPerGram) || p.centsPerGram <= 0)
  )
    throw new Error("Incomplete ingredient pricing.");
  return {
    ...recipe,
    prices,
    perServingCents:
      recipe.ingredients.reduce(
        (sum, i, index) => sum + i.grams * prices[index].centsPerGram,
        0,
      ) / recipe.yield,
  };
}
