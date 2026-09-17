import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import {
  bootHarness,
  EXIT_BOOTSTRAP_FAILED,
  EXIT_OK,
  EXIT_VALIDATION_FAILED,
  parseHarnessArgs,
  resolveHarnessConfig,
  seedHarnessFixture,
  stopHarness,
  type HarnessConfig,
  type HarnessProcesses,
} from "./worker-journey-harness";

/**
 * Studio format matrix E2E (ICE-04B). Boots the shared success topology
 * once, then proves per-format delivery end to end: single-piece works in
 * 1:1, 4:5, 9:16 and 3:4 complete with the requested proportion, exactly
 * one provider call each, and downloaded bytes at the exact delivery
 * dimensions; a format_adaptation leg covers 3:4 as a target; unvalidated
 * protocols refuse 3:4 explicitly instead of faking coverage.
 *
 * The runner only uses the harness's existing boot/seed/stop exports — the
 * driver is local so this gate never reshapes the shared harness file.
 */

export const MATRIX_HELP = `studio format matrix E2E (ICE-04B): prove per-format delivery on the shared harness.

Usage:
  npx tsx scripts/run-studio-format-matrix.ts [--build] [harness options]

The run always boots the success topology (worker included); --scenario is
not accepted here. Requires CREATIVE_WORK_34_CREATION_ENABLED=true in the
environment so the 3:4 legs exercise creation. Report:
tests/e2e/.evidence/studio-format-matrix.json unless --report overrides it.
Exit 0 converges, 1 fails validation, 2 fails bootstrap.`;

export const MATRIX_DELIVERY_DIMS: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
  "3:4": { width: 1080, height: 1440 },
};

export const MATRIX_SINGLE_FORMATS = ["1:1", "4:5", "9:16", "3:4"] as const;
export const MATRIX_ADAPT_TARGETS = ["1:1", "3:4"] as const;
export const MATRIX_BLOCKED_INTENTS = ["variations", "restyle"] as const;

export function parseMatrixArgs(argv: string[]): ReturnType<typeof parseHarnessArgs> {
  for (const flag of argv) {
    if (flag === "--scenario") {
      throw new Error("run-studio-format-matrix boots the success topology; --scenario is not accepted");
    }
  }
  return parseHarnessArgs(["--scenario", "success", ...argv]);
}

export interface MatrixProviderCall {
  outputPrefix: string;
  generationMode: string;
  dimensions: { width: number; height: number } | null;
}

export function parseProviderEvidence(jsonl: string): MatrixProviderCall[] {
  const calls: MatrixProviderCall[] = [];
  for (const line of jsonl.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as {
        outputPrefix?: unknown;
        generationMode?: unknown;
        dimensions?: unknown;
      };
      const dims = (row.dimensions ?? null) as { width?: unknown; height?: unknown } | null;
      calls.push({
        outputPrefix: typeof row.outputPrefix === "string" ? row.outputPrefix : "",
        generationMode: typeof row.generationMode === "string" ? row.generationMode : "",
        dimensions:
          typeof dims?.width === "number" && typeof dims?.height === "number"
            ? { width: dims.width, height: dims.height }
            : null,
      });
    } catch {
      // A torn final line never fails the gate; per-output assertions do.
    }
  }
  return calls;
}

export function evidenceForOutput(calls: MatrixProviderCall[], outputId: string): MatrixProviderCall[] {
  return calls.filter((row) => row.outputPrefix === `creative-work/${outputId}`);
}

export interface MatrixOutputObservation {
  outputId: string;
  targetFormat: string;
  completed: boolean;
  providerCalls: number;
  providerDims: { width: number; height: number } | null;
  byteDims: { width: number; height: number } | null;
}

/**
 * Legacy tournament size: intents still outside quality_recovery_v1
 * (e.g. format_adaptation) run planner → N candidates → selector, while
 * direct v1 intents (single, carousel) make exactly one provider call.
 */
export const MATRIX_LEGACY_TOURNAMENT_CALLS = 3;

