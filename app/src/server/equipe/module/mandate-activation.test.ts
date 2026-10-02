import { describe, expect, it } from "vitest";
import type { Actor } from "../domain";
import { executeCommand } from "./commands";
import { buildDispatchGate } from "./dispatch-gate";
import { getGoalsView } from "./queries";
import { getCrossAccountPipeline } from "./escalation-queries";
import { activationBaseOf, mandateRuleOf, mandateVersionHash } from "./plan-mandate";
import {
  makeTestDeps,
  openTestAccount,
  type TestAccountActors,
  type TestDeps,
} from "./testing/deps";
import { ctx, deliverTestBatch, type ItemIds } from "./testing/items";

type Ids = { workspaceId: string; accountId: string; actors: TestAccountActors };

function scopeOf(ids: { workspaceId: string; accountId: string }) {
  return { workspaceId: ids.workspaceId, accountId: ids.accountId };
}

/** Agent proposes (shadow), approver approves: the activation starting point. */
async function approveShadowMandate(t: TestDeps, ids: Ids): Promise<string> {
  const scope = scopeOf(ids);
  const proposed = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
    type: "propose_mandate",
    payload: { limits: { postsPerWeek: 6 }, window: { days: ["mon"] } },
  });
  if (!proposed.ok) {
    throw new Error(`propose_mandate failed: ${proposed.error.code} ${proposed.error.message}`);
  }
  const mandates = await t.deps.uow.repos.mandates.list(scope);
  const open = mandates.find((row) => row.status === "proposed");
  if (!open) throw new Error("missing proposed mandate");
  const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
    type: "approve_mandate",
    payload: { expectedVersionHash: mandateVersionHash(mandateRuleOf(open)) },
  });
  if (!approved.ok) {
    throw new Error(`approve_mandate failed: ${approved.error.code} ${approved.error.message}`);
  }
  return open.id;
}

async function proposeActivation(t: TestDeps, ids: Ids, actor: Actor, mandateId: string) {
  return executeCommand(t.deps, ctx(ids, actor), {
    type: "propose_mandate_activation",
    payload: { mandateId },
  });
}

/** The dispatch gate's mandate condition for one item, read back directly. */
async function readMandateApproved(t: TestDeps, ids: Ids, itemId: string): Promise<boolean> {
  const scope = scopeOf(ids);
  const item = await t.deps.uow.repos.items.get(scope, itemId);
  if (!item) throw new Error("missing item");
  const built = await buildDispatchGate(
    {
      repos: t.deps.uow.repos,
      internal: t.deps.uow.internal,
      actor: ids.actors.system,
      workspaceId: ids.workspaceId,
      accountId: ids.accountId,
      now: t.deps.clock.now(),
      events: [],
    },
    item,
  );
  if (!built.ok) {
    throw new Error(`buildDispatchGate failed: ${built.error.code} ${built.error.message}`);
  }
  return built.value.snapshot.mandateApproved;
}

