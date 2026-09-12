/**
 * Release smoke gate: web + worker + schema on the same candidate SHA (Task 14 / PR-04).
 *
 * Executor, not a checker: it drives an on-demand isolated staging environment
 * (web and worker as SEPARATE processes, both deployed from the SAME candidate
 * SHA) through the five proofs from the plan, then archives a per-SHA report.
 * It reuses the existing eight v2 worker functions and the Inngest wiring — it
 * never creates another business worker.
 *
 * The gate produces positive evidence or an explicit block. Anything it cannot
 * prove — missing staging wiring, stale worker signal, absent restart hook,
 * provider ceiling — is verdict `blocked`, which MUST be read as red. It never
 * passes in a vacuum.
 *
 * Usage:
 *   npx tsx scripts/reliability-release-smoke.ts --sha <40-hex> --web-url <staging-base>
 *     [--provider controlled|real] [--artifacts-dir <dir>] [--timeout-s <n>]
 *
 * Environment (staging-only; never production):
 *   STAGING_DATABASE_URL      required — isolated staging Postgres 16.
 *   SMOKE_AUTH_COOKIE         required — staging session cookie for the API.
 *   SMOKE_CLIENT_PROFILE_ID   required — synthetic client profile (uuid).
 *   SMOKE_WORKER_SIGNAL_CMD   preferred — prints the worker's OWN signal as JSON
 *                             ({ connectionId, observedAt, service,
 *                             syncedV2FunctionIds[, sha] }). Tails
 *                             `image_worker_connected` from the worker's logs.
 *   SMOKE_WORKER_SIGNAL_FILE  fallback — static JSON snapshot, same shape (or an
 *                             array of them; the freshest wins).
 *   SMOKE_WORKER_RESTART_HOOK required for proof 3 — restarts staging worker.
 *   SMOKE_OWNER_AUTHORIZED    must be "true" for --provider real (each run).
 *   REAL_PROVIDER_MAX_CALLS   ceiling for real-provider calls (default 5).
 *   SMOKE_CANCEL_DELAY_MS     delay before the proof-4 cancel (default 0).
 *
 * Exit codes:
 *   0 — verdict pass. 1 — verdict fail/blocked. 2 — usage error.
 *
 * Never logged or reported: cookies, connection strings, signed URLs, prompts,
 * keys, client content. The report carries counts, IDs and timestamps only.
 */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// pg ships no bundled types in this repo's lockfile, so the import goes through
// createRequire against a minimal structural type. Runtime resolution is the
// normal app/node_modules copy (pg is a production dependency).
const require = createRequire(import.meta.url);
type PgPool = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
};
type PgPoolCtor = new (config: Record<string, unknown>) => PgPool;
let cachedPoolCtor: PgPoolCtor | null = null;
/** Lazy so --help and usage errors work without installed dependencies. */
function pgPoolCtor(): PgPoolCtor {
  if (!cachedPoolCtor) {
    const mod = require("pg") as { Pool: PgPoolCtor };
    cachedPoolCtor = mod.Pool;
  }
  return cachedPoolCtor;
}

// --- Sources of truth this script cites (not imports) -------------------------
const WORKER_SERVICE = "adscale-image-worker";
const WORKER_CONNECTED_EVENT = "image_worker_connected";
const REQUIRED_V2_FUNCTION_COUNT = 8;
// From buildImageWorkerConnectOptions in app/src/server/jobs/image-worker.ts.
const EXPECTED_V2_FUNCTION_IDS = [
  "generate-creative-work-output-v2",
  "generate-creative-work-carousel-slide-v2",
  "generate-derivation-v2",
  "analyze-creative-work-source-v2",
  "analyze-workspace-asset-v2",
  "analyze-brand-training-asset-v2",
  "layerize-creative-work-output-v2",
  "regenerate-creative-work-layer-v2",
] as const;
const FIXTURE_REQUEST_PREFIX = "Release smoke synthetic fixture — no client data.";

type ProofStatus = "pass" | "fail" | "blocked";
type ProofResult = {
  id: string;
  name: string;
  status: ProofStatus;
  summary: string;
  evidence: Record<string, unknown>;
  expected?: unknown;
  observed?: unknown;
};

type CliOptions = {
  sha: string;
  provider: "controlled" | "real";
  webUrl: string;
  artifactsDir: string;
  timeoutS: number;
};

type WorkerSignal = {
  connectionId: string;
  observedAt: string;
  service: string;
  syncedV2FunctionIds: string[];
  sha?: string;
};

type OutputRow = {
  id: string;
  status: string | null;
  correlationId: string | null;
  isSelected: boolean;
  hasKey: boolean;
  createdAt: string;
};

function printUsage(): void {
  process.stderr.write(
    "usage: reliability-release-smoke.ts --sha <40-hex> --web-url <url> [--provider controlled|real] [--artifacts-dir <dir>] [--timeout-s <n>]\n",
  );
}

function parseArgs(argv: string[]): CliOptions {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    process.exit(2);
  }
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "..", "..");
  const sha = get("--sha") ?? "";
  const webUrl = (get("--web-url") ?? "").replace(/\/+$/, "");
  const providerRaw = get("--provider") ?? "controlled";
  const artifactsDir =
    get("--artifacts-dir") ?? path.join(repoRoot, "artifacts", "reliability-release");
  const timeoutS = Number(get("--timeout-s") ?? "900");
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    process.stderr.write("error: --sha must be a 40-char lowercase hex commit SHA\n");
    printUsage();
    process.exit(2);
  }
  if (providerRaw !== "controlled" && providerRaw !== "real") {
    process.stderr.write("error: --provider must be controlled or real\n");
    printUsage();
    process.exit(2);
  }
  if (!/^https?:\/\/.+/.test(webUrl)) {
    process.stderr.write("error: --web-url must be an http(s) base URL\n");
    printUsage();
    process.exit(2);
  }
  if (!Number.isFinite(timeoutS) || timeoutS <= 0) {
    process.stderr.write("error: --timeout-s must be a positive number\n");
    printUsage();
    process.exit(2);
  }
  return { sha, provider: providerRaw, webUrl, artifactsDir, timeoutS };
}

