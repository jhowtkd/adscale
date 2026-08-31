import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { runCarouselTextComposition, runSquareTextComposition, runTextComposition } from "./text-composite";
import { canonicalJsonStringify } from "./canonical-json";
import { buildTypographyPlan } from "./typography-plan";

describe("runSquareTextComposition", () => {
  it("renders approved copy reproducibly and records the literal inputs", async () => {
    const base = await sharp({
      create: {
        width: 1080,
        height: 1080,
        channels: 3,
        background: { r: 238, g: 220, b: 190 },
      },
    }).png().toBuffer();
    const font = await readFile(join(
      process.cwd(),
      "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf",
    ));
    const originalFont = Buffer.from(font);
    const input = {
      base,
      dimensions: { width: 1080, height: 1080 } as const,
      copy: {
        headline: "Oferta <literal>",
        body: "Condição & benefício sem invenção.",
        cta: "Saiba mais",
      },
      font: {
        assetKey: "workspaces/ws-1/brand-fonts/geist.ttf",
        family: "Geist",
        source: "Licença do projeto",
        weight: 400 as const,
        style: "normal" as const,
        sha256: createHash("sha256").update(font).digest("hex"),
        approvedAt: "2026-08-12T12:00:00.000Z",
        approvedByUserId: "user-1",
      },
      fontBuffer: font,
    };

    const first = await runSquareTextComposition(input);
    const second = await runSquareTextComposition(input);

    expect(first.buffer.equals(second.buffer)).toBe(true);
    expect(first.provenance).toMatchObject({
      version: 2,
      execution: "deterministic",
      format: "1:1",
      font: {
        assetKey: input.font.assetKey,
        sha256: input.font.sha256,
      },
      copy: input.copy,
      layers: [
        { role: "headline", textWeight: "bold", box: expect.objectContaining({ width: expect.any(Number) }) },
        { role: "body", textWeight: "regular", box: expect.objectContaining({ width: expect.any(Number) }) },
        { role: "cta", textWeight: "bold", box: expect.objectContaining({ width: expect.any(Number) }) },
      ],
      planHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      outputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(first.provenance.outputHash).toBe(second.provenance.outputHash);
    expect(font.equals(originalFont)).toBe(true);
    expect(await sharp(first.buffer).metadata()).toMatchObject({
      width: 1080,
      height: 1080,
      format: "png",
    });
    await expect(runSquareTextComposition({
      ...input,
      font: { ...input.font, sha256: "0".repeat(64) },
    })).rejects.toMatchObject({ code: "brand_font_hash_mismatch" });
  });

  it("renders a bottom layout inside the verified 4:5 safe area", async () => {
    const base = await sharp({
      create: {
        width: 1024,
        height: 1536,
        channels: 3,
        background: { r: 238, g: 220, b: 190 },
      },
    }).png().toBuffer();
    const fontBuffer = await readFile(join(
      process.cwd(),
      "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf",
    ));
    const font = {
      assetKey: "workspaces/ws-1/brand-fonts/geist.ttf",
      family: "Geist",
      source: "Licença do projeto",
      weight: 400 as const,
      style: "normal" as const,
      sha256: createHash("sha256").update(fontBuffer).digest("hex"),
      approvedAt: "2026-08-12T12:00:00.000Z",
      approvedByUserId: "user-1",
    };
    const typographyPlan = buildTypographyPlan({
      format: "4:5",
      requestedLayout: "bottom",
      selectedFontAssetKey: font.assetKey,
      fonts: [font],
    });
    if (typographyPlan.execution !== "deterministic") throw new Error("test plan must be deterministic");

    const result = await runTextComposition({
      base,
      dimensions: { width: 1080, height: 1350 },
      copy: { headline: "Oferta literal", body: "Condição aprovada.", cta: "Saiba mais" },
      font,
      fontBuffer,
      typographyPlan,
      brandColors: ["#071522", "#FFC914"],
      occupiedBoxes: [],
    });

    expect(await sharp(result.buffer).metadata()).toMatchObject({ width: 1080, height: 1350 });
    expect(result.provenance).toMatchObject({
      version: 2,
      format: "4:5",
      requestedLayout: "bottom",
      appliedLayout: "bottom",
      adjustments: [],
      safeArea: { verified: true },
      palette: { panel: "#071522", source: "brand" },
    });
    expect(result.provenance.palette.contrast).toBeGreaterThanOrEqual(4.5);
    for (const layer of result.provenance.layers) {
      expect(layer.box.left).toBeGreaterThanOrEqual(result.provenance.safeArea.left);
      expect(layer.box.top).toBeGreaterThanOrEqual(result.provenance.safeArea.top);
      expect(layer.box.left + layer.box.width).toBeLessThanOrEqual(1080 - result.provenance.safeArea.right);
      expect(layer.box.top + layer.box.height).toBeLessThanOrEqual(1350 - result.provenance.safeArea.bottom);
    }
  });

  it("keeps a side CTA on one line inside a padded pill", async () => {
    const dimensions = { width: 1080, height: 1920 };
    const base = await sharp({
      create: { width: dimensions.width, height: dimensions.height, channels: 3, background: "#071522" },
    }).png().toBuffer();
    const fontBuffer = await readFile(join(
      process.cwd(),
      "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf",
    ));
    const font = {
      assetKey: "fonts/geist.ttf",
      family: "Geist",
      source: "Licença do projeto",
      weight: 400 as const,
      style: "normal" as const,
      sha256: createHash("sha256").update(fontBuffer).digest("hex"),
      approvedAt: "2026-08-12T12:00:00.000Z",
      approvedByUserId: "user-1",
    };
    const typographyPlan = buildTypographyPlan({
      format: "9:16",
      requestedLayout: "side",
      selectedFontAssetKey: font.assetKey,
      fonts: [font],
    });
    if (typographyPlan.execution !== "deterministic") throw new Error("test plan must be deterministic");

    const result = await runTextComposition({
      base,
      dimensions,
      copy: {
        headline: "Presença que acolhe",
        body: "Educação médica em uma linguagem humana, clara e próxima.",
        cta: "Conheça a Cenbrap",
      },
      font,
      fontBuffer,
      typographyPlan,
      brandColors: ["#071522"],
      occupiedBoxes: [],
    });

    const ctaLayer = result.provenance.layers.find((layer) => layer.role === "cta");
    expect(ctaLayer?.box).toEqual({ left: 639, top: 1242, width: 272, height: 108 });

    const { data, info } = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true });
    const whiteRows = new Set<number>();
    for (let y = 1242; y < 1350; y += 1) {
      for (let x = 639; x < 911; x += 1) {
        const offset = (y * info.width + x) * info.channels;
        if ((data[offset] ?? 0) > 200 && (data[offset + 1] ?? 0) > 200 && (data[offset + 2] ?? 0) > 200) {
          whiteRows.add(y);
        }
      }
    }
    expect(whiteRows.size).toBeGreaterThan(0);
    expect(Math.max(...whiteRows) - Math.min(...whiteRows) + 1).toBeLessThan(70);
  });

  it("relocates text away from an exact asset and fails when every layout collides", async () => {
    const dimensions = { width: 1080, height: 1920 };
    const base = await sharp({
      create: { width: 1080, height: 1920, channels: 3, background: "#dddddd" },
    }).png().toBuffer();
    const fontBuffer = await readFile(join(
      process.cwd(),
      "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf",
    ));
    const font = {
      assetKey: "fonts/geist.ttf",
      family: "Geist",
      source: "Licença do projeto",
      weight: 400 as const,
      style: "normal" as const,
      sha256: createHash("sha256").update(fontBuffer).digest("hex"),
      approvedAt: "2026-08-12T12:00:00.000Z",
      approvedByUserId: "user-1",
    };
    const typographyPlan = buildTypographyPlan({ format: "9:16", requestedLayout: "top", fonts: [font] });
    if (typographyPlan.execution !== "deterministic") throw new Error("test plan must be deterministic");
    const common = {
      base,
      dimensions,
      copy: { headline: "Headline", body: "Body", cta: "CTA" },
      font,
      fontBuffer,
      typographyPlan,
      brandColors: ["#071522"],
    };

    const relocated = await runTextComposition({
      ...common,
      occupiedBoxes: [{ left: 0, top: 0, width: 1080, height: 650 }],
    });
    expect(relocated.provenance).toMatchObject({
      requestedLayout: "top",
      appliedLayout: "center",
      adjustments: ["layout_relocated"],
    });

    await expect(runTextComposition({
      ...common,
      occupiedBoxes: [{ left: 0, top: 0, width: 1080, height: 1920 }],
    })).rejects.toMatchObject({ code: "brand_text_exact_collision" });
  });

  it("fails instead of silently shrinking required copy below the minimum", async () => {
    const base = await sharp({
      create: { width: 1080, height: 1080, channels: 3, background: "#dddddd" },
    }).png().toBuffer();
    const fontBuffer = await readFile(join(
      process.cwd(),
      "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf",
    ));
    const font = {
      assetKey: "fonts/geist.ttf",
      family: "Geist",
      source: "Licença do projeto",
      weight: 400 as const,
      style: "normal" as const,
      sha256: createHash("sha256").update(fontBuffer).digest("hex"),
      approvedAt: "2026-08-12T12:00:00.000Z",
      approvedByUserId: "user-1",
    };
    const typographyPlan = buildTypographyPlan({ format: "1:1", fonts: [font] });
    if (typographyPlan.execution !== "deterministic") throw new Error("test plan must be deterministic");

    await expect(runTextComposition({
      base,
      dimensions: { width: 1080, height: 1080 },
      copy: { headline: "Headline", body: "Body", cta: "Copy obrigatória ".repeat(100) },
      font,
      fontBuffer,
      typographyPlan,
      brandColors: [],
      occupiedBoxes: [],
    })).rejects.toMatchObject({ code: "brand_text_overflow" });
  });
});

