import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getJob, cacheGet } from "@/lib/meal-planning/store";
import { session, failure } from "@/lib/meal-planning/http";
import { reconcileJob } from "@/lib/meal-planning/lifecycle";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = session(request);
    if (!owner) return failure(new Error("Plan not found."), 404);
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    let job = await getJob(id, owner.owner);
    if (!job) return failure(new Error("Plan not found."), 404);
    job = await reconcileJob(job);
    if (job.plan && job.snapshot) {
      const images = new Map(
        await Promise.all(
          job.snapshot.recipes
            .filter((r) =>
              job.snapshot!.selections.some((s) => s.recipeId === r.id),
            )
            .map(
              async (r) =>
                [
                  r.id,
                  await cacheGet<string>("image-v1:" + r.fingerprint),
                ] as const,
            ),
        ),
      );
      for (const day of job.plan.days)
        for (const meal of day.meals) {
          const url = images.get(meal.recipe.id);
          if (url) {
            meal.recipe.imageUrl = url;
            meal.recipe.aiImage = true;
          }
        }
    }
    return NextResponse.json(
      {
        id: job.id,
        status: job.status,
        stage: job.stage,
        error: job.error,
        plan: job.plan,
        version: job.version,
        imagesDone: job.images_done,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
