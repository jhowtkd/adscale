import sharp from "sharp";
import {
  contrastRatio,
  layerBox,
  relativeLuminance,
  type CompositionLayerPlan,
  type CompositionProvenance,
  buildStaticComposePlan,
  toProvenance,
} from "./placement-policy";
import type { CreativeWorkIdentityAssetSnapshot } from "./contracts";

export type BrandAssetGravity =
  | "northwest"
  | "northeast"
  | "southwest"
  | "southeast"
  | "center";

export interface ComposeExactBrandAssetLayer {
  buffer: Buffer;
  gravity: BrandAssetGravity;
  widthRatio: number;
  /** Edge inset in px; when set, placement uses left/top instead of bare gravity. */
  clearspacePx?: number;
  /** Semi-transparent plate behind the asset when underlay contrast is weak. */
  backdrop?: { rgba: { r: number; g: number; b: number; alpha: number } };
}

const MIN_WIDTH_RATIO = 0.1;
const MAX_WIDTH_RATIO = 0.8;

function clampWidthRatio(value: number): number {
  if (!Number.isFinite(value)) return MIN_WIDTH_RATIO;
  if (value < MIN_WIDTH_RATIO) return MIN_WIDTH_RATIO;
  if (value > MAX_WIDTH_RATIO) return MAX_WIDTH_RATIO;
  return value;
}

async function assertLayerHasAlpha(buffer: Buffer, index: number): Promise<void> {
  const meta = await sharp(buffer).metadata();
  if (meta.hasAlpha !== true) {
    throw new Error(
      `composeExactBrandAssets: layer #${index} is missing an alpha channel`,
    );
  }
}

async function buildResizedLayer(
  layer: ComposeExactBrandAssetLayer,
  dimensions: { width: number; height: number },
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const targetWidth = Math.max(
    1,
    Math.round(dimensions.width * clampWidthRatio(layer.widthRatio)),
  );
  const buffer = await sharp(layer.buffer)
    .resize(targetWidth, undefined, { fit: "inside" })
    .png()
    .toBuffer();
  const meta = await sharp(buffer).metadata();
  return {
    buffer,
    width: meta.width ?? targetWidth,
    height: meta.height ?? targetWidth,
  };
}

async function meanLuminanceInBox(
  image: Buffer,
  box: { left: number; top: number; width: number; height: number },
): Promise<number> {
  const { data, info } = await sharp(image)
    .extract({
      left: Math.max(0, box.left),
      top: Math.max(0, box.top),
      width: Math.max(1, box.width),
      height: Math.max(1, box.height),
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    sum += relativeLuminance(data[i]!, data[i + 1]!, data[i + 2]!);
    n += 1;
  }
  return n > 0 ? sum / n : 0;
}

/** Mean luminance of non-transparent logo pixels. */
export async function meanOpaqueLuminance(logo: Buffer): Promise<number> {
  const { data, info } = await sharp(logo)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const a = info.channels >= 4 ? data[i + 3]! : 255;
    if (a < 16) continue;
    sum += relativeLuminance(data[i]!, data[i + 1]!, data[i + 2]!);
    n += 1;
  }
  return n > 0 ? sum / n : 0.5;
}

/**
 * Pick gravity (and optional backdrop) so logo contrast against the underlay
 * meets the policy minimum. Tries allowed gravities in order.
 */
export async function pickContrastSafePlacement(input: {
  base: Buffer;
  logo: Buffer;
  plan: CompositionLayerPlan;
  dimensions: { width: number; height: number };
}): Promise<{
  gravity: BrandAssetGravity;
  contrast: number;
  usedBackdrop: boolean;
}> {
  const { base, logo, plan, dimensions } = input;
  const targetW = Math.max(
    1,
    Math.round(dimensions.width * plan.widthRatio),
  );
  const resized = await sharp(logo)
    .resize(targetW, undefined, { fit: "inside" })
    .png()
    .toBuffer();
  const meta = await sharp(resized).metadata();
  const layerSize = {
    width: meta.width ?? targetW,
    height: meta.height ?? Math.round(targetW / 2),
  };
  const logoLum = await meanOpaqueLuminance(resized);

  const candidates = [
    plan.gravity,
    ...plan.policy.allowedGravities.filter((g) => g !== plan.gravity),
  ];

  let best = {
    gravity: plan.gravity,
    contrast: 0,
    usedBackdrop: false,
  };

  for (const gravity of candidates) {
    const box = layerBox({
      gravity,
      canvas: dimensions,
      layer: layerSize,
      clearspacePx: plan.clearspacePx,
    });
    const under = await meanLuminanceInBox(base, box);
    const contrast = contrastRatio(logoLum, under);
    if (contrast > best.contrast) {
      best = { gravity, contrast, usedBackdrop: false };
    }
    if (contrast >= plan.policy.minContrast) {
      return { gravity, contrast, usedBackdrop: false };
    }
  }

  // No corner passes: keep best gravity and flag a backdrop plate.
  return { ...best, usedBackdrop: true };
}

/**
 * Deterministic, pixel-stable composition of exact-mode brand assets onto an
 * AI-generated base image. Aspect preserved via fit:inside. Optional clearspace
 * uses explicit left/top. Optional backdrop plate for weak contrast.
 */
