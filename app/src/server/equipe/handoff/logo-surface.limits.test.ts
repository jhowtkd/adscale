// The memory a logo may take to be measured (ticket 16, review of PR 618): the header is read by hand from the first bytes, a logo past the ceiling is skipped, never opened,
// and `sharp` is not asked for a header at all (libvips reserves the canvas of a WebP or a GIF when it opens one: second round of the review).
import { readFileSync, rmSync, statSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { readRasterHeader } from "./image-header";
import { LOGO_SURFACE_RULE, LogoSurfaceSkipped, measureLogoSurface } from "./logo-surface";
import { NONE, WHITE, animatedBlankWebp, blankLosslessWebp, block, forgedGifHeader, forgedPng, png, rgbaPixels, writeBigLogoFiles } from "./logo-surface.fixtures";

afterEach(() => vi.restoreAllMocks());
const MAX = LOGO_SURFACE_RULE.maxDecodedBytes;
type Outcome = { value?: unknown; error?: unknown };
const outcome = (promise: Promise<unknown>): Promise<Outcome> => promise.then(value => ({ value }), (error: unknown) => ({ error }));
const skipped = (result: Outcome) => result.error instanceof LogoSurfaceSkipped;
const skippedWith = (result: Outcome, code: string) => expect(result.error).toMatchObject({ name: "LogoSurfaceSkipped", code, message: `logo_surface_skipped:${code}` });
/** Every call that opens an image with `sharp`, the header included: nothing of the kind may run for a logo that is skipped. */
const sharpWork = () => [vi.spyOn(sharp.prototype, "metadata"), vi.spyOn(sharp.prototype, "resize"), vi.spyOn(sharp.prototype, "toBuffer"), vi.spyOn(sharp.prototype, "raw")];
const untouched = (spies: Array<{ mock: unknown }>) => { for (const spy of spies) expect(spy).not.toHaveBeenCalled(); };

describe("the ceiling is written down", () => {
  it("32 MiB decoded, and four measures may wait", () => {
    expect(MAX).toBe(33_554_432);
    expect(LOGO_SURFACE_RULE.maxWaiting).toBe(4);
  });
});

describe("measureLogoSurface: the boundary of the ceiling, read from the header by hand", () => {
  const verdict = async (header: Parameters<typeof forgedPng>[0]) => outcome(measureLogoSurface(await forgedPng(header)));

  it("8-bit RGBA: exactly at the ceiling is not skipped (it goes on to decode), one row more is", async () => {
    expect(4096 * 2048 * 4).toBe(MAX);
    const at = await verdict({ width: 4096, height: 2048 });
    expect(skipped(at)).toBe(false); // it goes on to decode (the forged pixels are not a real image: whatever comes of it, it is not a skip)
    skippedWith(await verdict({ width: 4096, height: 2049 }), "too_large");
  });
  it("the same shape in 16 bits costs double: 4096 x 1024 is the boundary", async () => {
    expect(skipped(await verdict({ width: 4096, height: 1024, depth: 16 }))).toBe(false);
    expect(skipped(await verdict({ width: 4096, height: 1025, depth: 16 }))).toBe(true);
    // The shape that passes in 8 bits is skipped in 16.
    expect(skipped(await verdict({ width: 4096, height: 2048, depth: 8 }))).toBe(false);
    expect(skipped(await verdict({ width: 4096, height: 2048, depth: 16 }))).toBe(true);
  });
  it("grey + alpha counts two channels: 4096 x 4096 is the boundary", async () => {
    expect(skipped(await verdict({ width: 4096, height: 4096, colorType: 4 }))).toBe(false);
    expect(skipped(await verdict({ width: 4096, height: 4097, colorType: 4 }))).toBe(true);
  });
  it("a header that claims more pixels than any default limit allows (20000 x 20000) is read all the same, and skipped", async () => {
    skippedWith(await verdict({ width: 20000, height: 20000 }), "too_large");
  });
  it("a header with no alpha channel is not a cost at all, however large it claims to be", async () => {
    expect(await verdict({ width: 20000, height: 20000, colorType: 2 })).toEqual({ value: null });
  });
  it("a header that cannot be read (width 0) is skipped as unreadable: it is not a decoding failure", async () => {
    skippedWith(await verdict({ width: 0, height: 10 }), "unreadable");
  });
  it("a skip does no `sharp` work at all: the header is not asked of it either", async () => {
    const huge = await forgedPng({ width: 20000, height: 20000 }), over = await forgedPng({ width: 4096, height: 2049 }), broken = await forgedPng({ width: 0, height: 10 });
    const spies = sharpWork();
    for (const bytes of [huge, over, broken]) await outcome(measureLogoSurface(bytes));
    untouched(spies);
  });
});

describe("measureLogoSurface: the other formats, header by header", () => {
  const verdict = (bytes: Uint8Array) => outcome(measureLogoSurface(bytes));

  it("a lossless WebP that claims the largest size the format allows (16383 x 16383, 28 bytes) is skipped (too_large), and `sharp` is not asked", async () => {
    const bytes = blankLosslessWebp(16383, 16383);
    expect(bytes.length).toBe(28);
    const spies = sharpWork();
    skippedWith(await verdict(bytes), "too_large");
    untouched(spies);
  });
  it("the same file twice in a row and then eight at once: libvips reserves a canvas for every read of a WebP header, so none is made", async () => {
    const spies = sharpWork();
    const results = [await verdict(blankLosslessWebp(16383, 16383)), await verdict(blankLosslessWebp(16383, 16383)), ...await Promise.all(Array.from({ length: 8 }, () => verdict(blankLosslessWebp(16383, 16383))))];
    expect(results).toHaveLength(10);
    for (const result of results) skippedWith(result, "too_large");
    untouched(spies);
  });
  it("the boundary of a WebP is its canvas: 2890 x 2902 goes on to be decoded (a real decoding of a transparent picture: nothing to judge), one row more is skipped", async () => {
    expect(2890 * 2902 * 4).toBeLessThanOrEqual(MAX);
    expect(2890 * 2903 * 4).toBeGreaterThan(MAX);
    expect(await measureLogoSurface(blankLosslessWebp(2890, 2902))).toBeNull();
    skippedWith(await verdict(blankLosslessWebp(2890, 2903)), "too_large");
  });
  it("an animated WebP is skipped as unsupported, whatever its size, and `sharp` is not asked (libwebp keeps several canvases to open it)", async () => {
    const bytes = animatedBlankWebp(64, 64);
    expect(await sharp(bytes, { animated: true }).metadata()).toMatchObject({ pages: 2, width: 64 }); // the fixture is a real animation
    const spies = sharpWork();
    skippedWith(await verdict(bytes), "unsupported");
    skippedWith(await verdict(animatedBlankWebp(16383, 16383)), "unsupported");
    untouched(spies);
  });
  it("a GIF counts three canvases: 1670 x 1670 goes on to be decoded, 1700 x 1700 is skipped", async () => {
    expect(1670 * 1670 * 4 * 3).toBeLessThanOrEqual(MAX);
    expect(1700 * 1700 * 4 * 3).toBeGreaterThan(MAX);
    expect(skipped(await verdict(forgedGifHeader(1670, 1670)))).toBe(false); // not a picture: whatever comes of the decoding, it is not a skip
    const spies = sharpWork();
    skippedWith(await verdict(forgedGifHeader(1700, 1700)), "too_large");
    skippedWith(await verdict(forgedGifHeader(65535, 65535)), "too_large");
    untouched(spies);
  });
  it("AVIF is skipped as unsupported (there is no reader for its header, and its decoder takes several times the picture), and `sharp` is not asked", async () => {
    const avif = await block(64, 64, WHITE).avif({ lossless: true }).toBuffer();
    const spies = sharpWork();
    skippedWith(await verdict(avif), "unsupported");
    untouched(spies);
  });
  it("a format this measure does not read, and bytes that are no image, are skipped as unsupported", async () => {
    const tiff = await block(64, 64, WHITE).tiff().toBuffer();
    const spies = sharpWork();
    for (const bytes of [tiff, Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), Buffer.from("not an image at all"), Buffer.alloc(0), Buffer.alloc(64)]) skippedWith(await verdict(bytes), "unsupported");
    untouched(spies);
  });
  it("a header that is cut short is skipped as unreadable: nothing is guessed, and `sharp` is not asked", async () => {
    const real = await block(64, 64, WHITE).webp({ lossless: true }).toBuffer();
    const cutPng = (await png(block(64, 64, WHITE))).subarray(0, 20); // a PNG cut inside its IHDR
    const spies = sharpWork();
    for (const bytes of [
      cutPng,
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // the signature and nothing else
      real.subarray(0, 18), // a WebP cut before the first chunk's data
      Buffer.concat([Buffer.from("RIFF\0\0\0\0WEBPVP8X"), Buffer.alloc(8)]), // a VP8X chunk with no canvas
      forgedGifHeader(64, 64).subarray(0, 9), // a GIF cut inside its logical screen
    ]) skippedWith(await verdict(bytes), "unreadable");
    untouched(spies);
  });
  it("a JPEG has no alpha channel: nothing is decoded and `sharp` is not asked", async () => {
    const jpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
    const spies = sharpWork();
    expect(await verdict(jpeg)).toEqual({ value: null });
    untouched(spies);
  });
});

