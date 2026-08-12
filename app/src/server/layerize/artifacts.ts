import "server-only";

import { writePsdBuffer } from "ag-psd";
import JSZip from "jszip";
import sharp from "sharp";
import type { LayerizationLayer, FidelityResult } from "./contracts";

export type LayerBitmap = LayerizationLayer & { png: Buffer };

export async function recomposeLayerBitmaps(input: {
  width: number;
  height: number;
  layers: LayerBitmap[];
}): Promise<Buffer> {
  const base = input.layers.find((layer) => layer.isBase);
  if (!base) throw new Error("Layerization has no base bitmap");
  const basePng = await sharp(base.png)
    .resize(input.width, input.height, { fit: "fill" })
    .ensureAlpha()
    .png()
    .toBuffer();
  const overlays = await Promise.all(
    input.layers
      .filter((layer) => !layer.isBase)
      .sort((left, right) => left.order - right.order)
      .map(async (layer) => ({
        input: await sharp(layer.png)
          .resize(layer.width, layer.height, { fit: "fill" })
          .ensureAlpha()
          .png()
          .toBuffer(),
        left: layer.x,
        top: layer.y,
      })),
  );
  return sharp(basePng).composite(overlays).png().toBuffer();
}

export async function calculateLayerizationFidelity(
  original: Buffer,
  recomposed: Buffer,
  dimensions: { width: number; height: number },
): Promise<FidelityResult> {
  const [left, right] = await Promise.all([
    sharp(original).resize(dimensions.width, dimensions.height, { fit: "fill" }).ensureAlpha().raw().toBuffer(),
    sharp(recomposed).resize(dimensions.width, dimensions.height, { fit: "fill" }).ensureAlpha().raw().toBuffer(),
  ]);
  if (left.length !== right.length || left.length === 0) {
    throw new Error("Layerization fidelity buffers have different dimensions");
  }
  let absolute = 0;
  let squared = 0;
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index] - right[index];
    absolute += Math.abs(difference);
    squared += difference * difference;
  }
  const normalizedMae = absolute / (left.length * 255);
  const rmse = Math.sqrt(squared / left.length);
  const psnrDb = rmse === 0 ? 99 : 20 * Math.log10(255 / rmse);
  return {
    normalizedMae,
    rmse,
    psnrDb,
    gate: normalizedMae <= 0.05 && psnrDb >= 25 ? "passed" : "failed",
  };
}

async function imageData(buffer: Buffer, width: number, height: number) {
  const { data } = await sharp(buffer)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width,
    height,
    colorSpace: "srgb" as PredefinedColorSpace,
    data: new Uint8ClampedArray(data),
  };
}

export async function writeLayerizationPsd(input: {
  width: number;
  height: number;
  layers: LayerBitmap[];
  recomposed: Buffer;
}): Promise<Buffer> {
  const children = await Promise.all(
    [...input.layers]
      .sort((left, right) => right.order - left.order)
      .map(async (layer) => ({
        name: layer.name,
        left: layer.x,
        top: layer.y,
        right: layer.x + layer.width,
        bottom: layer.y + layer.height,
        imageData: await imageData(layer.png, layer.width, layer.height),
      })),
  );
  return writePsdBuffer({
    width: input.width,
    height: input.height,
    children,
    imageData: await imageData(input.recomposed, input.width, input.height),
  });
}

function safeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "layer";
}

export async function writeLayerizationDiagnosticZip(input: {
  original: Buffer;
  recomposed: Buffer;
  layers: LayerBitmap[];
  manifest: Record<string, unknown>;
}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("original.png", input.original);
  zip.file("recomposed-preview.png", input.recomposed);
  for (const layer of [...input.layers].sort((left, right) => left.order - right.order)) {
    zip.file(`layers/${String(layer.order).padStart(2, "0")}-${safeName(layer.name)}.png`, layer.png);
  }
  zip.file("manifest.json", JSON.stringify(input.manifest, null, 2));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
