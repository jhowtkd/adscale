import { describe, it, expect } from "vitest";
import { shouldShowPreviewGate } from "./preview-gate";

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

  it("returns true when preview is complete and no batch derivations exist", () => {
    expect(
      shouldShowPreviewGate([
        {
          isPreview: true,
          status: "completed",
          imageUrl: "https://example.com/preview.png",
        },
      ])
    ).toBe(true);
    expect(
      shouldShowPreviewGate([
        {
          isPreview: true,
          status: "completed",
          outputKey: "derivations/preview.png",
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
        },
        { status: "generating", imageUrl: null },
      ])
    ).toBe(false);
  });
});
