/**
 * Shared web + worker journey harness (ICE-02A).
 *
 * Boots the real topology production uses — Next web, local Inngest queue and
 * the existing image worker on one SHA — then drives a synthetic single-piece
 * journey and proves, from canonical output state plus per-process provider
 * evidence, which executor ran it. The traceability plan consumes the same
 * harness and evidence contract; keep the CLI surface and report shape stable.
 *
 * Run with tsx (scripts are excluded from `tsc --noEmit` by tsconfig):
 *   npx tsx scripts/run-worker-journey-harness.ts --scenario success
 *
 * Required env: DATABASE_URL (migrated test DB), BETTER_AUTH_SECRET,
 * EMAIL_FROM, OPENAI_API_KEY, INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY, the
 * R2_* storage keys and the STRIPE_* billing keys (same shape as CI).
 * Ports, timeouts and the report path are flags; use --plan to preview
 * the resolved run without booting anything.
 */
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateWorkerJourneyEvidence,
  WORKER_JOURNEY_EVIDENCE_SCHEMA_VERSION,
  type WorkerJourneyEvidence,
  type WorkerJourneyObservedExecutor,
  type WorkerJourneyScenario,
} from "../src/server/jobs/worker-journey-evidence";
import { WORKER_CONNECTED_EVENT } from "../src/server/jobs/heavy-image-isolation";

export const HARNESS_DEFAULT_WEB_PORT = 3100;
export const HARNESS_DEFAULT_QUEUE_PORT = 8288;
export const HARNESS_DEFAULT_TIMEOUT_MS = 240_000;
export const HARNESS_DEFAULT_OBSERVE_MS = 30_000;
export const HARNESS_REQUIRED_ENV = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "EMAIL_FROM",
  "OPENAI_API_KEY",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_STARTER_PRICE_ID",
  "STRIPE_GROWTH_PRICE_ID",
  "STRIPE_SCALE_PRICE_ID",
  "STRIPE_SUCCESS_URL",
  "STRIPE_CANCEL_URL",
] as const;

export interface HarnessArgs {
  scenario: WorkerJourneyScenario;
  webPort: number;
  queuePort: number;
  reportPath: string;
  timeoutMs: number;
  observeMs: number;
  build: boolean;
  plan: boolean;
  help: boolean;
}

export interface HarnessConfig {
  scenario: WorkerJourneyScenario;
  webPort: number;
  queuePort: number;
  baseUrl: string;
  queueUrl: string;
  target: "worker";
  reportPath: string;
  timeoutMs: number;
  observeMs: number;
  build: boolean;
  appDir: string;
  nodeVersion: string;
  pinnedNodeMajor: string;
  runtimeCheckBypassed: boolean;
  requiredEnv: Record<string, string>;
}

