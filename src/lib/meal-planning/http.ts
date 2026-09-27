import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
export const sessionCookie = "bridge-planner-session";
export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function signature(value: string) {
  const key = process.env.PLANNER_SESSION_SECRET;
  if (!key || key.length < 32)
    throw new Error(
      "Set PLANNER_SESSION_SECRET to a random server-only value of at least 32 characters.",
    );
  return createHmac("sha256", key).update(value).digest("hex");
}
export function session(request: NextRequest, create = false) {
  const raw = request.cookies.get(sessionCookie)?.value;
  let value = "";
  if (raw) {
    const [id, sig] = raw.split(".");
    if (
      /^[a-f0-9]{64}$/.test(id ?? "") &&
      /^[a-f0-9]{64}$/.test(sig ?? "") &&
      timingSafeEqual(Buffer.from(sig), Buffer.from(signature(id)))
    )
      value = id;
  }
  if (!value && !create) return null;
  if (!value) value = randomBytes(32).toString("hex");
  return { owner: hash(value), cookie: value + "." + signature(value) };
}
export function setSession(response: NextResponse, cookie: string) {
  response.cookies.set(sessionCookie, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
export function sameOrigin(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    throw new Error("Invalid request origin.");
}
export async function readBody(request: NextRequest) {
  const text = await request.text();
  if (text.length > 20000) throw new Error("Request is too large.");
  return JSON.parse(text);
}
export function failure(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Request failed.";
  return NextResponse.json(
    {
      error:
        message.length > 500 ? "Invalid request. Check your inputs." : message,
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
