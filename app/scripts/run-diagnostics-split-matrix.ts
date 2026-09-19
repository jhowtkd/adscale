import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DIAGNOSTIC_SCHEMA_VERSION } from "../src/server/diagnostics/contract";
import type {
  DiagnosticContext,
  DiagnosticEventEnvelope,
} from "../src/server/diagnostics/contract";
import { WORKER_CONNECTED_EVENT } from "../src/server/jobs/heavy-image-isolation";
import {
  EXIT_BOOTSTRAP_FAILED,
  EXIT_OK,
  EXIT_VALIDATION_FAILED,
  awaitJourneyTerminal,
  bootHarness,
  buildReplayEventId,
  driveJourney,
  driveSelectionEffectsRecovery,
  parseHarnessArgs,
  readJourneyLedger,
  readJourneyOutputs,
  resolveHarnessConfig,
  seedHarnessFixture,
  sendReplayEvent,
  stopHarness,
  summarizeJourneyLedger,
  summarizeJourneyOutputs,
  type DispatchedJourney,
  type HarnessConfig,
  type HarnessProcesses,
  type JourneyLedgerSummary,
  type JourneyOutputProjection,
  type SpawnedProcess,
} from "./worker-journey-harness";
import {
  DIAGNOSTICS_SPLIT_ROWS,
  REQUIRED_TRACE_SETS,
  buildDiagnosticsSplitEvidence,
  isDiagnosticsSplitRow,
  knownSecretsFromEnv,
  matchRequiredTraceSet,
  scanForSecrets,
  validateDiagnosticsSplitEvidence,
  type DiagnosticsSplitEvidence,
  type DiagnosticsSplitRow,
  type SplitJourneyResult,
  type SplitObservedEvent,
} from "./diagnostics-split-evidence";

/**
 * Diagnostics split-topology failure matrix (jhowtkd/adscale#396, proof-only).
 *
 * Reuses the shared worker-journey harness exactly like
 * `run-selection-effects-recovery.ts` does: this CLI only IMPORTS the
 * harness — it never modifies it. Each journey row boots web + queue +
 * worker on one SHA, drives a synthetic single piece to terminal, approves
 * it, downloads it, then validates the journal traces (via the real
 * `listDiagnosticEvents` / `getWorkDiagnostics` seams), secret absence and
 * settlement equivalence. `unavailable-exporter` is the only row that runs
 * in-process against the real journal with a failing write backend.
 *
 * Run with the react-server condition (server-only modules are imported
 * dynamically, after env validation, so --plan stays env-free):
 *   npm run harness:diagnostics-split-matrix -- --only success
 *
 * Reports: tests/e2e/.evidence/diagnostics-split-<row>.json plus the
 * tests/e2e/.evidence/diagnostics-split-matrix.json summary. Exit 0 when
 * every row validates, 1 on validation failure, 2 on bootstrap failure.
 */

export const SPLIT_HELP = `diagnostics split-topology matrix (#396): prove traceability on web + worker.

usage:
  npx tsx scripts/run-diagnostics-split-matrix.ts [--only a,b,c] [--build] [options]

rows:
  success               journey + approve + download, traces/IDs/secrets/ledger green
  restart               worker reboot around the dispatch, exactly-once traces and charges
  replay                duplicate delivery + journal eventId dedupe, zero new charges
  lost-context          envelopeless replay + partial event tolerated, work stays readable
  unavailable-exporter  failing write backend: degraded telemetry, commands unblocked
  vendor-down           unreachable Langfuse: bounded wait, no fabricated trace IDs
  instrumented-off      flags at frozen defaults: identical effects, zero AI-trace refs

options:
  --only a,b,c          narrow to a comma-separated row subset (default: all rows)
  --build               production build before the first row only
  --web-port <port>     web port (default: harness default)
  --queue-port <port>   queue port (default: harness default)
  --timeout-ms <ms>     terminal wait per journey (default: harness default)
  --observe-ms <ms>     replay observation window (default: harness default)
  --plan                print the resolved run without booting anything
  --help, -h            print this help`;

export interface SplitMatrixScenarioResult {
  row: DiagnosticsSplitRow;
  code: number;
  reportPath: string;
}

export function summarizeSplitMatrix(results: SplitMatrixScenarioResult[]): {
  ok: boolean;
  failed: string[];
} {
  const failed = results
    .filter((result) => result.code !== EXIT_OK)
    .map((result) => result.row);
  return { ok: failed.length === 0, failed };
}

export function parseSplitMatrixOnly(argv: string[]): DiagnosticsSplitRow[] {
  const flagIndex = argv.indexOf("--only");
  if (flagIndex < 0) return [...DIAGNOSTICS_SPLIT_ROWS];
  const raw = argv[flagIndex + 1] ?? "";
  const wanted = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (wanted.length === 0) throw new Error("invalid --only: expected a comma-separated row list");
  for (const row of wanted) {
    if (!isDiagnosticsSplitRow(row)) {
      throw new Error(`invalid --only row: ${JSON.stringify(row)}`);
    }
  }
  return wanted as DiagnosticsSplitRow[];
}

const SPLIT_FORWARDED_VALUE_FLAGS = new Set([
  "--web-port",
  "--queue-port",
  "--timeout-ms",
  "--observe-ms",
]);

