import sharp from "sharp";
import { getTargetDimensions } from "@/lib/formats";

/** Top portion of preview frame treated as hook/headline zone. */
export const HOOK_ZONE_HEIGHT_RATIO = 0.4;

/** Minimum mean luminance delta (0–1) between hook zone and rest of frame. */
export const MIN_HOOK_CONTRAST_DELTA = 0.12;

/** Minimum luminance std-dev in hook zone (detects structured/text-like signal). */
export const MIN_HOOK_ZONE_STD_DEV = 0.06;

export interface PreviewDimensions {
  width: number;
  height: number;
}

export interface HookLegibilityMetrics {
  previewWidth: number;
  previewHeight: number;
  hookZoneMeanLuminance: number;
  hookZoneStdDev: number;
  backgroundMeanLuminance: number;
  contrastDelta: number;
}

export function getPreviewDimensions(formatId: string): PreviewDimensions {
  const dims = getTargetDimensions(formatId, true);
  if (!dims) {
    throw new Error(`Unknown format for thumbnail preview: ${formatId}`);
  }
  return dims;
}

export async function downscaleToPreview(buffer: Buffer, formatId: string): Promise<Buffer> {
  const { width, height } = getPreviewDimensions(formatId);
  return sharp(buffer).resize(width, height, { fit: "fill" }).png().toBuffer();
}

function pixelLuminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function luminanceStats(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0 };
  }
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance) };
}

export async function measureHookLegibilityAtPreview(
  buffer: Buffer,
  formatId: string
): Promise<HookLegibilityMetrics> {
  const preview = await downscaleToPreview(buffer, formatId);
  const { width, height } = getPreviewDimensions(formatId);
  const hookRows = Math.max(1, Math.round(height * HOOK_ZONE_HEIGHT_RATIO));

  const { data, info } = await sharp(preview)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const hookLuminances: number[] = [];
  const backgroundLuminances: number[] = [];

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * channels;
      const lum = pixelLuminance(data[offset]!, data[offset + 1]!, data[offset + 2]!);
      if (y < hookRows) {
        hookLuminances.push(lum);
      } else {
        backgroundLuminances.push(lum);
      }
    }
  }

  const hookStats = luminanceStats(hookLuminances);
  const backgroundStats = luminanceStats(backgroundLuminances);

  return {
    previewWidth: width,
    previewHeight: height,
    hookZoneMeanLuminance: hookStats.mean,
    hookZoneStdDev: hookStats.stdDev,
    backgroundMeanLuminance: backgroundStats.mean,
    contrastDelta: Math.abs(hookStats.mean - backgroundStats.mean),
  };
}

export function isHookLegibleAtThumbnail(metrics: HookLegibilityMetrics): boolean {
  return (
    metrics.contrastDelta >= MIN_HOOK_CONTRAST_DELTA &&
    metrics.hookZoneStdDev >= MIN_HOOK_ZONE_STD_DEV
  );
}

export async function evaluateThumbnailHookLegibility(
  buffer: Buffer,
  formatId: string
): Promise<{ legible: boolean; metrics: HookLegibilityMetrics }> {
  const metrics = await measureHookLegibilityAtPreview(buffer, formatId);
  return { legible: isHookLegibleAtThumbnail(metrics), metrics };
}

/** Test helper: synthetic ad frame with high-contrast hook band. */
export async function createSyntheticHookLegibleImage(
  width: number,
  height: number
): Promise<Buffer> {
  const hookHeight = Math.max(1, Math.round(height * HOOK_ZONE_HEIGHT_RATIO));
  const background = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 40, g: 40, b: 40 },
    },
  })
    .png()
    .toBuffer();

  const stripeWidth = Math.max(4, Math.round(width / 24));
  const stripes: Array<{ input: Buffer; top: number; left: number }> = [];
  for (let x = 0; x < width; x += stripeWidth * 2) {
    stripes.push({
      input: await sharp({
        create: {
          width: Math.min(stripeWidth, width - x),
          height: hookHeight,
          channels: 3,
          background: { r: 20, g: 20, b: 20 },
        },
      })
        .png()
        .toBuffer(),
      top: 0,
      left: x + stripeWidth,
    });
  }

  const hookBand = await sharp({
    create: {
      width,
      height: hookHeight,
      channels: 3,
      background: { r: 250, g: 250, b: 250 },
    },
  })
    .composite(stripes)
    .png()
    .toBuffer();

  return sharp(background)
    .composite([{ input: hookBand, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

/** Test helper: uniform low-contrast frame (hook illegible at thumbnail). */
export async function createSyntheticHookIllegibleImage(
  width: number,
  height: number
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 118, b: 122 },
    },
  })
    .png()
    .toBuffer();
}
