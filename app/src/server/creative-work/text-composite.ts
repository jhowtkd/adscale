import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { parseHexColor } from "../brand-training/measure-image";
import type { BrandFontAsset } from "../brand-training/font-assets";
import { canonicalJsonStringify } from "./canonical-json";
import type { CarouselTextRegion } from "./carousel-contracts";
import type { CreativeWorkFormat, SocialPostCopy } from "./contracts";
import { contrastRatio, relativeLuminance } from "./placement-policy";
import type { TextLayout, TypographyPlan } from "./typography-plan";

const PLAN_VERSION = 2 as const;
const ROLE_MINIMUM_DPI = { headline: 96, body: 72, cta: 72 } as const;
const ROLE_TEXT_WEIGHTS = { headline: "bold", body: "regular", cta: "bold" } as const;
const cachedFontPaths = new Map<string, Promise<string>>();

type TextRole = keyof typeof ROLE_MINIMUM_DPI;
type TextWeight = (typeof ROLE_TEXT_WEIGHTS)[TextRole];
export type TextBox = { left: number; top: number; width: number; height: number };

export interface TextCompositionProvenance {
  version: typeof PLAN_VERSION;
  execution: "deterministic";
  format: CreativeWorkFormat;
  dimensions: { width: number; height: number };
  requestedLayout: TextLayout;
  appliedLayout: TextLayout;
  typographyPlan: TypographyPlan & { execution: "deterministic" };
  font: BrandFontAsset;
  copy: SocialPostCopy;
  copyHash: string;
  baseHash: string;
  planHash: string;
  outputHash: string;
  safeArea: TextBox & { right: number; bottom: number; verified: true };
  palette: {
    panel: string;
    text: "#000000" | "#FFFFFF";
    contrast: number;
    source: "brand" | "fallback";
  };
  adjustments: Array<"layout_relocated">;
  layers: Array<{
    role: TextRole;
    textWeight: TextWeight;
    textHash: string;
    box: TextBox;
    renderedDpi: number;
    minimumDpi: number;
  }>;
}

export class TextCompositionError extends Error {
  constructor(readonly code: "brand_font_hash_mismatch" | "brand_text_overflow" | "brand_text_exact_collision" | "brand_text_safe_area") {
    super(code);
    this.name = "TextCompositionError";
  }
}

const hash = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

