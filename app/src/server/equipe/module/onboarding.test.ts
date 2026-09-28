import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { contextVersionHash } from "./context";
import { mandateRuleOf, mandateVersionHash, planVersionHash } from "./plan-mandate";
import { makeTestDeps, openTestAccount, testActors, uuid, type TestDeps } from "./testing/deps";

type Ids = { workspaceId: string; accountId: string };

async function setup() {
  const t = makeTestDeps();
  const ids = await openTestAccount(t);
  return { t, ...ids };
}

async function advance(t: TestDeps, ids: Ids, payload: Record<string, unknown>) {
  return executeCommand(t.deps, testActors.agent, {
    type: "advance_onboarding",
    workspaceId: ids.workspaceId,
    accountId: ids.accountId,
    payload,
  });
}

async function approvePlanAndMandate(t: TestDeps, ids: Ids) {
  const content = { goals: ["go"], fronts: ["social_instagram"], rhythm: "weekly" };
  expect(
    (
      await executeCommand(t.deps, testActors.agent, {
        type: "propose_plan",
        workspaceId: ids.workspaceId,
        accountId: ids.accountId,
        payload: { content },
      })
    ).ok,
  ).toBe(true);
  expect(
    (
      await executeCommand(t.deps, testActors.approver, {
        type: "approve_plan",
        workspaceId: ids.workspaceId,
        accountId: ids.accountId,
        payload: { expectedVersionHash: planVersionHash(content) },
      })
    ).ok,
  ).toBe(true);
  expect(
    (
      await executeCommand(t.deps, testActors.agent, {
        type: "propose_mandate",
        workspaceId: ids.workspaceId,
        accountId: ids.accountId,
        payload: { limits: { postsPerWeek: 6 } },
      })
    ).ok,
  ).toBe(true);
  const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
  const mandates = await t.deps.uow.repos.mandates.list(scope);
  expect(
    (
      await executeCommand(t.deps, testActors.approver, {
        type: "approve_mandate",
        workspaceId: ids.workspaceId,
        accountId: ids.accountId,
        payload: { expectedVersionHash: mandateVersionHash(mandateRuleOf(mandates[0]!)) },
      })
    ).ok,
  ).toBe(true);
}

