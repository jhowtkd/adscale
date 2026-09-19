import { defineConfig, devices } from "@playwright/test";

/**
 * Local E2E config for the restyle upload flows (TC014 / TC019).
 *
 * These two cases require attaching real image files to <input type="file">,
 * which the TestSprite cloud runner cannot do. They run against an already
 * running server (npm run start) on http://localhost:3000 started with
 * E2E_DISABLE_RATE_LIMIT=true and the Inngest dev server up.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts$/,
  // OpenAI gpt-image generation runs async via Inngest (~70s), so give each
  // test a generous budget.
  timeout: 360_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "isolated-visual",
      testMatch: /visual-(shell|foundations|release-gate|a11y-gate)\.spec\.ts$/,
      fullyParallel: false,
      workers: 1,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "serial-flows",
      testMatch: /(restyle|assistant|guided|template-materialize|create-post|creative-directions|frictionless-home|phase6-gate6-uat|layer-editor|carousel|critical-studio-journey|first-studio-piece|worker-journey|hi-unified-hosting|guest-home-public|guest-home-auth|guest-home-entry).*\.spec\.ts$/,
      fullyParallel: false,
      workers: 1,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "guest-home-chromium",
      testMatch: /guest-home-.*\.spec\.ts$/,
      fullyParallel: false,
      workers: 1,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "guest-home-webkit",
      testMatch: /guest-home-(public|storage)\.spec\.ts$/,
      fullyParallel: false,
      workers: 1,
      use: { ...devices["iPhone 13"] },
    },
  ],
});
