import { describe, it, expect } from "vitest";
import { getTargetDimensions, formatToOpenAIImageSize } from "./formats";

describe("getTargetDimensions", () => {
  it("returns full dimensions for 1:1", () => {
    expect(getTargetDimensions("1:1")).toEqual({ width: 1080, height: 1080 });
  });

  it("returns full dimensions for 4:5", () => {
    expect(getTargetDimensions("4:5")).toEqual({ width: 1080, height: 1350 });
  });

  it("returns full dimensions for 9:16", () => {
    expect(getTargetDimensions("9:16")).toEqual({ width: 1080, height: 1920 });
  });

  it("returns quarter-size dimensions in preview mode", () => {
    expect(getTargetDimensions("9:16", true)).toEqual({ width: 270, height: 480 });
  });

  it("returns null for unknown format", () => {
    expect(getTargetDimensions("unknown")).toBeNull();
  });
});

describe("formatToOpenAIImageSize — gpt-image-2 target-aspect sizing", () => {
  it("returns 4:5 target-aspect size for 4:5 with gpt-image-2", () => {
    const size = formatToOpenAIImageSize("4:5", { modelName: "gpt-image-2" });
    expect(size).toBe("1024x1280");
    expect(size).not.toBe("1024x1024");
  });

  it("returns 9:16 target-aspect size for 9:16 with gpt-image-2", () => {
    const size = formatToOpenAIImageSize("9:16", { modelName: "gpt-image-2" });
    expect(size).toBe("1152x2048");
    expect(size).not.toBe("1024x1024");
  });

  it("returns 1:1 square for 1:1 with gpt-image-2", () => {
    expect(formatToOpenAIImageSize("1:1", { modelName: "gpt-image-2" })).toBe("1024x1024");
  });

  it("recognises dated gpt-image-2 variants (e.g. gpt-image-2-2026-04-21)", () => {
    expect(formatToOpenAIImageSize("4:5", { modelName: "gpt-image-2-2026-04-21" })).toBe("1024x1280");
    expect(formatToOpenAIImageSize("9:16", { modelName: "gpt-image-2-2026-04-21" })).toBe("1152x2048");
  });

  it("preview mode does NOT collapse 4:5 format_adaptation to square for gpt-image-2", () => {
    const size = formatToOpenAIImageSize("4:5", { isPreview: true, modelName: "gpt-image-2" });
    expect(size).toBe("1024x1280");
    expect(size).not.toBe("1024x1024");
  });

  it("preview mode does NOT collapse 9:16 format_adaptation to square for gpt-image-2", () => {
    const size = formatToOpenAIImageSize("9:16", { isPreview: true, modelName: "gpt-image-2" });
    expect(size).toBe("1152x2048");
    expect(size).not.toBe("1024x1024");
  });
});

describe("formatToOpenAIImageSize — non-gpt-image-2 fallback", () => {
  it("falls back to square for 4:5 preview when model is not gpt-image-2", () => {
    expect(formatToOpenAIImageSize("4:5", { isPreview: true, modelName: "gpt-image-1" })).toBe("1024x1024");
  });

  it("falls back to square for 9:16 preview when model is not gpt-image-2", () => {
    expect(formatToOpenAIImageSize("9:16", { isPreview: true, modelName: "dall-e-3" })).toBe("1024x1024");
  });

  it("uses portrait sdk size for 4:5 non-preview on non-gpt-image-2 model", () => {
    const size = formatToOpenAIImageSize("4:5", { modelName: "gpt-image-1" });
    expect(size).toBe("1024x1536");
  });

  it("falls back to square for unknown formats even with gpt-image-2", () => {
    expect(formatToOpenAIImageSize("unknown", { modelName: "gpt-image-2" })).toBe("1024x1024");
  });

  it("falls back to square when no model is provided", () => {
    expect(formatToOpenAIImageSize("4:5")).toBe("1024x1536");
  });
});
