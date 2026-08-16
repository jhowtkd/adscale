import { describe, expect, it, vi } from "vitest";
import {
  createSeedreamProvider,
  downloadSeedreamLayers,
  downloadSeedreamMedia,
  estimateSeedreamLayerizationCostUsd,
  normalizeSeedreamLayerResponse,
  validateSeedreamMediaUrl,
} from "./seedream-provider";
import sharp from "sharp";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const publicLookup = async () => [{ address: "93.184.216.34" }];

function layerResponse() {
  return {
    outputs: [
      "https://storage.atlascloud.ai/base.png",
      "https://storage.atlascloud.ai/headline.png",
    ],
    layers: [
      {
        z_index: 0,
        bounding_box: null,
      },
      {
        z_index: 1,
        name: "Headline",
        description: "Main headline",
        bounding_box: {
          absolute: [1, 1, 3, 2],
          normalized: [250, 250, 750, 500],
        },
      },
    ],
  };
}

describe("seedream layerize contract", () => {
  it("estimates the documented per-layer price from the generated base area", () => {
    expect(estimateSeedreamLayerizationCostUsd(1536, 1536, 8)).toBeCloseTo(0.36);
    expect(estimateSeedreamLayerizationCostUsd(1537, 1536, 8)).toBeCloseTo(0.72);
  });

  it("normalizes a base plus ordered layers and rejects duplicates", () => {
    const normalized = normalizeSeedreamLayerResponse(layerResponse(), { width: 4, height: 4 });
    expect(normalized.layers.map((layer) => [layer.order, layer.isBase])).toEqual([[0, true], [1, false]]);
    expect(normalized).toMatchObject({
      width: 4,
      height: 4,
      layers: [
        { order: 0, isBase: true, x: 0, y: 0, width: 4, height: 4 },
        { order: 1, isBase: false, x: 1, y: 1, width: 2, height: 1 },
      ],
    });
    expect(() => normalizeSeedreamLayerResponse({
      ...layerResponse(),
      layers: [layerResponse().layers[0], { ...layerResponse().layers[1], z_index: 0 }],
    }, { width: 4, height: 4 })).toThrow(/ordered/);
    expect(() => normalizeSeedreamLayerResponse({
      ...layerResponse(),
      layers: [layerResponse().layers[0], layerResponse().layers[1]],
    }, { width: 100_000, height: 100_000 })).toThrow(/canvas dimensions/);
    expect(() => normalizeSeedreamLayerResponse({
      ...layerResponse(),
      layers: [layerResponse().layers[0], { ...layerResponse().layers[1], z_index: 17 }],
    }, { width: 4, height: 4 })).toThrow(/ordered/);
    expect(() => normalizeSeedreamLayerResponse({
      ...layerResponse(),
      layers: [
        layerResponse().layers[0],
        { ...layerResponse().layers[1], z_index: undefined },
      ],
    }, { width: 4, height: 4 })).toThrow(/ordered name, description, bbox, or output/);
    expect(() => normalizeSeedreamLayerResponse({ output: layerResponse() })).toThrow(/not an object|invalid canvas/);
  });

  it("submits to Atlas and polls the prediction endpoint without provider retries", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "req-1" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { status: "completed" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: layerResponse() }), { status: 200 }));
    const provider = createSeedreamProvider({ apiKey: "test-key", fetchImpl });
    await expect(provider.submit({
      prompt: "x",
      imageUrl: "https://signed.example/source.png",
      callbackUrl: "https://app.example/api/creative-work/work-1?token=secret",
    })).resolves.toEqual({ requestId: "req-1" });
    await expect(provider.status("req-1")).resolves.toBe("COMPLETED");
    await expect(provider.result("req-1")).resolves.toEqual({ data: layerResponse() });
    const headers = fetchImpl.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");
    expect(fetchImpl.mock.calls[0][0].toString()).toBe(
      "https://api.atlascloud.ai/api/v1/model/generateImage",
    );
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toMatchObject({
      model: "bytedance/seedream-v5.0-pro/layer-decomposition",
      image: "https://signed.example/source.png",
      size: "1K",
      output_format: "png",
    });
    expect(fetchImpl.mock.calls[2][0].toString()).toBe(
      "https://api.atlascloud.ai/api/v1/model/prediction/req-1",
    );
  });

  it("surfaces provider HTTP failures without retrying", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("upstream", { status: 503 }));
    const provider = createSeedreamProvider({ apiKey: "test-key", fetchImpl });

    await expect(provider.submit({ prompt: "x", imageUrl: "https://signed.example/source.png" }))
      .rejects.toMatchObject({ code: "provider_error", httpStatus: 503 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects non-allowlisted or private media before fetching", async () => {
    await expect(validateSeedreamMediaUrl("https://example.com/image.png", { lookup: publicLookup })).rejects.toThrow(/allowlisted/);
    await expect(validateSeedreamMediaUrl("https://storage.atlascloud.ai/image.png", {
      lookup: async () => [{ address: "169.254.169.254" }],
    })).rejects.toThrow(/private/);
    await expect(validateSeedreamMediaUrl("https://storage.atlascloud.ai/image.png", {
      lookup: async () => [{ address: "::ffff:0a00:0001" }],
    })).rejects.toThrow(/private/);
  });

  it("requires PNG bytes and limits redirects", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(png, {
      status: 200,
      headers: { "content-type": "image/png" },
    }));
    await expect(downloadSeedreamMedia("https://storage.atlascloud.ai/image.png", {
      fetchImpl,
      lookup: publicLookup,
    })).resolves.toEqual(png);
    const bad = vi.fn<typeof fetch>().mockResolvedValue(new Response("not-png", {
      status: 200,
      headers: { "content-type": "image/png" },
    }));
    await expect(downloadSeedreamMedia("https://storage.atlascloud.ai/image.png", {
      fetchImpl: bad,
      lookup: publicLookup,
    })).rejects.toThrow(/invalid PNG/);
  });

  it("rejects a fully transparent non-base layer before storing it", async () => {
    const transparent = await sharp({
      create: { width: 2, height: 2, channels: 4, background: [0, 0, 0, 0] },
    }).png().toBuffer();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(transparent, {
      status: 200,
      headers: { "content-type": "image/png" },
    }));
    const store = vi.fn(async () => undefined);

    await expect(downloadSeedreamLayers([
      { sourceUrl: "https://storage.atlascloud.ai/empty.png", isBase: false },
    ], { fetchImpl, lookup: publicLookup, store })).rejects.toThrow(/transparent/);
    expect(store).not.toHaveBeenCalled();
  });

  it("streams validated PNG layers to storage instead of handing it a buffer", async () => {
    const opaque = await sharp({
      create: { width: 2, height: 2, channels: 4, background: [20, 30, 40, 255] },
    }).png().toBuffer();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(opaque, {
      status: 200,
      headers: { "content-type": "image/png" },
    }));
    const stored: Buffer[] = [];

    await downloadSeedreamLayers([
      { sourceUrl: "https://storage.atlascloud.ai/opaque.png", isBase: false },
    ], {
      fetchImpl,
      lookup: publicLookup,
      store: async (_layer, _index, stream) => {
        expect(Buffer.isBuffer(stream)).toBe(false);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        stored.push(Buffer.concat(chunks));
      },
    });

    expect(stored).toEqual([opaque]);
  });

  it("debits the shared aggregate budget while streaming and stops before storing", async () => {
    const opaque = await sharp({
      create: { width: 8, height: 8, channels: 4, background: [20, 30, 40, 255] },
    }).png().toBuffer();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => new Response(opaque, {
      status: 200,
      headers: { "content-type": "image/png" },
    }));
    const store = vi.fn(async () => undefined);

    await expect(downloadSeedreamLayers([
      { sourceUrl: "https://v3.fal.media/one.png", isBase: true },
      { sourceUrl: "https://v3.fal.media/two.png", isBase: false },
    ], {
      fetchImpl,
      lookup: publicLookup,
      store,
      maxTotalBytes: opaque.length + 4,
    })).rejects.toThrow(/total size limit/);
    expect(store).not.toHaveBeenCalled();
  });
});