export function validateMatrixOutput(
  leg: string,
  expectedFormat: string,
  observed: MatrixOutputObservation,
  expectedCalls = 1,
): string[] {
  const failures: string[] = [];
  const expected = MATRIX_DELIVERY_DIMS[expectedFormat];
  if (!observed.completed) failures.push(`${leg}:${observed.outputId}:not_completed`);
  if (observed.targetFormat !== expectedFormat) {
    failures.push(
      `${leg}:${observed.outputId}:format_mismatch:expected_${expectedFormat}:got_${observed.targetFormat}`,
    );
  }
  if (observed.providerCalls !== expectedCalls) {
    failures.push(`${leg}:${observed.outputId}:provider_calls:${observed.providerCalls}`);
  }
  if (
    !observed.providerDims ||
    observed.providerDims.width !== expected.width ||
    observed.providerDims.height !== expected.height
  ) {
    failures.push(`${leg}:${observed.outputId}:provider_dims_mismatch`);
  }
  if (
    !observed.byteDims ||
    observed.byteDims.width !== expected.width ||
    observed.byteDims.height !== expected.height
  ) {
    failures.push(`${leg}:${observed.outputId}:byte_dims_mismatch`);
  }
  return failures;
}

export interface MatrixLegReport {
  leg: string;
  workId: string;
  failures: string[];
}

export interface MatrixReport {
  ok: boolean;
  failures: string[];
  legs: MatrixLegReport[];
  meta: {
    baseUrl: string;
    queueUrl: string;
    runDir: string;
    durationMs: number;
    startedAt: string;
    /** Delivery SHA the topology ran on — binds the enablement evidence. */
    sha: string;
  };
}

