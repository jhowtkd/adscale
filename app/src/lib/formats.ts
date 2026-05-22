/**
 * ADScale Supported Ad Formats
 * Covers Meta Ads and Google Ads display image formats
 */

export interface AdFormat {
  id: string;
  label: string;
  ratio: string;
  dimensions: { width: number; height: number };
  platforms: string[];
  openaiSize: "1024x1024" | "1024x1536" | "1536x1024";
  description: string;
}

export const AD_FORMATS: AdFormat[] = [
  {
    id: "1:1",
    label: "Quadrado",
    ratio: "1:1",
    dimensions: { width: 1080, height: 1080 },
    platforms: ["Meta Feed", "Meta Carousel", "Meta Marketplace", "Google Display"],
    openaiSize: "1024x1024",
    description: "Feed do Instagram, Facebook Carousel, Marketplace",
  },
  {
    id: "4:5",
    label: "Retrato",
    ratio: "4:5",
    dimensions: { width: 1080, height: 1350 },
    platforms: ["Meta Feed", "Google Discovery"],
    openaiSize: "1024x1536",
    description: "Feed do Instagram/Facebook (retrato)",
  },
  {
    id: "9:16",
    label: "Stories / Reels",
    ratio: "9:16",
    dimensions: { width: 1080, height: 1920 },
    platforms: ["Meta Stories", "Meta Reels", "Google Discovery", "Google PMax"],
    openaiSize: "1024x1536",
    description: "Stories, Reels, Discovery, Performance Max",
  },
  {
    id: "1.91:1",
    label: "Link / Horizontal",
    ratio: "1.91:1",
    dimensions: { width: 1200, height: 628 },
    platforms: ["Meta Link Ads", "Google Display"],
    openaiSize: "1536x1024",
    description: "Anúncios de link no Facebook, Display horizontal",
  },
  {
    id: "16:9",
    label: "Widescreen",
    ratio: "16:9",
    dimensions: { width: 1920, height: 1080 },
    platforms: ["Google Display", "YouTube"],
    openaiSize: "1536x1024",
    description: "Display widescreen, thumbnails do YouTube",
  },
];

export const FORMAT_IDS = AD_FORMATS.map((f) => f.id);

export function getFormatById(id: string): AdFormat | undefined {
  return AD_FORMATS.find((f) => f.id === id);
}

export function getTargetDimensions(formatId: string, isPreview?: boolean): { width: number; height: number } | null {
  const format = getFormatById(formatId);
  if (!format) return null;

  if (isPreview) {
    return {
      width: Math.round(format.dimensions.width / 4),
      height: Math.round(format.dimensions.height / 4),
    };
  }

  return format.dimensions;
}

export function formatToOpenAISize(formatId: string, isPreview?: boolean): "1024x1024" | "1024x1536" | "1536x1024" {
  if (isPreview) {
    return "1024x1024";
  }
  const format = getFormatById(formatId);
  return format?.openaiSize ?? "1024x1024";
}

export function getFormatLabel(formatId: string): string {
  return getFormatById(formatId)?.label ?? formatId;
}