function parsePort(raw: string | undefined, flag: string): number {
  const port = Number(raw);
  if (!raw || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid ${flag}: expected a TCP port, got ${JSON.stringify(raw ?? "")}`);
  }
  return port;
}

function parsePositiveInt(raw: string | undefined, flag: string): number {
  const value = Number(raw);
  if (!raw || !Number.isInteger(value) || value <= 0) {
    throw new Error(`invalid ${flag}: expected a positive integer, got ${JSON.stringify(raw ?? "")}`);
  }
  return value;
}

export function parseHarnessArgs(argv: string[]): HarnessArgs {
  const args: HarnessArgs = {
    scenario: "success",
    webPort: HARNESS_DEFAULT_WEB_PORT,
    queuePort: HARNESS_DEFAULT_QUEUE_PORT,
    reportPath: "",
    timeoutMs: HARNESS_DEFAULT_TIMEOUT_MS,
    observeMs: HARNESS_DEFAULT_OBSERVE_MS,
    build: false,
    plan: false,
    help: false,
  };
  let scenarioSeen = false;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = argv[i + 1];
    switch (flag) {
      case "--scenario":
        if (next !== "success" && next !== "no-worker") {
          throw new Error(`invalid --scenario: expected success|no-worker, got ${JSON.stringify(next ?? "")}`);
        }
        args.scenario = next;
        scenarioSeen = true;
        i += 1;
        break;
      case "--web-port":
        args.webPort = parsePort(next, "--web-port");
        i += 1;
        break;
      case "--queue-port":
        args.queuePort = parsePort(next, "--queue-port");
        i += 1;
        break;
      case "--report":
        if (!next) throw new Error("invalid --report: expected a file path");
        args.reportPath = next;
        i += 1;
        break;
      case "--timeout-ms":
        args.timeoutMs = parsePositiveInt(next, "--timeout-ms");
        i += 1;
        break;
      case "--observe-ms":
        args.observeMs = parsePositiveInt(next, "--observe-ms");
        i += 1;
        break;
      case "--build":
        args.build = true;
        break;
      case "--plan":
        args.plan = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`unknown flag: ${flag}`);
    }
  }
  if (args.help) return args;
  if (!scenarioSeen) throw new Error("missing required --scenario success|no-worker");
  if (!args.reportPath) {
    args.reportPath = path.resolve(
      process.cwd(),
      `tests/e2e/.evidence/worker-journey-${args.scenario}.json`,
    );
  }
  return args;
}

export interface ResolveOverrides {
  appDir?: string;
  nodeVersion?: string;
  pinnedNodeMajor?: string;
}

export function resolveHarnessConfig(
  args: HarnessArgs,
  env: NodeJS.ProcessEnv,
  overrides: ResolveOverrides = {},
): { config: HarnessConfig; problems: string[] } {
  const problems: string[] = [];
  const appDir =
    overrides.appDir ?? path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const requiredEnv: Record<string, string> = {};
  for (const key of HARNESS_REQUIRED_ENV) {
    const value = env[key]?.trim();
    if (!value) problems.push(`missing required env: ${key}`);
    else requiredEnv[key] = value;
  }
  let pinnedNodeMajor = overrides.pinnedNodeMajor;
  if (!pinnedNodeMajor) {
    try {
      pinnedNodeMajor = fs
        .readFileSync(path.join(appDir, ".nvmrc"), "utf8")
        .trim()
        .replace(/^v/, "")
        .split(".")[0];
    } catch {
      problems.push("pinned runtime not declared: app/.nvmrc is missing");
    }
  }
  const nodeVersion = overrides.nodeVersion ?? process.version;
  const nodeMajor = nodeVersion.trim().replace(/^v/, "").split(".")[0];
  const runtimeCheckBypassed = env.WORKER_JOURNEY_IGNORE_RUNTIME === "1";
  if (!runtimeCheckBypassed && pinnedNodeMajor && nodeMajor !== pinnedNodeMajor) {
    problems.push(
      `runtime mismatch: harness pins Node ${pinnedNodeMajor} (app/.nvmrc) but runs on ${nodeVersion}`,
    );
  }
  return {
    config: {
      scenario: args.scenario,
      webPort: args.webPort,
      queuePort: args.queuePort,
      baseUrl: `http://localhost:${args.webPort}`,
      queueUrl: `http://127.0.0.1:${args.queuePort}`,
      target: "worker",
      reportPath: args.reportPath,
      timeoutMs: args.timeoutMs,
      observeMs: args.observeMs,
      build: args.build,
      appDir,
      nodeVersion,
      pinnedNodeMajor: pinnedNodeMajor ?? "unknown",
      runtimeCheckBypassed,
      requiredEnv,
    },
    problems,
  };
}

export function countJourneyProviderCalls(jsonl: string, outputIds: string[]): number {
  const wanted = new Set(outputIds);
  let count = 0;
  for (const line of jsonl.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed) as { outputPrefix?: unknown };
      if (typeof record.outputPrefix !== "string") continue;
      const suffix = record.outputPrefix.split("/").pop() ?? "";
      if (wanted.has(suffix)) count += 1;
    } catch {
      continue;
    }
  }
  return count;
}

export interface ExecutorSignals {
  workerCalls: number;
  webCalls: number;
  leakedCalls: number;
  anyCompleted: boolean;
}

