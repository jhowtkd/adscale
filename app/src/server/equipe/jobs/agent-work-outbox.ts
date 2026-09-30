import { logger } from "@/lib/logger";
import { db } from "@/server/db";
import { dispatchTaskIntent } from "../module/task-outbox";
import type { EquipeTaskEvent } from "../module/ports";
import { DrizzleLedgerStore, type LedgerStore } from "../agents/ledger";
import { inngest } from "@/server/jobs/client";
import { pendingAgentWork } from "../module/agent-work";
import { EQUIPE_AGENT_WORK_EVENT } from "../agents/agent-work";
import { createProdJobDeps, listEnabledAccounts, type EquipeJobDeps, type JobStep } from "./shared";

type WorkEvent = EquipeTaskEvent;

export function createAgentWorkOutboxHandler(deps: EquipeJobDeps, ledger?: Pick<LedgerStore, "settleExpiredReservations">) {
  return async ({ step }: { step: JobStep & { sendEvent: (id: string, event: WorkEvent) => Promise<unknown> } }) => {
    const accounts = await step.run("list-enabled-accounts", () => listEnabledAccounts(deps));
    let emitted = 0;
    if (ledger) await step.run("settle-expired-reservations", () => ledger.settleExpiredReservations(deps.clock.now()));
    // ponytail: reads the indexed pending queue; add keyset batches if queue volume grows.
    // Free accounts are visited only through explicit task intents.
    const intents = await step.run("pending-task-intents", () => deps.uow.internal.listPendingTaskIntents());
    for (const intent of intents) {
      if (!deps.isEnabledForWorkspace(intent.workspaceId)) continue;
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
