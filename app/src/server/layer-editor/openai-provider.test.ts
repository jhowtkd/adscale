import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizeLayerCandidate } from "./openai-provider";

describe("normalizeLayerCandidate", () => {
  it("returns a transparent PNG exactly source-sized with the candidate centered", async () => {
    const source = await sharp({ create: { width: 40, height: 20, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    const normalized = await normalizeLayerCandidate(source, { width: 100, height: 100 });
    const image = sharp(normalized);
    const metadata = await image.metadata();
    const raw = await image.raw().toBuffer({ resolveWithObject: true });

    expect(metadata).toMatchObject({ format: "png", width: 100, height: 100, hasAlpha: true });
    const alphaAt = (x: number, y: number) => raw.data[(y * 100 + x) * raw.info.channels + 3];
    expect(alphaAt(50, 50)).toBeGreaterThan(0);
    expect(alphaAt(50, 5)).toBe(0);
  });
});
