export const CAMPAIGN_PLATFORM_OPTIONS = [
  "Meta Feed",
  "Meta Stories",
  "Google Display",
  "TikTok",
  "LinkedIn",
] as const;

export type CampaignPlatformOption = (typeof CAMPAIGN_PLATFORM_OPTIONS)[number];

export function formatCampaignPlatforms(platforms?: string[] | null): string | undefined {
  if (!platforms?.length) return undefined;
  return platforms.join(", ");
}
