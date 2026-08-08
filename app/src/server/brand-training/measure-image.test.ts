import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { measureImageBuffer, parseHexColor } from "./measure-image";

const NAVY = { r: 7, g: 21, b: 34 }; // #071522
const YELLOW = { r: 255, g: 201, b: 20 }; // #FFC914
const WHITE = { r: 255, g: 255, b: 255 };

async function syntheticPiece(opts?: {
  width?: number;
  height?: number;
  format?: "png" | "jpeg";
  jpegQuality?: number;
  withAlpha?: boolean;
  fullyOpaqueAlpha?: boolean;
}): Promise<Buffer> {
  const width = opts?.width ?? 200;
  const height = opts?.height ?? 250;
  // Composition: navy 85%, yellow 2.4% strip, white rest (~12.6%)
  const yellowH = Math.max(1, Math.round(height * 0.024));
  const whiteH = Math.max(1, Math.round(height * 0.126));
  const navyH = height - yellowH - whiteH;

  const channels = opts?.withAlpha || opts?.fullyOpaqueAlpha ? 4 : 3;
  const buf = Buffer.alloc(width * height * channels);
  let y = 0;
  const fill = (h: number, color: { r: number; g: number; b: number }, a = 255) => {
    for (let row = 0; row < h; row += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = ((y + row) * width + x) * channels;
        buf[i] = color.r;
        buf[i + 1] = color.g;
        buf[i + 2] = color.b;
        if (channels === 4) buf[i + 3] = a;
      }
    }
    y += h;
  };
  fill(navyH, NAVY, opts?.fullyOpaqueAlpha ? 255 : 255);
  fill(yellowH, YELLOW);
  fill(whiteH, WHITE);

  const pipeline = sharp(buf, {
    raw: { width, height, channels: channels as 3 | 4 },
  });
  if (opts?.format === "jpeg") {
    return pipeline.jpeg({ quality: opts.jpegQuality ?? 80 }).toBuffer();
  }
  return pipeline.png().toBuffer();
}

describe("parseHexColor", () => {
  it("parses 6-digit hex", () => {
    expect(parseHexColor("#071522")).toEqual(NAVY);
    expect(parseHexColor("FFC914")).toEqual(YELLOW);
  });
});