export function classifyExecutor(signals: ExecutorSignals): WorkerJourneyObservedExecutor {
  if (signals.webCalls > 0 || signals.leakedCalls > 0) return "unexpected";
  if (signals.workerCalls > 0) return "worker";
  if (signals.anyCompleted) return "unexpected";
  return "none";
}

export interface JourneyOutputProjection {
  id: string;
  status: string;
  hasOutput: boolean;
  imageCallCount: number;
}

export interface JourneyOutputsSummary {
  allCompletedWithBytes: boolean;
  unexecuted: boolean;
  anyCompleted: boolean;
}

export function summarizeJourneyOutputs(
  outputs: JourneyOutputProjection[],
): JourneyOutputsSummary {
  if (outputs.length === 0) {
    return { allCompletedWithBytes: false, unexecuted: false, anyCompleted: false };
  }
  const anyCompleted = outputs.some((output) => output.status === "completed");
  const allCompletedWithBytes =
    anyCompleted &&
    outputs.every((output) => output.status === "completed" && output.hasOutput);
  const unexecuted =
    !anyCompleted &&
    outputs.every((output) => !output.hasOutput && output.imageCallCount === 0);
  return { allCompletedWithBytes, unexecuted, anyCompleted };
}

export interface EvidenceInput {
  scenario: WorkerJourneyScenario;
  sha: string;
  nodeVersion: string;
  workspaceId: string;
  workItemId: string;
  outputIds: string[];
  workerConnected: boolean;
  executorObserved: WorkerJourneyObservedExecutor;
  providerCalls: number;
  outputsSummary: JourneyOutputsSummary;
}

export function buildJourneyEvidence(input: EvidenceInput): WorkerJourneyEvidence {
  const resultObserved =
    input.scenario === "success"
      ? input.outputsSummary.allCompletedWithBytes
        ? "completed"
        : "unknown"
      : input.outputsSummary.unexecuted
        ? "unexecuted"
        : "unknown";
  return {
    schemaVersion: WORKER_JOURNEY_EVIDENCE_SCHEMA_VERSION,
    sha: input.sha,
    syntheticOrigin: true,
    workerTarget: "worker",
    nodeVersion: input.nodeVersion,
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    outputIds: input.outputIds,
    scenario: input.scenario,
    workerConnected: input.workerConnected,
    executorObserved: input.executorObserved,
    providerCalls: input.providerCalls,
    duplicateCharges: null,
    resultObserved,
  };
}

