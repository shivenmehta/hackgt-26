export type Pin = { latitude: number; longitude: number };
export type FoodPlace = Pin & {
  place_id: string;
  name: string;
  address: string;
  distance_miles?: number;
  ui_category?: string;
  service_labels?: string[];
  source_groups?: string[];
  phone?: string;
  website?: string;
  message?: string;
  foods?: string[];
  starts_at?: string;
  ends_at?: string;
  status?: string;
  possible_duplicate_ids?: string[];
  reported_by_urgent_endpoint?: boolean;
  availability?: {
    status: string;
    hours_known: boolean;
    schedules: { source: string; hours?: unknown }[];
  };
};
export type SearchResult = {
  ui_categories: {
    general_food_resources: FoodPlace[];
    snap_and_assistance: FoodPlace[];
  };
  source_status: Record<string, string>;
  source_errors: string[];
  limitations: string[];
  attribution?: string;
  fetched_at?: string;
  feedam_attribution?: string;
  snap_snapshot?: { retrieved_on: string };
  feedam_endpoints?: Record<string, { possibly_truncated?: boolean }>;
};
export async function api<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/location/${path}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    signal,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Request failed. Please retry.");
  return data;
}
export function eventTime(value: string) {
  // Preserve the event's submitted wall time and UTC offset, independent of viewer timezone.
  const wall = value.slice(0, 16);
  const offset = value.endsWith("Z") ? "+00:00" : value.slice(-6);
  return `${new Date(`${wall}Z`).toLocaleString(undefined, { timeZone: "UTC", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} (UTC${offset})`;
}
export function safeWebsite(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
