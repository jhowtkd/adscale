// Inngest function `equipe-reminders` (#549).
//
// Cron every 30 min on business days (São Paulo): capped reminders plus
// the implantação escalation path. Runs `run_reminders` per enabled
// account; the job only gates the business day, every threshold lives in
// the command.
//
// Registered in app/src/app/api/inngest/route.ts — no new route.

import { inngest } from "@/server/jobs/client";
import { logger } from "@/lib/logger";
import { isBusinessDay } from "../domain";
import {
  createProdJobDeps,
  forEachEnabledAccount,
  type AccountCommandOutcome,
  type EquipeJobDeps,
  type JobStep,
} from "./shared";

export const EQUIPE_REMINDERS_ID = "equipe-reminders";
export const EQUIPE_REMINDERS_CRON = "*/30 * * * *";

export type EquipeRemindersResult =
  | { skipped: "non_business_day" }
  | { skipped?: undefined; accounts: number; outcomes: AccountCommandOutcome[] };

export function createRemindersHandler(deps: EquipeJobDeps) {
  return async function equipeRemindersHandler({
    step,
  }: {
    event: { data: unknown };
    step: JobStep;
  }): Promise<EquipeRemindersResult> {
    if (!isBusinessDay(deps.clock.now())) {
      return { skipped: "non_business_day" };
    }
    return step.run("run-reminders", () =>
      forEachEnabledAccount(EQUIPE_REMINDERS_ID, deps, { type: "run_reminders", payload: {} }),
    );
  };
}

export function buildEquipeRemindersJob(client: typeof inngest, deps: EquipeJobDeps) {
  return client.createFunction(
    {
      id: EQUIPE_REMINDERS_ID,
      triggers: [{ cron: EQUIPE_REMINDERS_CRON }],
      // The command is fully idempotent (once-per-threshold markers), so
      // overlapping runs only repeat quiet no-ops.
      concurrency: [{ limit: 1 }],
      onFailure: async ({ error }) => {
        logger.error(`[${EQUIPE_REMINDERS_ID}] failed`, {
          error: error instanceof Error ? error.message : "unknown",
        });
      },
    },
    createRemindersHandler(deps),
  );
}

export const equipeRemindersJob = buildEquipeRemindersJob(inngest, createProdJobDeps());
