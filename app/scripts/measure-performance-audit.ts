/**
 * Reproducible evidence for tickets #115–#121.
 *
 * The database portion uses temporary tables inside a transaction and rolls
 * back, so it never mutates persistent application data. It is intentionally
 * local-only unless PERFORMANCE_AUDIT_ALLOW_REMOTE=1 is set.
 *
 * Usage:
 *   NODE_OPTIONS='--conditions=react-server' \
 *   DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *     pnpm exec tsx scripts/measure-performance-audit.ts
 *
 * Real local data (read-only): add `--real` and point DATABASE_URL at the
 * local application database. No rows are written in either mode.
 */

import { config } from "dotenv";
import { Pool, type PoolClient } from "pg";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

config({ path: resolve(process.cwd(), ".env.local") });

const RUNS = 20;
const CAMPAIGNS = 200;
const DERIVATIONS_PER_CAMPAIGN = 120;
const CAMPAIGN_ASSETS_PER_CAMPAIGN = 8;
const WORKSPACE_ASSETS = 2_500;
const WORKSPACE_COUNT = 4;

type AuditTables = {
  campaigns: string;
  derivations: string;
  campaignAssets: string;
  workspaceAssets: string;
  temporary: boolean;
};

const REAL_TABLES: AuditTables = {
  campaigns: "adscale_app.campaigns",
  derivations: "adscale_app.derivations",
  campaignAssets: "adscale_app.campaign_assets",
  workspaceAssets: "adscale_app.workspace_assets",
  temporary: false,
};

type QueryReport = {
  rows: number;
  payloadBytes: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  plan: {
    nodeType: string | null;
    indexNames: string[];
    executionMs: number | null;
    sharedReadBlocks: number | null;
  };
};

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

function stableUuid(value: string) {
  const digest = createHash("md5").update(value).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20)}`;
}

function indexNames(plan: Record<string, unknown>): string[] {
  const names = new Set<string>();
  const visit = (node: Record<string, unknown>) => {
    if (typeof node["Index Name"] === "string") names.add(node["Index Name"]);
    for (const child of (node.Plans as Record<string, unknown>[] | undefined) ?? []) visit(child);
  };
  visit(plan);
  return [...names];
}

async function measureQuery(
  client: PoolClient,
  text: string,
  values: unknown[],
): Promise<QueryReport> {
  const explained = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${text}`, values);
  const root = (explained.rows[0]?.["QUERY PLAN"]?.[0] ?? {}) as {
    Plan?: Record<string, unknown>;
    "Execution Time"?: number;
  };
  const plan = root.Plan ?? {};
  const samples: number[] = [];
  let lastRows: unknown[] = [];

  for (let run = 0; run < RUNS; run += 1) {
    const started = performance.now();
    const result = await client.query(text, values);
    samples.push(performance.now() - started);
    lastRows = result.rows;
  }

  return {
    rows: lastRows.length,
    payloadBytes: Buffer.byteLength(JSON.stringify(lastRows)),
    p50Ms: roundMs(percentile(samples, 0.5)),
    p95Ms: roundMs(percentile(samples, 0.95)),
    p99Ms: roundMs(percentile(samples, 0.99)),
    plan: {
      nodeType: typeof plan["Node Type"] === "string" ? plan["Node Type"] : null,
      indexNames: indexNames(plan),
      executionMs: typeof root["Execution Time"] === "number" ? roundMs(root["Execution Time"] as number) : null,
      sharedReadBlocks:
        typeof plan["Shared Read Blocks"] === "number" ? plan["Shared Read Blocks"] as number : null,
    },
  };
}

function databaseHost(databaseUrl: string) {
  return new URL(databaseUrl).hostname;
}

