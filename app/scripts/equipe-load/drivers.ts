// Drivers: the SAME job handlers the Inngest functions call, driven on a
// simulated clock through one pilot week, plus the mid-week burst of
// concurrent client commands.
//
// Cadence mapping (sim tick = 1 h by default): dispatch, reconcile,
// signals and notifications run every tick; deadlines 4×/day; reminders
// 2×/business-day; the calibration monitor daily at 09:00 SP. Production
// crons fire every 5–30 min — the sim compresses intra-hour cron effects
// (staging measures the real Inngest queue latency).

import { createDispatchHandler } from "../../src/server/equipe/jobs/dispatch";
import { createReconcileHandler } from "../../src/server/equipe/jobs/reconcile";
import { createRemindersHandler } from "../../src/server/equipe/jobs/reminders";
import { createDeadlinesHandler } from "../../src/server/equipe/jobs/deadlines";
import { createMonitorHandler } from "../../src/server/equipe/jobs/monitor";
import { createSignalsHandler } from "../../src/server/equipe/jobs/signals";
import {
  createNotificationsHandler,
  type NotificationsJobDeps,
} from "../../src/server/equipe/jobs/notifications";
import type { AccountCommandOutcome, EquipeJobDeps } from "../../src/server/equipe/jobs/shared";
import type { EquipeModuleDeps } from "../../src/server/equipe/module/ports";
import type { Metrics } from "./metrics";
import type { MutableClock } from "./clock";
import type { Rng } from "./fakes";
import {
  AgentQueue,
  researchInput,
  reviewInput,
  strategistInput,
  type AgentTaskSpec,
} from "./agent-queue";
import { WEEK_START_ISO, runTimed, spDate, type ScenarioAccount } from "./scenario";

const step = { run: async <T>(_name: string, fn: () => Promise<T>) => fn() };
const event = { data: {} };

export type Drivers = {
  jobDeps: EquipeJobDeps;
  notifDeps: NotificationsJobDeps;
  moduleDeps: EquipeModuleDeps;
  clock: MutableClock;
  metrics: Metrics;
  rng: Rng;
  agentQueue: AgentQueue;
  tickMinutes: number;
  simDays: number;
  burstConcurrency: number;
};

function countOutcomes(metrics: Metrics, jobId: string, outcomes: AccountCommandOutcome[]): void {
  for (const outcome of outcomes) {
    if (outcome.ok) {
      metrics.count(`${jobId}.ok`);
    } else {
      metrics.count(`${jobId}.failed`);
      metrics.error(outcome.code);
    }
  }
}

async function sweep<T>(drivers: Drivers, jobId: string, fn: () => Promise<T>): Promise<T | null> {
  const start = performance.now();
  try {
    const result = await fn();
    drivers.metrics.timeSweep(jobId, performance.now() - start);
    return result;
  } catch (error) {
    drivers.metrics.timeSweep(jobId, performance.now() - start);
    drivers.metrics.error(`${jobId}.threw`);
    console.error(
      `  [${jobId}] threw: ${error instanceof Error ? error.message : "unknown"}`,
    );
    return null;
  }
}

type Handlers = {
  dispatch: ReturnType<typeof createDispatchHandler>;
  reconcile: ReturnType<typeof createReconcileHandler>;
  reminders: ReturnType<typeof createRemindersHandler>;
  deadlines: ReturnType<typeof createDeadlinesHandler>;
  monitor: ReturnType<typeof createMonitorHandler>;
  signals: ReturnType<typeof createSignalsHandler>;
  notifications: ReturnType<typeof createNotificationsHandler>;
};

function buildHandlers(drivers: Drivers): Handlers {
  return {
    dispatch: createDispatchHandler(drivers.jobDeps),
    reconcile: createReconcileHandler(drivers.jobDeps),
    reminders: createRemindersHandler(drivers.jobDeps),
    deadlines: createDeadlinesHandler(drivers.jobDeps),
    monitor: createMonitorHandler(drivers.jobDeps),
    signals: createSignalsHandler(drivers.jobDeps),
    notifications: createNotificationsHandler(drivers.notifDeps),
  };
}