/**
 * Flags forwarded into each row's harness config. --only/--plan/--help are
 * consumed here; --build is handled first-row-only by the caller.
 */
export function splitMatrixForwardedArgs(argv: string[]): string[] {
  const forwarded: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--only" || flag === "--plan" || flag === "--help" || flag === "-h") {
      if (flag === "--only") i += 1;
      continue;
    }
    if (flag === "--build") {
      forwarded.push(flag);
      continue;
    }
    if (SPLIT_FORWARDED_VALUE_FLAGS.has(flag)) {
      if (argv[i + 1] === undefined) throw new Error(`invalid ${flag}: expected a value`);
      forwarded.push(flag, argv[i + 1]);
      i += 1;
      continue;
    }
    throw new Error(`unknown flag: ${flag}`);
  }
  return forwarded;
}

export function splitMatrixWantsPlan(argv: string[]): boolean {
  return argv.includes("--plan");
}

export function splitMatrixWantsHelp(argv: string[]): boolean {
  return argv.includes("--help") || argv.includes("-h");
}

// ---------------------------------------------------------------------------
// Per-row observability environment. Process-scoped: children inherit it via
// the harness child env spread, the parent shell is untouched, and frozen
// flag defaults stay off everywhere else.
// ---------------------------------------------------------------------------

export interface RowEnvOverlay {
  set: Record<string, string>;
  unset: string[];
}

const SPLIT_BASE_OBSERVABILITY_ENV: Record<string, string> = {
  OBSERVABILITY_ENABLED: "true",
  OBSERVABILITY_CONTENT_MODE: "metadata_only",
  OBSERVABILITY_WORKSPACE_ALLOWLIST: "",
};

const VENDOR_DOWN_ENV: Record<string, string> = {
  OBSERVABILITY_LANGFUSE_ENABLED: "true",
  LANGFUSE_BASE_URL: "http://127.0.0.1:9",
  LANGFUSE_PUBLIC_KEY: "split-matrix-bogus-public",
  LANGFUSE_SECRET_KEY: "split-matrix-bogus-secret",
};

const INSTRUMENTED_OFF_KEYS = [
  "OBSERVABILITY_ENABLED",
  "OBSERVABILITY_LANGFUSE_ENABLED",
  "OBSERVABILITY_CONTENT_MODE",
  "OBSERVABILITY_WORKSPACE_ALLOWLIST",
  "LANGFUSE_BASE_URL",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
];

/** Pure description of a row's env overlay (unit-tested, applied below). */
export function rowEnvOverlay(row: DiagnosticsSplitRow): RowEnvOverlay {
  if (row === "instrumented-off") {
    return { set: {}, unset: [...INSTRUMENTED_OFF_KEYS] };
  }
  if (row === "vendor-down") {
    return {
      set: { ...SPLIT_BASE_OBSERVABILITY_ENV, ...VENDOR_DOWN_ENV },
      unset: [],
    };
  }
  if (row === "unavailable-exporter") {
    return { set: {}, unset: [] };
  }
  return { set: { ...SPLIT_BASE_OBSERVABILITY_ENV }, unset: [] };
}

/**
 * Apply a row's overlay to `env` (default: this process) and return a
 * restore function. Children spawned while applied inherit the overlay.
 */
export function applyRowEnv(
  row: DiagnosticsSplitRow,
  env: NodeJS.ProcessEnv = process.env,
): () => void {
  const overlay = rowEnvOverlay(row);
  const previous = new Map<string, string | undefined>();
  for (const key of [...Object.keys(overlay.set), ...overlay.unset]) {
    if (!previous.has(key)) previous.set(key, env[key]);
  }
  for (const key of overlay.unset) delete env[key];
  for (const [key, value] of Object.entries(overlay.set)) env[key] = value;
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  };
}

