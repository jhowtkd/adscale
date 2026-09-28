// CLI parsing for the Equipe load harness (#555).
// No server imports: safe to load before env bootstrap.

import type { LoadTarget } from "./guards";

export type LoadConfig = {
  target: LoadTarget;
  databaseUrl: string;
  iKnowThisWrites: boolean;
  accounts: number;
  seed: number;
  poolMax: number;
  timeScale: number;
  tickMinutes: number;
  simDays: number;
  publisherLatencyMinMs: number;
  publisherLatencyMaxMs: number;
  publisherFailRate: number;
  publisherUncertainRate: number;
  agentFailureRate: number;
  strategistLatencyMs: [number, number];
  researchLatencyMs: [number, number];
  reviewerLatencyMs: [number, number];
  burstConcurrency: number;
  outDir: string;
  configName: string;
};

export const DEFAULTS = {
  accounts: 50,
  seed: 555,
  poolMax: 10,
  timeScale: 100,
  tickMinutes: 60,
  simDays: 7,
  publisherLatencyMinMs: 120,
  publisherLatencyMaxMs: 600,
  publisherFailRate: 0,
  publisherUncertainRate: 0.05,
  agentFailureRate: 0.02,
  burstConcurrency: 16,
  outDir: "out/equipe-load",
  configName: "a",
} as const;

function num(raw: string | undefined, name: string): number {
  const value = Number(raw);
  if (raw === undefined || !Number.isFinite(value)) {
    throw new Error(`invalid --${name}: expected a number`);
  }
  return value;
}

function pair(raw: string | undefined, name: string): [number, number] {
  if (raw === undefined) throw new Error(`invalid --${name}: expected lo,hi`);
  const [lo, hi] = raw.split(",").map(Number);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === undefined || hi === undefined || lo > hi) {
    throw new Error(`invalid --${name}: expected lo,hi with lo <= hi`);
  }
  return [lo, hi];
}

export function parseArgs(argv: string[]): LoadConfig {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags.set(key, true);
    } else {
      flags.set(key, next);
      i += 1;
    }
  }
  const str = (key: string): string | undefined => {
    const value = flags.get(key);
    return typeof value === "string" ? value : undefined;
  };
  const target = str("target") ?? "local";
  if (target !== "local" && target !== "staging") {
    throw new Error(`invalid --target: ${target} (expected local|staging)`);
  }
  const databaseUrl = str("database-url") ?? process.env.EQUIPE_LOAD_DATABASE_URL ?? "";
  return {
    target,
    databaseUrl,
    iKnowThisWrites: flags.has("i-know-this-writes"),
    accounts: num(str("accounts") ?? String(DEFAULTS.accounts), "accounts"),
    seed: num(str("seed") ?? String(DEFAULTS.seed), "seed"),
    poolMax: num(str("pool-max") ?? String(DEFAULTS.poolMax), "pool-max"),
    timeScale: num(str("time-scale") ?? String(DEFAULTS.timeScale), "time-scale"),
    tickMinutes: num(str("tick-minutes") ?? String(DEFAULTS.tickMinutes), "tick-minutes"),
    simDays: num(str("sim-days") ?? String(DEFAULTS.simDays), "sim-days"),
    publisherLatencyMinMs: num(
      str("publisher-latency-min-ms") ?? String(DEFAULTS.publisherLatencyMinMs),
      "publisher-latency-min-ms",
    ),
    publisherLatencyMaxMs: num(
      str("publisher-latency-max-ms") ?? String(DEFAULTS.publisherLatencyMaxMs),
      "publisher-latency-max-ms",
    ),
    publisherFailRate: num(
      str("publisher-fail-rate") ?? String(DEFAULTS.publisherFailRate),
      "publisher-fail-rate",
    ),
    publisherUncertainRate: num(
      str("publisher-uncertain-rate") ?? String(DEFAULTS.publisherUncertainRate),
      "publisher-uncertain-rate",
    ),
    agentFailureRate: num(
      str("agent-failure-rate") ?? String(DEFAULTS.agentFailureRate),
      "agent-failure-rate",
    ),
    strategistLatencyMs: pair(str("strategist-latency-ms") ?? "8000,20000", "strategist-latency-ms"),
    researchLatencyMs: pair(str("research-latency-ms") ?? "10000,30000", "research-latency-ms"),
    reviewerLatencyMs: pair(str("reviewer-latency-ms") ?? "3000,6000", "reviewer-latency-ms"),
    burstConcurrency: num(
      str("burst-concurrency") ?? String(DEFAULTS.burstConcurrency),
      "burst-concurrency",
    ),
    outDir: str("out") ?? DEFAULTS.outDir,
    configName: str("config-name") ?? DEFAULTS.configName,
  };
}

/** Minimal pre-parse for index.ts: only what env bootstrap needs. */
export function preparseBootstrap(argv: string[]): {
  target: LoadTarget;
  databaseUrl: string;
  iKnowThisWrites: boolean;
} {
  const full = parseArgs(argv);
  return {
    target: full.target,
    databaseUrl: full.databaseUrl,
    iKnowThisWrites: full.iKnowThisWrites,
  };
}
