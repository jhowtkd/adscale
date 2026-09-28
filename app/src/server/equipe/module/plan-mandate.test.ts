import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { mandateRuleOf, mandateVersionHash, planVersionHash } from "./plan-mandate";
import { makeTestDeps, openTestAccount, testActors, type TestDeps } from "./testing/deps";

const PLAN_CONTENT = { goals: ["10 posts/mês"], fronts: ["social_instagram"], rhythm: "weekly" };

async function setup() {
  const t = makeTestDeps();
  const ids = await openTestAccount(t);
  return { t, ...ids };
}

type Ids = { workspaceId: string; accountId: string };

async function proposePlan(t: TestDeps, ids: Ids, content = PLAN_CONTENT) {
  return executeCommand(t.deps, testActors.agent, {
    type: "propose_plan",
    workspaceId: ids.workspaceId,
    accountId: ids.accountId,
    payload: { content },
  });
}

async function proposeMandate(
  t: TestDeps,
  ids: Ids,
  payload: Record<string, unknown> = { limits: { postsPerWeek: 6 } },
) {
  return executeCommand(t.deps, testActors.agent, {
    type: "propose_mandate",
    workspaceId: ids.workspaceId,
    accountId: ids.accountId,
    payload,
  });
}

describe("propose_plan / approve_plan", () => {
  it("proposes and approves with a receipt on the exact content hash", async () => {
    const { t, workspaceId, accountId } = await setup();
    const scope = { workspaceId, accountId };
    const proposed = await proposePlan(t, { workspaceId, accountId });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    expect(proposed.value.events.map((e) => e.eventType)).toEqual([
      "plan.proposed",
      "notification.requested",
    ]);

    const hash = planVersionHash(PLAN_CONTENT);
    const approved = await executeCommand(t.deps, testActors.approver, {
      type: "approve_plan",
      workspaceId,
      accountId,
      payload: { expectedVersionHash: hash },
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.value.data).toMatchObject({ version: 1, versionHash: hash });

    const plans = await t.deps.uow.repos.plans.list(scope);
    expect(plans[0]?.status).toBe("approved");
    expect(plans[0]?.approvedAt).not.toBeNull();
    const receipts = await t.deps.uow.repos.receipts.list(scope);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      personKind: "client_person",
      personRole: "approver",
      objectType: "plan",
      objectVersion: hash,
      action: "approve_plan",
    });
  });

  it("keeps proposing agent-only and approving approver/substitute-only", async () => {
    const { t, workspaceId, accountId } = await setup();
    expect((await proposePlan(t, { workspaceId, accountId })).ok).toBe(true);
    const proposeEnvelope = {
      type: "propose_plan",
      workspaceId,
      accountId,
      payload: { content: PLAN_CONTENT },
    } as const;
    for (const actor of [testActors.approver, testActors.system, testActors.support]) {
      const outcome = await executeCommand(t.deps, actor, proposeEnvelope);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    }
    const approveEnvelope = {
      type: "approve_plan",
      workspaceId,
      accountId,
      payload: { expectedVersionHash: planVersionHash(PLAN_CONTENT) },
    } as const;
    for (const actor of [testActors.agent, testActors.system, testActors.member, testActors.quality]) {
      const outcome = await executeCommand(t.deps, actor, approveEnvelope);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    }
    expect((await executeCommand(t.deps, testActors.substitute, approveEnvelope)).ok).toBe(true);
  });

  it("fails without a proposal and on a stale version", async () => {
    const { t, workspaceId, accountId } = await setup();
    const none = await executeCommand(t.deps, testActors.approver, {
      type: "approve_plan",
      workspaceId,
      accountId,
      payload: { expectedVersionHash: "abc" },
    });
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.error.code).toBe("invalid_transition");

    expect((await proposePlan(t, { workspaceId, accountId })).ok).toBe(true);
    const stale = await executeCommand(t.deps, testActors.approver, {
      type: "approve_plan",
      workspaceId,
      accountId,
      payload: { expectedVersionHash: "deadbeef" },
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("stale_version");
  });
});

