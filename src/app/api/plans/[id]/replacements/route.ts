import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { database, getJob } from "@/lib/meal-planning/store";
import {
  session,
  sameOrigin,
  readBody,
  failure,
} from "@/lib/meal-planning/http";
import { buildWeeklyPlan, mealCost } from "@/lib/meal-planning/assembly";
import { allowed } from "@/lib/meal-planning/catalog";
import type { PlanSnapshot } from "@/lib/meal-planning/types";
function slot(snapshot: PlanSnapshot, slotId: string) {
  const plan = buildWeeklyPlan(snapshot);
  const day = plan.days.findIndex((d) => d.meals.some((m) => m.id === slotId));
  if (day < 0) throw new Error("Meal slot not found.");
  const meal = plan.days[day].meals.find((m) => m.id === slotId)!;
  return snapshot.selections.find(
    (s) => s.day === day && s.category === meal.slot.toLowerCase(),
  )!;
}
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = session(request);
    if (!owner) return failure(new Error("Plan not found."), 404);
    const job = await getJob(
      z
        .string()
        .uuid()
        .parse((await params).id),
      owner.owner,
    );
    if (!job?.snapshot || job.status !== "ready")
      return failure(new Error("Plan not found."), 404);
    const s = job.snapshot,
      current = slot(s, request.nextUrl.searchParams.get("slotId") ?? "");
    const currentRecipe = s.recipes.find((r) => r.id === current.recipeId)!;
    const choices = s.rankings[current.category]
      .filter((r) => r.id !== current.recipeId)
      .filter((r) =>
        allowed(
          s.recipes.find((m) => m.id === r.id)!,
          s.preferences,
        ),
      )
      .slice(0, 10)
      .map((r) => {
        const recipe = s.recipes.find((m) => m.id === r.id)!;
        return {
          id: r.id,
          name: recipe.name,
          portion: r.portion,
          distance: r.distance,
          costDeltaCents:
            mealCost(recipe, r.portion, s.preferences.people) -
            mealCost(currentRecipe, current.portion, s.preferences.people),
          nutritionDelta: Object.fromEntries(
            Object.keys(recipe.nutrition).map((k) => {
              const key = k as keyof typeof recipe.nutrition;
              return [
                key,
                Math.round(
                  ((recipe.nutrition[key] * r.portion) / recipe.yield -
                    (currentRecipe.nutrition[key] * current.portion) /
                      currentRecipe.yield) *
                    10,
                ) / 10,
              ];
            }),
          ),
        };
      });
    return NextResponse.json(
      { choices, version: job.version },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const owner = session(request);
    if (!owner) return failure(new Error("Plan not found."), 404);
    const input = z
      .object({
        slotId: z.string(),
        recipeId: z.string(),
        version: z.number().int().positive(),
      })
      .parse(await readBody(request));
    const job = await getJob(
      z
        .string()
        .uuid()
        .parse((await params).id),
      owner.owner,
    );
    if (!job?.snapshot || job.status !== "ready")
      return failure(new Error("Plan not found."), 404);
    const s = job.snapshot,
      current = slot(s, input.slotId),
      rank = s.rankings[current.category].find((r) => r.id === input.recipeId),
      recipe = s.recipes.find((r) => r.id === input.recipeId);
    if (!rank || !recipe || !allowed(recipe, s.preferences))
      throw new Error("This replacement does not meet your restrictions.");
    current.recipeId = rank.id;
    current.portion = rank.portion;
    const plan = buildWeeklyPlan(s);
    const { data, error } = await database()
      .from("planner_jobs")
      .update({ snapshot: s, plan, version: job.version + 1 })
      .eq("id", job.id)
      .eq("owner_hash", owner.owner)
      .eq("version", input.version)
      .select("id")
      .maybeSingle();
    if (error || !data)
      return failure(
        new Error("The plan changed. Refresh before replacing this meal."),
        409,
      );
    return NextResponse.json({ plan, version: job.version + 1 });
  } catch (error) {
    return failure(error);
  }
}
