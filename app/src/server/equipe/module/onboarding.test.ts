import { describe, expect, it } from "vitest";
import type { Actor } from "../domain";
import { executeCommand } from "./commands";
import { contextVersionHash } from "./context";
import { mandateRuleOf, mandateVersionHash, planVersionHash } from "./plan-mandate";
import { versionHash } from "./shared";
import {
  makeTestDeps,
  openTestAccount,
  type TestAccountActors,
  type TestDeps,
  uuid,
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

async function advance(t: TestDeps, ids: Ids, payload: Record<string, unknown>, actor?: Actor) {
  return executeCommand(t.deps, ctx(ids, actor ?? ids.actors.agent), {
    type: "advance_onboarding",
    payload,
  });
}

async function approvePlanAndMandate(t: TestDeps, ids: Ids) {
  const content = { goals: ["go"], fronts: ["social_instagram"], rhythm: "weekly" };
  expect(
    (
      await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
        type: "propose_plan",
        payload: { content },
      })
    ).ok,
  ).toBe(true);
  expect(
    (
      await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
        type: "approve_plan",
        payload: { expectedVersionHash: planVersionHash(content) },
      })
    ).ok,
  ).toBe(true);
  expect(
    (
      await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
        type: "propose_mandate",
        payload: { limits: { postsPerWeek: 6 } },
      })
    ).ok,
  ).toBe(true);
  const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
  const mandates = await t.deps.uow.repos.mandates.list(scope);
  expect(
    (
      await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
        type: "approve_mandate",
        payload: { expectedVersionHash: mandateVersionHash(mandateRuleOf(mandates[0]!)) },
      })
    ).ok,
  ).toBe(true);
}

async function recordMilestones(t: TestDeps, ids: Ids) {
  expect(
    (
      await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
        type: "approve_brand_voice",
        payload: { voice: "direta, sem jargão" },
      })
    ).ok,
  ).toBe(true);
  expect(
    (
      await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
        type: "agree_manual_mode",
        payload: {},
      })
    ).ok,
  ).toBe(true);
  expect(
    (
      await executeCommand(t.deps, ctx(ids, ids.actors.support), {
        type: "record_installment_paid",
        payload: { installment: 2, reference: "pix-2" },
      })
    ).ok,
  ).toBe(true);
}