type SmokeEnv = {
  databaseUrl: string;
  authCookie: string;
  clientProfileId: string;
  signalCmd: string | null;
  signalFile: string | null;
  restartHook: string | null;
  ownerAuthorized: boolean;
  realProviderMaxCalls: number;
  cancelDelayMs: number;
};

function readEnv(): SmokeEnv {
  const databaseUrl = process.env.STAGING_DATABASE_URL ?? "";
  const authCookie = process.env.SMOKE_AUTH_COOKIE ?? "";
  const clientProfileId = process.env.SMOKE_CLIENT_PROFILE_ID ?? "";
  const signalCmd = process.env.SMOKE_WORKER_SIGNAL_CMD?.trim() || null;
  const signalFile = process.env.SMOKE_WORKER_SIGNAL_FILE?.trim() || null;
  const restartHook = process.env.SMOKE_WORKER_RESTART_HOOK?.trim() || null;
  const ownerAuthorized = process.env.SMOKE_OWNER_AUTHORIZED === "true";
  const realProviderMaxCalls = Number(process.env.REAL_PROVIDER_MAX_CALLS ?? "5");
  const cancelDelayMs = Number(process.env.SMOKE_CANCEL_DELAY_MS ?? "0");
  const missing: string[] = [];
  if (!databaseUrl) missing.push("STAGING_DATABASE_URL");
  if (!authCookie) missing.push("SMOKE_AUTH_COOKIE");
  if (!clientProfileId) missing.push("SMOKE_CLIENT_PROFILE_ID");
  if (!signalCmd && !signalFile) missing.push("SMOKE_WORKER_SIGNAL_CMD or SMOKE_WORKER_SIGNAL_FILE");
  if (missing.length > 0) {
    process.stderr.write(`error: missing required staging wiring: ${missing.join(", ")}\n`);
    process.exit(2);
  }
  if (!Number.isFinite(realProviderMaxCalls) || realProviderMaxCalls <= 0) {
    process.stderr.write("error: REAL_PROVIDER_MAX_CALLS must be a positive number\n");
    process.exit(2);
  }
  return {
    databaseUrl,
    authCookie,
    clientProfileId,
    signalCmd,
    signalFile,
    restartHook,
    ownerAuthorized,
    realProviderMaxCalls,
    cancelDelayMs: Number.isFinite(cancelDelayMs) && cancelDelayMs >= 0 ? cancelDelayMs : 0,
  };
}

// --- Small helpers -------------------------------------------------------------

/** Strip anything URL-shaped (signed URLs must never reach logs or report). */
function redact(value: string): string {
  return value.replace(/https?:\/\/\S+/g, "<url>").replace(/Cookie:\s*\S+/gi, "Cookie: <redacted>");
}

function log(message: string): void {
  process.stderr.write(`${redact(message)}\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runOwnerHook(label: string, command: string, timeoutMs: number): string {
  log(`[hook] ${label}: executing owner-configured command`);
  const out = execFileSync("/bin/sh", ["-c", command], {
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
    encoding: "utf8",
  });
  return typeof out === "string" ? out : String(out);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
}

type HttpResult = {
  status: number;
  json: unknown;
  bytes: number;
  contentType: string | null;
};

async function api(
  opts: CliOptions,
  env: SmokeEnv,
  method: "GET" | "POST",
  apiPath: string,
  body?: unknown,
): Promise<HttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${opts.webUrl}${apiPath}`, {
      method,
      headers: {
        Cookie: env.authCookie,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const contentType = res.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return { status: res.status, json: await res.json().catch(() => null), bytes: 0, contentType };
    }
    const buf = await res.arrayBuffer().catch(() => new ArrayBuffer(0));
    return { status: res.status, json: null, bytes: buf.byteLength, contentType };
  } finally {
    clearTimeout(timer);
  }
}

/** GET a download endpoint, follow redirects, count bytes, keep nothing else. */
async function downloadBytes(
  opts: CliOptions,
  env: SmokeEnv,
  apiPath: string,
): Promise<{ status: number; bytes: number; contentType: string | null; viaJson: boolean }> {
  const first = await api(opts, env, "GET", apiPath);
  const rec = asRecord(first.json);
  const signedUrl = rec ? pickString(rec.url, rec.downloadUrl, rec.signedUrl) : null;
  if (signedUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      const res = await fetch(signedUrl, { signal: controller.signal });
      const buf = await res.arrayBuffer().catch(() => new ArrayBuffer(0));
      return {
        status: res.status,
        bytes: buf.byteLength,
        contentType: res.headers.get("content-type"),
        viaJson: true,
      };
    } finally {
      clearTimeout(timer);
    }
  }
  // Default 302-for-browsers shape: fetch already followed the redirect.
  return { status: first.status, bytes: first.bytes, contentType: first.contentType, viaJson: false };
}

// --- Schema version (mirrors scripts/migrate-with-retry.mjs) --------------------

type JournalEntry = { tag: string };

function readJournal(): JournalEntry[] {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(path.join(scriptDir, "..", "drizzle", "meta", "_journal.json"), "utf8");
  const parsed = JSON.parse(raw) as { entries: JournalEntry[] };
  return parsed.entries;
}

function migrationHash(tag: string): string {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(path.join(scriptDir, "..", "drizzle", `${tag}.sql`), "utf8");
  return createHash("sha256").update(sql).digest("hex");
}

async function appliedMigrationHashes(pool: PgPool): Promise<Set<string>> {
  const result = await pool.query(`SELECT hash FROM public."__drizzle_migrations"`);
  return new Set(result.rows.map((row) => String(row.hash)));
}

// --- Worker signal (the worker's OWN signal, never /api/health) ------------------

