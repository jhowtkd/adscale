import "server-only";

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePsdBuffer } from "ag-psd";
import sharp from "sharp";
import type { LayerizationLayer, FidelityResult } from "./contracts";
import { writeLayerizationDiagnosticZipFile } from "./artifacts-zip";

export type LayerBitmap = LayerizationLayer & { png: Buffer };

export function layerizationArtifactKey(input: { workItemId: string; attemptId: string }, extension: "psd" | "zip"): string {
  return `creative-work/${input.workItemId}/layerize/${input.attemptId}/piece.${extension}`;
}

export async function recomposeLayerBitmaps(input: {
  width: number;
  height: number;
  layers: LayerBitmap[];
}): Promise<Buffer> {
  return recomposeStoredLayers({
    width: input.width,
    height: input.height,
    layers: input.layers,
    load: async (layer) => input.layers.find((candidate) => candidate.storageKey === layer.storageKey)!.png,
  });
}

export async function recomposeStoredLayers(input: {
  width: number;
  height: number;
  layers: LayerizationLayer[];
  load: (layer: LayerizationLayer) => Promise<Buffer>;
}): Promise<Buffer> {
  const base = input.layers.find((layer) => layer.isBase);
  if (!base) throw new Error("Layerization has no base bitmap");
  let recomposed = await sharp(await input.load(base))
    .resize(input.width, input.height, { fit: "fill" })
    .ensureAlpha()
    .png()
    .toBuffer();
  for (const layer of input.layers.filter((candidate) => !candidate.isBase).sort((left, right) => left.order - right.order)) {
    const overlay = await sharp(await input.load(layer))
      .resize(layer.width, layer.height, { fit: "fill" })
      .ensureAlpha()
      .png()
      .toBuffer();
    recomposed = await sharp(recomposed).composite([{ input: overlay, left: layer.x, top: layer.y }]).png().toBuffer();
  }
  return recomposed;
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
  return writeStoredLayerizationPsd({
    ...input,
    load: async (layer) => input.layers.find((candidate) => candidate.storageKey === layer.storageKey)!.png,
  });
}

export async function writeStoredLayerizationPsd(input: {
  width: number;
  height: number;
  layers: LayerizationLayer[];
  recomposed: Buffer;
  load: (layer: LayerizationLayer) => Promise<Buffer>;
}): Promise<Buffer> {
  const children = [];
  for (const layer of [...input.layers].sort((left, right) => right.order - left.order)) {
    children.push({
      name: layer.name,
      left: layer.x,
      top: layer.y,
      right: layer.x + layer.width,
      bottom: layer.y + layer.height,
      imageData: await imageData(await input.load(layer), layer.width, layer.height),
    });
  }
  return writePsdBuffer({
    width: input.width,
    height: input.height,
    children,
    imageData: await imageData(input.recomposed, input.width, input.height),
  });
}

export { writeLayerizationDiagnosticZipFile } from "./artifacts-zip";

export async function writeLayerizationDiagnosticZip(input: {
  original: Buffer;
  recomposed: Buffer;
  layers: LayerBitmap[];
  manifest: Record<string, unknown>;
}): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), "adscale-layerize-zip-"));
  const filePath = join(directory, "piece.zip");
  try {
    await writeLayerizationDiagnosticZipFile({
      filePath,
      loadOriginal: async () => input.original,
      loadRecomposed: async () => input.recomposed,
      layers: input.layers,
      loadLayer: async (layer) => input.layers.find((candidate) => candidate.storageKey === layer.storageKey)!.png,
      manifest: input.manifest,
    });
    return readFile(filePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
