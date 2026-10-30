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
  if (set.language !== "pt-BR" || !frozen || frozen.generationMode !== set.generationMode || frozen.format !== set.format
    || (set.role === "image_prompt" ? frozen.imagePromptVersion : frozen.fixedPromptVersion) !== set.fixedPromptVersion) return false;
  const role = set.role;
  const actual = role === "copy" || role === "art_direction" || role === "image_prompt" ? frozen.roles[role] : null;
  const expected = renderLearnedGuidance(set);
  return actual?.setHash === expected.setHash && JSON.stringify(actual.lines) === JSON.stringify(expected.lines)
    && hashGuidanceSet(actual.appliedRefs) === expected.setHash;
}

export const CALIBRATION_REFINEMENT_MODES = ["creative_revision", "format_adaptation"] as const;
export type CalibrationRefinementMode = typeof CALIBRATION_REFINEMENT_MODES[number];
export const isCalibrationRefinementMode = (mode: string): mode is CalibrationRefinementMode =>
  (CALIBRATION_REFINEMENT_MODES as readonly string[]).includes(mode);

/** Peça-base of a refinement example: an operator-approved earlier example of the same candidate. */
export type CalibrationRefinementBase = { round: number; slot: 0 | 1 | 2 | 3; workItemId: string; outputId: string };
export type CalibrationExampleScope =
  | { generationMode: "single" | "carousel"; format: "4:5" | "9:16" | "1:1"; base?: undefined }
  | { generationMode: "creative_revision"; format: "4:5" | "9:16"; base: CalibrationRefinementBase }
  | { generationMode: "format_adaptation"; format: "9:16"; base: CalibrationRefinementBase };
export type CalibrationRefinementPlan = {
  bases: Partial<Record<"4:5" | "9:16", CalibrationRefinementBase>>;
  /** Refinement scopes this candidate already proved: they leave the round, so a new judgement cannot revoke them. */
  provedScopes: readonly { generationMode: string; format: string }[];
};

export function hasCalibrationVisualScope(snapshot: CalibrationGuidanceSnapshot | undefined, scope: { generationMode: string; format: string }): boolean {
  return Boolean(snapshot?.sets.some(set => set.generationMode === scope.generationMode && set.format === scope.format && set.visualRuleIds.length));
}

/**
 * Four image units, shared by all scopes; no implicit round extension. Priority
 * is D3 of #775: Peça 4:5 › revisão › 9:16 › adaptação › carrossel 4:5 › carrossel 1:1.
 * Refinement only enters with a Peça-base, so the first round of a candidate never carries it.
 */
export function planCalibrationScopes(
  snapshot?: CalibrationGuidanceSnapshot,
  refinement?: CalibrationRefinementPlan,
): [CalibrationExampleScope, CalibrationExampleScope, CalibrationExampleScope, CalibrationExampleScope] {
  const base: CalibrationExampleScope = { generationMode: "single", format: "4:5" };
  const pending = (scope: { generationMode: string; format: string }) => !refinement?.provedScopes.some(proved =>
    proved.generationMode === scope.generationMode && proved.format === scope.format);
  const revisions = (["4:5", "9:16"] as const).flatMap(format => {
    const peca = refinement?.bases[format];
    return peca && pending({ generationMode: "creative_revision", format }) && hasCalibrationVisualScope(snapshot, { generationMode: "creative_revision", format })
      ? [{ generationMode: "creative_revision" as const, format, base: peca }] : [];
  });
  const adaptationBase = pending({ generationMode: "format_adaptation", format: "9:16" }) ? refinement?.bases["4:5"] : undefined;
  const ordered: CalibrationExampleScope[] = [
    base,
    ...revisions.slice(0, 1),
    ...[{ generationMode: "single", format: "9:16" }] as const,
    ...(adaptationBase ? [{ generationMode: "format_adaptation", format: "9:16", base: adaptationBase }] as const : []),
    ...[{ generationMode: "carousel", format: "4:5" }, { generationMode: "carousel", format: "1:1" }] as const,
  ];
  const scopes = ordered.filter(scope => scope === base || hasCalibrationVisualScope(snapshot, scope)).slice(0, 4);
  while (scopes.length < 4) scopes.push({ ...base });
  return scopes as [CalibrationExampleScope, CalibrationExampleScope, CalibrationExampleScope, CalibrationExampleScope];
}

export function calibrationCarouselSetWasApplied(set: CalibrationGuidanceSet, cycle: import("../brand-taste/carousel-guidance-cycle").FrozenCarouselGuidanceCycle | null): boolean {
  if (!cycle || set.role !== "image_prompt" || set.generationMode !== "carousel" || set.language !== "en"
    || cycle.format !== set.format || cycle.imagePromptVersion !== set.fixedPromptVersion) return false;
  const actual = cycle.selections.image_prompt;
  const expected = renderLearnedGuidance(set);
  return actual.setHash === expected.setHash && JSON.stringify(actual.lines) === JSON.stringify(expected.lines)
    && hashGuidanceSet(actual.appliedRefs) === expected.setHash;
}
