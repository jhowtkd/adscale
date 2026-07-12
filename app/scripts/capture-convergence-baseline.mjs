#!/usr/bin/env node
/**
 * Capture the convergence baseline (Phase 0, step 4).
 *
 * Reads existing telemetry and operational tables and writes a JSON
 * snapshot broken down by creative-work origin (campaign, assistant,
 * quick_tool / Criar Post). The snapshot captures start, completion,
 * abandonment, error and latency counts so Phase 8 can measure whether
 * convergence actually improves the journey.
 *
 * This script is READ-ONLY against the database. It does not write to
 * application tables. It only writes the JSON snapshot file.
 *
 * Usage:
 *   DATABASE_URL=... node app/scripts/capture-convergence-baseline.mjs \
 *     [--since 2026-06-01] [--out .planning/convergence/baseline.json]
 *
 * If --since is omitted, the script uses the last 30 days.
 *
 * Plano de convergência, Fase 0, passo 4:
 * docs/plans/2026-07-12-convergencia-produto-arquitetura-implementation-plan.md
 */
import pg from "pg";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const defaultOutPath = resolve(repoRoot, ".planning/convergence/baseline.json");

function parseArgs(argv) {
  const args = { since: null, outPath: defaultOutPath };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--since") {
      args.since = argv[i + 1] ?? null;
      i += 1;
    } else if (token === "--out") {
      args.outPath = resolve(argv[i + 1] ?? "");
      i += 1;
    } else if (token === "--help" || token === "-h") {
      console.log(
        "Usage: node app/scripts/capture-convergence-baseline.mjs [--since YYYY-MM-DD] [--out PATH]"
      );
      process.exit(0);
    }
  }
  const sinceDate = args.since
    ? new Date(args.since)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(sinceDate.getTime())) {
    console.error(`CONVERGENCE-BASELINE: invalid --since value: ${args.since}`);
    process.exit(2);
  }
  return { ...args, sinceDate };
}

function failWithMissingDb() {
  console.error(
    "CONVERGENCE-BASELINE: DATABASE_URL is required (set in .env.local or env)."
  );
  process.exit(1);
}

async function safeQuery(client, label, sql, params = []) {
  try {
    return await client.query(sql, params);
  } catch (error) {
    console.warn(
      `CONVERGENCE-BASELINE: query "${label}" failed: ${error?.message ?? error}`
    );
    return { rows: [], error: error?.message ?? String(error) };
  }
}

function emptyMetric() {
  return {
    started: 0,
    completed: 0,
    abandoned: 0,
    failed: 0,
    medianDurationMs: null,
    sampleDurationMs: 0,
  };
}

function mergeMetric(metric, row) {
  metric.started += Number(row.started ?? 0);
  metric.completed += Number(row.completed ?? 0);
  metric.abandoned += Number(row.abandoned ?? 0);
  metric.failed += Number(row.failed ?? 0);
  return metric;
}

/**
 * Each origin has a different set of available signals today. The baseline
 * captures what exists now; the gaps are exactly what Phase 8 will fill.
 */
async function captureCampaignBaseline(client, sinceDate) {
  const metric = emptyMetric();
  // Campaigns: count status values directly. Status values today include
  // 'completed', 'failed' and others (see repository/campaign.ts); we treat
  // 'completed' as the completion signal and 'failed' as the error signal.
  const result = await safeQuery(
    client,
    "campaign_status",
    `
      SELECT
        COALESCE(status, 'unknown') AS status,
        COUNT(*)::int AS count
      FROM adscale_app.campaigns
      WHERE created_at >= $1
      GROUP BY status
    `,
    [sinceDate]
  );
  const byStatus = {};
  for (const row of result.rows ?? []) {
    const status = row.status;
    const count = Number(row.count ?? 0);
    byStatus[status] = count;
    metric.started += count;
    if (status === "completed") metric.completed += count;
    if (status === "failed") metric.failed += count;
  }

  const completion = await safeQuery(
    client,
    "campaign_completion",
    `
      SELECT
        COUNT(*)::int AS completed,
        AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000)::float AS medianDurationMs
      FROM adscale_app.campaigns
      WHERE created_at >= $1
        AND status = 'completed'
    `,
    [sinceDate]
  );
  if (completion.rows?.[0]) {
    metric.medianDurationMs =
      completion.rows[0].medianDurationMs != null
        ? Math.round(Number(completion.rows[0].medianDurationMs))
        : null;
    metric.sampleDurationMs = Number(completion.rows[0].completed ?? 0);
  }
  metric.byStatus = byStatus;
  return metric;
}

