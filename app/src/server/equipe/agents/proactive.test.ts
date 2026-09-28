// Proactive Equipe messages (#551): written to the main thread.

import { describe, expect, it } from "vitest";
import { executeCommand } from "../module/commands";
import { deliverTestBatch, setup } from "../module/testing/items";
import { postProactiveMessage } from "./proactive";
import { uuid } from "../module/testing/deps";
import type { ConversationPostInput, EquipeConversationWriter } from "./chat-turn";

class RecordingWriter implements EquipeConversationWriter {
  readonly posts: ConversationPostInput[] = [];

  async post(input: ConversationPostInput): Promise<{ id: string }> {
    this.posts.push(input);
    return { id: `msg-${this.posts.length}` };
  }
}

describe("postProactiveMessage", () => {
  it("posts batch-ready as a card on the main thread", async () => {
    const { t, ids } = await setup();
    const delivered = await deliverTestBatch(t, ids, { title: "Lote pronto" });
    const assistantThreadId = uuid();
    const ensured = await executeCommand(
      t.deps,
      { actor: ids.actors.agent, workspaceId: ids.workspaceId, accountId: ids.accountId },
      { type: "ensure_primary_thread", payload: { assistantThreadId } },
    );
    expect(ensured.ok).toBe(true);
    const messages = new RecordingWriter();

    const result = await postProactiveMessage({
      deps: t.deps,
      messages,
      workspaceId: ids.workspaceId,
      accountId: ids.accountId,
      message: { kind: "batch_ready", batchId: delivered.batchId },
    });

    expect(result).toEqual({ messageId: "msg-1", threadId: assistantThreadId });
    expect(messages.posts).toHaveLength(1);
    expect(messages.posts[0]).toMatchObject({
      threadId: assistantThreadId,
      type: "equipe_card",
      payload: { kind: "batch", batchId: delivered.batchId },
    });
  });

  it("posts reminders and staff calls as events with the module actor", async () => {
    const { t, ids } = await setup();
    const assistantThreadId = uuid();
    await executeCommand(
      t.deps,
      { actor: ids.actors.agent, workspaceId: ids.workspaceId, accountId: ids.accountId },
      { type: "ensure_primary_thread", payload: { assistantThreadId } },
    );
    const messages = new RecordingWriter();

    await postProactiveMessage({
      deps: t.deps,
      messages,
      workspaceId: ids.workspaceId,
      accountId: ids.accountId,
      message: { kind: "reminder", text: "O lote vence amanhã às 17h." },
    });
    await postProactiveMessage({
      deps: t.deps,
      messages,
      workspaceId: ids.workspaceId,
      accountId: ids.accountId,
      message: { kind: "staff_called", staffName: "Bruna" },
    });

    expect(messages.posts).toHaveLength(2);
    expect(messages.posts[0]).toMatchObject({
      type: "equipe_event",
      content: "O lote vence amanhã às 17h.",
      payload: { kind: "reminder", actor: "system" },
    });
    expect(messages.posts[1]).toMatchObject({
      type: "equipe_event",
      payload: { kind: "staff_called", actor: "agent", actorName: "Bruna" },
    });
    expect(messages.posts[1]?.content).toContain("Bruna");
  });

  it("skips accounts without a primary thread", async () => {
    const { t, ids } = await setup();
    const messages = new RecordingWriter();

    const result = await postProactiveMessage({
      deps: t.deps,
      messages,
      workspaceId: ids.workspaceId,
      accountId: ids.accountId,
      message: { kind: "reminder", text: "Oi" },
    });

    expect(result).toBeNull();
    expect(messages.posts).toHaveLength(0);
  });
});
