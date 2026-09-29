import { seedInstagramConnection } from "./testing/publication";
import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { getItemDetail } from "./queries";
import { ctx, deliverTestBatch, frontIdOf, setup } from "./testing/items";

async function reviewOf(t: Parameters<typeof deliverTestBatch>[0], ids: Parameters<typeof ctx>[0], itemId: string) {
  const detail = await getItemDetail(t.deps.uow.repos, ids.workspaceId, ids.accountId, itemId);
  return detail?.review.status;
}

describe("request_adjustment", () => {
  it("requests a categorized adjustment and asks the IA for a new version", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds } = await deliverTestBatch(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "request_adjustment",
      payload: { itemId: itemIds[0]!, category: "brand", note: "tom muito formal" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "item.adjustment_requested",
      "agent_work.requested",
      "notification.requested",
    ]);
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("adjusting");
    const requested = outcome.value.events[0];
    expect(requested?.payload).toMatchObject({ category: "brand", note: "tom muito formal" });
  });

  it("refuses adjustment on decided items and from members", async () => {
    const { t, ids } = await setup();
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    });
    expect(approved.ok).toBe(true);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "request_adjustment",
      payload: { itemId: itemIds[0]!, category: "visual" },
    });
    expect(outcome.ok).toBe(false);
    const forbidden = await executeCommand(t.deps, ctx(ids, ids.actors.member), {
      type: "request_adjustment",
      payload: { itemId: itemIds[1]!, category: "visual" },
    });
    expect(forbidden.ok).toBe(false);
    if (forbidden.ok) return;
    expect(forbidden.error.code).toBe("forbidden_actor");
  });
});

describe("edit_caption", () => {
  it("creates a new immutable version and goes to 'editado por você · em revisão'", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption",
      payload: { itemId: itemIds[0]!, caption: "legenda editada" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const versionHash = outcome.value.data.versionHash as string;
    expect(versionHash).not.toBe(versionHashes[0]);
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "caption.edited",
      "agent_work.requested",
      "notification.requested",
    ]);

    const versions = await t.deps.uow.repos.itemVersions.list(scope, { itemId: itemIds[0]! });
    expect(versions).toHaveLength(2);
    expect(versions.find((v) => v.versionHash === versionHashes[0])?.caption).toBe("legenda 1");
    const edited = versions.find((v) => v.versionHash === versionHash);
    expect(edited).toMatchObject({
      caption: "legenda editada",
      authorRole: "client_person",
      scheduledFor: new Date("2026-10-09T12:00:00.000Z"),
    });
    const item = await t.deps.uow.repos.items.get(scope, itemIds[0]!);
    expect(item).toMatchObject({ status: "adjusting", currentVersionHash: versionHash });
    expect(await reviewOf(t, ids, itemIds[0]!)).toBe("edited_in_review");
  });

  it("editing a scheduled item supersedes the approval and voids its intent", async () => {
    const { t, ids } = await setup();
    await seedInstagramConnection(t, ids);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    });
    expect(approved.ok).toBe(true);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption",
      payload: { itemId: itemIds[0]!, caption: "mudou tudo" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const intent = await t.deps.uow.repos.intents.getByItemVersion(
      scope,
      itemIds[0]!,
      versionHashes[0]!,
    );
    expect(intent?.status).toBe("canceled");
    expect(outcome.value.data).toMatchObject({ voidedIntentId: intent?.id });
    expect(outcome.value.events[0]?.payload).toMatchObject({
      supersededVersion: versionHashes[0],
    });
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("adjusting");
  });

  it("rejects an unchanged caption", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption",
      payload: { itemId: itemIds[0]!, caption: "legenda 1" },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("no_change");
  });
});

