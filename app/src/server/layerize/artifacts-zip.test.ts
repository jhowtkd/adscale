import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { writeLayerizationDiagnosticZipFile } from "./artifacts-zip";

async function png() {
  return sharp({ create: { width: 2, height: 2, channels: 4, background: [20, 30, 40, 255] } }).png().toBuffer();
}

const layer = {
  order: 0,
  isBase: true,
  name: "Base",
  description: "Base",
  x: 0,
  y: 0,
  width: 2,
  height: 2,
  normalizedBoundingBox: { x: 0, y: 0, width: 1, height: 1 },
  storageKey: "layers/00.png",
  sourceBytes: 8,
};

describe("writeLayerizationDiagnosticZipFile", () => {
  it("destroys the write stream when a later entry fails to load", async () => {
    const directory = await mkdtemp(join(tmpdir(), "adscale-layerize-zip-fail-"));
    const filePath = join(directory, "piece.zip");
    const original = await png();
    try {
      await expect(writeLayerizationDiagnosticZipFile({
        filePath,
        loadOriginal: async () => original,
        loadRecomposed: async () => original,
        layers: [layer, { ...layer, order: 1, storageKey: "layers/01.png", name: "Overlay", isBase: false }],
        loadLayer: async (candidate) => {
          if (candidate.order === 1) throw new Error("layer missing");
          return original;
        },
        manifest: { ok: true },
      })).rejects.toThrow(/layer missing/);
      const handle = await open(filePath, "r+");
      await handle.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
