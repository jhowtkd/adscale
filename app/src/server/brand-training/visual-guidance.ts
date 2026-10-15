import { authorizeLocalLearning } from "../brand-taste/local-learning-authorization";
import { selectCalibrationGuidance } from "../brand-taste/prompt-calibration-loader";
import { hashGuidanceSet } from "../brand-taste/learned-guidance";
import { getCreativeWorkPromptVersion } from "../shared-skills";
import { calibrationGuidanceSetSchema, calibrationGuidanceSnapshotSchema, type CalibrationGuidanceSnapshot } from "./visual-guidance-contract";

/** Capture additional contexts only when they contain approved visual guidance. */
export async function captureCalibrationGuidance(input: { workspaceId: string; clientProfileId: string }): Promise<CalibrationGuidanceSnapshot> {
  const authorization = await authorizeLocalLearning(input);
  if (!authorization.allowed) throw new Error("Calibration guidance outside workspace scope");
  const sets: CalibrationGuidanceSnapshot["sets"] = [];
  const contexts = [
    { generationMode: "single", format: "4:5", language: "pt-BR" },
    { generationMode: "single", format: "9:16", language: "pt-BR" },
    { generationMode: "carousel", format: "4:5", language: "en" },
    { generationMode: "carousel", format: "1:1", language: "en" },
  ] as const;
  for (const context of contexts) {
    const captured: CalibrationGuidanceSnapshot["sets"] = [];
    const roles = context.generationMode === "single" ? ["copy", "art_direction", "image_prompt"] as const : ["image_prompt"] as const;
    for (const role of roles) {
      const scope = { ...input, ...context, role,
        fixedPromptVersion: getCreativeWorkPromptVersion(role === "image_prompt" ? "image_prompt" : "composer") };
      const { revisions, visualIds } = await selectCalibrationGuidance(scope);
      captured.push(calibrationGuidanceSetSchema.parse({ ...context, role, fixedPromptVersion: scope.fixedPromptVersion,
        setHash: hashGuidanceSet(revisions), revisions, visualRuleIds: [...visualIds].sort() }));
    }
    if (context.generationMode === "single" && context.format === "4:5" || captured.some(set => set.visualRuleIds.length)) sets.push(...captured);
  }
  return calibrationGuidanceSnapshotSchema.parse({ schemaVersion: 1, ...input, sets });
}
