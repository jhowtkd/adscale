import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const shared = {
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../src"),
      "server-only": path.resolve(__dirname, "../tests/stubs/server-only.ts"),
    },
  },
  test: {
    globals: true,
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    setupFiles: ["./tests/setup.ts"],
    env: {
      ...(process.env.TEST_DATABASE_URL
        ? { TEST_DATABASE_URL: process.env.TEST_DATABASE_URL }
        : {}),
      E2E_DISABLE_RATE_LIMIT: "true",
    },
  },
};

const nodeIncludes = [
  "src/server/**/*.test.ts",
  "src/app/api/**/*.test.ts",
  "tests/integration/**/*.test.ts",
];

export default defineConfig({
  ...shared,
  test: {
    ...shared.test,
    projects: [
      {
        ...shared,
        test: {
          ...shared.test,
          name: "node",
          environment: "node",
          include: nodeIncludes,
        },
      },
      {
        ...shared,
        test: {
          ...shared.test,
          name: "jsdom",
          environment: "jsdom",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts", "tests/**/*.test.tsx"],
          exclude: [...shared.test.exclude, ...nodeIncludes],
        },
      },
    ],
  },
});
