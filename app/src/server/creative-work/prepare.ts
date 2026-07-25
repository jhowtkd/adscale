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

function uniqueTrimmed(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim() ?? "";
    const key = trimmed.toLocaleLowerCase("pt-BR");
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/**
 * Reduced presentation brief: every content analysis contributes, and absent
 * information stays absent — the audience is never filled with a generic
 * placeholder (R-002 / spec 7.2). The factual truth for copy and generation
 * lives in the fact pack, not here; `deriveCreativeWorkTitle` stays
 * presentation-only.
 */
export function inferSocialPostBrief(request: string, analyses: readonly ContentBrief[]): SocialPostBrief {
  const title = deriveCreativeWorkTitle(request);
  const products = uniqueTrimmed(analyses.map((analysis) => analysis.product));
  const offers = uniqueTrimmed(analyses.map((analysis) => analysis.offer));
  const headlines = uniqueTrimmed(analyses.map((analysis) => analysis.textContent?.headline));
  const theme = title || headlines[0] || products[0] || "";
  const objective = products.length > 0
    ? `Promover ${products.join(" e ")}`
    : theme
      ? `Promover ${theme}`
      : "";
  return {
    theme: theme.slice(0, 240),
    objective: objective.slice(0, 240),
    audience: "",
    offer: (offers.join(" e ") || theme).slice(0, 240),
  };
}
