import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { getAccountState, getGoalsView } from "./queries";
import { makeTestDeps, openTestAccount, testActors, uuid } from "./testing/deps";

describe("queries", () => {
  it("reads account state: status, fronts, pending steps", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t, {
      fronts: ["midia_paga", "social_instagram"],
    });
    const repos = t.deps.uow.repos;
    const state = await getAccountState(repos, workspaceId, accountId);
    expect(state?.status).toBe("deploying");
    expect(state?.fronts.map((f) => f.key)).toEqual(["midia_paga", "social_instagram"]);
    expect(state?.pendingSteps).toHaveLength(7);
    expect(state?.pendingSteps.map((s) => s.step)).toEqual([
      "scope_confirm",
      "materials",
      "context",
      "plan",
      "mandate",
      "connection",
      "go_live",
    ]);

    expect(
      (
        await executeCommand(t.deps, testActors.approver, {
          type: "confirm_scope",
          workspaceId,
          accountId,
          payload: { scopeDigest: "a:v1" },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await executeCommand(t.deps, testActors.agent, {
          type: "advance_onboarding",
          workspaceId,
          accountId,
          payload: { step: "scope_confirm" },
        })
      ).ok,
    ).toBe(true);
    const advanced = await getAccountState(repos, workspaceId, accountId);
    expect(advanced?.pendingSteps.map((s) => s.step)).not.toContain("scope_confirm");
    expect(advanced?.pendingSteps).toHaveLength(6);
  });

  it("reads the goals view: plan, mandates, onboarding", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t);
    const repos = t.deps.uow.repos;
    const empty = await getGoalsView(repos, workspaceId, accountId);
    expect(empty?.plan).toBeNull();
    expect(empty?.mandates).toEqual([]);
    expect(empty?.onboarding).toHaveLength(7);

    const content = { goals: ["go"], fronts: ["social_instagram"], rhythm: "weekly" };
    expect(
      (
        await executeCommand(t.deps, testActors.agent, {
          type: "propose_plan",
          workspaceId,
          accountId,
          payload: { content },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await executeCommand(t.deps, testActors.agent, {
          type: "propose_mandate",
          workspaceId,
          accountId,
          payload: { limits: { postsPerWeek: 6 } },
        })
      ).ok,
    ).toBe(true);
    const view = await getGoalsView(repos, workspaceId, accountId);
    expect(view?.plan?.status).toBe("proposed");
    expect(view?.plan?.content).toEqual(content);
    expect(view?.mandates.map((m) => m.version)).toEqual([1]);
  });

  it("returns null for unknown accounts", async () => {
    const t = makeTestDeps();
    const repos = t.deps.uow.repos;
    expect(await getAccountState(repos, uuid(), uuid())).toBeNull();
    expect(await getGoalsView(repos, uuid(), uuid())).toBeNull();
  });
});
