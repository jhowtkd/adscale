import { describe, expect, it } from "vitest";
import { initializeCanvas, readPsd } from "ag-psd";
import JSZip from "jszip";
import sharp from "sharp";
import type { LayerBitmap } from "./artifacts";
import { calculateLayerizationFidelity, recomposeLayerBitmaps, writeLayerizationDiagnosticZip, writeLayerizationPsd } from "./artifacts";

initializeCanvas(
  () => { throw new Error("Canvas rendering is not used in this test"); },
  () => { throw new Error("Thumbnail rendering is not used in this test"); },
  (width, height) => ({ width, height, colorSpace: "srgb", data: new Uint8ClampedArray(width * height * 4) }),
);

async function solid(width: number, height: number, rgba: [number, number, number, number]) {
  return sharp({
    create: { width, height, channels: 4, background: rgba },
  }).png().toBuffer();
}

describe("layerization artifacts", () => {
  it("recomposes deterministically, passes the provisional gate, and writes a readable PSD/ZIP", async () => {
    const base = await solid(4, 4, [20, 30, 40, 255]);
    const overlay = await solid(2, 1, [220, 30, 40, 255]);
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
        sourceBytes: base.length,
        png: base,
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
        sourceBytes: overlay.length,
        png: overlay,
      },
    ];
    const original = await recomposeLayerBitmaps({ width: 4, height: 4, layers });
    const recomposed = await recomposeLayerBitmaps({ width: 4, height: 4, layers });
    const fidelity = await calculateLayerizationFidelity(original, recomposed, { width: 4, height: 4 });
    expect(fidelity.gate).toBe("passed");
    const misplaced = await recomposeLayerBitmaps({
      width: 4,
      height: 4,
      layers: layers.map((layer) => layer.isBase ? layer : { ...layer, x: 0, y: 0 }),
    });
    await expect(calculateLayerizationFidelity(original, misplaced, { width: 4, height: 4 }))
      .resolves.toMatchObject({ gate: "failed" });
    const psd = await writeLayerizationPsd({ width: 4, height: 4, layers, recomposed });
    const parsed = readPsd(psd, { skipThumbnail: true, useImageData: true });
    expect(parsed.width).toBe(4);
    expect(parsed.children?.map((layer) => layer.name)).toEqual(["Headline", "Base"]);
    expect(parsed.children?.map(({ left, top, right, bottom }) => ({ left, top, right, bottom }))).toEqual([
      { left: 1, top: 1, right: 3, bottom: 2 },
      { left: 0, top: 0, right: 4, bottom: 4 },
    ]);
    expect(parsed.imageData?.data).toBeDefined();
    expect(parsed.children?.every((layer) => layer.imageData?.data)).toBe(true);
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
    await expect(loaded.file("manifest.json")?.async("string")).resolves.toContain('"gate": "passed"');
    await expect(loaded.file("layers/01-headline.png")?.async("nodebuffer")).resolves.toEqual(overlay);
  });
});
