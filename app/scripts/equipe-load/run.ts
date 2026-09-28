// Orchestration: setup → simulated week → cost + report.
// Reached only through index.ts (env bootstrap + guards first).

import { inArray, sql } from "drizzle-orm";
import { FakeAdscaleGateway } from "../../src/server/equipe/module/testing/fakes";
import {
  equipeAgentLedger,
  equipeEscalations,
  equipeExceptions,
  equipeItems,
  equipePublicationIntents,
} from "../../src/server/db/equipe-schema";
import { clientProfiles, creativeWorkItems, user, workspaces } from "../../src/server/db/schema";
import type { EquipeModuleDeps } from "../../src/server/equipe/module/ports";
import { parseArgs } from "./config";
import { Metrics, summarize, summarizeLatencies } from "./metrics";
import { MutableClock } from "./clock";
import { createLoadDatabase, startSampler, type LoadDatabase } from "./db";
import { LoadModelClient, LoadPublisher, NotificationSink, Rng } from "./fakes";
import { WEEK_START_ISO, buildScenario, setupStaff, type ScenarioAccount } from "./scenario";
import { AgentQueue } from "./agent-queue";
import { runWeek } from "./drivers";
import { printSummary, saveRun, type CostSection, type FinalStates } from "./report";

/** Gerencial exchange rate from the proposal (P). */
const BRL_PER_USD = 5.5;
/** AI budget per account/month, vigente §0.2 (R$ 1.000 orçada). */
const AI_BUDGET_BRL = 1000;

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const config = parseArgs(process.argv.slice(2));
  const rng = new Rng(config.seed);
  const metrics = new Metrics();
  const clock = new MutableClock(new Date(WEEK_START_ISO));

  const database = createLoadDatabase(config.databaseUrl, config.poolMax);
  const stopSampler = startSampler(database.pool, metrics);

  const gateway = new FakeAdscaleGateway();
  const publisher = new LoadPublisher(rng, {
    latencyMinMs: config.publisherLatencyMinMs,
    latencyMaxMs: config.publisherLatencyMaxMs,
    failRate: config.publisherFailRate,
    uncertainRate: config.publisherUncertainRate,
    now: () => clock.now(),
  });
  const modelClient = new LoadModelClient(rng, {
    timeScale: config.timeScale,
    failureRate: config.agentFailureRate,
    // Token counts per call (H): proposal-consistent magnitudes — a normal
    // mission lands near ~US$0.14/turn, a heavy one near ~US$0.11.
    strategist: { latencyMs: config.strategistLatencyMs, inputTokens: 12000, outputTokens: 2500 },
    research: { latencyMs: config.researchLatencyMs, inputTokens: 20000, outputTokens: 4000 },
    reviewer: { latencyMs: config.reviewerLatencyMs, inputTokens: 6000, outputTokens: 1500 },
  });
  const sink = new NotificationSink();

  // Same shape as jobs/shared moduleDepsFor; the fake gateway is shared,
  // so the workspace scope is a no-op here.
  const moduleDepsFor = (): EquipeModuleDeps => ({
    uow: database.uow,
    clock,
    gateway,
    publisher,
    isEnabledForWorkspace: () => true,
    isPublishEnabled: () => true,
  });
  const moduleDeps = moduleDepsFor();
  const jobDeps = {
    uow: database.uow,
    clock,
    isEnabledForWorkspace: () => true,
    gatewayFor: () => gateway,
    publisher,
    isPublishEnabled: () => true,
  };
  const notifDeps = { ...jobDeps, delivery: sink.adapters() };
  const agentQueue = new AgentQueue({
    uow: database.uow,
    moduleDepsFor,
    client: modelClient,
    ledger: database.ledger,
    now: () => clock.now(),
    isEnabledForWorkspace: () => true,
    metrics,
  });

  const scenarioDeps = {
    deps: moduleDeps,
    gateway,
    metrics,
    rng,
    createLoginUser: async (input: { id: string; name: string; email: string }) => {
      await database.db.insert(user).values({
        id: input.id,
        name: input.name,
        email: input.email,
        emailVerified: true,
      });
    },
    createCreativeWork: async (input: {
      workId: string;
      workspaceId: string;
      profileId: string;
      createdBy: string;
      title: string;
    }) => {
      await database.db.insert(creativeWorkItems).values({
        id: input.workId,
        workspaceId: input.workspaceId,
        clientProfileId: input.profileId,
        createdByUserId: input.createdBy,
        title: input.title,
        request: `load: ${input.title}`,
        toolKind: "social_post",
        settings: {},
      });
    },
    createWorkspace: async (input: { workspaceId: string; profileId: string; brand: string }) => {
      await database.db.insert(workspaces).values({
        id: input.workspaceId,
        name: input.brand,
        slug: `load-${input.workspaceId.slice(0, 8)}`,
      });
      await database.db.insert(clientProfiles).values({
        id: input.profileId,
        workspaceId: input.workspaceId,
        name: input.brand,
      });
    },
  };

  console.log(`equipe-load: setup ${config.accounts} accounts…`);
  const setupStart = performance.now();
  const staff = await setupStaff(scenarioDeps);
  const accounts: ScenarioAccount[] = [];
  for (let i = 0; i < config.accounts; i += 1) {
    accounts.push(await buildScenario(scenarioDeps, staff, i));
    if ((i + 1) % 10 === 0) console.log(`  setup: ${i + 1}/${config.accounts}`);
  }
  metrics.phase("setup", performance.now() - setupStart);

  console.log("equipe-load: simulated week…");
  await runWeek(
    {
      jobDeps,
      notifDeps,
      moduleDeps,
      clock,
      metrics,
      rng,
      agentQueue,
      tickMinutes: config.tickMinutes,
      simDays: config.simDays,
      burstConcurrency: config.burstConcurrency,
    },
    accounts,
  );

  const cost = await measureCost(database.db, accounts.map((a) => a.accountId));
  const finalStates = await measureFinalStates(database.db);
  stopSampler();

  const modelCalls: Record<string, number> = {};
  for (const call of modelClient.calls) {
    modelCalls[call.role] = (modelCalls[call.role] ?? 0) + 1;
  }
  const payload = {
    configName: config.configName,
    startedAt,
    finishedAt: new Date().toISOString(),
    config,
    summary: summarize(metrics),
    finalStates,
    agent: agentQueue.stats,
    publisher: {
      attempts: publisher.attempts,
      uncertain: publisher.uncertain,
      failed: publisher.failed,
      latenciesMs: summarizeLatencies(publisher.latenciesMs),
    },
    modelCalls,
    notifications: {
      inbox: sink.records.filter((r) => r.channel === "inbox").length,
      email: sink.records.filter((r) => r.channel === "email").length,
    },
    cost,
    notes: [
      "Ledger createdAt uses real time while decisions use the sim clock: cost is summed over the run accounts (weekly), not via the monthly-cap query.",
      "Sim tick is hourly; production crons fire every 5–30 min (staging measures real Inngest latency).",
      "Token counts per role are assumed (H), priced with the #550 ledger table.",
    ],
  };
  const path = saveRun(config.outDir, config.configName, payload);
  printSummary(payload);
  console.log(`saved ${path}`);

  await database.pool.end();
}