/** Dispatch drain: repeat the sweep until no intent is claimed (cron keeps firing). */
async function drainDispatch(drivers: Drivers, handlers: Handlers): Promise<void> {
  for (let round = 0; round < 12; round += 1) {
    const result = await sweep(drivers, "equipe-dispatch", () =>
      handlers.dispatch({ event, step }),
    );
    if (!result || result.skipped) {
      if (result?.skipped) drivers.metrics.count("dispatch.skipped_window");
      return;
    }
    drivers.metrics.count("dispatch.claimed", result.claimed);
    drivers.metrics.count("dispatch.dispatched", result.dispatched.length);
    for (const failure of result.failed) {
      drivers.metrics.count("dispatch.failed");
      drivers.metrics.error(failure.code);
    }
    if (result.claimed === 0) return;
  }
  drivers.metrics.count("dispatch.drain_capped");
}

/** Mid-week burst: concurrent client commands across accounts. */
export async function runBurst(drivers: Drivers, accounts: ScenarioAccount[]): Promise<void> {
  const { metrics, moduleDeps, burstConcurrency } = drivers;
  const start = performance.now();
  let cursor = 0;
  const worker = async () => {
    while (cursor < accounts.length) {
      const account = accounts[cursor]!;
      cursor += 1;
      const scope = { workspaceId: account.workspaceId, accountId: account.accountId };
      const as = (actor: (typeof account.actors)["approver"]) => ({ actor, ...scope });
      const batch = account.burstBatch.map((item) => ({
        itemId: item.itemId,
        versionHash: item.versionHash,
      }));
      if (batch.length > 0) {
        await runTimed(metrics, moduleDeps, as(account.actors.approver),
          { type: "approve_batch", payload: { items: batch } }, "burst approve_batch");
      }
      if (account.burstConfirm) {
        const target = account.burstConfirm;
        await runTimed(metrics, moduleDeps, as(account.actors.approver),
          {
            type: "confirm_business_fact",
            payload: { itemId: target.itemId, expectedVersionHash: target.versionHash },
          },
          "burst confirm_business_fact");
        await runTimed(metrics, moduleDeps, as(account.actors.approver),
          {
            type: "approve_item",
            payload: { itemId: target.itemId, expectedVersionHash: target.versionHash },
          },
          "burst approve_item");
      }
      for (const target of account.burstEdit) {
        await runTimed(metrics, moduleDeps, as(account.actors.approver),
          {
            type: "edit_caption",
            payload: { itemId: target.itemId, caption: `Legenda ajustada pelo cliente ${target.itemId.slice(0, 8)}` },
          },
          "burst edit_caption");
      }
      for (const target of account.burstAdjust) {
        await runTimed(metrics, moduleDeps, as(account.actors.approver),
          {
            type: "request_adjustment",
            payload: { itemId: target.itemId, category: "voice", note: "tom mais direto" },
          },
          "burst request_adjustment");
      }
    }
  };
  const workers = Array.from({ length: Math.min(burstConcurrency, accounts.length) }, () => worker());
  await Promise.all(workers);
  metrics.phase("burst", performance.now() - start);
}

/**
 * Weekly agent mix per account (H): the proposal §4 base month (120 light /
 * 24 normal / 8 heavy missions) sliced to a week → 28 light (review_text)
 * + 5 normal (strategist_turn) + 2 heavy (research). Reviews arrive in two
 * batches of 14 so queue depth is exercised; the rest spread over the week.
 */
function agentSchedule(accounts: ScenarioAccount[]): Array<{ at: Date; tasks: AgentTaskSpec[] }> {
  const batch = (at: Date, from: number, count: number): { at: Date; tasks: AgentTaskSpec[] } => {
    const tasks: AgentTaskSpec[] = [];
    for (const account of accounts) {
      const scope = { workspaceId: account.workspaceId, accountId: account.accountId };
      for (let i = 0; i < count; i += 1) {
        tasks.push({
          ...scope,
          kind: "review_text",
          input: reviewInput(`Post ${from + i + 1} da ${account.brand}`),
        });
      }
    }
    return { at, tasks };
  };
  const entries: Array<{ at: Date; tasks: AgentTaskSpec[] }> = [
    batch(spDate(5, 8), 0, 14),
    batch(spDate(7, 8), 14, 14),
  ];
  for (const account of accounts) {
    const scope = { workspaceId: account.workspaceId, accountId: account.accountId };
    const turns: Array<{ at: Date; kind: string; input: unknown }> = [
      { at: spDate(5, 9), kind: "strategist_turn", input: strategistInput(account.brand, 41) },
      { at: spDate(6, 10), kind: "research", input: researchInput() },
      { at: spDate(7, 12), kind: "strategist_turn", input: strategistInput(account.brand, 41) },
      { at: spDate(8, 9), kind: "strategist_turn", input: strategistInput(account.brand, 41) },
      { at: spDate(9, 10), kind: "research", input: researchInput() },
      { at: spDate(9, 12), kind: "strategist_turn", input: strategistInput(account.brand, 41) },
      { at: spDate(10, 10), kind: "strategist_turn", input: strategistInput(account.brand, 41) },
    ];
    for (const turn of turns) {
      entries.push({ at: turn.at, tasks: [{ ...scope, kind: turn.kind, input: turn.input }] });
    }
  }
  return entries;
}

