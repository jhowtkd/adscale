import { beforeEach, describe, expect, it, vi } from "vitest";
import { initializeCanvas, readPsd } from "ag-psd";
import sharp from "sharp";
import type { LayerEditorStateV1 } from "./contracts";

const mocks = vi.hoisted(() => ({ output: vi.fn(), head: vi.fn(), get: vi.fn(), put: vi.fn() }));
vi.mock("@/server/repositories/creative-work-layer-editor", () => ({ getCreativeWorkLayerEditorOutput: mocks.output }));
vi.mock("@/server/storage", () => ({ objectStorage: { head: mocks.head, get: mocks.get, put: mocks.put } }));

import { layerEditorArtifactKey, materializeLayerEditorDraft } from "./artifacts";

initializeCanvas(
  () => { throw new Error("Canvas rendering is not used in this test"); },
  () => { throw new Error("Thumbnail rendering is not used in this test"); },
  (width, height) => ({ width, height, colorSpace: "srgb", data: new Uint8ClampedArray(width * height * 4) }),
);

const input = { workspaceId: "workspace-1", workItemId: "work-1", outputId: "output-1", revision: 4 };

function layer(order: number, name: string, visible: boolean, x: number, y: number, width: number, height: number) {
  const key = `layers/${order}.png`;
  return {
    id: `00000000-0000-4000-8000-${String(order + 1).padStart(12, "0")}`,
    source: { order, name, visible, x, y, width, height, key },
    order, name, visible, x, y, width, height,
    currentKey: key, currentKind: "source" as const, restorableKey: null,
  };
}

const state: LayerEditorStateV1 = {
  schemaVersion: 1, revision: 4, sourceLayerizationAttemptId: "attempt-1", canvas: { width: 4, height: 4 },
  layers: [
    layer(2, "Hidden", false, 0, 0, 1, 1),
    layer(1, "Front", true, 1, 1, 2, 2),
    layer(0, "Base", true, 0, 0, 4, 4),
  ],
  lease: null, regeneration: null, publishedPsdKey: null, updatedAt: "2026-09-22T12:00:00.000Z",
};

async function solid(width: number, height: number, rgba: [number, number, number, number]) {
  return sharp({ create: { width, height, channels: 4, background: rgba } }).png().toBuffer();
}

describe("materializeLayerEditorDraft", () => {
  let saved: Map<string, Buffer>;

  beforeEach(async () => {
    vi.clearAllMocks();
    saved = new Map([
      ["layers/0.png", await solid(4, 4, [20, 30, 40, 255])],
      ["layers/1.png", await solid(2, 2, [220, 30, 40, 128])],
      ["layers/2.png", await solid(1, 1, [20, 220, 40, 255])],
    ]);
    mocks.output.mockResolvedValue({ layerEditor: state });
    mocks.head.mockImplementation(async (key: string) => saved.has(key) ? { size: saved.get(key)!.length } : null);
    mocks.get.mockImplementation(async (key: string) => {
      const value = saved.get(key);
      if (!value) throw new Error(`Missing fixture ${key}`);
      return value;
    });
    mocks.put.mockImplementation(async (key: string, value: Buffer) => { saved.set(key, value); });
  });

  it("lê cada chave uma vez e mantém PNG e PSD editável equivalentes", async () => {
    const keys = await materializeLayerEditorDraft(input);
    expect(keys).toEqual({ pngKey: layerEditorArtifactKey(input, "png"), psdKey: layerEditorArtifactKey(input, "psd") });
    expect(mocks.get.mock.calls.map(([key]) => key).sort()).toEqual(["layers/0.png", "layers/1.png", "layers/2.png"]);
    expect(mocks.put).toHaveBeenCalledTimes(2);
    expect(mocks.put).toHaveBeenCalledWith(keys.pngKey, expect.any(Buffer), "image/png");
    expect(mocks.put).toHaveBeenCalledWith(keys.psdKey, expect.any(Buffer), "image/vnd.adobe.photoshop");

    const png = saved.get(keys.pngKey)!;
    const psd = readPsd(saved.get(keys.psdKey)!, { skipThumbnail: true, useImageData: true });
    expect(psd.children?.map(({ name, hidden, left, top, right, bottom }) => ({ name, hidden: !!hidden, left, top, right, bottom }))).toEqual([
      { name: "Hidden", hidden: true, left: 0, top: 0, right: 1, bottom: 1 },
      { name: "Front", hidden: false, left: 1, top: 1, right: 3, bottom: 3 },
      { name: "Base", hidden: false, left: 0, top: 0, right: 4, bottom: 4 },
    ]);
    expect(psd.children?.every((child) => child.imageData?.data)).toBe(true);
    const rgba = await sharp(png).ensureAlpha().raw().toBuffer();
    expect([...psd.imageData!.data]).toEqual([...rgba]);
    expect([...rgba.subarray(0, 4)]).toEqual([20, 30, 40, 255]);

    await expect(materializeLayerEditorDraft(input)).resolves.toEqual(keys);
    expect(mocks.get).toHaveBeenCalledTimes(3);
    expect(mocks.put).toHaveBeenCalledTimes(2);
  });

  it.each(["png", "psd"] as const)("preserva o artefato %s já existente", async (format) => {
    const existingKey = layerEditorArtifactKey(input, format);
    const existing = Buffer.from("already materialized");
    saved.set(existingKey, existing);

    await materializeLayerEditorDraft(input);

    expect(saved.get(existingKey)).toBe(existing);
    expect(mocks.put).toHaveBeenCalledTimes(1);
    expect(mocks.put.mock.calls[0]?.[0]).toBe(layerEditorArtifactKey(input, format === "png" ? "psd" : "png"));
    expect(mocks.get.mock.calls.map(([key]) => key).sort()).toEqual(format === "png"
      ? ["layers/0.png", "layers/1.png", "layers/2.png"]
      : ["layers/0.png", "layers/1.png"]);
  });
});
