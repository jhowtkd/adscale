// Inngest function `equipe-dispatch` (#549).
//
// Cron every 5 min plus a wake-up event. Claims due publication intents
// with the lease and runs `dispatch_publication` per intent. Only runs
// inside the assisted window (São Paulo): dispatching outside it would
// hold every due item at the gate. The same intent is never dispatched
// twice: the lease claim (SKIP LOCKED) plus a global concurrency of 1.
//
// Registered in app/src/app/api/inngest/route.ts — no new route.

import { z } from "zod";
import { inngest } from "@/server/jobs/client";
import { logger } from "@/lib/logger";
import { isWithinAssistedWindow } from "../domain";
import { EQUIPE_INTENT_LEASE_TTL_MS } from "../data";
import { executeCommand } from "../module/commands";
import { isEquipePublishEnabled } from "../module/publish-enabled";
import {
  createProdJobDeps,
  moduleDepsFor,
  systemJobActor,
  type EquipeJobDeps,
  type JobStep,
} from "./shared";

export const EQUIPE_DISPATCH_ID = "equipe-dispatch";
export const EQUIPE_DISPATCH_EVENT = "equipe.dispatch.now";
export const EQUIPE_DISPATCH_CRON = "*/5 * * * *";
export const EQUIPE_DISPATCH_CLAIM_LIMIT = 25;

const dispatchWakeSchema = z.object({}).catchall(z.unknown());

export type EquipeDispatchResult =
  | { skipped: "outside_window" }
  | {
      skipped?: undefined;
      claimed: number;
      dispatched: string[];
      failed: Array<{ intentId: string; code: string; message: string }>;
    };

export function createDispatchHandler(deps: EquipeJobDeps) {
  return async function equipeDispatchHandler({
    event,
    step,
  }: {
    event: { data: unknown };
    step: JobStep;
  }): Promise<EquipeDispatchResult> {
    // The wake event carries no targeting: any wake runs the same sweep as
    // the cron, so a wake can never race the lease claim.
    dispatchWakeSchema.parse(event.data ?? {});
    const now = deps.clock.now();
    if (!isWithinAssistedWindow(now)) {
      return { skipped: "outside_window" };
    }
    const owner = `${EQUIPE_DISPATCH_ID}:${crypto.randomUUID()}`;
    const intents = await step.run("claim-due-intents", () =>
      deps.uow.internal.claimDueIntents({
        owner,
        now,
        limit: EQUIPE_DISPATCH_CLAIM_LIMIT,
        leaseTtlMs: EQUIPE_INTENT_LEASE_TTL_MS,
        revalidatePublishDisabled: (deps.isPublishEnabled ?? isEquipePublishEnabled)(),
      }),
    );
    const dispatched: string[] = [];
    const failed: Array<{ intentId: string; code: string; message: string }> = [];
    for (const intent of intents) {
      if (!deps.isEnabledForWorkspace(intent.workspaceId)) {
        logger.info(`[${EQUIPE_DISPATCH_ID}] workspace outside the pilot, skipping intent`, {
          workspaceId: intent.workspaceId,
          intentId: intent.id,
        });
        continue;
      }
      const scope = { workspaceId: intent.workspaceId, accountId: intent.accountId };
      try {
        const outcome = await step.run(`dispatch-${intent.id}`, () =>
          executeCommand(
            moduleDepsFor(deps, intent.workspaceId),
            { actor: systemJobActor(EQUIPE_DISPATCH_ID), ...scope },
            { type: "dispatch_publication", payload: { intentId: intent.id } },
          ),
        );
        if (!outcome.ok) {
          logger.error(`[${EQUIPE_DISPATCH_ID}] dispatch failed`, {
            ...scope,
            intentId: intent.id,
            code: outcome.error.code,
          });
          failed.push({ intentId: intent.id, code: outcome.error.code, message: outcome.error.message });
          continue;
        }
        dispatched.push(intent.id);
      } catch (error) {
        logger.error(`[${EQUIPE_DISPATCH_ID}] dispatch threw`, {
          ...scope,
          intentId: intent.id,
          error: error instanceof Error ? error.message : "unknown",
        });
        failed.push({
          intentId: intent.id,
          code: "threw",
          message: error instanceof Error ? error.message : "unknown",
        });
      }
    }
    return { claimed: intents.length, dispatched, failed };
  };
}

export function buildEquipeDispatchJob(client: typeof inngest, deps: EquipeJobDeps) {
  return client.createFunction(
    {
      id: EQUIPE_DISPATCH_ID,
      triggers: [{ cron: EQUIPE_DISPATCH_CRON }, { event: EQUIPE_DISPATCH_EVENT }],
      // One dispatch run at a time, behind the lease claim: the same
      // intent is never dispatched twice.
      concurrency: [{ limit: 1 }],
      onFailure: async ({ error }) => {
        logger.error(`[${EQUIPE_DISPATCH_ID}] failed`, {
          error: error instanceof Error ? error.message : "unknown",
        });
      },
    },
    createDispatchHandler(deps),
  );
}

export const equipeDispatchJob = buildEquipeDispatchJob(inngest, createProdJobDeps());
