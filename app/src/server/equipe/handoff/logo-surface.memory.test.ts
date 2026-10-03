// The memory the measure takes (ticket 16, review of PR 618 and its second round): each scenario runs in a clean process, and what is read is how much the process's peak (`maxRSS`) grew
// while the logo was measured, twice one after the other and then eight at once, each call with its own copy of the bytes (as successive uploads are). Without the limits the review's PNG took +347 MB,
// its WebP +173 MB, and eight at once +924 MB; and with the header read by `sharp`, a WebP took a canvas of its size for every read from the second on (+153 MB for the 6324 x 6324 one, +1 GB for
// the 16383 x 16383 one, +1.6 GB for eight at once). A logo that is skipped decodes nothing and asks `sharp` nothing, so what it takes does not depend on the system: it is held to 25 MB. A logo that is
// measured is only held to a bound that is generous (an allocator keeps what its threads freed, and that differs by system): it is there to catch a decoding that runs away, not to count megabytes.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { animatedBlankWebp, blankLosslessWebp, greyTrnsPng, lyingGif, writeBigLogoFiles } from "./logo-surface.fixtures";

const MODULE = path.resolve(__dirname, "logo-surface.ts");
const SKIPPED_GROWTH_MB = 25;
const MEASURED_GROWTH_MB = 300;
let files: ReturnType<typeof writeBigLogoFiles> & { webp16383: string; webpAnimated: string; greyTrns: string; lyingGif: string };
let scriptDir: string;
let script: string;

beforeAll(() => {
  const written = writeBigLogoFiles({ formats: true, shapes: true });
  files = {
    ...written, webp16383: path.join(written.dir, "webp-blank-16383.webp"), webpAnimated: path.join(written.dir, "webp-animated-2890.webp"),
    greyTrns: path.join(written.dir, "grey-trns-10000000x1.png"), lyingGif: path.join(written.dir, "gif-lying-4096x4095.gif"),
  };
  writeFileSync(files.webp16383, blankLosslessWebp(16383, 16383));
  writeFileSync(files.webpAnimated, animatedBlankWebp(2890, 2890));
  writeFileSync(files.greyTrns, greyTrnsPng(10_000_000));
  writeFileSync(files.lyingGif, lyingGif(1, 1, 4096, 4095));
  scriptDir = mkdtempSync(path.join(tmpdir(), "logo-surface-run-"));
  script = path.join(scriptDir, "measure.mjs");
  writeFileSync(script, `
    import { readFileSync } from "node:fs";
    const [file, modulePath, sequence, together] = process.argv.slice(2);
    const mod = await import(modulePath);
    const bytes = readFileSync(file);
    const measure = () => mod.measureLogoSurface(Buffer.from(bytes)).then(value => String(value), error => error.name + ":" + (error.code ?? error.message));
    const before = process.resourceUsage().maxRSS;
    const afterEach = [];
    for (let call = 0; call < Number(sequence); call++) afterEach.push(await measure());
    const atOnce = await Promise.all(Array.from({ length: Number(together) }, measure));
    console.log(JSON.stringify({ sequence: afterEach, together: atOnce, growthMB: Math.round((process.resourceUsage().maxRSS - before) / 1024) }));
  `);
}, 180_000);
afterAll(() => {
  if (files) rmSync(files.dir, { recursive: true, force: true });
  if (scriptDir) rmSync(scriptDir, { recursive: true, force: true });
});

/** Measures `file` `sequence` times one after the other and then `together` times at once, in a process of its own: what came out, and how much the process grew. */
function inCleanProcess(file: string, sequence: number, together: number) {
  const run = spawnSync(process.execPath, ["--import", "tsx", script, file, MODULE, String(sequence), String(together)], { cwd: process.cwd(), encoding: "utf8", timeout: 120_000 });
  if (run.status !== 0) throw new Error(`child failed: ${run.stderr}`);
  return JSON.parse(run.stdout.trim().split("\n").pop()!) as { sequence: string[]; together: string[]; growthMB: number };
}
const all = (code: string, count: number) => Array.from({ length: count }, () => `LogoSurfaceSkipped:${code}`);