// ---------------------------------------------------------------------------
// Small local helpers (mirrors of unexported harness internals — the harness
// itself is never modified).
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveSha(appDir: string): string {
  if (process.env.GITHUB_SHA?.trim()) return process.env.GITHUB_SHA.trim();
  try {
    const sha = execSync("git rev-parse HEAD", {
      cwd: appDir,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (sha) return sha;
  } catch {
    /* fall through */
  }
  return "unknown";
}

function splitReportPath(row: DiagnosticsSplitRow): string {
  return path.resolve(process.cwd(), `tests/e2e/.evidence/diagnostics-split-${row}.json`);
}

export function splitMatrixSummaryPath(): string {
  return path.resolve(process.cwd(), "tests/e2e/.evidence/diagnostics-split-matrix.json");
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/** Minimal cookie-jar fetch for the download step (harness apiFetch shape). */
async function splitApiFetch(
  url: string,
  jar: string[],
  init: RequestInit = {},
): Promise<{ response: Response; body: string }> {
  const headers = new Headers(init.headers);
  if (jar.length > 0) headers.set("cookie", jar.join("; "));
  headers.set("content-type", "application/json");
  if (!headers.has("origin")) headers.set("origin", new URL(url).origin);
  const response = await fetch(url, { ...init, headers });
  for (const setCookie of response.headers.getSetCookie()) {
    const pair = setCookie.split(";")[0]?.trim();
    if (!pair) continue;
    const name = pair.split("=")[0];
    const index = jar.findIndex((entry) => entry.split("=")[0] === name);
    if (index >= 0) jar[index] = pair;
    else jar.push(pair);
  }
  return { response, body: await response.text() };
}

function parseJsonBody(body: string, label: string): Record<string, unknown> {
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error(`invalid ${label} response: ${truncate(body, 300)}`);
  }
}

function journeyResultFor(outputs: JourneyOutputProjection[]): SplitJourneyResult {
  if (outputs.length === 0) return "unknown";
  const summary = summarizeJourneyOutputs(outputs);
  if (summary.failed) return "failed";
  if (summary.unexecuted) return "unexecuted";
  if (outputs.every((output) => output.status === "completed")) return "completed";
  return "unknown";
}

/** Map a journal envelope to the evidence projection. Pure. */
export function mapEnvelopeToObserved(event: DiagnosticEventEnvelope): SplitObservedEvent {
  return {
    eventId: event.eventId,
    event: event.event,
    stage: event.stage ?? null,
    status: event.status ?? null,
    correlation: event.correlation,
    operationId: event.context?.operationId ?? "",
    parentOperationId: event.context?.parentOperationId ?? null,
    outputId: event.context?.outputId ?? null,
    process: event.context?.process ?? "unknown",
    dataOrigin: event.context?.dataOrigin ?? "unknown",
    hasCall: event.call !== undefined,
    hasError: event.error !== undefined,
    hasExternalRefs: event.externalRefs !== undefined,
    hasLangfuseRefs:
      event.externalRefs?.langfuseTraceId !== undefined ||
      event.externalRefs?.langfuseObservationId !== undefined,
    contentAvailability: event.content?.availability ?? null,
  };
}

/** Synthetic journal context for matrix-owned probe events. Pure. */
export function splitProbeContext(input: {
  workspaceId: string;
  workItemId: string;
  outputId?: string;
  operationId: string;
}): DiagnosticContext {
  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    workspaceId: input.workspaceId,
    clientProfileId: null,
    workItemId: input.workItemId,
    protocol: "single",
    operationId: input.operationId,
    ...(input.outputId ? { outputId: input.outputId } : {}),
    releaseSha: "diagnostics-split-matrix",
    environment: "test",
    process: "web",
    dataOrigin: "synthetic",
  };
}

function splitProbeEnvelope(input: {
  eventId: string;
  event: DiagnosticEventEnvelope["event"];
  context: DiagnosticContext;
  correlation?: "full" | "partial";
  probe: string;
}): DiagnosticEventEnvelope {
  const at = new Date().toISOString();
  return {
    eventId: input.eventId,
    event: input.event,
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    occurredAt: at,
    recordedAt: at,
    correlation: input.correlation ?? "full",
    context: input.context,
    attributes: { "diagnostic.probe": input.probe },
  };
}

// ---------------------------------------------------------------------------
// Worker reboot for the restart row. The harness owns startWorker/stopProcess
// without exporting them, so this row carries its own spawn — same argv, same
// env shape, same connected-event gate — and never touches the harness.
// ---------------------------------------------------------------------------

function matrixChildEnv(config: HarnessConfig, runDir: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...config.requiredEnv,
    TZ: "UTC",
    PGTZ: "UTC",
    NODE_ENV: "production",
    IMAGE_JOB_TARGET: "worker",
    IMAGE_ROUTE_CONCURRENCY: "1",
    INNGEST_BASE_URL: config.queueUrl,
    E2E_CONTROLLED_PROVIDER: "true",
    E2E_DISABLE_RATE_LIMIT: "true",
    E2E_STORAGE_DIR: path.join(runDir, "storage"),
    E2E_PROVIDER_EVIDENCE_PATH: path.join(runDir, "provider-calls-worker.jsonl"),
    CREATE_POST_E2E_FIXTURE_PATH: path.join(runDir, "fixture.json"),
    APP_URL: process.env.APP_URL ?? config.baseUrl,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? config.baseUrl,
    STUDIO_PROGRESSIVE_ROLLOUT_PERCENT:
      process.env.STUDIO_PROGRESSIVE_ROLLOUT_PERCENT ?? "100",
    STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT:
      process.env.STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT ?? "0",
  };
}