function escapePango(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function safeArea(format: CreativeWorkFormat, dimensions: { width: number; height: number }) {
  const horizontal = Math.round(dimensions.width * 0.06);
  const vertical = format === "9:16" ? Math.round(dimensions.height * 0.09) : horizontal;
  return {
    left: horizontal,
    top: vertical,
    right: horizontal,
    bottom: vertical,
    width: dimensions.width - horizontal * 2,
    height: dimensions.height - vertical * 2,
    verified: true as const,
  };
}

function panelForLayout(
  layout: TextLayout,
  format: CreativeWorkFormat,
  dimensions: { width: number; height: number },
): TextBox {
  const safe = safeArea(format, dimensions);
  if (layout === "side") {
    const width = Math.round(dimensions.width * 0.4);
    const height = Math.min(Math.round(dimensions.height * 0.56), 1080);
    return {
      left: dimensions.width - safe.right - width,
      top: Math.max(safe.top, Math.round(dimensions.height * 0.16)),
      width,
      height,
    };
  }
  const height = Math.min(Math.round(dimensions.height * 0.46), 560);
  const top = layout === "top"
    ? safe.top
    : layout === "bottom"
      ? dimensions.height - safe.bottom - height
      : Math.round((dimensions.height - height) / 2);
  return { left: safe.left, top, width: safe.width, height };
}

function boxesForPanel(
  panel: TextBox,
  layout: TextLayout,
): Array<{ role: TextRole; box: TextBox }> {
  const inset = Math.max(32, Math.round(panel.width * 0.04));
  const gap = 20;
  const innerWidth = panel.width - inset * 2;
  const headlineHeight = Math.round(panel.height * 0.3);
  const bodyHeight = Math.round(panel.height * 0.27);
  const cta = ctaGeometry(panel, layout, inset, innerWidth);
  return [
    { role: "headline", box: { left: panel.left + inset, top: panel.top + inset, width: innerWidth, height: headlineHeight } },
    { role: "body", box: { left: panel.left + inset, top: panel.top + inset + headlineHeight + gap, width: innerWidth, height: bodyHeight } },
    { role: "cta", box: cta.text },
  ];
}

function ctaGeometry(
  panel: TextBox,
  layout: TextLayout,
  inset = Math.max(32, Math.round(panel.width * 0.04)),
  innerWidth = panel.width - inset * 2,
): { text: TextBox; plate: TextBox | null } {
  const ctaHeight = layout === "side"
    ? Math.max(72, Math.round(panel.height * 0.1))
    : Math.round(panel.height * 0.16);
  const top = panel.top + panel.height - inset - ctaHeight;
  if (layout !== "side") {
    return {
      text: {
        left: panel.left + inset,
        top,
        width: Math.round(innerWidth * 0.48),
        height: ctaHeight,
      },
      plate: null,
    };
  }

  const plateWidth = Math.min(innerWidth, Math.round(panel.width * 0.74));
  const plate = {
    left: panel.left + inset,
    top,
    width: plateWidth,
    height: ctaHeight,
  };
  const textPadding = Math.max(24, Math.round(plateWidth * 0.075));
  return {
    text: {
      left: plate.left + textPadding,
      top: plate.top,
      width: plate.width - textPadding * 2,
      height: plate.height,
    },
    plate,
  };
}

function overlaps(a: TextBox, b: TextBox): boolean {
  return a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top;
}

function isInsideSafeArea(
  box: TextBox,
  safe: ReturnType<typeof safeArea>,
  dimensions: { width: number; height: number },
): boolean {
  return box.left >= safe.left
    && box.top >= safe.top
    && box.left + box.width <= dimensions.width - safe.right
    && box.top + box.height <= dimensions.height - safe.bottom;
}

function chooseLayout(input: {
  requested: TextLayout;
  format: CreativeWorkFormat;
  dimensions: { width: number; height: number };
  occupiedBoxes: readonly TextBox[];
}) {
  const layouts: TextLayout[] = [
    input.requested,
    ...(["top", "center", "bottom", "side"] as const).filter((layout) => layout !== input.requested),
  ];
  for (const layout of layouts) {
    const panel = panelForLayout(layout, input.format, input.dimensions);
    if (!input.occupiedBoxes.some((box) => overlaps(panel, box))) {
      return { layout, panel, relocated: layout !== input.requested };
    }
  }
  throw new TextCompositionError("brand_text_exact_collision");
}

function normalizedHex(rgb: { r: number; g: number; b: number }): string {
  return `#${[rgb.r, rgb.g, rgb.b].map((value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function choosePalette(colors: readonly string[]) {
  const brand = colors.flatMap((color) => {
    const rgb = parseHexColor(color);
    return rgb ? [{ rgb, hex: normalizedHex(rgb) }] : [];
  })[0];
  const chosen = brand ?? { rgb: { r: 12, g: 16, b: 24 }, hex: "#0C1018" };
  const luminance = relativeLuminance(chosen.rgb.r, chosen.rgb.g, chosen.rgb.b);
  const black = contrastRatio(luminance, 0);
  const white = contrastRatio(luminance, 1);
  return black > white
    ? { panel: chosen.hex, text: "#000000" as const, contrast: black, source: brand ? "brand" as const : "fallback" as const }
    : { panel: chosen.hex, text: "#FFFFFF" as const, contrast: white, source: brand ? "brand" as const : "fallback" as const };
}

function cacheFontFile(font: BrandFontAsset, fontBuffer: Buffer): Promise<string> {
  const extension = font.assetKey.toLowerCase().endsWith(".otf") ? "otf" : "ttf";
  const cacheKey = `${font.sha256}.${extension}`;
  const existing = cachedFontPaths.get(cacheKey);
  if (existing) return existing;

  // fontconfig keeps the registered path; removing it can change later rasterization.
  // ponytail: process-lifetime cache; add eviction only if workers render unbounded fonts.
  const pending = mkdtemp(join(tmpdir(), "adscale-brand-font-")).then(async (dir) => {
    const fontPath = join(dir, `font.${extension}`);
    await writeFile(fontPath, fontBuffer, { flag: "wx" });
    return fontPath;
  });
  cachedFontPaths.set(cacheKey, pending);
  void pending.catch(() => cachedFontPaths.delete(cacheKey));
  return pending;
}

async function renderTextLayer(input: {
  text: string;
  box: TextBox;
  fontFamily: string;
  fontPath: string | null;
  color: string;
  wrap: "word" | "word-char" | "none";
  weight: "bold" | "regular";
  minimumDpi: number;
}) {
  const weightAttr = input.weight === "bold" ? ' weight="bold"' : "";
  const markup = `<span foreground="${input.color}"${weightAttr}>${escapePango(input.text)}</span>`;
  const result = await sharp({
    text: {
      text: markup,
      font: input.fontFamily,
      ...(input.fontPath ? { fontfile: input.fontPath } : {}),
      width: input.box.width,
      height: input.box.height,
      align: "left",
      wrap: input.wrap,
      rgba: true,
    },
  }).png().toBuffer({ resolveWithObject: true });
  const renderedDpi = result.info.textAutofitDpi ?? 0;
  if (
    renderedDpi < input.minimumDpi
    || result.info.width > input.box.width
    || result.info.height > input.box.height
  ) {
    throw new TextCompositionError("brand_text_overflow");
  }
  const horizontalPadding = input.box.width - result.info.width;
  const verticalPadding = input.box.height - result.info.height;
  const buffer = await sharp(result.data)
    .extend({
      left: 0,
      right: horizontalPadding,
      top: Math.floor(verticalPadding / 2),
      bottom: Math.ceil(verticalPadding / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  return { buffer, renderedDpi, minimumDpi: input.minimumDpi };
}

async function renderText(input: {
  role: TextRole;
  text: string;
  box: TextBox;
  font: BrandFontAsset;
  fontPath: string;
  color: string;
  layout: TextLayout;
}) {
  const rendered = await renderTextLayer({
    text: input.text,
    box: input.box,
    fontFamily: input.font.family,
    fontPath: input.fontPath,
    color: input.color,
    wrap: input.role === "cta" && input.layout === "side"
      ? "none"
      : input.layout === "side" ? "word" : "word-char",
    weight: ROLE_TEXT_WEIGHTS[input.role],
    minimumDpi: ROLE_MINIMUM_DPI[input.role],
  });
  return { ...rendered, textWeight: ROLE_TEXT_WEIGHTS[input.role] };
}

export async function runTextComposition(input: {
  base: Buffer;
  dimensions: { width: number; height: number };
  copy: SocialPostCopy;
  font: BrandFontAsset;
  fontBuffer: Buffer;
  typographyPlan: TypographyPlan & { execution: "deterministic" };
  brandColors: readonly string[];
  occupiedBoxes: readonly TextBox[];
}): Promise<{ buffer: Buffer; provenance: TextCompositionProvenance }> {
  if (hash(input.fontBuffer) !== input.font.sha256) {
    throw new TextCompositionError("brand_font_hash_mismatch");
  }
  const selected = chooseLayout({
    requested: input.typographyPlan.requestedLayout,
    format: input.typographyPlan.format,
    dimensions: input.dimensions,
    occupiedBoxes: input.occupiedBoxes,
  });
  const layers = boxesForPanel(selected.panel, selected.layout);
  const safe = safeArea(input.typographyPlan.format, input.dimensions);
  if (![selected.panel, ...layers.map((layer) => layer.box)].every(
    (box) => isInsideSafeArea(box, safe, input.dimensions),
  )) {
    throw new TextCompositionError("brand_text_safe_area");
  }
  const palette = choosePalette(input.brandColors);
  const fontPath = await cacheFontFile(input.font, input.fontBuffer);
  const copyByRole: Record<TextRole, string> = input.copy;
  const rendered = await Promise.all(layers.map(async (layer) => ({
    ...layer,
    text: copyByRole[layer.role],
    ...(await renderText({
      ...layer,
      text: copyByRole[layer.role],
      font: input.font,
      fontPath,
      color: palette.text,
      layout: selected.layout,
    })),
  })));
  const panelBuffer = selected.layout === "side"
    ? null
    : await sharp({
        create: {
          width: selected.panel.width,
          height: selected.panel.height,
          channels: 4,
          background: palette.panel,
        },
      }).png().toBuffer();
  const ctaPlateBox = ctaGeometry(selected.panel, selected.layout).plate;
  const ctaPlate = ctaPlateBox
    ? await sharp(Buffer.from(`<svg width="${ctaPlateBox.width}" height="${ctaPlateBox.height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" rx="${Math.round(ctaPlateBox.height / 2)}" fill="#4DBF93"/></svg>`)).png().toBuffer()
    : null;
  const buffer = await sharp(input.base)
    .resize(input.dimensions.width, input.dimensions.height, { fit: "cover" })
    .composite([
      ...(panelBuffer ? [{ input: panelBuffer, left: selected.panel.left, top: selected.panel.top }] : []),
      ...(ctaPlate && ctaPlateBox ? [{ input: ctaPlate, left: ctaPlateBox.left, top: ctaPlateBox.top }] : []),
      ...rendered.map((layer) => ({ input: layer.buffer, left: layer.box.left, top: layer.box.top })),
    ])
    .png()
    .toBuffer();
  const planRecord = {
    typographyPlan: input.typographyPlan,
    appliedLayout: selected.layout,
    panel: selected.panel,
    safeArea: safe,
    palette,
    layers: rendered.map(({ role, box, renderedDpi, minimumDpi, textWeight }) => ({
      role,
      textWeight,
      box,
      renderedDpi,
      minimumDpi,
    })),
    font: input.font,
  };

  return {
    buffer,
    provenance: {
      version: PLAN_VERSION,
      execution: "deterministic",
      format: input.typographyPlan.format,
      dimensions: input.dimensions,
      requestedLayout: input.typographyPlan.requestedLayout,
      appliedLayout: selected.layout,
      typographyPlan: input.typographyPlan,
      font: input.font,
      copy: input.copy,
      copyHash: hash(canonicalJsonStringify(input.copy)),
      baseHash: hash(input.base),
      planHash: hash(canonicalJsonStringify(planRecord)),
      outputHash: hash(buffer),
      safeArea: safe,
      palette,
      adjustments: selected.relocated ? ["layout_relocated"] : [],
      layers: rendered.map((layer) => ({
        role: layer.role,
        textWeight: layer.textWeight,
        textHash: hash(layer.text),
        box: layer.box,
        renderedDpi: layer.renderedDpi,
        minimumDpi: layer.minimumDpi,
      })),
    },
  };
}

/** Backwards-compatible entry point for the #240 square tracer. */
export async function runSquareTextComposition(input: {
  base: Buffer;
  dimensions: { width: 1080; height: 1080 };
  copy: SocialPostCopy;
  font: BrandFontAsset;
  fontBuffer: Buffer;
}): Promise<{ buffer: Buffer; provenance: TextCompositionProvenance }> {
  return runTextComposition({
    ...input,
    typographyPlan: {
      version: 1,
      execution: "deterministic",
      format: "1:1",
      requestedLayout: "top",
      fontAssetKey: input.font.assetKey,
      fontSelection: "only_approved_font",
      overflowPolicy: { strategy: "autofit_then_fail", minimumDpi: ROLE_MINIMUM_DPI },
      collisionPolicy: "relocate_layout_then_fail",
      contrastPolicy: "brand_plate_wcag_aa",
      safeAreaPolicy: "format_default",
    },
    brandColors: [],
    occupiedBoxes: [],
  });
}

// ---------------------------------------------------------------------------
// Carousel slide composition (Task 6): region-based rendering onto the
// text-free provider base, with the approved font or the Pango `sans`
// fallback. Shares escapePango(), contrast, Sharp and font caching with
// runTextComposition() through renderTextLayer(); runTextComposition()'s
// signature and provenance stay untouched.
// ---------------------------------------------------------------------------

export interface CarouselCompositionProvenance {
  version: 1;
  copyHash: string;
  baseHash: string;
  outputHash: string;
  fontAuthority: "approved" | "fallback";
  fontFamily: string;
  layers: Array<{
    role: "primary" | "secondary";
    textHash: string;
    box: TextBox;
    renderedDpi: number;
    minimumDpi: number;
  }>;
}

const CAROUSEL_TEXT_WEIGHTS = { primary: "bold", secondary: "regular" } as const;

function regionToBox(region: CarouselTextRegion): TextBox {
  return { left: region.x, top: region.y, width: region.width, height: region.height };
}

function regionInsideSafeArea(
  region: CarouselTextRegion,
  safeAreaPx: number,
  dimensions: { width: number; height: number },
): boolean {
  return (
    region.x >= safeAreaPx
    && region.y >= safeAreaPx
    && region.x + region.width <= dimensions.width - safeAreaPx
    && region.y + region.height <= dimensions.height - safeAreaPx
  );
}

export async function runCarouselTextComposition(input: {
  base: Buffer;
  dimensions: { width: number; height: number };
  primaryText: string;
  secondaryText: string | null;
  primaryRegion: CarouselTextRegion;
  secondaryRegion: CarouselTextRegion | null;
  safeAreaPx: number;
  font: BrandFontAsset | null;
  fontBuffer: Buffer | null;
  fallbackFamily: "sans" | null;
  brandColors: readonly string[];
}): Promise<{ buffer: Buffer; provenance: CarouselCompositionProvenance }> {
  const fontAuthority = input.font ? "approved" : "fallback";
  let fontFamily: string;
  let fontPath: string | null = null;
  if (input.font) {
    if (!input.fontBuffer || hash(input.fontBuffer) !== input.font.sha256) {
      throw new TextCompositionError("brand_font_hash_mismatch");
    }
    fontPath = await cacheFontFile(input.font, input.fontBuffer);
    fontFamily = input.font.family;
  } else {
    fontFamily = input.fallbackFamily ?? "sans";
  }

  const regions: Array<{ role: "primary" | "secondary"; text: string; region: CarouselTextRegion }> = [
    { role: "primary", text: input.primaryText, region: input.primaryRegion },
  ];
  if (input.secondaryText && input.secondaryRegion) {
    regions.push({ role: "secondary", text: input.secondaryText, region: input.secondaryRegion });
  }
  for (const entry of regions) {
    if (!regionInsideSafeArea(entry.region, input.safeAreaPx, input.dimensions)) {
      throw new TextCompositionError("brand_text_safe_area");
    }
  }

  const palette = choosePalette(input.brandColors);
  const rendered = await Promise.all(
    regions.map(async (entry) => ({
      role: entry.role,
      text: entry.text,
      box: regionToBox(entry.region),
      ...(await renderTextLayer({
        text: entry.text,
        box: regionToBox(entry.region),
        fontFamily,
        fontPath,
        color: palette.text,
        wrap: "word-char",
        weight: CAROUSEL_TEXT_WEIGHTS[entry.role],
        minimumDpi: entry.region.minFontPx,
      })),
    })),
  );

  const buffer = await sharp(input.base)
    .resize(input.dimensions.width, input.dimensions.height, { fit: "cover" })
    .composite(rendered.map((layer) => ({ input: layer.buffer, left: layer.box.left, top: layer.box.top })))
    .png()
    .toBuffer();

  return {
    buffer,
    provenance: {
      version: 1,
      copyHash: hash(
        canonicalJsonStringify({ primaryText: input.primaryText, secondaryText: input.secondaryText }),
      ),
      baseHash: hash(input.base),
      outputHash: hash(buffer),
      fontAuthority,
      fontFamily,
      layers: rendered.map((layer) => ({
        role: layer.role,
        textHash: hash(layer.text),
        box: layer.box,
        renderedDpi: layer.renderedDpi,
        minimumDpi: layer.minimumDpi,
      })),
    },
  };
}
