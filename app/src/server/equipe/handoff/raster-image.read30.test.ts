// A whole reading of a site that returns 30 images, in a clean process, and what the SERVER's memory did (ticket 17; the files of the review of PR 618). The reading is the real one
// (`createSiteEnrichment` and the importer, in `raster-image.read30.ts`, with the network, the storage and the database in memory); what is read is how much the process's peak (`maxRSS`) grew
// from the moment the modules were loaded to the end of the reading. The decoding happens in children, whose memory is not the server's: it is bounded by the child's own watch
// (`raster-image.test.ts`). On `main` the same driver, with the same files, takes hundreds of megabytes (see the numbers in the ticket's notes).
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeHostileFiles } from "./raster-image.hostile";

/** Headroom over what the server was measured to take (4 to 12 MB for a whole reading), generous for the allocators of different systems (macOS and Linux) and still far from the 431 MB to 1.9 GB of the review. */
const SERVER_GROWTH_MB = 48;
const HARNESS = path.resolve(__dirname, "raster-image.read30.ts");
let files: ReturnType<typeof writeHostileFiles>;
let dir: string;
let driver: string;
let lists: { hostile: string; legit: string; mixed: string; photos: string; flood: string };

beforeAll(() => {
  files = writeHostileFiles();
  dir = mkdtempSync(path.join(tmpdir(), "raster-read30-"));
  lists = { hostile: path.join(dir, "hostile.json"), legit: path.join(dir, "legit.json"), mixed: path.join(dir, "mixed.json"), photos: path.join(dir, "photos.json"), flood: path.join(dir, "flood.json") };
  writeFileSync(lists.hostile, JSON.stringify(files.hostile));
  writeFileSync(lists.legit, JSON.stringify(files.legit));
  writeFileSync(lists.mixed, JSON.stringify([files.png16, files.legit[0], files.wide8388608, files.legit[1], files.avifBig, files.legit[2], files.wide16bit, files.legit[3]]));
  writeFileSync(lists.photos, JSON.stringify(files.photos));
  writeFileSync(lists.flood, JSON.stringify([files.flood]));
  driver = path.join(dir, "driver.mjs");
  writeFileSync(driver, `
    import { readFileSync } from "node:fs";
    const [harness, listFile, reads] = process.argv.slice(2);
    const mod = await import(harness);
    const slots = mod.read30Slots(JSON.parse(readFileSync(listFile, "utf8")));
    const before = process.resourceUsage().maxRSS, rssBefore = process.memoryUsage.rss();
    // Each reading is its own account (and workspace), as the readings at the launch are: the line of the decoder is fair between them.
    const results = await Promise.all(Array.from({ length: Number(reads) }, (_, n) => mod.runRead30(slots, { ...mod.READ30_CONTEXT, workspaceId: "ws-" + n, accountId: "acc-" + n, readingId: "reading-" + n })));
    const shared = process.report.getReport().sharedObjects.filter(file => /sharp|vips/i.test(file));
    console.log(JSON.stringify({
      growthMB: Math.round((process.resourceUsage().maxRSS - before) / 1024), baselineMB: Math.round(rssBefore / 1048576), sharpInParent: shared,
      reads: results.map(r => ({ logo: r.identity.branding?.logo ? r.identity.branding.logo.url : null, logoError: r.identity.groupErrors?.logo ?? null, imagesError: r.images.groupErrors?.images ?? null,
        images: r.images.images.length, puts: r.puts.length, saved: r.saved.length, savedNames: r.saved.map(a => a.name), downloads: r.downloads, ms: r.ms })),
    }));
  `);
}, 300_000);
afterAll(() => { for (const target of [files?.dir, dir]) if (target) rmSync(target, { recursive: true, force: true }); });