export function resolveMatrixSha(appDir: string): string {
  if (process.env.GITHUB_SHA?.trim()) return process.env.GITHUB_SHA.trim();
  try {
    return execSync("git rev-parse HEAD", { cwd: appDir, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

// --- driver (local fetch + jar; the harness owns boot/seed/stop) ---

interface MatrixFixture {
  email: string;
  password: string;
  primaryClientProfileId: string;
  contentArtAssetId: string;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function apiFetch(
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

async function apiBytes(
  url: string,
  jar: string[],
): Promise<{ status: number; bytes: Buffer }> {
  const headers = new Headers();
  if (jar.length > 0) headers.set("cookie", jar.join("; "));
  const response = await fetch(url, { headers });
  return { status: response.status, bytes: Buffer.from(await response.arrayBuffer()) };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function parseJsonBody(body: string, label: string): Record<string, unknown> {
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error(`invalid ${label} response: ${truncate(body, 300)}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function driveWorkToTerminal(
  baseUrl: string,
  jar: string[],
  input: {
    clientProfileId: string;
    intent: string;
    request: string;
    format: string;
    targetFormats: string[];
    sources?: Array<{ assetId: string; usage: "content" | "style" | "both" }>;
    timeoutMs: number;
  },
): Promise<{ workId: string; persistedFormat: unknown; outputs: Array<Record<string, unknown>> }> {
  const created = await apiFetch(`${baseUrl}/api/creative-work`, jar, {
    method: "POST",
    body: JSON.stringify({
      clientProfileId: input.clientProfileId,
      draftKey: randomUUID(),
      request: input.request,
      intent: input.intent,
      format: input.format,
      settings: { targetFormats: input.targetFormats, formatMode: "manual" },
    }),
  });
  if (created.response.status !== 201) {
    throw new Error(
      `matrix create failed (HTTP ${created.response.status}): ${truncate(created.body, 300)}`,
    );
  }
  const createdBody = parseJsonBody(created.body, "matrix create");
  const workId = asRecord(createdBody.work).id;
  if (typeof workId !== "string" || !workId) {
    throw new Error(`matrix create returned no id: ${truncate(created.body, 300)}`);
  }
  for (const source of input.sources ?? []) {
    // attachSource is CAS-guarded: read the current revision first. A fresh
    // read per attach keeps multi-source legs correct.
    const before = await apiFetch(`${baseUrl}/api/creative-work/${workId}`, jar);
    const expectedUpdatedAt = asRecord(parseJsonBody(before.body, "matrix cas").work).updatedAt;
    if (typeof expectedUpdatedAt !== "string" || !expectedUpdatedAt) {
      throw new Error(`matrix attachSource found no updatedAt: ${truncate(before.body, 300)}`);
    }
    const attached = await apiFetch(`${baseUrl}/api/creative-work/${workId}`, jar, {
      method: "PATCH",
      body: JSON.stringify({ action: "attachSource", expectedUpdatedAt, assetId: source.assetId, usage: source.usage }),
    });
    if (!attached.response.ok) {
      throw new Error(
        `matrix attachSource failed (HTTP ${attached.response.status}): ${truncate(attached.body, 300)}`,
      );
    }
  }
  if ((input.sources ?? []).length > 0) {
    const deadline = Date.now() + 60_000;
    for (;;) {
      const current = await apiFetch(`${baseUrl}/api/creative-work/${workId}`, jar);
      const sources = (parseJsonBody(current.body, "matrix sources").sources ?? []) as Array<Record<string, unknown>>;
      if (sources.length > 0 && sources.every((source) => source.status === "ready")) break;
      if (Date.now() >= deadline) throw new Error("matrix sources never became ready");
      await sleep(2000);
    }
  }
  // The requested choice must persist server-side: a reload reads the same format back.
  const persisted = await apiFetch(`${baseUrl}/api/creative-work/${workId}`, jar);
  const persistedFormat = asRecord(parseJsonBody(persisted.body, "matrix readback").work).format;
  const prepare = await apiFetch(`${baseUrl}/api/creative-work/${workId}`, jar, {
    method: "PATCH",
    body: JSON.stringify({ action: "prepare" }),
  });
  if (!prepare.response.ok) {
    throw new Error(`matrix prepare failed (HTTP ${prepare.response.status}): ${truncate(prepare.body, 300)}`);
  }
  const prepared = parseJsonBody(prepare.body, "matrix prepare");
  const preparedRevision =
    asRecord(prepared.preparedPlan).preparedRevision ?? prepared.preparedRevision;
  if (typeof preparedRevision !== "string" || !preparedRevision) {
    throw new Error(`matrix prepare returned no revision: ${truncate(prepare.body, 300)}`);
  }
  const generate = await apiFetch(`${baseUrl}/api/creative-work/${workId}/generate`, jar, {
    method: "POST",
    body: JSON.stringify({ action: "initial", preparedRevision }),
  });
  if (generate.response.status !== 202) {
    throw new Error(
      `matrix generate failed (HTTP ${generate.response.status}): ${truncate(generate.body, 300)}`,
    );
  }
  const deadline = Date.now() + input.timeoutMs;
  for (;;) {
    const current = await apiFetch(`${baseUrl}/api/creative-work/${workId}`, jar);
    if (!current.response.ok) {
      throw new Error(`matrix poll failed (HTTP ${current.response.status}): ${truncate(current.body, 300)}`);
    }
    const state = parseJsonBody(current.body, "matrix poll");
    if (!Array.isArray(state.outputs)) throw new Error("matrix poll returned no outputs array");
    const outputs = (state.outputs as unknown[]).map(asRecord);
    const pending = outputs.filter(
      (output) => output.status !== "completed" && output.status !== "failed",
    );
    if (outputs.length > 0 && pending.length === 0) return { workId, persistedFormat, outputs };
    if (Date.now() >= deadline) {
      throw new Error(`matrix work ${workId} never reached terminal outputs`);
    }
    await sleep(2000);
  }
}

async function observeOutput(
  baseUrl: string,
  jar: string[],
  workId: string,
  output: Record<string, unknown>,
  providerCalls: MatrixProviderCall[],
  expectedCalls = 1,
): Promise<MatrixOutputObservation> {
  const outputId = String(output.id ?? "");
  const calls = evidenceForOutput(providerCalls, outputId);
  const downloaded = await apiBytes(
    `${baseUrl}/api/creative-work/${workId}/outputs/${outputId}/download`,
    jar,
  );
  let byteDims: { width: number; height: number } | null = null;
  if (downloaded.status === 200 && downloaded.bytes.length > 0) {
    try {
      const meta = await sharp(downloaded.bytes).metadata();
      if (typeof meta.width === "number" && typeof meta.height === "number") {
        byteDims = { width: meta.width, height: meta.height };
      }
    } catch {
      byteDims = null;
    }
  }
  return {
    outputId,
    targetFormat: String(output.targetFormat ?? ""),
    completed: output.status === "completed",
    providerCalls: calls.length,
    providerDims: calls.length === expectedCalls ? (calls[0]?.dimensions ?? null) : null,
    byteDims,
  };
}

function readEvidenceFiles(processes: HarnessProcesses): MatrixProviderCall[] {
  const files = [
    processes.webEvidencePath,
    processes.worker ? processes.workerEvidencePath : "",
    processes.defaultEvidencePath,
  ].filter(Boolean);
  const calls: MatrixProviderCall[] = [];
  for (const file of files) {
    try {
      calls.push(...parseProviderEvidence(fs.readFileSync(file, "utf8")));
    } catch {
      // A missing evidence file contributes nothing; per-output assertions fail loudly.
    }
  }
  return calls;
}

export async function runCli(argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  let args: ReturnType<typeof parseHarnessArgs>;
  try {
    args = parseMatrixArgs(argv);
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    console.error(MATRIX_HELP);
    return EXIT_BOOTSTRAP_FAILED;
  }
  if (args.help) {
    console.log(MATRIX_HELP);
    return EXIT_OK;
  }
  const { config, problems } = resolveHarnessConfig(args, env);
  if (args.plan) {
    console.log(
      JSON.stringify({ plan: true, gate: "studio-format-matrix", ...config, problems }, null, 2),
    );
    return EXIT_OK;
  }
  if (problems.length > 0) {
    console.error(`error: cannot run format matrix:\n- ${problems.join("\n- ")}`);
    return EXIT_BOOTSTRAP_FAILED;
  }
  if (env.CREATIVE_WORK_34_CREATION_ENABLED !== "true") {
    console.error(
      "error: the format matrix exercises 3:4 creation — set CREATIVE_WORK_34_CREATION_ENABLED=true.",
    );
    return EXIT_BOOTSTRAP_FAILED;
  }
  return runMatrix(config, args.reportPath);
}

async function runMatrix(config: HarnessConfig, reportPathArg: string): Promise<number> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const reportPath = reportPathArg.includes("worker-journey-")
    ? path.resolve(process.cwd(), "tests/e2e/.evidence/studio-format-matrix.json")
    : reportPathArg;
  const processes = await bootHarness(config);
  const legs: MatrixLegReport[] = [];
  try {
    await seedHarnessFixture(config, processes);
    const fixture = JSON.parse(fs.readFileSync(processes.fixturePath, "utf8")) as MatrixFixture;
    if (!fixture.email || !fixture.password || !fixture.primaryClientProfileId) {
      throw new Error(`fixture is missing email/password/primaryClientProfileId: ${processes.fixturePath}`);
    }
    const jar: string[] = [];
    const signIn = await apiFetch(`${config.baseUrl}/api/auth/sign-in/email`, jar, {
      method: "POST",
      body: JSON.stringify({ email: fixture.email, password: fixture.password }),
    });
    if (!signIn.response.ok) {
      throw new Error(`matrix sign-in failed (HTTP ${signIn.response.status}): ${truncate(signIn.body, 300)}`);
    }
    // Single-piece legs: one work per format, choice persisted, bytes exact.
    for (const format of MATRIX_SINGLE_FORMATS) {
      const leg = `single:${format}`;
      const failures: string[] = [];
      let workId = "";
      try {
        const driven = await driveWorkToTerminal(config.baseUrl, jar, {
          clientProfileId: fixture.primaryClientProfileId,
          intent: "single",
          request: `Peça sintética ${format} da matriz de formatos.`,
          format,
          targetFormats: [],
          timeoutMs: config.timeoutMs,
        });
        workId = driven.workId;
        if (driven.persistedFormat !== format) {
          failures.push(`${leg}:persisted_format_mismatch:got_${String(driven.persistedFormat)}`);
        }
        const calls = readEvidenceFiles(processes);
        if (driven.outputs.length !== 1) {
          failures.push(`${leg}:expected_1_output:got_${driven.outputs.length}`);
        }
        for (const output of driven.outputs) {
          const observed = await observeOutput(config.baseUrl, jar, workId, output, calls);
          failures.push(...validateMatrixOutput(leg, format, observed));
        }
      } catch (error) {
        failures.push(`${leg}:driver_error:${error instanceof Error ? error.message : String(error)}`);
      }
      legs.push({ leg, workId, failures });
    }
    // Adaptation leg: 3:4 as a target beside a previous format.
    {
      const leg = "adapt:1:1+3:4";
      const failures: string[] = [];
      let workId = "";
      try {
        if (!fixture.contentArtAssetId) throw new Error("fixture is missing contentArtAssetId");
        const driven = await driveWorkToTerminal(config.baseUrl, jar, {
          clientProfileId: fixture.primaryClientProfileId,
          intent: "format_adaptation",
          request: "Adapte a arte sintética para 1:1 e 3:4.",
          format: "1:1",
          targetFormats: [...MATRIX_ADAPT_TARGETS],
          sources: [{ assetId: fixture.contentArtAssetId, usage: "content" }],
          timeoutMs: config.timeoutMs,
        });
        workId = driven.workId;
        const calls = readEvidenceFiles(processes);
        for (const expected of MATRIX_ADAPT_TARGETS) {
          const match = driven.outputs.find((output) => String(output.targetFormat ?? "") === expected);
          if (!match) {
            failures.push(`${leg}:missing_target_${expected}`);
            continue;
          }
          const observed = await observeOutput(config.baseUrl, jar, workId, match, calls, MATRIX_LEGACY_TOURNAMENT_CALLS);
          failures.push(...validateMatrixOutput(leg, expected, observed, MATRIX_LEGACY_TOURNAMENT_CALLS));
        }
      } catch (error) {
        failures.push(`${leg}:driver_error:${error instanceof Error ? error.message : String(error)}`);
      }
      legs.push({ leg, workId, failures });
    }
    // Protocol-block legs: unvalidated protocols refuse 3:4 explicitly.
    for (const intent of MATRIX_BLOCKED_INTENTS) {
      const leg = `blocked:${intent}:3:4`;
      const failures: string[] = [];
      try {
        const attempt = await apiFetch(`${config.baseUrl}/api/creative-work`, jar, {
          method: "POST",
          body: JSON.stringify({
            clientProfileId: fixture.primaryClientProfileId,
            draftKey: randomUUID(),
            request: "Peça 3:4 em protocolo não validado.",
            intent,
            format: "3:4",
            settings: { targetFormats: [], formatMode: "manual" },
          }),
        });
        if (attempt.response.status !== 400) {
          failures.push(`${leg}:expected_400:got_${attempt.response.status}`);
        } else if (!attempt.body.includes("formatProtocolUnsupported")) {
          failures.push(`${leg}:missing_protocol_unsupported_message`);
        }
      } catch (error) {
        failures.push(`${leg}:driver_error:${error instanceof Error ? error.message : String(error)}`);
      }
      legs.push({ leg, workId: "", failures });
    }
    const failures = legs.flatMap((leg) => leg.failures);
    const report: MatrixReport = {
      ok: failures.length === 0,
      failures,
      legs,
      meta: {
        baseUrl: config.baseUrl,
        queueUrl: config.queueUrl,
        runDir: processes.runDir,
        durationMs: Date.now() - started,
        startedAt,
        sha: resolveMatrixSha(config.appDir),
      },
    };
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ ok: report.ok, failures, reportPath }));
    return report.ok ? EXIT_OK : EXIT_VALIDATION_FAILED;
  } finally {
    await stopHarness(processes);
  }
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
  runCli(process.argv.slice(2), process.env).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(2);
    },
  );
}
