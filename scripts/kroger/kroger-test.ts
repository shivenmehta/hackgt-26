// Run from the repository root:
// npx tsx --env-file=.env.local scripts/kroger-test.ts
//
// Optional ZIP code and search term:
// npx tsx --env-file=.env.local scripts/kroger-test.ts 30318 "cheddar cheese"

type KrogerStore = {
  locationId: string;
  name: string;
  address?: {
    addressLine1?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
};

type KrogerProduct = {
  productId: string;
  description: string;
  items?: {
    itemId: string;
    size?: string;
    price?: {
      regular?: number;
      promo?: number;
    };
  }[];
};

async function getKrogerAccessToken(): Promise<string> {
  const clientId = process.env.KROGER_CLIENT_ID?.trim();
  const clientSecret = process.env.KROGER_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      "Set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET in .env.local.",
    );
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );

  const response = await fetch(
    "https://api.kroger.com/v1/connect/oauth2/token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "product.compact",
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Token request failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
  };

  if (!data.access_token) {
    throw new Error("Kroger did not return an access token.");
  }

  return data.access_token;
}

async function krogerGet<T>(
  path: string,
  params: URLSearchParams,
  token: string,
): Promise<T> {
  const response = await fetch(`https://api.kroger.com/v1/${path}?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Kroger ${path} request failed: HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

async function main() {
  const zipCode = process.argv[2] ?? "30318";
  const searchTerm = process.argv[3] ?? "paneer";

  if (!/^\d{5}$/.test(zipCode)) {
    throw new Error("Enter a five-digit ZIP code.");
  }

  if (!searchTerm.trim()) {
    throw new Error("Enter a product search term.");
  }

  // 1. Exchange client credentials for an access token.
  const token = await getKrogerAccessToken();

  // 2. Find stores near the ZIP code.
  const locations = await krogerGet<{ data?: KrogerStore[] }>(
    "locations",
    new URLSearchParams({
      "filter.zipCode.near": zipCode,
      "filter.radiusInMiles": "15",
      "filter.limit": "5",
    }),
    token,
  );

  if (!locations.data?.length) {
    console.log(`No stores found near ${zipCode}.`);
    return;
  }

  console.log("Stores returned:");
  console.table(
    locations.data.map((store) => ({
      locationId: store.locationId,
      name: store.name,
      address: store.address?.addressLine1,
      city: store.address?.city,
    })),
  );

  // For this experiment, use the first returned store.
  const store = locations.data[0];

  console.log(`\nSearching "${searchTerm}" at ${store.name}`);
  console.log(`Location ID: ${store.locationId}`);

  // 3. Search products at that store to retrieve local prices.
  const products = await krogerGet<{ data?: KrogerProduct[] }>(
    "products",
    new URLSearchParams({
      "filter.term": searchTerm,
      "filter.locationId": store.locationId,
      "filter.limit": "5",
    }),
    token,
  );

  if (!products.data?.length) {
    console.log("No matching products found at this store.");
    return;
  }

  // 4. Display each item's package size and available prices.
  const rows = products.data.flatMap((product) =>
    (product.items ?? []).map((item) => ({
      productId: product.productId,
      itemId: item.itemId,
      name: product.description,
      packageSize: item.size ?? "Unknown",
      regularPrice: item.price?.regular ?? null,
      promotionalPrice: item.price?.promo ?? null,
    })),
  );

  console.table(rows);
  console.log("Prices are in USD. Null means the price was not provided.");
}

main().catch((error: unknown) => {
  // Do not print credentials, access tokens, or raw response bodies.
  const message =
    error instanceof Error ? error.message : "Unknown request error";

  console.error(message);
  process.exitCode = 1;
});

export {};
