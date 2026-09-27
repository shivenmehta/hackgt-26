import { createClient } from "@supabase/supabase-js";
import type { PlanJob } from "./types";
export function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "Planner storage is not configured. Add SUPABASE_SECRET_KEY on the server and apply the planner migration.",
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function getJob(
  id: string,
  owner?: string,
): Promise<PlanJob | null> {
  let query = database().from("planner_jobs").select("*").eq("id", id);
  if (owner) query = query.eq("owner_hash", owner);
  const { data, error } = await query.maybeSingle();
  if (error)
    throw new Error(
      "Planner storage is unavailable. Check the planner migration.",
    );
  return data;
}
export async function updateJob(id: string, patch: Partial<PlanJob>) {
  const activeOnly =
    patch.status === "running" ||
    patch.status === "ready" ||
    patch.status === "failed";
  const { data, error } = await database()
    .from("planner_jobs")
    .update(patch)
    .eq("id", id)
    .in(
      "status",
      activeOnly ? ["queued", "running"] : ["queued", "running", "ready"],
    )
    .select("id")
    .maybeSingle();
  if (error) throw new Error("Could not save planner progress.");
  if (!data)
    throw new (await import("workflow")).FatalError(
      "This plan has stopped. Build a new week from preferences.",
    );
}
export async function assertActive(id: string) {
  const job = await getJob(id);
  if (!job || !["queued", "running"].includes(job.status))
    throw new (await import("workflow")).FatalError("This plan has stopped.");
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const { data, error } = await database()
    .from("planner_cache")
    .select("value")
    .eq("key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error("Planner cache is unavailable.");
  return data?.value ?? null;
}
export async function cachePut(key: string, value: unknown, hours: number) {
  const { error } = await database()
    .from("planner_cache")
    .upsert({
      key,
      value,
      expires_at: new Date(Date.now() + hours * 3600000).toISOString(),
    });
  if (error) throw new Error("Could not cache planner data.");
}
