import { describe, it, expect } from "vitest";
import {
  getTargetDimensions,
  formatToOpenAIImageSize,
  dimensionsToGptImage2Size,
  assertValidGptImage2Size,
  parseOpenAIImageSize,
  STUDIO_FORMATS,
} from "./formats";

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

  it("recognizes 3:4 delivery 1080x1440 and proportional preview 270x360", () => {
    expect(getTargetDimensions("3:4")).toEqual({ width: 1080, height: 1440 });
    expect(getTargetDimensions("3:4", true)).toEqual({ width: 270, height: 360 });
  });
});

describe("STUDIO_FORMATS", () => {
  it("lists the Studio formats without legacy/horizontal ad options", () => {
    expect([...STUDIO_FORMATS]).toEqual(["1:1", "4:5", "9:16", "3:4"]);
  });
});

describe("assertValidGptImage2Size", () => {
  it("accepts edges divisible by 16 within ratio bounds", () => {
    expect(assertValidGptImage2Size("1088x1088")).toBe("1088x1088");
    expect(assertValidGptImage2Size("2048x1072")).toBe("2048x1072");
  });

  it("rejects edges not divisible by 16 before production", () => {
    expect(() => assertValidGptImage2Size("1080x1080")).toThrow(/divisible by 16/);
    expect(() => assertValidGptImage2Size("1080x1350")).toThrow(/divisible by 16/);
  });
});

describe("dimensionsToGptImage2Size — priority formats never upscale", () => {
  const cases: Array<{
    label: string;
    target: { width: number; height: number };
    size: string;
  }> = [
    { label: "1:1", target: { width: 1080, height: 1080 }, size: "1088x1088" },
    { label: "4:5", target: { width: 1080, height: 1350 }, size: "1088x1360" },
    { label: "9:16", target: { width: 1080, height: 1920 }, size: "1152x2048" },
    { label: "3:4", target: { width: 1080, height: 1440 }, size: "1152x1536" },
    { label: "1.91:1", target: { width: 1200, height: 628 }, size: "2048x1072" },
    { label: "16:9", target: { width: 1920, height: 1080 }, size: "2048x1152" },
  ];

  for (const { label, target, size } of cases) {
    it(`${label} generates ${size} and downscales to target`, () => {
      const gen = dimensionsToGptImage2Size(target);
      expect(gen).toBe(size);
      const parsed = parseOpenAIImageSize(gen)!;
      expect(parsed.width % 16).toBe(0);
      expect(parsed.height % 16).toBe(0);
      // Generation canvas is at least as large as the delivery target on both axes
      // (or equal aspect with larger area) so the permanent resize is a downscale.
      const genArea = parsed.width * parsed.height;
      const targetArea = target.width * target.height;
      expect(genArea).toBeGreaterThanOrEqual(targetArea);
      const genRatio = parsed.width / parsed.height;
      const targetRatio = target.width / target.height;
      expect(Math.abs(genRatio - targetRatio)).toBeLessThan(0.02);
    });
  }
});

describe("formatToOpenAIImageSize — gpt-image-2 target-aspect sizing", () => {
  it("returns 4:5 target-aspect size for 4:5 with gpt-image-2", () => {
    const size = formatToOpenAIImageSize("4:5", { modelName: "gpt-image-2" });
    expect(size).toBe("1088x1360");
    expect(size).not.toBe("1024x1024");
  });

  it("returns 9:16 target-aspect size for 9:16 with gpt-image-2", () => {
    const size = formatToOpenAIImageSize("9:16", { modelName: "gpt-image-2" });
    expect(size).toBe("1152x2048");
    expect(size).not.toBe("1024x1024");
  });

  it("returns 1:1 square for 1:1 with gpt-image-2", () => {
    expect(formatToOpenAIImageSize("1:1", { modelName: "gpt-image-2" })).toBe("1088x1088");
  });

  it("returns true landscape aspect for 1.91:1 and 16:9", () => {
    expect(formatToOpenAIImageSize("1.91:1", { modelName: "gpt-image-2" })).toBe("2048x1072");
    expect(formatToOpenAIImageSize("16:9", { modelName: "gpt-image-2" })).toBe("2048x1152");
  });

  it("recognises dated gpt-image-2 variants (e.g. gpt-image-2-2026-04-21)", () => {
    expect(formatToOpenAIImageSize("4:5", { modelName: "gpt-image-2-2026-04-21" })).toBe("1088x1360");
    expect(formatToOpenAIImageSize("9:16", { modelName: "gpt-image-2-2026-04-21" })).toBe("1152x2048");
  });

  it("preview mode does NOT collapse 4:5 format_adaptation to square for gpt-image-2", () => {
    const size = formatToOpenAIImageSize("4:5", { isPreview: true, modelName: "gpt-image-2" });
    expect(size).toBe("1088x1360");
    expect(size).not.toBe("1024x1024");
  });

  it("preview mode does NOT collapse 9:16 format_adaptation to square for gpt-image-2", () => {
    const size = formatToOpenAIImageSize("9:16", { isPreview: true, modelName: "gpt-image-2" });
    expect(size).toBe("1152x2048");
    expect(size).not.toBe("1024x1024");
  });

  it("returns 3:4 target-aspect size for 3:4 with gpt-image-2, never 4:5", () => {
    const size = formatToOpenAIImageSize("3:4", { modelName: "gpt-image-2" });
    expect(size).toBe("1152x1536");
    expect(size).not.toBe("1088x1360");
  });

  it("nearest-ratio search never returns 4:5 for 3:4 dimensions", () => {
    expect(dimensionsToGptImage2Size({ width: 1080, height: 1440 })).toBe("1152x1536");
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
    expect(formatToOpenAIImageSize("unknown", { modelName: "gpt-image-2" })).toBe("1088x1088");
  });

  it("falls back to square when no model is provided", () => {
    expect(formatToOpenAIImageSize("4:5")).toBe("1024x1536");
  });

  it("fails explicitly for 3:4 on models without confirmed 3:4 support", () => {
    expect(() => formatToOpenAIImageSize("3:4", { modelName: "gpt-image-1" })).toThrow(
      /3:4.*gpt-image-2/
    );
    expect(() => formatToOpenAIImageSize("3:4", { isPreview: true, modelName: "dall-e-3" })).toThrow(
      /3:4.*gpt-image-2/
    );
    expect(() => formatToOpenAIImageSize("3:4")).toThrow(/3:4.*gpt-image-2/);
  });
});
