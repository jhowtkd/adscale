import type { LegacyGuidanceApplication } from "./legacy-guidance";

export type ComposerGuidanceApplication = Omit<LegacyGuidanceApplication, "consumer" | "role" | "fixedPromptVersion"> & {
  consumer: "art_direction" | "carousel_research" | "carousel_hooks" | "carousel_plan";
  role: "art_direction" | "carousel_editorial";
  executionId: string;
  fixedPromptVersion: string;
};