describe("propose_mandate_activation (#584)", () => {
  it("lets support propose: identical copy out of shadow, pending the client", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const scope = scopeOf(ids);
    const baseId = await approveShadowMandate(t, ids);

    const outcome = await proposeActivation(t, ids, ids.actors.support, baseId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ version: 2, activatesVersion: 1 });
    expect(outcome.value.events.map((event) => event.eventType)).toEqual([
      "mandate.proposed",
      "notification.requested",
    ]);
    const proposed = outcome.value.events[0]!;
    expect(proposed.actorType).toBe("staff");
    expect(proposed.actorRole).toBe("support");
    expect(proposed.payload).toMatchObject({ version: 2, shadow: false, activatesVersion: 1 });
    expect(outcome.value.events[1]?.payload).toMatchObject({
      recipientRole: "approver",
      templateKey: "mandate.proposed",
    });

    const mandates = await t.deps.uow.repos.mandates.list(scope);
    const created = mandates.find((row) => row.id === outcome.value.data.mandateId);
    const base = mandates.find((row) => row.id === baseId);
    expect(created?.status).toBe("proposed");
    expect(created?.shadow).toBe(false);
    expect(base?.status).toBe("approved");
    // Identical except the shadow flag.
    expect(mandateRuleOf(created!)).toMatchObject({ ...mandateRuleOf(base!), shadow: false });
    expect(activationBaseOf(mandates, created!)?.id).toBe(baseId);

    // The server hash getGoalsView exposes approves it through the same flow.
    const view = await getGoalsView(t.deps.uow.repos, ids.workspaceId, ids.accountId);
    expect(view?.decisions.mandates).toHaveLength(1);
    expect(view?.decisions.mandates[0]).toMatchObject({
      id: created!.id,
      version: 2,
      versionHash: mandateVersionHash(mandateRuleOf(created!)),
      activation: true,
    });
    const approved = await executeCommand(t.deps, ctx(ids, ids.actors.substitute), {
      type: "approve_mandate",
      payload: { expectedVersionHash: view!.decisions.mandates[0]!.versionHash },
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.value.data).toMatchObject({ version: 2 });
    const receipts = await t.deps.uow.repos.receipts.list(scope);
    expect(receipts).toHaveLength(2);
    const activationReceipt = receipts.find((receipt) => receipt.objectId === created!.id);
    expect(activationReceipt).toMatchObject({
      personKind: "client_person",
      personRole: "substitute",
      objectType: "mandate",
      action: "approve_mandate",
    });
  });

  it("lets operations propose too, and supersedes other open proposals", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const scope = scopeOf(ids);
    const baseId = await approveShadowMandate(t, ids);
    // The agent proposes something else while the activation is prepared.
    const agentProposal = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "propose_mandate",
      payload: { limits: { postsPerWeek: 2 } },
    });
    expect(agentProposal.ok).toBe(true);

    const outcome = await proposeActivation(t, ids, ids.actors.operations, baseId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events[0]?.actorRole).toBe("operations");

    const mandates = await t.deps.uow.repos.mandates.list(scope);
    // One open proposal: the activation. The agent's version stays readable.
    expect(mandates.filter((row) => row.status === "proposed")).toHaveLength(1);
    expect(mandates.find((row) => row.id === outcome.value.data.mandateId)?.shadow).toBe(false);
    expect(
      mandates.find((row) => row.id === agentProposal.value.data.mandateId)?.status,
    ).toBe("superseded");
  });

  it("refuses a duplicate pending activation", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const baseId = await approveShadowMandate(t, ids);
    expect((await proposeActivation(t, ids, ids.actors.support, baseId)).ok).toBe(true);

    for (const actor of [ids.actors.support, ids.actors.operations]) {
      const again = await proposeActivation(t, ids, actor, baseId);
      expect(again.ok).toBe(false);
      if (!again.ok) {
        expect(again.error.code).toBe("invalid_transition");
        expect(again.error.message).toContain("already pending");
      }
    }
    const mandates = await t.deps.uow.repos.mandates.list(scopeOf(ids));
    expect(mandates.filter((row) => row.status === "proposed")).toHaveLength(1);
  });

  it("refuses unknown, non-approved and already-active mandates", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const unknown = await proposeActivation(
      t,
      ids,
      ids.actors.support,
      "00000000-0000-0000-0000-000000000000",
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe("unknown_mandate");

    // A proposed-but-never-approved mandate is not an activation base.
    const proposed = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "propose_mandate",
      payload: {},
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    const notApproved = await proposeActivation(
      t,
      ids,
      ids.actors.support,
      proposed.value.data.mandateId as string,
    );
    expect(notApproved.ok).toBe(false);
    if (!notApproved.ok) {
      expect(notApproved.error.code).toBe("invalid_transition");
      expect(notApproved.error.message).toContain("needs an approved mandate");
    }

    // An approved mandate already out of shadow has nothing to activate.
    const scope = scopeOf(ids);
    const open = (await t.deps.uow.repos.mandates.list(scope)).find(
      (row) => row.status === "proposed",
    )!;
    const live = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "propose_mandate",
      payload: { shadow: false },
    });
    expect(live.ok).toBe(true);
    if (!live.ok) return;
    const liveRow = (await t.deps.uow.repos.mandates.list(scope)).find(
      (row) => row.id === live.value.data.mandateId,
    )!;
    expect(open.id).not.toBe(liveRow.id);
    const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_mandate",
      payload: { expectedVersionHash: mandateVersionHash(mandateRuleOf(liveRow)) },
    });
    expect(approved.ok).toBe(true);
    const alreadyActive = await proposeActivation(
      t,
      ids,
      ids.actors.operations,
      liveRow.id,
    );
    expect(alreadyActive.ok).toBe(false);
    if (!alreadyActive.ok) {
      expect(alreadyActive.error.code).toBe("invalid_transition");
      expect(alreadyActive.error.message).toContain("already out of shadow");
    }
  });

  it("keeps approval client-only: no internal role approves a mandate", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const baseId = await approveShadowMandate(t, ids);
    expect((await proposeActivation(t, ids, ids.actors.support, baseId)).ok).toBe(true);
    const mandates = await t.deps.uow.repos.mandates.list(scopeOf(ids));
    const open = mandates.find((row) => row.status === "proposed")!;
    const approveCommand = {
      type: "approve_mandate",
      payload: { expectedVersionHash: mandateVersionHash(mandateRuleOf(open)) },
    } as const;
    for (const actor of [
      ids.actors.support,
      ids.actors.quality,
      ids.actors.operations,
      ids.actors.agent,
      ids.actors.system,
      ids.actors.member,
    ]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), approveCommand);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    }
    // And proposing the activation is staff-only: agent, client, quality out.
    const proposeCommand = {
      type: "propose_mandate_activation",
      payload: { mandateId: baseId },
    } as const;
    for (const actor of [
      ids.actors.agent,
      ids.actors.system,
      ids.actors.approver,
      ids.actors.substitute,
      ids.actors.member,
      ids.actors.quality,
    ]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), proposeCommand);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    }
    // The agent keeps proposing through the current path.
    expect(
      (
        await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
          type: "propose_mandate",
          payload: { limits: { postsPerWeek: 1 } },
        })
      ).ok,
    ).toBe(true);
  });

  it("marks only true activations, and exposes the staff summary", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const baseId = await approveShadowMandate(t, ids);
    // An agent shadow proposal is pending review — not an activation.
    expect(
      (
        await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
          type: "propose_mandate",
          payload: { limits: { postsPerWeek: 1 } },
        })
      ).ok,
    ).toBe(true);
    const before = await getGoalsView(t.deps.uow.repos, ids.workspaceId, ids.accountId);
    expect(before?.decisions.mandates).toHaveLength(1);
    expect(before?.decisions.mandates[0]?.activation).toBe(false);

    const crossBefore = await getCrossAccountPipeline(t.deps.uow.internal);
    expect(crossBefore.entries).toHaveLength(1);
    expect(crossBefore.entries[0]?.mandate.approved).toMatchObject({ version: 1, shadow: true });
    expect(crossBefore.entries[0]?.mandate.activationPending).toBeNull();

    expect((await proposeActivation(t, ids, ids.actors.support, baseId)).ok).toBe(true);
    const crossAfter = await getCrossAccountPipeline(t.deps.uow.internal);
    expect(crossAfter.entries[0]?.mandate.activationPending).toMatchObject({ version: 3 });
  });

  it.each(["calibrating", "active"] as const)(
    "proposes + approves an activation on a %s account (dispatch gate flips)",
    async (status) => {
      const t = makeTestDeps();
      const setupIds = await openTestAccount(t);
      const ids: ItemIds = setupIds;
      const baseId = await approveShadowMandate(t, ids);
      const { itemIds } = await deliverTestBatch(t, ids, { items: [{ caption: "legenda 1" }] });
      const itemId = itemIds[0]!;

      // The pilot takes the mandate out of shadow weeks after implantation.
      await t.deps.uow.repos.accounts.update(ids.workspaceId, ids.accountId, { status });
      expect((await proposeActivation(t, ids, ids.actors.support, baseId)).ok).toBe(true);
      expect(await readMandateApproved(t, ids, itemId)).toBe(false);

      const view = await getGoalsView(t.deps.uow.repos, ids.workspaceId, ids.accountId);
      const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
        type: "approve_mandate",
        payload: { expectedVersionHash: view!.decisions.mandates[0]!.versionHash },
      });
      expect(approved.ok).toBe(true);
      expect(await readMandateApproved(t, ids, itemId)).toBe(true);
    },
  );

  it("still refuses an ordinary agent proposal on an active account", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    // Proposed while deploying, then the account goes active.
    const proposed = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "propose_mandate",
      payload: { limits: { postsPerWeek: 6 } },
    });
    expect(proposed.ok).toBe(true);
    await t.deps.uow.repos.accounts.update(ids.workspaceId, ids.accountId, { status: "active" });

    // New agent proposals stay implantation-scoped.
    const again = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "propose_mandate",
      payload: { limits: { postsPerWeek: 2 } },
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("invalid_transition");

    // And the pre-existing ordinary proposal does not approve either.
    const mandates = await t.deps.uow.repos.mandates.list(scopeOf(ids));
    const open = mandates.find((row) => row.status === "proposed")!;
    expect(activationBaseOf(mandates, open)).toBeNull();
    const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_mandate",
      payload: { expectedVersionHash: mandateVersionHash(mandateRuleOf(open)) },
    });
    expect(approved.ok).toBe(false);
    if (!approved.ok) expect(approved.error.code).toBe("invalid_transition");
  });

  it.each(["paused", "suspended", "closed"] as const)(
    "refuses an activation on a %s account",
    async (status) => {
      const t = makeTestDeps();
      const ids = await openTestAccount(t);
      const baseId = await approveShadowMandate(t, ids);
      await t.deps.uow.repos.accounts.update(ids.workspaceId, ids.accountId, { status });

      const proposed = await proposeActivation(t, ids, ids.actors.support, baseId);
      expect(proposed.ok).toBe(false);
      if (!proposed.ok) {
        expect(proposed.error.code).toBe("invalid_transition");
        expect(proposed.error.message).toContain(status);
      }
    },
  );

  it("refuses approving a pending activation on a suspended account", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const baseId = await approveShadowMandate(t, ids);
    expect((await proposeActivation(t, ids, ids.actors.support, baseId)).ok).toBe(true);
    const view = await getGoalsView(t.deps.uow.repos, ids.workspaceId, ids.accountId);
    await t.deps.uow.repos.accounts.update(ids.workspaceId, ids.accountId, { status: "suspended" });

    const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_mandate",
      payload: { expectedVersionHash: view!.decisions.mandates[0]!.versionHash },
    });
    expect(approved.ok).toBe(false);
    if (!approved.ok) expect(approved.error.code).toBe("invalid_transition");
  });

  it("passes the dispatch gate's mandate condition only after client approval", async () => {
    const t = makeTestDeps();
    const setupIds = await openTestAccount(t);
    const ids: ItemIds = setupIds;
    const scope = scopeOf(ids);
    const baseId = await approveShadowMandate(t, ids);
    const { itemIds } = await deliverTestBatch(t, ids, { items: [{ caption: "legenda 1" }] });
    const itemId = itemIds[0]!;

    async function mandateApproved(): Promise<boolean> {
      const item = await t.deps.uow.repos.items.get(scope, itemId);
      if (!item) throw new Error("missing item");
      const built = await buildDispatchGate(
        {
          repos: t.deps.uow.repos,
          internal: t.deps.uow.internal,
          actor: ids.actors.system,
          workspaceId: ids.workspaceId,
          accountId: ids.accountId,
          now: t.deps.clock.now(),
          events: [],
        },
        item,
      );
      if (!built.ok) {
        throw new Error(`buildDispatchGate failed: ${built.error.code} ${built.error.message}`);
      }
      return built.value.snapshot.mandateApproved;
    }

    // Approved but shadow: the gate's mandate condition fails.
    expect(await mandateApproved()).toBe(false);
    // Staff proposes — still failing until the client approves.
    expect((await proposeActivation(t, ids, ids.actors.support, baseId)).ok).toBe(true);
    expect(await mandateApproved()).toBe(false);

    const view = await getGoalsView(t.deps.uow.repos, ids.workspaceId, ids.accountId);
    const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_mandate",
      payload: { expectedVersionHash: view!.decisions.mandates[0]!.versionHash },
    });
    expect(approved.ok).toBe(true);
    expect(await mandateApproved()).toBe(true);
  });
});
