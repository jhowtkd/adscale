// The plate a logo asks for, judged from its pixels (ticket 16). Every image here is synthetic: built pixel by pixel or drawn from a tiny inline SVG.
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { LOGO_SURFACE_RULE, LogoSurfaceSkipped, measureLogoSurface, readLogoSurface } from "./logo-surface";
import { BLACK, WHITE, NONE, block, fromRgba, meanInkLuminance, ownerLikeLogo, png, rgbaPixels, solid, stripes, type Rgba } from "./logo-surface.fixtures";

afterEach(() => vi.restoreAllMocks());

const measure = async (pipeline: sharp.Sharp) => measureLogoSurface(await png(pipeline));
const reading = (width: number, height: number, paint: (x: number, y: number) => Rgba) => readLogoSurface(rgbaPixels(width, height, paint));

describe("the rule is written down", () => {
  it("keeps the numbers the ticket was measured with", () => {
    expect(LOGO_SURFACE_RULE).toEqual({ minInkAlpha: 16, opaqueAlpha: 250, minSeeThroughShare: 0.005, lostBelowContrast: 1.5, darkMustSave: 0.25, measureSide: 128, maxDecodedBytes: 32 * 1024 * 1024, maxSide: 8192, maxWaiting: 4 });
  });
});

describe("readLogoSurface (pure)", () => {
  it("is deterministic: the same pixels give the same answer", () => {
    const paint = (x: number) => (x < 6 ? WHITE : NONE);
    expect(reading(10, 10, paint)).toEqual(reading(10, 10, paint));
  });
  it("reports the share of ink lost on each plate and of see-through pixels", () => {
    const r = reading(10, 10, x => (x < 5 ? WHITE : NONE))!;
    expect(r).toMatchObject({ surface: "dark", lostOnDark: 0 });
    expect(r.lostOnLight).toBeCloseTo(1, 5);
    expect(r.seeThrough).toBeCloseTo(0.5, 5);
  });
  it("is null for no pixels, for no see-through pixel and for no ink", () => {
    expect(readLogoSurface(new Uint8Array(0))).toBeNull();
    expect(reading(10, 10, () => WHITE)).toBeNull();
    expect(reading(10, 10, () => NONE)).toBeNull();
  });
  it("ignores a trailing partial pixel", () => {
    const px = rgbaPixels(4, 4, x => (x < 2 ? WHITE : NONE));
    const longer = new Uint8Array(px.length + 3);
    longer.set(px);
    expect(readLogoSurface(longer)).toEqual(readLogoSurface(px));
  });
});