type Run = { growthMB: number; baselineMB: number; sharpInParent: string[]; reads: Array<{ logo: string | null; logoError: string | null; imagesError: string | null; images: number; puts: number; saved: number; savedNames: string[]; downloads: number; ms: number }> };
/** `server-only` (a package that throws outside a server bundle) resolves to nothing under the `react-server` condition: the same modules the app runs, in a process of their own. */
function read(list: string, reads = 1): Run {
  const run = spawnSync(process.execPath, ["--conditions", "react-server", "--import", "tsx", driver, HARNESS, list, String(reads)], { cwd: process.cwd(), encoding: "utf8", timeout: 240_000, maxBuffer: 16 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`reading failed (${run.status}): ${run.stderr.slice(-2000)}`);
  return JSON.parse(run.stdout.trim().split("\n").pop()!) as Run;
}

describe("a reading of a site that returns 30 hostile images (the 3 logos, the screenshot and the 26 images that are still refused: more than 40 MP, a header that lies, or a picture the child cannot hold)", () => {
  it("ends with 'images not found' and 'logo not found', keeps nothing, and the server takes at most 48 MB more", () => {
    const run = read(lists.hostile);
    const [only] = run.reads;
    expect(only!.downloads).toBe(30); // 3 logos + the screenshot + 26 images, every one fetched
    expect(only!.logo).toBeNull();
    expect(only!.logoError).toBe("logo_unsupported_format"); // a file that is refused is a logo that is not found, not a failed reading
    expect(only!.images).toBe(0);
    expect(only!.imagesError).toBe("images_not_found");
    expect(only!.puts).toBe(0); // nothing of a refused picture reaches storage, no copy for the vision, no object
    expect(only!.saved).toBe(0); // and no asset
    expect(run.growthMB).toBeLessThanOrEqual(SERVER_GROWTH_MB);
  }, 300_000);

  it("the server never loads `sharp` for it: no native library of the image decoder is in the server's process, before or after the reading", () => {
    const run = read(lists.hostile);
    expect(run.sharpInParent).toEqual([]);
  }, 300_000);

  it("four readings at the same time, of four accounts (120 hostile pictures), are refused the same way, and the server takes no more than for one", () => {
    const run = read(lists.hostile, 4);
    expect(run.reads).toHaveLength(4);
    for (const one of run.reads) {
      expect(one).toMatchObject({ logo: null, logoError: "logo_unsupported_format", images: 0, imagesError: "images_not_found", puts: 0, saved: 0 });
    }
    expect(run.sharpInParent).toEqual([]);
    expect(run.growthMB).toBeLessThanOrEqual(SERVER_GROWTH_MB);
  }, 300_000);
});

describe("a reading whose pictures are heavy but legitimate (inside the ceiling) is imported as before, and the server still does not grow", () => {
  it("EVERY heavy picture of the set (16-bit PNG, WebP and animated WebP and AVIF of 2890 px, GIFs, a very wide, a very tall and a grey + alpha PNG, and the 6324 x 6324 PNGs and WebP that are inside the 40 MP of `main`) is imported: 26 images, the logo, the screenshot and the vision copy, with their dimensions, and the server takes at most 48 MB more", () => {
    const run = read(lists.legit);
    const [only] = run.reads;
    expect(only!.downloads).toBe(28); // the first logo is taken, so the other two candidates are not fetched: 1 + the screenshot + 26
    expect(only!.images).toBe(26); // not one is lost: a refused legitimate picture is a regression, whatever the format
    expect(only!.imagesError).toBeNull();
    expect(only!.logo).not.toBeNull();
    expect(only!.logoError).toBeNull();
    expect(only!.savedNames.filter(name => name === "site_image")).toHaveLength(26);
    expect(only!.savedNames).toEqual(expect.arrayContaining(["site_logo", "site_screenshot", "site_vision"]));
    expect(only!.puts).toBe(only!.saved); // every object stored has its asset, and the other way around
    expect(run.sharpInParent).toEqual([]);
    expect(run.growthMB).toBeLessThanOrEqual(SERVER_GROWTH_MB);
  }, 300_000);

  it("the photos of a phone and of a camera (JPEG 12 MP with EXIF and 24 MP, WebP 12 MP, AVIF 12 MP, PNG 3000 x 3000, a panorama of 10000 x 2000), which `main` imported, are all imported in one reading: 26 images, the logo, the screenshot and the vision copy, and the server does not grow", () => {
    const run = read(lists.photos);
    const [only] = run.reads;
    expect(only!.images).toBe(26);
    expect(only!.imagesError).toBeNull();
    expect(only!.logo).not.toBeNull();
    expect(only!.logoError).toBeNull();
    expect(only!.savedNames.filter(name => name === "site_image")).toHaveLength(26);
    expect(only!.savedNames).toEqual(expect.arrayContaining(["site_logo", "site_screenshot", "site_vision"]));
    expect(run.sharpInParent).toEqual([]);
    expect(run.growthMB).toBeLessThanOrEqual(SERVER_GROWTH_MB * 2); // the bytes of 30 camera files (up to 5 MB each) are downloaded and held by the reading, not decoded
  }, 300_000);

  it("the file of the review of PR 619 (a valid PNG of 10 MiB with 872146 empty chunks before the IDAT) is imported 30 times in one reading, in the child: nothing is lost, and the server does not grow", () => {
    const run = read(lists.flood);
    const [only] = run.reads;
    expect(only!.imagesError).toBeNull();
    expect(only!.images).toBe(26);
    expect(only!.logo).not.toBeNull();
    expect(run.sharpInParent).toEqual([]);
    expect(run.growthMB).toBeLessThanOrEqual(SERVER_GROWTH_MB * 2); // the file is held once by the harness; the walk of 872146 chunks used to be ~100 ms of blocked loop for each of the ~60 reads of the header
  }, 300_000);

  // The simultaneous readings of the review (PR 619, finding 1): three or more readings of different accounts, each one with its 26 images, lost images, logos and palettes as "not found" when the line refused.
  it.each([3, 6])("%i readings at the same time, of %i different accounts, import everything, as on `main`: 26 images, the logo, the screenshot and the vision copy each, no group error, nothing refused", count => {
    const run = read(lists.legit, count);
    expect(run.reads).toHaveLength(count);
    for (const one of run.reads) {
      expect(one.images).toBe(26);
      expect(one.imagesError).toBeNull();
      expect(one.logo).not.toBeNull();
      expect(one.logoError).toBeNull();
      expect(one.savedNames.filter(name => name === "site_image")).toHaveLength(26);
      expect(one.savedNames).toEqual(expect.arrayContaining(["site_logo", "site_screenshot", "site_vision"]));
    }
    expect(run.sharpInParent).toEqual([]);
    expect(run.growthMB).toBeLessThanOrEqual(SERVER_GROWTH_MB * 2);
  }, 300_000);

  it("hostile and legitimate pictures in the same reading: the hostile ones are refused one by one, the others are imported, and the reading is not a failure", () => {
    const run = read(lists.mixed);
    const [only] = run.reads;
    expect(only!.images).toBe(13); // half of the pictures of the slots are hostile (png16, webp, wide, avif 6000), the other half legitimate: none of them is lost, none of the others is kept
    expect(only!.imagesError).toBeNull();
    expect(only!.puts).toBeGreaterThan(0);
    expect(run.sharpInParent).toEqual([]);
    expect(run.growthMB).toBeLessThanOrEqual(SERVER_GROWTH_MB);
  }, 300_000);
});
