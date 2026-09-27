import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { z } from "zod";
import { planWorkflow } from "@/lib/meal-planning/workflow";
import {
  preferenceSchema,
  mondayDate,
  dailyTargets,
} from "@/lib/meal-planning/validation";
import { database } from "@/lib/meal-planning/store";
import {
  failure,
  hash,
  readBody,
  sameOrigin,
  session,
  setSession,
} from "@/lib/meal-planning/http";
import type { PlanJob } from "@/lib/meal-planning/types";
import { reconcileJob } from "@/lib/meal-planning/lifecycle";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const owner = session(request, true)!;
    const input = z
      .object({
        preferences: preferenceSchema,
        localDate: z.string(),
        idempotencyKey: z.string().uuid(),
      })
      .parse(await readBody(request));
    const preferences = {
      ...input.preferences,
      dailyCalories: dailyTargets(input.preferences).calories,
    };
    const week = mondayDate(input.localDate);
    if (Math.abs(Date.parse(week) - Date.now()) > 14 * 86400000)
      throw new Error("Check your device date before building a plan.");
    for (const key of [
      "RANKER_SERVICE_URL",
      "RANKER_SERVICE_TOKEN",
      "KROGER_CLIENT_ID",
      "KROGER_CLIENT_SECRET",
    ])
      if (!process.env[key])
        throw new Error(`Server configuration missing: ${key}.`);
    if (!process.env.GROK_API_KEY && !process.env.XAI_API_KEY)
      throw new Error("Server configuration missing: GROK_API_KEY.");
    const db = database();
    const { data, error } = await db.rpc("planner_admit", {
      p_owner: owner.owner,
      p_key: input.idempotencyKey,
      p_hash: hash(JSON.stringify({ preferences, week })),
      p_preferences: preferences,
      p_week: week,
      p_ip: hash(
        request.headers.get("x-vercel-forwarded-for")?.split(",")[0] ?? "local",
      ),
    });
    if (error?.message.includes("already running")) {
      const { data: active, error: lookupError } = await db
        .from("planner_jobs")
        .select("*")
        .eq("owner_hash", owner.owner)
        .in("status", ["queued", "running"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lookupError && active) {
        const current = await reconcileJob(active as PlanJob);
        if (["queued", "running"].includes(current.status))
          return setSession(
            NextResponse.json(
              {
                error:
                  "A plan is already running. Resume it or cancel it before building another week.",
                activeJobId: current.id,
              },
              { status: 409 },
            ),
            owner.cookie,
          );
        return failure(
          new Error(
            "The previous plan has stopped. Submit again to build a new week.",
          ),
          409,
        );
      }
    }
    if (error)
      throw new Error(
        /already running|Idempotency/.test(error.message)
          ? error.message
          : "Planner storage is unavailable. Apply the planner migration.",
      );
    const { job, created } = data as { job: PlanJob; created: boolean };
    if (created) {
      try {
        const run = await start(planWorkflow, [job.id]);
        await db
          .from("planner_jobs")
          .update({ workflow_id: run.runId })
          .eq("id", job.id);
      } catch {
        await db
          .from("planner_jobs")
          .update({
            status: "failed",
            error:
              "The planning workflow could not start. Please submit again.",
          })
          .eq("id", job.id);
        throw new Error(
          "The planning workflow could not start. Please submit again.",
        );
      }
    }
    return setSession(
      NextResponse.json({ id: job.id, status: job.status }, { status: 202 }),
      owner.cookie,
    );
  } catch (error) {
    return failure(error);
  }
}
