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

const AD_FORMATS: AdFormat[] = [
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

function getFormatById(id: string): AdFormat | undefined {
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

// gpt-image-2 (and dated variants like gpt-image-2-2026-04-21) support non-square portrait sizes.
const GPT_IMAGE_2_PATTERN = /^gpt-image-2/;

// Target-aspect generation sizes supported by gpt-image-2.
// These intentionally exceed the legacy SDK union type — the cast is isolated here.
const GPT_IMAGE_2_GENERATION_SIZES: Record<string, string> = {
  "1:1": "1024x1024",
  "4:5": "1024x1280",
  "9:16": "1152x2048",
};

export type OpenAIImageSize =
  | "1024x1024"
  | "1024x1536"
  | "1536x1024"
  | "1024x1280"
  | "1152x2048";

/** Legacy OpenAI SDK image size union — cast gpt-image-2 sizes only here. */
export type OpenAISdkImageSize = "1024x1024" | "1024x1536" | "1536x1024";

export function toOpenAISdkImageSize(size: OpenAIImageSize): OpenAISdkImageSize {
  return size as OpenAISdkImageSize;
}

/**
 * Returns the best OpenAI image generation size for `formatId`.
 *
 * For gpt-image-2 models the helper returns the true target-aspect size so the
 * model can reconstruct the layout natively.  For other models it falls back to
 * the three fixed SDK sizes, preserving the old `formatToOpenAISize` logic.
 *
 * Preview mode no longer collapses 4:5 or 9:16 to square when the model
 * supports portrait sizes — square previews caused blurred-bar post-processing.
 */
export function formatToOpenAIImageSize(
  formatId: string,
  options?: { isPreview?: boolean; modelName?: string },
): OpenAIImageSize {
  const { modelName = "" } = options ?? {};

  if (GPT_IMAGE_2_PATTERN.test(modelName)) {
    // gpt-image-2 supports target-aspect sizes; use them even in preview mode
    // so the model never produces a square that then gets blurred-bar padded.
    return (GPT_IMAGE_2_GENERATION_SIZES[formatId] ?? "1024x1024") as OpenAIImageSize;
  }

  // Non-flexible model fallback: preview defaults to square (legacy behaviour),
  // non-preview uses the per-format SDK size.
  if (options?.isPreview) {
    return "1024x1024";
  }
  const format = getFormatById(formatId);
  return (format?.openaiSize ?? "1024x1024") as OpenAIImageSize;
}
