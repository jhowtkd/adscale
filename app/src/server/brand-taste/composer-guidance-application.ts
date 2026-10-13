import type { LegacyGuidanceApplication } from "./legacy-guidance";

export type ComposerGuidanceApplication = Omit<LegacyGuidanceApplication, "consumer" | "role" | "fixedPromptVersion"> & {
  consumer: "copy" | "art_direction" | "carousel_research" | "carousel_hooks" | "carousel_plan";
  role: "copy" | "art_direction" | "carousel_editorial";
  executionId: string;
  fixedPromptVersion: string;
  omissionReason?: import("./prompt-calibration-loader").LocalLearningPromptContext["omissionReason"];
};
