import { getRun } from "workflow/api";
import { database } from "./store";
import type { PlanJob } from "./types";
export async function cancelOwnedJob(job: PlanJob) {
  const { data, error } = await database()
    .from("planner_jobs")
    .update({
      status: "cancelled",
      stage: "Plan cancelled",
      error: null,
      images_done: true,
    })
    .eq("id", job.id)
    .eq("owner_hash", job.owner_hash)
    .in("status", ["queued", "running"])
    .select("id")
    .maybeSingle();
  if (error) throw new Error("Could not cancel the plan. Please try again.");
  if (data && job.workflow_id) {
    try {
      await getRun(job.workflow_id).cancel();
    } catch {
      /* Persistent cancellation fences later steps even if the local workflow runtime was stopped. */
    }
  }
  return !!data;
}
/** Only reconcile confirmed terminal workflows, never infer cancellation from a network error. */
export async function reconcileJob(job: PlanJob): Promise<PlanJob> {
  if (!["queued", "running"].includes(job.status) || !job.workflow_id)
    return job;
  try {
    const run = getRun(job.workflow_id);
    if (!(await run.exists)) return job; // Another deployment/local runtime may own this run.
    const status = await run.status;
    if (!["failed", "cancelled", "completed"].includes(status)) return job;
    const next = status === "cancelled" ? "cancelled" : "failed";
    const message =
      status === "cancelled"
        ? "Plan cancelled. You can build a new week."
        : "The previous planning process stopped before saving a plan. Please build a new week.";
    const { data, error } = await database()
      .from("planner_jobs")
      .update({ status: next, stage: "Planning stopped", error: message })
      .eq("id", job.id)
      .eq("owner_hash", job.owner_hash)
      .in("status", ["queued", "running"])
      .select("id")
      .maybeSingle();
    if (!error && data) return { ...job, status: next, error: message };
  } catch {
    /* An unavailable workflow service must not cancel a healthy job. */
  }
  return job;
}
