import type { LocalLearningPromptContext, LocalLearningPromptInput } from "./prompt-calibration-loader";
import type { LearnedGuidanceRef } from "./learned-guidance";

/** Same read-only capability as the Equipe gateway; eligibility belongs to AP19. */
export type CarouselGuidanceGateway = {
  loadLearnedGuidance(input: LocalLearningPromptInput): Promise<LocalLearningPromptContext>;
};
export type CarouselCallGuidance = {
  fixedPromptVersion: string;
  appliedRefs: readonly LearnedGuidanceRef[];
  setHash: string | null;
  omissionReason?: string;
  omissions?: LocalLearningPromptContext["omissions"];
};
export type FrozenCarouselEditorialPrompt = {
  system: string;
  fixedPromptVersion: string;
  selection: Pick<LocalLearningPromptContext, "lines" | "appliedRefs" | "setHash"> & Partial<Pick<LocalLearningPromptContext, "omissionReason" | "omissions">>;
};
export type FrozenCarouselGuidanceCycle = {
  version: 1;
  cycleId: string;
  parentCycleId: string | null;
  requestKey: string;
  contextFingerprint: string;
  clientProfileId: string;
  format: string;
  editorial: { hooksSystem: string; scriptSystem: string; fixedPromptVersion: string };
  research: { withExternalEvidence: string; withoutExternalEvidence: string; fixedPromptVersion: string };
  imagePromptVersion: string;
  selections: { carousel_editorial: LocalLearningPromptContext; image_prompt: LocalLearningPromptContext };
};
