import type { LegacyGuidanceApplication } from "./legacy-guidance";

export type ComposerGuidanceApplication = Omit<LegacyGuidanceApplication, "consumer" | "role" | "fixedPromptVersion" | "situation"> & {
  consumer: "art_direction" | "carousel_research" | "carousel_hooks" | "carousel_plan";
  role: "art_direction" | "carousel_editorial";
  executionId: string;
  guidanceCycleId?: string;
  situation: "applied" | "no_guidance" | "omitted";
  omissionReason?: string;
  omissions?: Array<{ ruleId: string; reason: string }>;
  fixedPromptVersion: string;
};
