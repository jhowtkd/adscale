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
        // Stable Inngest id + persisted claim: both redelivery windows are covered.
        await step.sendEvent(`emit-${source.id}`, { id: source.id, name: EQUIPE_AGENT_WORK_EVENT,
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
