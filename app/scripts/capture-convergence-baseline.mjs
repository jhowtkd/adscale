#!/usr/bin/env node
/**
 * Capture the convergence baseline (Phase 0, step 4).
 *
 * Reads existing operational tables and writes a JSON snapshot broken
 * down by creative-work origin (campaign, assistant, quick_tool / Criar
 * Post). The snapshot captures, per unique journey:
 *   started, completed, abandoned, failed, median duration.
 *
 * Hardening (Gate 0 review rounds 1 + 2):
 * - A failing mandatory query FAILS the snapshot (non-zero exit). We
 *   never write a baseline built from zeros caused by a schema, grant
 *   or connection error.
 * - An unavailable metric is declared explicitly, never silently zero.
 * - "median" is computed with PERCENTILE_CONT(0.5), never AVG.
 * - Counts are per unique journey (campaign id / guided flow id /
 *   creative work item id), never per raw event.
 * - Abandoned is NEVER computed as "started - completed - failed":
 *   that formula misclassifies in-flight work. Each origin uses an
 *   explicit signal (status='abandoned' on guided flows) or declares
 *   the metric unavailable.
 * - Assistant failures come from guided_action_failed events aggregated
 *   by guided_flow_id (one failed journey = at least one failed action),
 *   never from a status enum that does not exist.
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
 * Metric shape carried per origin. abandoned/failed may be
 * { available: false } when there is no reliable signal today.
 * Phase 8 will fill these in.
 */
function newMetric() {
  return {
    started: 0,
    completed: 0,
    abandoned: { available: false, value: null, reason: "not computed" },
    failed: { available: false, value: null, reason: "not computed" },
    medianDurationMs: { available: false, valueMs: null, sample: 0 },
  };
}

function unavailable(reason) {
  return { available: false, value: null, reason };
}

function availableMetric(value) {
  return { available: true, value: Number(value ?? 0), reason: null };
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

  const metric = newMetric();
  // Campaigns: completed/failed come from status values. Abandoned is
  // NOT derivable from status today (active/draft/pending/analyzing are
  // in-flight, not abandoned). Declare unavailable rather than infer.
  for (const row of statusRows) {
    const status = row.status ?? "unknown";
    const count = Number(row.count ?? 0);
    metric.started += count;
    if (status === "completed") metric.completed += count;
    if (status === "failed") metric.failed = availableMetric((metric.failed.available ? metric.failed.value : 0) + count);
  }
  metric.abandoned = unavailable(
    "campaign status has no 'abandoned' value; in-flight states (active/draft/pending/analyzing) must not be misclassified as abandoned"
  );
  if (!metric.failed.available) {
    metric.failed = unavailable(
      "no campaigns with status='failed' in window (signal exists but sample is zero)"
    );
  }

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
  // GuidedFlowStatus = "active" | "completed" | "abandoned" | "blocked".
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

  const metric = newMetric();
  let abandonedCount = 0;
  for (const row of statusRows) {
    const status = row.status ?? "unknown";
    const count = Number(row.count ?? 0);
    metric.started += count;
    if (status === "completed") metric.completed += count;
    if (status === "abandoned") abandonedCount += count;
  }
  metric.abandoned = availableMetric(abandonedCount);
  // Note: 'blocked' is NOT counted as failed here. Blocked = waiting on
  // user input or a dependency, not an error. Failures come from the
  // action-level event below.

  // Failures: aggregate guided_action_failed events by guided_flow_id so
  // each journey is counted at most once. Flows without a guided_flow_id
  // binding are grouped by thread_id (journey still unique per thread).
  const failedRows = (
    await requireQuery(
      client,
      "assistant_action_failed_journeys",
      `
        SELECT COUNT(DISTINCT COALESCE(guided_flow_id, thread_id))::int AS failed_journeys
        FROM adscale_app.assistant_guided_flow_events
        WHERE occurred_at >= $1
          AND event_key = 'guided_action_failed'
      `,
      [sinceDate]
    )
  ).rows;
  metric.failed = availableMetric(Number(failedRows[0]?.failed_journeys ?? 0));

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
          AND status = 'completed'
          AND updated_at >= created_at
      `,
      [sinceDate]
    )
  ).rows[0];

  return {
    ...attachMedian(metric, medianRow),
    source:
      "adscale_app.assistant_guided_flows + assistant_guided_flow_events (failed)",
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

  const metric = newMetric();
  for (const row of statusRows) {
    const status = row.status ?? "unknown";
    const count = Number(row.count ?? 0);
    metric.started += count;
    if (status === "completed") metric.completed += count;
    if (status === "failed") metric.failed = availableMetric((metric.failed.available ? metric.failed.value : 0) + count);
  }
  // creative_work_items status check: draft/ready/generating/partial/
  // completed/failed. No 'abandoned' state — declare unavailable rather
  // than misclassify drafts/ready/generating as abandoned.
  metric.abandoned = unavailable(
    "creative_work_items status has no 'abandoned' value; draft/ready/generating/partial must not be misclassified as abandoned"
  );
  if (!metric.failed.available) {
    metric.failed = unavailable(
      "no creative_work_items with status='failed' in window (signal exists but sample is zero)"
    );
  }

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
    schemaVersion: 3,
    capturedAt: new Date().toISOString(),
    since: args.sinceDate.toISOString(),
    semantics:
      "Counts are per unique journey (campaign id / guided flow id / creative work item id). abandoned/failed are {available:true|false}; when false, the reason names what is missing — never silently zero. Assistant failures come from guided_action_failed aggregated by guided_flow_id (or thread_id fallback), one journey counted once. blocked status is NOT failure. medianDurationMs is PERCENTILE_CONT(0.5).",
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

  const fmtValue = (m) =>
    m.available ? String(m.value) : `n/a(${m.reason ? m.reason.split(";")[0] : ""})`;
  const fmt = (m) =>
    `${m.started}/${m.completed}/${fmtValue(m.abandoned)}/${fmtValue(m.failed)}` +
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
