import type { ContentBrief } from "@/server/ai/image-analysis";
import type {
  CreativeLevel,
  CreativeWorkFormat,
  CreativeWorkIntent,
  SocialPostBrief,
} from "./contracts";

export type CreativeOutputPlan = {
  creativeLevel: CreativeLevel;
  targetFormat: CreativeWorkFormat;
  versionNumber: 1;
};

export function deriveCreativeWorkTitle(request: string): string {
  const normalized = request.trim().replace(/\s+/g, " ");
  const firstSentence = normalized.split(/[.!?]+/).find((part) => part.trim()) ?? normalized;
  return firstSentence.replace(/[.!?]+$/, "").trim().slice(0, 80);
}

export function inferSocialPostBrief(request: string, analyses: readonly ContentBrief[]): SocialPostBrief {
  const content = analyses[0];
  const theme = deriveCreativeWorkTitle(request) || content?.textContent.headline || content?.product;
  return {
    theme,
    objective: content?.product ? `Promover ${content.product}` : `Promover ${theme}`,
    audience: "Público da marca",
    offer: content?.offer?.trim() || theme,
  };
}

export function quoteCreativeWork(input: {
  intent: CreativeWorkIntent;
  format: CreativeWorkFormat;
  targetFormats: readonly CreativeWorkFormat[];
}): CreativeOutputPlan[] {
  if (input.intent === "variations" || input.intent === "social_post") {
    return (["conservative", "balanced", "bold"] as const).map((creativeLevel) => ({
      creativeLevel,
      targetFormat: input.format,
      versionNumber: 1,
    }));
  }
  const formats = input.intent === "format_adaptation" ? input.targetFormats : [input.format];
  return formats.map((targetFormat) => ({ creativeLevel: "balanced", targetFormat, versionNumber: 1 }));
}