describe("LogoSurfaceSkipped", () => {
  it.each(["too_large", "busy", "unsupported", "unreadable"] as const)("%s is a named error with its code and message, not a decoding failure", code => {
    const error = new LogoSurfaceSkipped(code);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: "LogoSurfaceSkipped", code, message: `logo_surface_skipped:${code}` });
  });
});

describe("the files the review measured", () => {
  let files: ReturnType<typeof writeBigLogoFiles>;
  beforeAll(() => { files = writeBigLogoFiles(); }, 120_000);
  afterAll(() => { if (files) rmSync(files.dir, { recursive: true, force: true }); });

  it("are small files that claim a lot (the reason the pixel limit did not hold)", () => {
    expect(statSync(files.png16).size).toBeLessThan(2_000_000);
    expect(statSync(files.webp).size).toBeLessThan(50_000);
  });
  it.each([["a 16-bit interlaced PNG", "png16"], ["a lossless WebP", "webp"], ["an 8-bit interlaced PNG", "png8Interlaced"], ["an 8-bit PNG", "png8"]] as const)("%s of 6324 x 6324 is skipped (too_large), and `sharp` is not asked", async (_name, which) => {
    const bytes = readFileSync(files[which]);
    const spies = sharpWork();
    skippedWith(await outcome(measureLogoSurface(bytes)), "too_large");
    untouched(spies);
  });
  it("a 16-bit interlaced PNG inside the ceiling (2000 x 2000, 30.5 MiB decoded) is measured: dark", async () => {
    const bytes = readFileSync(files.png16Inside);
    expect(readRasterHeader(bytes)).toMatchObject({ format: "png", width: 2000, height: 2000, decodedBytes: 2000 * 2000 * 4 * 2 });
    expect(2000 * 2000 * 4 * 2).toBeLessThan(MAX);
    expect(await measureLogoSurface(bytes)).toBe("dark");
  });
});

