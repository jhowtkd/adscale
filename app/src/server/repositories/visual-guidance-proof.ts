import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { brandKnowledgeVersions } from "../db/schema";
import { calibrationGuidanceSnapshotSchema, matchesCalibrationScope } from "../brand-training/visual-guidance-contract";
import type { LocalLearningPromptInput, VisualGuidanceProofPort } from "../brand-taste/prompt-calibration-loader";

/** Pure lookup: historical versions without an exact-set snapshot prove nothing visual. */
export const loadVisualGuidanceProof: VisualGuidanceProofPort = async input => {
  const [version] = await db.select({ snapshot: brandKnowledgeVersions.snapshot }).from(brandKnowledgeVersions).where(and(
    eq(brandKnowledgeVersions.workspaceId, input.workspaceId), eq(brandKnowledgeVersions.clientProfileId, input.clientProfileId),
    eq(brandKnowledgeVersions.status, "active"),
  )).limit(1);
  if (!version || version.snapshot.schemaVersion !== 3) return null;
  const parsed = calibrationGuidanceSnapshotSchema.safeParse(version.snapshot.visualGuidance);
  if (!parsed.success || parsed.data.workspaceId !== input.workspaceId || parsed.data.clientProfileId !== input.clientProfileId) return null;
  const set = parsed.data.sets.find(set => matchesCalibrationScope(set, input) && set.setHash === input.setHash && set.visualRuleIds.length > 0);
  return set ? { ...input, status: "validated" } : null;
};

/** Last activated selection for this exact scope, never a pending candidate. */
export async function loadPreviousVisualGuidance(input: LocalLearningPromptInput) {
  const [version] = await db.select({ snapshot: brandKnowledgeVersions.snapshot }).from(brandKnowledgeVersions).where(and(
    eq(brandKnowledgeVersions.workspaceId, input.workspaceId), eq(brandKnowledgeVersions.clientProfileId, input.clientProfileId!),
    eq(brandKnowledgeVersions.status, "active"),
  )).limit(1);
  if (!version || version.snapshot.schemaVersion !== 3) return null;
  const parsed = calibrationGuidanceSnapshotSchema.safeParse(version.snapshot.visualGuidance);
  if (!parsed.success || parsed.data.workspaceId !== input.workspaceId || parsed.data.clientProfileId !== input.clientProfileId) return null;
  return parsed.data.sets.find(set => matchesCalibrationScope(set, input) && set.visualRuleIds.length > 0) ?? null;
}