export interface SpawnedProcess {
  role: string;
  child: ChildProcess;
  logPath: string;
  output: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(task: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms: ${label}`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isPortBusy(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function assertPortsFree(webPort: number, queuePort: number): Promise<void> {
  const busy: string[] = [];
  if (await isPortBusy(webPort, "127.0.0.1")) busy.push(`web:${webPort}`);
  if (await isPortBusy(queuePort, "127.0.0.1")) busy.push(`queue:${queuePort}`);
  if (busy.length > 0) {
    throw new Error(
      `ports already in use (${busy.join(", ")}). Stop the other processes or pass --web-port/--queue-port.`,
    );
  }
}

function spawnLogged(
  role: string,
  command: string,
  argv: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; logPath: string },
): SpawnedProcess {
  const stream = fs.createWriteStream(options.logPath, { flags: "a" });
  const child = spawn(command, argv, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  const spawned: SpawnedProcess = { role, child, logPath: options.logPath, output: "" };
  const append = (chunk: Buffer | string) => {
    const text = chunk.toString();
    spawned.output += text;
    if (spawned.output.length > 2_000_000) {
      spawned.output = spawned.output.slice(-1_000_000);
    }
    stream.write(text);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  child.once("exit", () => stream.end());
  return spawned;
}

async function stopProcess(spawned: SpawnedProcess): Promise<void> {
  const { child } = spawned;
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch {
    return;
  }
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await sleep(250);
  }
  try {
    if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
    else child.kill("SIGKILL");
  } catch {
    /* already gone */
  }
}

async function waitForHttp(url: string, timeoutMs: number, label: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "no attempts";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(1000);
  }
  throw new Error(`timed out waiting for ${label} at ${url}: ${lastError}`);
}

async function waitForOutput(
  spawned: SpawnedProcess,
  needle: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (spawned.output.includes(needle)) return;
    if (spawned.child.exitCode !== null) {
      throw new Error(
        `${spawned.role} exited (code ${spawned.child.exitCode}) before printing ${JSON.stringify(needle)}. See ${spawned.logPath}`,
      );
    }
    await sleep(500);
  }
  throw new Error(
    `timed out waiting for ${spawned.role} to print ${JSON.stringify(needle)}. See ${spawned.logPath}`,
  );
}

export interface HarnessProcesses {
  runDir: string;
  web: SpawnedProcess;
  queue: SpawnedProcess;
  worker: SpawnedProcess | null;
  fixturePath: string;
  webEvidencePath: string;
  workerEvidencePath: string;
  defaultEvidencePath: string;
}

function childEnv(
  config: HarnessConfig,
  runDir: string,
  evidencePath: string,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...config.requiredEnv,
    // Lease/fingerprint comparisons mix tz-naive DB timestamps with JS Dates;
    // they only agree when every process and session runs UTC (as CI/prod do).
    TZ: "UTC",
    PGTZ: "UTC",
    NODE_ENV: "production",
    IMAGE_JOB_TARGET: "worker",
    IMAGE_ROUTE_CONCURRENCY: "1",
    INNGEST_BASE_URL: config.queueUrl,
    E2E_CONTROLLED_PROVIDER: "true",
    E2E_DISABLE_RATE_LIMIT: "true",
    E2E_STORAGE_DIR: path.join(runDir, "storage"),
    E2E_PROVIDER_EVIDENCE_PATH: evidencePath,
    CREATE_POST_E2E_FIXTURE_PATH: path.join(runDir, "fixture.json"),
    APP_URL: process.env.APP_URL ?? config.baseUrl,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? config.baseUrl,
    STUDIO_PROGRESSIVE_ROLLOUT_PERCENT:
      process.env.STUDIO_PROGRESSIVE_ROLLOUT_PERCENT ?? "100",
    STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT:
      process.env.STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT ?? "0",
  };
}

async function runBuild(config: HarnessConfig): Promise<void> {
  const buildLog = path.join(config.appDir, "tests/e2e/.evidence/worker-journey-build.log");
  fs.mkdirSync(path.dirname(buildLog), { recursive: true });
  const build = spawnLogged("build", "npm", ["run", "build"], {
    cwd: config.appDir,
    env: {
      ...process.env,
      ...config.requiredEnv,
      E2E_STORAGE_DIR: process.env.E2E_STORAGE_DIR ?? "/tmp/adscale-e2e-storage",
    },
    logPath: buildLog,
  });
  const code = await new Promise<number | null>((resolve) => {
    build.child.once("exit", resolve);
    build.child.once("error", () => resolve(null));
  });
  if (code !== 0) {
    throw new Error(`production build failed (exit ${String(code)}). See ${buildLog}`);
  }
}

export async function bootHarness(config: HarnessConfig): Promise<HarnessProcesses> {
  await assertPortsFree(config.webPort, config.queuePort);
  if (config.build) {
    await withTimeout(runBuild(config), 900_000, "production build");
  } else if (!fs.existsSync(path.join(config.appDir, ".next", "BUILD_ID"))) {
    throw new Error(
      "missing production build (.next/BUILD_ID). Run `npm run build` in app/ or pass --build.",
    );
  }
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-journey-"));
  fs.mkdirSync(path.join(runDir, "storage"), { recursive: true });
  const webEvidencePath = path.join(runDir, "provider-calls-web.jsonl");
  const workerEvidencePath = path.join(runDir, "provider-calls-worker.jsonl");
  const defaultEvidencePath = path.join(config.appDir, "tests/e2e/.evidence/provider-calls.jsonl");

  const web = spawnLogged("web", "npx", ["--no-install", "next", "start", "-p", String(config.webPort)], {
    cwd: config.appDir,
    env: childEnv(config, runDir, webEvidencePath),
    logPath: path.join(runDir, "web.log"),
  });
  const queue = spawnLogged(
    "queue",
    "npx",
    ["--no-install", "inngest-cli", "dev", "-u", `${config.baseUrl}/api/inngest`, "-p", String(config.queuePort)],
    {
      cwd: config.appDir,
      env: childEnv(config, runDir, path.join(runDir, "provider-calls-queue.jsonl")),
      logPath: path.join(runDir, "queue.log"),
    },
  );
  let worker: SpawnedProcess | null = null;
  if (config.scenario === "success") {
    worker = spawnLogged(
      "worker",
      process.execPath,
      ["--conditions=react-server", "--import=tsx", "src/server/jobs/image-worker.ts"],
      {
        cwd: config.appDir,
        env: childEnv(config, runDir, workerEvidencePath),
        logPath: path.join(runDir, "worker.log"),
      },
    );
  }
  try {
    await withTimeout(
      waitForHttp(`${config.baseUrl}/api/health`, 120_000, "web"),
      125_000,
      "web readiness",
    );
    await withTimeout(
      waitForHttp(`${config.queueUrl}/`, 60_000, "queue"),
      65_000,
      "queue readiness",
    );
    if (worker) {
      await withTimeout(
        waitForOutput(worker, WORKER_CONNECTED_EVENT, 120_000),
        125_000,
        "worker connection",
      );
    }
  } catch (error) {
    await stopProcess(web);
    await stopProcess(queue);
    if (worker) await stopProcess(worker);
    throw error;
  }
  return {
    runDir,
    web,
    queue,
    worker,
    fixturePath: path.join(runDir, "fixture.json"),
    webEvidencePath,
    workerEvidencePath,
    defaultEvidencePath,
  };
}

export async function stopHarness(processes: HarnessProcesses): Promise<void> {
  await stopProcess(processes.web);
  await stopProcess(processes.queue);
  if (processes.worker) await stopProcess(processes.worker);
}

export async function seedHarnessFixture(
  config: HarnessConfig,
  processes: HarnessProcesses,
): Promise<void> {
  const seed = spawnLogged("seed", "npm", ["run", "seed:create-post-e2e", "--silent"], {
    cwd: config.appDir,
    env: childEnv(config, processes.runDir, path.join(processes.runDir, "provider-calls-seed.jsonl")),
    logPath: path.join(processes.runDir, "seed.log"),
  });
  const code = await withTimeout(
    new Promise<number | null>((resolve) => {
      seed.child.once("exit", resolve);
      seed.child.once("error", () => resolve(null));
    }),
    300_000,
    "e2e seed",
  );
  if (code !== 0) {
    throw new Error(
      `e2e seed failed (exit ${String(code)}). See ${path.join(processes.runDir, "seed.log")}`,
    );
  }
  if (!fs.existsSync(processes.fixturePath)) {
    throw new Error(`e2e seed did not write ${processes.fixturePath}`);
  }
}

interface JourneyFixture {
  email: string;
  password: string;
  readyWorkId: string;
  primaryClientProfileId: string;
}

interface DispatchedJourney {
  workspaceId: string;
  workItemId: string;
  correlationId: string;
  outputIds: string[];
  outputs: JourneyOutputProjection[];
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

function parseJsonBody(body: string, label: string): Record<string, unknown> {
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error(`invalid ${label} response: ${truncate(body, 300)}`);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

async function driveJourney(
  config: HarnessConfig,
  processes: HarnessProcesses,
): Promise<DispatchedJourney> {
  const fixture = JSON.parse(fs.readFileSync(processes.fixturePath, "utf8")) as JourneyFixture;
  if (!fixture.email || !fixture.password || !fixture.primaryClientProfileId) {
    throw new Error(
      `fixture is missing email/password/primaryClientProfileId: ${processes.fixturePath}`,
    );
  }
  const jar: string[] = [];
  const signIn = await apiFetch(`${config.baseUrl}/api/auth/sign-in/email`, jar, {
    method: "POST",
    body: JSON.stringify({ email: fixture.email, password: fixture.password }),
  });
  if (!signIn.response.ok) {
    throw new Error(`sign-in failed (HTTP ${signIn.response.status}): ${truncate(signIn.body, 300)}`);
  }
  // The seed's readyWorkId is a pre-completed UI fixture — the journey needs
  // a fresh draft so prepare/generate run for real. Same draft shape as the
  // green critical-studio-journey flow (single intent, no sources).
  const created = await apiFetch(`${config.baseUrl}/api/creative-work`, jar, {
    method: "POST",
    body: JSON.stringify({
      clientProfileId: fixture.primaryClientProfileId,
      draftKey: randomUUID(),
      request: "Peça sintética do harness worker-journey.",
      intent: "single",
      format: "4:5",
      settings: { targetFormats: [], formatMode: "manual" },
    }),
  });
  if (created.response.status !== 201) {
    throw new Error(
      `work creation failed (HTTP ${created.response.status}): ${truncate(created.body, 300)}`,
    );
  }
  const createdBody = parseJsonBody(created.body, "create");
  const workId = asRecord(createdBody.work).id;
  if (typeof workId !== "string" || !workId) {
    throw new Error(`work creation returned no id: ${truncate(created.body, 300)}`);
  }
  const prepare = await apiFetch(
    `${config.baseUrl}/api/creative-work/${workId}`,
    jar,
    { method: "PATCH", body: JSON.stringify({ action: "prepare" }) },
  );
  if (!prepare.response.ok) {
    throw new Error(`prepare failed (HTTP ${prepare.response.status}): ${truncate(prepare.body, 300)}`);
  }
  const prepared = parseJsonBody(prepare.body, "prepare");
  const preparedRevision =
    asRecord(prepared.preparedPlan).preparedRevision ?? prepared.preparedRevision;
  if (typeof preparedRevision !== "string" || !preparedRevision) {
    throw new Error(`prepare returned no revision: ${truncate(prepare.body, 300)}`);
  }
  const generate = await apiFetch(
    `${config.baseUrl}/api/creative-work/${workId}/generate`,
    jar,
    { method: "POST", body: JSON.stringify({ action: "initial", preparedRevision }) },
  );
  if (generate.response.status !== 202) {
    throw new Error(
      `generate failed (HTTP ${generate.response.status}): ${truncate(generate.body, 300)}`,
    );
  }
  const generated = parseJsonBody(generate.body, "generate");
  const work = asRecord(generated.work);
  const outputs = (Array.isArray(generated.outputs) ? generated.outputs : []).map((entry) => {
    const row = asRecord(entry);
    return String(row.id ?? "");
  }).filter(Boolean);
  if (outputs.length === 0 || typeof work.workspaceId !== "string" || !work.workspaceId) {
    throw new Error(`generate returned no outputs/workspace: ${truncate(generate.body, 300)}`);
  }
  const journey: DispatchedJourney = {
    workspaceId: work.workspaceId,
    workItemId: String(work.id ?? workId),
    correlationId: typeof work.generationCorrelationId === "string" ? work.generationCorrelationId : "",
    outputIds: outputs,
    outputs: [],
  };
  const readOutputs = async (): Promise<JourneyOutputProjection[]> => {
    const current = await apiFetch(
      `${config.baseUrl}/api/creative-work/${workId}`,
      jar,
    );
    if (!current.response.ok) {
      throw new Error(`poll failed (HTTP ${current.response.status}): ${truncate(current.body, 300)}`);
    }
    const state = parseJsonBody(current.body, "poll");
    if (!Array.isArray(state.outputs)) throw new Error("poll returned no outputs array");
    return (state.outputs as unknown[]).map((entry) => {
      const row = asRecord(entry);
      return {
        id: String(row.id ?? ""),
        status: String(row.status ?? ""),
        hasOutput: row.hasOutput === true,
        imageCallCount: typeof row.imageCallCount === "number" ? row.imageCallCount : 0,
      };
    });
  };
  if (config.scenario === "success") {
    const deadline = Date.now() + config.timeoutMs;
    for (;;) {
      journey.outputs = await readOutputs();
      const pending = journey.outputs.filter(
        (output) => output.status !== "completed" && output.status !== "failed",
      );
      if (pending.length === 0 || Date.now() >= deadline) break;
      await sleep(2000);
    }
  } else {
    await sleep(config.observeMs);
    journey.outputs = await readOutputs();
  }
  return journey;
}

function readTextOrEmpty(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function resolveSha(appDir: string): { sha: string; source: string } {
  if (process.env.GITHUB_SHA?.trim()) return { sha: process.env.GITHUB_SHA.trim(), source: "GITHUB_SHA" };
  try {
    const sha = execSync("git rev-parse HEAD", { cwd: appDir, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    if (sha) return { sha, source: "git" };
  } catch {
    /* fall through */
  }
  return { sha: "unknown", source: "none" };
}

export interface JourneyReportMeta {
  scenario: WorkerJourneyScenario;
  baseUrl: string;
  queueUrl: string;
  runDir: string;
  shaSource: string;
  nodeVersion: string;
  runtimeCheckBypassed: boolean;
  workerConnected: boolean;
  providerCallsByProcess: { web: number; worker: number; leaked: number };
  filesSeen: { web: boolean; worker: boolean };
  workerLogMentionsOutputs: boolean;
  outputs: JourneyOutputProjection[];
  durationMs: number;
  startedAt: string;
}

export interface JourneyReport {
  evidence: WorkerJourneyEvidence | null;
  validation: { ok: boolean; failures: string[] };
  meta: JourneyReportMeta | Record<string, never>;
}

export const EXIT_OK = 0;
export const EXIT_VALIDATION_FAILED = 1;
export const EXIT_BOOTSTRAP_FAILED = 2;

export const HARNESS_HELP = `worker-journey harness (ICE-02A): prove the split web + worker topology.

usage:
  npx tsx scripts/run-worker-journey-harness.ts --scenario success [--build] [options]
  npx tsx scripts/run-worker-journey-harness.ts --scenario no-worker [options]

scenarios:
  success     boot web + queue + worker, run one synthetic piece, require worker execution
  no-worker   boot web + queue only, dispatch, require zero execution anywhere

options:
  --web-port N      web port (default ${HARNESS_DEFAULT_WEB_PORT})
  --queue-port N    inngest dev port (default ${HARNESS_DEFAULT_QUEUE_PORT})
  --report PATH     report JSON path (default tests/e2e/.evidence/worker-journey-<scenario>.json)
  --timeout-ms N    success completion budget (default ${HARNESS_DEFAULT_TIMEOUT_MS})
  --observe-ms N    no-worker observation window (default ${HARNESS_DEFAULT_OBSERVE_MS})
  --build           run the production build first (needs full build env)
  --plan            print the resolved run without booting anything
  --help, -h        this text

required env: ${HARNESS_REQUIRED_ENV.join(", ")}
exit codes: 0 validated, 1 validation failed, 2 bootstrap/config failure.`;

function writeReport(reportPath: string, report: JourneyReport): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

export async function runScenario(config: HarnessConfig): Promise<JourneyReport> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const processes = await bootHarness(config);
  try {
    await seedHarnessFixture(config, processes);
    const journey = await driveJourney(config, processes);
    const summary = summarizeJourneyOutputs(
      journey.outputs.filter((output) => journey.outputIds.includes(output.id)),
    );
    const webJsonl = readTextOrEmpty(processes.webEvidencePath);
    const workerJsonl = processes.worker ? readTextOrEmpty(processes.workerEvidencePath) : "";
    const defaultJsonl = readTextOrEmpty(processes.defaultEvidencePath);
    // Journey output IDs are fresh per run, so any journey-attributed record
    // in the default file belongs to this run.
    const webCalls = countJourneyProviderCalls(webJsonl, journey.outputIds);
    const workerCalls = countJourneyProviderCalls(workerJsonl, journey.outputIds);
    const leakedCalls = countJourneyProviderCalls(defaultJsonl, journey.outputIds);
    const executorObserved = classifyExecutor({
      workerCalls,
      webCalls,
      leakedCalls,
      anyCompleted: summary.anyCompleted,
    });
    const workerConnected =
      processes.worker !== null && processes.worker.output.includes(WORKER_CONNECTED_EVENT);
    const evidence = buildJourneyEvidence({
      scenario: config.scenario,
      sha: resolveSha(config.appDir).sha,
      nodeVersion: config.nodeVersion,
      workspaceId: journey.workspaceId,
      workItemId: journey.workItemId,
      outputIds: journey.outputIds,
      workerConnected,
      executorObserved,
      providerCalls: webCalls + workerCalls + leakedCalls,
      outputsSummary: summary,
    });
    const validation = validateWorkerJourneyEvidence(evidence);
    const workerLog = processes.worker ? readTextOrEmpty(processes.worker.logPath) : "";
    return {
      evidence,
      validation,
      meta: {
        scenario: config.scenario,
        baseUrl: config.baseUrl,
        queueUrl: config.queueUrl,
        runDir: processes.runDir,
        shaSource: resolveSha(config.appDir).source,
        nodeVersion: config.nodeVersion,
        runtimeCheckBypassed: config.runtimeCheckBypassed,
        workerConnected,
        providerCallsByProcess: { web: webCalls, worker: workerCalls, leaked: leakedCalls },
        filesSeen: {
          web: fs.existsSync(processes.webEvidencePath),
          worker: processes.worker ? fs.existsSync(processes.workerEvidencePath) : false,
        },
        workerLogMentionsOutputs: journey.outputIds.some((id) => workerLog.includes(id)),
        outputs: journey.outputs,
        durationMs: Date.now() - started,
        startedAt,
      },
    };
  } finally {
    await stopHarness(processes);
  }
}

export async function runCli(argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  let args: HarnessArgs;
  try {
    args = parseHarnessArgs(argv);
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    console.error(HARNESS_HELP);
    return EXIT_BOOTSTRAP_FAILED;
  }
  if (args.help) {
    console.log(HARNESS_HELP);
    return EXIT_OK;
  }
  const { config, problems } = resolveHarnessConfig(args, env);
  if (args.plan) {
    console.log(
      JSON.stringify(
        {
          plan: true,
          scenario: config.scenario,
          baseUrl: config.baseUrl,
          queueUrl: config.queueUrl,
          target: config.target,
          reportPath: config.reportPath,
          timeoutMs: config.timeoutMs,
          observeMs: config.observeMs,
          build: config.build,
          nodeVersion: config.nodeVersion,
          pinnedNodeMajor: config.pinnedNodeMajor,
          runtimeCheckBypassed: config.runtimeCheckBypassed,
          problems,
        },
        null,
        2,
      ),
    );
    return EXIT_OK;
  }
  if (problems.length > 0) {
    console.error(`configuration problems:\n- ${problems.join("\n- ")}\n`);
    console.error(HARNESS_HELP);
    return EXIT_BOOTSTRAP_FAILED;
  }
  if (config.runtimeCheckBypassed) {
    console.warn("warning: runtime pin check bypassed via WORKER_JOURNEY_IGNORE_RUNTIME=1");
  }
  try {
    const report = await runScenario(config);
    writeReport(config.reportPath, report);
    console.log(
      report.validation.ok
        ? `worker-journey ${config.scenario}: VALID (${report.meta && "durationMs" in report.meta ? report.meta.durationMs : 0}ms)`
        : `worker-journey ${config.scenario}: INVALID\n- ${report.validation.failures.join("\n- ")}`,
    );
    console.log(`report: ${config.reportPath}`);
    if (report.meta && "runDir" in report.meta) console.log(`logs: ${report.meta.runDir}`);
    return report.validation.ok ? EXIT_OK : EXIT_VALIDATION_FAILED;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`bootstrap failed: ${message}`);
    return EXIT_BOOTSTRAP_FAILED;
  }
}

