import { describe, expect, it } from "vitest";

import {
  isBrandProfileTrained,
  resolveBrandProfileStatus,
  type BrandProfileTrainedInput,
} from "./trained-status";

function profile(overrides: Partial<BrandProfileTrainedInput> = {}): BrandProfileTrainedInput {
  return {
    logoAssetKey: null,
    brandColors: null,
    brandFonts: null,
    ...overrides,
  };
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
});
