import type { CalibrationRule } from "@/server/db/schema";
import { calibrationRules } from "@/server/db/schema";
import { db } from "@/server/db";
import { and, eq } from "drizzle-orm";
import { confirmedGuidanceMetadataSchema, type ConfirmedGuidanceMetadata } from "./guidance-metadata";
import { hashGuidanceContent, isGuidanceCategoryApplicable } from "./learned-guidance";
import {
  insertCalibrationRule,
  listApprovedCalibrationRules,
  listCalibrationRulesForClientProfile,
  updateCalibrationRuleStatus,
} from "@/server/repositories/calibration-rule";
import type { CalibrationRuleCandidate } from "./calibration-signal-types";
import { canPromoteRuleToApproved, ruleConstraintText } from "./rule-extraction";

export function mapRuleRowToCandidate(row: CalibrationRule): CalibrationRuleCandidate {
  return {
    id: row.id,
    clientProfileId: row.clientProfileId,
    category: row.category as CalibrationRuleCandidate["category"],
    status: row.status as CalibrationRuleCandidate["status"],
    rationale: row.rationale,
    supportingDecisionIds: row.supportingSignalIds,
    confidence: row.confidence as CalibrationRuleCandidate["confidence"],
    caveats: row.caveats,
    version: row.version,
    mismatchBucket: (row.mismatchBucket as CalibrationRuleCandidate["mismatchBucket"]) ?? null,
    createdAt: row.createdAt.toISOString(),
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedBy: row.approvedBy,
  };
}

export async function confirmCalibrationRuleMetadata(input: {
  workspaceId: string;
  clientProfileId: string;
  ruleId: string;
  confirmedBy: string;
  metadata: ConfirmedGuidanceMetadata;
}): Promise<{ ok: true; rule: CalibrationRule } | { ok: false; reason: "not_found" | "invalid_metadata" | "rule_not_approved" | "factual_rule" | "export_conflict" | "content_changed" }> {
  const parsed = confirmedGuidanceMetadataSchema.safeParse(input.metadata);
  if (!parsed.success) return { ok: false, reason: "invalid_metadata" };
  const metadata = parsed.data;
  return db.transaction(async tx => {
    const scope = and(eq(calibrationRules.id, input.ruleId),
      eq(calibrationRules.workspaceId, input.workspaceId), eq(calibrationRules.clientProfileId, input.clientProfileId));
    const [rule] = await tx.select().from(calibrationRules).where(scope).for("update");
    if (!rule) return { ok: false, reason: "not_found" };
    if (rule.status !== "approved") return { ok: false, reason: "rule_not_approved" };
    // Historical corpus rules may identify the factual failure only in their original prefix.
    if (rule.primaryFailureReason === "factual_issue" || /^factual_issue\s*:/.test(rule.rationale)) {
      return { ok: false, reason: "factual_rule" };
    }
    if ((rule.category === "export_conflict" && metadata.category !== "export_conflict")
      || (metadata.category === "export_conflict" && metadata.roles.some(role => role !== "legacy_derivation"))) {
      return { ok: false, reason: "export_conflict" };
    }
    if (metadata.roles.some(role => !isGuidanceCategoryApplicable(role, metadata.category))) {
      return { ok: false, reason: "invalid_metadata" };
    }
    if (metadata.contentHash !== hashGuidanceContent(rule.rationale)) return { ok: false, reason: "content_changed" };
    const now = new Date();
    const [confirmed] = await tx.update(calibrationRules).set({ confirmedMetadata: metadata,
      metadataConfirmedBy: input.confirmedBy, metadataConfirmedAt: now, updatedAt: now }).where(scope).returning();
    return { ok: true, rule: confirmed };
  });
}

export async function persistRuleCandidate(input: {
  workspaceId: string;
  candidate: CalibrationRuleCandidate;
}): Promise<CalibrationRule> {
  return insertCalibrationRule({
    workspaceId: input.workspaceId,
    clientProfileId: input.candidate.clientProfileId,
    category: input.candidate.category,
    status: "candidate",
    rationale: input.candidate.rationale,
    supportingSignalIds: input.candidate.supportingDecisionIds,
    confidence: input.candidate.confidence,
    caveats: input.candidate.caveats,
    mismatchBucket: input.candidate.mismatchBucket,
    version: input.candidate.version,
  });
}

export async function approveCalibrationRule(input: {
  workspaceId: string;
  clientProfileId: string;
  ruleId: string;
  approvedBy: string;
  acknowledgeCaveats?: boolean;
}): Promise<{ ok: true; rule: CalibrationRule } | { ok: false; reason: string }> {
  const rules = await listCalibrationRulesForClientProfile({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
  });
  const existing = rules.find((rule) => rule.id === input.ruleId);
  if (!existing) {
    return { ok: false, reason: "Rule not found." };
  }

  const candidate = mapRuleRowToCandidate(existing);
  const promotion = canPromoteRuleToApproved(candidate);

  if (!promotion.ok && !input.acknowledgeCaveats) {
    return { ok: false, reason: promotion.reason ?? "Cannot approve rule." };
  }

  const row = await updateCalibrationRuleStatus({
    id: input.ruleId,
    workspaceId: input.workspaceId,
    status: "approved",
    approvedBy: input.approvedBy,
    approvedAt: new Date(),
  });

  if (!row) {
    return { ok: false, reason: "Rule not found." };
  }

  return { ok: true, rule: row };
}

export async function rejectCalibrationRule(input: {
  workspaceId: string;
  ruleId: string;
}): Promise<CalibrationRule | null> {
  return updateCalibrationRuleStatus({
    id: input.ruleId,
    workspaceId: input.workspaceId,
    status: "rejected",
  });
}

export async function deprecateCalibrationRule(input: {
  workspaceId: string;
  ruleId: string;
}): Promise<CalibrationRule | null> {
  return updateCalibrationRuleStatus({
    id: input.ruleId,
    workspaceId: input.workspaceId,
    status: "deprecated",
  });
}

export async function getApprovedRuleConstraints(input: {
  workspaceId: string;
  clientProfileId: string;
}): Promise<string[]> {
  const rules = await listApprovedCalibrationRules(input);
  return rules.map((rule) =>
    ruleConstraintText({
      id: rule.id,
      category: rule.category as CalibrationRuleCandidate["category"],
      rationale: rule.rationale,
    })
  );
}

export { ruleConstraintText };
