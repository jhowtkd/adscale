import { describe, expect, it } from "vitest";
import type { EquipeUnitOfWork } from "../data";
import { executeCommand } from "./commands";
import { getItemDetail } from "./queries";
import { ctx, deliverTestBatch, seedWork, setup, versionHashOf } from "./testing/items";
import { approveTestItem, encryptedInstagramToken, seedInstagramConnection } from "./testing/publication";
import { createAgentWorkHandler } from "../agents/agent-work";
import { createEquipeAgents } from "../agents/runner";
import { FakeModelClient } from "../agents/testing";
import { MemoryLedgerStore } from "../agents/ledger";
import { uuid } from "./testing/deps";

// Fixed clock: 2026-10-05T14:00:00Z. The item limit is scheduled − 2 h.
const PAST_LIMIT = new Date("2026-10-05T15:00:00.000Z");
const FUTURE = new Date("2026-10-09T12:00:00.000Z");

/** Wrap a uow counting every event-log read inside command transactions. */
function countingEventReads(uow: EquipeUnitOfWork, counter: { reads: number }): EquipeUnitOfWork {
  return {
    ...uow,
    run: (fn) =>
      uow.run(async (repos, internal) => {
        const list = repos.events.list.bind(repos.events);
        return fn(
          {
            ...repos,
            events: {
              ...repos.events,
              list: ((...args: Parameters<typeof list>) => {
                counter.reads += 1;
                return list(...args);
              }) as typeof list,
            },
          },
          internal,
        );
      }),
  };
}

describe("expire_item_deadline", () => {
  it("moves undecided items past the limit to 'perdeu a janela'", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds } = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: PAST_LIMIT }],
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "expire_item_deadline",
      payload: { itemId: itemIds[0]! },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ expired: true });
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "item.window_missed",
      "agent_work.requested",
      "notification.requested",
    ]);
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("missed_window");
    // Silence never approves: no receipt, no intent.
    expect(await t.deps.uow.repos.receipts.list(scope)).toHaveLength(0);
    expect(await t.deps.uow.repos.intents.list(scope)).toHaveLength(0);
  });

  it("expires adjusting items too, but never approves decided ones", async () => {
    const { t, ids } = await setup();
    await seedInstagramConnection(t, ids);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: PAST_LIMIT }, { scheduledFor: FUTURE }],
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "request_adjustment",
      payload: { itemId: itemIds[0]!, category: "fact" },
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: itemIds[1]!, expectedVersionHash: versionHashes[1]! },
    });
    const adjusting = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "expire_item_deadline",
      payload: { itemId: itemIds[0]! },
    });
    expect(adjusting.ok).toBe(true);
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("missed_window");

    const decided = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "expire_item_deadline",
      payload: { itemId: itemIds[1]! },
    });
    expect(decided.ok).toBe(true);
    if (!decided.ok) return;
    expect(decided.value.data).toMatchObject({ expired: false, status: "scheduled" });
    expect(decided.value.events).toHaveLength(0);
    const receipts = await t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[1]!);
    expect(receipts).toHaveLength(1);
  });

  it("refuses to expire before the limit and from non-system actors", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids, { items: [{ scheduledFor: FUTURE }] });
    const early = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "expire_item_deadline",
      payload: { itemId: itemIds[0]! },
    });
    expect(early.ok).toBe(false);
    if (early.ok) return;
    expect(early.error.code).toBe("deadline_not_reached");
    const forbidden = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "expire_item_deadline",
      payload: { itemId: itemIds[0]! },
    });
    expect(forbidden.ok).toBe(false);
    if (forbidden.ok) return;
    expect(forbidden.error.code).toBe("forbidden_actor");
  });
});

