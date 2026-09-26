import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const params = await context.params;
  let path: string[];
  try {
    path = params.path.map((segment) => decodeURIComponent(segment));
  } catch {
    return Response.json({ error: "Invalid path." }, { status: 400 });
  }
  const route = path.join("/");
  const allowed =
    /^(nearby|geocode|events|events\/community_event:[a-f0-9-]+(?:\/cancel)?)$/.test(
      route,
    );
  if (!allowed) return Response.json({ error: "Not found." }, { status: 404 });
  const writing = request.method === "POST";
  if (writing && request.headers.get("origin") !== request.nextUrl.origin)
    return Response.json(
      { error: "This action must come from this site." },
      { status: 403 },
    );
  const token = process.env.LOCATION_SERVICE_TOKEN;
  if (!token)
    return Response.json(
      {
        error:
          "Location service is not running. Start the app with npm run dev.",
      },
      { status: 503 },
    );
  let body: string | undefined;
  if (writing) {
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return Response.json({ error: "Expected JSON." }, { status: 415 });
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    if (reader)
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 20000) {
          await reader.cancel();
          return Response.json(
            { error: "Post is too large." },
            { status: 413 },
          );
        }
        chunks.push(value);
      }
    body = Buffer.concat(chunks).toString("utf8");
  }
  try {
    const base = process.env.LOCATION_SERVICE_URL ?? "http://127.0.0.1:8765";
    const url = new URL(`/${path.map(encodeURIComponent).join("/")}`, base);
    url.search = request.nextUrl.search;
    const response = await fetch(url, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(95000),
    });
    const data = await response.json();
    return Response.json(data, {
      status: response.status,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return Response.json(
      {
        error:
          "Location service could not respond. Check that both app services are running, then retry.",
      },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