describe("one measure at a time", () => {
  /** A logo that is quick to read and decodes to 4 x 4: white ink on a transparent half. */
  const logo = () => png(block(40, 40, WHITE));
  const decoded = () => ({ data: Buffer.from(rgbaPixels(4, 4, x => (x < 2 ? WHITE : NONE))), info: { width: 4, height: 4, channels: 4 } });

  /** Replaces the decoding with one that waits for the test to let it go, and counts how many run at once. */
  function gatedDecoding() {
    const gates: Array<() => void> = [];
    let active = 0, peak = 0, started = 0;
    vi.spyOn(sharp.prototype, "toBuffer").mockImplementation((() => {
      started++; active++; peak = Math.max(peak, active);
      return new Promise(resolve => gates.push(() => { active--; resolve(decoded()); }));
    }) as never);
    return { release: () => gates.shift()!(), started: () => started, active: () => active, peak: () => peak, waiting: () => gates.length };
  }

  it("never decodes two at once: five calls are decoded in turn, each when the one before has finished", async () => {
    const bytes = await logo();
    const decoding = gatedDecoding();
    const results = Array.from({ length: 5 }, () => outcome(measureLogoSurface(bytes)));
    await vi.waitFor(() => expect(decoding.started()).toBe(1));
    for (let turn = 1; turn <= 5; turn++) {
      await vi.waitFor(() => expect(decoding.started()).toBe(turn));
      expect(decoding.active()).toBe(1);
      decoding.release();
    }
    expect(await Promise.all(results)).toEqual(Array.from({ length: 5 }, () => ({ value: "dark" })));
    expect(decoding.peak()).toBe(1);
  });

  it("one running and four waiting is the most: the sixth call is skipped (busy), without decoding, and the queue serves the other five", async () => {
    const bytes = await logo();
    const decoding = gatedDecoding();
    const settled: Array<Awaited<ReturnType<typeof outcome>>> = [];
    const calls = Array.from({ length: 6 }, () => outcome(measureLogoSurface(bytes)).then(result => { settled.push(result); return result; }));
    // The skipped one settles on its own: the others are held at the gate.
    await vi.waitFor(() => expect(settled).toHaveLength(1));
    skippedWith(settled[0]!, "busy");
    expect(decoding.started()).toBe(1);
    for (let turn = 1; turn <= 5; turn++) { await vi.waitFor(() => expect(decoding.started()).toBe(turn)); decoding.release(); }
    const all = await Promise.all(calls);
    expect(all.filter(r => "value" in r)).toEqual(Array.from({ length: 5 }, () => ({ value: "dark" })));
    expect(all.filter(skipped)).toHaveLength(1);
    expect(decoding.peak()).toBe(1);
  });

  it("the queue empties and the measure is available again", async () => {
    const bytes = await logo();
    const decoding = gatedDecoding();
    const first = Array.from({ length: 6 }, () => outcome(measureLogoSurface(bytes)));
    for (let turn = 1; turn <= 5; turn++) { await vi.waitFor(() => expect(decoding.started()).toBe(turn)); decoding.release(); }
    await Promise.all(first);
    const again = outcome(measureLogoSurface(bytes));
    await vi.waitFor(() => expect(decoding.started()).toBe(6));
    decoding.release();
    expect(await again).toEqual({ value: "dark" });
  });

  it("a measure that fails to decode lets the next one through", async () => {
    const bytes = await logo();
    let call = 0;
    vi.spyOn(sharp.prototype, "toBuffer").mockImplementation((async () => { if (call++ === 0) throw new Error("decode failed"); return decoded(); }) as never);
    // Which of the two reaches the decoding first does not matter: one fails, and the other is measured all the same.
    const results = await Promise.all([outcome(measureLogoSurface(bytes)), outcome(measureLogoSurface(bytes))]);
    const failed = results.filter(r => "error" in r), measured = results.filter(r => "value" in r);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.error).toMatchObject({ message: "decode failed" });
    expect(skipped(failed[0]!)).toBe(false);
    expect(measured).toEqual([{ value: "dark" }]);
  });

  it("a caller that gives up while it waits takes no turn: its decoding never starts, and the one behind it is served", async () => {
    const bytes = await logo();
    const decoding = gatedDecoding();
    const deadline = new AbortController();
    const running = outcome(measureLogoSurface(bytes));
    await vi.waitFor(() => expect(decoding.started()).toBe(1));
    const abandoned = outcome(measureLogoSurface(bytes, { signal: deadline.signal }));
    const behind = outcome(measureLogoSurface(bytes));
    deadline.abort(new Error("deadline"));
    decoding.release(); // the first one finishes: the turn of the one that gave up comes and goes without decoding
    await vi.waitFor(() => expect(decoding.started()).toBe(2));
    decoding.release();
    expect(await Promise.all([running, abandoned, behind])).toEqual([{ value: "dark" }, { error: expect.objectContaining({ message: "deadline" }) }, { value: "dark" }]);
    expect(decoding.started()).toBe(2);
    expect(decoding.peak()).toBe(1);
  });

  it("a caller that has already given up does not even have its header read", async () => {
    const bytes = await logo();
    const deadline = new AbortController();
    deadline.abort(new Error("deadline"));
    const spies = sharpWork();
    const result = await outcome(measureLogoSurface(bytes, { signal: deadline.signal }));
    expect(result.error).toMatchObject({ message: "deadline" });
    untouched(spies);
  });
});