describe("propose_new_schedule", () => {
  it("brings a missed item back to decision with a new version and time", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: PAST_LIMIT }],
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "expire_item_deadline",
      payload: { itemId: itemIds[0]! },
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "propose_new_schedule",
      payload: { itemId: itemIds[0]!, scheduledFor: FUTURE },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const versionHash = outcome.value.data.versionHash as string;
    expect(versionHash).not.toBe(versionHashes[0]);
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "item.rescheduled",
      "notification.requested",
    ]);
    const item = await t.deps.uow.repos.items.get(scope, itemIds[0]!);
    expect(item).toMatchObject({
      status: "awaiting_approval",
      currentVersionHash: versionHash,
      scheduledFor: FUTURE,
      deadlineAt: new Date("2026-10-09T10:00:00.000Z"),
    });

    // The client approves the item at the new time; the receipt pins it.
    const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: itemIds[0]!, expectedVersionHash: versionHash },
    });
    expect(approved.ok).toBe(true);
    const receipts = await t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[0]!);
    expect(receipts[0]?.objectVersion).toBe(versionHash);
  });

  it("revalidates a caption when the deadline expires during review", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds } = await deliverTestBatch(t, ids, { items: [{ scheduledFor: PAST_LIMIT }] });
    const edit = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption", payload: { itemId: itemIds[0]!, caption: "Legenda em revisão" },
    });
    expect(edit.ok).toBe(true);
    if (!edit.ok) return;
    await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "expire_item_deadline", payload: { itemId: itemIds[0]! },
    });
    const rescheduled = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "propose_new_schedule", payload: { itemId: itemIds[0]!, scheduledFor: FUTURE },
    });
    expect(rescheduled.ok).toBe(true);
    if (!rescheduled.ok) return;
    const versionHash = rescheduled.value.data.versionHash as string;
    const request = rescheduled.value.events.find((event) => event.eventType === "agent_work.requested");
    expect(request?.payload).toMatchObject({ kind: "caption_revalidation", versionHash });
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("adjusting");

    const claimed = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "claim_agent_work", payload: { sourceEventId: request!.id, runId: "reschedule-review" },
    });
    expect(claimed.ok).toBe(true);
    const completed = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "complete_agent_work", payload: {
        sourceEventId: request!.id, runId: "reschedule-review",
        output: { findings: [], summary: "Revisão da versão remarcada.", natures: ["none"] },
      },
    });
    expect(completed.ok).toBe(true);
    const detail = await getItemDetail(t.deps.uow.repos, ids.workspaceId, ids.accountId, itemIds[0]!);
    expect(detail?.review.status).toBe("ready");
    expect(detail?.triage.some((event) => (event.payload as { versionHash?: string }).versionHash === versionHash)).toBe(true);
  });

  it("keeps visual adjustment pending across deadline and reschedule until a new piece is reviewed", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const original = seedWork(t, ids.workspaceId);
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{ workId: original.workId, outputId: original.outputId, scheduledFor: PAST_LIMIT }],
    });
    const requested = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "request_adjustment", payload: { itemId: itemIds[0]!, category: "visual", note: "Trocar a direção visual" },
    });
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;
    const visualWork = requested.value.events.find((event) => event.eventType === "agent_work.requested")!;
    const humanRuntime = {
      depsFor: () => t.deps,
      agentsFor: () => ({ runTask: async () => { throw new Error("visual adjustment must wait for a new Peça"); } }),
      isEnabled: () => true,
    };
    const handleHumanWork = createAgentWorkHandler(humanRuntime);
    await handleHumanWork({
      event: { id: visualWork.id, data: { workspaceId: ids.workspaceId, accountId: ids.accountId, kind: "adjustment", sourceEventId: visualWork.id } },
      step: { run: (_name, fn) => fn() }, runId: "visual-human-work",
    });
    const exception = (await t.deps.uow.repos.exceptions.list(scope))[0];
    expect(exception).toMatchObject({ trigger: "production_fix", status: "open" });
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("adjusting");

    await executeCommand(t.deps, ctx(ids, ids.actors.system), { type: "expire_item_deadline", payload: { itemId: itemIds[0]! } });
    const rescheduled = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "propose_new_schedule", payload: { itemId: itemIds[0]!, scheduledFor: FUTURE },
    });
    expect(rescheduled.ok).toBe(true);
    if (!rescheduled.ok) return;
    const scheduledHash = rescheduled.value.data.versionHash as string;
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("adjusting");
    expect(await t.deps.uow.repos.exceptions.get(scope, exception!.id)).toMatchObject({ status: "open" });
    expect(await t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[0]!)).toHaveLength(0);
    const carriedAdjustment = rescheduled.value.events.find((event) => event.eventType === "agent_work.requested")!;
    expect(carriedAdjustment.payload).toMatchObject({ kind: "adjustment", category: "visual", versionHash: scheduledHash });
    await handleHumanWork({
      event: { id: carriedAdjustment.id, data: { workspaceId: ids.workspaceId, accountId: ids.accountId, kind: "adjustment", sourceEventId: carriedAdjustment.id } },
      step: { run: (_name, fn) => fn() }, runId: "visual-human-work-rescheduled",
    });
    expect(await t.deps.uow.repos.exceptions.list(scope)).toHaveLength(1);

    const replacementOutput = uuid();
    t.gateway.addOutput({ id: replacementOutput, workspaceId: ids.workspaceId, workId: original.workId, imageUrl: "https://cdn.example.test/replacement.png" });
    const submitted = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "submit_item_version", payload: { itemId: itemIds[0]!, expectedVersionHash: scheduledHash, caption: "Legenda revisada", creativeWorkOutputId: replacementOutput },
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    const reviewRequest = submitted.value.events.find((event) => event.eventType === "agent_work.requested")!;
    expect(reviewRequest.payload).toMatchObject({ kind: "caption_revalidation", reviewVisual: true });
    const client = new FakeModelClient([
      { content: JSON.stringify({ findings: [], summary: "Texto correto.", natures: ["none"] }) },
      { content: JSON.stringify({ findings: [{ severity: "warning", area: "visual", message: "Aguardando validação humana", suggestion: null }], summary: "Verificação visual completa." }) },
    ]);
    const agents = createEquipeAgents({ moduleDeps: t.deps, client, ledger: new MemoryLedgerStore() });
    await createAgentWorkHandler({ depsFor: () => t.deps, agentsFor: () => agents, isEnabled: () => true })({
      event: { id: reviewRequest.id, data: { workspaceId: ids.workspaceId, accountId: ids.accountId, kind: "review_caption", sourceEventId: reviewRequest.id } },
      step: { run: (_name, fn) => fn() }, runId: "review-replacement-piece",
    });
    const detail = await getItemDetail(t.deps.uow.repos, ids.workspaceId, ids.accountId, itemIds[0]!);
    expect(client.requests).toHaveLength(2);
    expect(detail?.versions.find((version) => version.versionHash === submitted.value.data.versionHash)?.creativeWorkOutputId).toBe(replacementOutput);
    expect(detail?.review.status).toBe("edit_with_warning");
    expect(await t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[0]!)).toHaveLength(0);
    expect(versionHashes[0]).not.toBe(scheduledHash);
  });

  it("rejects past times, undecided items and client proposers", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: PAST_LIMIT }],
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "expire_item_deadline",
      payload: { itemId: itemIds[0]! },
    });
    const past = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "propose_new_schedule",
      payload: { itemId: itemIds[0]!, scheduledFor: new Date("2026-10-01T12:00:00.000Z") },
    });
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.error.code).toBe("invalid_schedule");

    const fresh = await deliverTestBatch(t, ids, { items: [{ scheduledFor: FUTURE }] });
    const undecided = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "propose_new_schedule",
      payload: { itemId: fresh.itemIds[0]!, scheduledFor: FUTURE },
    });
    expect(undecided.ok).toBe(false);
    if (!undecided.ok) expect(undecided.error.code).toBe("invalid_transition");

    const forbidden = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "propose_new_schedule",
      payload: { itemId: itemIds[0]!, scheduledFor: FUTURE },
    });
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.error.code).toBe("forbidden_actor");
  });

  it("keeps the stored destination across an edit and reschedule while preserving review state", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds } = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: PAST_LIMIT, destinationAccount: "instagram:@brand" }],
    });
    const counter = { reads: 0 };
    const deps = { ...t.deps, uow: countingEventReads(t.deps.uow, counter) };

    const edited = await executeCommand(deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption",
      payload: { itemId: itemIds[0]!, caption: "legenda nova" },
    });
    expect(edited.ok).toBe(true);
    await executeCommand(deps, ctx(ids, ids.actors.system), {
      type: "expire_item_deadline",
      payload: { itemId: itemIds[0]! },
    });
    const outcome = await executeCommand(deps, ctx(ids, ids.actors.agent), {
      type: "propose_new_schedule",
      payload: { itemId: itemIds[0]!, scheduledFor: FUTURE },
    });
    expect(outcome.ok).toBe(true);
    expect(counter.reads).toBeGreaterThan(0);

    const item = await t.deps.uow.repos.items.get(scope, itemIds[0]!);
    expect(item?.destination).toBe("instagram:@brand");
    const versions = await t.deps.uow.repos.itemVersions.list(scope, { itemId: itemIds[0]! });
    expect(versions).toHaveLength(3);
    expect(versions.every((v) => v.destination === "instagram:@brand")).toBe(true);
    // The rescheduled hash covers the edited caption + stored destination + new time.
    const current = versions.find((v) => v.versionHash === item?.currentVersionHash);
    expect(outcome.value.data).toMatchObject({
      versionHash: versionHashOf({
        output: current!.creativeWorkOutputId!,
        caption: "legenda nova",
        destination: "instagram:@brand",
        scheduledFor: FUTURE,
      }),
    });
  });

  it("rebinds a destination-held item only into a new hash that needs approval", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    await seedInstagramConnection(t, ids);
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: FUTURE, destinationAccount: "instagram:@brand" }],
    });
    await approveTestItem(t, ids, itemIds[0]!, versionHashes[0]!);
    const oldIntent = await t.deps.uow.repos.intents.getByItemVersion(scope, itemIds[0]!, versionHashes[0]!);
    expect(oldIntent?.destinationIgUserId).toBe("ig_test_brand");

    await executeCommand(t.deps, ctx(ids, ids.actors.custodian), {
      type: "complete_instagram_connect",
      payload: { encryptedToken: encryptedInstagramToken("ig_reconnected", "newbrand") },
    });
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("held");
    const newTime = new Date("2026-10-09T13:00:00.000Z");
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "propose_new_schedule",
      payload: { itemId: itemIds[0]!, scheduledFor: newTime },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const nextHash = outcome.value.data.versionHash as string;
    expect(nextHash).not.toBe(versionHashes[0]);
    const current = await t.deps.uow.repos.itemVersions.getByHash(scope, itemIds[0]!, nextHash);
    expect(current).toMatchObject({
      destination: "instagram:@newbrand", destinationIgUserId: "ig_reconnected", scheduledFor: newTime,
    });
    expect(nextHash).toBe(versionHashOf({
      output: current!.creativeWorkOutputId!, caption: current!.caption,
      destination: "instagram:@newbrand", destinationIgUserId: "ig_reconnected", scheduledFor: newTime,
    }));
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("awaiting_approval");
    const receipts = await t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[0]!);
    expect(receipts.some((receipt) => receipt.objectVersion === nextHash)).toBe(false);
  });

  it("does not use rescheduling to release an item held for another reason", async () => {
    const { t, ids } = await setup();
    await seedInstagramConnection(t, ids);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, { items: [{ scheduledFor: FUTURE }] });
    await approveTestItem(t, ids, itemIds[0]!, versionHashes[0]!);
    const intent = await t.deps.uow.repos.intents.getByItemVersion(scope, itemIds[0]!, versionHashes[0]!);
    await t.deps.uow.repos.items.update(scope, itemIds[0]!, { status: "held" });
    await t.deps.uow.repos.intents.update(scope, intent!.id, { status: "held", lastError: "global_stop" });
    const result = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "propose_new_schedule", payload: { itemId: itemIds[0]!, scheduledFor: new Date("2026-10-09T13:00:00.000Z") },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_transition");
    expect(await t.deps.uow.repos.itemVersions.list(scope, { itemId: itemIds[0]! })).toHaveLength(1);
  });

  it("returns no_change when the pinned identity and all version content are unchanged", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    await seedInstagramConnection(t, ids);
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: FUTURE, destinationAccount: "instagram:@brand" }],
    });
    await approveTestItem(t, ids, itemIds[0]!, versionHashes[0]!);
    const intent = await t.deps.uow.repos.intents.getByItemVersion(scope, itemIds[0]!, versionHashes[0]!);
    await t.deps.uow.repos.items.update(scope, itemIds[0]!, { status: "held" });
    await t.deps.uow.repos.intents.update(scope, intent!.id, {
      status: "held", lastError: "instagram_destination_changed",
    });
    const result = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "propose_new_schedule", payload: { itemId: itemIds[0]!, scheduledFor: FUTURE },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("no_change");
    expect(await t.deps.uow.repos.itemVersions.list(scope, { itemId: itemIds[0]! })).toHaveLength(1);
  });
});
