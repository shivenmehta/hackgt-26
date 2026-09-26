import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  outputDir: "test-results/playwright-bridge",
  testMatch: "bridge.spec.ts",
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:3100",
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm start -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
