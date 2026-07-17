import type { ContentBrief } from "@/server/ai/image-analysis";
import type {
  SocialPostBrief,
} from "./contracts";

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
