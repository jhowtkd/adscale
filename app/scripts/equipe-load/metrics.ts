// Metric collectors for the load run. Wall-clock latencies only — the
// simulated clock drives decisions, never measurements.

export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.min(sortedAsc.length - 1, Math.ceil((p / 100) * sortedAsc.length) - 1);
  return sortedAsc[Math.max(0, rank)]!;
}

export type LatencySummary = {
  count: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
};

export function summarizeLatencies(samplesMs: number[]): LatencySummary {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50Ms: round1(percentile(sorted, 50)),
    p95Ms: round1(percentile(sorted, 95)),
    p99Ms: round1(percentile(sorted, 99)),
    maxMs: round1(sorted.length > 0 ? sorted[sorted.length - 1]! : 0),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export class Metrics {
  /** Wall-clock command latencies by command type (direct executeCommand calls). */
  readonly commandMs = new Map<string, number[]>();
  /** Wall-clock job-sweep durations by job id. */
  readonly sweepMs = new Map<string, number[]>();
  /** Agent queue wait (enqueue → start) by task kind. */
  readonly agentWaitMs = new Map<string, number[]>();
  /** Agent turn durations (start → done) by task kind. */
  readonly agentTurnMs = new Map<string, number[]>();
  /** Max queue depth observed per account. */
  readonly agentMaxDepthByAccount = new Map<string, number>();
  /** Error counts by code (command error codes + handler failure codes). */
  readonly errors = new Map<string, number>();
  /** pg_stat_activity backend counts sampled during the run. */
  readonly pgBackends: number[] = [];
  /** pg Pool counters sampled during the run. */
  readonly poolSamples: Array<{ total: number; idle: number; waiting: number }> = [];
  /** Counters for handler outcomes (dispatched, reconciled, delivered, ...). */
  readonly counters = new Map<string, number>();
  /** Phase wall durations in ms. */
  readonly phases = new Map<string, number>();

  private push(map: Map<string, number[]>, key: string, value: number): void {
    const list = map.get(key) ?? [];
    list.push(value);
    map.set(key, list);
  }

  timeCommand(type: string, ms: number): void {
    this.push(this.commandMs, type, ms);
  }

  timeSweep(jobId: string, ms: number): void {
    this.push(this.sweepMs, jobId, ms);
  }

  timeAgentWait(kind: string, ms: number): void {
    this.push(this.agentWaitMs, kind, ms);
  }

  timeAgentTurn(kind: string, ms: number): void {
    this.push(this.agentTurnMs, kind, ms);
  }

  noteAgentDepth(accountId: string, depth: number): void {
    const prev = this.agentMaxDepthByAccount.get(accountId) ?? 0;
    if (depth > prev) this.agentMaxDepthByAccount.set(accountId, depth);
  }

  error(code: string): void {
    this.counters.set(`errors:${code}`, (this.counters.get(`errors:${code}`) ?? 0) + 1);
    this.errors.set(code, (this.errors.get(code) ?? 0) + 1);
  }

  count(key: string, by = 1): void {
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
  }

  phase(name: string, ms: number): void {
    this.phases.set(name, round1(ms));
  }
}

export type MetricsSummary = {
  commands: Record<string, LatencySummary>;
  commandTotalMs: Record<string, number>;
  sweeps: Record<string, LatencySummary>;
  sweepTotalMs: Record<string, number>;
  agentWait: Record<string, LatencySummary>;
  agentTurn: Record<string, LatencySummary>;
  agentMaxDepth: LatencySummary;
  errors: Record<string, number>;
  pgBackends: LatencySummary;
  poolWaitingMax: number;
  poolTotalMax: number;
  counters: Record<string, number>;
  phasesMs: Record<string, number>;
};

export function summarize(metrics: Metrics): MetricsSummary {
  const byKey = (map: Map<string, number[]>): Record<string, LatencySummary> => {
    const out: Record<string, LatencySummary> = {};
    for (const [key, samples] of map) out[key] = summarizeLatencies(samples);
    return out;
  };
  const poolWaitingMax = metrics.poolSamples.reduce((m, s) => Math.max(m, s.waiting), 0);
  const poolTotalMax = metrics.poolSamples.reduce((m, s) => Math.max(m, s.total), 0);
  const totals = (map: Map<string, number[]>): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [key, samples] of map) {
      out[key] = round1(samples.reduce((sum, value) => sum + value, 0));
    }
    return out;
  };
  return {
    commands: byKey(metrics.commandMs),
    commandTotalMs: totals(metrics.commandMs),
    sweeps: byKey(metrics.sweepMs),
    sweepTotalMs: totals(metrics.sweepMs),
    agentWait: byKey(metrics.agentWaitMs),
    agentTurn: byKey(metrics.agentTurnMs),
    agentMaxDepth: summarizeLatencies([...metrics.agentMaxDepthByAccount.values()]),
    errors: Object.fromEntries(metrics.errors),
    pgBackends: summarizeLatencies(metrics.pgBackends),
    poolWaitingMax,
    poolTotalMax,
    counters: Object.fromEntries(metrics.counters),
    phasesMs: Object.fromEntries(metrics.phases),
  };
}
