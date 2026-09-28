// advance_onboarding / pause_onboarding: move the 7 implantation steps,
// enter calibration through the domain checklist, and pause/resume the
// implantation itself.
//
// The calibration milestones with no dedicated table are recorded by their
// own commands — approve_brand_voice and agree_manual_mode (client
// decisions, with receipts), record_installment_paid (staff) — and read back
// from those records.

import { z } from "zod";
import {
  enterCalibration,
  err,
  ok,
  pauseImplantation,
  resumeImplantation,
  type AccountEvent,
  type Result,
} from "../domain";
import type { EquipeOnboardingStepKey } from "../data";
import type { EquipeModuleDeps } from "./ports";
import {
  advanceOnboardingPayloadSchema,
  agreeManualModePayloadSchema,
  approveBrandVoicePayloadSchema,
  pauseOnboardingPayloadSchema,
  recordInstallmentPaidPayloadSchema,
} from "./envelope";
import { MATERIAL_REGISTERED_EVENT, SCOPE_CONFIRMED_EVENT } from "./scope-materials";
import {
  appendEvent,
  fromDomainAccountStatus,
  loadAccountOrError,
  requestNotification,
  requireDeploying,
  scopeOf,
  transact,
  versionHash,
  writeReceipt,
  type CommandContext,
  type CommandSuccess,
  type TxBase,
} from "./shared";

export type AdvanceOnboardingPayload = z.infer<typeof advanceOnboardingPayloadSchema>;
export type PauseOnboardingPayload = z.infer<typeof pauseOnboardingPayloadSchema>;
export type ApproveBrandVoicePayload = z.infer<typeof approveBrandVoicePayloadSchema>;
export type AgreeManualModePayload = z.infer<typeof agreeManualModePayloadSchema>;
export type RecordInstallmentPaidPayload = z.infer<typeof recordInstallmentPaidPayloadSchema>;

export const INSTALLMENT_PAID_EVENT = "billing.installment_paid";
export const BRAND_VOICE_APPROVED_EVENT = "brand.voice_approved";
export const MANUAL_MODE_AGREED_EVENT = "connection.manual_mode_agreed";
export const ONBOARDING_STEP_ADVANCED_EVENT = "onboarding.step_advanced";

async function hasEvent(ctx: CommandContext, eventType: string): Promise<boolean> {
  const found = await ctx.repos.events.list(scopeOf(ctx), { eventType });
  return found.length > 0;
}

async function hasInstallment(ctx: CommandContext, installment: number): Promise<boolean> {
  const records = await ctx.repos.events.list(scopeOf(ctx), { eventType: INSTALLMENT_PAID_EVENT });
  return records.some(
    (event) =>
      typeof event.payload === "object" &&
      event.payload !== null &&
      (event.payload as { installment?: unknown }).installment === installment,
  );
}

/** Per-step completion gate; go_live runs the calibration checklist. */
async function checkStepGate(
  ctx: CommandContext,
  step: EquipeOnboardingStepKey,
): Promise<Result<void>> {
  const scope = scopeOf(ctx);
  switch (step) {
    case "scope_confirm":
      return (await hasEvent(ctx, SCOPE_CONFIRMED_EVENT))
        ? ok(undefined)
        : err("invalid_transition", "scope not confirmed yet");
    case "materials":
      return (await hasEvent(ctx, MATERIAL_REGISTERED_EVENT))
        ? ok(undefined)
        : err("invalid_transition", "no materials registered yet");
    case "context": {
      const versions = await ctx.repos.contexts.list(scope);
      const approved = versions.filter((v) => v.status === "approved").length;
      const proposed = versions.filter((v) => v.status === "proposed").length;
      if (approved < 1) return err("invalid_transition", "no approved context section yet");
      if (proposed > 0) return err("invalid_transition", "a context proposal is still open");
      return ok(undefined);
    }
    case "plan": {
      const plans = await ctx.repos.plans.list(scope);
      return plans.some((p) => p.status === "approved")
        ? ok(undefined)
        : err("invalid_transition", "no approved plan yet");
    }
    case "mandate": {
      const mandates = await ctx.repos.mandates.list(scope);
      return mandates.some((m) => m.status === "approved")
        ? ok(undefined)
        : err("invalid_transition", "no approved mandate yet");
    }
    case "connection": {
      const connections = await ctx.repos.connections.list(scope);
      if (connections.some((c) => c.status === "active")) return ok(undefined);
      return (await hasEvent(ctx, MANUAL_MODE_AGREED_EVENT))
        ? ok(undefined)
        : err("invalid_transition", "no verified connection or manual mode yet");
    }
    case "go_live":
      return checkCalibrationEntry(ctx);
  }
}

async function checkCalibrationEntry(ctx: CommandContext): Promise<Result<void>> {
  const scope = scopeOf(ctx);
  const plans = await ctx.repos.plans.list(scope);
  const mandates = await ctx.repos.mandates.list(scope);
  const connections = await ctx.repos.connections.list(scope);
  const entry = {
    planAndMandatesApproved:
      plans.some((p) => p.status === "approved") &&
      mandates.some((m) => m.status === "approved"),
    brandVoiceApproved: await hasEvent(ctx, BRAND_VOICE_APPROVED_EVENT),
    connectionsVerified: connections.some((c) => c.status === "active"),
    manualModeAgreed: await hasEvent(ctx, MANUAL_MODE_AGREED_EVENT),
    secondInstallmentPaid: await hasInstallment(ctx, 2),
  };
  const decided = enterCalibration({ status: "implantation" }, entry);
  if (!decided.ok) return decided;
  await appendDomainEvents(ctx, decided.value.events);
  await ctx.repos.accounts.update(ctx.workspaceId, ctx.accountId, {
    status: fromDomainAccountStatus(decided.value.state.status),
  });
  return ok(undefined);
}

