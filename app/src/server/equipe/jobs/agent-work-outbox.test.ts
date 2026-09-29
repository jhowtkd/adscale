import { describe, expect, it } from "vitest";
import { executeCommand } from "../module/commands";
import { ctx, deliverTestBatch, setup } from "../module/testing/items";
import { createAgentWorkOutboxHandler } from "./agent-work-outbox";

describe("agent work outbox", () => {
  it("emits a stable event from the persisted UI command", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids);
    const edited = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption", payload: { itemId: itemIds[0]!, caption: "Legenda nova" },
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const source = edited.value.events.find((event) => event.eventType === "agent_work.requested")!;
    const sent: Array<{ id: string; name: string; data: unknown }> = [];
    const handler = createAgentWorkOutboxHandler({
      uow: t.deps.uow,
      clock: t.deps.clock,
      isEnabledForWorkspace: () => true,
      gatewayFor: () => t.gateway,
    });
    const step = {
      run: async <T>(_name: string, fn: () => Promise<T>) => fn(),
      sendEvent: async (_name: string, event: { id: string; name: string; data: unknown }) => { sent.push(event); },
    };

    const first = await handler({ step });
    const replay = await handler({ step });

    expect(first).toEqual({ emitted: 1 });
    expect(replay).toEqual(first);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual({
      id: source.id,
      name: "equipe.agent.work",
      data: { workspaceId: ids.workspaceId, accountId: ids.accountId, sourceEventId: source.id, kind: "caption_revalidation" },
    });
  });
});
