import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { DIAGNOSTIC_SCHEMA_VERSION } from "../src/server/diagnostics/contract";
import type { DiagnosticEventEnvelope } from "../src/server/diagnostics/contract";
import { redactTelemetry } from "../src/lib/redact-telemetry";
import { splitProbeContext } from "./run-diagnostics-split-matrix";

/**
 * Diagnostics instrumentation overhead probe (jhowtkd/adscale#396, proof-only).
 *
 * Measures the SYNCHRONOUS per-command cost of the diagnostics write path —
 * envelope build + redactTelemetry + journal enqueue — with flags on versus
 * a flag-off short-circuit, on one machine/SHA/config. The journal persists
 * through an injected in-memory backend, so no database traffic pollutes the
 * timings; the batch flush is measured separately and reported, never mixed
 * into the per-op percentiles.
 *
 * Budgets (spec values, see header note on p95): process RSS growth across
 * the instrumented phase stays under 20 MiB, and instrumented per-op p95
 * stays under 5ms — i.e. within +5% of any real command taking >=100ms,
 * which every command on this stack does. A relative +5% assert against a
 * microsecond short-circuit baseline would measure timer noise instead of
 * overhead, so the relative delta is REPORTED (overheadPct) but the gate
 * asserts the absolute budgets.
 *
 * Usage:
 *   npm run diagnostics:overhead [-- --ops 500 --report <path>]
 *
 * Requires DATABASE_URL only because importing the journal constructs its
 * (unused here) drizzle pool; the probe never connects. --ops below 200 is
 * rejected: the ticket requires >=200 operations per condition.
 */

export const OVERHEAD_DEFAULT_OPS = 500;
export const OVERHEAD_MIN_OPS = 200;
export const OVERHEAD_DEFAULT_WARMUP = 50;
export const OVERHEAD_DEFAULT_P95_BUDGET_MS = 5;
export const OVERHEAD_DEFAULT_RSS_BUDGET_MIB = 20;

export const OVERHEAD_HELP = `diagnostics overhead probe (#396): instrumented vs instrumented-off cost.

usage:
  npx tsx scripts/measure-diagnostics-overhead.ts [--ops <n>] [--report <path>]

options:
  --ops <n>       measured operations per condition (default 500, minimum 200)
  --report <path> report path (default tests/e2e/.evidence/diagnostics-overhead.json)
  --help, -h      print this help

env budgets: DIAGNOSTICS_OVERHEAD_P95_BUDGET_MS (default 5),
             DIAGNOSTICS_OVERHEAD_RSS_BUDGET_MIB (default 20).`;

export interface OverheadArgs {
  ops: number;
  reportPath: string;
  help: boolean;
}

export function parseOverheadArgs(argv: string[]): OverheadArgs {
  const args: OverheadArgs = {
    ops: OVERHEAD_DEFAULT_OPS,
    reportPath: path.resolve(process.cwd(), "tests/e2e/.evidence/diagnostics-overhead.json"),
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (flag === "--ops") {
      const ops = Number(next);
      if (!next || !Number.isInteger(ops) || ops <= 0) {
        throw new Error(`invalid --ops: expected a positive integer, got ${JSON.stringify(next ?? "")}`);
      }
      if (ops < OVERHEAD_MIN_OPS) {
        throw new Error(`invalid --ops: ticket #396 requires at least ${OVERHEAD_MIN_OPS} operations per condition`);
      }
      args.ops = ops;
      i += 1;
    } else if (flag === "--report") {
      if (!next) throw new Error("invalid --report: expected a file path");
      args.reportPath = next;
      i += 1;
    } else if (flag === "--help" || flag === "-h") {
      args.help = true;
    } else {
      throw new Error(`unknown flag: ${flag}`);
    }
  }
  return args;
}

/** Nearest-rank percentile over a copy (never mutates the input). Pure. */
export function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[Math.max(0, rank)] ?? 0;
}