describe("advance_onboarding", () => {
  it("completes steps whose gates hold", async () => {
    const { t, workspaceId, accountId } = await setup();
    const ids = { workspaceId, accountId };
    const scope = { workspaceId, accountId };

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
    const done = await advance(t, ids, { step: "scope_confirm" });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.value.events.map((e) => e.eventType)).toEqual([
      "onboarding.step_advanced",
      "notification.requested",
    ]);
    const steps = await t.deps.uow.repos.onboarding.list(scope);
    expect(steps.find((s) => s.step === "scope_confirm")?.status).toBe("done");

    const assetId = uuid();
    t.gateway.addAsset({ id: assetId, workspaceId, kind: "deck" });
    expect(
      (
        await executeCommand(t.deps, testActors.member, {
          type: "register_material",
          workspaceId,
          accountId,
          payload: { assetId, kind: "deck" },
        })
      ).ok,
    ).toBe(true);
    expect((await advance(t, ids, { step: "materials" })).ok).toBe(true);
  });

  it("blocks steps whose gates do not hold, and re-completing done steps", async () => {
    const { t, workspaceId, accountId } = await setup();
    const ids = { workspaceId, accountId };
    expect((await advance(t, ids, { step: "scope_confirm" })).ok).toBe(false);
    expect((await advance(t, ids, { step: "materials" })).ok).toBe(false);
    expect((await advance(t, ids, { step: "context" })).ok).toBe(false);
    expect((await advance(t, ids, { step: "plan" })).ok).toBe(false);
    expect((await advance(t, ids, { step: "mandate" })).ok).toBe(false);
    expect((await advance(t, ids, { step: "connection" })).ok).toBe(false);
    const blocked = await advance(t, ids, { step: "materials" });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe("invalid_transition");

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
    expect((await advance(t, ids, { step: "scope_confirm" })).ok).toBe(true);
    const again = await advance(t, ids, { step: "scope_confirm" });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("invalid_transition");
  });

  it("requires every context proposal to be decided before closing context", async () => {
    const { t, workspaceId, accountId } = await setup();
    const ids = { workspaceId, accountId };
    const fields = { offer: { status: "sustained" as const, value: "x" } };
    expect(
      (
        await executeCommand(t.deps, testActors.agent, {
          type: "propose_context_section",
          workspaceId,
          accountId,
          payload: { section: "oferta", fields },
        })
      ).ok,
    ).toBe(true);
    expect((await advance(t, ids, { step: "context" })).ok).toBe(false);
    expect(
      (
        await executeCommand(t.deps, testActors.approver, {
          type: "approve_context_section",
          workspaceId,
          accountId,
          payload: { section: "oferta", expectedVersionHash: contextVersionHash(fields) },
        })
      ).ok,
    ).toBe(true);
    expect((await advance(t, ids, { step: "context" })).ok).toBe(true);
  });

  it("enters calibration when the full checklist holds (manual mode)", async () => {
    const { t, workspaceId, accountId } = await setup();
    const ids = { workspaceId, accountId };
    const scope = { workspaceId, accountId };
    await approvePlanAndMandate(t, ids);
    const outcome = await executeCommand(t.deps, testActors.support, {
      type: "advance_onboarding",
      workspaceId,
      accountId,
      payload: {
        step: "go_live",
        secondInstallmentPaid: true,
        brandVoiceApproved: true,
        manualModeAgreed: true,
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "billing.second_installment_paid",
      "brand.voice_approved",
      "connection.manual_mode_agreed",
      "account.entered_calibration",
      "onboarding.step_advanced",
      "notification.requested",
    ]);
    expect(outcome.value.events[5]?.payload).toMatchObject({
      recipientRole: "approver",
      templateKey: "calibration.entered",
    });
    const account = await t.deps.uow.repos.accounts.get(workspaceId, accountId);
    expect(account?.status).toBe("calibrating");
    const steps = await t.deps.uow.repos.onboarding.list(scope);
    expect(steps.find((s) => s.step === "go_live")?.status).toBe("done");
  });

  it("enters calibration with a verified connection instead of manual mode", async () => {
    const { t, workspaceId, accountId } = await setup();
    const ids = { workspaceId, accountId };
    const scope = { workspaceId, accountId };
    await approvePlanAndMandate(t, ids);
    await t.deps.uow.repos.connections.create(scope, {
      provider: "instagram",
      encryptedToken: "v1:fake",
      status: "active",
    });
    const outcome = await executeCommand(t.deps, testActors.system, {
      type: "advance_onboarding",
      workspaceId,
      accountId,
      payload: { step: "go_live", secondInstallmentPaid: true, brandVoiceApproved: true },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const account = await t.deps.uow.repos.accounts.get(workspaceId, accountId);
    expect(account?.status).toBe("calibrating");

    // A verified connection also closes the connection step.
    const t2 = makeTestDeps();
    const ids2 = await openTestAccount(t2);
    const scope2 = { workspaceId: ids2.workspaceId, accountId: ids2.accountId };
    await t2.deps.uow.repos.connections.create(scope2, {
      provider: "instagram",
      encryptedToken: "v1:fake",
      status: "active",
    });
    expect((await advance(t2, ids2, { step: "connection" })).ok).toBe(true);
  });

  it("blocks calibration entry with the missing checklist items, writing nothing", async () => {
    const { t, workspaceId, accountId } = await setup();
    const ids = { workspaceId, accountId };
    const scope = { workspaceId, accountId };
    const blocked = await advance(t, ids, { step: "go_live", secondInstallmentPaid: true });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error.code).toBe("calibration_entry_blocked");
      expect(blocked.error.message).toContain("plan_and_mandates");
    }
    // Atomic: the installment flag was rolled back with the blocked entry.
    expect(await t.deps.uow.repos.events.list(scope)).toHaveLength(2); // open_account only
    const account = await t.deps.uow.repos.accounts.get(workspaceId, accountId);
    expect(account?.status).toBe("deploying");

    // Flags accumulate across calls on other steps, then go_live succeeds.
    await approvePlanAndMandate(t, ids);
    expect(
      (await advance(t, ids, { step: "connection", manualModeAgreed: true })).ok,
    ).toBe(true);
    expect((await advance(t, ids, { step: "plan" })).ok).toBe(true);
    expect((await advance(t, ids, { step: "mandate" })).ok).toBe(true);
    const entered = await advance(t, ids, {
      step: "go_live",
      secondInstallmentPaid: true,
      brandVoiceApproved: true,
    });
    expect(entered.ok).toBe(true);
  });

  it("refuses client actors", async () => {
    const { t, workspaceId, accountId } = await setup();
    const envelope = {
      type: "advance_onboarding",
      workspaceId,
      accountId,
      payload: { step: "scope_confirm" },
    } as const;
    for (const actor of [testActors.approver, testActors.substitute, testActors.member]) {
      const outcome = await executeCommand(t.deps, actor, envelope);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    }
  });
});

