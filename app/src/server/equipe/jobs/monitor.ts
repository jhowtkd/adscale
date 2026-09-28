// Inngest function `equipe-calibration-monitor` (#549).
//
// Daily cron (09:00 São Paulo). Runs `run_calibration_monitor` per enabled
// account: rejection spikes on released fronts and the quality-hours
// budget on calibrating ones. Thin sweep; every threshold lives in the
// command.
//
// Registered in app/src/app/api/inngest/route.ts — no new route.

import { inngest } from "@/server/jobs/client";
import { logger } from "@/lib/logger";
import {
  createProdJobDeps,
  forEachEnabledAccount,
  type AccountCommandOutcome,
  type EquipeJobDeps,
  type JobStep,
} from "./shared";

export const EQUIPE_MONITOR_ID = "equipe-calibration-monitor";
// 09:00 America/Sao_Paulo (fixed UTC-3, no DST) expressed in UTC.
export const EQUIPE_MONITOR_CRON = "0 12 * * *";

export type EquipeMonitorResult = {
  accounts: number;
  outcomes: AccountCommandOutcome[];
};

export function createMonitorHandler(deps: EquipeJobDeps) {
  return async function equipeMonitorHandler({
    step,
  }: {
    event: { data: unknown };
    step: JobStep;
  }): Promise<EquipeMonitorResult> {
    return step.run("run-calibration-monitor", () =>
      forEachEnabledAccount(EQUIPE_MONITOR_ID, deps, {
        type: "run_calibration_monitor",
        payload: {},
      }),
    );
  };
}

export function buildEquipeMonitorJob(client: typeof inngest, deps: EquipeJobDeps) {
  return client.createFunction(
    {
      id: EQUIPE_MONITOR_ID,
      triggers: [{ cron: EQUIPE_MONITOR_CRON }],
      // The command is fully idempotent (open-escalation dedupe,
      // once-per-front markers), so overlapping runs are safe.
      concurrency: [{ limit: 1 }],
      onFailure: async ({ error }) => {
        logger.error(`[${EQUIPE_MONITOR_ID}] failed`, {
          error: error instanceof Error ? error.message : "unknown",
        });
      },
    },
    createMonitorHandler(deps),
  );
}

export const equipeMonitorJob = buildEquipeMonitorJob(inngest, createProdJobDeps());
