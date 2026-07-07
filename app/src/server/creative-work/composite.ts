import sharp from "sharp";

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
      `composeExactBrandAssets: layer #${index} is missing an alpha channel`
    );
  }
}

async function buildResizedLayer(
  layer: ComposeExactBrandAssetLayer,
  dimensions: { width: number; height: number }
): Promise<Buffer> {
  const targetWidth = Math.max(
    1,
    Math.round(dimensions.width * clampWidthRatio(layer.widthRatio))
  );
  return sharp(layer.buffer)
    .resize(targetWidth, undefined, { fit: "inside" })
    .png()
    .toBuffer();
}

/**
 * Deterministic, pixel-stable composition of exact-mode brand assets onto an
 * AI-generated base image. Each layer is resized with `fit: "inside"` (preserves
 * aspect ratio) and composited in the order received. Layers that Sharp
 * reports as opaque are rejected so callers fail loudly instead of getting
 * fully-occluded blocks.
 *
 * Width ratios are clamped to `[0.1, 0.8]`.
 */
export async function composeExactBrandAssets(
  base: Buffer,
  layers: ComposeExactBrandAssetLayer[],
  dimensions: { width: number; height: number }
): Promise<Buffer> {
  for (let i = 0; i < layers.length; i += 1) {
    await assertLayerHasAlpha(layers[i].buffer, i);
  }

  const composites = await Promise.all(
    layers.map(async (layer) => ({
      input: await buildResizedLayer(layer, dimensions),
      gravity: layer.gravity,
    }))
  );

  return sharp(base).composite(composites).png().toBuffer();
}