describe("advance_onboarding", () => {
  it("completes steps whose gates hold", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const scope = { workspaceId, accountId };

    expect(
      (
        await executeCommand(t.deps, ctx(ids, actors.approver), {
          type: "confirm_scope",
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
        await executeCommand(t.deps, ctx(ids, actors.member), {
          type: "register_material",
          payload: { assetId, kind: "deck" },
        })
      ).ok,
    ).toBe(true);
    expect((await advance(t, ids, { step: "materials" })).ok).toBe(true);
  });

  it("blocks steps whose gates do not hold, and re-completing done steps", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
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
        await executeCommand(t.deps, ctx(ids, actors.approver), {
          type: "confirm_scope",
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
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const fields = { offer: { status: "sustained" as const, value: "x" } };
    expect(
      (
        await executeCommand(t.deps, ctx(ids, actors.agent), {
          type: "propose_context_section",
          payload: { section: "oferta", fields },
        })
      ).ok,
    ).toBe(true);
    expect((await advance(t, ids, { step: "context" })).ok).toBe(false);
    expect(
      (
        await executeCommand(t.deps, ctx(ids, actors.approver), {
          type: "approve_context_section",
          payload: { section: "oferta", expectedVersionHash: contextVersionHash(fields) },
        })
      ).ok,
    ).toBe(true);
    expect((await advance(t, ids, { step: "context" })).ok).toBe(true);
  });

  it("enters calibration when the full checklist holds (manual mode)", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const scope = { workspaceId, accountId };
    await approvePlanAndMandate(t, ids);
    await recordMilestones(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, actors.support), {
      type: "advance_onboarding",
      payload: { step: "go_live" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "account.entered_calibration",
      "onboarding.step_advanced",
      "notification.requested",
    ]);
    expect(outcome.value.events[2]?.payload).toMatchObject({
      recipientRole: "approver",
      templateKey: "calibration.entered",
    });
    const account = await t.deps.uow.repos.accounts.get(workspaceId, accountId);
    expect(account?.status).toBe("calibrating");
    const steps = await t.deps.uow.repos.onboarding.list(scope);
    expect(steps.find((s) => s.step === "go_live")?.status).toBe("done");
  });

  it("enters calibration with a verified connection instead of manual mode", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const scope = { workspaceId, accountId };
    await approvePlanAndMandate(t, ids);
    await t.deps.uow.repos.connections.create(scope, {
      provider: "instagram",
      encryptedToken: "v1:fake",
      status: "active",
    });
    expect(
      (
        await executeCommand(t.deps, ctx(ids, actors.approver), {
          type: "approve_brand_voice",
          payload: { voice: "direta, sem jargão" },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await executeCommand(t.deps, ctx(ids, actors.operations), {
          type: "record_installment_paid",
          payload: { installment: 2, reference: "boleto-2" },
        })
      ).ok,
    ).toBe(true);
    const outcome = await executeCommand(t.deps, ctx(ids, actors.system), {
      type: "advance_onboarding",
      payload: { step: "go_live" },
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
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const scope = { workspaceId, accountId };
    const blocked = await advance(t, ids, { step: "go_live" });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error.code).toBe("calibration_entry_blocked");
      expect(blocked.error.message).toContain("plan_and_mandates");
    }
    // Atomic: nothing was written by the blocked entry.
    expect(await t.deps.uow.repos.events.list(scope)).toHaveLength(3); // open_account + primary thread
    const account = await t.deps.uow.repos.accounts.get(workspaceId, accountId);
    expect(account?.status).toBe("deploying");

    // Milestones accumulate through their own commands, then go_live succeeds.
    await approvePlanAndMandate(t, ids);
    expect(
      (
        await executeCommand(t.deps, ctx(ids, actors.approver), {
          type: "agree_manual_mode",
          payload: {},
        })
      ).ok,
    ).toBe(true);
    expect((await advance(t, ids, { step: "connection" })).ok).toBe(true);
    expect((await advance(t, ids, { step: "plan" })).ok).toBe(true);
    expect((await advance(t, ids, { step: "mandate" })).ok).toBe(true);
    expect(
      (
        await executeCommand(t.deps, ctx(ids, actors.substitute), {
          type: "approve_brand_voice",
          payload: { voice: "direta, sem jargão" },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await executeCommand(t.deps, ctx(ids, actors.support), {
          type: "record_installment_paid",
          payload: { installment: 2, reference: "pix-2" },
        })
      ).ok,
    ).toBe(true);
    const entered = await advance(t, ids, { step: "go_live" });
    expect(entered.ok).toBe(true);
  });

  it("ignores the removed milestone flags: only the milestone commands record them", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const scope = { workspaceId, accountId };
    const outcome = await advance(t, ids, {
      step: "connection",
      secondInstallmentPaid: true,
      brandVoiceApproved: true,
      manualModeAgreed: true,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("invalid_transition");
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "billing.installment_paid" })).toHaveLength(0);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "brand.voice_approved" })).toHaveLength(0);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "connection.manual_mode_agreed" })).toHaveLength(0);
  });

  it("refuses client actors", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const rawCommand = {
      type: "advance_onboarding",
      payload: { step: "scope_confirm" },
    } as const;
    for (const actor of [actors.approver, actors.substitute, actors.member]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), rawCommand);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    }
  });
});

describe("approve_brand_voice", () => {
  it("records the client approval with a receipt on the voice hash", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const scope = { workspaceId, accountId };
    const voice = "direta, sem jargão, com humor leve";
    const outcome = await executeCommand(t.deps, ctx(ids, actors.substitute), {
      type: "approve_brand_voice",
      payload: { voice },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const hash = versionHash(voice);
    expect(outcome.value.data).toMatchObject({ versionHash: hash });
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "brand.voice_approved",
      "notification.requested",
    ]);
    expect(outcome.value.events[0]?.payload).toMatchObject({ versionHash: hash });

    const receipts = await t.deps.uow.repos.receipts.list(scope);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      personKind: "client_person",
      personRole: "substitute",
      objectType: "brand_voice",
      objectId: accountId,
      objectVersion: hash,
      action: "approve_brand_voice",
    });
  });

  it("is a client decision: agents, jobs, members and staff cannot approve", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const rawCommand = {
      type: "approve_brand_voice",
      payload: { voice: "x" },
    } as const;
    for (const actor of [actors.agent, actors.system, actors.member, actors.custodian, actors.support, actors.operations, actors.quality]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), rawCommand);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    }
    expect((await executeCommand(t.deps, ctx(ids, actors.approver), rawCommand)).ok).toBe(true);
  });
});

