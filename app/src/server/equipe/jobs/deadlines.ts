// Inngest function `equipe-deadlines` (#549).
//
// Cron every 15 min. Runs `run_deadlines` per enabled account: item
// limits, escalation/exception SLAs, client-wait expiry and the
// calibration 6-week trigger. Thin sweep; every threshold lives in the
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

export const EQUIPE_DEADLINES_ID = "equipe-deadlines";
export const EQUIPE_DEADLINES_CRON = "*/15 * * * *";

export type EquipeDeadlinesResult = {
  accounts: number;
  outcomes: AccountCommandOutcome[];
};

export function createDeadlinesHandler(deps: EquipeJobDeps) {
  return async function equipeDeadlinesHandler({
    step,
  }: {
    event: { data: unknown };
    step: JobStep;
  }): Promise<EquipeDeadlinesResult> {
    return step.run("run-deadlines", () =>
      forEachEnabledAccount(EQUIPE_DEADLINES_ID, deps, { type: "run_deadlines", payload: {} }),
    );
  };
}

export function buildEquipeDeadlinesJob(client: typeof inngest, deps: EquipeJobDeps) {
  return client.createFunction(
    {
      id: EQUIPE_DEADLINES_ID,
      triggers: [{ cron: EQUIPE_DEADLINES_CRON }],
      // The command is fully idempotent (expiry no-ops, once-per-SLA
      // markers), so overlapping runs are safe.
      concurrency: [{ limit: 1 }],
      onFailure: async ({ error }) => {
        logger.error(`[${EQUIPE_DEADLINES_ID}] failed`, {
          error: error instanceof Error ? error.message : "unknown",
        });
      },
    },
    createDeadlinesHandler(deps),
  );
}

export const equipeDeadlinesJob = buildEquipeDeadlinesJob(inngest, createProdJobDeps());
