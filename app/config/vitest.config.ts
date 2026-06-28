import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // Playwright E2E specs (tests/e2e) run via `npm run test:e2e`, not vitest.
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    setupFiles: ["./tests/setup.ts"],
    env: {
      ...(process.env.TEST_DATABASE_URL
        ? { TEST_DATABASE_URL: process.env.TEST_DATABASE_URL }
        : {}),
      E2E_DISABLE_RATE_LIMIT: "true",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../src"),
      "server-only": path.resolve(__dirname, "../tests/stubs/server-only.ts"),
    },
  },
});