describe("a logo that is skipped: twice in a row and then eight at once, in a clean process, takes at most 25 MB", () => {
  it.each([
    ["the review's 16-bit interlaced PNG (6324 x 6324, 493 KB)", () => files.png16, "too_large"],
    ["the review's lossless WebP (6324 x 6324, 1.7 KB)", () => files.webp, "too_large"],
    ["a lossless WebP of the largest size the format allows (16383 x 16383, 28 bytes)", () => files.webp16383, "too_large"],
    ["a WebP with animation (2890 x 2890)", () => files.webpAnimated, "unsupported"],
    ["an AVIF (2890 x 2890)", () => files.avifInside, "unsupported"],
    ["a GIF of 2890 x 2890 (three canvases are too much at that size)", () => files.gifOver, "too_large"],
    // The same 32 MiB in a shape libvips does not like (third round of the review): from ~16000 px of width it works in strips as wide as the picture, in floating point.
    ["a PNG of 8388608 x 1 (the longest side is 8192): +577 MB for one measure without the side limit", () => files.wide8388608, "too_large"],
    ["a PNG of 32768 x 256: +293 MB", () => files.wide32768, "too_large"],
    ["a 16-bit PNG of 2000000 x 2: +627 MB", () => files.wide16bit, "too_large"],
    ["a grey + alpha PNG of 10000000 x 1: +325 MB", () => files.wideGreyAlpha, "too_large"],
    ["a grey PNG of 10000000 x 1 whose transparency is a tRNS chunk, 10 KB of file: +316 MB", () => files.greyTrns, "too_large"],
  ] as const)("%s: skipped as %s", (_name, file, code) => {
    const run = inCleanProcess(file(), 2, 8);
    expect(run.sequence).toEqual(all(code, 2));
    expect(run.together).toEqual(all(code, 8));
    expect(run.growthMB).toBeLessThanOrEqual(SKIPPED_GROWTH_MB);
  });
});

describe("a GIF whose first frame is bigger than its screen: the decoding may not open more than the header said", () => {
  it("a screen of 1 x 1 and a frame of 4096 x 4095 (35 bytes), twice in a row and then eight at once, is refused by the limit of pixels, and the process grows by at most 25 MB (+86 MB for one measure without it)", () => {
    const run = inCleanProcess(files.lyingGif, 2, 8);
    expect(run.sequence).toEqual(["Error:Input image exceeds pixel limit", "Error:Input image exceeds pixel limit"]);
    expect(run.together.filter(result => result === "Error:Input image exceeds pixel limit")).toHaveLength(5); // one running and four waiting: five reach the decoding, and the others find the line full
    expect(run.together.filter(result => result === "LogoSurfaceSkipped:busy")).toHaveLength(3);
    expect(run.growthMB).toBeLessThanOrEqual(SKIPPED_GROWTH_MB);
  });
});

describe("a logo inside the ceiling is measured, and the process stays bounded", () => {
  it.each([
    ["a 16-bit interlaced PNG (2000 x 2000, 30.5 MiB decoded)", () => files.png16Inside],
    ["a lossless WebP (2890 x 2890, 31.9 MiB decoded)", () => files.webpInside],
    ["a GIF (1670 x 1670, three canvases of 10.6 MiB)", () => files.gifInside],
    // The longest side the measure accepts, in the three shapes that cost the most: +56 MB, +9 MB and +31 MB for one measure.
    ["a PNG of 8192 x 1024 (the longest side allowed, the whole ceiling)", () => files.side8192Wide],
    ["a PNG of 1024 x 8192", () => files.side8192Tall],
    ["a grey + alpha PNG of 8192 x 2048", () => files.side8192GreyAlpha],
  ] as const)("%s: three in a row are measured, then eight at once: five are measured in turn and three are skipped (busy)", (_name, file) => {
    const run = inCleanProcess(file(), 3, 8);
    expect(run.sequence).toEqual(["dark", "dark", "dark"]);
    // One running and four waiting, in the same instant: five are measured, and the others find the line full.
    expect(run.together.filter(result => result === "dark")).toHaveLength(5);
    expect(run.together.filter(result => result === "LogoSurfaceSkipped:busy")).toHaveLength(3);
    expect(run.growthMB).toBeLessThanOrEqual(MEASURED_GROWTH_MB);
  });
});
