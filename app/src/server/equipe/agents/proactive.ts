// Reproject a persisted module event. New commands project in their transaction;
// jobs can replay older events using the same source id without duplicate posts.
import type { EquipeModuleDeps } from "../module/ports";
import { projectConversationEvent } from "../module/conversation-events";

export type PostProactiveMessageInput = {
  deps: EquipeModuleDeps;
  workspaceId: string;
  accountId: string;
  sourceEventId: string;
};

export async function postProactiveMessage(input: PostProactiveMessageInput) {
  return input.deps.uow.run(async (repos, internal) => {
    const scope = { workspaceId: input.workspaceId, accountId: input.accountId };
    const event = await repos.events.get(scope, input.sourceEventId);
    if (!event) throw new Error("unknown_conversation_event");
    return projectConversationEvent({
      ...scope, repos, internal, actor: { kind: "system", job: "conversation-projection" },
      now: input.deps.clock.now(), events: [],
    }, event);
  });
}
