import { defineConfig, devices } from "@playwright/test";

const viewports = [390, 768, 1024, 1280, 1440, 1920];

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /visual-foundations\.spec\.ts$/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results/visual-foundations/artifacts",
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
  projects: viewports.map((width) => ({
    name: `chromium-${width}`,
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width, height: width <= 768 ? 844 : 900 },
    },
  })),
});
