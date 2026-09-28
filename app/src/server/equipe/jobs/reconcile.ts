// Inngest function `equipe-reconcile` (#549).
//
// Cron every 10 min. Runs `reconcile_publication` for items in `verifying`
// and manual `published_declared` items, per enabled account. Thin loop:
// the lookup, match and escalation decisions live in the command.
//
// Registered in app/src/app/api/inngest/route.ts — no new route.

import { inngest } from "@/server/jobs/client";
import { logger } from "@/lib/logger";
import { executeCommand } from "../module/commands";
import {
  createProdJobDeps,
  listEnabledAccounts,
  moduleDepsFor,
  systemJobActor,
  type EquipeJobDeps,
  type JobStep,
} from "./shared";

export const EQUIPE_RECONCILE_ID = "equipe-reconcile";
export const EQUIPE_RECONCILE_CRON = "*/10 * * * *";

export type EquipeReconcileResult = {
  accounts: number;
  reconciled: string[];
  failed: Array<{ itemId: string; code: string; message: string }>;
};

export function createReconcileHandler(deps: EquipeJobDeps) {
  return async function equipeReconcileHandler({
    step,
  }: {
    event: { data: unknown };
    step: JobStep;
  }): Promise<EquipeReconcileResult> {
    const accounts = await step.run("list-enabled-accounts", () => listEnabledAccounts(deps));
    const reconciled: string[] = [];
    const failed: Array<{ itemId: string; code: string; message: string }> = [];
    for (const account of accounts) {
      const scope = { workspaceId: account.workspaceId, accountId: account.accountId };
      const items = await deps.uow.repos.items.list(scope, {
        status: ["verifying", "published_declared"],
      });
      for (const item of items) {
        try {
          const outcome = await step.run(`reconcile-${item.id}`, () =>
            executeCommand(
              moduleDepsFor(deps, account.workspaceId),
              { actor: systemJobActor(EQUIPE_RECONCILE_ID), ...scope },
              { type: "reconcile_publication", payload: { itemId: item.id } },
            ),
          );
          if (!outcome.ok) {
            logger.error(`[${EQUIPE_RECONCILE_ID}] reconcile failed`, {
              ...scope,
              itemId: item.id,
              code: outcome.error.code,
            });
            failed.push({ itemId: item.id, code: outcome.error.code, message: outcome.error.message });
            continue;
          }
          reconciled.push(item.id);
        } catch (error) {
          logger.error(`[${EQUIPE_RECONCILE_ID}] reconcile threw`, {
            ...scope,
            itemId: item.id,
            error: error instanceof Error ? error.message : "unknown",
          });
          failed.push({
            itemId: item.id,
            code: "threw",
            message: error instanceof Error ? error.message : "unknown",
          });
        }
      }
    }
    return { accounts: accounts.length, reconciled, failed };
  };
}

export function buildEquipeReconcileJob(client: typeof inngest, deps: EquipeJobDeps) {
  return client.createFunction(
    {
      id: EQUIPE_RECONCILE_ID,
      triggers: [{ cron: EQUIPE_RECONCILE_CRON }],
      // The command is idempotent per item (a settled item reconciles to a
      // no-op), so overlapping runs are safe; still, one at a time keeps
      // the Instagram lookups from doubling.
      concurrency: [{ limit: 1 }],
      onFailure: async ({ error }) => {
        logger.error(`[${EQUIPE_RECONCILE_ID}] failed`, {
          error: error instanceof Error ? error.message : "unknown",
        });
      },
    },
    createReconcileHandler(deps),
  );
}

export const equipeReconcileJob = buildEquipeReconcileJob(inngest, createProdJobDeps());
