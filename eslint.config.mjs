import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  prettier,
  globalIgnores([
    ".next/**",
    ".venv/**",
    "src/app/.well-known/workflow/**",
    "out/**",
    "dist/**",
    "coverage/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);
