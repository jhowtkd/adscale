import { defineConfig, devices } from "@playwright/test";
import { RELEASE_VIEWPORTS } from "./tests/e2e/support/visual-auth";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /visual-(release-gate|a11y-gate)\.spec\.ts$/,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results/visual-release-gate/artifacts",
  webServer: {
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
    colorScheme: "light",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    ...RELEASE_VIEWPORTS.map((width) => ({
      name: `layout-${width}`,
      testMatch: /visual-release-gate\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width, height: width <= 768 ? 844 : 900 },
      },
    })),
    {
      name: "a11y-390",
      testMatch: /visual-a11y-gate\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "a11y-1280",
      testMatch: /visual-a11y-gate\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
});
