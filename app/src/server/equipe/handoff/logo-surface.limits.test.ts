// The memory a logo may take to be measured (ticket 16, review of PR 618): the header says what decoding costs, and a logo past the ceiling is skipped, never decoded.
import { readFileSync, rmSync, statSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { LOGO_SURFACE_RULE, LogoSurfaceSkipped, decodedBytes, measureLogoSurface } from "./logo-surface";
import { NONE, WHITE, block, forgedPng, rgbaPixels, png, writeBigLogoFiles } from "./logo-surface.fixtures";

afterEach(() => vi.restoreAllMocks());
const MAX = LOGO_SURFACE_RULE.maxDecodedBytes;
type Outcome = { value?: unknown; error?: unknown };
const outcome = (promise: Promise<unknown>): Promise<Outcome> => promise.then(value => ({ value }), (error: unknown) => ({ error }));
const skipped = (result: Outcome) => result.error instanceof LogoSurfaceSkipped;
/** Calls that would decode pixels: nothing of the kind may run for a logo that is skipped. */
const pixelWork = () => [vi.spyOn(sharp.prototype, "resize"), vi.spyOn(sharp.prototype, "toBuffer"), vi.spyOn(sharp.prototype, "raw")];

describe("the ceiling is written down", () => {
  it("32 MiB decoded, and four measures may wait", () => {
    expect(MAX).toBe(33_554_432);
    expect(LOGO_SURFACE_RULE.maxWaiting).toBe(4);
  });
});

describe("decodedBytes: what the header says decoding costs", () => {
  it.each([
    ["8-bit RGBA", { width: 10, height: 10, channels: 4, depth: "uchar" }, 400],
    ["8-bit signed", { width: 10, height: 10, channels: 4, depth: "char" }, 400],
    ["16-bit RGBA counts double", { width: 10, height: 10, channels: 4, depth: "ushort" }, 800],
    ["16-bit signed", { width: 10, height: 10, channels: 4, depth: "short" }, 800],
    ["grey + alpha counts two channels", { width: 10, height: 10, channels: 2, depth: "uchar" }, 200],
    ["32-bit integer", { width: 10, height: 10, channels: 4, depth: "int" }, 1600],
    ["32-bit unsigned", { width: 10, height: 10, channels: 4, depth: "uint" }, 1600],
    ["float", { width: 10, height: 10, channels: 4, depth: "float" }, 1600],
    ["complex", { width: 10, height: 10, channels: 4, depth: "complex" }, 3200],
    ["double", { width: 10, height: 10, channels: 4, depth: "double" }, 3200],
    ["double complex", { width: 10, height: 10, channels: 4, depth: "dpcomplex" }, 6400],
    ["an unknown depth counts four bytes a sample", { width: 10, height: 10, channels: 4, depth: "mystery" }, 1600],
    ["no depth is 8 bits", { width: 10, height: 10, channels: 4 }, 400],
    ["no channels is four", { width: 10, height: 10, depth: "uchar" }, 400],
    ["no size costs nothing (and is unreadable)", { channels: 4, depth: "uchar" }, 0],
  ] as const)("%s", (_name, header, expected) => {
    expect(decodedBytes(header as never)).toBe(expected);
  });
});

describe("measureLogoSurface: the boundary of the ceiling, read from a header and nothing else", () => {
  const verdict = async (header: Parameters<typeof forgedPng>[0]) => outcome(measureLogoSurface(await forgedPng(header)));

  it("8-bit RGBA: exactly at the ceiling is not skipped (it goes on to decode), one row more is", async () => {
    expect(4096 * 2048 * 4).toBe(MAX);
    const at = await verdict({ width: 4096, height: 2048 });
    expect(skipped(at)).toBe(false); // it goes on to decode (the forged pixels are not a real image: whatever comes of it, it is not a skip)
    const over = await verdict({ width: 4096, height: 2049 });
    expect(over.error).toMatchObject({ name: "LogoSurfaceSkipped", code: "too_large" });
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
    expect((await verdict({ width: 20000, height: 20000 })).error).toMatchObject({ code: "too_large" });
  });
  it("a header with no alpha channel is not a cost at all, however large it claims to be", async () => {
    expect(await verdict({ width: 20000, height: 20000, colorType: 2 })).toEqual({ value: null });
  });
  it("an unreadable header (width 0) is an ordinary Error, never a skip", async () => {
    const result = await verdict({ width: 0, height: 10 });
    expect(result.error).toBeInstanceOf(Error);
    expect(skipped(result)).toBe(false);
  });
  it("a header that says there is alpha but not how big the image is is an ordinary Error before any pixel work: nothing is guessed", async () => {
    const bytes = await png(block(40, 40, WHITE));
    vi.spyOn(sharp.prototype, "metadata").mockResolvedValue({ hasAlpha: true, channels: 4, depth: "uchar", format: "png" } as never);
    const spies = pixelWork();
    const result = await outcome(measureLogoSurface(bytes));
    expect(result.error).toMatchObject({ message: "logo_header_unreadable" });
    expect(skipped(result)).toBe(false);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
  it("a skip does no pixel work: only the header is read", async () => {
    const huge = await forgedPng({ width: 20000, height: 20000 }), over = await forgedPng({ width: 4096, height: 2049 });
    const spies = pixelWork();
    await outcome(measureLogoSurface(huge));
    await outcome(measureLogoSurface(over));
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("LogoSurfaceSkipped", () => {
  it.each(["too_large", "busy"] as const)("%s is a named error with its code and message, not a decoding failure", code => {
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
  it.each([["a 16-bit interlaced PNG", "png16"], ["a lossless WebP", "webp"], ["an 8-bit interlaced PNG", "png8Interlaced"], ["an 8-bit PNG", "png8"]] as const)("%s of 6324 x 6324 is skipped (too_large), and only its header is read", async (_name, which) => {
    const bytes = readFileSync(files[which]);
    const spies = pixelWork();
    const metadata = vi.spyOn(sharp.prototype, "metadata");
    const result = await outcome(measureLogoSurface(bytes));
    expect(result.error).toMatchObject({ name: "LogoSurfaceSkipped", code: "too_large" });
    expect(metadata).toHaveBeenCalledTimes(1);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
  it("a 16-bit interlaced PNG inside the ceiling (2000 x 2000, 30.5 MiB decoded) is measured: dark", async () => {
    expect(decodedBytes({ width: 2000, height: 2000, channels: 4, depth: "ushort" })).toBeLessThan(MAX);
    expect(await measureLogoSurface(readFileSync(files.png16Inside))).toBe("dark");
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
    expect(settled[0]).toMatchObject({ error: { name: "LogoSurfaceSkipped", code: "busy", message: "logo_surface_skipped:busy" } });
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
});
