import type { EquipeRepositories, EquipeTaskIntent } from "../data";
import type { EquipeTaskEvent } from "./ports";
import { appendEvent, scopeOf, type CommandContext } from "./shared";
import { authorizeAccountExecution } from "./execution-authorization";
import { ADJUSTMENT_EVIDENCE_TASK_EVENT } from "./adjustment-evidence";
import { CAPTION_EVIDENCE_TASK_EVENT } from "./caption-evidence";
import { IDEA_REJECTION_EVIDENCE_TASK_EVENT } from "./idea-evidence";

/** Tickets 04/08 call this inside the command transaction. */
export async function requestTask(ctx: CommandContext, input: { eventName: string; data: Record<string, unknown> }) {
  const event = await appendEvent(ctx, { eventType: "task.requested", payload: input });
  return ctx.repos.taskOutbox.create(scopeOf(ctx), { id: event.id, ...input });
}

export async function dispatchTaskIntent(
  repos: EquipeRepositories, intent: EquipeTaskIntent,
  send: (event: EquipeTaskEvent) => Promise<unknown>, at: Date,
) {
  if (intent.dispatchedAt) return false;
  // Local evidence consumes a committed decision, not production; suspension or closure does not cancel it.
  if (
    intent.eventName === ADJUSTMENT_EVIDENCE_TASK_EVENT ||
    intent.eventName === CAPTION_EVIDENCE_TASK_EVENT ||
    intent.eventName === IDEA_REJECTION_EVIDENCE_TASK_EVENT
  ) {
    if (!await repos.accounts.get(intent.workspaceId, intent.accountId)) return false;
  } else if (!(await authorizeAccountExecution(repos, intent)).ok) return false;
  await send({ id: intent.id, name: intent.eventName,
    data: { ...intent.data, workspaceId: intent.workspaceId, accountId: intent.accountId, taskIntentId: intent.id } });
  await repos.taskOutbox.markDispatched(intent, intent.id, at);
  return true;
}
