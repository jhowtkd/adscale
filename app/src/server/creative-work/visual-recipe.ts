import type { BrandTrainingCategory } from "../brand-training/contracts";
import type { CreativeWorkFormat, SocialPostCopy } from "./contracts";
import { TEXT_LAYOUTS, type TextLayout } from "./typography-plan";

export const VISUAL_RECIPE_VERSION = 1 as const;
export const VISUAL_RECIPE_AUTHORIZED_FIELDS = ["headline", "body", "cta"] as const;
export type VisualRecipeAuthorizedField = (typeof VISUAL_RECIPE_AUTHORIZED_FIELDS)[number];

export type VisualRecipeBox = { left: number; top: number; width: number; height: number };

export type VisualRecipeFixedAsset = {
  referenceId: string;
  assetKey: string;
  category: BrandTrainingCategory;
  box: VisualRecipeBox;
  sourceSha256?: string;
};

export type VisualRecipeDocument = {
  version: typeof VISUAL_RECIPE_VERSION;
  format: CreativeWorkFormat;
  layout: TextLayout;
  dimensions: { width: number; height: number };
  fontAssetKey: string;
  logo: VisualRecipeFixedAsset;
  fixedAssets: VisualRecipeFixedAsset[];
  textBoxes: Array<{ role: VisualRecipeAuthorizedField; box: VisualRecipeBox }>;
  fields: SocialPostCopy;
  originWorkId: string;
  originOutputId: string;
};

export type VisualRecipeOrigin = {
  recipeId: string;
  version: number;
  originWorkId: string;
  originOutputId: string;
};

export type VisualRecipeSnapshot = VisualRecipeOrigin & {
  format: CreativeWorkFormat;
  layout: TextLayout;
  fontAssetKey: string;
  geometryFingerprint: string;
  dimensions: { width: number; height: number };
  logo: VisualRecipeFixedAsset;
  fixedAssets: VisualRecipeFixedAsset[];
  textBoxes: VisualRecipeDocument["textBoxes"];
};

export type ExtractVisualRecipeError =
  | "output_not_selected"
  | "raster_only"
  | "unsupported_layout"
  | "missing_logo_geometry"
  | "missing_font"
  | "brand_required";

type ExactLayer = {
  referenceId?: unknown;
  assetKey?: unknown;
  category?: unknown;
  box?: unknown;
  sourceSha256?: unknown;
};

type TextLayer = {
  role?: unknown;
  box?: unknown;
};

function isBox(value: unknown): value is VisualRecipeBox {
  if (!value || typeof value !== "object") return false;
  const box = value as VisualRecipeBox;
  return [box.left, box.top, box.width, box.height].every((n) => typeof n === "number");
}

function isFormat(value: unknown): value is CreativeWorkFormat {
  return value === "1:1" || value === "4:5" || value === "9:16" || value === "3:4";
}

function isLayout(value: unknown): value is TextLayout {
  return typeof value === "string" && (TEXT_LAYOUTS as readonly string[]).includes(value);
}

function isCopy(value: unknown): value is SocialPostCopy {
  if (!value || typeof value !== "object") return false;
  const copy = value as SocialPostCopy;
  return VISUAL_RECIPE_AUTHORIZED_FIELDS.every(
    (field) => typeof copy[field] === "string" && copy[field].trim().length > 0,
  );
}

function toFixedAsset(layer: ExactLayer): VisualRecipeFixedAsset | null {
  if (typeof layer.referenceId !== "string" || typeof layer.assetKey !== "string") return null;
  if (typeof layer.category !== "string" || !isBox(layer.box)) return null;
  return {
    referenceId: layer.referenceId,
    assetKey: layer.assetKey,
    category: layer.category as BrandTrainingCategory,
    box: layer.box,
    ...(typeof layer.sourceSha256 === "string" ? { sourceSha256: layer.sourceSha256 } : {}),
  };
}

/**
 * A visual recipe is a structured approved piece: deterministic type + exact
 * logo geometry. A raster output without those blocks is not a recipe.
 */