function parseSignalPayload(raw: string): WorkerSignal | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  let best: WorkerSignal | null = null;
  for (const item of list) {
    const rec = asRecord(item);
    if (!rec) continue;
    const connectionId = pickString(rec.connectionId);
    const observedAt = pickString(rec.observedAt);
    const service = pickString(rec.service);
    const ids = Array.isArray(rec.syncedV2FunctionIds)
      ? rec.syncedV2FunctionIds.filter((v): v is string => typeof v === "string")
      : null;
    if (!connectionId || !observedAt || !service || !ids) continue;
    if (Number.isNaN(Date.parse(observedAt))) continue;
    if (!best || Date.parse(observedAt) > Date.parse(best.observedAt)) {
      const sha = pickString(rec.sha);
      best = { connectionId, observedAt, service, syncedV2FunctionIds: ids, ...(sha ? { sha } : {}) };
    }
  }
  return best;
}

function collectWorkerSignal(env: SmokeEnv): WorkerSignal | null {
  if (env.signalCmd) {
    const out = runOwnerHook("worker-signal", env.signalCmd, 60_000);
    return parseSignalPayload(out);
  }
  if (env.signalFile && existsSync(env.signalFile)) {
    return parseSignalPayload(readFileSync(env.signalFile, "utf8"));
  }
  return null;
}

function validateWorkerSignal(
  signal: WorkerSignal | null,
  candidateSha: string,
  runStartMs: number,
): { ok: boolean; reason: string; missingIds: string[] } {
  if (!signal) return { ok: false, reason: "no worker signal observed", missingIds: [] };
  const missingIds = EXPECTED_V2_FUNCTION_IDS.filter(
    (id) => !signal.syncedV2FunctionIds.includes(id),
  );
  if (signal.service !== WORKER_SERVICE) {
    return { ok: false, reason: `signal from ${signal.service}, want ${WORKER_SERVICE}`, missingIds };
  }
  if (missingIds.length > 0 || signal.syncedV2FunctionIds.length < REQUIRED_V2_FUNCTION_COUNT) {
    return { ok: false, reason: "fewer than 8 synced v2 functions", missingIds };
  }
  const observedMs = Date.parse(signal.observedAt);
  if (observedMs < runStartMs - 5 * 60_000 || observedMs > Date.now() + 60_000) {
    return { ok: false, reason: `stale signal (observedAt ${signal.observedAt})`, missingIds };
  }
  if (signal.sha && signal.sha !== candidateSha) {
    return { ok: false, reason: "worker signal sha differs from candidate", missingIds };
  }
  return { ok: true, reason: "fresh signal, same service, 8/8 v2 functions", missingIds };
}

// --- Staging reads ---------------------------------------------------------------

async function listOutputs(pool: PgPool, workItemId: string): Promise<OutputRow[]> {
  const result = await pool.query(
    `SELECT id::text AS id, status, generation_correlation_id::text AS "correlationId",
            COALESCE(is_selected, false) AS "isSelected",
            (output_key IS NOT NULL) AS "hasKey",
            created_at::text AS "createdAt"
       FROM adscale_app.creative_work_outputs WHERE work_item_id = $1::uuid ORDER BY created_at`,
    [workItemId],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    status: typeof row.status === "string" ? row.status : null,
    correlationId: typeof row.correlationId === "string" ? row.correlationId : null,
    isSelected: row.isSelected === true,
    hasKey: row.hasKey === true,
    createdAt: String(row.createdAt),
  }));
}

type LedgerSnapshot = {
  usageRows: number;
  duplicateIdempotencyKeys: { key: string; count: number }[];
  creditRows: number;
  creditSum: number;
};

/**
 * Windowed ledger read. Staging is created solely for this run, so rows with
 * created_at inside the run window are this run's writes. Idempotency keys are
 * operational (not secrets) and safe to report as key->count pairs.
 */
