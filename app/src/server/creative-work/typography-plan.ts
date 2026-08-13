import type { BrandFontAsset } from "../brand-training/font-assets";
import type { CreativeWorkFormat } from "./contracts";

export const TEXT_LAYOUTS = ["top", "center", "bottom"] as const;
export type TextLayout = (typeof TEXT_LAYOUTS)[number];

interface TypographyPolicy {
  version: 1;
  format: CreativeWorkFormat;
  requestedLayout: TextLayout;
  overflowPolicy: {
    strategy: "autofit_then_fail";
    minimumDpi: { headline: 96; body: 72; cta: 72 };
  };
  collisionPolicy: "relocate_layout_then_fail";
  contrastPolicy: "brand_plate_wcag_aa";
  safeAreaPolicy: "format_default";
}

export type TypographyPlan = TypographyPolicy & (
  | {
      execution: "deterministic";
      fontAssetKey: string;
      fontSelection: "operator_selected" | "only_approved_font";
    }
  | {
      execution: "generative";
      fontAssetKey: null;
      reason: "approved_font_missing" | "approved_font_selection_required";
    }
);

export class TypographyPlanError extends Error {
  readonly code = "brand_font_selection_invalid";

  constructor() {
    super("brand_font_selection_invalid");
    this.name = "TypographyPlanError";
  }
}

export function buildTypographyPlan(input: {
  format: CreativeWorkFormat;
  requestedLayout?: TextLayout;
  selectedFontAssetKey?: string;
  fonts: readonly BrandFontAsset[];
}): TypographyPlan {
  const policy: TypographyPolicy = {
    version: 1,
    format: input.format,
    requestedLayout: input.requestedLayout ?? "top",
    overflowPolicy: {
      strategy: "autofit_then_fail",
      minimumDpi: { headline: 96, body: 72, cta: 72 },
    },
    collisionPolicy: "relocate_layout_then_fail",
    contrastPolicy: "brand_plate_wcag_aa",
    safeAreaPolicy: "format_default",
  };

  if (input.selectedFontAssetKey) {
    if (!input.fonts.some((font) => font.assetKey === input.selectedFontAssetKey)) {
      throw new TypographyPlanError();
    }
    return {
      ...policy,
      execution: "deterministic",
      fontAssetKey: input.selectedFontAssetKey,
      fontSelection: "operator_selected",
    };
  }
  if (input.fonts.length === 1) {
    return {
      ...policy,
      execution: "deterministic",
      fontAssetKey: input.fonts[0]!.assetKey,
      fontSelection: "only_approved_font",
    };
  }
  return {
    ...policy,
    execution: "generative",
    fontAssetKey: null,
    reason: input.fonts.length === 0
      ? "approved_font_missing"
      : "approved_font_selection_required",
  };
}
