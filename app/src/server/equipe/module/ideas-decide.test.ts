import { describe, expect, it } from "vitest";
import type { Actor } from "../domain";
import { executeCommand } from "./commands";
import { ideaVersionHash } from "./ideas-decide";
import { mandateRuleOf, planVersionHash } from "./plan-mandate";
import {
  makeTestDeps,
  openTestAccount,
  type TestAccountActors,
  type TestDeps,
} from "./testing/deps";

type Ids = { workspaceId: string; accountId: string; actors: TestAccountActors };

async function setup() {
  const t = makeTestDeps();
  const ids = await openTestAccount(t);
  return { t, ...ids };
}

function ctx(ids: Ids, actor: Actor) {
  return { actor, workspaceId: ids.workspaceId, accountId: ids.accountId };
}

const PLAN_CONTENT = { goals: ["gifts"], fronts: ["social_instagram"], rhythm: "weekly" };

async function decide(
  t: TestDeps,
  ids: Ids,
  actor: Actor,
  payload: Record<string, unknown>,
) {
  return executeCommand(t.deps, ctx(ids, actor), {
    type: "decide_idea",
    payload: payload as never,
  });
}

describe("decide_idea", () => {
  it("approves a plan idea into a new approved plan version with a receipt", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const scope = { workspaceId, accountId };
    const idea = await t.deps.uow.repos.ideas.create(scope, {
      kind: "plan_change",
      payload: PLAN_CONTENT,
    });

    const outcome = await decide(t, ids, actors.approver, {
      ideaId: idea.id,
      decision: "approve",
      expectedVersionHash: ideaVersionHash(idea),
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events.map((e) => e.eventType)).toContain("idea.decided");

    const decided = await t.deps.uow.repos.ideas.get(scope, idea.id);
    expect(decided?.status).toBe("accepted");
    expect(decided?.resultingPlanVersion).toBe(1);
    expect(decided?.receiptId).not.toBeNull();

    const plans = await t.deps.uow.repos.plans.list(scope);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      version: 1,
      status: "approved",
      content: PLAN_CONTENT,
      receiptId: decided?.receiptId,
    });
    expect(planVersionHash(plans[0]!.content)).toBe(planVersionHash(PLAN_CONTENT));

    const receipts = await t.deps.uow.repos.receipts.list(scope);
    expect(receipts.map((r) => r.action)).toContain("decide_idea");
  });

  it("approves a mandate idea into a new approved mandate version with a receipt", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const scope = { workspaceId, accountId };
    const idea = await t.deps.uow.repos.ideas.create(scope, {
      kind: "mandate_change",
      payload: { limits: { postsPerWeek: 4 }, shadow: false },
    });

    const outcome = await decide(t, ids, actors.substitute, {
      ideaId: idea.id,
      decision: "approve",
      expectedVersionHash: ideaVersionHash(idea),
    });
    expect(outcome.ok).toBe(true);

    const decided = await t.deps.uow.repos.ideas.get(scope, idea.id);
    expect(decided?.status).toBe("accepted");
    expect(decided?.resultingMandateVersion).toBe(1);
    expect(decided?.receiptId).not.toBeNull();

    const mandates = await t.deps.uow.repos.mandates.list(scope);
    expect(mandates).toHaveLength(1);
    expect(mandates[0]).toMatchObject({
      version: 1,
      status: "approved",
      shadow: false,
      receiptId: decided?.receiptId,
    });
    expect(mandates[0]?.limits).toEqual({ postsPerWeek: 4 });
    // The stored rule carries the payload the mandate hash covers.
    expect(mandateRuleOf(mandates[0]!)).toMatchObject({
      limits: { postsPerWeek: 4 },
      shadow: false,
    });
  });

  it("approves a content idea with a receipt and no new version", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const scope = { workspaceId, accountId };
    const idea = await t.deps.uow.repos.ideas.create(scope, {
      kind: "content",
      payload: { title: "gift guide" },
    });

    const outcome = await decide(t, ids, actors.approver, {
      ideaId: idea.id,
      decision: "approve",
      expectedVersionHash: ideaVersionHash(idea),
    });
    expect(outcome.ok).toBe(true);

    const decided = await t.deps.uow.repos.ideas.get(scope, idea.id);
    expect(decided?.status).toBe("accepted");
    expect(decided?.resultingPlanVersion).toBeNull();
    expect(decided?.resultingMandateVersion).toBeNull();
    expect(decided?.receiptId).not.toBeNull();
    expect(await t.deps.uow.repos.plans.list(scope)).toHaveLength(0);
    expect(await t.deps.uow.repos.mandates.list(scope)).toHaveLength(0);
  });

  it("supersedes open proposals so a stale one cannot be approved later", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const scope = { workspaceId, accountId };
    await executeCommand(t.deps, ctx(ids, actors.agent), {
      type: "propose_plan",
      payload: { content: { goals: ["old"] } },
    });
    const idea = await t.deps.uow.repos.ideas.create(scope, {
      kind: "plan_change",
      payload: PLAN_CONTENT,
    });

    const outcome = await decide(t, ids, actors.approver, {
      ideaId: idea.id,
      decision: "approve",
      expectedVersionHash: ideaVersionHash(idea),
    });
    expect(outcome.ok).toBe(true);

    const plans = await t.deps.uow.repos.plans.list(scope);
    expect(plans.map((p) => p.status).sort()).toEqual(["approved", "superseded"]);
    // The pre-decision proposal is gone: nothing left to approve.
    const stale = await executeCommand(t.deps, ctx(ids, actors.approver), {
      type: "approve_plan",
      payload: { expectedVersionHash: planVersionHash({ goals: ["old"] }) },
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error.code).toBe("invalid_transition");
  });

  it("rejects with an optional reason and decides each idea once", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const scope = { workspaceId, accountId };
    const idea = await t.deps.uow.repos.ideas.create(scope, {
      kind: "plan_change",
      payload: PLAN_CONTENT,
    });

    const outcome = await decide(t, ids, actors.approver, {
      ideaId: idea.id,
      decision: "reject",
      expectedVersionHash: ideaVersionHash(idea),
      reason: "not this cycle",
    });
    expect(outcome.ok).toBe(true);
    const decided = await t.deps.uow.repos.ideas.get(scope, idea.id);
    expect(decided?.status).toBe("rejected");
    expect(decided?.decidedAt).not.toBeNull();

    const again = await decide(t, ids, actors.approver, {
      ideaId: idea.id,
      decision: "approve",
      expectedVersionHash: ideaVersionHash(idea),
    });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.code).toBe("invalid_transition");
  });

  it("refuses a stale hash", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const scope = { workspaceId, accountId };
    const idea = await t.deps.uow.repos.ideas.create(scope, {
      kind: "content",
      payload: { title: "guide" },
    });

    const outcome = await decide(t, ids, actors.approver, {
      ideaId: idea.id,
      decision: "approve",
      expectedVersionHash: "0".repeat(64),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("stale_version");
  });

  it("lets only the approver or substitute decide", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const scope = { workspaceId, accountId };
    const idea = await t.deps.uow.repos.ideas.create(scope, {
      kind: "content",
      payload: { title: "guide" },
    });
    const payload = {
      ideaId: idea.id,
      decision: "approve",
      expectedVersionHash: ideaVersionHash(idea),
    };
    for (const actor of [actors.agent, actors.system, actors.member, actors.support]) {
      const outcome = await decide(t, ids, actor, payload);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.error.code).toBe("forbidden_actor");
    }
    expect((await decide(t, ids, actors.substitute, payload)).ok).toBe(true);
  });

  it("rejects ideas without usable plan/mandate content", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const scope = { workspaceId, accountId };
    const idea = await t.deps.uow.repos.ideas.create(scope, {
      kind: "plan_change",
      payload: null as unknown as Record<string, unknown>,
    });

    const outcome = await decide(t, ids, actors.approver, {
      ideaId: idea.id,
      decision: "approve",
      expectedVersionHash: ideaVersionHash(idea),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("invalid_idea_payload");
  });

  it("answers unknown ideas without revealing them", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const outcome = await decide(t, ids, actors.approver, {
      ideaId: "00000000-0000-0000-0000-000000000000",
      decision: "approve",
      expectedVersionHash: "0".repeat(64),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("unknown_idea");
  });
});
