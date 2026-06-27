import { defineConfig, devices } from "@playwright/test";

const skipWebServer = process.env.E2E_SKIP_WEBSERVER === "true";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /guided-assistant-(journeys|scenarios)\.spec\.ts$/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"]],
  outputDir: "test-results/guided-journeys/artifacts",
  webServer: skipWebServer
    ? undefined
    : {
        command: "E2E_DISABLE_RATE_LIMIT=true npm run dev:next",
        url: "http://localhost:3000/login",
        timeout: 120_000,
        reuseExistingServer: true,
      },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    headless: true,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