async function createSyntheticCorpus(client: PoolClient): Promise<AuditTables> {
  await client.query("BEGIN");
  await client.query(`
    CREATE TEMP TABLE audit_campaigns AS
      SELECT * FROM adscale_app.campaigns WITH NO DATA;
    CREATE TEMP TABLE audit_derivations AS
      SELECT * FROM adscale_app.derivations WITH NO DATA;
    CREATE TEMP TABLE audit_campaign_assets AS
      SELECT * FROM adscale_app.campaign_assets WITH NO DATA;
    CREATE TEMP TABLE audit_workspace_assets AS
      SELECT * FROM adscale_app.workspace_assets WITH NO DATA;

    CREATE INDEX audit_campaigns_workspace_idx
      ON audit_campaigns (workspace_id);
    CREATE INDEX audit_derivations_campaign_idx
      ON audit_derivations (campaign_id);
    CREATE INDEX audit_derivations_workspace_campaign_idx
      ON audit_derivations (workspace_id, campaign_id);
    CREATE INDEX audit_derivations_workspace_created_idx
      ON audit_derivations (workspace_id, created_at);
    CREATE INDEX audit_campaign_assets_campaign_idx
      ON audit_campaign_assets (campaign_id);
    CREATE INDEX audit_campaign_assets_workspace_idx
      ON audit_campaign_assets (workspace_id);
    CREATE INDEX audit_workspace_assets_workspace_idx
      ON audit_workspace_assets (workspace_id);
  `);

  await client.query(
    `
      INSERT INTO audit_campaigns (id, workspace_id, name, status, created_at, updated_at)
      SELECT
        md5('audit-campaign-' || campaign_no)::uuid,
        md5('audit-workspace-' || (((campaign_no - 1) % $2) + 1))::uuid,
        'audit campaign ' || campaign_no,
        'completed',
        now() - (campaign_no || ' minutes')::interval,
        now() - (campaign_no || ' minutes')::interval
      FROM generate_series(1, $1::int) AS campaigns(campaign_no)
    `,
    [CAMPAIGNS, WORKSPACE_COUNT],
  );

  await client.query(
    `
      INSERT INTO audit_derivations (
        id, campaign_id, workspace_id, status, prompt, output_key, format,
        generation_mode, cost, is_preview, score_breakdown, score_issues,
        qa_checklist, qa_issues, creative_contract, generation_log,
        created_at, updated_at
      )
      SELECT
        md5('audit-derivation-' || campaign_no || '-' || derivation_no)::uuid,
        md5('audit-campaign-' || campaign_no)::uuid,
        md5('audit-workspace-' || (((campaign_no - 1) % $3) + 1))::uuid,
        CASE WHEN derivation_no % 17 = 0 THEN 'failed' ELSE 'completed' END,
        repeat('representative prompt payload ', 40),
        'audit/derivations/' || campaign_no || '/' || derivation_no || '.png',
        CASE WHEN derivation_no % 3 = 0 THEN '9:16' ELSE '1:1' END,
        'art_variation',
        CASE WHEN derivation_no % 17 = 0 THEN 0 ELSE 5 END,
        false,
        jsonb_build_object('score', 80, 'notes', repeat('score note ', 10)),
        jsonb_build_array('none'),
        jsonb_build_object('status', 'passed', 'checks', repeat('check ', 20)),
        jsonb_build_array(),
        jsonb_build_object('version', 'v1', 'rules', repeat('rule ', 25)),
        jsonb_build_object('provider', 'controlled', 'attempt', derivation_no % 2),
        now() - ((campaign_no * $2 + derivation_no) || ' seconds')::interval,
        now() - ((campaign_no * $2 + derivation_no) || ' seconds')::interval
      FROM generate_series(1, $1::int) AS campaigns(campaign_no)
      CROSS JOIN generate_series(1, $2::int) AS derivations(derivation_no)
    `,
    [CAMPAIGNS, DERIVATIONS_PER_CAMPAIGN, WORKSPACE_COUNT],
  );

  await client.query(
    `
      INSERT INTO audit_campaign_assets (id, campaign_id, workspace_id, key, type, size, width, height, role, metadata, created_at)
      SELECT
        md5('audit-campaign-asset-' || campaign_no || '-' || asset_no)::uuid,
        md5('audit-campaign-' || campaign_no)::uuid,
        md5('audit-workspace-' || (((campaign_no - 1) % $3) + 1))::uuid,
        'audit/assets/' || campaign_no || '/' || asset_no || '.png',
        'image/png', 250000, 1080, 1080, 'base',
        jsonb_build_object('description', repeat('asset metadata ', 20)),
        now()
      FROM generate_series(1, $1::int) AS campaigns(campaign_no)
      CROSS JOIN generate_series(1, $2::int) AS assets(asset_no)
    `,
    [CAMPAIGNS, CAMPAIGN_ASSETS_PER_CAMPAIGN, WORKSPACE_COUNT],
  );

  await client.query(
    `
      INSERT INTO audit_workspace_assets (id, workspace_id, name, key, type, size, width, height, tags, ai_description, source, metadata, created_at, updated_at)
      SELECT
        md5('audit-workspace-asset-' || asset_no)::uuid,
        md5('audit-workspace-' || (((asset_no - 1) % $2) + 1))::uuid,
        'audit workspace asset ' || asset_no,
        'audit/workspace-assets/' || asset_no || '.png',
        'image/png', 180000, 1200, 1200,
        jsonb_build_array('audit', 'tag-' || (asset_no % 12)),
        repeat('representative asset description ', 30),
        'upload',
        jsonb_build_object('metadata', repeat('value ', 25)),
        now() - (asset_no || ' seconds')::interval,
        now() - (asset_no || ' seconds')::interval
      FROM generate_series(1, $1::int) AS assets(asset_no)
    `,
    [WORKSPACE_ASSETS, WORKSPACE_COUNT],
  );

  await client.query("ANALYZE audit_campaigns, audit_derivations, audit_campaign_assets, audit_workspace_assets");

  return {
    campaigns: "audit_campaigns",
    derivations: "audit_derivations",
    campaignAssets: "audit_campaign_assets",
    workspaceAssets: "audit_workspace_assets",
    temporary: true,
  };
}

