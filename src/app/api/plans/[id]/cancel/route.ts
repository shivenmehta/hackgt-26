import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getJob } from "@/lib/meal-planning/store";
import { cancelOwnedJob } from "@/lib/meal-planning/lifecycle";
import { sameOrigin, session, failure } from "@/lib/meal-planning/http";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const owner = session(request);
    if (!owner) return failure(new Error("Plan not found."), 404);
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const job = await getJob(id, owner.owner);
    if (!job) return failure(new Error("Plan not found."), 404);
    if (job.status === "ready")
      return failure(
        new Error("This plan is already complete. Refresh to view it."),
        409,
      );
    await cancelOwnedJob(job);
    return NextResponse.json(
      { id, status: job.status === "failed" ? "failed" : "cancelled" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