describe("measureImageBuffer", () => {
  it("recovers known coverage within 0.2 pp on JPEG q80 via ΔE Lab", async () => {
    // Exact geometry: 1000×1000 → navy 850 rows, yellow 24, white 126
    const width = 200;
    const height = 1000;
    const channels = 3;
    const raw = Buffer.alloc(width * height * channels);
    const fillRows = (y0: number, h: number, c: { r: number; g: number; b: number }) => {
      for (let y = y0; y < y0 + h; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * channels;
          raw[i] = c.r;
          raw[i + 1] = c.g;
          raw[i + 2] = c.b;
        }
      }
    };
    fillRows(0, 850, NAVY);
    fillRows(850, 24, YELLOW);
    fillRows(874, 126, WHITE);
    const png = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const jpeg = await sharp(png).jpeg({ quality: 80 }).toBuffer();

    const measured = await measureImageBuffer(jpeg, {
      colorTargets: [
        { hex: "#071522", label: "navy" },
        { hex: "#FFC914", label: "yellow" },
        { hex: "#FFFFFF", label: "white" },
      ],
      deltaETolerance: 5,
      now: () => new Date("2026-08-04T00:00:00.000Z"),
    });

    const navy = measured.colorCoverage.find((c) => c.label === "navy")!;
    const yellow = measured.colorCoverage.find((c) => c.label === "yellow")!;
    // Ground truth: 85.0% / 2.4% — research bar ≤ 0.2 pp at q80 with ΔE tol 5
    expect(Math.abs(navy.coveragePercent - 85)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(yellow.coveragePercent - 2.4)).toBeLessThanOrEqual(0.2);
    expect(measured.version).toBe(1);
    expect(measured.measuredAt).toBe("2026-08-04T00:00:00.000Z");
  });

  it("still recovers navy on JPEG q60 where exact hex collapses", async () => {
    const png = await syntheticPiece({ width: 400, height: 500 });
    const jpeg = await sharp(png).jpeg({ quality: 60 }).toBuffer();
    const measured = await measureImageBuffer(jpeg, {
      colorTargets: [{ hex: "#071522", label: "navy" }, { hex: "#FFC914", label: "yellow" }],
      deltaETolerance: 5,
    });
    const navy = measured.colorCoverage.find((c) => c.label === "navy")!;
    expect(navy.coveragePercent).toBeGreaterThan(70);
  });

  it("distinguishes real transparency from opaque alpha channel", async () => {
    const opaqueRgba = await syntheticPiece({ fullyOpaqueAlpha: true, withAlpha: true });
    const transparent = await sharp({
      create: {
        width: 40,
        height: 40,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const opaqueM = await measureImageBuffer(opaqueRgba);
    const clearM = await measureImageBuffer(transparent);

    expect(opaqueM.hasAlphaChannel).toBe(true);
    expect(opaqueM.hasRealTransparency).toBe(false);
    expect(opaqueM.transparentAreaPercent).toBe(0);

    expect(clearM.hasAlphaChannel).toBe(true);
    expect(clearM.hasRealTransparency).toBe(true);
    expect(clearM.transparentAreaPercent).toBeGreaterThan(99);
  });

  it("applies EXIF orientation before aspect conclusions", async () => {
    // 100×50 landscape buffer tagged orientation=6 (90° CW) → displayed as 50×100
    const base = await sharp({
      create: {
        width: 100,
        height: 50,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const measured = await measureImageBuffer(base);
    expect(measured.width).toBe(50);
    expect(measured.height).toBe(100);
    expect(measured.aspectRatio).toBeCloseTo(0.5, 2);
    expect(measured.orientationApplied).toBe(6);
  });

  it("computes content bbox and margins from opaque content", async () => {
    // 100×100 navy with 10px white margin all around (content 80×80)
    const width = 100;
    const height = 100;
    const buf = Buffer.alloc(width * height * 3, 255);
    for (let y = 10; y < 90; y += 1) {
      for (let x = 10; x < 90; x += 1) {
        const i = (y * width + x) * 3;
        buf[i] = NAVY.r;
        buf[i + 1] = NAVY.g;
        buf[i + 2] = NAVY.b;
      }
    }
    const png = await sharp(buf, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const measured = await measureImageBuffer(png, {
      colorTargets: [{ hex: "#071522" }],
    });
    expect(measured.contentBoundingBox).toEqual({
      left: 10,
      top: 10,
      width: 80,
      height: 80,
    });
    expect(measured.margins).toEqual({ left: 10, top: 10, right: 10, bottom: 10 });
  });

  it("assigns brand-gradient yellows to the yellow family (nearest), not a tight radius", async () => {
    // Reproduces the PreceptorIA pyramid failure: real yellows are #E0B010 /
    // #C08000 / #A07000 — none is #FFC914, so radius mode reports ~0%.
    const width = 100;
    const height = 100;
    const gradientYellows = [
      { r: 0xe0, g: 0xb0, b: 0x10 },
      { r: 0xc0, g: 0x80, b: 0x00 },
      { r: 0xd0, g: 0x90, b: 0x00 },
      { r: 0xb0, g: 0x80, b: 0x00 },
      { r: 0xa0, g: 0x70, b: 0x00 },
    ];
    const buf = Buffer.alloc(width * height * 3);
    // 15% of rows = gradient yellow band; rest navy
    const yellowRows = 15;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 3;
        if (y < yellowRows) {
          const c = gradientYellows[y % gradientYellows.length]!;
          buf[i] = c.r;
          buf[i + 1] = c.g;
          buf[i + 2] = c.b;
        } else {
          buf[i] = NAVY.r;
          buf[i + 1] = NAVY.g;
          buf[i + 2] = NAVY.b;
        }
      }
    }
    const png = await sharp(buf, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const targets = [
      { hex: "#071522", label: "navy" },
      { hex: "#FFC914", label: "yellow" },
      { hex: "#FFFFFF", label: "white" },
    ];

    const radius = await measureImageBuffer(png, {
      colorTargets: targets,
      colorAssignment: "within_tolerance",
      deltaETolerance: 5,
    });
    const nearest = await measureImageBuffer(png, {
      colorTargets: targets,
      colorAssignment: "nearest",
    });

    const radiusYellow = radius.colorCoverage.find((c) => c.label === "yellow")!;
    const nearestYellow = nearest.colorCoverage.find((c) => c.label === "yellow")!;
    // Radius mode collapses the gradient (the bug we saw on the pyramid piece).
    expect(radiusYellow.coveragePercent).toBeLessThan(2);
    // Nearest-family recovers the 15% band.
    expect(Math.abs(nearestYellow.coveragePercent - 15)).toBeLessThanOrEqual(0.5);
    expect(nearestYellow.coveragePercent).toBeGreaterThan(radiusYellow.coveragePercent * 5);
  });

  it("reports regional luminance from a single raw pass (not whole-image stats)", async () => {
    // Left half black, right half white
    const width = 60;
    const height = 60;
    const buf = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 3;
        const v = x < width / 2 ? 0 : 255;
        buf[i] = v;
        buf[i + 1] = v;
        buf[i + 2] = v;
      }
    }
    const png = await sharp(buf, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const measured = await measureImageBuffer(png, { regionGrid: 2 });
    expect(measured.regions).toHaveLength(4);
    // Left cells dark, right cells bright
    expect(measured.regions[0]!.meanLuminance).toBeLessThan(0.1);
    expect(measured.regions[1]!.meanLuminance).toBeGreaterThan(0.9);
  });
});