export interface SampleSummary {
  count: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  stddevMs: number;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Full dispersion summary for one condition's per-op timings. Pure. */
export function summarizeSamples(values: number[]): SampleSummary {
  if (values.length === 0) {
    return { count: 0, minMs: 0, maxMs: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, stddevMs: 0 };
  }
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance =
    values.reduce((total, value) => total + (value - mean) * (value - mean), 0) / values.length;
  return {
    count: values.length,
    minMs: round3(Math.min(...values)),
    maxMs: round3(Math.max(...values)),
    meanMs: round3(mean),
    p50Ms: round3(percentile(values, 0.5)),
    p95Ms: round3(percentile(values, 0.95)),
    stddevMs: round3(Math.sqrt(variance)),
  };
}

export interface OverheadBudgets {
  p95Ms: number;
  rssMiB: number;
}

export function resolveOverheadBudgets(env: NodeJS.ProcessEnv): OverheadBudgets {
  const p95 = Number(env.DIAGNOSTICS_OVERHEAD_P95_BUDGET_MS);
  const rss = Number(env.DIAGNOSTICS_OVERHEAD_RSS_BUDGET_MIB);
  return {
    p95Ms: Number.isFinite(p95) && p95 > 0 ? p95 : OVERHEAD_DEFAULT_P95_BUDGET_MS,
    rssMiB: Number.isFinite(rss) && rss > 0 ? rss : OVERHEAD_DEFAULT_RSS_BUDGET_MIB,
  };
}

/** Gate the measured instrumented cost against the absolute budgets. Pure. */
export function checkOverheadBudgets(
  measured: { p95Ms: number; rssDeltaMiB: number },
  budgets: OverheadBudgets,
): string[] {
  const failures: string[] = [];
  if (measured.p95Ms > budgets.p95Ms) {
    failures.push(`instrumented p95 ${measured.p95Ms}ms exceeds budget ${budgets.p95Ms}ms`);
  }
  if (measured.rssDeltaMiB > budgets.rssMiB) {
    failures.push(`RSS growth ${measured.rssDeltaMiB}MiB exceeds budget ${budgets.rssMiB}MiB`);
  }
  return failures;
}

export interface OverheadReport {
  ok: boolean;
  failures: string[];
  sha: string;
  nodeVersion: string;
  ops: number;
  warmup: number;
  budgets: OverheadBudgets;
  off: SampleSummary & { rssBeforeMiB: number; rssAfterMiB: number };
  on: SampleSummary & { rssBeforeMiB: number; rssAfterMiB: number; flushMs: number };
  rssDeltaMiB: number;
  /** Relative p95 delta, reported for context — the gate asserts absolutes. */
  overheadPct: number | null;
  startedAt: string;
}

function resolveSha(): string {
  if (process.env.GITHUB_SHA?.trim()) return process.env.GITHUB_SHA.trim();
  try {
    const sha = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    if (sha) return sha;
  } catch {
    /* fall through */
  }
  return "unknown";
}

function rssMiB(): number {
  return Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100;
}

/**
 * One representative instrumented op: fresh envelope, redaction over
 * secret-bearing keys plus usage counters, then the real enqueue. The
 * attributes mirror a model.call envelope (secret keys redacted, usage
 * counters passing through).
 */
function instrumentedOp(
  enqueue: (event: DiagnosticEventEnvelope) => void,
  operationId: string,
): void {
  const at = new Date().toISOString();
  const attributes = redactTelemetry({
    "call.provider": "openai",
    "call.requested_model": "gpt-image-1",
    "call.input_tokens": 1200,
    "call.output_tokens": 300,
    access_token: "sk-test-should-be-redacted",
    authorization: "Bearer sk-test-should-be-redacted",
  }) as Record<string, string | number | boolean | null>;
  enqueue({
    eventId: randomUUID(),
    event: "model.call.completed",
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    occurredAt: at,
    recordedAt: at,
    stage: "image",
    status: "completed",
    correlation: "full",
    context: splitProbeContext({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      workItemId: "00000000-0000-0000-0000-000000000002",
      operationId,
    }),
    call: {
      callId: randomUUID(),
      provider: "openai",
      requestedModel: "gpt-image-1",
      returnedModel: "gpt-image-1",
      providerRequestId: `req-${randomUUID()}`,
      latencyMs: 1200,
      inputTokens: 1200,
      outputTokens: 300,
    },
    attributes,
  });
}

async function measureOff(ops: number, warmup: number): Promise<number[]> {
  const enabled = false;
  for (let i = 0; i < warmup; i += 1) {
    if (enabled) throw new Error("unreachable");
  }
  const samples: number[] = [];
  for (let i = 0; i < ops; i += 1) {
    const start = performance.now();
    if (enabled) throw new Error("unreachable");
    samples.push(performance.now() - start);
  }
  return samples;
}

/**
 * Absorb one-time module load (journal + drizzle graph) before any RSS
 * reading, so the instrumented-phase delta measures per-command growth —
 * the quantity the 20 MiB budget constrains — not import cost.
 */
async function prewarmJournal(): Promise<void> {
  const { createDiagnosticJournal } = await import("../src/server/diagnostics/journal");
  const journal = createDiagnosticJournal({
    persistBatch: async (rows) => ({ inserted: rows.length, duplicates: 0 }),
  });
  instrumentedOp((event) => journal.enqueue(event), `prewarm-${randomUUID()}`);
  await journal.flush();
  journal.stop();
}

async function measureOn(
  ops: number,
  warmup: number,
): Promise<{ samples: number[]; flushMs: number; enqueued: number }> {
  const { createDiagnosticJournal } = await import("../src/server/diagnostics/journal");
  const journal = createDiagnosticJournal({
    persistBatch: async (rows) => ({ inserted: rows.length, duplicates: 0 }),
    maxBufferedEvents: ops + warmup + 16,
  });
  const operationId = `overhead-${randomUUID()}`;
  for (let i = 0; i < warmup; i += 1) instrumentedOp((event) => journal.enqueue(event), operationId);
  const samples: number[] = [];
  for (let i = 0; i < ops; i += 1) {
    const start = performance.now();
    instrumentedOp((event) => journal.enqueue(event), operationId);
    samples.push(performance.now() - start);
  }
  const flushStart = performance.now();
  await journal.flush();
  const flushMs = round3(performance.now() - flushStart);
  const enqueued = journal.stats().persistedEvents;
  journal.stop();
  return { samples, flushMs, enqueued };
}

export async function runOverheadProbe(
  argv: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ code: number; report: OverheadReport | null }> {
  let args: OverheadArgs;
  try {
    args = parseOverheadArgs(argv);
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    console.error(OVERHEAD_HELP);
    return { code: 2, report: null };
  }
  if (args.help) {
    console.log(OVERHEAD_HELP);
    return { code: 0, report: null };
  }
  const budgets = resolveOverheadBudgets(env);
  const startedAt = new Date().toISOString();

  await prewarmJournal();
  const offRssBefore = rssMiB();
  const offSamples = await measureOff(args.ops, OVERHEAD_DEFAULT_WARMUP);
  const offRssAfter = rssMiB();
  const onRssBefore = rssMiB();
  const { samples: onSamples, flushMs, enqueued } = await measureOn(args.ops, OVERHEAD_DEFAULT_WARMUP);
  const onRssAfter = rssMiB();

  const failures: string[] = [];
  if (enqueued < args.ops) {
    failures.push(`journal persisted ${enqueued} of ${args.ops} instrumented ops`);
  }
  const off = summarizeSamples(offSamples);
  const on = summarizeSamples(onSamples);
  const rssDeltaMiB = Math.round((onRssAfter - onRssBefore) * 100) / 100;
  failures.push(...checkOverheadBudgets({ p95Ms: on.p95Ms, rssDeltaMiB }, budgets));
  const overheadPct = off.p95Ms > 0
    ? Math.round(((on.p95Ms - off.p95Ms) / off.p95Ms) * 1000) / 10
    : null;

  const report: OverheadReport = {
    ok: failures.length === 0,
    failures,
    sha: resolveSha(),
    nodeVersion: process.version,
    ops: args.ops,
    warmup: OVERHEAD_DEFAULT_WARMUP,
    budgets,
    off: { ...off, rssBeforeMiB: offRssBefore, rssAfterMiB: offRssAfter },
    on: { ...on, rssBeforeMiB: onRssBefore, rssAfterMiB: onRssAfter, flushMs },
    rssDeltaMiB,
    overheadPct,
    startedAt,
  };
  fs.mkdirSync(path.dirname(args.reportPath), { recursive: true });
  fs.writeFileSync(args.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    report.ok
      ? `diagnostics overhead: OK (on p95 ${on.p95Ms}ms, RSS +${rssDeltaMiB}MiB, n=${args.ops}/condition)`
      : `diagnostics overhead: OVER BUDGET\n- ${failures.join("\n- ")}`,
  );
  console.log(`report: ${args.reportPath}`);
  return { code: report.ok ? 0 : 1, report };
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
  runOverheadProbe(process.argv.slice(2), process.env).then(
    ({ code }) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(2);
    },
  );
}