describe("pause_onboarding", () => {
  it("pauses and resumes the implantation with its steps", async () => {
    const { t, workspaceId, accountId } = await setup();
    const scope = { workspaceId, accountId };
    const paused = await executeCommand(t.deps, testActors.system, {
      type: "pause_onboarding",
      workspaceId,
      accountId,
      payload: { direction: "pause", reason: "10 business days without progress" },
    });
    expect(paused.ok).toBe(true);
    if (!paused.ok) return;
    expect(paused.value.events.map((e) => e.eventType)).toEqual([
      "account.implantation_paused",
      "notification.requested",
    ]);
    expect((await t.deps.uow.repos.accounts.get(workspaceId, accountId))?.status).toBe("paused");
    const steps = await t.deps.uow.repos.onboarding.list(scope);
    expect(steps.every((s) => s.status === "paused")).toBe(true);

    // Implantation commands are blocked while paused.
    const blocked = await executeCommand(t.deps, testActors.agent, {
      type: "propose_plan",
      workspaceId,
      accountId,
      payload: { content: {} },
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe("invalid_transition");

    const resumed = await executeCommand(t.deps, testActors.support, {
      type: "pause_onboarding",
      workspaceId,
      accountId,
      payload: { direction: "resume" },
    });
    expect(resumed.ok).toBe(true);
    expect((await t.deps.uow.repos.accounts.get(workspaceId, accountId))?.status).toBe("deploying");
    const restored = await t.deps.uow.repos.onboarding.list(scope);
    expect(restored.every((s) => s.status === "pending")).toBe(true);
  });

  it("rejects double pause, resume-without-pause, and agents", async () => {
    const { t, workspaceId, accountId } = await setup();
    const resumeEarly = await executeCommand(t.deps, testActors.support, {
      type: "pause_onboarding",
      workspaceId,
      accountId,
      payload: { direction: "resume" },
    });
    expect(resumeEarly.ok).toBe(false);
    if (!resumeEarly.ok) expect(resumeEarly.error.code).toBe("invalid_transition");

    expect(
      (
        await executeCommand(t.deps, testActors.system, {
          type: "pause_onboarding",
          workspaceId,
          accountId,
          payload: { direction: "pause" },
        })
      ).ok,
    ).toBe(true);
    const again = await executeCommand(t.deps, testActors.system, {
      type: "pause_onboarding",
      workspaceId,
      accountId,
      payload: { direction: "pause" },
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("invalid_transition");

    const agent = await executeCommand(t.deps, testActors.agent, {
      type: "pause_onboarding",
      workspaceId,
      accountId,
      payload: { direction: "resume" },
    });
    expect(agent.ok).toBe(false);
    if (!agent.ok) expect(agent.error.code).toBe("forbidden_actor");
  });
});
