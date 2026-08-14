import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { parseHexColor } from "../brand-training/measure-image";
import type { BrandFontAsset } from "../brand-training/font-assets";
import { canonicalJsonStringify } from "./canonical-json";
import type { CreativeWorkFormat, SocialPostCopy } from "./contracts";
import { contrastRatio, relativeLuminance } from "./placement-policy";
import type { TextLayout, TypographyPlan } from "./typography-plan";

const PLAN_VERSION = 2 as const;
const ROLE_MINIMUM_DPI = { headline: 96, body: 72, cta: 72 } as const;
const cachedFontPaths = new Map<string, Promise<string>>();

type TextRole = keyof typeof ROLE_MINIMUM_DPI;
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
  const ctaHeight = Math.round(panel.height * 0.16);
  return [
    { role: "headline", box: { left: panel.left + inset, top: panel.top + inset, width: innerWidth, height: headlineHeight } },
    { role: "body", box: { left: panel.left + inset, top: panel.top + inset + headlineHeight + gap, width: innerWidth, height: bodyHeight } },
    { role: "cta", box: { left: panel.left + inset, top: panel.top + panel.height - inset - ctaHeight, width: Math.round(innerWidth * (layout === "side" ? 0.86 : 0.48)), height: ctaHeight } },
  ];
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

async function renderText(input: {
  role: TextRole;
  text: string;
  box: TextBox;
  font: BrandFontAsset;
  fontPath: string;
  color: string;
  layout: TextLayout;
}) {
  const result = await sharp({
    text: {
      text: `<span foreground="${input.color}">${escapePango(input.text)}</span>`,
      font: input.font.family,
      fontfile: input.fontPath,
      width: input.box.width,
      height: input.box.height,
      align: "left",
      wrap: input.layout === "side" ? "word" : "word-char",
      rgba: true,
    },
  }).png().toBuffer({ resolveWithObject: true });
  const renderedDpi = result.info.textAutofitDpi ?? 0;
  const minimumDpi = ROLE_MINIMUM_DPI[input.role];
  if (renderedDpi < minimumDpi) {
    throw new TextCompositionError("brand_text_overflow");
  }
  return { buffer: result.data, renderedDpi, minimumDpi };
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
  const ctaPlate = selected.layout === "side"
    ? await sharp(Buffer.from(`<svg width="${layers[2]!.box.width}" height="${layers[2]!.box.height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" rx="${Math.round(layers[2]!.box.height / 2)}" fill="#4DBF93"/></svg>`)).png().toBuffer()
    : null;
  const buffer = await sharp(input.base)
    .resize(input.dimensions.width, input.dimensions.height, { fit: "cover" })
    .composite([
      ...(panelBuffer ? [{ input: panelBuffer, left: selected.panel.left, top: selected.panel.top }] : []),
      ...(ctaPlate ? [{ input: ctaPlate, left: layers[2]!.box.left, top: layers[2]!.box.top }] : []),
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
    layers: rendered.map(({ role, box, renderedDpi, minimumDpi }) => ({ role, box, renderedDpi, minimumDpi })),
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
