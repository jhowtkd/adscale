import { describe, expect, it, vi } from "vitest";
import {
  createSeedreamProvider,
  downloadSeedreamMedia,
  normalizeSeedreamLayerResponse,
  validateSeedreamMediaUrl,
} from "./seedream-provider";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const publicLookup = async () => [{ address: "93.184.216.34" }];

function layerResponse() {
  return {
    width: 4,
    height: 4,
    layers: [
      { base: true, order: 0, name: "Base", description: "Canvas base", url: "https://v3.fal.media/base.png", bbox: { x: 0, y: 0, width: 4, height: 4 } },
      { order: 1, name: "Headline", description: "Main headline", url: "https://v3.fal.media/headline.png", bbox: { x: 1, y: 1, width: 2, height: 1 } },
    ],
  };
}

describe("seedream layerize contract", () => {
  it("normalizes a base plus ordered layers and rejects duplicates", () => {
    const normalized = normalizeSeedreamLayerResponse(layerResponse());
    expect(normalized.layers.map((layer) => [layer.order, layer.isBase])).toEqual([[0, true], [1, false]]);
    expect(() => normalizeSeedreamLayerResponse({
      ...layerResponse(),
      layers: [layerResponse().layers[0], { ...layerResponse().layers[1], order: 0 }],
    })).toThrow(/ordered/);
    expect(() => normalizeSeedreamLayerResponse({ ...layerResponse(), width: 100_000, height: 100_000 })).toThrow(/canvas dimensions/);
    expect(() => normalizeSeedreamLayerResponse({
      ...layerResponse(),
      layers: [layerResponse().layers[0], { ...layerResponse().layers[1], order: 17 }],
    })).toThrow(/ordered/);
    expect(() => normalizeSeedreamLayerResponse({
      ...layerResponse(),
      layers: [layerResponse().layers[0], { ...layerResponse().layers[1], name: "x".repeat(129) }],
    })).toThrow(/ordered/);
  });

  it("sends the official queue safety headers without provider retries", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ request_id: "req-1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "COMPLETED" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(layerResponse()), { status: 200 }));
    const provider = createSeedreamProvider({ apiKey: "test-key", fetchImpl });
    await expect(provider.submit({ prompt: "x", imageUrl: "https://signed.example/source.png" })).resolves.toEqual({ requestId: "req-1" });
    await expect(provider.status("req-1")).resolves.toBe("COMPLETED");
    await expect(provider.result("req-1")).resolves.toMatchObject({ width: 4 });
    const headers = fetchImpl.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Key test-key");
    expect(headers["X-Fal-Store-IO"]).toBe("0");
    expect(headers["X-Fal-No-Retry"]).toBe("1");
    expect(headers["x-app-fal-disable-fallback"]).toBe("true");
  });

  it("surfaces provider HTTP failures without retrying", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("upstream", { status: 503 }));
    const provider = createSeedreamProvider({ apiKey: "test-key", fetchImpl });

    await expect(provider.submit({ prompt: "x", imageUrl: "https://signed.example/source.png" }))
      .rejects.toMatchObject({ code: "provider_error" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects non-allowlisted or private media before fetching", async () => {
    await expect(validateSeedreamMediaUrl("https://example.com/image.png", { lookup: publicLookup })).rejects.toThrow(/allowlisted/);
    await expect(validateSeedreamMediaUrl("https://v3.fal.media/image.png", {
      lookup: async () => [{ address: "169.254.169.254" }],
    })).rejects.toThrow(/private/);
    await expect(validateSeedreamMediaUrl("https://v3.fal.media/image.png", {
      lookup: async () => [{ address: "::ffff:0a00:0001" }],
    })).rejects.toThrow(/private/);
  });

  it("requires PNG bytes and limits redirects", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(png, {
      status: 200,
      headers: { "content-type": "image/png" },
    }));
    await expect(downloadSeedreamMedia("https://v3.fal.media/image.png", {
      fetchImpl,
      lookup: publicLookup,
    })).resolves.toEqual(png);
    const bad = vi.fn<typeof fetch>().mockResolvedValue(new Response("not-png", {
      status: 200,
      headers: { "content-type": "image/png" },
    }));
    await expect(downloadSeedreamMedia("https://v3.fal.media/image.png", {
      fetchImpl: bad,
      lookup: publicLookup,
    })).rejects.toThrow(/invalid PNG/);
  });
});
