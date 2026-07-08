import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  normalizeTrainingUpload,
  sanitizeStorageFilename,
} from "./upload";

describe("normalizeTrainingUpload", () => {
  it("detects alpha in a transparent PNG", async () => {
    const buffer = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
    const file = new File([buffer], "logo.png", { type: "image/png" });

    await expect(normalizeTrainingUpload(file)).resolves.toMatchObject({
      type: "image/png",
      extension: "png",
      hasAlpha: true,
    });
  });

  it("rasterizes SVG and never returns SVG content", async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#00ff00"/></svg>';
    const file = new File([svg], "mark.svg", { type: "image/svg+xml" });
    const result = await normalizeTrainingUpload(file);

    expect(result.type).toBe("image/png");
    expect(result.extension).toBe("png");
    expect(result.buffer.subarray(0, 4)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  it("returns hasAlpha=false for an opaque PNG", async () => {
    const buffer = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();
    const file = new File([buffer], "solid.png", { type: "image/png" });

    const result = await normalizeTrainingUpload(file);
    expect(result.hasAlpha).toBe(false);
    expect(result.extension).toBe("png");
  });

  it("rejects files larger than the training asset limit", async () => {
    // 10MB + 1 byte buffer
    const tooBig = Buffer.alloc(10 * 1024 * 1024 + 1, 0);
    const file = new File([tooBig], "huge.png", { type: "image/png" });

    await expect(normalizeTrainingUpload(file)).rejects.toThrow("invalid_size");
  });

  it("rejects empty files", async () => {
    const file = new File([], "empty.png", { type: "image/png" });

    await expect(normalizeTrainingUpload(file)).rejects.toThrow("invalid_size");
  });

  it("rejects unsupported mime types", async () => {
    const file = new File(["hello"], "note.txt", { type: "text/plain" });

    await expect(normalizeTrainingUpload(file)).rejects.toThrow("invalid_type");
  });
});

describe("sanitizeStorageFilename", () => {
  it("lowercases input and strips unsafe characters", () => {
    // Spaces, parentheses, and similar are outside [a-z0-9._-] and get stripped.
    expect(sanitizeStorageFilename("Logo PNG (2).PNG")).toBe("logopng2.png");
  });

  it("preserves characters inside [a-z0-9._-] like underscores and dashes", () => {
    expect(sanitizeStorageFilename("Logo_v2-final.png")).toBe("logo_v2-final.png");
  });

  it("collapses runs of dots and dashes to a single character", () => {
    expect(sanitizeStorageFilename("a...b---c..png")).toBe("a.b-c.png");
  });

  it("trims leading and trailing dots and dashes", () => {
    expect(sanitizeStorageFilename("..-name-.")).toBe("name");
  });

  it("caps result length to 80 characters", () => {
    const long = "a".repeat(200) + ".png";
    const out = sanitizeStorageFilename(long);
    expect(out.length).toBeLessThanOrEqual(80);
  });

  it("returns 'file' when nothing safe remains", () => {
    expect(sanitizeStorageFilename("---...///")).toBe("file");
  });
});