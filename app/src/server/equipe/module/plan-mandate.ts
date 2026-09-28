// Step 6 of the implantação flow: the cycle Plan and the mandates.
// The agent proposes; the approver/substitute approves each with a receipt.
// Mandates start in shadow mode (payload may opt out for mandates that must
// act immediately, e.g. the publication mandate).

import { z } from "zod";
import { err, ok, type Result } from "../domain";
import type { EquipeMandate, EquipePlan } from "../data";
import type { EquipeModuleDeps } from "./ports";
import {
  approveMandatePayloadSchema,
  approvePlanPayloadSchema,
  proposeMandatePayloadSchema,
  proposePlanPayloadSchema,
} from "./envelope";
import {
  appendEvent,
  loadAccountOrError,
  requestNotification,
  requireActivationAccount,
  requireDeploying,
  scopeOf,
  stableStringify,
  transact,
  versionHash,
  writeReceipt,
  type CommandContext,
  type CommandSuccess,
  type TxBase,
} from "./shared";

export type ProposePlanPayload = z.infer<typeof proposePlanPayloadSchema>;
export type ApprovePlanPayload = z.infer<typeof approvePlanPayloadSchema>;
export type ProposeMandatePayload = z.infer<typeof proposeMandatePayloadSchema>;
export type ApproveMandatePayload = z.infer<typeof approveMandatePayloadSchema>;

export const PLAN_PROPOSED_EVENT = "plan.proposed";
export const PLAN_APPROVED_EVENT = "plan.approved";
export const MANDATE_PROPOSED_EVENT = "mandate.proposed";
export const MANDATE_APPROVED_EVENT = "mandate.approved";

/** Hash of the canonical plan content; stored on the approval receipt. */
export function planVersionHash(content: unknown): string {
  return versionHash(content);
}

export type MandateRule = {
  frontId: string | null;
  shadow: boolean;
  limits: unknown;
  window: unknown;
  validFrom: Date | string | null;
  validUntil: Date | string | null;
  stopCondition: unknown;
};

export function mandateRuleOf(mandate: EquipeMandate): MandateRule {
  return {
    frontId: mandate.frontId,
    shadow: mandate.shadow,
    limits: mandate.limits,
    window: mandate.window,
    validFrom: mandate.validFrom,
    validUntil: mandate.validUntil,
    stopCondition: mandate.stopCondition,
  };
}

/** Hash of the canonical mandate rule; stored on the approval receipt. */
export function mandateVersionHash(rule: MandateRule): string {
  return versionHash(rule);
}

/**
 * The rule minus the shadow flag: what an activation must preserve.
 * Shared with propose_mandate_activation's duplicate check.
 */
export function liveRuleKey(rule: MandateRule): string {
  return stableStringify({
    frontId: rule.frontId,
    limits: rule.limits,
    window: rule.window,
    validFrom: rule.validFrom,
    validUntil: rule.validUntil,
    stopCondition: rule.stopCondition,
  });
}

/**
 * The approved shadow mandate a proposed non-shadow version would take
 * live — same rule except the shadow flag — or null when the proposal is
 * not an activation (an agent proposal, no approved base, …). Latest base
 * wins; approval supersedes the older ones anyway.
 */
export function activationBaseOf(
  mandates: EquipeMandate[],
  proposed: EquipeMandate,
): EquipeMandate | null {
  if (proposed.status !== "proposed" || proposed.shadow) return null;
  const key = liveRuleKey(mandateRuleOf(proposed));
  let best: EquipeMandate | null = null;
  for (const mandate of mandates) {
    if (mandate.status !== "approved" || !mandate.shadow) continue;
    if (liveRuleKey(mandateRuleOf(mandate)) !== key) continue;
    if (!best || mandate.version > best.version) best = mandate;
  }
  return best;
}

function latestPlan(plans: EquipePlan[]): EquipePlan | null {
  let best: EquipePlan | null = null;
  for (const plan of plans) {
    if (!best || plan.version > best.version) best = plan;
  }
  return best;
}

function latestMandate(mandates: EquipeMandate[]): EquipeMandate | null {
  let best: EquipeMandate | null = null;
  for (const mandate of mandates) {
    if (!best || mandate.version > best.version) best = mandate;
  }
  return best;
}

async function supersedeProposedPlans(ctx: CommandContext): Promise<void> {
  const scope = scopeOf(ctx);
  for (const plan of await ctx.repos.plans.list(scope)) {
    if (plan.status === "proposed") {
      await ctx.repos.plans.update(scope, plan.id, { status: "superseded" });
    }
  }
}

async function supersedeProposedMandates(ctx: CommandContext): Promise<void> {
  const scope = scopeOf(ctx);
  for (const mandate of await ctx.repos.mandates.list(scope)) {
    if (mandate.status === "proposed") {
      await ctx.repos.mandates.update(scope, mandate.id, { status: "superseded" });
    }
  }
}