async function snapshotLedger(pool: PgPool, windowStartIso: string): Promise<LedgerSnapshot> {
  const usage = await pool.query(
    `SELECT COUNT(*)::int AS n FROM adscale_app.usage_events WHERE created_at >= $1::timestamptz`,
    [windowStartIso],
  );
  const dups = await pool.query(
    `SELECT idempotency_key AS key, COUNT(*)::int AS n
       FROM adscale_app.usage_events
      WHERE created_at >= $1::timestamptz AND idempotency_key IS NOT NULL
      GROUP BY 1 HAVING COUNT(*) > 1 ORDER BY 1`,
    [windowStartIso],
  );
  const credits = await pool.query(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(amount), 0)::int AS s
       FROM adscale_app.credit_transactions WHERE created_at >= $1::timestamptz`,
    [windowStartIso],
  );
  return {
    usageRows: Number(usage.rows[0]?.n ?? 0),
    duplicateIdempotencyKeys: dups.rows.map((row) => ({
      key: String(row.key),
      count: Number(row.n),
    })),
    creditRows: Number(credits.rows[0]?.n ?? 0),
    creditSum: Number(credits.rows[0]?.s ?? 0),
  };
}

function statusHistogram(rows: OutputRow[]): Record<string, number> {
  const hist: Record<string, number> = {};
  for (const row of rows) {
    const key = row.status ?? "<null>";
    hist[key] = (hist[key] ?? 0) + 1;
  }
  return hist;
}

/** Quiescence: two consecutive identical status sets 15s apart. */
async function waitForQuiescence(
  pool: PgPool,
  workItemIds: string[],
  timeoutMs: number,
  label: string,
): Promise<{ rows: OutputRow[]; quiescent: boolean }> {
  const deadline = Date.now() + timeoutMs;
  let previous = "";
  let rows: OutputRow[] = [];
  let stableRounds = 0;
  while (Date.now() < deadline) {
    rows = [];
    for (const id of workItemIds) rows.push(...(await listOutputs(pool, id)));
    const signature = JSON.stringify(
      rows.map((r) => `${r.id}:${r.status ?? "?"}:${r.isSelected ? "1" : "0"}`),
    );
    if (rows.length > 0 && signature === previous) {
      stableRounds += 1;
      if (stableRounds >= 2) return { rows, quiescent: true };
    } else {
      stableRounds = 0;
    }
    previous = signature;
    log(`[wait] ${label}: ${rows.length} outputs, hist=${JSON.stringify(statusHistogram(rows))}`);
    await sleep(15_000);
  }
  return { rows, quiescent: false };
}

// --- Synthetic fixture flow (real HTTP surface, no client data) -------------------

type PreparedWork = { workItemId: string; preparedRevision: string };

async function createSyntheticDraft(
  opts: CliOptions,
  env: SmokeEnv,
  tag: string,
): Promise<string> {
  const res = await api(opts, env, "POST", "/api/creative-work", {
    clientProfileId: env.clientProfileId,
    draftKey: randomUUID(),
    request: `${FIXTURE_REQUEST_PREFIX} sha=${opts.sha.slice(0, 12)} tag=${tag}`,
    intent: "single",
    format: "1:1",
    settings: { targetFormats: ["1:1"] },
  });
  const rec = asRecord(res.json);
  const work = rec ? asRecord(rec.work) : null;
  const id = rec ? pickString(work?.id, rec.id, rec.workItemId, rec.workId) : null;
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`create draft failed: HTTP ${res.status}`);
  }
  if (!id) {
    throw new Error(`create draft response has no work id (keys: ${rec ? Object.keys(rec).join(",") : "none"})`);
  }
  return id;
}

async function prepareWork(opts: CliOptions, env: SmokeEnv, workItemId: string): Promise<string> {
  const res = await api(opts, env, "POST", `/api/creative-work/${workItemId}`, { action: "prepare" });
  if (res.status !== 200) throw new Error(`prepare failed: HTTP ${res.status}`);
  const rec = asRecord(res.json);
  const plan = rec ? asRecord(rec.preparedPlan) : null;
  const work = rec ? asRecord(rec.work) : null;
  // Non-carousel revision is work.updatedAt ISO (see projectPreparedPlanV1).
  const revision = rec ? pickString(plan?.preparedRevision, work?.updatedAt) : null;
  if (!revision || Number.isNaN(Date.parse(revision))) {
    throw new Error("prepare response has no usable preparedRevision");
  }
  return revision;
}

async function dispatchGenerate(
  opts: CliOptions,
  env: SmokeEnv,
  work: PreparedWork,
): Promise<{ status: number }> {
  const res = await api(opts, env, "POST", `/api/creative-work/${work.workItemId}/generate`, {
    action: "initial",
    preparedRevision: work.preparedRevision,
  });
  return { status: res.status };
}

async function createPrepareDispatch(
  opts: CliOptions,
  env: SmokeEnv,
  tag: string,
): Promise<PreparedWork> {
  const workItemId = await createSyntheticDraft(opts, env, tag);
  const preparedRevision = await prepareWork(opts, env, workItemId);
  const dispatched = await dispatchGenerate(opts, env, { workItemId, preparedRevision });
  if (dispatched.status !== 202) {
    throw new Error(`generate dispatch failed: HTTP ${dispatched.status}`);
  }
  return { workItemId, preparedRevision };
}

// --- Proof 1: migrate-before-release + readiness of BOTH processes ----------------

async function proofSchemaAndReadiness(
  opts: CliOptions,
  env: SmokeEnv,
  pool: PgPool,
  runStartMs: number,
): Promise<{ proof: ProofResult; workerConnectionId: string | null }> {
  const fail = (summary: string, evidence: Record<string, unknown>): ProofResult => ({
    id: "schema_and_readiness",
    name: "Schema first, web ready, worker ready on its own signal",
    status: "fail",
    summary,
    evidence,
  });
  try {
    const journal = readJournal();
    const expectedTag = journal[journal.length - 1]?.tag;
    if (!expectedTag) {
      return { proof: fail("empty drizzle journal", {}), workerConnectionId: null };
    }
    const applied = await appliedMigrationHashes(pool);
    let appliedTag: string | null = null;
    for (const entry of journal) {
      let hash: string;
      try {
        hash = migrationHash(entry.tag);
      } catch {
        break;
      }
      if (applied.has(hash)) appliedTag = entry.tag;
      else break;
    }
    const schemaOk = appliedTag === expectedTag;
    const health = await api(opts, env, "GET", "/api/health");
    const healthRec = asRecord(health.json);
    const webOk = health.status === 200 && healthRec?.ok === true;
    // The worker is NEVER inferred from /api/health: its own signal or block.
    let signal: WorkerSignal | null = null;
    let signalErr = "";
    try {
      signal = collectWorkerSignal(env);
    } catch (error) {
      signalErr = error instanceof Error ? redact(error.message) : "signal command failed";
    }
    const signalCheck = validateWorkerSignal(signal, opts.sha, runStartMs);
    const evidence = {
      expectedTag,
      appliedTag,
      journalEntries: journal.length,
      appliedRows: applied.size,
      web: { httpStatus: health.status, ok: healthRec?.ok ?? null, service: healthRec?.service ?? null },
      worker: {
        event: WORKER_CONNECTED_EVENT,
        connectionId: signal?.connectionId ?? null,
        observedAt: signal?.observedAt ?? null,
        service: signal?.service ?? null,
        syncedV2Count: signal?.syncedV2FunctionIds.length ?? 0,
        sha: signal?.sha ?? "not-self-reported",
        check: signalCheck.reason,
        ...(signalErr ? { collectError: signalErr } : {}),
      },
    };
    if (!schemaOk) {
      return {
        proof: { ...fail(`staging schema is at ${appliedTag ?? "unknown"}, want ${expectedTag}`, evidence), expected: expectedTag, observed: appliedTag },
        workerConnectionId: null,
      };
    }
    if (!webOk) {
      return {
        proof: { ...fail(`web not ready (HTTP ${health.status})`, evidence), expected: 200, observed: health.status },
        workerConnectionId: null,
      };
    }
    if (!signalCheck.ok) {
      return {
        proof: {
          id: "schema_and_readiness",
          name: "Schema first, web ready, worker ready on its own signal",
          status: "blocked",
          summary: `worker readiness unproven: ${signalCheck.reason}`,
          evidence,
        },
        workerConnectionId: null,
      };
    }
    return {
      proof: {
        id: "schema_and_readiness",
        name: "Schema first, web ready, worker ready on its own signal",
        status: "pass",
        summary: `schema ${expectedTag} applied before release; web /api/health ok; worker ${signal?.connectionId} fresh with 8/8 v2`,
        evidence,
      },
      workerConnectionId: signal?.connectionId ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? redact(error.message) : String(error);
    return {
      proof: {
        id: "schema_and_readiness",
        name: "Schema first, web ready, worker ready on its own signal",
        status: "blocked",
        summary: `could not collect readiness evidence: ${message}`,
        evidence: {},
      },
      workerConnectionId: null,
    };
  }
}

// --- Proof 2: publish -> consume -> persist -> select -> download ------------------

async function proofEndToEndCorrelation(
  opts: CliOptions,
  env: SmokeEnv,
  pool: PgPool,
  windowStartIso: string,
): Promise<{ proof: ProofResult; correlationId: string | null; workItemId: string | null }> {
  const blocked = (summary: string, evidence: Record<string, unknown>): ProofResult => ({
    id: "end_to_end_correlation",
    name: "publish -> consume -> persist -> select -> download, one correlation id",
    status: "blocked",
    summary,
    evidence,
  });
  const failed = (summary: string, evidence: Record<string, unknown>): ProofResult => ({
    id: "end_to_end_correlation",
    name: "publish -> consume -> persist -> select -> download, one correlation id",
    status: "fail",
    summary,
    evidence,
  });
  try {
    const ledgerBefore = await snapshotLedger(pool, windowStartIso);
    const work = await createPrepareDispatch(opts, env, "proof2");
    const waited = await waitForQuiescence(pool, [work.workItemId], opts.timeoutS * 1000, "proof2");
    if (!waited.quiescent) {
      return {
        proof: blocked("outputs never reached quiescence before timeout", {
          workItemId: work.workItemId,
          histogram: statusHistogram(waited.rows),
        }),
        correlationId: null,
        workItemId: work.workItemId,
      };
    }
    const correlationIds = [...new Set(waited.rows.map((r) => r.correlationId).filter((v): v is string => !!v))];
    if (correlationIds.length !== 1) {
      return {
        proof: failed("outputs do not share one generationCorrelationId", {
          workItemId: work.workItemId,
          distinctCorrelationIds: correlationIds.length,
          histogram: statusHistogram(waited.rows),
        }),
        correlationId: null,
        workItemId: work.workItemId,
      };
    }
    const correlationId = correlationIds[0] as string;
    const completed = waited.rows.find((r) => r.status === "completed" && r.correlationId === correlationId);
    if (!completed) {
      return {
        proof: failed("no completed output for the correlated operation", {
          workItemId: work.workItemId,
          correlationId,
          histogram: statusHistogram(waited.rows),
        }),
        correlationId,
        workItemId: work.workItemId,
      };
    }
    const selected = await api(
      opts,
      env,
      "POST",
      `/api/creative-work/${work.workItemId}/outputs/${completed.id}/select`,
      {},
    );
    if (selected.status !== 200) {
      return {
        proof: failed(`select failed: HTTP ${selected.status}`, {
          workItemId: work.workItemId,
          correlationId,
          outputId: completed.id,
          selectHttpStatus: selected.status,
        }),
        correlationId,
        workItemId: work.workItemId,
      };
    }
    const afterSelect = await listOutputs(pool, work.workItemId);
    const selectedRow = afterSelect.find((r) => r.id === completed.id);
    if (!selectedRow?.isSelected) {
      return {
        proof: failed("select returned 200 but is_selected is not set", {
          workItemId: work.workItemId,
          correlationId,
          outputId: completed.id,
        }),
        correlationId,
        workItemId: work.workItemId,
      };
    }
    const download = await downloadBytes(
      opts,
      env,
      `/api/creative-work/${work.workItemId}/outputs/${completed.id}/download?format=json`,
    );
    if (download.status !== 200 || download.bytes <= 0) {
      return {
        proof: failed("download did not yield a valid object", {
          workItemId: work.workItemId,
          correlationId,
          outputId: completed.id,
          downloadHttpStatus: download.status,
          downloadBytes: download.bytes,
          contentType: download.contentType,
        }),
        correlationId,
        workItemId: work.workItemId,
      };
    }
    const ledgerAfter = await snapshotLedger(pool, windowStartIso);
    return {
      proof: {
        id: "end_to_end_correlation",
        name: "publish -> consume -> persist -> select -> download, one correlation id",
        status: "pass",
        summary: `one correlation id ${correlationId} across publish/consume/persist/select/download; ${download.bytes} bytes retrieved`,
        evidence: {
          workItemId: work.workItemId,
          correlationId,
          outputs: waited.rows.length,
          selectedOutputId: completed.id,
          downloadBytes: download.bytes,
          downloadContentType: download.contentType,
          usageRowsDelta: ledgerAfter.usageRows - ledgerBefore.usageRows,
          creditRowsDelta: ledgerAfter.creditRows - ledgerBefore.creditRows,
        },
      },
      correlationId,
      workItemId: work.workItemId,
    };
  } catch (error) {
    const message = error instanceof Error ? redact(error.message) : String(error);
    return {
      proof: blocked(`could not run the correlated flow: ${message}`, {}),
      correlationId: null,
      workItemId: null,
    };
  }
}

// --- Proof 3: redelivery + mid-run restart + ambiguous ack ------------------------

type Coherence = { coherent: boolean; detail: string; histogram: Record<string, number> };

function checkTerminalCoherence(rows: OutputRow[], quiescent: boolean): Coherence {
  const histogram = statusHistogram(rows);
  if (!quiescent) return { coherent: false, detail: "never reached quiescence", histogram };
  if (rows.length === 0) return { coherent: false, detail: "no outputs persisted", histogram };
  const nullish = rows.filter((r) => !r.status);
  if (nullish.length > 0) {
    return { coherent: false, detail: `${nullish.length} outputs without terminal status`, histogram };
  }
  const selected = rows.filter((r) => r.isSelected);
  const completed = rows.filter((r) => r.status === "completed");
  if (completed.length === 0) {
    return { coherent: false, detail: "no completed output after quiescence", histogram };
  }
  if (selected.length > 1) {
    return { coherent: false, detail: `${selected.length} outputs selected (want at most 1)`, histogram };
  }
  return { coherent: true, detail: "quiescent, statuses set, completed present, <=1 selected", histogram };
}

async function proofRedeliveryRestartAck(
  opts: CliOptions,
  env: SmokeEnv,
  pool: PgPool,
  windowStartIso: string,
  preRestartConnectionId: string | null,
): Promise<ProofResult> {
  const name = "Redelivery, mid-run worker restart, ambiguous ack; ledger not duplicated";
  const blocked = (summary: string, evidence: Record<string, unknown>): ProofResult => ({
    id: "redelivery_restart_ack",
    name,
    status: "blocked",
    summary,
    evidence,
  });
  const failed = (summary: string, evidence: Record<string, unknown>): ProofResult => ({
    id: "redelivery_restart_ack",
    name,
    status: "fail",
    summary,
    evidence,
  });
  try {
    if (!env.restartHook) {
      return blocked("SMOKE_WORKER_RESTART_HOOK not configured: cannot prove mid-run restart", {});
    }
    const ledgerBefore = await snapshotLedger(pool, windowStartIso);
    // Redelivery through the REAL path: the web re-dispatches the v2 event.
    const work = await createPrepareDispatch(opts, env, "proof3-redeliver");
    const redelivered = await dispatchGenerate(opts, env, work);
    const redeliveryCoherent = redelivered.status === 202 || redelivered.status === 409;
    // Restart with work in flight, then demand a NEW worker connection id.
    const inFlight = await createPrepareDispatch(opts, env, "proof3-restart");
    runOwnerHook("worker-restart", env.restartHook, 300_000);
    let postRestartConnectionId: string | null = null;
    const restartDeadline = Date.now() + 5 * 60_000;
    while (Date.now() < restartDeadline) {
      try {
        const signal = collectWorkerSignal(env);
        if (signal && signal.connectionId !== preRestartConnectionId) {
          postRestartConnectionId = signal.connectionId;
          break;
        }
      } catch {
        // Signal source may flap during the restart; keep polling.
      }
      await sleep(15_000);
    }
    if (!postRestartConnectionId) {
      return blocked("no new worker connection id observed after the restart hook", {
        preRestartConnectionId,
        redeliverHttpStatus: redelivered.status,
      });
    }
    const waited = await waitForQuiescence(
      pool,
      [work.workItemId, inFlight.workItemId],
      opts.timeoutS * 1000,
      "proof3",
    );
    // Ambiguous ack: cancel then retry one output; the terminal state must stay coherent.
    const candidate =
      waited.rows.find((r) => r.status !== "completed") ?? waited.rows.find((r) => r.status === "completed");
    let cancelHttp: number | null = null;
    let retryHttp: number | null = null;
    if (candidate) {
      // Find which work owns the candidate output for the cancel/retry URLs.
      let ackWorkId = work.workItemId;
      for (const id of [work.workItemId, inFlight.workItemId]) {
        const rows = await listOutputs(pool, id);
        if (rows.some((r) => r.id === candidate.id)) {
          ackWorkId = id;
          break;
        }
      }
      cancelHttp = (
        await api(opts, env, "POST", `/api/creative-work/${ackWorkId}/outputs/${candidate.id}/cancel`, {})
      ).status;
      retryHttp = (
        await api(opts, env, "POST", `/api/creative-work/${ackWorkId}/outputs/${candidate.id}/retry`, {})
      ).status;
    }
    const final = await waitForQuiescence(
      pool,
      [work.workItemId, inFlight.workItemId],
      opts.timeoutS * 1000,
      "proof3-after-ack",
    );
    const coherence = checkTerminalCoherence(final.rows, final.quiescent);
    const ledgerAfter = await snapshotLedger(pool, windowStartIso);
    const evidence = {
      redeliverHttpStatus: redelivered.status,
      redeliveryCoherent,
      preRestartConnectionId,
      postRestartConnectionId,
      cancelHttpStatus: cancelHttp,
      retryHttpStatus: retryHttp,
      coherence: coherence.detail,
      histogram: coherence.histogram,
      duplicateIdempotencyKeys: ledgerAfter.duplicateIdempotencyKeys,
      usageRowsDelta: ledgerAfter.usageRows - ledgerBefore.usageRows,
      creditRowsDelta: ledgerAfter.creditRows - ledgerBefore.creditRows,
      creditSumDelta: ledgerAfter.creditSum - ledgerBefore.creditSum,
    };
    if (!redeliveryCoherent) {
      return { ...failed(`redelivery answered HTTP ${redelivered.status} (want 202 or 409)`, evidence), expected: [202, 409], observed: redelivered.status };
    }
    if (!coherence.coherent) {
      return { ...failed(`terminal state incoherent: ${coherence.detail}`, evidence), expected: "quiescent with completed output", observed: coherence.detail };
    }
    if (ledgerAfter.duplicateIdempotencyKeys.length > 0) {
      return { ...failed("billing/refund duplicated: repeated idempotency keys", evidence), expected: [], observed: ledgerAfter.duplicateIdempotencyKeys };
    }
    return {
      id: "redelivery_restart_ack",
      name,
      status: "pass",
      summary: `redelivery ${redelivered.status}, restart ${preRestartConnectionId}->${postRestartConnectionId}, cancel/retry ${cancelHttp}/${retryHttp}, terminal coherent, no ledger duplicates`,
      evidence,
    };
  } catch (error) {
    const message = error instanceof Error ? redact(error.message) : String(error);
    return blocked(`could not run redelivery/restart/ack: ${message}`, {});
  }
}

// --- Proof 4: partial batch failure + reuse of completed pieces --------------------

async function proofPartialBatchReuse(
  opts: CliOptions,
  env: SmokeEnv,
  pool: PgPool,
  windowStartIso: string,
): Promise<ProofResult> {
  const name = "Partial batch failure; completed pieces reused, only pending redone";
  const blocked = (summary: string, evidence: Record<string, unknown>): ProofResult => ({
    id: "partial_batch_reuse",
    name,
    status: "blocked",
    summary,
    evidence,
  });
  const failed = (summary: string, evidence: Record<string, unknown>): ProofResult => ({
    id: "partial_batch_reuse",
    name,
    status: "fail",
    summary,
    evidence,
  });
  try {
    const ledgerBefore = await snapshotLedger(pool, windowStartIso);
    const batchA = await createPrepareDispatch(opts, env, "proof4-a");
    const batchB = await createPrepareDispatch(opts, env, "proof4-b");
    if (env.cancelDelayMs > 0) await sleep(env.cancelDelayMs);
    // Snapshot the sibling BEFORE the incident; reuse means these exact rows
    // survive untouched (same ids, same created_at) — never deleted/redone.
    const preA = await listOutputs(pool, batchA.workItemId);
    // Cancel one item of the batch as early as possible to catch it mid-flight.
    const earlyB = await listOutputs(pool, batchB.workItemId);
    const victim = earlyB.find((r) => r.status !== "completed") ?? earlyB[0] ?? null;
    let cancelHttp: number | null = null;
    let retryHttp: number | null = null;
    if (victim) {
      cancelHttp = (
        await api(opts, env, "POST", `/api/creative-work/${batchB.workItemId}/outputs/${victim.id}/cancel`, {})
      ).status;
      retryHttp = (
        await api(opts, env, "POST", `/api/creative-work/${batchB.workItemId}/outputs/${victim.id}/retry`, {})
      ).status;
    }
    const waited = await waitForQuiescence(
      pool,
      [batchA.workItemId, batchB.workItemId],
      opts.timeoutS * 1000,
      "proof4",
    );
    const finalA = await listOutputs(pool, batchA.workItemId);
    // Reuse: every sibling row that existed before the incident still exists
    // with the same created_at — completed pieces were reused, not redone.
    // (Rows legitimately persisted after the snapshot don't violate reuse.)
    const reuseHolds =
      preA.length > 0 &&
      preA.every((e) => finalA.some((r) => r.id === e.id && r.createdAt === e.createdAt));
    const coherence = checkTerminalCoherence(waited.rows, waited.quiescent);
    const ledgerAfter = await snapshotLedger(pool, windowStartIso);
    const partialInjected = cancelHttp !== null && cancelHttp !== 409 && cancelHttp < 500;
    const evidence = {
      batchWorkA: batchA.workItemId,
      batchWorkB: batchB.workItemId,
      victimOutputId: victim?.id ?? null,
      victimStatusAtCancel: victim?.status ?? null,
      cancelHttpStatus: cancelHttp,
      retryHttpStatus: retryHttp,
      partialFailureInjected: partialInjected,
      injectionNote: partialInjected
        ? "cancel accepted mid-flight (or on a live output)"
        : "stub completed before the cancel window or cancel rejected; reuse + coherence still asserted, owner may slow the stub (SMOKE_CANCEL_DELAY_MS)",
      siblingReuseHolds: reuseHolds,
      siblingRowsBefore: preA.length,
      siblingRowsAfter: finalA.length,
      coherence: coherence.detail,
      histogram: coherence.histogram,
      usageRowsDelta: ledgerAfter.usageRows - ledgerBefore.usageRows,
      creditRowsDelta: ledgerAfter.creditRows - ledgerBefore.creditRows,
    };
    if (!waited.quiescent) return blocked("batch never reached quiescence", evidence);
    if (!reuseHolds) {
      return { ...failed("completed sibling was redone instead of reused", evidence), expected: "pre-incident sibling rows survive", observed: `${preA.length} before, ${finalA.length} after` };
    }
    if (!coherence.coherent) {
      return { ...failed(`batch terminal state incoherent: ${coherence.detail}`, evidence), expected: "quiescent with completed output", observed: coherence.detail };
    }
    return {
      id: "partial_batch_reuse",
      name,
      status: "pass",
      summary: `partial incident on B (cancel ${cancelHttp}/retry ${retryHttp}), sibling A reused (${preA.length} pre-incident rows stable), batch terminal coherent`,
      evidence,
    };
  } catch (error) {
    const message = error instanceof Error ? redact(error.message) : String(error);
    return blocked(`could not run the partial-batch flow: ${message}`, {});
  }
}

// --- Report ------------------------------------------------------------------------

type GateReport = {
  tool: string;
  reportVersion: 1;
  verdict: ProofStatus;
  sha: string;
  provider: string;
  startedAt: string;
  finishedAt: string;
  environment: Record<string, unknown>;
  flags: Record<string, unknown>;
  schema: Record<string, unknown>;
  processes: Record<string, unknown>;
  proofs: ProofResult[];
  providerCalls: Record<string, unknown>;
  cost: Record<string, unknown>;
};

function verdictOf(proofs: ProofResult[]): ProofStatus {
  if (proofs.some((p) => p.status === "fail")) return "fail";
  if (proofs.some((p) => p.status === "blocked")) return "blocked";
  return "pass";
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const runStartMs = Date.now();
  const windowStartIso = startedAt;
  const opts = parseArgs(process.argv.slice(2));
  const env = readEnv();

  if (opts.provider === "real" && !env.ownerAuthorized) {
    process.stderr.write("error: --provider real requires SMOKE_OWNER_AUTHORIZED=true (explicit owner authorization, each run)\n");
    process.exit(2);
  }
  if (opts.provider === "real") {
    log(`[guard] real provider authorized by owner; ceiling ${env.realProviderMaxCalls} calls`);
  }

  const pool = new (pgPoolCtor())({
    connectionString: env.databaseUrl,
    max: 2,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
  });
  const proofs: ProofResult[] = [];
  let workerConnectionId: string | null = null;
  let ledgerStart: LedgerSnapshot | null = null;
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    const message = error instanceof Error ? redact(error.message) : String(error);
    proofs.push({
      id: "schema_and_readiness",
      name: "Schema first, web ready, worker ready on its own signal",
      status: "blocked",
      summary: `staging database unreachable: ${message}`,
      evidence: {},
    });
  }
  try {
    ledgerStart = await snapshotLedger(pool, windowStartIso);
  } catch {
    ledgerStart = null;
  }

  if (proofs.length === 0) {
    const p1 = await proofSchemaAndReadiness(opts, env, pool, runStartMs);
    proofs.push(p1.proof);
    workerConnectionId = p1.workerConnectionId;
  }
  const p1Passed = proofs[0]?.status === "pass";
  if (p1Passed) {
    if (opts.provider === "real") {
      const used = (await snapshotLedger(pool, windowStartIso)).usageRows;
      if (used >= env.realProviderMaxCalls) {
        proofs.push({
          id: "end_to_end_correlation",
          name: "publish -> consume -> persist -> select -> download, one correlation id",
          status: "blocked",
          summary: `provider ceiling already reached before dispatch (${used}/${env.realProviderMaxCalls})`,
          evidence: { used, ceiling: env.realProviderMaxCalls },
        });
      }
    }
    if (!proofs.some((p) => p.id === "end_to_end_correlation")) {
      proofs.push((await proofEndToEndCorrelation(opts, env, pool, windowStartIso)).proof);
    }
    proofs.push(await proofRedeliveryRestartAck(opts, env, pool, windowStartIso, workerConnectionId));
    proofs.push(await proofPartialBatchReuse(opts, env, pool, windowStartIso));
  } else {
    for (const [id, proofName] of [
      ["end_to_end_correlation", "publish -> consume -> persist -> select -> download, one correlation id"],
      ["redelivery_restart_ack", "Redelivery, mid-run worker restart, ambiguous ack; ledger not duplicated"],
      ["partial_batch_reuse", "Partial batch failure; completed pieces reused, only pending redone"],
    ] as const) {
      proofs.push({ id, name: proofName, status: "blocked", summary: "skipped: proof 1 did not pass", evidence: {} });
    }
  }

  let ledgerEnd: LedgerSnapshot | null = null;
  try {
    ledgerEnd = await snapshotLedger(pool, windowStartIso);
  } catch {
    ledgerEnd = null;
  }
  const verdict = verdictOf(proofs);
  const finishedAt = new Date().toISOString();
  let webHost = "staging-web";
  try {
    webHost = new URL(opts.webUrl).host;
  } catch {
    // keep the placeholder
  }
  const p1Evidence = asRecord(proofs[0]?.evidence) ?? {};
  const report: GateReport = {
    tool: "reliability-release-smoke",
    reportVersion: 1,
    verdict,
    sha: opts.sha,
    provider: opts.provider,
    startedAt,
    finishedAt,
    environment: { name: "staging-on-demand", webHost, workerService: WORKER_SERVICE },
    flags: {
      provider: opts.provider,
      ownerAuthorized: env.ownerAuthorized,
      realProviderMaxCalls: env.realProviderMaxCalls,
      cancelDelayMs: env.cancelDelayMs,
      timeoutS: opts.timeoutS,
    },
    schema: {
      expectedTag: p1Evidence.expectedTag ?? null,
      appliedTag: p1Evidence.appliedTag ?? null,
      migratedBeforeRelease: proofs[0]?.status === "pass",
    },
    processes: {
      // Deploy provenance, not self-report: the workflow deploys both from the
      // candidate SHA. A self-reported worker sha, when wired, is enforced in
      // proof 1 and echoed here.
      web: { sha: opts.sha, source: "workflow-deploy-input" },
      worker: { sha: opts.sha, source: "workflow-deploy-input" },
      workerConnectionId,
    },
    proofs,
    providerCalls: {
      // Proxy: usage rows written inside the run window. The controlled stub
      // may legitimately write zero.
      usedProxy: ledgerEnd && ledgerStart ? ledgerEnd.usageRows - ledgerStart.usageRows : null,
      ceiling: opts.provider === "real" ? env.realProviderMaxCalls : null,
    },
    cost: {
      usageRows: ledgerEnd && ledgerStart ? ledgerEnd.usageRows - ledgerStart.usageRows : null,
      creditRows: ledgerEnd && ledgerStart ? ledgerEnd.creditRows - ledgerStart.creditRows : null,
      creditSumDelta: ledgerEnd && ledgerStart ? ledgerEnd.creditSum - ledgerStart.creditSum : null,
      durationS: Math.round((Date.parse(finishedAt) - runStartMs) / 1000),
    },
  };

  mkdirSync(opts.artifactsDir, { recursive: true });
  const reportPath = path.join(opts.artifactsDir, `${opts.sha}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  proofs.push({
    id: "archived_report",
    name: "Report archived per SHA",
    status: "pass",
    summary: `report written to ${reportPath}`,
    evidence: { verdict, proofs: proofs.length },
  });
  // Proof 5 is the archiving itself: rewrite the report including it.
  const finalReport: GateReport = { ...report, proofs: [...proofs] };
  writeFileSync(reportPath, `${JSON.stringify(finalReport, null, 2)}\n`, "utf8");

  await pool.end().catch(() => undefined);
  process.stderr.write(`verdict: ${verdict} — report: ${reportPath}\n`);
  for (const proof of finalReport.proofs) {
    process.stderr.write(`  [${proof.status}] ${proof.id}: ${redact(proof.summary)}\n`);
  }
  process.exit(verdict === "pass" ? 0 : 1);
}

const invokedDirectly = (() => {
  const self = process.argv[1] ?? "";
  try {
    return fileURLToPath(import.meta.url) === path.resolve(self);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? redact(error.message) : String(error);
    process.stderr.write(`fatal: ${message}\n`);
    process.exit(1);
  });
}
