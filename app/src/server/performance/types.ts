export const PERFORMANCE_PLATFORMS = ["meta", "google", "tiktok", "other"] as const;
export type PerformancePlatform = (typeof PERFORMANCE_PLATFORMS)[number];

export const PERFORMANCE_PLACEMENTS = [
  "feed",
  "stories_reels",
  "search",
  "display",
  "video",
  "shopping",
  "audience_network",
  "other",
] as const;
export type PerformancePlacement = (typeof PERFORMANCE_PLACEMENTS)[number];

export const PERFORMANCE_SOURCE_TYPES = ["manual", "csv", "api", "other"] as const;
export type PerformanceSourceType = (typeof PERFORMANCE_SOURCE_TYPES)[number];

export type PerformanceScope =
  | { kind: "total"; dimensions?: never }
  | { kind: "segment"; dimensions: Record<string, string> };

export interface RawPerformanceMetrics {
  impressions: string;
  clicks: string;
  spend: string;
  conversions: string;
  conversionValue: string;
}

export interface DerivedPerformanceMetrics {
  ctr: string | null;
  cpc: string | null;
  cpa: string | null;
  roas: string | null;
}

export interface CanonicalPerformanceSnapshotInput {
  campaignId: string;
  derivationId: string;
  platform: PerformancePlatform;
  placementRaw: string;
  adAccountId?: string | null;
  startDate: string;
  endDate: string;
  sourceTimezone: string;
  currency: string;
  sourceType: PerformanceSourceType;
  externalCampaignId?: string | null;
  externalAdGroupId?: string | null;
  externalAdId?: string | null;
  scope: PerformanceScope;
  sourceMetadata?: Record<string, unknown>;
  metrics: RawPerformanceMetrics;
}
