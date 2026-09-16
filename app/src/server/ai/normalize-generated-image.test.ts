import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: { OPENAI_API_KEY: "test-key", OPENAI_IMAGE_MODEL: "gpt-image-2-2026-04-21" },
}));

// sharp is intentionally NOT mocked here: this file proves real bytes.
import sharp from "sharp";

import { normalizeGeneratedImage } from "./image-generation";

/**
 * Real-bytes resize proof (ICE-04A): 3:4 delivery is a ratio-preserving
 * downscale of the 3:4 generation canvas — never a stretch of 4:5.
 * The asymmetric marker denounces distortion: a stretched resize would
 * turn the square into a rectangle or move it off its scaled position.
 */
async function asymmetric34Fixture(): Promise<Buffer> {
  const marker = { left: 800, top: 200, size: 200 };
  return sharp({
    create: { width: 1152, height: 1536, channels: 3, background: { r: 20, g: 20, b: 20 } },
  })
    .composite([
      {
        input: await sharp({
          create: { width: marker.size, height: marker.size, channels: 3, background: { r: 255, g: 255, b: 255 } },
        })
          .png()
          .toBuffer(),
        left: marker.left,
        top: marker.top,
      },
    ])
    .png()
    .toBuffer();
}

async function whiteBoundingBox(png: Buffer): Promise<{ left: number; top: number; width: number; height: number }> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * info.channels;
      if (data[i]! > 200 && data[i + 1]! > 200 && data[i + 2]! > 200) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

describe("normalizeGeneratedImage 3:4 (real bytes)", () => {
  it("delivers 1080x1440 with the marker square and proportionally placed", async () => {
    const normalized = await normalizeGeneratedImage(
      await asymmetric34Fixture(),
      { width: 1080, height: 1440 },
      "art_variation",
    );
    const meta = await sharp(normalized).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1440);

    const box = await whiteBoundingBox(normalized);
    // Square in, square out: a 4:5 stretch would fail here.
    expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(2);
    // Scaled position: 1152x1536 -> 1080x1440 is a 0.9375 downscale.
    const scale = 1080 / 1152;
    expect(box.left).toBeGreaterThanOrEqual(Math.floor(800 * scale) - 2);
    expect(box.left).toBeLessThanOrEqual(Math.ceil(800 * scale) + 2);
    expect(box.top).toBeGreaterThanOrEqual(Math.floor(200 * scale) - 2);
    expect(box.top).toBeLessThanOrEqual(Math.ceil(200 * scale) + 2);
  }, 30_000);
});
