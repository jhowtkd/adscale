// Inngest function `equipe-signals` (#549).
//
// Cron every 5 min plus a scan event. Lists pending agent signals per
// enabled account (`agent.turn_failed`, `agent.budget_exceeded`,
// `escalation.requested`) and ingests each through `ingest_agent_signal`.
// Thin loop: pending discovery lives in the module query, the ingest
// decisions in the command.
//
// Registered in app/src/app/api/inngest/route.ts — no new route.

import { z } from "zod";
import { inngest } from "@/server/jobs/client";
import { logger } from "@/lib/logger";
import { executeCommand } from "../module/commands";
import { pendingSignalEvents } from "../module/jobs-signals";
import {
  createProdJobDeps,
  listEnabledAccounts,
  moduleDepsFor,
  systemJobActor,
  type EquipeJobDeps,
  type JobStep,
} from "./shared";

export const EQUIPE_SIGNALS_ID = "equipe-signals";
export const EQUIPE_SIGNALS_EVENT = "equipe.signals.scan";
export const EQUIPE_SIGNALS_CRON = "*/5 * * * *";

const signalsScanSchema = z.object({}).catchall(z.unknown());

export type EquipeSignalsResult = {
  accounts: number;
  ingested: string[];
  failed: Array<{ eventId: string; code: string; message: string }>;
};

export function createSignalsHandler(deps: EquipeJobDeps) {
  return async function equipeSignalsHandler({
    event,
    step,
  }: {
    event: { data: unknown };
    step: JobStep;
  }): Promise<EquipeSignalsResult> {
    signalsScanSchema.parse(event.data ?? {});
    const accounts = await step.run("list-enabled-accounts", () => listEnabledAccounts(deps));
    const ingested: string[] = [];
    const failed: Array<{ eventId: string; code: string; message: string }> = [];
    for (const account of accounts) {
      const scope = { workspaceId: account.workspaceId, accountId: account.accountId };
      const pending = await pendingSignalEvents(deps.uow.repos, scope);
      for (const signal of pending) {
        try {
          const outcome = await step.run(`ingest-${signal.id}`, () =>
            executeCommand(
              moduleDepsFor(deps, account.workspaceId),
              { actor: systemJobActor(EQUIPE_SIGNALS_ID), ...scope },
              { type: "ingest_agent_signal", payload: { sourceEventId: signal.id } },
            ),
          );
          if (!outcome.ok) {
            logger.error(`[${EQUIPE_SIGNALS_ID}] ingest failed`, {
              ...scope,
              eventId: signal.id,
              code: outcome.error.code,
            });
            failed.push({
              eventId: signal.id,
              code: outcome.error.code,
              message: outcome.error.message,
            });
            continue;
          }
          ingested.push(signal.id);
        } catch (error) {
          logger.error(`[${EQUIPE_SIGNALS_ID}] ingest threw`, {
            ...scope,
            eventId: signal.id,
            error: error instanceof Error ? error.message : "unknown",
          });
          failed.push({
            eventId: signal.id,
            code: "threw",
            message: error instanceof Error ? error.message : "unknown",
          });
        }
      }
    }
    return { accounts: accounts.length, ingested, failed };
  };
}

export function buildEquipeSignalsJob(client: typeof inngest, deps: EquipeJobDeps) {
  return client.createFunction(
    {
      id: EQUIPE_SIGNALS_ID,
      triggers: [{ cron: EQUIPE_SIGNALS_CRON }, { event: EQUIPE_SIGNALS_EVENT }],
      // The command is idempotent per source event (re-ingests return the
      // row the first call created), so overlapping runs are safe.
      concurrency: [{ limit: 1 }],
      onFailure: async ({ error }) => {
        logger.error(`[${EQUIPE_SIGNALS_ID}] failed`, {
          error: error instanceof Error ? error.message : "unknown",
        });
      },
    },
    createSignalsHandler(deps),
  );
}

export const equipeSignalsJob = buildEquipeSignalsJob(inngest, createProdJobDeps());
