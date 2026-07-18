import type { ContentBrief } from "@/server/ai/image-analysis";
import type {
  CreativeWorkFormat,
  SocialPostBrief,
} from "./contracts";

export function inferCreativeWorkFormat(
  analyses: readonly Pick<ContentBrief, "format">[],
  request = "",
): CreativeWorkFormat | null {
  const candidates = [request, ...analyses.map((analysis) => analysis.format)];
  for (const candidate of candidates) {
    const value = candidate.toLocaleLowerCase("pt-BR");
    if (/\b1\s*:\s*1\b/.test(value)) return "1:1";
    if (/\b9\s*:\s*16\b/.test(value)) return "9:16";
    if (/\b4\s*:\s*5\b/.test(value)) return "4:5";
    if (/quadrad|square/.test(value)) return "1:1";
    if (/story|stories|reel|vertical/.test(value)) return "9:16";
    if (/retrato|portrait/.test(value)) return "4:5";
  }
  return null;
}

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