describe("measureLogoSurface: light, dark and mixed logos", () => {
  it("a logo that is all light ink asks for the dark plate", async () => {
    expect(await measure(block(300, 200, WHITE))).toBe("dark");
    expect(await measure(block(300, 200, solid("#dddddd")))).toBe("dark");
  });
  it("a logo that is all dark ink keeps the light plate", async () => {
    expect(await measure(block(300, 200, BLACK))).toBe("light");
    expect(await measure(block(300, 200, solid("#222222")))).toBe("light");
  });

  it("a logo like the owner's (a white word and a gradient word) asks for the dark plate: it loses most of its ink on the light one and none on the dark one", async () => {
    const logo = ownerLikeLogo();
    const bytes = await png(logo.pipeline);
    expect(await measureLogoSurface(bytes)).toBe("dark");
    const { data } = await sharp(bytes).resize({ width: 128, fit: "inside", kernel: "mitchell" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const r = readLogoSurface(data)!;
    expect(r.lostOnLight).toBeGreaterThan(0.6);
    expect(r.lostOnDark).toBeLessThan(0.05);
  });

  it("is decided by the ink that would be lost, not by the mean luminance (40% white + 60% medium blue)", async () => {
    const parts = [{ color: WHITE, share: 40 }, { color: solid("#1d4ed8"), share: 60 }];
    const mean = meanInkLuminance(400, 200, (x, y) => {
      const mx = 40, my = 20;
      if (x < mx || x >= 360 || y < my || y >= 180) return NONE;
      return (x - mx) / 320 < 0.4 ? WHITE : solid("#1d4ed8");
    });
    // A mean-of-luminance rule would read this logo as mid-dark (it falls below the 0.5 mid point) and leave it on the light plate...
    expect(mean).toBeLessThan(0.5);
    // ...but 40% of the ink is white and would vanish on it, and the dark plate keeps all of it.
    expect(await measure(stripes(400, 200, parts))).toBe("dark");
  });
  it("and a mean above the middle does not send a logo with too little light ink to the dark plate", async () => {
    // 20% white and 80% black: the lost share on light is 0.2 (below the 0.25 margin), whatever the mean says.
    expect(await measure(stripes(400, 200, [{ color: WHITE, share: 20 }, { color: BLACK, share: 80 }]))).toBe("light");
  });

  it("with no plate that keeps the ink (white and black in the same measure) stays on the light plate", async () => {
    expect(await measure(stripes(400, 200, [{ color: WHITE, share: 50 }, { color: BLACK, share: 50 }]))).toBe("light");
  });
  it("the margin of 0.25 is the frontier: 60/40 white/black stays light, 70/30 goes dark", async () => {
    expect(await measure(stripes(1000, 200, [{ color: WHITE, share: 60 }, { color: BLACK, share: 40 }]))).toBe("light");
    expect(await measure(stripes(1000, 200, [{ color: WHITE, share: 70 }, { color: BLACK, share: 30 }]))).toBe("dark");
  });
  it("the margin is exact on the pure rule: dark wins at a difference of 0.25 and not below", () => {
    // 10 pixels of ink: n white, the rest black. On light, white is lost; on dark, black is lost.
    const at = (white: number) => reading(10, 2, (x, y) => (y === 0 ? NONE : x < white ? WHITE : BLACK))!;
    // lost light - lost dark = (white - (10 - white)) / 10
    expect(at(6).surface).toBe("light"); // 0.2
    expect(at(7).surface).toBe("dark"); // 0.4
  });
  it("a selo with a white glyph in it (16% white on blue, gold, navy) keeps the light plate; one with a black glyph on yellow goes dark", async () => {
    const glyph = (field: Rgba, ink: Rgba) => stripes(400, 200, [{ color: field, share: 84 }, { color: ink, share: 16 }]);
    expect(await measure(glyph(solid("#1d4ed8"), WHITE))).toBe("light");
    expect(await measure(glyph(solid("#0b1f4b"), WHITE))).toBe("light");
    expect(await measure(glyph(solid("#ffd400"), BLACK))).toBe("dark");
  });
});

describe("measureLogoSurface: where the contrast threshold sits (1.5:1)", () => {
  it.each([
    ["gold #f5a623", "#f5a623", "light"], ["orange #ff8a00", "#ff8a00", "light"], ["blue #1d4ed8", "#1d4ed8", "light"], ["medium grey #888888", "#888888", "light"],
    ["cyan #00f0ff", "#00f0ff", "dark"], ["light grey #cccccc", "#cccccc", "dark"], ["yellow #ffee00", "#ffee00", "dark"],
  ])("a flat %s logo asks for the %s plate", async (_name, hex, expected) => {
    expect(await measure(block(300, 200, solid(hex)))).toBe(expected);
  });
});

describe("measureLogoSurface: semi-transparent ink", () => {
  it("weighs the ink by its opacity, so a faint white logo is still light ink and a faint black one is still dark ink", async () => {
    expect(await measure(block(300, 200, [255, 255, 255, 102]))).toBe("dark"); // 0.4
    expect(await measure(block(300, 200, [255, 255, 255, 230]))).toBe("dark"); // 0.9
    expect(await measure(block(300, 200, [0, 0, 0, 102]))).toBe("light");
    expect(await measure(block(300, 200, [0, 0, 0, 230]))).toBe("light");
  });
  it("pixels under the opacity floor (alpha 16) are no ink: a white logo at alpha 10 is nothing to judge", async () => {
    expect(await measure(block(300, 200, [255, 255, 255, 10]))).toBeNull();
    expect(await measure(block(300, 200, [255, 255, 255, 15]))).toBeNull();
  });
  it("alpha 16 counts as ink (the floor is inclusive)", () => {
    expect(reading(10, 10, () => [255, 255, 255, 16])).toMatchObject({ surface: "dark" });
    expect(reading(10, 10, () => [255, 255, 255, 15])).toBeNull();
  });
  it("black ink with an almost invisible white halo (alpha 0.04) stays light: the halo is no ink", async () => {
    const halo = fromRgba(300, 200, (x, y) => {
      const inside = x >= 100 && x < 200 && y >= 60 && y < 140;
      if (inside) return BLACK;
      const near = x >= 60 && x < 240 && y >= 30 && y < 170;
      return near ? [255, 255, 255, 10] : NONE;
    });
    expect(await measure(halo)).toBe("light");
  });
  it("a logo with more halo than ink does not change its answer: light ink under the floor never counts", () => {
    const r = reading(20, 20, (x, y) => (x < 4 && y < 4 ? BLACK : x < 18 ? [255, 255, 255, 12] : NONE))!;
    expect(r.surface).toBe("light");
    expect(r.lostOnDark).toBeCloseTo(1, 5);
  });
});

describe("readLogoSurface: opacity weighs the ink", () => {
  it("a faint white (alpha 20) over 70% of the ink does not outweigh 30% of opaque black: light, where counting every pixel the same would say dark", () => {
    const r = reading(10, 10, x => (x < 7 ? [255, 255, 255, 20] : x < 9 ? BLACK : NONE))!;
    expect(r.surface).toBe("light");
    expect(r.lostOnLight).toBeLessThan(0.25);
    expect(r.lostOnDark).toBeGreaterThan(0.7);
  });
});

describe("measureLogoSurface: tiny logos", () => {
  it("1x1 white at alpha 128 is a see-through light logo", async () => {
    expect(await measure(fromRgba(1, 1, () => [255, 255, 255, 128]))).toBe("dark");
  });
  it("1x1 opaque, even with an alpha channel, brings its own background", async () => {
    expect(await measure(fromRgba(1, 1, () => WHITE))).toBeNull();
  });
  it("3x2 with one see-through pixel is judged on its ink", async () => {
    expect(await measure(fromRgba(3, 2, (x, y) => (x === 0 && y === 0 ? NONE : WHITE)))).toBe("dark");
    expect(await measure(fromRgba(3, 2, (x, y) => (x === 0 && y === 0 ? NONE : BLACK)))).toBe("light");
  });
});

describe("measureLogoSurface: nothing to judge", () => {
  it("a PNG without an alpha channel is read from its header: no pixel is decoded", async () => {
    const rgb = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const toBuffer = vi.spyOn(sharp.prototype, "toBuffer");
    expect(await measureLogoSurface(rgb)).toBeNull();
    expect(toBuffer).not.toHaveBeenCalled();
  });
  it("neither does a JPEG", async () => {
    const jpeg = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
    const toBuffer = vi.spyOn(sharp.prototype, "toBuffer");
    expect(await measureLogoSurface(jpeg)).toBeNull();
    expect(toBuffer).not.toHaveBeenCalled();
  });
  it("a fully transparent logo has no ink", async () => {
    expect(await measure(fromRgba(100, 100, () => NONE))).toBeNull();
  });
  it("the corners of an opaque badge (about 4% see-through) are measured; under 0.5% it brings its own background", async () => {
    const badge = (r: number) => fromRgba(100, 100, (x, y) => {
      const dx = Math.min(x, 99 - x), dy = Math.min(y, 99 - y);
      return dx < r && dy < r && dx + dy < r ? NONE : solid("#ffffff");
    });
    // r=9: 4 corners x 45 pixels = 180 of 10000 (1.8%): measured, white ink: dark. r=4: 4 x 10 = 40 (0.4%): null.
    expect(await measure(badge(9))).toBe("dark");
    expect(await measure(badge(4))).toBeNull();
  });
  it("the share of see-through pixels at the threshold: 0.5% measures, a hair under does not", () => {
    const at = (clear: number) => readLogoSurface(rgbaPixels(200, 1, x => (x < clear ? NONE : WHITE)));
    expect(at(1)).not.toBeNull(); // 1/200 = 0.005
    expect(at(0)).toBeNull();
  });
});

describe("measureLogoSurface: formats and bit depths give the same verdict as 8-bit RGBA", () => {
  const draw = () => block(300, 200, WHITE);
  const dark = () => block(300, 200, BLACK);
  const svgOf = (hex: string, opacity = 1) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect x="30" y="20" width="240" height="160" fill="${hex}" fill-opacity="${opacity}"/></svg>`);

  it("WebP with alpha", async () => {
    expect(await measureLogoSurface(await draw().webp({ lossless: true }).toBuffer())).toBe("dark");
    expect(await measureLogoSurface(await dark().webp({ lossless: true }).toBuffer())).toBe("light");
  });
  it("GIF with transparency", async () => {
    expect(await measureLogoSurface(await draw().gif().toBuffer())).toBe("dark");
    expect(await measureLogoSurface(await dark().gif().toBuffer())).toBe("light");
  });
  it("AVIF is not decoded here: skipped as unsupported (its decoder takes several times the picture), and no pixel is decoded", async () => {
    const avif = await draw().avif({ lossless: true }).toBuffer();
    const toBuffer = vi.spyOn(sharp.prototype, "toBuffer");
    await expect(measureLogoSurface(avif)).rejects.toMatchObject({ name: "LogoSurfaceSkipped", code: "unsupported" });
    expect(toBuffer).not.toHaveBeenCalled();
  });
  it("a palette PNG with tRNS", async () => {
    const palette = (hex: string) => sharp(svgOf(hex)).png({ palette: true }).toBuffer();
    const bytes = await palette("#ffffff");
    expect(await sharp(bytes).metadata()).toMatchObject({ paletteBitDepth: expect.any(Number), hasAlpha: true });
    expect(await measureLogoSurface(bytes)).toBe("dark");
    expect(await measureLogoSurface(await palette("#000000"))).toBe("light");
  });
  it("a 16-bit RGBA PNG", async () => {
    const wide = (hex: string) => sharp(svgOf(hex)).toColourspace("rgb16").png().toBuffer();
    const bytes = await wide("#ffffff");
    expect((await sharp(bytes).metadata()).depth).toBe("ushort");
    expect(await measureLogoSurface(bytes)).toBe("dark");
    expect(await measureLogoSurface(await wide("#000000"))).toBe("light");
  });
  it("grey + alpha and 16-bit grey + alpha", async () => {
    const grey = (hex: string, space: "b-w" | "grey16") => sharp(svgOf(hex)).toColourspace(space).png().toBuffer();
    for (const space of ["b-w", "grey16"] as const) {
      const white = await grey("#ffffff", space);
      expect((await sharp(white).metadata()).space).toMatch(/b-w|grey16/);
      expect((await sharp(white).metadata()).hasAlpha).toBe(true);
      expect(await measureLogoSurface(white)).toBe("dark");
      expect(await measureLogoSurface(await grey("#000000", space))).toBe("light");
    }
  });
  it("an SVG drawn to PNG by sharp (white and black ink)", async () => {
    expect(await measureLogoSurface(await sharp(svgOf("#ffffff")).png().toBuffer())).toBe("dark");
    expect(await measureLogoSurface(await sharp(svgOf("#000000")).png().toBuffer())).toBe("light");
    expect(await measureLogoSurface(await sharp(svgOf("#ffffff", 0.4)).png().toBuffer())).toBe("dark");
  });
});

describe("measureLogoSurface: size and proportion", () => {
  it("a large logo within the memory ceiling (2400x1600, 40% opaque white) finishes quickly and asks for the dark plate", async () => {
    const huge = sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1600"><rect x="240" y="160" width="1440" height="800" fill="#ffffff"/></svg>`)).png({ compressionLevel: 1 });
    const bytes = await huge.toBuffer();
    const started = performance.now();
    expect(await measureLogoSurface(bytes)).toBe("dark");
    expect(performance.now() - started).toBeLessThan(3000);
  });
  it("the answer does not depend on the size of the file: the same logo at 256, 1024 and 2048 px", async () => {
    const at = async (side: number) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${side}" height="${side}"><rect x="10" y="10" width="40" height="80" fill="#ffffff"/><rect x="50" y="10" width="40" height="80" fill="#1d4ed8"/><circle cx="50" cy="50" r="12" fill="#f5a623"/></svg>`;
      const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
      const { data } = await sharp(bytes).resize({ width: 128, height: 128, fit: "inside", withoutEnlargement: true, kernel: "mitchell" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return { surface: await measureLogoSurface(bytes), lostOnLight: readLogoSurface(data)!.lostOnLight };
    };
    const [a, b, c] = [await at(256), await at(1024), await at(2048)];
    expect(a.surface).toBe(b.surface);
    expect(b.surface).toBe(c.surface);
    expect(Math.abs(a.lostOnLight - b.lostOnLight)).toBeLessThan(0.03);
    expect(Math.abs(b.lostOnLight - c.lostOnLight)).toBeLessThan(0.03);
  });
  it.each([["20:1", 2000, 100], ["1:20", 100, 2000]])("a %s logo WITH a transparent margin is measured on its ink", async (_name, width, height) => {
    expect(await measure(block(width, height, WHITE))).toBe("dark");
    expect(await measure(block(width, height, BLACK))).toBe("light");
  });
  it("never enlarges a small logo (and a 20x10 one is still judged)", async () => {
    expect(await measure(block(20, 10, WHITE))).toBe("dark");
  });
});

