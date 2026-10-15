import type { Candidate } from "../brand-training/calibration";
import { matchesCalibrationScope } from "../brand-training/visual-guidance-contract";
import { renderLearnedGuidance } from "./learned-guidance";
import { getCreativeWorkPromptVersion } from "../shared-skills";
import { loadLocalLearningPromptCalibrationContext, type LocalLearningPromptContext } from "./prompt-calibration-loader";
import { authorizeLocalLearning, type LocalLearningAuthorizationPort } from "./local-learning-authorization";

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
  calibrationCandidate?: Candidate;
}, authorize?: LocalLearningAuthorizationPort): Promise<FrozenSinglePieceGuidance> {
  const fixedPromptVersion = getCreativeWorkPromptVersion(
    input.generationMode === "creative_revision" || input.generationMode === "format_adaptation" ? "refinement" : "composer",
  );
  const imagePromptVersion = getCreativeWorkPromptVersion("image_prompt");
  const roles = {} as FrozenSinglePieceGuidance["roles"];
  const calibrationAuthorization = input.calibrationCandidate ? await (authorize ?? authorizeLocalLearning)(input) : null;
  for (const role of SINGLE_PIECE_GUIDANCE_ROLES) {
    const scope = { ...input, role, language: "pt-BR" as const,
      fixedPromptVersion: role === "image_prompt" ? imagePromptVersion : fixedPromptVersion };
    if (calibrationAuthorization && !calibrationAuthorization.allowed) {
      roles[role] = { lines: [], appliedRefs: [], setHash: null, omissions: [], omissionReason: calibrationAuthorization.reason };
      continue;
    }
    if (input.calibrationCandidate) {
      const snapshot = input.calibrationCandidate.visualGuidance;
      const set = snapshot?.workspaceId === input.workspaceId && snapshot.clientProfileId === input.clientProfileId
        ? snapshot.sets.find(set => matchesCalibrationScope(set, scope)) : null;
      if (snapshot && !set) throw new Error("calibration_guidance_context_changed");
      // Historical candidates never gain visual guidance after their validated hash.
      roles[role] = set ? { ...renderLearnedGuidance(set), omissions: [] }
        : await loadLocalLearningPromptCalibrationContext(scope, authorize, async () => null);
      continue;
    }
    roles[role] = await loadLocalLearningPromptCalibrationContext(scope, authorize);
  }
  return { version: 1, generationMode: input.generationMode, format: input.format, fixedPromptVersion, imagePromptVersion, roles };
}
