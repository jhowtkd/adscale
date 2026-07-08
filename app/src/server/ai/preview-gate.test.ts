import { describe, it, expect } from "vitest";
import {
  getActivePreviewGateDerivation,
  getReadyPreviewDerivation,
  shouldAutoContinuePreview,
  shouldShowPreviewGate,
} from "./preview-gate";

describe("shouldShowPreviewGate", () => {
  it("returns false when no preview derivation exists", () => {
    expect(shouldShowPreviewGate([])).toBe(false);
    expect(
      shouldShowPreviewGate([{ status: "completed", imageUrl: "https://x" }])
    ).toBe(false);
  });

  it("returns false while preview is still generating", () => {
    expect(
      shouldShowPreviewGate([
        { isPreview: true, status: "generating", imageUrl: null },
      ])
    ).toBe(false);
  });

  it("returns false when preview has no output yet", () => {
    expect(
      shouldShowPreviewGate([{ isPreview: true, status: "completed" }])
    ).toBe(false);
  });

  it("returns false when preview is complete with acceptable quality", () => {
    expect(
      shouldShowPreviewGate([
        {
          isPreview: true,
          status: "completed",
          imageUrl: "https://example.com/preview.png",
          qualityVerdict: "acceptable",
        },
      ])
    ).toBe(false);
  });

  it("returns true when preview quality failed", () => {
    expect(
      shouldShowPreviewGate([
        {
          isPreview: true,
          status: "completed",
          imageUrl: "https://example.com/preview.png",
          qualityVerdict: "invalid",
        },
      ])
    ).toBe(true);
    expect(
      shouldShowPreviewGate([
        {
          isPreview: true,
          status: "completed",
          outputKey: "derivations/preview.png",
          hardFailures: [{ code: "cta_missing", message: "CTA missing" }],
        },
      ])
    ).toBe(true);
  });

  it("returns false once a non-preview batch derivation exists", () => {
    expect(
      shouldShowPreviewGate([
        {
          isPreview: true,
          status: "completed",
          imageUrl: "https://example.com/preview.png",
          qualityVerdict: "invalid",
        },
        { status: "generating", imageUrl: null },
      ])
    ).toBe(false);
  });

  it("returns the active preview row only when quality failed", () => {
    const preview = {
      isPreview: true,
      status: "completed",
      imageUrl: "https://example.com/preview.png",
      qualityVerdict: "invalid" as const,
    };

    expect(getActivePreviewGateDerivation([preview])).toEqual(preview);
    expect(
      getActivePreviewGateDerivation([
        {
          ...preview,
          qualityVerdict: "acceptable",
        },
      ])
    ).toBeNull();
    expect(
      getActivePreviewGateDerivation([
        preview,
        { status: "completed", imageUrl: "https://example.com/batch.png" },
      ])
    ).toBeNull();
  });
});

describe("shouldAutoContinuePreview", () => {
  it("returns true when preview is ready and quality is acceptable", () => {
    expect(
      shouldAutoContinuePreview([
        {
          isPreview: true,
          status: "completed",
          imageUrl: "https://example.com/preview.png",
          qualityVerdict: "acceptable",
        },
      ])
    ).toBe(true);
  });

  it("returns false when quality failed", () => {
    expect(
      shouldAutoContinuePreview([
        {
          isPreview: true,
          status: "completed",
          imageUrl: "https://example.com/preview.png",
          qualityVerdict: "invalid",
        },
      ])
    ).toBe(false);
  });

  it("returns false while generating", () => {
    expect(
      shouldAutoContinuePreview([
        {
          isPreview: true,
          status: "generating",
          imageUrl: "https://example.com/preview.png",
        },
      ])
    ).toBe(false);
  });

  it("exposes ready preview independently of gate", () => {
    const preview = {
      isPreview: true,
      status: "completed",
      imageUrl: "https://example.com/preview.png",
      qualityVerdict: "acceptable" as const,
    };
    expect(getReadyPreviewDerivation([preview])).toEqual(preview);
    expect(getActivePreviewGateDerivation([preview])).toBeNull();
  });
});
