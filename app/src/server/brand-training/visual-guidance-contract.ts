import { z } from "zod";
import { GUIDANCE_ROLES, hashGuidanceSet, renderLearnedGuidance, validateLearnedGuidanceBudget } from "../brand-taste/learned-guidance";
import { RULE_CATEGORIES } from "../brand-taste/calibration-signal-types";

const hash = z.string().regex(/^[0-9a-f]{64}$/);
export const calibrationGuidanceSetSchema = z.object({
  role: z.enum(GUIDANCE_ROLES),
  generationMode: z.string().min(1),
  format: z.string().min(1),
  language: z.enum(["en", "pt-BR"]),
  fixedPromptVersion: z.string().min(1).refine(value => value !== "unknown"),
  setHash: hash.nullable(),
  visualRuleIds: z.array(z.string()),
  revisions: z.array(z.object({
    ruleId: z.string().min(1), revision: z.number().int().positive(), contentHash: hash,
    category: z.enum(RULE_CATEGORIES), roles: z.array(z.enum(GUIDANCE_ROLES)), text: z.string().min(1),
  }).strict()),
}).strict().superRefine((set, ctx) => {
  try {
    validateLearnedGuidanceBudget(set);
    const rendered = renderLearnedGuidance(set);
    if (rendered.setHash !== set.setHash || hashGuidanceSet(set.revisions) !== set.setHash
      || set.visualRuleIds.some(id => !set.revisions.some(revision => revision.ruleId === id))) {
      ctx.addIssue({ code: "custom", message: "Invalid calibration guidance set" });
    }
  } catch {
    ctx.addIssue({ code: "custom", message: "Invalid calibration guidance content or budget" });
  }
});
export const calibrationGuidanceSnapshotSchema = z.object({
  schemaVersion: z.literal(1), workspaceId: z.string().uuid(), clientProfileId: z.string().uuid(),
  sets: z.array(calibrationGuidanceSetSchema),
}).strict().superRefine((snapshot, ctx) => {
  const keys = snapshot.sets.map(set => JSON.stringify([set.role, set.generationMode, set.format, set.language]));
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "Duplicate calibration scope" });
});
export type CalibrationGuidanceSnapshot = z.infer<typeof calibrationGuidanceSnapshotSchema>;
export type CalibrationGuidanceSet = CalibrationGuidanceSnapshot["sets"][number];

export function matchesCalibrationScope(
  set: Pick<CalibrationGuidanceSet, "role" | "generationMode" | "format" | "language" | "fixedPromptVersion">,
  input: Pick<CalibrationGuidanceSet, "role" | "generationMode" | "format" | "language" | "fixedPromptVersion">,
): boolean {
  return set.role === input.role && set.generationMode === input.generationMode && set.format === input.format
    && set.language === input.language && set.fixedPromptVersion === input.fixedPromptVersion;
}

/** Evidence must describe the exact fragment frozen before each example's calls. */
export function calibrationSetWasApplied(
  set: CalibrationGuidanceSet,
  frozen: import("../brand-taste/single-piece-guidance").FrozenSinglePieceGuidance | null,
): boolean {
  if (!frozen || frozen.generationMode !== set.generationMode || frozen.format !== set.format
    || (set.role === "image_prompt" ? frozen.imagePromptVersion : frozen.fixedPromptVersion) !== set.fixedPromptVersion) return false;
  const role = set.role;
  const actual = role === "copy" || role === "art_direction" || role === "image_prompt" ? frozen.roles[role] : null;
  const expected = renderLearnedGuidance(set);
  return actual?.setHash === expected.setHash && JSON.stringify(actual.lines) === JSON.stringify(expected.lines)
    && hashGuidanceSet(actual.appliedRefs) === expected.setHash;
}