export function extractVisualRecipe(input: {
  workId: string;
  outputId: string;
  clientProfileId: string | null | undefined;
  isSelected: boolean;
  format: unknown;
  quality: unknown;
}): { ok: true; recipe: VisualRecipeDocument } | { ok: false; error: ExtractVisualRecipeError } {
  if (!input.clientProfileId) return { ok: false, error: "brand_required" };
  if (!input.isSelected) return { ok: false, error: "output_not_selected" };
  if (!isFormat(input.format)) return { ok: false, error: "raster_only" };

  const quality = input.quality && typeof input.quality === "object"
    ? input.quality as {
      exactComposition?: { composed?: ExactLayer[]; dimensions?: { width?: unknown; height?: unknown } };
      textComposition?: {
        execution?: unknown;
        appliedLayout?: unknown;
        requestedLayout?: unknown;
        typographyPlan?: { fontAssetKey?: unknown };
        font?: { assetKey?: unknown };
        copy?: unknown;
        dimensions?: { width?: unknown; height?: unknown };
        layers?: TextLayer[];
      };
    }
    : null;

  const text = quality?.textComposition;
  const exact = quality?.exactComposition;
  if (text?.execution !== "deterministic" || !Array.isArray(exact?.composed)) {
    return { ok: false, error: "raster_only" };
  }

  const layout = isLayout(text.appliedLayout) ? text.appliedLayout : isLayout(text.requestedLayout) ? text.requestedLayout : null;
  if (!layout) return { ok: false, error: "unsupported_layout" };

  const fontAssetKey = typeof text.typographyPlan?.fontAssetKey === "string"
    ? text.typographyPlan.fontAssetKey
    : typeof text.font?.assetKey === "string"
      ? text.font.assetKey
      : null;
  if (!fontAssetKey) return { ok: false, error: "missing_font" };
  if (!isCopy(text.copy)) return { ok: false, error: "raster_only" };

  const fixedAssets = exact.composed.map(toFixedAsset).filter((asset): asset is VisualRecipeFixedAsset => asset !== null);
  const logo = fixedAssets.find((asset) => asset.category === "logo");
  if (!logo) return { ok: false, error: "missing_logo_geometry" };

  const dimensions = {
    width: typeof text.dimensions?.width === "number"
      ? text.dimensions.width
      : typeof exact.dimensions?.width === "number" ? exact.dimensions.width : 1080,
    height: typeof text.dimensions?.height === "number"
      ? text.dimensions.height
      : typeof exact.dimensions?.height === "number" ? exact.dimensions.height : 1350,
  };

  const textBoxes = (text.layers ?? [])
    .flatMap((layer): Array<{ role: VisualRecipeAuthorizedField; box: VisualRecipeBox }> => {
      if (
        (layer.role === "headline" || layer.role === "body" || layer.role === "cta")
        && isBox(layer.box)
      ) {
        return [{ role: layer.role, box: layer.box }];
      }
      return [];
    });

  return {
    ok: true,
    recipe: {
      version: VISUAL_RECIPE_VERSION,
      format: input.format,
      layout,
      dimensions,
      fontAssetKey,
      logo,
      fixedAssets,
      textBoxes,
      fields: {
        headline: text.copy.headline.trim(),
        body: text.copy.body.trim(),
        cta: text.copy.cta.trim(),
      },
      originWorkId: input.workId,
      originOutputId: input.outputId,
    },
  };
}

export function applyAuthorizedFields(
  recipe: VisualRecipeDocument,
  fields: Partial<SocialPostCopy>,
): VisualRecipeDocument {
  return {
    ...recipe,
    fields: {
      headline: fields.headline?.trim() || recipe.fields.headline,
      body: fields.body?.trim() || recipe.fields.body,
      cta: fields.cta?.trim() || recipe.fields.cta,
    },
  };
}

export function recipeGeometryFingerprint(recipe: Pick<VisualRecipeDocument, "fontAssetKey" | "logo" | "fixedAssets" | "textBoxes" | "layout" | "dimensions" | "format">) {
  return JSON.stringify({
    format: recipe.format,
    layout: recipe.layout,
    dimensions: recipe.dimensions,
    fontAssetKey: recipe.fontAssetKey,
    logo: recipe.logo,
    fixedAssets: recipe.fixedAssets,
    textBoxes: recipe.textBoxes,
  });
}

export function assertRecipeBrand(input: {
  recipeBrandId: string;
  requestedBrandId: string;
}): { ok: true } | { ok: false; error: "brand_mismatch" } {
  if (input.recipeBrandId !== input.requestedBrandId) {
    return { ok: false, error: "brand_mismatch" };
  }
  return { ok: true };
}

export function visualRecipeOrigin(input: {
  recipeId: string;
  version: number;
  originWorkId: string;
  originOutputId: string;
}): VisualRecipeOrigin {
  return {
    recipeId: input.recipeId,
    version: input.version,
    originWorkId: input.originWorkId,
    originOutputId: input.originOutputId,
  };
}

export function freezeVisualRecipeSnapshot(input: {
  origin: VisualRecipeOrigin;
  recipe: VisualRecipeDocument;
}): VisualRecipeSnapshot {
  return {
    ...input.origin,
    format: input.recipe.format,
    layout: input.recipe.layout,
    fontAssetKey: input.recipe.fontAssetKey,
    geometryFingerprint: recipeGeometryFingerprint(input.recipe),
    dimensions: input.recipe.dimensions,
    logo: input.recipe.logo,
    fixedAssets: input.recipe.fixedAssets,
    textBoxes: input.recipe.textBoxes,
  };
}

export function frozenExactBoxes(
  snapshot: { fixedAssets?: VisualRecipeFixedAsset[] } | null | undefined,
): Record<string, VisualRecipeBox> | undefined {
  if (!snapshot?.fixedAssets?.length) return undefined;
  return Object.fromEntries(snapshot.fixedAssets.map((asset) => [asset.assetKey, asset.box]));
}

export function isVisualRecipeCandidate(input: {
  format: unknown;
  quality: unknown;
  clientProfileId?: string | null;
}): boolean {
  return extractVisualRecipe({
    workId: "candidate",
    outputId: "candidate",
    clientProfileId: input.clientProfileId ?? "candidate",
    isSelected: true,
    format: input.format,
    quality: input.quality,
  }).ok;
}
