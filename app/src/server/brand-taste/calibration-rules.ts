import type { CalibrationRule } from "@/server/db/schema";
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