async function measureCost(db: LoadDatabase["db"], accountIds: string[]): Promise<CostSection> {
  const rows = await db
    .select({ accountId: equipeAgentLedger.accountId, total: sql<number>`sum(cost_usd_cents)` })
    .from(equipeAgentLedger)
    .where(inArray(equipeAgentLedger.accountId, accountIds))
    .groupBy(equipeAgentLedger.accountId);
  const perAccount = rows.map((row) => Number(row.total ?? 0));
  const weeklyTotal = perAccount.reduce((sum, value) => sum + value, 0);
  const mean = accountIds.length > 0 ? weeklyTotal / accountIds.length : 0;
  const sorted = [...perAccount].sort((a, b) => a - b);
  const p50 = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)]! : 0;
  const max = sorted.length > 0 ? sorted[sorted.length - 1]! : 0;
  // Pilot week → civil month projection.
  const monthlyUsd = (mean / 100) * (30.44 / 7);
  return {
    weeklyTotalUsdCents: weeklyTotal,
    perAccountWeeklyUsdCents: { mean: Math.round(mean * 100) / 100, p50, max },
    monthlyProjectionUsdPerAccount: Math.round(monthlyUsd * 100) / 100,
    monthlyProjectionBrlPerAccount: Math.round(monthlyUsd * BRL_PER_USD * 100) / 100,
    budgetBrlPerAccount: AI_BUDGET_BRL,
  };
}

async function measureFinalStates(db: LoadDatabase["db"]): Promise<FinalStates> {
  const itemRows = await db
    .select({ status: equipeItems.status, count: sql<number>`count(*)` })
    .from(equipeItems)
    .groupBy(equipeItems.status);
  const intentRows = await db
    .select({ status: equipePublicationIntents.status, count: sql<number>`count(*)` })
    .from(equipePublicationIntents)
    .groupBy(equipePublicationIntents.status);
  const [esc] = await db.select({ count: sql<number>`count(*)` }).from(equipeEscalations);
  const [exc] = await db.select({ count: sql<number>`count(*)` }).from(equipeExceptions);
  const items: Record<string, number> = {};
  for (const row of itemRows) items[row.status ?? "?"] = Number(row.count);
  const intents: Record<string, number> = {};
  for (const row of intentRows) intents[row.status ?? "?"] = Number(row.count);
  return {
    items,
    intents,
    escalations: Number(esc?.count ?? 0),
    exceptions: Number(exc?.count ?? 0),
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`equipe-load failed: ${error instanceof Error ? error.message : "unknown"}`);
    process.exit(1);
  });
