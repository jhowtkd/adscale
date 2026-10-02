// The memory the measure takes (ticket 16, review of PR 618): each scenario runs in a clean process, and what is read is how much the process's peak (`maxRSS`) grew
// while the logo was measured. Without the limits, the review's PNG took +347 MB, the WebP +173 MB, and eight at once +924 MB. The bounds below leave about twice
// the room of what was measured with the limits; they are orders of magnitude, and are there to catch a limit that stops holding, not to count megabytes.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeBigLogoFiles } from "./logo-surface.fixtures";

const MODULE = path.resolve(__dirname, "logo-surface.ts");
let files: ReturnType<typeof writeBigLogoFiles>;
let scriptDir: string;
let script: string;

beforeAll(() => {
  files = writeBigLogoFiles();
  scriptDir = mkdtempSync(path.join(tmpdir(), "logo-surface-run-"));
  script = path.join(scriptDir, "measure.mjs");
  writeFileSync(script, `
    import { readFileSync } from "node:fs";
    const [file, modulePath, count] = process.argv.slice(2);
    const mod = await import(modulePath);
    const bytes = readFileSync(file);
    const before = process.resourceUsage().maxRSS;
    const results = await Promise.all(Array.from({ length: Number(count) }, () => mod.measureLogoSurface(bytes).then(value => String(value), error => error.name + ":" + (error.code ?? error.message))));
    console.log(JSON.stringify({ results, growthMB: Math.round((process.resourceUsage().maxRSS - before) / 1024) }));
  `);
}, 120_000);
afterAll(() => {
  if (files) rmSync(files.dir, { recursive: true, force: true });
  if (scriptDir) rmSync(scriptDir, { recursive: true, force: true });
});

/** Measures `file` `count` times at once, in a process of its own, and says what came out and how much the process grew. */
function inCleanProcess(file: string, count: number) {
  const run = spawnSync(process.execPath, ["--import", "tsx", script, file, MODULE, String(count)], { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 });
  if (run.status !== 0) throw new Error(`child failed: ${run.stderr}`);
  return JSON.parse(run.stdout.trim().split("\n").pop()!) as { results: string[]; growthMB: number };
}

describe("the memory a logo may take to be measured, in a clean process", () => {
  it("the review's 16-bit interlaced PNG (6324 x 6324) is skipped and takes at most 25 MB", () => {
    const run = inCleanProcess(files.png16, 1);
    expect(run.results).toEqual(["LogoSurfaceSkipped:too_large"]);
    expect(run.growthMB).toBeLessThanOrEqual(25);
  });
  it("the review's lossless WebP (6324 x 6324) is skipped and takes at most 25 MB", () => {
    const run = inCleanProcess(files.webp, 1);
    expect(run.results).toEqual(["LogoSurfaceSkipped:too_large"]);
    expect(run.growthMB).toBeLessThanOrEqual(25);
  });
  it("eight of the PNG at once are all skipped and take at most 25 MB together", () => {
    const run = inCleanProcess(files.png16, 8);
    expect(run.results).toEqual(Array.from({ length: 8 }, () => "LogoSurfaceSkipped:too_large"));
    expect(run.growthMB).toBeLessThanOrEqual(25);
  });
  it("a logo inside the ceiling (2000 x 2000, 16-bit, interlaced: 30.5 MiB decoded) is measured (dark) and takes at most 100 MB", () => {
    const run = inCleanProcess(files.png16Inside, 1);
    expect(run.results).toEqual(["dark"]);
    expect(run.growthMB).toBeLessThanOrEqual(100);
  });
  it("eight of that at once: some are measured, in turn, the rest are skipped (busy), nothing else happens, and the peak stays at most 160 MB", () => {
    const run = inCleanProcess(files.png16Inside, 8);
    expect(run.results.filter(r => r === "dark").length).toBeGreaterThanOrEqual(1);
    expect(run.results.every(r => r === "dark" || r === "LogoSurfaceSkipped:busy")).toBe(true);
    // One running and four waiting: five at most are measured, so at least three are skipped.
    expect(run.results.filter(r => r === "LogoSurfaceSkipped:busy").length).toBeGreaterThanOrEqual(3);
    expect(run.growthMB).toBeLessThanOrEqual(160);
  });
});