// ---------------------------------------------------------------------------
// Carousel slide composition (Task 6): region-based, approved-or-fallback font.
// ---------------------------------------------------------------------------

const CAROUSEL_DIMENSIONS = { width: 1024, height: 1280 };
const CAROUSEL_PRIMARY_REGION = {
  x: 80, y: 96, width: 864, height: 420, minFontPx: 42, maxFontPx: 82, align: "left" as const,
};
const CAROUSEL_SECONDARY_REGION = {
  x: 80, y: 920, width: 720, height: 180, minFontPx: 24, maxFontPx: 38, align: "left" as const,
};

function carouselBase(): Promise<Buffer> {
  return sharp({
    create: {
      width: CAROUSEL_DIMENSIONS.width,
      height: CAROUSEL_DIMENSIONS.height,
      channels: 3,
      background: { r: 238, g: 220, b: 190 },
    },
  }).png().toBuffer();
}

describe("runCarouselTextComposition", () => {
  it("renders both regions with the sans fallback and records fallback provenance", async () => {
    const base = await carouselBase();
    const input = {
      base,
      dimensions: CAROUSEL_DIMENSIONS,
      primaryText: "Gancho exato",
      secondaryText: "Apoio exato",
      primaryRegion: CAROUSEL_PRIMARY_REGION,
      secondaryRegion: CAROUSEL_SECONDARY_REGION,
      safeAreaPx: 64,
      font: null,
      fontBuffer: null,
      fallbackFamily: "sans" as const,
      brandColors: ["#071522"],
    };

    const result = await runCarouselTextComposition(input);

    expect(await sharp(result.buffer).metadata()).toMatchObject({
      width: 1024,
      height: 1280,
      format: "png",
    });
    expect(result.provenance).toMatchObject({
      version: 1,
      fontAuthority: "fallback",
      fontFamily: "sans",
      copyHash: createHash("sha256").update(canonicalJsonStringify({
        primaryText: "Gancho exato",
        secondaryText: "Apoio exato",
      })).digest("hex"),
      baseHash: createHash("sha256").update(base).digest("hex"),
      outputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(result.provenance.layers).toHaveLength(2);
    expect(result.provenance.layers[0]).toMatchObject({
      role: "primary",
      textHash: createHash("sha256").update("Gancho exato").digest("hex"),
      box: { left: 80, top: 96, width: 864, height: 420 },
      renderedDpi: expect.any(Number),
      minimumDpi: 42,
    });
    expect(result.provenance.layers[1]).toMatchObject({
      role: "secondary",
      minimumDpi: 24,
    });
    // Reproducible: same input, same output hash.
    const second = await runCarouselTextComposition(input);
    expect(result.provenance.outputHash).toBe(second.provenance.outputHash);
  });

  it("renders a single layer when there is no secondary text", async () => {
    const result = await runCarouselTextComposition({
      base: await carouselBase(),
      dimensions: CAROUSEL_DIMENSIONS,
      primaryText: "Только заголовок",
      secondaryText: null,
      primaryRegion: CAROUSEL_PRIMARY_REGION,
      secondaryRegion: CAROUSEL_SECONDARY_REGION,
      safeAreaPx: 64,
      font: null,
      fontBuffer: null,
      fallbackFamily: "sans",
      brandColors: [],
    });

    expect(result.provenance.layers).toHaveLength(1);
    expect(result.provenance.layers[0]?.role).toBe("primary");
  });

  it("enforces the approved font hash", async () => {
    const fontBuffer = await readFile(join(
      process.cwd(),
      "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf",
    ));
    const font = {
      assetKey: "fonts/geist.ttf",
      family: "Geist",
      source: "Licença do projeto",
      weight: 400 as const,
      style: "normal" as const,
      sha256: createHash("sha256").update(fontBuffer).digest("hex"),
      approvedAt: "2026-08-12T12:00:00.000Z",
      approvedByUserId: "user-1",
    };

    await expect(runCarouselTextComposition({
      base: await carouselBase(),
      dimensions: CAROUSEL_DIMENSIONS,
      primaryText: "Gancho",
      secondaryText: null,
      primaryRegion: CAROUSEL_PRIMARY_REGION,
      secondaryRegion: null,
      safeAreaPx: 64,
      font: { ...font, sha256: "0".repeat(64) },
      fontBuffer,
      fallbackFamily: null,
      brandColors: [],
    })).rejects.toMatchObject({ code: "brand_font_hash_mismatch" });

    // Correct hash composes with authority "approved" and the font family.
    const ok = await runCarouselTextComposition({
      base: await carouselBase(),
      dimensions: CAROUSEL_DIMENSIONS,
      primaryText: "Gancho",
      secondaryText: null,
      primaryRegion: CAROUSEL_PRIMARY_REGION,
      secondaryRegion: null,
      safeAreaPx: 64,
      font,
      fontBuffer,
      fallbackFamily: null,
      brandColors: [],
    });
    expect(ok.provenance).toMatchObject({ fontAuthority: "approved", fontFamily: "Geist" });
  });

  it("rejects regions outside the safe area", async () => {
    await expect(runCarouselTextComposition({
      base: await carouselBase(),
      dimensions: CAROUSEL_DIMENSIONS,
      primaryText: "Gancho",
      secondaryText: null,
      // x=10 is inside the 64px safe area margin — must be rejected.
      primaryRegion: { ...CAROUSEL_PRIMARY_REGION, x: 10 },
      secondaryRegion: null,
      safeAreaPx: 64,
      font: null,
      fontBuffer: null,
      fallbackFamily: "sans",
      brandColors: [],
    })).rejects.toMatchObject({ code: "brand_text_safe_area" });
  });

  it("fails with brand_text_overflow when copy cannot fit its region minimum", async () => {
    await expect(runCarouselTextComposition({
      base: await carouselBase(),
      dimensions: CAROUSEL_DIMENSIONS,
      primaryText: "Копия обязательная ".repeat(2000),
      secondaryText: null,
      primaryRegion: CAROUSEL_PRIMARY_REGION,
      secondaryRegion: null,
      safeAreaPx: 64,
      font: null,
      fontBuffer: null,
      fallbackFamily: "sans",
      brandColors: [],
    })).rejects.toMatchObject({ code: "brand_text_overflow" });
  });

  it("keeps rendered layers inside their declared region bounds", async () => {
    const result = await runCarouselTextComposition({
      base: await carouselBase(),
      dimensions: CAROUSEL_DIMENSIONS,
      primaryText: "Gancho do carrossel",
      secondaryText: "Linha de apoio",
      primaryRegion: CAROUSEL_PRIMARY_REGION,
      secondaryRegion: CAROUSEL_SECONDARY_REGION,
      safeAreaPx: 64,
      font: null,
      fontBuffer: null,
      fallbackFamily: "sans",
      brandColors: ["#071522"],
    });

    for (const [layer, region] of [
      [result.provenance.layers[0], CAROUSEL_PRIMARY_REGION],
      [result.provenance.layers[1], CAROUSEL_SECONDARY_REGION],
    ] as const) {
      expect(layer).toBeDefined();
      expect(layer!.box.left).toBeGreaterThanOrEqual(region.x);
      expect(layer!.box.top).toBeGreaterThanOrEqual(region.y);
      expect(layer!.box.left + layer!.box.width).toBeLessThanOrEqual(region.x + region.width);
      expect(layer!.box.top + layer!.box.height).toBeLessThanOrEqual(region.y + region.height);
    }
  });
});
