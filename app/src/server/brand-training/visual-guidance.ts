import { authorizeLocalLearning } from "../brand-taste/local-learning-authorization";
import { selectCalibrationGuidance } from "../brand-taste/prompt-calibration-loader";
import { hashGuidanceSet } from "../brand-taste/learned-guidance";
import { getCreativeWorkPromptVersion } from "../shared-skills";
import { calibrationGuidanceSnapshotSchema, type CalibrationGuidanceSnapshot } from "./visual-guidance-contract";

/** Only scopes exercised by the existing four single-piece 4:5 examples. */
export async function captureCalibrationGuidance(input: { workspaceId: string; clientProfileId: string }): Promise<CalibrationGuidanceSnapshot> {
  const authorization = await authorizeLocalLearning(input);
  if (!authorization.allowed) throw new Error("Calibration guidance outside workspace scope");
  const sets = [];
  for (const role of ["copy", "art_direction", "image_prompt"] as const) {
    const scope = { ...input, role, generationMode: "single", format: "4:5", language: "pt-BR" as const,
      fixedPromptVersion: getCreativeWorkPromptVersion(role === "image_prompt" ? "image_prompt" : "composer") };
    const { revisions, visualIds } = await selectCalibrationGuidance(scope);
    sets.push({ role, generationMode: scope.generationMode, format: scope.format, language: scope.language,
      fixedPromptVersion: scope.fixedPromptVersion, setHash: hashGuidanceSet(revisions), revisions, visualRuleIds: [...visualIds].sort() });
  }
  return calibrationGuidanceSnapshotSchema.parse({ schemaVersion: 1, ...input, sets });
}
