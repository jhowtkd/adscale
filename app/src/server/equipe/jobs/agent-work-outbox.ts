import { logger } from "@/lib/logger";
import { db } from "@/server/db";
import { dispatchTaskIntent } from "../module/task-outbox";
import type { EquipeTaskEvent } from "../module/ports";
import { DrizzleLedgerStore, type LedgerStore } from "../agents/ledger";
import { inngest } from "@/server/jobs/client";
import { pendingAgentWork } from "../module/agent-work";
import { EQUIPE_AGENT_WORK_EVENT } from "../agents/agent-work";
import { consumeAdjustmentEvidence } from "../module/adjustment-evidence";
import { AGENT_WORK_REQUESTED_EVENT } from "../module/item-shared";
import type { LocalLearningAuthorizationPort } from "@/server/brand-taste/local-learning-authorization";
import { EQUIPE_PAID_ACCOUNT_STATUS } from "../data/types";
import { createProdJobDeps, listEnabledAccounts, type EquipeJobDeps, type JobStep } from "./shared";

type WorkEvent = EquipeTaskEvent;

export function createAgentWorkOutboxHandler(deps: EquipeJobDeps & { authorizeLocalLearning?: LocalLearningAuthorizationPort }, ledger?: Pick<LedgerStore, "settleExpiredReservations">) {
  return async ({ step }: { step: JobStep & { sendEvent: (id: string, event: WorkEvent) => Promise<unknown> } }) => {
    const accounts = await step.run("list-enabled-accounts", () => listEnabledAccounts(deps));
    let emitted = 0;
    if (ledger) await step.run("settle-expired-reservations", () => ledger.settleExpiredReservations(deps.clock.now()));
    // shortcut: scans committed account requests for the pilot, use an indexed cursor when event volume grows.
    // Free accounts cannot request adjustments; closed accounts may still have committed evidence to consume.
    const learningAccounts = await step.run("list-learning-accounts", () => deps.uow.internal.listAccounts({ statuses: [...EQUIPE_PAID_ACCOUNT_STATUS, "closed"] }));
    for (const account of learningAccounts) {
      const scope = { workspaceId: account.workspaceId, accountId: account.id };
      const requests = await step.run(`learning-requests-${account.id}`, () => deps.uow.repos.events.list(scope, { eventType: AGENT_WORK_REQUESTED_EVENT }));
      for (const source of requests) {
        if ((source.payload as { kind?: string } | null)?.kind !== "adjustment") continue;
        try {
          await step.run(`learning-adjustment-${source.id}`, () => consumeAdjustmentEvidence({
            uow: deps.uow, authorize: deps.authorizeLocalLearning,
          }, scope, source.id));
        } catch {
          logger.error("[equipe-task-outbox] adjustment evidence failed", { sourceEventId: source.id });
        }
      }
    }
    // ponytail: reads the indexed pending queue; add keyset batches if queue volume grows.
    // Free accounts are visited only through explicit task intents.
    const intents = await step.run("pending-task-intents", () => deps.uow.internal.listPendingTaskIntents());
    for (const intent of intents) {
      try {
        const sent = await dispatchTaskIntent(deps.uow.repos, intent,
          (event) => step.sendEvent(`task-${intent.id}`, event), deps.clock.now());
        if (sent) emitted += 1;
      } catch {
        logger.error("[equipe-task-outbox] dispatch failed", { taskIntentId: intent.id });
      }
    }
    for (const account of accounts) {
      const scope = { workspaceId: account.workspaceId, accountId: account.accountId };
      const pending = await step.run(`pending-${account.accountId}`, () => pendingAgentWork(deps.uow.repos, scope));
      for (const source of pending) {
        // Inngest dedupes by id, so re-sweeps of a stalled queue add no events.
        // A deferral bumps the generation, so a resume gets a fresh id; the
        // persisted claim remains the idempotency guard.
        await step.sendEvent(`emit-${source.id}`, { id: `${source.id}:${source.generation}`, name: EQUIPE_AGENT_WORK_EVENT,
          data: { ...scope, sourceEventId: source.id, kind: String((source.payload as { kind?: string })?.kind ?? "unknown") } });
        emitted += 1;
      }
    }
    return { emitted };
  };
}

export const equipeAgentWorkOutboxJob = inngest.createFunction({
  id: "equipe-agent-work-outbox", triggers: [{ cron: "* * * * *" }], concurrency: [{ limit: 1 }],
}, createAgentWorkOutboxHandler(createProdJobDeps(), new DrizzleLedgerStore(db)));
