// Orchestrator of the ticket-19 benchmark. Run (Node 22, from app/):
//   npx tsx tests/bench/run-training-upload-bench.ts [outDir]
// 1. THIS process writes the fixtures to a temp dir (it may load sharp: it is not a measured process).
// 2. For each scenario and each mode (before = `main`'s upload, after = the code under test) a fresh vitest process runs tests/bench/training-upload.bench.ts and writes JSON.
// 3. Two files come out: <outDir>/training-upload-bench.json (the real POST handler) and <outDir>/point-costs-bench.json (measure, AI normalization, transparency, preflight with a fake vendor).
//    Local evidence, not CI. BENCH_ONLY=a,b filters scenarios.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { copyFileSync } from "node:fs";
import { blankLosslessWebp, forgedPng, ownerLikeLogo, writeBigLogoFiles } from "../../src/server/equipe/handoff/logo-surface.fixtures";

const outDir = process.argv[2] ?? path.join(process.cwd(), "bench-evidence");
const only = process.env.BENCH_ONLY?.split(",");
const wrap = (body: string, attrs: string) => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), "t19-bench-"));
  const manifest: Record<string, { file: string; name: string; type: string; describes: string }> = {};
  const add = (id: string, name: string, type: string, bytes: Buffer | string, describes: string) => { writeFileSync(path.join(dir, name), bytes); manifest[id] = { file: name, name, type, describes }; };
  add("png-header-166324x166324", "hostile-166324x166324.png", "image/png", await forgedPng({ width: 166_324, height: 166_324 }), "forged PNG header that claims 166324 x 166324 (27.7 gigapixels), a few dozen bytes; NOT the review's 16-bit PNG (see png16-interlaced-6324)");
  const big = writeBigLogoFiles();
  copyFileSync(big.png16, path.join(dir, "png16-interlaced-6324.png")); manifest["png16-interlaced-6324"] = { file: "png16-interlaced-6324.png", name: "png16-interlaced-6324.png", type: "image/png", describes: "the review's real file: 6324 x 6324 interlaced 16-bit RGBA PNG (~480 KB, about 320 MB of pixels once decoded: 8 bytes each), writeBigLogoFiles().png16" };
  copyFileSync(big.webp, path.join(dir, "webp-lossless-6324-real.webp")); manifest["webp-lossless-6324-real"] = { file: "webp-lossless-6324-real.webp", name: "webp-lossless-6324-real.webp", type: "image/webp", describes: "the review's real lossless WebP of 6324 x 6324 with a white block (writeBigLogoFiles().webp)" };
  add("png-side-30001x1", "hostile-30001x1.png", "image/png", await forgedPng({ width: 30_001, height: 1 }), "PNG header with one side past 30000");
  add("webp-lossless-6324", "webp-6324.webp", "image/webp", blankLosslessWebp(6324, 6324), "valid lossless WebP of 6324 x 6324 (39.99 MP, inside the old 40 MP ceiling), 28 bytes");
  add("webp-lossless-16383", "webp-16383.webp", "image/webp", blankLosslessWebp(16_383, 16_383), "valid lossless WebP of 16383 x 16383 (the largest the format allows), 28 bytes");
  const photo = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#3478a1" } }).jpeg({ quality: 70 }).toBuffer();
  add("jpeg-legit-12mp", "photo-12mp.jpg", "image/jpeg", photo, "a legitimate 12 MP phone photo, solid colour (the cheapest case: metadata and spawn only)");
  // Textured pictures: smooth gradients with noise, so the decoder has real work and the files are real sizes (all under 10 MiB).
  const textured = (width: number, height: number, channels: 3 | 4) => {
    const raw = Buffer.alloc(width * height * channels);
    let seed = 7;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < channels; c++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      raw[(y * width + x) * channels + c] = c === 3 ? (x < width / 8 ? 40 : 255) : Math.min(255, Math.round(((x * 255) / width + (y * 120) / height + c * 40) % 256) + ((seed >>> 24) % 24));
    }
    return sharp(raw, { raw: { width, height, channels } });
  };
  add("jpeg-solid-24mp", "photo-24mp.jpg", "image/jpeg", await sharp({ create: { width: 6000, height: 4000, channels: 3, background: "#7a5c3e" } }).jpeg({ quality: 70 }).toBuffer(), "a 24 MP JPEG, solid colour (where the decode ceiling of the child starts to matter)");
  add("jpeg-solid-40mp", "photo-40mp.jpg", "image/jpeg", await sharp({ create: { width: 7000, height: 5700, channels: 3, background: "#7a5c3e" } }).jpeg({ quality: 70 }).toBuffer(), "a 39.9 MP JPEG, solid colour (just under the 40 MP ceiling)");
  add("png8-rgba-6324", "png8-6324.png", "image/png", readFileSync(big.png8), "the review's 8-bit RGBA PNG of 6324 x 6324 with a white block (writeBigLogoFiles().png8)");
  add("jpeg-textured-12mp-exif6", "photo-textured-12mp.jpg", "image/jpeg", await textured(4000, 3000, 3).jpeg({ quality: 55 }).withMetadata({ orientation: 6 }).toBuffer(), "a textured 12 MP phone photo with EXIF orientation 6 (noise, so the decoder works)");
  add("png-alpha-textured", "alpha-textured.png", "image/png", await textured(2200, 1400, 4).png({ compressionLevel: 6 }).toBuffer(), "a textured 2200 x 1400 PNG with a transparent band (the shape of a design with alpha)");
  add("png-logo", "logo.png", "image/png", await ownerLikeLogo(640, 160).pipeline.png().toBuffer(), "an owner-like logo PNG, 640 x 160 with transparency");
  add("svg-shadow-2048", "shadow-2048.svg", "image/svg+xml", wrap('<defs><filter id="f"><feGaussianBlur in="SourceAlpha" stdDeviation="8"/><feOffset dx="12" dy="12" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect x="100" y="100" width="1500" height="1500" fill="orange" filter="url(#f)"/>', 'width="2048" height="2048" viewBox="0 0 2048 2048"'), "legitimate 2048 x 2048 SVG with a blur + offset + merge shadow (the heaviest accepted common piece)");
  add("svg-5000-side", "big-5000.svg", "image/svg+xml", wrap('<rect width="10" height="10" fill="red"/>', 'width="5000" height="5000"'), "SVG that declares 5000 x 5000 (main drew a 5000 x 5000 PNG; after: 2048 x 2048)");
  add("svg-filter-200", "filter-200.svg", "image/svg+xml", wrap(`<defs><filter id="f">${Array.from({ length: 200 }, (_, i) => `<feOffset dx="1" dy="1" in="${i ? `r${i - 1}` : "SourceGraphic"}" result="r${i}"/>`).join("")}</filter></defs><rect width="100" height="50" fill="red" filter="url(#f)"/>`, 'width="200" height="100" viewBox="0 0 200 100"'), "hostile SVG with 200 filter primitives");
  rmSync(big.dir, { recursive: true, force: true });
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  mkdirSync(outDir, { recursive: true });
  const results: unknown[] = [];
  for (const scenario of Object.keys(manifest)) {
    if (only && !only.includes(scenario)) continue;
    for (const mode of ["before", "after"]) {
      const out = path.join(dir, `${scenario}.${mode}.json`);
      const run = spawnSync("npx", ["vitest", "run", "--config", "tests/bench/vitest.bench.config.ts", "tests/bench/training-upload.bench.ts"], {
        cwd: process.cwd(), encoding: "utf8", timeout: 600_000, maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, BENCH_MODE: mode, BENCH_SCENARIO: scenario, BENCH_FIXTURES: dir, BENCH_OUT: out },
      });
      try { results.push(JSON.parse(readFileSync(out, "utf8"))); }
      catch { results.push({ scenario, mode, failed: true, status: run.status, signal: run.signal, tail: (run.stdout + run.stderr).slice(-1500) }); }
      console.log(`${scenario} ${mode}: ${run.status === 0 ? "ok" : `exit ${run.status} ${run.signal ?? ""}`}`);
    }
  }
  // Per-point costs on the raster fixtures, same modes.
  const points: unknown[] = [];
  for (const [scenario, entry] of Object.entries(manifest)) {
    if ((only && !only.includes(scenario)) || !/^image\/(png|jpeg|webp)$/.test(entry.type)) continue;
    for (const mode of ["before", "after"]) {
      const out = path.join(dir, `${scenario}.points.${mode}.json`);
      const run = spawnSync("npx", ["vitest", "run", "--config", "tests/bench/vitest.bench.config.ts", "tests/bench/point-costs.bench.ts"], {
        cwd: process.cwd(), encoding: "utf8", timeout: 600_000, maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, BENCH_MODE: mode, BENCH_SCENARIO: scenario, BENCH_FIXTURES: dir, BENCH_OUT: out },
      });
      try { points.push(JSON.parse(readFileSync(out, "utf8"))); }
      catch { points.push({ scenario, mode, failed: true, status: run.status, signal: run.signal, tail: (run.stdout + run.stderr).slice(-1500) }); }
      console.log(`points ${scenario} ${mode}: ${run.status === 0 ? "ok" : `exit ${run.status} ${run.signal ?? ""}`}`);
    }
  }
  writeFileSync(path.join(outDir, "point-costs-bench.json"), JSON.stringify({ generatedAt: new Date().toISOString(), node: process.version, platform: `${process.platform}-${process.arch}`, note: "Per point, before = main's modules (949471d2, sharp in the server) vs after = the working tree. Clock fixed for the measure; fake vendor for the preflight; digests show same-or-different results. Local evidence, not a CI assertion.", results: points }, null, 2));
  const file = path.join(outDir, "training-upload-bench.json");
  writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), node: process.version, platform: `${process.platform}-${process.arch}`, note: "before = main's upload (949471d2) behind the real route; after = the working tree. Local evidence, not a CI assertion.", results }, null, 2));
  rmSync(dir, { recursive: true, force: true });
  console.log(`wrote ${file}`);
}
void main();
