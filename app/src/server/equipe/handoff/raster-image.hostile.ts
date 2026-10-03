// The hostile files of the review of PR 618, written once to a scratch directory (building them takes hundreds of MB, so it happens in a child process: see `writeBigLogoFiles`).
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { lyingGif, animatedBlankWebp, blankLosslessWebp, forgedPng, greyTrnsPng, writeBigLogoFiles } from "./logo-surface.fixtures";

/** The review's files (PR 618, 619) and the ones of the third round, plus a few of ours. `hostile` is what is still refused (see below); `legit` and `photos` are imported as on `main`. */
export async function writeHostileFiles() {
  const big = writeBigLogoFiles({ formats: true, shapes: true });
  const write = (name: string, bytes: Uint8Array) => { const file = path.join(big.dir, name); writeFileSync(file, bytes); return file; };
  const avifBig = path.join(big.dir, "avif-6000.avif");
  const run = spawnSync(process.execPath, ["-e", `
    const sharp = require("sharp");
    sharp({ create: { width: 6000, height: 6000, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } })
      .composite([{ input: { create: { width: 2000, height: 600, channels: 4, background: "#ffffff" } }, left: 100, top: 100 }]).avif({ effort: 0, quality: 30 }).toFile(process.argv[1])
      .catch(error => { console.error(error); process.exit(1); });`, avifBig], { cwd: process.cwd(), encoding: "utf8" });
  if (run.status !== 0) throw new Error(`avif not written: ${run.stderr}`);
  // What the camera and the phone make, and the file of the review of PR 619 (a valid PNG of 10 MiB with 872146 empty chunks before the IDAT): written by a child too, since building them takes hundreds of MB.
  const extras = spawnSync(process.execPath, ["-e", `
    const sharp = require("sharp"), fs = require("node:fs"), path = require("node:path"), zlib = require("node:zlib");
    const smooth = (width, height, channels) => {
      const raw = Buffer.alloc(width * height * channels);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < channels; c++)
        raw[(y * width + x) * channels + c] = Math.min(255, Math.round(((x * 255) / width + (y * 120) / height + c * 40) % 256) + ((x * 7 + y * 13 + c) % 9));
      return sharp(raw, { raw: { width, height, channels }, limitInputPixels: false });
    };
    (async () => {
      const dir = process.argv[1];
      await smooth(4032, 3024, 3).jpeg({ quality: 70 }).withMetadata({ orientation: 6 }).toFile(path.join(dir, "photo-jpeg-4032x3024.jpg"));
      await smooth(6000, 4000, 3).jpeg({ quality: 60 }).toFile(path.join(dir, "photo-jpeg-6000x4000.jpg"));
      await smooth(4032, 3024, 3).webp({ quality: 50, effort: 0 }).toFile(path.join(dir, "photo-webp-4032x3024.webp"));
      await smooth(4032, 3024, 3).avif({ quality: 30, effort: 0 }).toFile(path.join(dir, "photo-avif-4032x3024.avif"));
      await smooth(3000, 3000, 4).png({ compressionLevel: 1 }).toFile(path.join(dir, "photo-png-3000x3000.png"));
      await smooth(10000, 2000, 3).jpeg({ quality: 60 }).toFile(path.join(dir, "panorama-jpeg-10000x2000.jpg"));
      const real = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#4080c0" } }).png({ compressionLevel: 9 }).toBuffer();
      const chunk = Buffer.alloc(12); chunk.write("tEXt", 4, "latin1"); chunk.writeUInt32BE(zlib.crc32(Buffer.from("tEXt")), 8);
      const flood = Buffer.alloc(12 * 872146); for (let i = 0; i < 872146; i++) chunk.copy(flood, i * 12);
      fs.writeFileSync(path.join(dir, "flood-872146-chunks.png"), Buffer.concat([real.subarray(0, 33), flood, real.subarray(33)]));
    })().catch(error => { console.error(error); process.exit(1); });`, big.dir], { cwd: process.cwd(), encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (extras.status !== 0) throw new Error(`photos not written: ${extras.stderr}`);
  const at = (name: string) => path.join(big.dir, name);
  const photos = ["photo-jpeg-4032x3024.jpg", "photo-jpeg-6000x4000.jpg", "photo-webp-4032x3024.webp", "photo-avif-4032x3024.avif", "photo-png-3000x3000.png", "panorama-jpeg-10000x2000.jpg"].map(at);
  const flood = at("flood-872146-chunks.png");
  // Refused since ticket 17 (the 40 MP of `main` is the ceiling of what is opened at all): by the header (the canvas of 16383 x 16383 in 28 bytes), or by the child, which says no (the memory of its watch, a picture that
  // lies, a very wide one) without the server ever opening one. What is up to 40 MP and decodes within the child's memory is imported, as on `main`: the 6324 x 6324 ones below, and a GIF of 2890 x 2890, are in `heavy`.
  const hostile = [write("png16-interlaced-6325-forged.png", await forgedPng({ width: 6325, height: 6325, depth: 16, interlace: 1 })), big.wide8388608, big.wide16bit, write("webp-blank-16383.webp", blankLosslessWebp(16383, 16383)), write("grey-trns-10000000.png", greyTrnsPng(10_000_000)), write("gif-lying-4096.gif", lyingGif(1, 1, 4096, 4095)), avifBig];
  const heavy = [big.webp, big.png8Interlaced, big.png8, big.gifOver];
  // Heavy but inside the ceiling (each is a real picture that the pages of a site may carry): they are imported, in the child, and the server does not grow.
  const legit = [big.png16Inside, big.webpInside, big.gifInside, big.avifInside, big.side8192Wide, big.side8192Tall, big.side8192GreyAlpha, write("webp-animated-2890.webp", animatedBlankWebp(2890, 2890)), ...heavy];
  return { ...big, avifBig, hostile, legit, heavy, photos, flood };
}
