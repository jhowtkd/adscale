import type { LegacyGuidanceApplication } from "./legacy-guidance";
import type { LocalLearningPromptContext } from "./prompt-calibration-loader";

export type ComposerGuidanceApplication = Omit<LegacyGuidanceApplication, "consumer" | "role" | "fixedPromptVersion" | "situation"> & {
  consumer: "art_direction" | "carousel_research" | "carousel_hooks" | "carousel_plan" | "image_prompt";
  role: "art_direction" | "carousel_editorial" | "image_prompt";
  executionId: string;
  fixedPromptVersion: string;
  situation: "applied" | "no_guidance" | "omitted" | "unknown";
  omissionReason?: LocalLearningPromptContext["omissionReason"] | "fragment_not_delivered";
  omissions?: LocalLearningPromptContext["omissions"];
};
