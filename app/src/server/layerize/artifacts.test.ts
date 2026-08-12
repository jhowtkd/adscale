import { describe, expect, it } from "vitest";
import { readPsd } from "ag-psd";
import JSZip from "jszip";
import sharp from "sharp";
import type { LayerBitmap } from "./artifacts";
import { calculateLayerizationFidelity, recomposeLayerBitmaps, writeLayerizationDiagnosticZip, writeLayerizationPsd } from "./artifacts";

async function solid(width: number, height: number, rgba: [number, number, number, number]) {
  return sharp({
    create: { width, height, channels: 4, background: rgba },
  }).png().toBuffer();
}

describe("layerization artifacts", () => {
  it("recomposes deterministically, passes the provisional gate, and writes a readable PSD/ZIP", async () => {
    const original = await solid(4, 4, [20, 30, 40, 255]);
    const transparentOverlay = await solid(2, 1, [0, 0, 0, 0]);
    const layers: LayerBitmap[] = [
      {
        order: 0,
        isBase: true,
        name: "Base",
        description: "Canvas base",
        x: 0,
        y: 0,
        width: 4,
        height: 4,
        normalizedBoundingBox: { x: 0, y: 0, width: 1, height: 1 },
        storageKey: "layers/00.png",
        sourceBytes: original.length,
        png: original,
      },
      {
        order: 1,
        isBase: false,
        name: "Headline",
        description: "Main headline",
        x: 1,
        y: 1,
        width: 2,
        height: 1,
        normalizedBoundingBox: { x: 0.25, y: 0.25, width: 0.5, height: 0.25 },
        storageKey: "layers/01.png",
        sourceBytes: transparentOverlay.length,
        png: transparentOverlay,
      },
    ];
    const recomposed = await recomposeLayerBitmaps({ width: 4, height: 4, layers });
    const fidelity = await calculateLayerizationFidelity(original, recomposed, { width: 4, height: 4 });
    expect(fidelity.gate).toBe("passed");
    const psd = await writeLayerizationPsd({ width: 4, height: 4, layers, recomposed });
    const parsed = readPsd(psd, { skipCompositeImageData: true, skipThumbnail: true, skipLayerImageData: true });
    expect(parsed.width).toBe(4);
    expect(parsed.children?.map((layer) => layer.name)).toEqual(["Headline", "Base"]);
    const zip = await writeLayerizationDiagnosticZip({
      original,
      recomposed,
      layers,
      manifest: { fidelity, canvas: { width: 4, height: 4 } },
    });
    const loaded = await JSZip.loadAsync(zip);
    expect(Object.keys(loaded.files).sort()).toEqual([
      "layers/",
      "layers/00-base.png",
      "layers/01-headline.png",
      "manifest.json",
      "original.png",
      "recomposed-preview.png",
    ]);
  });
});
