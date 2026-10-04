// Local evidence only (ticket 19): never part of CI. Runs tests/bench/*.bench.ts, one scenario per process, with the project's aliases.
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "../../src"), "server-only": path.resolve(__dirname, "../stubs/server-only.ts") } },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/bench/*.bench.ts"],
    pool: "forks",
    fileParallelism: false,
    testTimeout: 600_000,
  },
});
