import { defineConfig } from "@playwright/test";
import { randomUUID } from "node:crypto";
export default defineConfig({
  testDir: "./tests",
  outputDir: "test-results/playwright-location",
  testMatch: "location.spec.ts",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://localhost:3101",
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/dev-location.mjs --production --port 3101",
    url: "http://localhost:3101",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      LOCATION_SERVICE_PORT: "8766",
      LOCATION_EVENTS_DB: `test-results/location-ui-${randomUUID()}.sqlite3`,
    },
  },
});
