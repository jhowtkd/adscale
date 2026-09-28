// Equipe durable jobs (#549): function ids, cron expressions, triggers
// and concurrency. The behavior behind each trigger is covered by the
// module command tests plus handlers.test.ts.

import { describe, expect, it } from "vitest";
import {
  EQUIPE_DISPATCH_CRON,
  EQUIPE_DISPATCH_EVENT,
  EQUIPE_DISPATCH_ID,
  equipeDispatchJob,
} from "./dispatch";
import {
  EQUIPE_RECONCILE_CRON,
  EQUIPE_RECONCILE_ID,
  equipeReconcileJob,
} from "./reconcile";
import {
  EQUIPE_REMINDERS_CRON,
  EQUIPE_REMINDERS_ID,
  equipeRemindersJob,
} from "./reminders";
import {
  EQUIPE_DEADLINES_CRON,
  EQUIPE_DEADLINES_ID,
  equipeDeadlinesJob,
} from "./deadlines";
import {
  EQUIPE_MONITOR_CRON,
  EQUIPE_MONITOR_ID,
  equipeMonitorJob,
} from "./monitor";
import {
  EQUIPE_SIGNALS_CRON,
  EQUIPE_SIGNALS_EVENT,
  EQUIPE_SIGNALS_ID,
  equipeSignalsJob,
} from "./signals";
import {
  EQUIPE_NOTIFICATIONS_CRON,
  EQUIPE_NOTIFICATIONS_ID,
  equipeNotificationsJob,
} from "./notifications";

type JobOpts = {
  id?: string;
  concurrency?: Array<{ limit: number; key?: string }>;
  triggers?: Array<{ event?: string; cron?: string }>;
};

function optsOf(job: unknown): JobOpts {
  return (job as unknown as { opts: JobOpts }).opts;
}

describe("equipe job config", () => {
  it("dispatch runs every 5 min plus a wake event, serialized", () => {
    expect(EQUIPE_DISPATCH_ID).toBe("equipe-dispatch");
    expect(EQUIPE_DISPATCH_CRON).toBe("*/5 * * * *");
    expect(EQUIPE_DISPATCH_EVENT).toBe("equipe.dispatch.now");
    const opts = optsOf(equipeDispatchJob);
    expect(opts.id).toBe("equipe-dispatch");
    expect(opts.triggers).toEqual([{ cron: "*/5 * * * *" }, { event: "equipe.dispatch.now" }]);
    // Behind the lease claim: the same intent is never dispatched twice.
    expect(opts.concurrency).toEqual([{ limit: 1 }]);
  });

  it("reconcile runs every 10 min", () => {
    expect(EQUIPE_RECONCILE_ID).toBe("equipe-reconcile");
    expect(EQUIPE_RECONCILE_CRON).toBe("*/10 * * * *");
    const opts = optsOf(equipeReconcileJob);
    expect(opts.id).toBe("equipe-reconcile");
    expect(opts.triggers).toEqual([{ cron: "*/10 * * * *" }]);
    expect(opts.concurrency).toEqual([{ limit: 1 }]);
  });

  it("reminders run every 30 min", () => {
    expect(EQUIPE_REMINDERS_ID).toBe("equipe-reminders");
    expect(EQUIPE_REMINDERS_CRON).toBe("*/30 * * * *");
    const opts = optsOf(equipeRemindersJob);
    expect(opts.id).toBe("equipe-reminders");
    expect(opts.triggers).toEqual([{ cron: "*/30 * * * *" }]);
    expect(opts.concurrency).toEqual([{ limit: 1 }]);
  });

  it("deadlines run every 15 min", () => {
    expect(EQUIPE_DEADLINES_ID).toBe("equipe-deadlines");
    expect(EQUIPE_DEADLINES_CRON).toBe("*/15 * * * *");
    const opts = optsOf(equipeDeadlinesJob);
    expect(opts.id).toBe("equipe-deadlines");
    expect(opts.triggers).toEqual([{ cron: "*/15 * * * *" }]);
    expect(opts.concurrency).toEqual([{ limit: 1 }]);
  });

  it("calibration monitor runs daily at 09:00 São Paulo", () => {
    expect(EQUIPE_MONITOR_ID).toBe("equipe-calibration-monitor");
    // 09:00 SP (fixed UTC-3) in UTC.
    expect(EQUIPE_MONITOR_CRON).toBe("0 12 * * *");
    const opts = optsOf(equipeMonitorJob);
    expect(opts.id).toBe("equipe-calibration-monitor");
    expect(opts.triggers).toEqual([{ cron: "0 12 * * *" }]);
    expect(opts.concurrency).toEqual([{ limit: 1 }]);
  });

  it("signals scan every 5 min plus a scan event", () => {
    expect(EQUIPE_SIGNALS_ID).toBe("equipe-signals");
    expect(EQUIPE_SIGNALS_CRON).toBe("*/5 * * * *");
    expect(EQUIPE_SIGNALS_EVENT).toBe("equipe.signals.scan");
    const opts = optsOf(equipeSignalsJob);
    expect(opts.id).toBe("equipe-signals");
    expect(opts.triggers).toEqual([{ cron: "*/5 * * * *" }, { event: "equipe.signals.scan" }]);
    expect(opts.concurrency).toEqual([{ limit: 1 }]);
  });

  it("notifications drain every 5 min", () => {
    expect(EQUIPE_NOTIFICATIONS_ID).toBe("equipe-notifications");
    expect(EQUIPE_NOTIFICATIONS_CRON).toBe("*/5 * * * *");
    const opts = optsOf(equipeNotificationsJob);
    expect(opts.id).toBe("equipe-notifications");
    expect(opts.triggers).toEqual([{ cron: "*/5 * * * *" }]);
    expect(opts.concurrency).toEqual([{ limit: 1 }]);
  });
});