async function measureDatabase(
  client: PoolClient,
  workspaceId: string,
  campaignId: string,
  tables: AuditTables,
) {
  const derivations = await measureQuery(
    client,
    `
      SELECT * FROM ${tables.derivations}
      WHERE campaign_id = $1 AND workspace_id = $2
      ORDER BY created_at DESC
    `,
    [campaignId, workspaceId],
  );
  const campaignAssets = await measureQuery(
    client,
    `
      SELECT * FROM ${tables.campaignAssets}
      WHERE campaign_id = $1 AND workspace_id = $2
      ORDER BY created_at DESC
    `,
    [campaignId, workspaceId],
  );
  const workspaceAssets = await measureQuery(
    client,
    `
      SELECT * FROM ${tables.workspaceAssets}
      WHERE workspace_id = $1
      ORDER BY created_at DESC
      LIMIT 24 OFFSET 0
    `,
    [workspaceId],
  );
  const campaignCounts = await measureQuery(
    client,
    `
      SELECT
        campaign_id,
        count(*)::int AS total_derivations,
        count(*) FILTER (WHERE status IN ('completed', 'approved', 'rejected') AND output_key IS NOT NULL)::int AS variations,
        coalesce(sum(CASE WHEN status IN ('completed', 'approved', 'rejected') THEN coalesce(cost, 0) ELSE 0 END), 0)::int AS credits_used,
        count(*) FILTER (WHERE status IN ('queued', 'processing'))::int AS active_derivations,
        count(*) FILTER (WHERE status = 'failed')::int AS failed_derivations
      FROM ${tables.derivations}
      WHERE workspace_id = $1
      GROUP BY campaign_id
    `,
    [workspaceId],
  );

  const indexes = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE ${tables.temporary
      ? "schemaname LIKE 'pg_temp_%' AND tablename LIKE 'audit_%'"
      : "schemaname = 'adscale_app' AND tablename IN ('campaigns', 'derivations', 'campaign_assets', 'workspace_assets')"}
    ORDER BY indexname
  `);

  const counts = [];
  for (const query of [
    `SELECT count(*)::int AS count FROM ${tables.campaigns}`,
    `SELECT count(*)::int AS count FROM ${tables.derivations}`,
    `SELECT count(*)::int AS count FROM ${tables.campaignAssets}`,
    `SELECT count(*)::int AS count FROM ${tables.workspaceAssets}`,
    `SELECT count(DISTINCT workspace_id)::int AS count FROM ${tables.campaigns}`,
  ]) {
    counts.push(await client.query<{ count: number }>(query));
  }

  return {
    dataset: {
      campaigns: counts[0].rows[0]?.count ?? 0,
      derivations: counts[1].rows[0]?.count ?? 0,
      campaignAssets: counts[2].rows[0]?.count ?? 0,
      workspaceAssets: counts[3].rows[0]?.count ?? 0,
      workspaces: counts[4].rows[0]?.count ?? 0,
    },
    queries: { derivations, campaignAssets, workspaceAssets, campaignCounts },
    indexes: indexes.rows,
  };
}

async function measureSignedUrls(
  client: PoolClient,
  workspaceId: string,
  campaignId: string,
  tables: AuditTables,
) {
  const rows = await client.query<{ output_key: string }>(
    `
      SELECT output_key FROM ${tables.derivations}
      WHERE campaign_id = $1 AND workspace_id = $2 AND output_key IS NOT NULL
      ORDER BY created_at DESC
    `,
    [campaignId, workspaceId],
  );

  const { R2ObjectStorage } = await import("../src/server/storage/r2-object-storage");
  const storage = new R2ObjectStorage();
  const queryMs: number[] = [];
  const signingMs: number[] = [];
  const serializationMs: number[] = [];
  let serializedBytes = 0;

  for (let run = 0; run < RUNS; run += 1) {
    const queryStarted = performance.now();
    const result = await client.query(
      `
        SELECT * FROM ${tables.derivations}
        WHERE campaign_id = $1 AND workspace_id = $2
        ORDER BY created_at DESC
      `,
      [campaignId, workspaceId],
    );
    queryMs.push(performance.now() - queryStarted);

    const signingStarted = performance.now();
    const urls = await Promise.all(
      result.rows.map((row: { output_key?: string | null }) =>
        row.output_key ? storage.signedDownloadUrl(row.output_key) : Promise.resolve(null),
      ),
    );
    signingMs.push(performance.now() - signingStarted);

    const serializationStarted = performance.now();
    serializedBytes = Buffer.byteLength(JSON.stringify({
      derivations: result.rows.map((row, index) => ({ ...row, imageUrl: urls[index] })),
    }));
    serializationMs.push(performance.now() - serializationStarted);
  }

  return {
    rows: rows.rowCount,
    concurrency: "Promise.all (route behavior)",
    cache: "R2ObjectStorage LRU, 1,000 entries, 4 minute TTL",
    responseBytes: serializedBytes,
    query: {
      p50Ms: roundMs(percentile(queryMs, 0.5)),
      p95Ms: roundMs(percentile(queryMs, 0.95)),
      p99Ms: roundMs(percentile(queryMs, 0.99)),
    },
    signing: {
      p50Ms: roundMs(percentile(signingMs, 0.5)),
      p95Ms: roundMs(percentile(signingMs, 0.95)),
      p99Ms: roundMs(percentile(signingMs, 0.99)),
      note: "measures local presigning; no object download is performed",
    },
    serialization: {
      p50Ms: roundMs(percentile(serializationMs, 0.5)),
      p95Ms: roundMs(percentile(serializationMs, 0.95)),
      p99Ms: roundMs(percentile(serializationMs, 0.99)),
    },
  };
}

async function selectRealScenario(client: PoolClient) {
  const result = await client.query<{ campaign_id: string; workspace_id: string }>(`
    SELECT c.id AS campaign_id, c.workspace_id
    FROM adscale_app.campaigns AS c
    LEFT JOIN adscale_app.derivations AS d ON d.campaign_id = c.id
    GROUP BY c.id, c.workspace_id
    ORDER BY count(d.id) DESC, max(c.updated_at) DESC
    LIMIT 1
  `);
  const scenario = result.rows[0];
  if (!scenario) throw new Error("No campaign found for --real performance audit");
  return scenario;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const host = databaseHost(databaseUrl);
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.PERFORMANCE_AUDIT_ALLOW_REMOTE !== "1") {
    throw new Error(`Refusing non-local DATABASE_URL host=${host}; set PERFORMANCE_AUDIT_ALLOW_REMOTE=1 only for an intentional run`);
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  const realMode = process.argv.includes("--real");
  try {
    let tables: AuditTables;
    let workspaceId: string;
    let campaignId: string;
    if (realMode) {
      await client.query("BEGIN READ ONLY");
      tables = REAL_TABLES;
      const scenario = await selectRealScenario(client);
      workspaceId = scenario.workspace_id;
      campaignId = scenario.campaign_id;
    } else {
      tables = await createSyntheticCorpus(client);
      workspaceId = stableUuid("audit-workspace-1");
      campaignId = stableUuid("audit-campaign-1");
    }

    const database = await measureDatabase(client, workspaceId, campaignId, tables);
    let signedUrls: unknown;
    try {
      signedUrls = await measureSignedUrls(client, workspaceId, campaignId, tables);
    } catch (error) {
      signedUrls = {
        status: "not-run",
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      databaseHost: host,
      mode: realMode ? "real-local-read-only" : "synthetic-temporary-transaction",
      safety: realMode
        ? "READ ONLY transaction; rolled back on exit"
        : "temporary tables in a transaction; rolled back on exit",
      representativeScenario: realMode
        ? { workspaceId, campaignId, runsPerQuery: RUNS }
        : {
            campaigns: CAMPAIGNS,
            derivationsPerCampaign: DERIVATIONS_PER_CAMPAIGN,
            campaignAssetsPerCampaign: CAMPAIGN_ASSETS_PER_CAMPAIGN,
            workspaceAssets: WORKSPACE_ASSETS,
            runsPerQuery: RUNS,
          },
      database,
      signedUrls,
      limitations: [
        realMode ? "local database is not production traffic" : "synthetic corpus is not production traffic",
        "presigning measures local signing CPU and cache, not object download latency",
        "no batching or production rate-limit policy is changed by this script",
      ],
    }, null, 2));
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
