import { inngest } from "@/server/jobs/client";
import { pendingAgentWork } from "../module/agent-work";
import { EQUIPE_AGENT_WORK_EVENT } from "../agents/agent-work";
import { createProdJobDeps, listEnabledAccounts, type EquipeJobDeps, type JobStep } from "./shared";

type WorkEvent = { id: string; name: string; data: { workspaceId: string; accountId: string; sourceEventId: string; kind: string } };

export function createAgentWorkOutboxHandler(deps: EquipeJobDeps) {
  return async ({ step }: { step: JobStep & { sendEvent: (id: string, event: WorkEvent) => Promise<unknown> } }) => {
    const accounts = await step.run("list-enabled-accounts", () => listEnabledAccounts(deps));
    let emitted = 0;
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
}, createAgentWorkOutboxHandler(createProdJobDeps()));