export async function composeExactBrandAssets(
  base: Buffer,
  layers: ComposeExactBrandAssetLayer[],
  dimensions: { width: number; height: number },
): Promise<Buffer> {
  for (let i = 0; i < layers.length; i += 1) {
    await assertLayerHasAlpha(layers[i]!.buffer, i);
  }

  const composites: sharp.OverlayOptions[] = [];

  for (const layer of layers) {
    const resized = await buildResizedLayer(layer, dimensions);
    const pad = layer.clearspacePx ?? 0;
    const box = layerBox({
      gravity: layer.gravity,
      canvas: dimensions,
      layer: { width: resized.width, height: resized.height },
      clearspacePx: pad,
    });

    if (layer.backdrop) {
      const plate = await sharp({
        create: {
          width: resized.width + Math.round(pad * 0.5),
          height: resized.height + Math.round(pad * 0.5),
          channels: 4,
          background: layer.backdrop.rgba,
        },
      })
        .png()
        .toBuffer();
      composites.push({
        input: plate,
        left: Math.max(0, box.left - Math.round(pad * 0.25)),
        top: Math.max(0, box.top - Math.round(pad * 0.25)),
      });
    }

    composites.push({
      input: resized.buffer,
      left: box.left,
      top: box.top,
    });
  }

  return sharp(base)
    .resize(dimensions.width, dimensions.height, { fit: "fill" })
    .composite(composites)
    .png()
    .toBuffer();
}

export interface RunExactCompositionResult {
  buffer: Buffer;
  provenance: CompositionProvenance;
}

/**
 * Full post-generation path: plan → contrast-safe gravity → compose → provenance.
 * Loads asset buffers via the provided loader (workspace-scoped storage).
 */
export async function runExactComposition(input: {
  base: Buffer;
  format: string;
  dimensions: { width: number; height: number };
  assets: readonly CreativeWorkIdentityAssetSnapshot[];
  loadAsset: (assetKey: string) => Promise<Buffer>;
}): Promise<RunExactCompositionResult> {
  const staticPlan = buildStaticComposePlan({
    format: input.format,
    dimensions: input.dimensions,
    assets: input.assets,
  });

  if (staticPlan.blocked.length > 0) {
    return {
      buffer: input.base,
      provenance: toProvenance({
        format: input.format,
        dimensions: input.dimensions,
        layers: [],
        omitted: staticPlan.omitted,
        blocked: staticPlan.blocked,
      }),
    };
  }

  const finalLayers: CompositionLayerPlan[] = [];
  const omitted = [...staticPlan.omitted];
  const composeLayers: ComposeExactBrandAssetLayer[] = [];

  for (const plan of staticPlan.layers) {
    let buffer: Buffer;
    try {
      buffer = await input.loadAsset(plan.assetKey);
      // Ensure alpha for PNG logos stored without it flagged incorrectly.
      const meta = await sharp(buffer).metadata();
      if (meta.hasAlpha !== true) {
        if (plan.policy.omissible) {
          omitted.push({
            referenceId: plan.referenceId,
            assetKey: plan.assetKey,
            label: plan.label,
            reason: "exact_asset_missing_alpha",
          });
          continue;
        }
        throw new Error(`exact asset missing alpha: ${plan.assetKey}`);
      }
    } catch (error) {
      if (plan.policy.omissible) {
        omitted.push({
          referenceId: plan.referenceId,
          assetKey: plan.assetKey,
          label: plan.label,
          reason: "exact_asset_load_failed",
        });
        continue;
      }
      throw error;
    }

    const picked = await pickContrastSafePlacement({
      base: input.base,
      logo: buffer,
      plan,
      dimensions: input.dimensions,
    });

    if (
      picked.contrast < plan.policy.minContrast &&
      plan.policy.omissible &&
      !picked.usedBackdrop
    ) {
      omitted.push({
        referenceId: plan.referenceId,
        assetKey: plan.assetKey,
        label: plan.label,
        reason: "exact_asset_contrast_failed",
      });
      continue;
    }

    const layerPlan: CompositionLayerPlan = {
      ...plan,
      gravity: picked.gravity,
      contrast: picked.contrast,
      usedBackdrop: picked.usedBackdrop,
      status: "compose",
      reason: picked.usedBackdrop
        ? "composed_with_backdrop"
        : "composed_contrast_ok",
    };
    finalLayers.push(layerPlan);

    const logoLum = await meanOpaqueLuminance(buffer);
    composeLayers.push({
      buffer,
      gravity: picked.gravity,
      widthRatio: plan.widthRatio,
      clearspacePx: plan.clearspacePx,
      ...(picked.usedBackdrop
        ? {
            backdrop: {
              rgba:
                logoLum > 0.5
                  ? { r: 7, g: 21, b: 34, alpha: 0.55 }
                  : { r: 255, g: 255, b: 255, alpha: 0.55 },
            },
          }
        : {}),
    });
  }

  const composed =
    composeLayers.length > 0
      ? await composeExactBrandAssets(input.base, composeLayers, input.dimensions)
      : input.base;

  return {
    buffer: composed,
    provenance: toProvenance({
      format: input.format,
      dimensions: input.dimensions,
      layers: finalLayers,
      omitted,
      blocked: staticPlan.blocked,
    }),
  };
}
