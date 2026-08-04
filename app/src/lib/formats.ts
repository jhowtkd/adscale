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

/**
 * gpt-image-2 generation sizes. Edges must be divisible by 16; prefer sizes
 * larger than the delivery target so the permanent resize is a downscale.
 * 1080 is not divisible by 16, so final delivery always resizes.
 * Single table — format id and dimension-ratio paths both read from here.
 */
const GPT_IMAGE_2_SIZE_TABLE: ReadonlyArray<{
  formatId: string;
  size: OpenAIImageSize;
  ratio: number;
}> = [
  { formatId: "1:1", size: "1088x1088", ratio: 1 },
  { formatId: "4:5", size: "1088x1360", ratio: 0.8 },
  { formatId: "9:16", size: "1152x2048", ratio: 9 / 16 },
  { formatId: "16:9", size: "2048x1152", ratio: 16 / 9 },
  { formatId: "1.91:1", size: "2048x1072", ratio: 1.91 },
];

const GPT_IMAGE_2_GENERATION_SIZES: Record<string, OpenAIImageSize> =
  Object.fromEntries(GPT_IMAGE_2_SIZE_TABLE.map((row) => [row.formatId, row.size]));

export type OpenAIImageSize =
  | "1024x1024"
  | "1024x1536"
  | "1536x1024"
  | "1024x1280"
  | "1088x1088"
  | "1088x1360"
  | "1152x2048"
  | "2048x1072"
  | "2048x1152";

/** Legacy OpenAI SDK image size union — cast gpt-image-2 sizes only here. */
export type OpenAISdkImageSize = "1024x1024" | "1024x1536" | "1536x1024";

export function parseOpenAIImageSize(size: string): { width: number; height: number } | null {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return null;
  }
  return { width, height };
}

/**
 * gpt-image-2 requires both edges divisible by 16, aspect between 1:3 and 3:1,
 * and max edge 3840. Throws on illegal sizes so callers never ship a 400.
 */
export function assertValidGptImage2Size(size: string): OpenAIImageSize {
  const dims = parseOpenAIImageSize(size);
  if (!dims) {
    throw new Error(`Invalid image size "${size}": expected WIDTHxHEIGHT`);
  }
  const { width, height } = dims;
  if (width % 16 !== 0 || height % 16 !== 0) {
    throw new Error(
      `Invalid image size "${size}": width and height must be divisible by 16`,
    );
  }
  if (width > 3840 || height > 3840) {
    throw new Error(`Invalid image size "${size}": max edge is 3840`);
  }
  const ratio = width / height;
  if (ratio < 1 / 3 || ratio > 3) {
    throw new Error(`Invalid image size "${size}": aspect ratio must be between 1:3 and 3:1`);
  }
  return size as OpenAIImageSize;
}

export function toOpenAISdkImageSize(size: OpenAIImageSize): OpenAISdkImageSize {
  return assertValidGptImage2Size(size) as OpenAISdkImageSize;
}

/**
 * Pick a gpt-image-2 generation size from target canvas dimensions.
 * Always returns a size that downscales (or matches) the target aspect —
 * never a coarser aspect that would force crop/distort.
 */
export function dimensionsToGptImage2Size(dimensions: {
  width: number;
  height: number;
}): OpenAIImageSize {
  const ratio = dimensions.width / dimensions.height;
  let best = GPT_IMAGE_2_SIZE_TABLE[0]!;
  let bestDist = Math.abs(ratio - best.ratio);
  for (const row of GPT_IMAGE_2_SIZE_TABLE) {
    const dist = Math.abs(ratio - row.ratio);
    if (dist < bestDist) {
      best = row;
      bestDist = dist;
    }
  }
  return assertValidGptImage2Size(best.size);
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
    return assertValidGptImage2Size(
      GPT_IMAGE_2_GENERATION_SIZES[formatId] ?? "1088x1088",
    );
  }

  // Non-flexible model fallback: preview defaults to square (legacy behaviour),
  // non-preview uses the per-format SDK size.
  if (options?.isPreview) {
    return "1024x1024";
  }
  const format = getFormatById(formatId);
  return (format?.openaiSize ?? "1024x1024") as OpenAIImageSize;
}