function sameTick(a: Date, tickStart: Date, tickMs: number): boolean {
  const t = a.getTime();
  return t >= tickStart.getTime() && t < tickStart.getTime() + tickMs;
}

function spHour(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Sao_Paulo",
    }).format(date),
  );
}

export async function runWeek(drivers: Drivers, accounts: ScenarioAccount[]): Promise<void> {
  const handlers = buildHandlers(drivers);
  const { clock, metrics, tickMinutes, simDays } = drivers;
  const tickMs = tickMinutes * 60 * 1000;
  const weekStart = new Date(WEEK_START_ISO).getTime();
  const ticks = Math.round((simDays * 24 * 60) / tickMinutes);
  const schedule = agentSchedule(accounts);
  const submitted = new Set<AgentTaskSpec[]>();
  let burstDone = false;
  const start = performance.now();

  for (let tick = 0; tick < ticks; tick += 1) {
    const tickStart = new Date(weekStart + tick * tickMs);
    clock.set(tickStart);
    const hour = spHour(tickStart);

    for (const entry of schedule) {
      if (!submitted.has(entry.tasks) && sameTick(entry.at, tickStart, tickMs)) {
        submitted.add(entry.tasks);
        for (const task of entry.tasks) {
          drivers.agentQueue.submit(task).catch(() => undefined);
        }
      }
    }

    // Mid-week burst at Wednesday 10:00 SP.
    if (!burstDone && tickStart >= spDate(7, 10)) {
      burstDone = true;
      await runBurst(drivers, accounts);
    }

    await drainDispatch(drivers, handlers);

    const reconciled = await sweep(drivers, "equipe-reconcile", () =>
      handlers.reconcile({ event, step }),
    );
    if (reconciled) {
      metrics.count("reconcile.items", reconciled.reconciled.length);
      for (const failure of reconciled.failed) {
        metrics.count("reconcile.failed");
        metrics.error(failure.code);
      }
    }

    const signals = await sweep(drivers, "equipe-signals", () =>
      handlers.signals({ event, step }),
    );
    if (signals) {
      metrics.count("signals.ingested", signals.ingested.length);
      for (const failure of signals.failed) {
        metrics.count("signals.failed");
        metrics.error(failure.code);
      }
    }

    const notifications = await sweep(drivers, "equipe-notifications", () =>
      handlers.notifications({ event, step }),
    );
    if (notifications) {
      metrics.count("notifications.delivered", notifications.delivered.length);
      for (const failure of notifications.failed) {
        metrics.count("notifications.failed");
        metrics.error(failure.code);
      }
    }

    if (tick % 6 === 0) {
      const deadlines = await sweep(drivers, "equipe-deadlines", () =>
        handlers.deadlines({ event, step }),
      );
      if (deadlines) countOutcomes(metrics, "deadlines", deadlines.outcomes);
    }
    if (hour === 9 || hour === 15) {
      const reminders = await sweep(drivers, "equipe-reminders", () =>
        handlers.reminders({ event, step }),
      );
      if (reminders && !reminders.skipped) {
        countOutcomes(metrics, "reminders", reminders.outcomes);
      } else if (reminders?.skipped) {
        metrics.count("reminders.skipped_day");
      }
    }
    if (hour === 8) {
      const monitor = await sweep(drivers, "equipe-calibration-monitor", () =>
        handlers.monitor({ event, step }),
      );
      if (monitor) countOutcomes(metrics, "monitor", monitor.outcomes);
    }

    if ((tick + 1) % 24 === 0) {
      console.log(`  week: day ${(tick + 1) / 24}/${simDays} sim=${tickStart.toISOString()}`);
    }
  }

  await drivers.agentQueue.drain();
  metrics.phase("week", performance.now() - start);
}
