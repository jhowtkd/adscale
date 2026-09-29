import { describe, expect, it } from "vitest";
import type { Actor } from "../domain";
import { executeCommand } from "./commands";
import { getGoalsView } from "./queries";
import { mandateRuleOf, mandateVersionHash } from "./plan-mandate";
import {
  approveTestItem,
  ctx,
  deliverTestBatch,
  encryptedInstagramToken,
  makeTestDeps,
  openTestAccount,
  setup,
  type ItemIds,
} from "./testing/publication";

function scopeOf(ids: ItemIds) {
  return { workspaceId: ids.workspaceId, accountId: ids.accountId };
}

async function agreeManual(t: Awaited<ReturnType<typeof setup>>["t"], ids: ItemIds) {
  const result = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
    type: "agree_manual_mode",
    payload: {},
  });
  if (!result.ok) throw new Error(`agree_manual_mode failed: ${result.error.code}`);
}

async function connectInstagram(t: Awaited<ReturnType<typeof setup>>["t"], ids: ItemIds, igUserId = "ig_test_brand") {
  const result = await executeCommand(t.deps, ctx(ids, ids.actors.custodian), {
    type: "complete_instagram_connect",
    payload: { encryptedToken: encryptedInstagramToken(igUserId, "brand") },
  });
  if (!result.ok) throw new Error(`complete_instagram_connect failed: ${result.error.code}`);
}

async function approveLiveMandate(t: Awaited<ReturnType<typeof setup>>["t"], ids: ItemIds) {
  const proposal = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
    type: "propose_mandate",
    payload: { shadow: true, validFrom: new Date("2026-10-01T00:00:00Z"), validUntil: new Date("2026-10-30T00:00:00Z") },
  });
  if (!proposal.ok) throw new Error(`propose_mandate failed: ${proposal.error.code}`);
  const scope = scopeOf(ids);
  const shadow = (await t.deps.uow.repos.mandates.list(scope)).find((row) => row.id === proposal.value.data.mandateId)!;
  const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
    type: "approve_mandate",
    payload: { expectedVersionHash: mandateVersionHash(mandateRuleOf(shadow)) },
  });
  if (!approved.ok) throw new Error(`approve shadow mandate failed: ${approved.error.code}`);
  const activation = await executeCommand(t.deps, ctx(ids, ids.actors.support), {
    type: "propose_mandate_activation",
    payload: { mandateId: shadow.id },
  });
  if (!activation.ok) throw new Error(`propose mandate activation failed: ${activation.error.code}`);
  const view = await getGoalsView(t.deps.uow.repos, ids.workspaceId, ids.accountId, t.deps.clock.now());
  const hash = view?.decisions.mandates[0]?.versionHash;
  if (!hash) throw new Error("missing mandate activation hash in GoalsView");
  const live = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
    type: "approve_mandate",
    payload: { expectedVersionHash: hash },
  });
  if (!live.ok) throw new Error(`approve live mandate failed: ${live.error.code}`);
}

async function approveAutomatic(t: Awaited<ReturnType<typeof setup>>["t"], ids: ItemIds, actor: Actor = ids.actors.approver, expectedVersionHash?: string) {
  const view = await getGoalsView(t.deps.uow.repos, ids.workspaceId, ids.accountId, t.deps.clock.now());
  const decisionHash = expectedVersionHash ?? view?.decisions.publication.versionHash;
  if (!decisionHash) throw new Error("missing automatic publication hash in GoalsView");
  return executeCommand(t.deps, ctx(ids, actor), {
    type: "approve_automatic_publication",
    payload: { expectedVersionHash: decisionHash },
  });
}