async function captureAssistantBaseline(client, sinceDate) {
  const metric = emptyMetric();
  // Assistant: read guided_flow_events.
  const started = await safeQuery(
    client,
    "assistant_started",
    `
      SELECT COUNT(*)::int AS started
      FROM adscale_app.assistant_guided_flow_events
      WHERE occurred_at >= $1
        AND event_key IN ('guided_flow_started')
    `,
    [sinceDate]
  );
  metric.started = Number(started.rows?.[0]?.started ?? 0);

  const completed = await safeQuery(
    client,
    "assistant_completed",
    `
      SELECT COUNT(*)::int AS completed
      FROM adscale_app.assistant_guided_flow_events
      WHERE occurred_at >= $1
        AND event_key IN ('guided_flow_completed')
    `,
    [sinceDate]
  );
  metric.completed = Number(completed.rows?.[0]?.completed ?? 0);

  const abandoned = await safeQuery(
    client,
    "assistant_abandoned",
    `
      SELECT COUNT(*)::int AS abandoned
      FROM adscale_app.assistant_guided_flow_events
      WHERE occurred_at >= $1
        AND event_key IN ('guided_flow_abandoned')
    `,
    [sinceDate]
  );
  metric.abandoned = Number(abandoned.rows?.[0]?.abandoned ?? 0);

  const failed = await safeQuery(
    client,
    "assistant_failed",
    `
      SELECT COUNT(*)::int AS failed
      FROM adscale_app.assistant_guided_flow_events
      WHERE occurred_at >= $1
        AND event_key IN ('guided_action_failed')
    `,
    [sinceDate]
  );
  metric.failed = Number(failed.rows?.[0]?.failed ?? 0);
  return metric;
}

async function captureQuickToolBaseline(client, sinceDate) {
  // Quick Tools / Criar Post uses the creative_work_outputs surface.
  // creative_works is the parent; creative_work_outputs are the rows.
  const metric = emptyMetric();
  const statusCounts = await safeQuery(
    client,
    "creative_work_status",
    `
      SELECT
        COALESCE(status, 'unknown') AS status,
        COUNT(*)::int AS started
      FROM adscale_app.creative_work_items
      WHERE created_at >= $1
      GROUP BY status
    `,
    [sinceDate]
  );
  for (const row of statusCounts.rows ?? []) {
    const started = Number(row.started ?? 0);
    metric.started += started;
    if (row.status === "completed") metric.completed += started;
    if (row.status === "failed") metric.failed += started;
  }
  return metric;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) failWithMissingDb();

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  let campaign, assistant, quickTool;
  try {
    [campaign, assistant, quickTool] = await Promise.all([
      captureCampaignBaseline(client, args.sinceDate),
      captureAssistantBaseline(client, args.sinceDate),
      captureQuickToolBaseline(client, args.sinceDate),
    ]);
  } finally {
    await client.end();
  }

  const snapshot = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    since: args.sinceDate.toISOString(),
    note: "Phase 0 baseline. Gaps per origin reflect missing instrumentation today and will be filled by Phase 8.",
    origins: {
      campaign,
      assistant,
      quick_tool: quickTool,
    },
    events: {
      canonical: [
        "creative_work_started",
        "briefing_ready",
        "generation_confirmed",
        "output_ready",
        "creative_work_reviewed",
        "creative_work_approved",
        "creative_work_delivered",
        "creative_work_abandoned",
        "creative_work_failed",
        "creative_work_reopened",
      ],
      reference:
        "src/server/creative-work/funnel-events.ts (CREATIVE_WORK_FUNNEL_EVENTS)",
    },
  };

  mkdirSync(dirname(args.outPath), { recursive: true });
  writeFileSync(args.outPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`CONVERGENCE-BASELINE: wrote ${args.outPath}`);
  console.log(
    `CONVERGENCE-BASELINE: campaign=${campaign.started}/${campaign.completed}, ` +
      `assistant=${assistant.started}/${assistant.completed}, ` +
      `quick_tool=${quickTool.started}/${quickTool.completed} ` +
      `(started/completed since ${args.sinceDate.toISOString()})`
  );
}

main().catch((error) => {
  console.error(
    `CONVERGENCE-BASELINE: unhandled error: ${error?.message ?? error}`
  );
  process.exit(1);
});
