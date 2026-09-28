// Strategist ideas decided by the client (#553): the approver/substitute
// accepts or rejects each proposal. Accepting a plan/mandate idea generates
// the new Plan/Mandate version straight away — the decision receipt covers
// it, so no second approval is needed. Content ideas carry no versioned
// object: the decision and its receipt are the whole effect.

import { z } from "zod";
import { err, ok, type Result } from "../domain";
import type { EquipeIdea } from "../data";
import type { EquipeModuleDeps } from "./ports";
import { decideIdeaPayloadSchema } from "./envelope";
import {
  MANDATE_APPROVED_EVENT,
  PLAN_APPROVED_EVENT,
  mandateRuleOf,
  mandateVersionHash,
  planVersionHash,
} from "./plan-mandate";
import {
  appendEvent,
  loadAccountOrError,
  requestNotification,
  scopeOf,
  transact,
  versionHash,
  writeReceipt,
  type CommandContext,
  type CommandSuccess,
  type TxBase,
} from "./shared";

export type DecideIdeaPayload = z.infer<typeof decideIdeaPayloadSchema>;

export const IDEA_DECIDED_EVENT = "idea.decided";

/** Hash of the idea content the client saw; the decision echoes it back. */
export function ideaVersionHash(idea: Pick<EquipeIdea, "kind" | "payload">): string {
  return versionHash({ kind: idea.kind, payload: idea.payload });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asDate(value: unknown): Date | null | undefined {
  if (value === null || value === undefined) return value ?? null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function supersedeOpenPlans(ctx: CommandContext): Promise<void> {
  const scope = scopeOf(ctx);
  for (const plan of await ctx.repos.plans.list(scope)) {
    if (plan.status === "approved" || plan.status === "proposed") {
      await ctx.repos.plans.update(scope, plan.id, { status: "superseded" });
    }
  }
}

async function supersedeOpenMandates(ctx: CommandContext): Promise<void> {
  const scope = scopeOf(ctx);
  for (const mandate of await ctx.repos.mandates.list(scope)) {
    if (mandate.status === "approved" || mandate.status === "proposed") {
      await ctx.repos.mandates.update(scope, mandate.id, { status: "superseded" });
    }
  }
}

function nextVersion(versions: number[]): number {
  return versions.reduce((best, version) => Math.max(best, version), 0) + 1;
}

/**
 * Accepting a plan idea births the approved plan version from the idea
 * payload. Open proposals predate the decided change, so they are
 * superseded — approving a stale proposal afterwards must be impossible.
 */
async function acceptPlanChange(
  ctx: CommandContext,
  idea: EquipeIdea,
): Promise<Result<{ id: string; version: number; versionHash: string }>> {
  if (!isRecord(idea.payload)) {
    return err("invalid_idea_payload", `idea ${idea.id} has no plan content`);
  }
  const scope = scopeOf(ctx);
  const plans = await ctx.repos.plans.list(scope);
  const version = nextVersion(plans.map((plan) => plan.version));
  await supersedeOpenPlans(ctx);
  const created = await ctx.repos.plans.create(scope, {
    version,
    status: "approved",
    content: idea.payload,
  });
  await ctx.repos.plans.update(scope, created.id, { approvedAt: ctx.now });
  const hash = planVersionHash(idea.payload);
  await appendEvent(ctx, {
    eventType: PLAN_APPROVED_EVENT,
    objectType: "plan",
    objectId: created.id,
    payload: { version, versionHash: hash, decidedIdeaId: idea.id },
  });
  return ok({ id: created.id, version, versionHash: hash });
}

/**
 * Accepting a mandate idea births the approved mandate version, picking
 * the rule fields from the idea payload (shadow by default, like any
 * mandate proposal).
 */
async function acceptMandateChange(
  ctx: CommandContext,
  idea: EquipeIdea,
): Promise<Result<{ id: string; version: number; versionHash: string; frontId: string | null }>> {
  if (!isRecord(idea.payload)) {
    return err("invalid_idea_payload", `idea ${idea.id} has no mandate rule`);
  }
  const scope = scopeOf(ctx);
  const rawFrontId = idea.payload.frontId ?? null;
  if (rawFrontId !== null && typeof rawFrontId !== "string") {
    return err("invalid_idea_payload", `idea ${idea.id} has an invalid front reference`);
  }
  const frontId = rawFrontId ? rawFrontId : null;
  if (frontId) {
    const front = await ctx.repos.fronts.get(scope, frontId);
    if (!front) {
      return err("unknown_front", `unknown front ${frontId}`);
    }
  }
  const validFrom = asDate(idea.payload.validFrom);
  const validUntil = asDate(idea.payload.validUntil);
  if (validFrom === undefined || validUntil === undefined) {
    return err("invalid_idea_payload", `idea ${idea.id} has an invalid validity window`);
  }
  if (validFrom && validUntil && validUntil <= validFrom) {
    return err("invalid_idea_payload", `idea ${idea.id} ends before it starts`);
  }
  const mandates = await ctx.repos.mandates.list(scope);
  const version = nextVersion(mandates.map((mandate) => mandate.version));
  await supersedeOpenMandates(ctx);
  const created = await ctx.repos.mandates.create(scope, {
    frontId,
    version,
    status: "approved",
    shadow: typeof idea.payload.shadow === "boolean" ? idea.payload.shadow : true,
    limits: idea.payload.limits ?? null,
    window: idea.payload.window ?? null,
    validFrom,
    validUntil,
    stopCondition: idea.payload.stopCondition ?? null,
  });
  const hash = mandateVersionHash(mandateRuleOf(created));
  await appendEvent(ctx, {
    eventType: MANDATE_APPROVED_EVENT,
    objectType: "mandate",
    objectId: created.id,
    payload: { version, versionHash: hash, frontId: created.frontId, decidedIdeaId: idea.id },
  });
  return ok({ id: created.id, version, versionHash: hash, frontId: created.frontId });
}

/**
 * The approver/substitute decides an open idea — only for the exact
 * version hash they saw. Ideas are decided during operation too, so this
 * command carries no implantation status gate.
 */
export async function runDecideIdea(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: DecideIdeaPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const scope = scopeOf(ctx);
    const idea = await ctx.repos.ideas.get(scope, payload.ideaId);
    if (!idea) {
      return err("unknown_idea", `unknown idea ${payload.ideaId}`);
    }
    if (idea.status !== "proposed") {
      return err("invalid_transition", `idea ${payload.ideaId} is already ${idea.status}`);
    }
    const hash = ideaVersionHash(idea);
    if (hash !== payload.expectedVersionHash) {
      return err("stale_version", `idea ${payload.ideaId} changed since it was seen`);
    }
    if (payload.decision === "reject") {
      await ctx.repos.ideas.update(scope, idea.id, { status: "rejected", decidedAt: ctx.now });
      await appendEvent(ctx, {
        eventType: IDEA_DECIDED_EVENT,
        objectType: "idea",
        objectId: idea.id,
        payload: { decision: "reject", kind: idea.kind, reason: payload.reason ?? null },
      });
      await requestNotification(ctx, {
        recipientRole: "strategist",
        templateKey: "idea.decided",
      });
      return ok({ decision: "reject" as const, ideaId: idea.id });
    }
    let resultingPlanVersion: number | null = null;
    let resultingMandateVersion: number | null = null;
    let createdPlanId: string | null = null;
    let createdMandateId: string | null = null;
    if (idea.kind === "plan_change") {
      const created = await acceptPlanChange(ctx, idea);
      if (!created.ok) return created;
      createdPlanId = created.value.id;
      resultingPlanVersion = created.value.version;
    } else if (idea.kind === "mandate_change") {
      const created = await acceptMandateChange(ctx, idea);
      if (!created.ok) return created;
      createdMandateId = created.value.id;
      resultingMandateVersion = created.value.version;
    }
    const receipt = await writeReceipt(ctx, {
      objectType: "idea",
      objectId: idea.id,
      objectVersion: hash,
      action: "decide_idea",
      detail: {
        decision: "approve",
        kind: idea.kind,
        resultingPlanVersion,
        resultingMandateVersion,
      },
    });
    if (createdPlanId) {
      await ctx.repos.plans.update(scope, createdPlanId, { receiptId: receipt.id });
    }
    if (createdMandateId) {
      await ctx.repos.mandates.update(scope, createdMandateId, { receiptId: receipt.id });
    }
    await ctx.repos.ideas.update(scope, idea.id, {
      status: "accepted",
      decidedAt: ctx.now,
      receiptId: receipt.id,
      resultingPlanVersion,
      resultingMandateVersion,
    });
    await appendEvent(ctx, {
      eventType: IDEA_DECIDED_EVENT,
      objectType: "idea",
      objectId: idea.id,
      payload: {
        decision: "approve",
        kind: idea.kind,
        resultingPlanVersion,
        resultingMandateVersion,
      },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "idea.decided",
    });
    return ok({
      decision: "approve" as const,
      ideaId: idea.id,
      receiptId: receipt.id,
      resultingPlanVersion,
      resultingMandateVersion,
    });
  });
}
