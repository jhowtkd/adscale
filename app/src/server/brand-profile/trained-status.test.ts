import { describe, expect, it } from "vitest";

import {
  isBrandProfileTrained,
  resolveBrandProfileStatus,
  type BrandProfileTrainedInput,
  type BrandProfileReferenceInput,
} from "./trained-status";

function profile(overrides: Partial<BrandProfileTrainedInput> = {}): BrandProfileTrainedInput {
  return {
    logoAssetKey: null,
    brandColors: null,
    brandFonts: null,
    ...overrides,
  };
}

function styleReference(overrides: Partial<BrandProfileReferenceInput> = {}): BrandProfileReferenceInput {
  return { kind: "style", ...overrides };
}

describe("resolveBrandProfileStatus", () => {
  it("is a draft when nothing is provided", () => {
    const status = resolveBrandProfileStatus(profile(), []);
    expect(status).toEqual({ trained: false, missing: ["logo", "visual-signal"] });
  });

  it("still missing visual-signal when only a logo is present", () => {
    const status = resolveBrandProfileStatus(profile({ logoAssetKey: "ws/logo.png" }), []);
    expect(status).toEqual({ trained: false, missing: ["visual-signal"] });
  });

  it("is trained when a logo and a full extracted palette + typography are present", () => {
    const status = resolveBrandProfileStatus(
      profile({
        logoAssetKey: "ws/logo.png",
        brandColors: ["#000000", "#FFFFFF"],
        brandFonts: ["Inter", "Merriweather"],
      }),
      [],
    );
    expect(status).toEqual({ trained: true, missing: [] });
  });

  it("is NOT trained when palette is present but typography is missing (half visual)", () => {
    const status = resolveBrandProfileStatus(
      profile({ logoAssetKey: "ws/logo.png", brandColors: ["#000000"] }),
      [],
    );
    expect(status).toEqual({ trained: false, missing: ["visual-signal"] });
  });

  it("is trained when a logo and a single style reference are present (no extracted palette)", () => {
    const status = resolveBrandProfileStatus(
      profile({ logoAssetKey: "ws/logo.png" }),
      [{ kind: "style" }],
    );
    expect(status).toEqual({ trained: true, missing: [] });
  });

  it("treats non-style references as not satisfying the visual-signal gate", () => {
    const status = resolveBrandProfileStatus(
      profile({ logoAssetKey: "ws/logo.png" }),
      [{ kind: "product" }, { kind: "layout" }, { kind: "negative" }, { kind: "logo" }],
    );
    expect(status).toEqual({ trained: false, missing: ["visual-signal"] });
  });

  it("treats a blank logoAssetKey as no logo", () => {
    const status = resolveBrandProfileStatus(
      profile({ logoAssetKey: "   ", brandColors: ["#000000"], brandFonts: ["Inter"] }),
      [{ kind: "style" }],
    );
    expect(status).toEqual({ trained: false, missing: ["logo"] });
  });

  it("isBrandProfileTrained mirrors the status verdict", () => {
    expect(
      isBrandProfileTrained(
        profile({ logoAssetKey: "ws/logo.png", brandColors: ["#000"], brandFonts: ["Inter"] }),
        [],
      ),
    ).toBe(true);

    expect(isBrandProfileTrained(profile(), [])).toBe(false);
  });

  // --- Task 6: approve-gated readiness (Step 1 regression) ---

  it("ignores unapproved training references", () => {
    const status = resolveBrandProfileStatus(
      { logoAssetKey: "logo.png", brandColors: null, brandFonts: null },
      [
        { kind: "style", reviewStatus: "pending_approval" },
        { kind: "style", reviewStatus: "archived" },
      ],
    );

    expect(status).toEqual({ trained: false, missing: ["visual-signal"] });
  });

  it("accepts an approved trained visual reference", () => {
    const status = resolveBrandProfileStatus(
      { logoAssetKey: "logo.png", brandColors: null, brandFonts: null },
      [{ kind: "style", trainingCategory: "visual_reference", reviewStatus: "approved" }],
    );

    expect(status).toEqual({ trained: true, missing: [] });
  });

  it("accepts an approved trained logo without legacy logoAssetKey", () => {
    const status = resolveBrandProfileStatus(
      { logoAssetKey: null, brandColors: ["#000"], brandFonts: ["Inter"] },
      [{ kind: "other", trainingCategory: "logo", reviewStatus: "approved" }],
    );

    expect(status).toEqual({ trained: true, missing: [] });
  });

  it("accepts a legacy style reference (no training metadata) as a visual signal", () => {
    // A reference without trainingCategory / reviewStatus is "legacy" and must
    // continue to satisfy the visual-signal gate — backward-compatibility.
    const status = resolveBrandProfileStatus(
      { logoAssetKey: "logo.png", brandColors: null, brandFonts: null },
      [{ kind: "style" }],
    );

    expect(status).toEqual({ trained: true, missing: [] });
  });

  it("treats approved graphic and character references as visual signals", () => {
    expect(
      resolveBrandProfileStatus(
        { logoAssetKey: "logo.png", brandColors: null, brandFonts: null },
        [{ kind: "other", trainingCategory: "graphic", reviewStatus: "approved" }],
      ),
    ).toEqual({ trained: true, missing: [] });

    expect(
      resolveBrandProfileStatus(
        { logoAssetKey: "logo.png", brandColors: null, brandFonts: null },
        [{ kind: "other", trainingCategory: "character", reviewStatus: "approved" }],
      ),
    ).toEqual({ trained: true, missing: [] });
  });

  it("never satisfies readiness with pending_analysis / pending_approval trained rows", () => {
    const pendingAnalysis = resolveBrandProfileStatus(
      { logoAssetKey: "logo.png", brandColors: null, brandFonts: null },
      [{ kind: "style", trainingCategory: "visual_reference", reviewStatus: "pending_analysis" }],
    );
    expect(pendingAnalysis).toEqual({ trained: false, missing: ["visual-signal"] });

    const pendingApproval = resolveBrandProfileStatus(
      { logoAssetKey: null, brandColors: null, brandFonts: null },
      [{ kind: "other", trainingCategory: "logo", reviewStatus: "pending_approval" }],
    );
    expect(pendingApproval).toEqual({ trained: false, missing: ["logo", "visual-signal"] });
  });

  it("never satisfies readiness with archived trained rows", () => {
    const archivedStyle = resolveBrandProfileStatus(
      { logoAssetKey: "logo.png", brandColors: null, brandFonts: null },
      [{ kind: "style", trainingCategory: "visual_reference", reviewStatus: "archived" }],
    );
    expect(archivedStyle).toEqual({ trained: false, missing: ["visual-signal"] });

    const archivedLogo = resolveBrandProfileStatus(
      { logoAssetKey: null, brandColors: null, brandFonts: null },
      [{ kind: "other", trainingCategory: "logo", reviewStatus: "archived" }],
    );
    expect(archivedLogo).toEqual({ trained: false, missing: ["logo", "visual-signal"] });
  });

  it("an approved logo reference satisfies logo even without extracted palette/typography", () => {
    const status = resolveBrandProfileStatus(
      { logoAssetKey: null, brandColors: null, brandFonts: null },
      [{ kind: "other", trainingCategory: "logo", reviewStatus: "approved" }],
    );

    expect(status).toEqual({ trained: false, missing: ["visual-signal"] });
  });

  // Helpers referenced above — silence unused-binding lint when the test
  // bodies are the only consumers.
  it("styleReference helper builds a valid legacy reference", () => {
    expect(styleReference()).toEqual({ kind: "style" });
  });
});
