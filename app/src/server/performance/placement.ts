import type {
  PerformancePlacement,
  PerformancePlatform,
} from "./types";

export interface NormalizedPlacement {
  placement: PerformancePlacement;
  placementRaw: string;
}

const PLACEMENT_PATTERNS: Array<{
  placement: PerformancePlacement;
  pattern: RegExp;
}> = [
  { placement: "stories_reels", pattern: /stor(?:y|ies)|reels?|shorts?/i },
  { placement: "feed", pattern: /feed|timeline|instagram stream/i },
  { placement: "search", pattern: /search|pesquisa/i },
  { placement: "shopping", pattern: /shopping|merchant|product listing/i },
  { placement: "audience_network", pattern: /audience network|partner network/i },
  { placement: "video", pattern: /video|youtube|in-stream|instream/i },
  { placement: "display", pattern: /display|banner|gdn/i },
];

export function normalizePlacement(
  _platform: PerformancePlatform,
  rawValue: string
): NormalizedPlacement {
  const placementRaw = rawValue.trim();
  if (!placementRaw) {
    throw new Error("Placement is required");
  }

  const match = PLACEMENT_PATTERNS.find(({ pattern }) => pattern.test(placementRaw));
  return {
    placement: match?.placement ?? "other",
    placementRaw,
  };
}
