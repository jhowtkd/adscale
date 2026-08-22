import "server-only";

import { writePsdBuffer } from "ag-psd";
import sharp from "sharp";

import { layerEditorStateFromDatabase, type LayerEditorStateV1 } from "./contracts";
import { getCreativeWorkLayerEditorOutput } from "@/server/repositories/creative-work-layer-editor";
import { objectStorage } from "@/server/storage";

export type RenderableLayer = Pick<LayerEditorStateV1["layers"][number], "id" | "order" | "name" | "visible" | "x" | "y" | "width" | "height" | "currentKey">;

export function layerEditorArtifactKey(input: { workItemId: string; outputId: string; revision: number }, format: "png" | "psd"): string {
  return `creative-work/${input.workItemId}/layer-editor/${input.outputId}/draft/${input.revision}/piece.${format}`;
}

async function imageData(buffer: Buffer, width: number, height: number) {
  const { data } = await sharp(buffer).resize(width, height, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width, height, colorSpace: "srgb" as PredefinedColorSpace, data: new Uint8ClampedArray(data) };
}

export async function renderLayerEditorPng(input: { canvas: { width: number; height: number }; layers: RenderableLayer[]; load: (key: string) => Promise<Buffer> }): Promise<Buffer> {
  const composites = await Promise.all(input.layers.filter((layer) => layer.visible).sort((a, b) => b.order - a.order).map(async (layer) => ({
    input: await sharp(await input.load(layer.currentKey)).resize(layer.width, layer.height, { fit: "fill" }).ensureAlpha().png().toBuffer(), left: layer.x, top: layer.y,
  })));
  return sharp({ create: { width: input.canvas.width, height: input.canvas.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composites).png().toBuffer();
}

export async function writeLayerEditorPsd(input: { canvas: { width: number; height: number }; layers: RenderableLayer[]; load: (key: string) => Promise<Buffer> }): Promise<Buffer> {
  const composite = await renderLayerEditorPng(input);
  const children = await Promise.all([...input.layers].sort((a, b) => b.order - a.order).map(async (layer) => ({
    name: layer.name, left: layer.x, top: layer.y, right: layer.x + layer.width, bottom: layer.y + layer.height, hidden: !layer.visible,
    imageData: await imageData(await input.load(layer.currentKey), layer.width, layer.height),
  })));
  return writePsdBuffer({ width: input.canvas.width, height: input.canvas.height, children, imageData: await imageData(composite, input.canvas.width, input.canvas.height) });
}

export async function materializeLayerEditorDraft(input: { workspaceId: string; workItemId: string; outputId: string; revision: number }): Promise<{ pngKey: string; psdKey: string }> {
  const output = await getCreativeWorkLayerEditorOutput(input);
  const state = layerEditorStateFromDatabase(output?.layerEditor);
  if (!state || state.revision !== input.revision) throw new Error("Saved layer editor revision is unavailable");
  const pngKey = layerEditorArtifactKey(input, "png");
  const psdKey = layerEditorArtifactKey(input, "psd");
  const load = (key: string) => objectStorage.get(key);
  if (!await objectStorage.head(pngKey)) await objectStorage.put(pngKey, await renderLayerEditorPng({ canvas: state.canvas, layers: state.layers, load }), "image/png");
  if (!await objectStorage.head(psdKey)) await objectStorage.put(psdKey, await writeLayerEditorPsd({ canvas: state.canvas, layers: state.layers, load }), "image/vnd.adobe.photoshop");
  return { pngKey, psdKey };
}
