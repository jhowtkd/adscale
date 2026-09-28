import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { contextVersionHash } from "./context";
import { ideaVersionHash } from "./ideas-decide";
import { mandateRuleOf, mandateVersionHash, planVersionHash } from "./plan-mandate";
import { getAccountState, getGoalsView, getIdeasView } from "./queries";
import { makeTestDeps, openTestAccount, uuid } from "./testing/deps";

describe("queries", () => {
  it("reads account state: status, fronts, pending steps", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId, actors } = await openTestAccount(t, {
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
        await executeCommand(t.deps, { actor: actors.approver, workspaceId, accountId }, {
          type: "confirm_scope",
          payload: { scopeDigest: "a:v1" },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await executeCommand(t.deps, { actor: actors.agent, workspaceId, accountId }, {
          type: "advance_onboarding",
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
    const { workspaceId, accountId, actors } = await openTestAccount(t);
    const repos = t.deps.uow.repos;
    const empty = await getGoalsView(repos, workspaceId, accountId);
    expect(empty?.plan).toBeNull();
    expect(empty?.mandates).toEqual([]);
    expect(empty?.onboarding).toHaveLength(7);

    const content = { goals: ["go"], fronts: ["social_instagram"], rhythm: "weekly" };
    expect(
      (
        await executeCommand(t.deps, { actor: actors.agent, workspaceId, accountId }, {
          type: "propose_plan",
          payload: { content },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await executeCommand(t.deps, { actor: actors.agent, workspaceId, accountId }, {
          type: "propose_mandate",
          payload: { limits: { postsPerWeek: 6 } },
        })
      ).ok,
    ).toBe(true);
    const view = await getGoalsView(repos, workspaceId, accountId);
    expect(view?.plan?.status).toBe("proposed");
    expect(view?.plan?.content).toEqual(content);
    expect(view?.mandates.map((m) => m.version)).toEqual([1]);
  });

  it("reads the ideas view through the repository, oldest first", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t);
    const repos = t.deps.uow.repos;
    const scope = { workspaceId, accountId };
    expect(await getIdeasView(repos, workspaceId, accountId)).toEqual({
      workspaceId,
      accountId,
      ideas: [],
    });
    const content = await repos.ideas.create(scope, { kind: "content", payload: { n: 2 } });
    const planChange = await repos.ideas.create(scope, { kind: "plan_change", payload: { n: 1 } });
    await repos.ideas.update(scope, planChange.id, { status: "accepted" });
    const view = await getIdeasView(repos, workspaceId, accountId);
    expect(view?.ideas).toHaveLength(2);
    expect(new Set(view?.ideas.map((idea) => idea.id))).toEqual(
      new Set([content.id, planChange.id]),
    );
    expect(view?.ideas.find((idea) => idea.id === planChange.id)?.status).toBe("accepted");
  });

  it("returns null for unknown accounts", async () => {
    const t = makeTestDeps();
    const repos = t.deps.uow.repos;
    expect(await getAccountState(repos, uuid(), uuid())).toBeNull();
    expect(await getGoalsView(repos, uuid(), uuid())).toBeNull();
    expect(await getIdeasView(repos, uuid(), uuid())).toBeNull();
  });

  it("exposes active pauses with who may resume them", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId, actors } = await openTestAccount(t);
    const repos = t.deps.uow.repos;
    expect((await getAccountState(repos, workspaceId, accountId))?.activePauses).toEqual([]);

    expect(
      (
        await executeCommand(t.deps, { actor: actors.approver, workspaceId, accountId }, {
          type: "pause_publications",
          payload: {},
        })
      ).ok,
    ).toBe(true);
    const paused = await getAccountState(repos, workspaceId, accountId);
    expect(paused?.activePauses).toHaveLength(1);
    expect(paused?.activePauses[0]).toMatchObject({
      level: "publishing",
      origin: "client",
      resumableBy: "client",
      status: "active",
    });

    const resumed = await executeCommand(t.deps, { actor: actors.approver, workspaceId, accountId }, {
      type: "resume_pause",
      payload: { pauseId: paused!.activePauses[0]!.id },
    });
    expect(resumed.ok).toBe(true);
    expect((await getAccountState(repos, workspaceId, accountId))?.activePauses).toEqual([]);
  });

  it("carries every pending implantação decision with the hash to echo back", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId, actors } = await openTestAccount(t);
    const repos = t.deps.uow.repos;
    const scope = { workspaceId, accountId };
    const as = (actor: (typeof actors)[keyof typeof actors]) => ({ actor, workspaceId, accountId });

    const run = async (actor: (typeof actors)[keyof typeof actors], command: never) => {
      const outcome = await executeCommand(t.deps, as(actor), command);
      expect(outcome.ok).toBe(true);
      return outcome;
    };

    await run(actors.approver, {
      type: "confirm_scope",
      payload: { scopeDigest: "site + 8 posts/mês" },
    } as never);
    const assetId = uuid();
    t.gateway.addAsset({ id: assetId, workspaceId, kind: "logo" });
    await run(actors.approver, {
      type: "register_material",
      payload: { assetId, kind: "logo" },
    } as never);
    const fields = {
      offer: { status: "sustained", value: "frete grátis", source: "catálogo" },
      shipping: { status: "unknown", source: "conflict:O frete vale acima de quanto?" },
    };
    await run(actors.agent, {
      type: "propose_context_section",
      payload: { section: "oferta", fields },
    } as never);
    const planContent = { goals: ["go"], fronts: ["social_instagram"], rhythm: "weekly" };
    await run(actors.agent, { type: "propose_plan", payload: { content: planContent } } as never);
    await run(actors.agent, {
      type: "propose_mandate",
      payload: { limits: { postsPerWeek: 6 } },
    } as never);
    await run(actors.approver, {
      type: "approve_brand_voice",
      payload: { voice: "direta, calorosa, sem jargão" },
    } as never);
    await run(actors.approver, { type: "agree_manual_mode", payload: {} } as never);

    const view = await getGoalsView(repos, workspaceId, accountId);
    expect(view).not.toBeNull();
    const decisions = view!.decisions;
    expect(decisions.scope).toMatchObject({ confirmed: true, digest: "site + 8 posts/mês" });
    expect(decisions.materials).toEqual([{ assetId, kind: "logo", origin: null }]);

    expect(decisions.contextSections).toHaveLength(1);
    const section = decisions.contextSections[0]!;
    expect(section.section).toBe("oferta");
    // Same function the approve command verifies — never recomputed in the UI.
    expect(section.versionHash).toBe(contextVersionHash(section.fields));
    expect(section.fields).toMatchObject(fields);

    expect(decisions.conflicts).toEqual([
      {
        section: "oferta",
        version: 1,
        versionId: section.versionId,
        field: "shipping",
        question: "O frete vale acima de quanto?",
      },
    ]);

    expect(decisions.plan).not.toBeNull();
    expect(decisions.plan?.version).toBe(1);
    expect(decisions.plan?.versionHash).toBe(planVersionHash(planContent));

    expect(decisions.mandates).toHaveLength(1);
    const storedMandates = await repos.mandates.list(scope);
    expect(decisions.mandates[0]?.versionHash).toBe(mandateVersionHash(mandateRuleOf(storedMandates[0]!)));

    expect(decisions.brandVoice.approved).toBe(true);
    expect(decisions.brandVoice.versionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(decisions.connection).toEqual({ verified: false, manualAgreed: true });

    // A verified connection flips the connection step instead.
    await repos.connections.create(scope, { provider: "instagram", encryptedToken: "tok" });
    expect((await getGoalsView(repos, workspaceId, accountId))?.decisions.connection).toEqual({
      verified: true,
      manualAgreed: true,
    });
  });

  it("gives open ideas the hash decide_idea verifies, and decided ideas none", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId } = await openTestAccount(t);
    const repos = t.deps.uow.repos;
    const scope = { workspaceId, accountId };
    const open = await repos.ideas.create(scope, { kind: "content", payload: { title: "guide" } });
    const decided = await repos.ideas.create(scope, { kind: "content", payload: { title: "old" } });
    await repos.ideas.update(scope, decided.id, { status: "accepted" });

    const view = await getIdeasView(repos, workspaceId, accountId);
    expect(view?.ideas.find((idea) => idea.id === open.id)?.versionHash).toBe(ideaVersionHash(open));
    expect(view?.ideas.find((idea) => idea.id === decided.id)?.versionHash).toBeNull();
  });
});
