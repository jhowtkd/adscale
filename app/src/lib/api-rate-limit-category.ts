import type { RateLimitCategory } from "@/lib/rate-limit";

/** AI-heavy campaign mutations — keep on the strict `ai` bucket. */
const AI_CAMPAIGN_MUTATION_PATTERNS: RegExp[] = [
  /\/derivations\/?$/,
  /\/diagnosis(\/regenerate)?\/?$/,
  /\/auto-briefing\/?$/,
  /\/analyze\/?$/,
  /\/restyle\/?$/,
  /\/suggest-ctas\/?$/,
  /\/smart-resize-preview\/?$/,
  /\/competitors\/analyze\/?$/,
  /\/competitors\/strategy\/?$/,
  /\/assets\/[^/]+\/preflight\/?$/,
];

export function getMutationRateLimitCategory(pathname: string): RateLimitCategory {
  if (pathname.startsWith("/api/auth")) {
    return "auth";
  }

  if (pathname.includes("/assets/upload")) {
    return "general";
  }

  if (pathname.startsWith("/api/derivations")) {
    return "ai";
  }

  if (pathname.startsWith("/api/campaigns")) {
    const isAiMutation = AI_CAMPAIGN_MUTATION_PATTERNS.some((pattern) =>
      pattern.test(pathname)
    );
    return isAiMutation ? "ai" : "general";
  }

  return "general";
}
