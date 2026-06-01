/**
 * Benchmark getDashboardStats against DATABASE_URL from .env.local.
 * Usage: node scripts/bench-dashboard-stats.mjs [workspaceId]
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const workspaceId = process.argv[2];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing — set in .env.local");
    process.exit(1);
  }

  const { db } = await import("../src/server/db/index.ts");
  const { workspaces } = await import("../src/server/db/schema.ts");
  const { getDashboardStats } = await import("../src/server/repositories/dashboard.ts");

  let wsId = workspaceId;
  if (!wsId) {
    const rows = await db.select({ id: workspaces.id }).from(workspaces).limit(1);
    wsId = rows[0]?.id;
  }

  if (!wsId) {
    console.error("No workspace found — pass workspace UUID as argv[2]");
    process.exit(1);
  }

  console.log(`workspace: ${wsId}`);
  console.log("warming up...");
  await getDashboardStats(wsId, "month");

  const runs = 5;
  const times = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    const stats = await getDashboardStats(wsId, "month");
    const ms = performance.now() - t0;
    times.push(ms);
    if (i === 0) {
      console.log(
        `sample: campaigns=${stats.totalCampaigns} derivations=${stats.totalDerivations}`
      );
    }
  }

  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length / 2)];
  const p95 = times[Math.ceil(times.length * 0.95) - 1];
  console.log(`runs: ${runs}`);
  console.log(`ms: min=${times[0].toFixed(0)} p50=${p50.toFixed(0)} p95=${p95.toFixed(0)} max=${times[times.length - 1].toFixed(0)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