describe("measureLogoSurface: bytes that are not a logo", () => {
  it("rejects bytes that do not decode (a PNG header cut short)", async () => {
    const whole = await png(block(200, 100, WHITE));
    await expect(measureLogoSurface(whole.subarray(0, 20))).rejects.toThrow();
    await expect(measureLogoSurface(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow();
  });
  it("rejects a PNG whose stream ends right after the first chunks (the signature and the header are valid)", async () => {
    const noisy = await sharp({ create: { width: 400, height: 300, channels: 4, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 60 } } }).png().toBuffer();
    await expect(measureLogoSurface(noisy.subarray(0, 100))).rejects.toThrow();
  });
  it("skips an image of 40 MP on purpose (LogoSurfaceSkipped too_large), without decoding it", async () => {
    // 8000 x 5001 = 40.008 MP, a flat PNG that compresses to a few kilobytes.
    const flat = await sharp({ create: { width: 8000, height: 5001, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0.5 } } }).png({ compressionLevel: 9 }).toBuffer();
    const error = await measureLogoSurface(flat).then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(LogoSurfaceSkipped);
    expect(error).toMatchObject({ code: "too_large", name: "LogoSurfaceSkipped", message: "logo_surface_skipped:too_large" });
  });
  it("is deterministic: two measures of the same bytes are the same", async () => {
    const bytes = await png(ownerLikeLogo().pipeline);
    expect(await measureLogoSurface(bytes)).toBe(await measureLogoSurface(bytes));
  });
});

describe("measureLogoSurface: the resize does not invent ink (mitchell, not lanczos3)", () => {
  it.each([["lime #7ed321", "#7ed321"], ["gold #f5a623", "#f5a623"]])("a flat %s bar on a transparent canvas loses under 10%% on the light plate", async (_name, hex) => {
    const bytes = await png(block(1024, 512, solid(hex)));
    const { data } = await sharp(bytes).resize({ width: 128, height: 128, fit: "inside", withoutEnlargement: true, kernel: "mitchell" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(readLogoSurface(data)!.lostOnLight).toBeLessThan(0.1);
    expect(await measureLogoSurface(bytes)).toBe("light");
  });
  it("the kernel the code uses is the one asked for: measureLogoSurface resizes with mitchell", async () => {
    const resize = vi.spyOn(sharp.prototype, "resize");
    await measureLogoSurface(await png(block(1024, 512, solid("#7ed321"))));
    expect(resize).toHaveBeenCalledWith(expect.objectContaining({ kernel: "mitchell", width: 128, height: 128, fit: "inside", withoutEnlargement: true }));
  });
});