/** The agent proposes plan v(n+1); an open proposal is superseded. */
export async function runProposePlan(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ProposePlanPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const deploying = requireDeploying(account.value);
    if (!deploying.ok) return deploying;
    const scope = scopeOf(ctx);
    const nextVersion = (latestPlan(await ctx.repos.plans.list(scope))?.version ?? 0) + 1;
    await supersedeProposedPlans(ctx);
    const created = await ctx.repos.plans.create(scope, {
      version: nextVersion,
      status: "proposed",
      content: payload.content,
    });
    await appendEvent(ctx, {
      eventType: PLAN_PROPOSED_EVENT,
      objectType: "plan",
      objectId: created.id,
      payload: { version: nextVersion },
    });
    await requestNotification(ctx, { recipientRole: "approver", templateKey: "plan.proposed" });
    return ok({ version: nextVersion, planId: created.id });
  });
}

/** The approver/substitute approves the open plan — exact hash only. */
export async function runApprovePlan(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ApprovePlanPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const deploying = requireDeploying(account.value);
    if (!deploying.ok) return deploying;
    const scope = scopeOf(ctx);
    const open = latestPlan(
      (await ctx.repos.plans.list(scope)).filter((plan) => plan.status === "proposed"),
    );
    if (!open) {
      return err("invalid_transition", "no proposed plan version");
    }
    const hash = planVersionHash(open.content);
    if (hash !== payload.expectedVersionHash) {
      return err("stale_version", `plan changed since version ${open.version} was seen`);
    }
    const receipt = await writeReceipt(ctx, {
      objectType: "plan",
      objectId: open.id,
      objectVersion: hash,
      action: "approve_plan",
      detail: { version: open.version },
    });
    for (const plan of await ctx.repos.plans.list(scope)) {
      if (plan.status === "approved") {
        await ctx.repos.plans.update(scope, plan.id, { status: "superseded" });
      }
    }
    await ctx.repos.plans.update(scope, open.id, {
      status: "approved",
      receiptId: receipt.id,
      approvedAt: ctx.now,
    });
    await appendEvent(ctx, {
      eventType: PLAN_APPROVED_EVENT,
      objectType: "plan",
      objectId: open.id,
      payload: { version: open.version, versionHash: hash },
    });
    await requestNotification(ctx, { recipientRole: "strategist", templateKey: "plan.approved" });
    return ok({ version: open.version, receiptId: receipt.id, versionHash: hash });
  });
}

/** The agent proposes mandate v(n+1); an open proposal is superseded. */
export async function runProposeMandate(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ProposeMandatePayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const deploying = requireDeploying(account.value);
    if (!deploying.ok) return deploying;
    const scope = scopeOf(ctx);
    if (payload.frontId) {
      const front = await ctx.repos.fronts.get(scope, payload.frontId);
      if (!front) {
        return err("unknown_front", `unknown front ${payload.frontId}`);
      }
    }
    const nextVersion = (latestMandate(await ctx.repos.mandates.list(scope))?.version ?? 0) + 1;
    await supersedeProposedMandates(ctx);
    const created = await ctx.repos.mandates.create(scope, {
      frontId: payload.frontId ?? null,
      version: nextVersion,
      status: "proposed",
      shadow: payload.shadow,
      limits: payload.limits ?? null,
      window: payload.window ?? null,
      validFrom: payload.validFrom ?? null,
      validUntil: payload.validUntil ?? null,
      stopCondition: payload.stopCondition ?? null,
    });
    await appendEvent(ctx, {
      eventType: MANDATE_PROPOSED_EVENT,
      objectType: "mandate",
      objectId: created.id,
      payload: { version: nextVersion, frontId: created.frontId, shadow: created.shadow },
    });
    await requestNotification(ctx, { recipientRole: "approver", templateKey: "mandate.proposed" });
    return ok({ version: nextVersion, mandateId: created.id });
  });
}

/** The approver/substitute approves the open mandate — exact hash only. */
export async function runApproveMandate(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ApproveMandatePayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const scope = scopeOf(ctx);
    const mandates = await ctx.repos.mandates.list(scope);
    const open = latestMandate(mandates.filter((mandate) => mandate.status === "proposed"));
    // #584: an activation (same rule as an approved shadow version) also
    // approves while calibrating or active; ordinary proposals stay
    // implantation-scoped.
    const activation = open !== null && activationBaseOf(mandates, open) !== null;
    const allowed = activation
      ? requireActivationAccount(account.value)
      : requireDeploying(account.value);
    if (!allowed.ok) return allowed;
    if (!open) {
      return err("invalid_transition", "no proposed mandate version");
    }
    const hash = mandateVersionHash(mandateRuleOf(open));
    if (hash !== payload.expectedVersionHash) {
      return err("stale_version", `mandate changed since version ${open.version} was seen`);
    }
    const receipt = await writeReceipt(ctx, {
      objectType: "mandate",
      objectId: open.id,
      objectVersion: hash,
      action: "approve_mandate",
      detail: { version: open.version, frontId: open.frontId },
    });
    for (const mandate of mandates) {
      if (mandate.status === "approved") {
        await ctx.repos.mandates.update(scope, mandate.id, { status: "superseded" });
      }
    }
    await ctx.repos.mandates.update(scope, open.id, { status: "approved", receiptId: receipt.id });
    await appendEvent(ctx, {
      eventType: MANDATE_APPROVED_EVENT,
      objectType: "mandate",
      objectId: open.id,
      payload: { version: open.version, versionHash: hash },
    });
    await requestNotification(ctx, { recipientRole: "strategist", templateKey: "mandate.approved" });
    return ok({ version: open.version, receiptId: receipt.id, versionHash: hash });
  });
}
