// The hostile files of the review of PR 618, written once to a scratch directory (building them takes hundreds of MB, so it happens in a child process: see `writeBigLogoFiles`).
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { lyingGif, animatedBlankWebp, blankLosslessWebp, greyTrnsPng, writeBigLogoFiles } from "./logo-surface.fixtures";

/** The review's files (PR 618) and the ones of the third round, plus a few of ours, all of them refused by the new path: more than 32 MiB decoded, a side past 8192, or a header that lies. */
export function writeHostileFiles() {
  const big = writeBigLogoFiles({ formats: true, shapes: true });
  const write = (name: string, bytes: Uint8Array) => { const file = path.join(big.dir, name); writeFileSync(file, bytes); return file; };
  const avifBig = path.join(big.dir, "avif-6000.avif");
  const run = spawnSync(process.execPath, ["-e", `
    const sharp = require("sharp");
    sharp({ create: { width: 6000, height: 6000, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } })
      .composite([{ input: { create: { width: 2000, height: 600, channels: 4, background: "#ffffff" } }, left: 100, top: 100 }]).avif({ effort: 0, quality: 30 }).toFile(process.argv[1])
      .catch(error => { console.error(error); process.exit(1); });`, avifBig], { cwd: process.cwd(), encoding: "utf8" });
  if (run.status !== 0) throw new Error(`avif not written: ${run.stderr}`);
  const hostile = [
    big.png16, big.webp, big.png8Interlaced, big.png8, big.gifOver, big.wide8388608, big.wide32768, big.wide16bit, big.wideGreyAlpha,
    write("webp-blank-16383.webp", blankLosslessWebp(16383, 16383)), write("grey-trns-10000000.png", greyTrnsPng(10_000_000)), write("gif-lying-4096.gif", lyingGif(1, 1, 4096, 4095)), avifBig,
  ];
  // Heavy but inside the ceiling (each is a real picture that the pages of a site may carry): they are imported, in the child, and the server does not grow.
  const legit = [big.png16Inside, big.webpInside, big.gifInside, big.avifInside, big.side8192Wide, big.side8192Tall, big.side8192GreyAlpha, write("webp-animated-2890.webp", animatedBlankWebp(2890, 2890))];
  return { ...big, avifBig, hostile, legit };
}
