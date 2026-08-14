import { describe, expect, it } from "vitest";
import type { BrandFontAsset } from "../brand-training/font-assets";
import { buildTypographyPlan } from "./typography-plan";

const font = (assetKey: string, family: string): BrandFontAsset => ({
  assetKey,
  family,
  source: "Licença do projeto",
  weight: 400,
  style: "normal",
  sha256: "a".repeat(64),
  approvedAt: "2026-08-12T12:00:00.000Z",
  approvedByUserId: "user-1",
});

describe("buildTypographyPlan", () => {
  it("freezes the operator-selected font instead of depending on upload order", () => {
    const plan = buildTypographyPlan({
      format: "4:5",
      requestedLayout: "bottom",
      selectedFontAssetKey: "fonts/body.ttf",
      fonts: [font("fonts/headline.ttf", "Headline"), font("fonts/body.ttf", "Body")],
    });

    expect(plan).toMatchObject({
      version: 1,
      execution: "deterministic",
      format: "4:5",
      requestedLayout: "bottom",
      fontAssetKey: "fonts/body.ttf",
      fontSelection: "operator_selected",
      overflowPolicy: { strategy: "autofit_then_fail" },
      collisionPolicy: "relocate_layout_then_fail",
    });
  });

  it("requires an explicit choice when multiple fonts are approved", () => {
    expect(buildTypographyPlan({
      format: "1:1",
      fonts: [font("fonts/first.ttf", "First"), font("fonts/second.ttf", "Second")],
    })).toMatchObject({
      execution: "generative",
      fontAssetKey: null,
      reason: "approved_font_selection_required",
    });
  });

  it("does not select an approved asset outside the declared brand families", () => {
    expect(buildTypographyPlan({
      format: "9:16",
      fonts: [font("fonts/albert-sans.ttf", "Albert Sans")],
      declaredFontFamilies: ["Montserrat", "Open Sans"],
    })).toMatchObject({
      execution: "generative",
      fontAssetKey: null,
      reason: "approved_font_missing",
    });
  });

  it("rejects an operator selection outside the declared brand families", () => {
    expect(() => buildTypographyPlan({
      format: "1:1",
      selectedFontAssetKey: "fonts/albert-sans.ttf",
      fonts: [font("fonts/albert-sans.ttf", "Albert Sans")],
      declaredFontFamilies: ["Montserrat", "Open Sans"],
    })).toThrow("brand_font_selection_invalid");
  });
});