describe("approve_automatic_publication", () => {
  it("switches only new approvals to automatic after the full client/staff flow", async () => {
    const { t, ids } = await setup();
    const scope = scopeOf(ids);
    await agreeManual(t, ids);
    const old = await deliverTestBatch(t, ids, { items: [{}, {}] });
    const preConnection = await deliverTestBatch(t, ids, { items: [{}] });
    await approveTestItem(t, ids, old.itemIds[0]!, old.versionHashes[0]!);
    await approveTestItem(t, ids, old.itemIds[1]!, old.versionHashes[1]!);
    await connectInstagram(t, ids);
    await approveLiveMandate(t, ids);

    const proposal = await getGoalsView(t.deps.uow.repos, ids.workspaceId, ids.accountId, t.deps.clock.now());
    const initialHash = proposal!.decisions.publication.versionHash!;
    const approved = await approveAutomatic(t, ids, ids.actors.approver, initialHash);
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.value.events.map((event) => event.eventType)).toContain("connection.automatic_publication_approved");
    const receipt = await t.deps.uow.repos.receipts.get(scope, approved.value.data.receiptId as string);
    expect(receipt).toMatchObject({
      personKind: "client_person", personRole: "approver",
      personId: ids.actors.approver.kind === "client_person" ? ids.actors.approver.personId : null,
      objectType: "connection", objectId: ids.accountId, objectVersion: initialHash,
      action: "approve_automatic_publication",
      detail: { from: "manual", to: "automatic", destinationIgUserId: "ig_test_brand" },
    });
    expect(receipt?.createdAt).toBeInstanceOf(Date);

    const repeated = await approveAutomatic(t, ids, ids.actors.approver, initialHash);
    expect(repeated.ok).toBe(true);
    if (repeated.ok) expect(repeated.value.data).toMatchObject({ alreadyApproved: true, receiptId: receipt?.id });
    expect((await t.deps.uow.repos.receipts.listByObject(scope, "connection", ids.accountId))
      .filter((row) => row.action === "approve_automatic_publication")).toHaveLength(1);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "connection.automatic_publication_approved" })).toHaveLength(1);
    const oldAgain = await approveTestItem(t, ids, old.itemIds[1]!, old.versionHashes[1]!);
    expect(oldAgain.data).toMatchObject({ alreadyApproved: true });
    const declared = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "declare_manual_publication",
      payload: { itemId: old.itemIds[0]! },
    });
    expect(declared.ok).toBe(true);

    await approveTestItem(t, ids, preConnection.itemIds[0]!, preConnection.versionHashes[0]!);
    expect(await t.deps.uow.repos.items.get(scope, preConnection.itemIds[0]!)).toMatchObject({ status: "available_for_download" });
    expect(await t.deps.uow.repos.intents.list(scope, { itemId: preConnection.itemIds[0]! })).toHaveLength(0);

    const fresh = await deliverTestBatch(t, ids, { items: [{ destinationAccount: "instagram:@brand" }] });
    await approveTestItem(t, ids, fresh.itemIds[0]!, fresh.versionHashes[0]!);
    expect(await t.deps.uow.repos.items.get(scope, old.itemIds[0]!)).toMatchObject({ status: "published_declared" });
    expect(await t.deps.uow.repos.items.get(scope, old.itemIds[1]!)).toMatchObject({ status: "available_for_download" });
    expect(await t.deps.uow.repos.intents.list(scope, { itemId: old.itemIds[0]! })).toHaveLength(0);
    expect(await t.deps.uow.repos.intents.list(scope, { itemId: old.itemIds[1]! })).toHaveLength(0);
    expect(await t.deps.uow.repos.intents.list(scope, { itemId: fresh.itemIds[0]! })).toMatchObject([
      { destinationIgUserId: "ig_test_brand", status: "pending" },
    ]);
    const after = await getGoalsView(t.deps.uow.repos, ids.workspaceId, ids.accountId, t.deps.clock.now());
    expect(after?.decisions.connection.manualAgreed).toBe(false);
    expect(after?.decisions.publication).toMatchObject({
      mode: "automatic", receiptId: receipt?.id, versionHash: null,
      igAccount: proposal!.decisions.publication.igAccount,
      mandateVersion: proposal!.decisions.publication.mandateVersion,
    });
    expect(after?.decisions.publication.mandateVersion).not.toBeNull();
    expect(await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "agree_manual_mode", payload: {},
    })).toMatchObject({ ok: false, error: { code: "invalid_transition" } });
  });

  it.each([
    ["without a connection", "connection"],
    ["without an active live mandate", "mandate"],
  ])("blocks %s", async (_label, missing) => {
    const { t, ids } = await setup();
    await agreeManual(t, ids);
    if (missing === "mandate") await connectInstagram(t, ids);
    const view = await getGoalsView(t.deps.uow.repos, ids.workspaceId, ids.accountId, t.deps.clock.now());
    expect(view?.decisions.publication).toMatchObject({ mode: "manual", versionHash: null });
    const result = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_automatic_publication",
      payload: { expectedVersionHash: view?.decisions.publication.versionHash ?? "stale" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(missing === "connection" ? "automatic_publication_requires_connection" : "automatic_publication_requires_mandate");
  });

  it("requires an active Instagram identity and a current, approved, non-shadow social mandate", async () => {
    const cases = [
      { label: "inactive connection", connection: "expired", mandate: "valid" },
      { label: "shadow mandate", connection: "active", mandate: "shadow" },
      { label: "proposed mandate", connection: "active", mandate: "proposed" },
      { label: "expired mandate", connection: "active", mandate: "expired" },
      { label: "wrong-front mandate", connection: "active", mandate: "wrong-front" },
    ] as const;
    for (const scenario of cases) {
      const { t, ids } = await setup();
      await agreeManual(t, ids);
      await t.deps.uow.repos.connections.create(scopeOf(ids), {
        provider: "instagram",
        encryptedToken: encryptedInstagramToken(),
        custodianPersonId: null,
        status: scenario.connection,
      });
      if (scenario.mandate !== "wrong-front") {
        const proposal = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
          type: "propose_mandate",
          payload: { shadow: scenario.mandate === "shadow", validUntil: scenario.mandate === "expired" ? new Date("2026-10-01T00:00:00Z") : new Date("2026-10-30T00:00:00Z") },
        });
        expect(proposal.ok, scenario.label).toBe(true);
        if (proposal.ok && scenario.mandate !== "proposed") {
          const row = (await t.deps.uow.repos.mandates.list(scopeOf(ids))).find((m) => m.id === proposal.value.data.mandateId)!;
          const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
            type: "approve_mandate", payload: { expectedVersionHash: mandateVersionHash(mandateRuleOf(row)) },
          });
          expect(approved.ok, scenario.label).toBe(true);
        }
      } else {
        const fronts = await t.deps.uow.repos.fronts.list(scopeOf(ids));
        const nonSocial = fronts.find((front) => front.key !== "social_instagram")!;
        const proposal = await executeCommand(t.deps, ctx(ids, ids.actors.agent), { type: "propose_mandate", payload: { frontId: nonSocial.id, shadow: false } });
        expect(proposal.ok).toBe(true);
        if (proposal.ok) {
          const row = (await t.deps.uow.repos.mandates.list(scopeOf(ids))).find((m) => m.id === proposal.value.data.mandateId)!;
          await executeCommand(t.deps, ctx(ids, ids.actors.approver), { type: "approve_mandate", payload: { expectedVersionHash: mandateVersionHash(mandateRuleOf(row)) } });
        }
      }
      const view = await getGoalsView(t.deps.uow.repos, ids.workspaceId, ids.accountId, t.deps.clock.now());
      expect(view?.decisions.publication.versionHash, scenario.label).toBeNull();
      expect(await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
        type: "approve_automatic_publication", payload: { expectedVersionHash: "unavailable" },
      }), scenario.label).toMatchObject({ ok: false, error: {
        code: scenario.connection === "active" ? "automatic_publication_requires_mandate" : "automatic_publication_requires_connection",
      } });
    }
  });

  it.each(["support", "quality", "operations", "agent", "system", "member", "custodian"] as const)("rejects %s", async (role) => {
    const { t, ids } = await setup();
    await agreeManual(t, ids);
    await connectInstagram(t, ids);
    await approveLiveMandate(t, ids);
    const view = await getGoalsView(t.deps.uow.repos, ids.workspaceId, ids.accountId, t.deps.clock.now());
    const actor = ids.actors[role];
    const result = await executeCommand(t.deps, ctx(ids, actor), {
      type: "approve_automatic_publication",
      payload: { expectedVersionHash: view!.decisions.publication.versionHash! },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("forbidden_actor");
  });

  it("accepts the substitute and rejects a changed proposal hash", async () => {
    const { t, ids } = await setup();
    await agreeManual(t, ids);
    await connectInstagram(t, ids);
    await approveLiveMandate(t, ids);
    const view = await getGoalsView(t.deps.uow.repos, ids.workspaceId, ids.accountId, t.deps.clock.now());
    const stale = view!.decisions.publication.versionHash!;
    await connectInstagram(t, ids, "ig_changed");
    const oldDecision = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_automatic_publication", payload: { expectedVersionHash: stale },
    });
    expect(oldDecision.ok).toBe(false);
    if (!oldDecision.ok) expect(oldDecision.error.code).toBe("stale_version");
    const refreshed = await getGoalsView(t.deps.uow.repos, ids.workspaceId, ids.accountId, t.deps.clock.now());
    const current = await approveAutomatic(t, ids, ids.actors.substitute, refreshed!.decisions.publication.versionHash!);
    expect(current.ok).toBe(true);
  });

  it("rejects the proposal hash after the approved mandate changes", async () => {
    const { t, ids } = await setup();
    await agreeManual(t, ids);
    await connectInstagram(t, ids);
    await approveLiveMandate(t, ids);
    const before = await getGoalsView(t.deps.uow.repos, ids.workspaceId, ids.accountId, t.deps.clock.now());
    const oldHash = before!.decisions.publication.versionHash!;
    const changed = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "propose_mandate", payload: { shadow: false, limits: { postsPerWeek: 3 } },
    });
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    const mandate = (await t.deps.uow.repos.mandates.list(scopeOf(ids))).find((row) => row.id === changed.value.data.mandateId)!;
    const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_mandate", payload: { expectedVersionHash: mandateVersionHash(mandateRuleOf(mandate)) },
    });
    expect(approved.ok).toBe(true);
    const stale = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_automatic_publication", payload: { expectedVersionHash: oldHash },
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("stale_version");
  });

  it("does not resolve a manual mode event whose receipt is missing", async () => {
    const { t, ids } = await setup();
    await agreeManual(t, ids);
    const receipt = [...t.store.receipts.rows.values()].find((row) => row.action === "agree_manual_mode")!;
    t.store.receipts.rows.delete(receipt.id);
    const view = await getGoalsView(t.deps.uow.repos, ids.workspaceId, ids.accountId, t.deps.clock.now());
    expect(view?.decisions.publication.mode).toBe("automatic");
    expect(view?.decisions.connection.manualAgreed).toBe(false);
  });

  it("keeps a legacy manual agreement valid and ignores a later unreceipted automatic event", async () => {
    const { t, ids } = await setup();
    await agreeManual(t, ids);
    const scope = scopeOf(ids);
    const manual = (await t.deps.uow.repos.events.list(scope, { eventType: "connection.manual_mode_agreed" }))[0]!;
    t.store.events.rows.set(manual.id, { ...manual, payload: null });
    await t.deps.uow.repos.events.create(scope, {
      actorType: "client_person", actorRole: manual.actorRole, actorId: manual.actorId,
      objectType: "account", objectId: ids.accountId,
      eventType: "connection.automatic_publication_approved",
      payload: { receiptId: crypto.randomUUID(), versionHash: "without-receipt" },
      occurredAt: new Date(manual.occurredAt.getTime() + 1000),
    });
    const view = await getGoalsView(t.deps.uow.repos, ids.workspaceId, ids.accountId, t.deps.clock.now());
    expect(view?.decisions.publication.mode).toBe("manual");
    expect(view?.decisions.connection.manualAgreed).toBe(true);
  });

  it.each(["calibrating", "active"] as const)("allows a client switch on a %s account", async (status) => {
    const { t, ids } = await setup();
    await agreeManual(t, ids);
    await connectInstagram(t, ids);
    await approveLiveMandate(t, ids);
    await t.deps.uow.repos.accounts.update(ids.workspaceId, ids.accountId, { status });
    expect((await approveAutomatic(t, ids)).ok).toBe(true);
  });

  it("keeps decisions isolated by account", async () => {
    const t = makeTestDeps();
    const first = await openTestAccount(t);
    const second = await openTestAccount(t);
    await agreeManual(t, first);
    const firstMode = await getGoalsView(t.deps.uow.repos, first.workspaceId, first.accountId, t.deps.clock.now());
    const secondMode = await getGoalsView(t.deps.uow.repos, second.workspaceId, second.accountId, t.deps.clock.now());
    expect(firstMode?.decisions.publication.mode).toBe("manual");
    expect(secondMode?.decisions.publication.mode).toBe("automatic");
  });
});