function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }, timeoutMs);
    timer.unref?.();
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.once("error", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function stopMatrixWorker(worker: SpawnedProcess | null): Promise<void> {
  if (!worker) return;
  try {
    worker.child.kill("SIGTERM");
  } catch {
    /* already gone */
  }
  await waitForChildExit(worker.child, 30_000);
}

/**
 * Boot a replacement worker after the kill. Polls the log file (not process
 * memory) for the connected event, bounded at 120s like the harness gate.
 */
/**
 * Spawn lifecycle for the matrix-owned replacement worker. `detached`
 * matches the harness's own spawn shape on purpose: stopHarness kills by
 * process GROUP, and a non-detached child is not a group leader, so the
 * group kill throws ESRCH, is swallowed, and the worker survives as an
 * orphan whose reconnect loop steals later rows' jobs (trace-396:
 * wandering exact_asset_preflight_failed rows). Pure (unit-tested).
 */
export function matrixWorkerSpawnOptions(): Pick<SpawnOptions, "detached" | "stdio"> {
  return {
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  };
}

async function respawnMatrixWorker(
  config: HarnessConfig,
  processes: HarnessProcesses,
): Promise<void> {
  const logPath = path.join(processes.runDir, "worker-restarted.log");
  const child = spawn(
    process.execPath,
    ["--conditions=react-server", "--import=tsx", "src/server/jobs/image-worker.ts"],
    {
      cwd: config.appDir,
      env: matrixChildEnv(config, processes.runDir),
      ...matrixWorkerSpawnOptions(),
    },
  );
  let output = "";
  const append = (chunk: Buffer | string): void => {
    const text = chunk.toString();
    output += text;
    try {
      fs.appendFileSync(logPath, text);
    } catch {
      /* log loss must not fail the row */
    }
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  child.on("error", (error) => append(`worker spawn error: ${String(error)}\n`));
  const deadline = Date.now() + 120_000;
  for (;;) {
    if (output.includes(WORKER_CONNECTED_EVENT)) break;
    if (child.exitCode !== null) {
      throw new Error(`restarted worker exited early (code ${child.exitCode}). See ${logPath}`);
    }
    if (Date.now() >= deadline) {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      throw new Error(
        `timed out waiting for restarted worker to print ${JSON.stringify(WORKER_CONNECTED_EVENT)}. See ${logPath}`,
      );
    }
    await sleep(500);
  }
  processes.worker = { role: "worker", child, logPath, output };
}

// ---------------------------------------------------------------------------
// Download step: serves one export so the row observes export.prepared +
// export.served from the real HTTP stack. JSON format keeps the assertion on
// status/body, never on bytes.
// ---------------------------------------------------------------------------

export interface SplitDownloadResult {
  ok: boolean;
  format: string | null;
  servedAs: string | null;
  status: number | null;
  error: string | null;
}

async function downloadSelectedOutput(
  config: HarnessConfig,
  processes: HarnessProcesses,
  workId: string,
  outputId: string,
): Promise<SplitDownloadResult> {
  const failed = (error: string, status: number | null = null): SplitDownloadResult => ({
    ok: false,
    format: null,
    servedAs: null,
    status,
    error,
  });
  try {
    const fixture = JSON.parse(fs.readFileSync(processes.fixturePath, "utf8")) as {
      email?: string;
      password?: string;
    };
    if (!fixture.email || !fixture.password) {
      return failed(`fixture is missing email/password: ${processes.fixturePath}`);
    }
    const jar: string[] = [];
    const signIn = await splitApiFetch(`${config.baseUrl}/api/auth/sign-in/email`, jar, {
      method: "POST",
      body: JSON.stringify({ email: fixture.email, password: fixture.password }),
    });
    if (!signIn.response.ok) {
      return failed(`download sign-in failed (HTTP ${signIn.response.status})`, signIn.response.status);
    }
    const download = await splitApiFetch(
      `${config.baseUrl}/api/creative-work/${workId}/outputs/${outputId}/download?format=json`,
      jar,
      { method: "GET", headers: { accept: "application/json" } },
    );
    if (!download.response.ok) {
      return failed(
        `download failed (HTTP ${download.response.status}): ${truncate(download.body, 200)}`,
        download.response.status,
      );
    }
    const body = parseJsonBody(download.body, "download");
    if (typeof body.url !== "string" || body.url.length === 0) {
      return failed(`download returned no url: ${truncate(download.body, 200)}`, 200);
    }
    return { ok: true, format: "original", servedAs: "json", status: 200, error: null };
  } catch (error) {
    return failed(error instanceof Error ? error.message : String(error));
  }
}

// ---------------------------------------------------------------------------
// Journal observation through the real read seams (dynamically imported so
// --plan and unit tests never touch server runtime).
// ---------------------------------------------------------------------------

type ListEventsFn = (
  input: { workspaceId: string; workItemId: string; limit?: number; cursor?: string },
) => Promise<{ events: DiagnosticEventEnvelope[]; nextCursor: string | null }>;

async function readAllJourneyEvents(
  listDiagnosticEvents: ListEventsFn,
  scope: { workspaceId: string; workItemId: string },
): Promise<DiagnosticEventEnvelope[]> {
  const events: DiagnosticEventEnvelope[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const result = await listDiagnosticEvents({ ...scope, limit: 100, ...(cursor ? { cursor } : {}) });
    events.push(...result.events);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return events;
}

/**
 * Web/worker journals flush on a 1s interval outside the request path, so
 * the CLI polls until the row's required names are present (or 90s pass and
 * the validator fails honestly on what was observed).
 */
async function pollJourneyEvents(
  listDiagnosticEvents: ListEventsFn,
  scope: { workspaceId: string; workItemId: string },
  row: DiagnosticsSplitRow,
  timeoutMs = 90_000,
): Promise<DiagnosticEventEnvelope[]> {
  const required = REQUIRED_TRACE_SETS[row];
  const deadline = Date.now() + timeoutMs;
  let events: DiagnosticEventEnvelope[] = [];
  for (;;) {
    events = await readAllJourneyEvents(listDiagnosticEvents, scope);
    const counts: Record<string, number> = {};
    for (const event of events) counts[event.event] = (counts[event.event] ?? 0) + 1;
    if (matchRequiredTraceSet(counts, required).length === 0) return events;
    if (Date.now() >= deadline) return events;
    await sleep(2000);
  }
}

export interface SplitTelemetrySummary {
  found: boolean;
  status: string | null;
  partial: boolean;
  operationIds: string[];
}

async function readTelemetrySummary(
  getWorkDiagnostics: (input: {
    workspaceId: string;
    workItemId: string;
  }) => Promise<unknown>,
  scope: { workspaceId: string; workItemId: string },
): Promise<SplitTelemetrySummary> {
  const raw = asRecord(await getWorkDiagnostics(scope));
  const telemetry = asRecord(raw.telemetry);
  const operationIds = Array.isArray(telemetry.operationIds)
    ? telemetry.operationIds.filter((id): id is string => typeof id === "string")
    : [];
  return {
    found: raw.found === true,
    status: typeof telemetry.status === "string" ? telemetry.status : null,
    partial: telemetry.partial === true,
    operationIds,
  };
}

// ---------------------------------------------------------------------------
// Row reports.
// ---------------------------------------------------------------------------

export interface SplitRowReport {
  row: DiagnosticsSplitRow;
  ok: boolean;
  failures: string[];
  evidence: DiagnosticsSplitEvidence | null;
  validation: { ok: boolean; failures: string[] } | null;
  telemetry: SplitTelemetrySummary | null;
  recovery: { ok: boolean; failures: string[]; selectedOutputId: string } | null;
  download: SplitDownloadResult | null;
  ledger: JourneyLedgerSummary | null;
  dedupeProof: { eventId: string; rowsObserved: number; duplicatesDelta: number } | null;
  lostContextProof: { partialEventId: string; partialObserved: boolean; malformedDropped: boolean } | null;
  degradedProof: {
    hangFlushFailed: boolean;
    throwFlushFailed: boolean;
    emitLatencyMs: number;
    unavailableCompositionOk: boolean;
  } | null;
  meta: {
    baseUrl: string;
    queueUrl: string;
    runDir: string;
    sha: string;
    durationMs: number;
    startedAt: string;
  };
}

function emptyRowReport(row: DiagnosticsSplitRow, config: HarnessConfig): SplitRowReport {
  return {
    row,
    ok: false,
    failures: [],
    evidence: null,
    validation: null,
    telemetry: null,
    recovery: null,
    download: null,
    ledger: null,
    dedupeProof: null,
    lostContextProof: null,
    degradedProof: null,
    meta: {
      baseUrl: config.baseUrl,
      queueUrl: config.queueUrl,
      runDir: "",
      sha: resolveSha(config.appDir),
      durationMs: 0,
      startedAt: new Date().toISOString(),
    },
  };
}

function writeRowReport(reportPath: string, report: SplitRowReport): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Journey rows (split topology).
// ---------------------------------------------------------------------------

async function proveEventIdDedupe(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  readEvents: () => Promise<DiagnosticEventEnvelope[]>;
}): Promise<{ proof: NonNullable<SplitRowReport["dedupeProof"]>; failures: string[] }> {
  const failures: string[] = [];
  const journal = await import("../src/server/diagnostics/journal");
  const eventId = `diagnostics-split-dedupe-${randomUUID()}`;
  const before = journal.getDiagnosticJournalStats().duplicateEvents;
  const envelope = splitProbeEnvelope({
    eventId,
    event: "operation.replayed",
    context: splitProbeContext({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      outputId: input.outputId,
      operationId: `dedupe-${randomUUID()}`,
    }),
    probe: "matrix-eventId-dedupe",
  });
  await journal.emitDiagnosticEvent(structuredClone(envelope));
  await journal.emitDiagnosticEvent(structuredClone(envelope));
  await journal.flushDiagnosticEvents();
  const events = await input.readEvents();
  const rowsObserved = events.filter((event) => event.eventId === eventId).length;
  const duplicatesDelta = journal.getDiagnosticJournalStats().duplicateEvents - before;
  if (rowsObserved !== 1) {
    failures.push(`eventId dedupe: expected 1 journal row for ${eventId}, observed ${rowsObserved}`);
  }
  if (duplicatesDelta < 1) {
    failures.push("eventId dedupe: journal did not count the duplicate delivery");
  }
  return { proof: { eventId, rowsObserved, duplicatesDelta }, failures };
}

async function proveLostContext(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  readEvents: () => Promise<DiagnosticEventEnvelope[]>;
}): Promise<{ proof: NonNullable<SplitRowReport["lostContextProof"]>; failures: string[] }> {
  const failures: string[] = [];
  const journal = await import("../src/server/diagnostics/journal");
  const partialEventId = `diagnostics-split-partial-${randomUUID()}`;
  await journal.emitDiagnosticEvent(
    splitProbeEnvelope({
      eventId: partialEventId,
      event: "stage.completed",
      context: splitProbeContext({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        outputId: input.outputId,
        operationId: `lost-context-${randomUUID()}`,
      }),
      correlation: "partial",
      probe: "matrix-lost-context",
    }),
  );
  await journal.flushDiagnosticEvents();
  const events = await input.readEvents();
  const partialObserved = events.some(
    (event) => event.eventId === partialEventId && event.correlation === "partial",
  );
  if (!partialObserved) {
    failures.push("lost-context: partial-correlation event was not persisted");
  }
  // Malformed metadata must degrade to a dropped counter — never a throw,
  // never a rejected command.
  let malformedDropped = false;
  try {
    const droppedBefore = journal.getDiagnosticJournalStats().droppedEvents;
    journal.enqueueDiagnosticEvent({
      eventId: `diagnostics-split-malformed-${randomUUID()}`,
      event: "stage.completed",
      schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
      occurredAt: new Date().toISOString(),
      recordedAt: new Date().toISOString(),
      correlation: "full",
      context: null,
    } as unknown as DiagnosticEventEnvelope);
    malformedDropped =
      journal.getDiagnosticJournalStats().droppedEvents - droppedBefore >= 1;
  } catch {
    malformedDropped = false;
  }
  if (!malformedDropped) {
    failures.push("lost-context: malformed event was not dropped-with-counter");
  }
  return { proof: { partialEventId, partialObserved, malformedDropped }, failures };
}

async function runJourneyRow(
  row: DiagnosticsSplitRow,
  config: HarnessConfig,
): Promise<{ report: SplitRowReport; code: number }> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const report = emptyRowReport(row, config);
  report.meta.startedAt = startedAt;
  const restoreEnv = applyRowEnv(row);
  const processes = await bootHarness(config);
  report.meta.runDir = processes.runDir;
  try {
    await seedHarnessFixture(config, processes);
    const since = new Date().toISOString();
    let journey: DispatchedJourney;
    let jar: string[];
    let workId: string;
    let restarted = false;
    if (row === "restart") {
      // Kill the connected worker BEFORE the dispatch so the event queues
      // while down; the rebooted worker must execute it exactly once.
      await stopMatrixWorker(processes.worker);
      processes.worker = null;
      const driven = await driveJourney(config, processes, "observe");
      await respawnMatrixWorker(config, processes);
      restarted = true;
      driven.journey.outputs = await awaitJourneyTerminal(
        config.baseUrl,
        driven.jar,
        driven.workId,
        config.timeoutMs,
      );
      journey = driven.journey;
      jar = driven.jar;
      workId = driven.workId;
    } else {
      const driven = await driveJourney(config, processes, "terminal");
      journey = driven.journey;
      jar = driven.jar;
      workId = driven.workId;
      if (row === "replay" || row === "lost-context") {
        const outputId = journey.outputIds[0];
        if (!outputId) throw new Error(`${row}: journey produced no outputs to replay`);
        // Fresh event id, original data, no diagnostic envelope: the run
        // must hit job-level idempotency with lost context, never transport
        // dedupe and never a context-carrying redelivery.
        await sendReplayEvent({
          queueUrl: config.queueUrl,
          eventKey: config.requiredEnv.INNGEST_EVENT_KEY,
          eventId: buildReplayEventId(outputId, randomUUID()),
          data: {
            workspaceId: journey.workspaceId,
            workItemId: journey.workItemId,
            outputId,
            generationCorrelationId: journey.correlationId,
          },
        });
        await sleep(config.observeMs);
        journey.outputs = await readJourneyOutputs(config.baseUrl, jar, workId);
      }
    }

    const scope = { workspaceId: journey.workspaceId, workItemId: journey.workItemId };
    const recovery = await driveSelectionEffectsRecovery(config, processes, journey);
    report.recovery = {
      ok: recovery.ok,
      failures: recovery.failures,
      selectedOutputId: recovery.selectedOutputId,
    };
    if (!recovery.ok) {
      report.failures.push(`approval did not converge: ${recovery.failures.join("; ") || "unknown"}`);
    }
    let download: SplitDownloadResult = {
      ok: false,
      format: null,
      servedAs: null,
      status: null,
      error: "skipped: no selected output",
    };
    if (recovery.ok && recovery.selectedOutputId) {
      download = await downloadSelectedOutput(
        config,
        processes,
        journey.workItemId,
        recovery.selectedOutputId,
      );
      if (!download.ok) {
        report.failures.push(`download failed: ${download.error ?? "unknown"}`);
      }
    }
    report.download = download;

    const journal = await import("../src/server/diagnostics/journal");
    const readEvents = (): Promise<DiagnosticEventEnvelope[]> =>
      readAllJourneyEvents(journal.listDiagnosticEvents, scope);
    let events = await pollJourneyEvents(journal.listDiagnosticEvents, scope, row);

    if (row === "replay" && journey.outputIds[0]) {
      const { proof, failures } = await proveEventIdDedupe({
        workspaceId: journey.workspaceId,
        workItemId: journey.workItemId,
        outputId: journey.outputIds[0],
        readEvents,
      });
      report.dedupeProof = proof;
      report.failures.push(...failures);
      events = await readEvents();
    }
    if (row === "lost-context" && journey.outputIds[0]) {
      const { proof, failures } = await proveLostContext({
        workspaceId: journey.workspaceId,
        workItemId: journey.workItemId,
        outputId: journey.outputIds[0],
        readEvents,
      });
      report.lostContextProof = proof;
      report.failures.push(...failures);
      events = await readEvents();
    }

    const diagnosticsApi = await import("../src/server/diagnostics/diagnostics-api");
    const telemetry = await readTelemetrySummary(diagnosticsApi.getWorkDiagnostics, scope);
    report.telemetry = telemetry;
    if (!telemetry.found) report.failures.push("getWorkDiagnostics: work was not found");
    if (telemetry.status !== "ok") {
      report.failures.push(`getWorkDiagnostics: telemetry status is ${telemetry.status ?? "missing"}`);
    }
    if (row === "lost-context" && !telemetry.partial) {
      report.failures.push("lost-context: work telemetry does not report partial correlation");
    }

    const ledgerRows = await readJourneyLedger(config.requiredEnv.DATABASE_URL, {
      workspaceId: journey.workspaceId,
      workId: journey.workItemId,
      outputIds: journey.outputIds,
      since,
    });
    const ledger = summarizeJourneyLedger(ledgerRows, journey.workItemId, journey.outputIds);
    report.ledger = ledger;

    const observed = events.map(mapEnvelopeToObserved);
    const secretFindings = scanForSecrets(JSON.stringify(events), knownSecretsFromEnv(process.env));
    const evidence = buildDiagnosticsSplitEvidence({
      row,
      sha: report.meta.sha,
      nodeVersion: config.nodeVersion,
      workspaceId: journey.workspaceId,
      workItemId: journey.workItemId,
      outputIds: journey.outputIds,
      selectedOutputId: recovery.selectedOutputId || null,
      downloadedFormat: download.format,
      restarted,
      observedEvents: observed,
      ledger: { debits: ledger.debits, refunds: ledger.refunds, duplicateCharges: ledger.duplicateCharges },
      journeyResult: journeyResultFor(
        journey.outputs.filter((output) => journey.outputIds.includes(output.id)),
      ),
      secretFindings,
      durationMs: Date.now() - started,
      startedAt,
    });
    report.evidence = evidence;
    const validation = validateDiagnosticsSplitEvidence(evidence);
    report.validation = validation;
    report.failures.push(...validation.failures);
    report.meta.durationMs = Date.now() - started;
    report.ok = report.failures.length === 0;
    return { report, code: report.ok ? EXIT_OK : EXIT_VALIDATION_FAILED };
  } finally {
    restoreEnv();
    await stopHarness(processes);
  }
}