async function appendDomainEvents(ctx: CommandContext, events: AccountEvent[]): Promise<void> {
  for (const event of events) {
    await appendEvent(ctx, {
      eventType: event.type,
      objectType: "account",
      objectId: ctx.accountId,
      payload: event,
    });
  }
}

/**
 * The approver/substitute approves the brand voice: a receipt pins the exact
 * text hash, like the other approvals.
 */
export async function runApproveBrandVoice(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ApproveBrandVoicePayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const deploying = requireDeploying(account.value);
    if (!deploying.ok) return deploying;
    const hash = versionHash(payload.voice);
    const receipt = await writeReceipt(ctx, {
      objectType: "brand_voice",
      objectId: ctx.accountId,
      objectVersion: hash,
      action: "approve_brand_voice",
    });
    await appendEvent(ctx, {
      eventType: BRAND_VOICE_APPROVED_EVENT,
      objectType: "account",
      objectId: ctx.accountId,
      payload: { versionHash: hash },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "brand.voice_approved",
    });
    return ok({ versionHash: hash, receiptId: receipt.id });
  });
}

/** The approver/substitute agrees to run the account in manual mode. */
export async function runAgreeManualMode(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: AgreeManualModePayload,
): Promise<Result<CommandSuccess>> {
  void payload;
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const deploying = requireDeploying(account.value);
    if (!deploying.ok) return deploying;
    const receipt = await writeReceipt(ctx, {
      objectType: "connection",
      objectId: ctx.accountId,
      objectVersion: versionHash({ mode: "manual" }),
      action: "agree_manual_mode",
    });
    await appendEvent(ctx, {
      eventType: MANUAL_MODE_AGREED_EVENT,
      objectType: "account",
      objectId: ctx.accountId,
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "connection.manual_mode_agreed",
    });
    return ok({ receiptId: receipt.id });
  });
}

/** Support or operations records a paid installment with its reference. */
export async function runRecordInstallmentPaid(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: RecordInstallmentPaidPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const deploying = requireDeploying(account.value);
    if (!deploying.ok) return deploying;
    await appendEvent(ctx, {
      eventType: INSTALLMENT_PAID_EVENT,
      objectType: "account",
      objectId: ctx.accountId,
      payload: { installment: payload.installment, reference: payload.reference },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "billing.installment_paid",
    });
    return ok({ installment: payload.installment, reference: payload.reference });
  });
}

/**
 * Mark an onboarding step done once its gate holds. Milestones accumulate
 * through their own commands; go_live additionally moves the account into
 * calibration.
 */
export async function runAdvanceOnboarding(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: AdvanceOnboardingPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const deploying = requireDeploying(account.value);
    if (!deploying.ok) return deploying;
    const scope = scopeOf(ctx);
    const step = (await ctx.repos.onboarding.list(scope)).find((s) => s.step === payload.step);
    if (!step) {
      return err("invalid_transition", `unknown onboarding step ${payload.step}`);
    }
    if (step.status !== "pending" && step.status !== "in_progress") {
      return err("invalid_transition", `onboarding step ${payload.step} is ${step.status}`);
    }
    const gate = await checkStepGate(ctx, payload.step);
    if (!gate.ok) return gate;
    await ctx.repos.onboarding.update(scope, step.id, { status: "done", completedAt: ctx.now });
    await appendEvent(ctx, {
      eventType: ONBOARDING_STEP_ADVANCED_EVENT,
      objectType: "onboarding_step",
      objectId: step.id,
      payload: { step: payload.step },
    });
    if (payload.step === "go_live") {
      await requestNotification(ctx, { recipientRole: "approver", templateKey: "calibration.entered" });
    } else {
      await requestNotification(ctx, {
        recipientRole: "strategist",
        templateKey: "onboarding.step_advanced",
      });
    }
    return ok({ step: payload.step });
  });
}

/** Pause (10 business days without progress) or resume the implantation. */
export async function runPauseOnboarding(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: PauseOnboardingPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const scope = scopeOf(ctx);
    if (payload.direction === "pause") {
      if (account.value.status !== "deploying") {
        return err("invalid_transition", `cannot pause implantation from ${account.value.status}`);
      }
      const decided = pauseImplantation({ status: "implantation" });
      if (!decided.ok) return decided;
      await ctx.repos.accounts.update(ctx.workspaceId, ctx.accountId, {
        status: fromDomainAccountStatus(decided.value.state.status),
      });
      for (const step of await ctx.repos.onboarding.list(scope)) {
        if (step.status === "pending" || step.status === "in_progress") {
          await ctx.repos.onboarding.update(scope, step.id, { status: "paused" });
        }
      }
      await appendDomainEvents(ctx, decided.value.events);
      await requestNotification(ctx, {
        recipientRole: "approver",
        templateKey: "implantation.paused",
        detail: payload.reason ? { reason: payload.reason } : undefined,
      });
      return ok({ direction: "pause" as const });
    }
    if (account.value.status !== "paused") {
      return err("invalid_transition", `cannot resume implantation from ${account.value.status}`);
    }
    const decided = resumeImplantation({ status: "implantation_paused" });
    if (!decided.ok) return decided;
    await ctx.repos.accounts.update(ctx.workspaceId, ctx.accountId, {
      status: fromDomainAccountStatus(decided.value.state.status),
    });
    for (const step of await ctx.repos.onboarding.list(scope)) {
      if (step.status === "paused") {
        await ctx.repos.onboarding.update(scope, step.id, { status: "pending" });
      }
    }
    await appendDomainEvents(ctx, decided.value.events);
    await requestNotification(ctx, { recipientRole: "approver", templateKey: "implantation.resumed" });
    return ok({ direction: "resume" as const });
  });
}
