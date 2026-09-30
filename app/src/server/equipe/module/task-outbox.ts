import type { EquipeRepositories, EquipeTaskIntent } from "../data";
import type { EquipeTaskEvent } from "./ports";
import { appendEvent, scopeOf, type CommandContext } from "./shared";
import { authorizeAccountExecution } from "./execution-authorization";

/** Tickets 04/08 call this inside the command transaction. */
export async function requestTask(ctx: CommandContext, input: { eventName: string; data: Record<string, unknown> }) {
  const event = await appendEvent(ctx, { eventType: "task.requested", payload: input });
  return ctx.repos.taskOutbox.create(scopeOf(ctx), { id: event.id, ...input });
}

export async function dispatchTaskIntent(
  repos: EquipeRepositories, intent: EquipeTaskIntent,
  send: (event: EquipeTaskEvent) => Promise<unknown>, at: Date,
) {
  if (intent.dispatchedAt || !(await authorizeAccountExecution(repos, intent)).ok) return false;
  await send({ id: intent.id, name: intent.eventName,
    data: { ...intent.data, workspaceId: intent.workspaceId, accountId: intent.accountId, taskIntentId: intent.id } });
  await repos.taskOutbox.markDispatched(intent, intent.id, at);
  return true;
}
