import { getCreativeWorkPromptVersion } from "../shared-skills";
import { loadLocalLearningPromptCalibrationContext, type LocalLearningPromptContext } from "./prompt-calibration-loader";
import type { LocalLearningAuthorizationPort } from "./local-learning-authorization";

export const SINGLE_PIECE_GUIDANCE_ROLES = ["copy", "art_direction", "image_prompt"] as const;
export interface FrozenSinglePieceGuidance {
  version: 1;
  preparation?: { executionId: string; inputFingerprint: string };
  generationMode: string;
  format: string;
  fixedPromptVersion: string;
  /** Version the image_prompt role was selected under; absent in snapshots frozen before it was kept. */
  imagePromptVersion?: string;
  roles: Record<typeof SINGLE_PIECE_GUIDANCE_ROLES[number], LocalLearningPromptContext>;
}

/** Freeze eligible selections before any consumer assembles its request. */
export async function resolveSinglePieceGuidance(input: {
  workspaceId: string;
  clientProfileId: string;
  generationMode: string;
  format: string;
}, authorize?: LocalLearningAuthorizationPort): Promise<FrozenSinglePieceGuidance> {
  const fixedPromptVersion = getCreativeWorkPromptVersion(
    input.generationMode === "creative_revision" || input.generationMode === "format_adaptation" ? "refinement" : "composer",
  );
  const imagePromptVersion = getCreativeWorkPromptVersion("image_prompt");
  const roles = {} as FrozenSinglePieceGuidance["roles"];
  for (const role of SINGLE_PIECE_GUIDANCE_ROLES) {
    roles[role] = await loadLocalLearningPromptCalibrationContext({
      ...input, role, language: "pt-BR",
      fixedPromptVersion: role === "image_prompt" ? imagePromptVersion : fixedPromptVersion,
    }, authorize);
  }
  return { version: 1, generationMode: input.generationMode, format: input.format, fixedPromptVersion, imagePromptVersion, roles };
}
