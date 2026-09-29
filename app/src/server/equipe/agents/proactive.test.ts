// Proactive replay shares the same idempotent event projection as commands.

import { describe, expect, it } from "vitest";
import { executeCommand } from "../module/commands";
import { getEquipeThreads } from "../module/threads";
import { deliverTestBatch, setup } from "../module/testing/items";
import { postProactiveMessage } from "./proactive";

describe("postProactiveMessage", () => {
  it("replays a batch event into the primary conversation once", async () => {
    const { t, ids } = await setup();
    const delivered = await deliverTestBatch(t, ids, { title: "Lote pronto" });
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const event = (await t.deps.uow.repos.events.list(scope, { eventType: "batch.delivered" }))[0]!;
    const view = await getEquipeThreads(t.deps.uow.repos, ids.workspaceId, ids.accountId);

    const first = await postProactiveMessage({ ...scope, deps: t.deps, sourceEventId: event.id });
    const replay = await postProactiveMessage({ ...scope, deps: t.deps, sourceEventId: event.id });

    expect(first).toEqual({ messageId: event.id, threadId: view?.primary?.assistantThreadId });
    expect(replay).toEqual(first);
    expect(t.store.assistantMessages.rows.get(event.id)).toMatchObject({
      id: event.id,
      threadId: view?.primary?.assistantThreadId,
      type: "equipe_card",
      payload: { kind: "batch", batchId: delivered.batchId },
    });
    expect(t.store.assistantMessages.rows.size).toBe(1);
  });

  it("projects staff messages written through the module command", async () => {
    const { t, ids } = await setup();
    const context = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const request = await executeCommand(t.deps, { actor: ids.actors.approver, ...context }, {
      type: "request_support", payload: { note: "Preciso de ajuda" },
    });
    expect(request.ok).toBe(true);
    if (!request.ok) return;
    const exceptionId = request.value.data.exceptionId as string;
    const posted = await executeCommand(t.deps, { actor: ids.actors.support, ...context }, {
      type: "post_staff_message", payload: { exceptionId, body: "Vou ajudar com isso." },
    });
    expect(posted.ok).toBe(true);
    if (!posted.ok) return;
    const eventId = posted.value.data.messageEventId as string;
    const message = t.store.assistantMessages.rows.get(eventId);

    expect(message).toMatchObject({
      id: eventId,
      type: "staff_message",
      content: "Vou ajudar com isso.",
      payload: { staffId: ids.actors.support.kind === "staff" ? ids.actors.support.staffId : "", name: "support" },
    });
  });
});
