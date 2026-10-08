import { describe, expect, it, vi } from "vitest";
import { MemoryLedgerStore } from "../agents/ledger";
import { makeTestDeps, uuid, type TestDeps } from "../module/testing/deps";
import { requestTask } from "../module/task-outbox";
import { transact } from "../module/shared";
import { executeCommand } from "../module/commands";
import { ctx, deliverTestBatch, setup } from "../module/testing/items";
import { createAgentWorkOutboxHandler } from "./agent-work-outbox";

describe("agent work outbox", () => {
  it("emits a generation-stable transport id for persisted work", async () => {
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
      id: `${source.id}:0`,
      name: "equipe.agent.work",
      data: { workspaceId: ids.workspaceId, accountId: ids.accountId, sourceEventId: source.id, kind: "caption_revalidation" },
    });
    expect(sent[1]).toEqual(sent[0]);
  });
});

describe("task intent outbox reconciliation", () => {
  const SYSTEM = { kind: "system", job: "free-open" } as const;
  async function freeAccountWithIntent(t: TestDeps, data: Record<string, unknown> = { n: 1 }) {
    const workspaceId = uuid(); const userId = `u-${uuid()}`;
    t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "a@x.com", emailVerified: true, role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
    const opened = await executeCommand(t.deps, { actor: SYSTEM, workspaceId }, { type: "open_free_account", payload: { userId } });
    if (!opened.ok) throw new Error(opened.error.code);
    const accountId = opened.value.accountId!;
    const tx = await transact(t.deps, { actor: SYSTEM, workspaceId, accountId, type: "ensure_primary_thread" } as never, async (ctx) => {
      await requestTask(ctx, { eventName: "equipe.diag", data });
      return { ok: true, value: null } as never;
    });
    expect(tx.ok).toBe(true);
    const [intent] = await t.deps.uow.repos.taskOutbox.list({ workspaceId, accountId });
    return { workspaceId, accountId, intent: intent! };
  }
  const step = (sent: Array<{ id: string; name: string; data: Record<string, unknown> }>, failIds: string[] = []) => ({
    run: async <T>(_n: string, fn: () => Promise<T>) => fn(),
    sendEvent: async (_n: string, event: { id: string; name: string; data: Record<string, unknown> }) => {
      if (failIds.includes(event.id)) throw new Error("inngest down");
      sent.push(event);
    },
  });
  const handlerFor = (t: TestDeps, ledger?: MemoryLedgerStore) =>
    createAgentWorkOutboxHandler({ uow: t.deps.uow, clock: t.deps.clock, gatewayFor: () => t.gateway }, ledger);

  it("reconciles a pending FREE intent with the same transport id, then stops resending once dispatched", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId, intent } = await freeAccountWithIntent(t);
    const sent: Array<{ id: string; name: string; data: Record<string, unknown> }> = [];
    const handler = handlerFor(t);
    expect(await handler({ step: step(sent) })).toEqual({ emitted: 1 });
    expect(sent).toEqual([{ id: intent.id, name: "equipe.diag",
      data: { n: 1, workspaceId, accountId, taskIntentId: intent.id } }]);
    expect(await handler({ step: step(sent) })).toEqual({ emitted: 0 });
    expect(sent).toHaveLength(1);
  });

  it("a failed send keeps the intent pending; a later run retries it", async () => {
    const t = makeTestDeps();
    const { intent } = await freeAccountWithIntent(t);
    const sent: Array<{ id: string }> = [];
    const handler = handlerFor(t);
    expect(await handler({ step: step(sent as never, [intent.id]) })).toEqual({ emitted: 0 });
    expect(await t.deps.uow.internal.listPendingTaskIntents()).toHaveLength(1);
    expect(await handler({ step: step(sent as never) })).toEqual({ emitted: 1 });
    expect(sent.map((e) => e.id)).toEqual([intent.id]);
  });

  it("one failing intent does not stop the others", async () => {
    const t = makeTestDeps();
    const failing = await freeAccountWithIntent(t);
    const ok = await freeAccountWithIntent(t);
    const sent: Array<{ id: string }> = [];
    const handler = handlerFor(t);
    expect(await handler({ step: step(sent as never, [failing.intent.id]) })).toEqual({ emitted: 1 });
    expect(sent.map((e) => e.id)).toEqual([ok.intent.id]);
    const pending = await t.deps.uow.internal.listPendingTaskIntents();
    expect(pending.map((p) => p.id)).toEqual([failing.intent.id]);
  });

  it("does not sweep free accounts for agent work and never dispatches for suspended/closed accounts", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await freeAccountWithIntent(t);
    await t.deps.uow.repos.accounts.update(workspaceId, accountId, { status: "closed" } as never);
    const sent: unknown[] = [];
    expect(await handlerFor(t)({ step: step(sent as never) })).toEqual({ emitted: 0 });
    expect(sent).toEqual([]);
  });

  it("settles expired free reservations each run when a ledger is supplied", async () => {
    const t = makeTestDeps();
    const ledger = new MemoryLedgerStore();
    const spy = vi.spyOn(ledger, "settleExpiredReservations");
    await handlerFor(t, ledger)({ step: step([]) });
    expect(spy).toHaveBeenCalledWith(t.deps.clock.now());
  });
});