describe("agree_manual_mode", () => {
  it("records the client agreement with a receipt", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const scope = { workspaceId, accountId };
    const outcome = await executeCommand(t.deps, ctx(ids, actors.approver), {
      type: "agree_manual_mode",
      payload: {},
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "connection.manual_mode_agreed",
      "notification.requested",
    ]);

    const receipts = await t.deps.uow.repos.receipts.list(scope);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      personKind: "client_person",
      personRole: "approver",
      objectType: "connection",
      objectId: accountId,
      action: "agree_manual_mode",
    });

    // The agreement closes the connection step gate.
    expect((await advance(t, ids, { step: "connection" })).ok).toBe(true);
  });

  it("is a client decision: agents, jobs, members and staff cannot agree", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const rawCommand = { type: "agree_manual_mode", payload: {} } as const;
    for (const actor of [actors.agent, actors.system, actors.member, actors.custodian, actors.support, actors.operations]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), rawCommand);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    }
    expect((await executeCommand(t.deps, ctx(ids, actors.substitute), rawCommand)).ok).toBe(true);
  });
});

describe("record_installment_paid", () => {
  it("records each installment with its reference", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const scope = { workspaceId, accountId };
    for (const [actor, installment, reference] of [
      [actors.support, 1, "pix-1"],
      [actors.operations, 2, "boleto-2"],
    ] as const) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), {
        type: "record_installment_paid",
        payload: { installment, reference },
      });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.value.events.map((e) => e.eventType)).toEqual([
        "billing.installment_paid",
        "notification.requested",
      ]);
    }
    const records = await t.deps.uow.repos.events.list(scope, {
      eventType: "billing.installment_paid",
    });
    expect(records.map((e) => e.payload)).toEqual([
      { installment: 1, reference: "pix-1" },
      { installment: 2, reference: "boleto-2" },
    ]);
  });

  it("lets only support and operations record; never agents, jobs or clients", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const rawCommand = {
      type: "record_installment_paid",
      payload: { installment: 2, reference: "pix-2" },
    } as const;
    for (const actor of [actors.agent, actors.system, actors.approver, actors.substitute, actors.member, actors.quality]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), rawCommand);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("forbidden_actor");
    }
    expect((await executeCommand(t.deps, ctx(ids, actors.support), rawCommand)).ok).toBe(true);
  });

  it("rejects installments outside 1–2 and empty references", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    for (const payload of [
      { installment: 3, reference: "x" },
      { installment: 2, reference: "" },
      { installment: 2 },
    ]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actors.support), {
        type: "record_installment_paid",
        payload,
      });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("invalid_command");
    }
  });
});

describe("pause_onboarding", () => {
  it("pauses and resumes the implantation with its steps", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const scope = { workspaceId, accountId };
    const paused = await executeCommand(t.deps, ctx(ids, actors.system), {
      type: "pause_onboarding",
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
    const blocked = await executeCommand(t.deps, ctx(ids, actors.agent), {
      type: "propose_plan",
      payload: { content: {} },
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe("invalid_transition");

    const resumed = await executeCommand(t.deps, ctx(ids, actors.support), {
      type: "pause_onboarding",
      payload: { direction: "resume" },
    });
    expect(resumed.ok).toBe(true);
    expect((await t.deps.uow.repos.accounts.get(workspaceId, accountId))?.status).toBe("deploying");
    const restored = await t.deps.uow.repos.onboarding.list(scope);
    expect(restored.every((s) => s.status === "pending")).toBe(true);
  });

  it("rejects double pause, resume-without-pause, and agents", async () => {
    const { t, workspaceId, accountId, actors } = await setup();
    const ids = { workspaceId, accountId, actors };
    const resumeEarly = await executeCommand(t.deps, ctx(ids, actors.support), {
      type: "pause_onboarding",
      payload: { direction: "resume" },
    });
    expect(resumeEarly.ok).toBe(false);
    if (!resumeEarly.ok) expect(resumeEarly.error.code).toBe("invalid_transition");

    expect(
      (
        await executeCommand(t.deps, ctx(ids, actors.system), {
          type: "pause_onboarding",
          payload: { direction: "pause" },
        })
      ).ok,
    ).toBe(true);
    const again = await executeCommand(t.deps, ctx(ids, actors.system), {
      type: "pause_onboarding",
      payload: { direction: "pause" },
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("invalid_transition");

    const agent = await executeCommand(t.deps, ctx(ids, actors.agent), {
      type: "pause_onboarding",
      payload: { direction: "resume" },
    });
    expect(agent.ok).toBe(false);
    if (!agent.ok) expect(agent.error.code).toBe("forbidden_actor");
  });
});