// ---------------------------------------------------------------------------
// unavailable-exporter row: no topology. The real journal runs in-process
// against hanging/throwing write backends; commands must stay unblocked and
// the read seam must degrade to unavailable telemetry with the work intact.
// ---------------------------------------------------------------------------

async function runExporterRow(config: HarnessConfig): Promise<{ report: SplitRowReport; code: number }> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const report = emptyRowReport("unavailable-exporter", config);
  report.meta.startedAt = startedAt;
  report.meta.runDir = fs.mkdtempSync(path.join(os.tmpdir(), "diagnostics-split-exporter-"));

  const journal = await import("../src/server/diagnostics/journal");
  const diagnosticsApi = await import("../src/server/diagnostics/diagnostics-api");
  const probeInput = {
    workspaceId: "00000000-0000-0000-0000-000000000001",
    workItemId: "00000000-0000-0000-0000-000000000002",
    operationId: `exporter-probe-${randomUUID()}`,
  };
  const hangJournal = journal.createDiagnosticJournal({
    persistBatch: () => new Promise<never>(() => {}),
    writeTimeoutMs: 50,
  });
  const hangStarted = Date.now();
  await hangJournal.emit(splitProbeEnvelope({
    eventId: `exporter-hang-${randomUUID()}`,
    event: "stage.completed",
    context: splitProbeContext(probeInput),
    probe: "matrix-exporter-hang",
  }));
  await hangJournal.flush();
  const hangStats = hangJournal.stats();
  const throwJournal = journal.createDiagnosticJournal({
    persistBatch: async () => {
      throw new Error("exporter down");
    },
    writeTimeoutMs: 1000,
  });
  const emitStarted = Date.now();
  await throwJournal.emit(splitProbeEnvelope({
    eventId: `exporter-throw-${randomUUID()}`,
    event: "stage.completed",
    context: splitProbeContext({ ...probeInput, operationId: `exporter-probe-${randomUUID()}` }),
    probe: "matrix-exporter-throw",
  }));
  const emitLatencyMs = Date.now() - emitStarted;
  await throwJournal.flush();
  const throwStats = throwJournal.stats();

  // The read seam degrades to unavailable telemetry while the work itself
  // stays readable — pure composition over the real module.
  const composed = diagnosticsApi.composeWorkDiagnostics(
    {
      workspaceId: probeInput.workspaceId,
      workItemId: probeInput.workItemId,
    } as Parameters<typeof diagnosticsApi.composeWorkDiagnostics>[0],
    { status: "unavailable" },
    [],
  ) as { found?: boolean; telemetry?: { status?: string } };
  const unavailableCompositionOk =
    composed.found === true && composed.telemetry?.status === "unavailable";

  const degradedProof = {
    hangFlushFailed: hangStats.failedFlushes >= 1,
    throwFlushFailed: throwStats.failedFlushes >= 1,
    emitLatencyMs,
    unavailableCompositionOk,
  };
  report.degradedProof = degradedProof;
  if (Date.now() - hangStarted > 30_000) {
    report.failures.push("unavailable-exporter: hanging backend blocked the row past 30s");
  }
  if (!degradedProof.hangFlushFailed) {
    report.failures.push("unavailable-exporter: hanging write backend did not surface failedFlushes");
  }
  if (!degradedProof.throwFlushFailed) {
    report.failures.push("unavailable-exporter: throwing write backend did not surface failedFlushes");
  }
  if (!hangStats.degraded || !throwStats.degraded) {
    report.failures.push("unavailable-exporter: journal did not report degraded");
  }
  if (emitLatencyMs > 1000) {
    report.failures.push(`unavailable-exporter: emit blocked the command path (${emitLatencyMs}ms)`);
  }
  if (!unavailableCompositionOk) {
    report.failures.push("unavailable-exporter: read seam did not degrade to unavailable telemetry");
  }

  const evidence = buildDiagnosticsSplitEvidence({
    row: "unavailable-exporter",
    sha: report.meta.sha,
    nodeVersion: config.nodeVersion,
    workspaceId: probeInput.workspaceId,
    workItemId: probeInput.workItemId,
    outputIds: [],
    topology: "in-process",
    degraded: hangStats.degraded && throwStats.degraded,
    observedEvents: [],
    ledger: null,
    journeyResult: "not-applicable",
    secretFindings: [],
    durationMs: Date.now() - started,
    startedAt,
  });
  report.evidence = evidence;
  const validation = validateDiagnosticsSplitEvidence(evidence);
  report.validation = validation;
  report.failures.push(...validation.failures);
  report.meta.durationMs = Date.now() - started;
  report.ok = report.failures.length === 0;
  return { report, code: report.ok ? EXIT_OK : EXIT_VALIDATION_FAILED };
}