describe("record_caption_triage", () => {
  it("routes a permanent fact to 'confirmar como fato do negócio'", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds } = await deliverTestBatch(t, ids);
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption",
      payload: { itemId: itemIds[0]!, caption: "abrimos às 9h" },
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "record_caption_triage",
      payload: { itemId: itemIds[0]!, natures: ["permanent_fact"] },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({
      path: "confirm_as_business_fact",
      matched: "permanent_fact",
      backToDecision: true,
    });
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("awaiting_approval");
    expect(await reviewOf(t, ids, itemIds[0]!)).toBe("needs_confirmation");
  });

  it("blocks a commercial condition with a pointer to the offer catalog", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids);
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption",
      payload: { itemId: itemIds[0]!, caption: "frete grátis até 30/11" },
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "record_caption_triage",
      payload: { itemId: itemIds[0]!, natures: ["commercial_condition"] },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ path: "update_catalog_only" });
    expect(outcome.value.events[0]?.payload).toMatchObject({
      catalogPointer: { kind: "offer_catalog" },
    });
    expect(await reviewOf(t, ids, itemIds[0]!)).toBe("blocked");
  });

  it("blocks a regulated claim and requests escalation for quality", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids);
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption",
      payload: { itemId: itemIds[0]!, caption: "garantimos resultado" },
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "record_caption_triage",
      payload: { itemId: itemIds[0]!, natures: ["permanent_fact", "regulated_claim"] },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // Most severe nature wins.
    expect(outcome.value.data).toMatchObject({
      path: "block_and_escalate",
      matched: "regulated_claim",
    });
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "caption.triaged",
      "escalation.requested",
      "notification.requested",
    ]);
    expect(outcome.value.events[1]?.payload).toMatchObject({
      reason: "regulated_claim",
      ownerRole: "quality",
    });
    expect(await reviewOf(t, ids, itemIds[0]!)).toBe("blocked");
  });

  it("returns plain edits to ready, warnings to 'edição com aviso'", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids);
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption",
      payload: { itemId: itemIds[0]!, caption: "só estilo" },
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption",
      payload: { itemId: itemIds[1]!, caption: "quase lá" },
    });
    const plain = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "record_caption_triage",
      payload: { itemId: itemIds[0]!, natures: ["none"] },
    });
    expect(plain.ok).toBe(true);
    const warned = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "record_caption_triage",
      payload: { itemId: itemIds[1]!, natures: [], warnings: ["voz fora do guia"] },
    });
    expect(warned.ok).toBe(true);
    expect(await reviewOf(t, ids, itemIds[0]!)).toBe("ready");
    expect(await reviewOf(t, ids, itemIds[1]!)).toBe("edit_with_warning");
  });

  it("during calibration the version needs the quality re-check again", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const frontId = await frontIdOf(t, ids, "social_instagram");
    await t.deps.uow.repos.fronts.update(scope, frontId, { status: "calibrating" });
    const { itemIds } = await deliverTestBatch(t, ids);
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption",
      payload: { itemId: itemIds[0]!, caption: "edição calibrada" },
    });
    const first = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "record_caption_triage",
      payload: { itemId: itemIds[0]!, natures: ["none"] },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.data).toMatchObject({ backToDecision: false });
    expect(first.value.events[0]?.payload).toMatchObject({ qualityRecheck: "pending" });
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("adjusting");
    expect(await reviewOf(t, ids, itemIds[0]!)).toBe("edited_in_review");

    const second = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "record_caption_triage",
      payload: { itemId: itemIds[0]!, natures: ["none"], qualityRecheckPassed: true },
    });
    expect(second.ok).toBe(true);
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("awaiting_approval");
    expect(await reviewOf(t, ids, itemIds[0]!)).toBe("ready");
  });

  it("triage is agent-only and needs an item awaiting triage", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids);
    const forbidden = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "record_caption_triage",
      payload: { itemId: itemIds[0]!, natures: ["none"] },
    });
    expect(forbidden.ok).toBe(false);
    if (forbidden.ok) return;
    expect(forbidden.error.code).toBe("forbidden_actor");
    const early = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "record_caption_triage",
      payload: { itemId: itemIds[0]!, natures: ["none"] },
    });
    expect(early.ok).toBe(false);
    if (early.ok) return;
    expect(early.error.code).toBe("invalid_transition");
    // An adjustment request stores `adjusting` too but never awaits triage.
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "request_adjustment",
      payload: { itemId: itemIds[1]!, category: "fact" },
    });
    const adjusting = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "record_caption_triage",
      payload: { itemId: itemIds[1]!, natures: ["none"] },
    });
    expect(adjusting.ok).toBe(false);
    if (adjusting.ok) return;
    expect(adjusting.error.code).toBe("invalid_transition");
  });
});
