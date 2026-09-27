import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": [
      "./data/mealdb/meals.json",
      "./data/grok-best-effort/**/*.json",
      "./data/planner/prepared.json",
    ],
  },
  experimental: {
    optimizePackageImports: ["@chakra-ui/react"],
  },
};

export default withWorkflow(nextConfig);
