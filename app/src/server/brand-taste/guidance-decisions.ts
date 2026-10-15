import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { calibrationRules, user, type CalibrationRule } from "@/server/db/schema";
import { isPlatformOwnerEmail } from "@/server/auth/platform-owner";
import { sanitizeCalibrationNote } from "@/server/output-learning/output-decision-events";
import { learningProposalRevision, withLearningProposalRevision } from "./proposal-review";

export type GuidanceRuleDecision = {
  action: "reject" | "deprecate";
  decidedBy: string;
  decidedAt: string;
  reason: string;
  source: "manual" | "corpus_quality_cap";
  expectedRevision: string;
};
export class GuidanceDecisionError extends Error {
  constructor(public readonly code: "forbidden" | "not_found" | "revision_conflict" | "invalid_state" | "reason_required",
    message: string, public readonly current?: object) {
    super(message); this.name = "GuidanceDecisionError";
  }
}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type GuidanceDecisionInput = {
  workspaceId: string; clientProfileId: string; ruleId: string; reviewerUserId: string;
  action: GuidanceRuleDecision["action"]; reason: string; expectedRevision: string;
};

export async function decideCalibrationRule(input: GuidanceDecisionInput): Promise<CalibrationRule> {
  return db.transaction(async tx => {
    const [actor] = await tx.select({ id: user.id, email: user.email }).from(user).where(eq(user.id, input.reviewerUserId)).limit(1);
    if (!actor || !isPlatformOwnerEmail(actor.email)) throw new GuidanceDecisionError("forbidden", "Somente o Dono da plataforma pode depreciar ou rejeitar orientações.");
    const reason = sanitizeCalibrationNote(input.reason);
    if (!reason) throw new GuidanceDecisionError("reason_required", "Informe um motivo sem dados privados.");
    const [rule] = await tx.select().from(calibrationRules).where(and(eq(calibrationRules.id, input.ruleId),
      eq(calibrationRules.workspaceId, input.workspaceId), eq(calibrationRules.clientProfileId, input.clientProfileId))).for("update").limit(1);
    if (!rule) throw new GuidanceDecisionError("not_found", "Orientação não encontrada.");
    const previous = rule.reviewDecision;
    if (previous?.source === "manual" && previous.expectedRevision === input.expectedRevision
      && previous.action === input.action && previous.decidedBy === actor.id && previous.reason === reason) return rule;
    if (learningProposalRevision("rule", rule) !== input.expectedRevision) throw new GuidanceDecisionError("revision_conflict",
      "A orientação mudou. Leia o estado atual antes de continuar.", withLearningProposalRevision("rule", rule));
    if (rule.status !== "approved" && !(input.action === "reject" && rule.status === "candidate")) {
      throw new GuidanceDecisionError("invalid_state", "Esta orientação não permite essa decisão.");
    }
    return (await writeCalibrationRuleDecision(tx, rule, { action: input.action, decidedBy: actor.id,
      reason, source: "manual", expectedRevision: input.expectedRevision }))!;
  });
}

/** Caller holds the rule lock, or uses the approved-state CAS under the approval transaction. */
export async function writeCalibrationRuleDecision(tx: Tx, rule: CalibrationRule,
  decision: Omit<GuidanceRuleDecision, "decidedAt">, at = new Date()) {
  const [updated] = await tx.update(calibrationRules).set({ status: decision.action === "reject" ? "rejected" : "deprecated",
    reviewDecision: { ...decision, decidedAt: at.toISOString() }, updatedAt: at,
  }).where(and(eq(calibrationRules.id, rule.id), eq(calibrationRules.workspaceId, rule.workspaceId),
    eq(calibrationRules.clientProfileId, rule.clientProfileId), eq(calibrationRules.status, rule.status))).returning();
  return updated;
}

export const rejectCalibrationRule = (input: Omit<GuidanceDecisionInput, "action">) => decideCalibrationRule({ ...input, action: "reject" });
export const deprecateCalibrationRule = (input: Omit<GuidanceDecisionInput, "action">) => decideCalibrationRule({ ...input, action: "deprecate" });
