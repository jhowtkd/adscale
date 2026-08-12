import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import type { BrandFontAsset } from "../brand-training/font-assets";
import type { SocialPostCopy } from "./contracts";

const PLAN_VERSION = 1 as const;

type TextRole = "headline" | "body" | "cta";
type Box = { left: number; top: number; width: number; height: number };

export interface TextCompositionProvenance {
  version: typeof PLAN_VERSION;
  execution: "deterministic";
  format: "1:1";
  dimensions: { width: 1080; height: 1080 };
  font: BrandFontAsset;
  copy: SocialPostCopy;
  copyHash: string;
  baseHash: string;
  planHash: string;
  outputHash: string;
  layers: Array<{ role: TextRole; textHash: string; box: Box }>;
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

function squarePlan(copy: SocialPostCopy) {
  // ponytail: #240 freezes one square/top plan; #241 adds format and layout selection.
  const layers: Array<{ role: TextRole; text: string; box: Box }> = [
    { role: "headline", text: copy.headline, box: { left: 104, top: 104, width: 872, height: 140 } },
    { role: "body", text: copy.body, box: { left: 104, top: 274, width: 872, height: 110 } },
    { role: "cta", text: copy.cta, box: { left: 104, top: 424, width: 400, height: 72 } },
  ];
  return {
    version: PLAN_VERSION,
    format: "1:1" as const,
    dimensions: { width: 1080 as const, height: 1080 as const },
    template: "top" as const,
    panel: { left: 64, top: 64, width: 952, height: 496 },
    layers,
  };
}

/** Compose literal copy with the exact approved font file onto a 1:1 base. */
export async function runSquareTextComposition(input: {
  base: Buffer;
  dimensions: { width: 1080; height: 1080 };
  copy: SocialPostCopy;
  font: BrandFontAsset;
  fontBuffer: Buffer;
}): Promise<{ buffer: Buffer; provenance: TextCompositionProvenance }> {
  if (hash(input.fontBuffer) !== input.font.sha256) {
    throw new Error("brand_font_hash_mismatch");
  }

  const plan = squarePlan(input.copy);
  const tempDir = await mkdtemp(join(tmpdir(), "adscale-brand-font-"));
  const extension = input.font.assetKey.toLowerCase().endsWith(".otf") ? "otf" : "ttf";
  const fontPath = join(tempDir, `font.${extension}`);

  try {
    await writeFile(fontPath, input.fontBuffer, { flag: "wx" });
    const panel = {
      input: {
        create: {
          width: plan.panel.width,
          height: plan.panel.height,
          channels: 4 as const,
          background: { r: 12, g: 16, b: 24, alpha: 0.78 },
        },
      },
      left: plan.panel.left,
      top: plan.panel.top,
    };
    const ctaPlate = {
      input: {
        create: {
          width: plan.layers[2]!.box.width,
          height: plan.layers[2]!.box.height,
          channels: 4 as const,
          background: { r: 255, g: 255, b: 255, alpha: 0.18 },
        },
      },
      left: plan.layers[2]!.box.left,
      top: plan.layers[2]!.box.top,
    };
    const textLayers = plan.layers.map((layer) => ({
      input: {
        text: {
          text: `<span foreground="#ffffff">${escapePango(layer.text)}</span>`,
          font: input.font.family,
          fontfile: fontPath,
          width: layer.box.width,
          height: layer.box.height,
          align: "left" as const,
          wrap: "word-char" as const,
          rgba: true,
        },
      },
      left: layer.box.left,
      top: layer.box.top,
    }));
    const buffer = await sharp(input.base)
      .resize(1080, 1080, { fit: "fill" })
      .composite([panel, ctaPlate, ...textLayers])
      .png()
      .toBuffer();
    const planHash = hash(JSON.stringify({ ...plan, font: input.font }));

    return {
      buffer,
      provenance: {
        version: PLAN_VERSION,
        execution: "deterministic",
        format: "1:1",
        dimensions: plan.dimensions,
        font: input.font,
        copy: input.copy,
        copyHash: hash(JSON.stringify(input.copy)),
        baseHash: hash(input.base),
        planHash,
        outputHash: hash(buffer),
        layers: plan.layers.map((layer) => ({
          role: layer.role,
          textHash: hash(layer.text),
          box: layer.box,
        })),
      },
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