// ---------------------------------------------------------------------------
// Matrix main.
// ---------------------------------------------------------------------------

export async function runSplitMatrix(
  argv: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ code: number; results: SplitMatrixScenarioResult[] }> {
  let rows: DiagnosticsSplitRow[];
  let forwarded: string[];
  try {
    rows = parseSplitMatrixOnly(argv);
    forwarded = splitMatrixForwardedArgs(argv);
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    return { code: EXIT_BOOTSTRAP_FAILED, results: [] };
  }
  if (splitMatrixWantsHelp(argv)) {
    console.log(SPLIT_HELP);
    return { code: EXIT_OK, results: [] };
  }

  // Resolve once for --plan / shared output (per-row configs re-resolve so
  // --build lands on the first row only).
  let planConfig: HarnessConfig;
  let planProblems: string[];
  try {
    const parsed = parseHarnessArgs(["--scenario", "success", ...forwarded.filter((entry) => entry !== "--build")]);
    ({ config: planConfig, problems: planProblems } = resolveHarnessConfig(parsed, env));
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    return { code: EXIT_BOOTSTRAP_FAILED, results: [] };
  }
  if (splitMatrixWantsPlan(argv)) {
    console.log(
      JSON.stringify(
        {
          plan: true,
          gate: "diagnostics-split-matrix",
          rows,
          baseUrl: planConfig.baseUrl,
          queueUrl: planConfig.queueUrl,
          target: planConfig.target,
          timeoutMs: planConfig.timeoutMs,
          observeMs: planConfig.observeMs,
          build: forwarded.includes("--build"),
          nodeVersion: planConfig.nodeVersion,
          pinnedNodeMajor: planConfig.pinnedNodeMajor,
          overlays: Object.fromEntries(rows.map((row) => [row, rowEnvOverlay(row)])),
          reportPaths: rows.map((row) => splitReportPath(row)),
          problems: planProblems,
        },
        null,
        2,
      ),
    );
    return { code: EXIT_OK, results: [] };
  }
  if (planProblems.length > 0) {
    console.error(`configuration problems:\n- ${planProblems.join("\n- ")}\n`);
    console.error(SPLIT_HELP);
    return { code: EXIT_BOOTSTRAP_FAILED, results: [] };
  }

  const results: SplitMatrixScenarioResult[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    console.log(`\n=== diagnostics-split matrix: ${row} (${index + 1}/${rows.length}) ===`);
    const reportPath = splitReportPath(row);
    const rowForwarded = forwarded.filter((entry) => entry !== "--build");
    if (index === 0 && forwarded.includes("--build")) rowForwarded.push("--build");
    try {
      const parsed = parseHarnessArgs(["--scenario", "success", ...rowForwarded]);
      const { config, problems } = resolveHarnessConfig(parsed, env);
      if (problems.length > 0) {
        throw new Error(`configuration problems:\n- ${problems.join("\n- ")}`);
      }
      const { report, code } = row === "unavailable-exporter"
        ? await runExporterRow(config)
        : await runJourneyRow(row, config);
      writeRowReport(reportPath, report);
      console.log(
        report.ok
          ? `diagnostics-split ${row}: VALID (${report.meta.durationMs}ms)`
          : `diagnostics-split ${row}: INVALID\n- ${report.failures.join("\n- ")}`,
      );
      console.log(`report: ${reportPath}`);
      results.push({ row, code, reportPath });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`diagnostics-split ${row}: BOOTSTRAP FAILED: ${message}`);
      results.push({ row, code: EXIT_BOOTSTRAP_FAILED, reportPath });
    }
  }
  const summary = summarizeSplitMatrix(results);
  const summaryPath = splitMatrixSummaryPath();
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(
    summaryPath,
    `${JSON.stringify(
      { ok: summary.ok, failed: summary.failed, rows: results, startedAt: new Date().toISOString() },
      null,
      2,
    )}\n`,
  );
  console.log(
    `\ndiagnostics-split matrix: ${summary.ok ? "VALID" : "INVALID"}` +
      (summary.ok ? "" : ` — failed: ${summary.failed.join(", ")}`),
  );
  return { code: summary.ok ? EXIT_OK : EXIT_VALIDATION_FAILED, results };
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  runSplitMatrix(process.argv.slice(2), process.env).then(
    ({ code }) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(EXIT_BOOTSTRAP_FAILED);
    },
  );
}
