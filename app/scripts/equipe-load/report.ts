// Run output: JSON artifact per config + console summary table.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LoadConfig } from "./config";
import { summarizeLatencies, type MetricsSummary } from "./metrics";

export type CostSection = {
  weeklyTotalUsdCents: number;
  perAccountWeeklyUsdCents: { mean: number; p50: number; max: number };
  monthlyProjectionUsdPerAccount: number;
  monthlyProjectionBrlPerAccount: number;
  budgetBrlPerAccount: number;
};

export type FinalStates = {
  items: Record<string, number>;
  intents: Record<string, number>;
  escalations: number;
  exceptions: number;
};

export type RunPayload = {
  configName: string;
  startedAt: string;
  finishedAt: string;
  config: LoadConfig;
  summary: MetricsSummary;
  finalStates: FinalStates;
  agent: { refused: number; failed: number; succeeded: number };
  publisher: { attempts: number; uncertain: number; failed: number; latenciesMs: ReturnType<typeof summarizeLatencies> };
  modelCalls: Record<string, number>;
  notifications: { inbox: number; email: number };
  cost: CostSection;
  notes: string[];
};

export function saveRun(outDir: string, configName: string, payload: RunPayload): string {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `equipe-load-${configName}.json`);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
  return path;
}

export function printSummary(payload: RunPayload): void {
  const { summary, cost } = payload;
  console.log(`\n=== equipe-load [${payload.configName}] ===`);
  console.log(`accounts=${payload.config.accounts} pool=${payload.config.poolMax} timeScale=${payload.config.timeScale}`);
  const dispatched = summary.counters["dispatch.dispatched"] ?? 0;
  const dispatchSweeps = summary.sweeps["equipe-dispatch"];
  const dispatchTotalMs = summary.sweepTotalMs["equipe-dispatch"] ?? 0;
  const throughput =
    dispatchTotalMs > 0 ? (dispatched / (dispatchTotalMs / 60000)).toFixed(1) : "n/a";
  console.log(
    `dispatch: ${dispatched} items, sweeps=${dispatchSweeps?.count ?? 0} ` +
      `p50=${dispatchSweeps?.p50Ms ?? 0}ms p95=${dispatchSweeps?.p95Ms ?? 0}ms ` +
      `throughput=${throughput} items/min`,
  );
  console.log(
    `final: items=${JSON.stringify(payload.finalStates.items)} ` +
      `intents=${JSON.stringify(payload.finalStates.intents)} ` +
      `escalations=${payload.finalStates.escalations} exceptions=${payload.finalStates.exceptions}`,
  );
  for (const [type, lat] of Object.entries(summary.commands)) {
    console.log(`  cmd ${type}: n=${lat.count} p50=${lat.p50Ms}ms p95=${lat.p95Ms}ms p99=${lat.p99Ms}ms`);
  }
  for (const [job, lat] of Object.entries(summary.sweeps)) {
    if (job === "equipe-dispatch") continue;
    console.log(`  sweep ${job}: n=${lat.count} p50=${lat.p50Ms}ms p95=${lat.p95Ms}ms`);
  }
  console.log(
    `agent: ok=${payload.agent.succeeded} failed=${payload.agent.failed} refused=${payload.agent.refused} ` +
      `maxDepth p50=${summary.agentMaxDepth.p50Ms} max=${summary.agentMaxDepth.maxMs}`,
  );
  for (const [kind, lat] of Object.entries(summary.agentWait)) {
    console.log(`  wait ${kind}: p50=${lat.p50Ms}ms p95=${lat.p95Ms}ms`);
  }
  console.log(
    `pg: backends p50=${summary.pgBackends.p50Ms} p95=${summary.pgBackends.p95Ms} max=${summary.pgBackends.maxMs} ` +
      `poolTotalMax=${summary.poolTotalMax} poolWaitingMax=${summary.poolWaitingMax}`,
  );
  console.log(
    `publisher: attempts=${payload.publisher.attempts} uncertain=${payload.publisher.uncertain} ` +
      `failed=${payload.publisher.failed}`,
  );
  console.log(`notifications: inbox=${payload.notifications.inbox} email=${payload.notifications.email}`);
  console.log(`errors: ${JSON.stringify(summary.errors)}`);
  console.log(
    `cost: weekly/account=$${(cost.perAccountWeeklyUsdCents.mean / 100).toFixed(2)} ` +
      `monthly-proj=$${cost.monthlyProjectionUsdPerAccount.toFixed(2)} ` +
      `(R$${cost.monthlyProjectionBrlPerAccount.toFixed(2)} vs orçamento R$${cost.budgetBrlPerAccount.toFixed(2)})`,
  );
  console.log(`phases: ${JSON.stringify(summary.phasesMs)}`);
}