describe("propose_mandate / approve_mandate", () => {
  it("starts mandates in shadow mode and approves the exact rule", async () => {
    const { t, workspaceId, accountId } = await setup();
    const scope = { workspaceId, accountId };
    const fronts = await t.deps.uow.repos.fronts.list(scope);
    const proposed = await proposeMandate(t, { workspaceId, accountId }, {
      frontId: fronts[0]?.id,
      limits: { postsPerWeek: 6 },
      window: { days: ["mon", "tue", "wed", "thu", "fri"], start: "09:00", end: "18:00" },
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    expect(proposed.value.events.map((e) => e.eventType)).toEqual([
      "mandate.proposed",
      "notification.requested",
    ]);

    const mandates = await t.deps.uow.repos.mandates.list(scope);
    expect(mandates).toHaveLength(1);
    expect(mandates[0]?.shadow).toBe(true);
    const hash = mandateVersionHash(mandateRuleOf(mandates[0]!));
    const approved = await executeCommand(t.deps, testActors.approver, {
      type: "approve_mandate",
      workspaceId,
      accountId,
      payload: { expectedVersionHash: hash },
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    const receipts = await t.deps.uow.repos.receipts.list(scope);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      objectType: "mandate",
      objectVersion: hash,
      action: "approve_mandate",
    });
  });

  it("allows an explicit non-shadow mandate and rejects unknown fronts", async () => {
    const { t, workspaceId, accountId } = await setup();
    const scope = { workspaceId, accountId };
    const live = await proposeMandate(t, { workspaceId, accountId }, { shadow: false });
    expect(live.ok).toBe(true);
    const mandates = await t.deps.uow.repos.mandates.list(scope);
    expect(mandates[0]?.shadow).toBe(false);

    const unknownFront = await proposeMandate(t, { workspaceId, accountId }, {
      frontId: "00000000-0000-0000-0000-000000000000",
    });
    expect(unknownFront.ok).toBe(false);
    if (!unknownFront.ok) expect(unknownFront.error.code).toBe("unknown_front");
  });

  it("keeps proposing agent-only and approving approver/substitute-only", async () => {
    const { t, workspaceId, accountId } = await setup();
    expect((await proposeMandate(t, { workspaceId, accountId })).ok).toBe(true);
    const proposeEnvelope = {
      type: "propose_mandate",
      workspaceId,
      accountId,
      payload: {},
    } as const;
    for (const actor of [testActors.approver, testActors.system]) {
      const outcome = await executeCommand(t.deps, actor, proposeEnvelope);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    }
    const mandates = await t.deps.uow.repos.mandates.list({ workspaceId, accountId });
    const approveEnvelope = {
      type: "approve_mandate",
      workspaceId,
      accountId,
      payload: { expectedVersionHash: mandateVersionHash(mandateRuleOf(mandates[0]!)) },
    } as const;
    for (const actor of [testActors.agent, testActors.system, testActors.member, testActors.support]) {
      const outcome = await executeCommand(t.deps, actor, approveEnvelope);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    }
  });

  it("fails without a proposal and on a stale version", async () => {
    const { t, workspaceId, accountId } = await setup();
    const none = await executeCommand(t.deps, testActors.approver, {
      type: "approve_mandate",
      workspaceId,
      accountId,
      payload: { expectedVersionHash: "abc" },
    });
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.error.code).toBe("invalid_transition");

    expect((await proposeMandate(t, { workspaceId, accountId })).ok).toBe(true);
    const stale = await executeCommand(t.deps, testActors.substitute, {
      type: "approve_mandate",
      workspaceId,
      accountId,
      payload: { expectedVersionHash: "deadbeef" },
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("stale_version");
  });
});
