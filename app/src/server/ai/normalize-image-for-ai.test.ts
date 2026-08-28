import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { inspectUsableTransparency, InvalidImageInputError, normalizeImageForAi } from "./normalize-image-for-ai";

describe("normalizeImageForAi", () => {
  it("downscales a large JPEG to max 2048 without enlarging smaller images", async () => {
    const large = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: { r: 20, g: 40, b: 60 } },
    }).jpeg().toBuffer();
    const original = Buffer.from(large);
    const result = await normalizeImageForAi({ buffer: large, mimeType: "image/jpeg" });
    expect(result.mimeType).toBe("image/webp");
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(2048);
    expect(result.hasTransparency).toBe(false);
    expect(result.originalBytes).toBe(original.byteLength);
    expect(Buffer.compare(large, original)).toBe(0);

    const small = await sharp({
      create: { width: 320, height: 240, channels: 3, background: { r: 1, g: 2, b: 3 } },
    }).jpeg().toBuffer();
    const smallResult = await normalizeImageForAi({ buffer: small, mimeType: "image/jpeg" });
    expect(smallResult.width).toBe(320);
    expect(smallResult.height).toBe(240);
  });

  it("keeps transparent PNGs as PNG", async () => {
    const png = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 0.5 },
      },
    }).png().toBuffer();
    const result = await normalizeImageForAi({ buffer: png, mimeType: "image/png" });
    expect(result.mimeType).toBe("image/png");
    expect(result.hasTransparency).toBe(true);
  });

  it("keeps generic channel detection separate from exact usable-transparency inspection", async () => {
    const png = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    }).png().toBuffer();

    const result = await normalizeImageForAi({ buffer: png, mimeType: "image/png" });
    expect(result.hasTransparency).toBe(true);
    expect(result.mimeType).toBe("image/png");
    await expect(inspectUsableTransparency(png)).resolves.toBe(false);
  });

  it("applies EXIF orientation", async () => {
    const base = await sharp({
      create: { width: 100, height: 50, channels: 3, background: { r: 10, g: 20, b: 30 } },
    }).jpeg().toBuffer();
    const rotated = await sharp(base).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const result = await normalizeImageForAi({ buffer: rotated, mimeType: "image/jpeg" });
    expect(result.width).toBe(50);
    expect(result.height).toBe(100);
  });

  it("rejects invalid files with a typed error", async () => {
    await expect(normalizeImageForAi({ buffer: Buffer.from("not-an-image") })).rejects.toBeInstanceOf(
      InvalidImageInputError
    );
  });
});
