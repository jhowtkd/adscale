#!/usr/bin/env node
/**
 * Capture the convergence baseline (Phase 0, step 4).
 *
 * Reads existing operational tables and writes a JSON snapshot broken
 * down by creative-work origin (campaign, assistant, quick_tool / Criar
 * Post). The snapshot captures, per unique journey:
 *   started, completed, abandoned, failed, median duration.
 *
 * Hardening (Gate 0 review):
 * - A failing mandatory query FAILS the snapshot (non-zero exit). We
 *   never write a baseline built from zeros caused by a schema, grant
 *   or connection error.
 * - An unavailable metric is declared explicitly, never silently zero.
 * - "median" is computed with PERCENTILE_CONT(0.5), never AVG.
 * - Counts are per unique journey (campaign id / guided flow id /
 *   creative work item id), never per raw event.
 *
 * This script is READ-ONLY against the database. It only writes the JSON
 * snapshot file.
 *
 * Usage:
 *   DATABASE_URL=... node app/scripts/capture-convergence-baseline.mjs \
 *     [--since 2026-06-01] [--out .planning/convergence/baseline.json]
 *
 * If --since is omitted, the script uses the last 30 days.
 *
 * Plano de convergência, Fase 0, passo 4.
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

class BaselineError extends Error {
  constructor(message, { query } = {}) {
    super(message);
    this.name = "BaselineError";
    this.query = query;
  }
}

/**
 * Mandatory query: any failure (schema, grant, syntax, connection) is
 * fatal. We never fall back to zeros.
 */
async function requireQuery(client, label, sql, params = []) {
  try {
    return await client.query(sql, params);
  } catch (error) {
    throw new BaselineError(
      `mandatory query "${label}" failed: ${error?.message ?? error}`,
      { query: label }
    );
  }
}

/**
 * Aggregate journey counts from a single status-histogram query.
 * Returns a metric object with 5 fields, all per unique journey:
 *   started, completed, abandoned, failed, medianDurationMs.
 *
 * abandoned = started - completed - failed (defensive; clamped at 0).
 * This works even when the source table has no explicit abandoned state
 * (campaigns, creative_work_items).
 */
function metricFromHistogram(rows, { completedStatuses, failedStatuses }) {
  const metric = {
    started: 0,
    completed: 0,
    abandoned: 0,
    failed: 0,
    medianDurationMs: { available: false, valueMs: null, sample: 0 },
  };
  for (const row of rows) {
    const status = row.status ?? "unknown";
    const count = Number(row.count ?? 0);
    metric.started += count;
    if (completedStatuses.includes(status)) metric.completed += count;
    if (failedStatuses.includes(status)) metric.failed += count;
  }
  metric.abandoned = Math.max(
    0,
    metric.started - metric.completed - metric.failed
  );
  return metric;
}

function attachMedian(metric, medianRow) {
  const sample = Number(medianRow?.sample ?? 0);
  const value =
    medianRow?.medianMs != null ? Math.round(Number(medianRow.medianMs)) : null;
  metric.medianDurationMs = {
    available: sample > 0 && value != null,
    valueMs: value,
    sample,
  };
  return metric;
}

async function captureCampaignBaseline(client, sinceDate) {
  // Per unique campaign (journey = one campaign row).
  const statusRows = (
    await requireQuery(
      client,
      "campaign_status_histogram",
      `
        SELECT
          COALESCE(status, 'unknown') AS status,
          COUNT(*)::int AS count
        FROM adscale_app.campaigns
        WHERE created_at >= $1
        GROUP BY status
      `,
      [sinceDate]
    )
  ).rows;

  const metric = metricFromHistogram(statusRows, {
    completedStatuses: ["completed"],
    failedStatuses: ["failed"],
  });

  const medianRow = (
    await requireQuery(
      client,
      "campaign_duration_median",
      `
        SELECT
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000))::float AS "medianMs",
          COUNT(*)::int AS sample
        FROM adscale_app.campaigns
        WHERE created_at >= $1
          AND status = 'completed'
          AND updated_at >= created_at
      `,
      [sinceDate]
    )
  ).rows[0];

  return {
    ...attachMedian(metric, medianRow),
    source: "adscale_app.campaigns",
    unit: "campaign",
  };
}

