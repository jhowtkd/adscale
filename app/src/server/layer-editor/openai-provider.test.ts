import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizeLayerCandidate } from "./openai-provider";

describe("normalizeLayerCandidate", () => {
  it("returns a transparent PNG exactly source-sized with the candidate centered", async () => {
    const foreground = await sharp({ create: { width: 20, height: 10, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    const source = await sharp({ create: { width: 40, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: foreground, left: 10, top: 5 }]).png().toBuffer();
    const normalized = await normalizeLayerCandidate(source, { width: 100, height: 100 });
    const image = sharp(normalized);
    const metadata = await image.metadata();
    const raw = await image.raw().toBuffer({ resolveWithObject: true });

    expect(metadata).toMatchObject({ format: "png", width: 100, height: 100, hasAlpha: true });
    const alphaAt = (x: number, y: number) => raw.data[(y * 100 + x) * raw.info.channels + 3];
    expect(alphaAt(50, 50)).toBeGreaterThan(0);
    expect(alphaAt(50, 5)).toBe(0);
  });

  it("rejects a PNG with an alpha channel whose pixels are all opaque", async () => {
    const opaque = await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 20, g: 30, b: 40, alpha: 1 } } }).png().toBuffer();
    await expect(normalizeLayerCandidate(opaque, { width: 20, height: 20 })).rejects.toThrow(/transparency/i);
  });
});