async function captureAssistantBaseline(client, sinceDate) {
  // Per unique guided flow (journey = one assistant_guided_flows row).
  const statusRows = (
    await requireQuery(
      client,
      "assistant_flow_status_histogram",
      `
        SELECT
          COALESCE(status, 'unknown') AS status,
          COUNT(*)::int AS count
        FROM adscale_app.assistant_guided_flows
        WHERE created_at >= $1
        GROUP BY status
      `,
      [sinceDate]
    )
  ).rows;

  const metric = metricFromHistogram(statusRows, {
    completedStatuses: ["completed", "done", "approved"],
    failedStatuses: ["failed", "error"],
  });

  const medianRow = (
    await requireQuery(
      client,
      "assistant_flow_duration_median",
      `
        SELECT
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000))::float AS "medianMs",
          COUNT(*)::int AS sample
        FROM adscale_app.assistant_guided_flows
        WHERE created_at >= $1
          AND status IN ('completed', 'done', 'approved')
          AND updated_at >= created_at
      `,
      [sinceDate]
    )
  ).rows[0];

  return {
    ...attachMedian(metric, medianRow),
    source: "adscale_app.assistant_guided_flows",
    unit: "guided_flow",
  };
}

async function captureQuickToolBaseline(client, sinceDate) {
  // Per unique creative work item (journey = one creative_work_items row).
  const statusRows = (
    await requireQuery(
      client,
      "creative_work_status_histogram",
      `
        SELECT
          COALESCE(status, 'unknown') AS status,
          COUNT(*)::int AS count
        FROM adscale_app.creative_work_items
        WHERE created_at >= $1
        GROUP BY status
      `,
      [sinceDate]
    )
  ).rows;

  const metric = metricFromHistogram(statusRows, {
    completedStatuses: ["completed"],
    failedStatuses: ["failed"],
  });

  const medianRow = (
    await requireQuery(
      client,
      "creative_work_duration_median",
      `
        SELECT
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000))::float AS "medianMs",
          COUNT(*)::int AS sample
        FROM adscale_app.creative_work_items
        WHERE created_at >= $1
          AND status = 'completed'
          AND updated_at >= created_at
      `,
      [sinceDate]
    )
  ).rows[0];

  return {
    ...attachMedian(metric, medianRow),
    source: "adscale_app.creative_work_items",
    unit: "creative_work_item",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      "CONVERGENCE-BASELINE: DATABASE_URL is required (set in .env.local or env)."
    );
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  let campaign, assistant, quickTool;
  try {
    [campaign, assistant, quickTool] = await Promise.all([
      captureCampaignBaseline(client, args.sinceDate),
      captureAssistantBaseline(client, args.sinceDate),
      captureQuickToolBaseline(client, args.sinceDate),
    ]);
  } catch (error) {
    if (error instanceof BaselineError) {
      console.error(`CONVERGENCE-BASELINE: ${error.message}`);
      console.error(
        "CONVERGENCE-BASELINE: refusing to write a baseline that may be built from missing data. Fix the query or grant and re-run."
      );
      process.exit(1);
    }
    throw error;
  } finally {
    await client.end();
  }

  const snapshot = {
    schemaVersion: 2,
    capturedAt: new Date().toISOString(),
    since: args.sinceDate.toISOString(),
    semantics:
      "Counts are per unique journey (campaign id / guided flow id / creative work item id), never per raw event. Abandoned = started - completed - failed (defensive; negative clamped to zero). medianDurationMs is PERCENTILE_CONT(0.5). When a metric cannot be computed it is declared { available: false }, never zero.",
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
  const fmt = (m) =>
    `${m.started}/${m.completed}/${m.abandoned}/${m.failed}` +
    (m.medianDurationMs.available
      ? `/p50=${m.medianDurationMs.valueMs}ms(n=${m.medianDurationMs.sample})`
      : "/p50=n/a");
  console.log(
    `CONVERGENCE-BASELINE: campaign ${fmt(campaign)}, assistant ${fmt(
      assistant
    )}, quick_tool ${fmt(quickTool)} (started/completed/abandoned/failed since ${args.sinceDate.toISOString()})`
  );
}

main().catch((error) => {
  console.error(
    `CONVERGENCE-BASELINE: unhandled error: ${error?.message ?? error}`
  );
  process.exit(1);
});
