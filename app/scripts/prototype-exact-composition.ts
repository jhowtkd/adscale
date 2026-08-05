/**
 * #179 prototype — logo-only composite vs full SVG text layer.
 *
 * Produces full-size + 320px thumbs + contact sheets under
 * tmp/composition-prototype/, plus FINDINGS.md that unlocks #184.
 *
 * Logo is never model-regenerated. No new dependencies.
 *
 * Usage (from app/):
 *   npx tsx scripts/prototype-exact-composition.ts \
 *     [logo.png] [base-dir-or-image]
 *
 * Defaults:
 *   logo  → synthetic PreceptorIA wordmark (exact casing) with alpha
 *   bases → app/tmp/preceptoria-refs/approved/*.png when present
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { composeExactBrandAssets } from "../src/server/creative-work/composite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "tmp/composition-prototype");
const DEFAULT_BASES = join(
  dirname(fileURLToPath(import.meta.url)),
  "../tmp/preceptoria-refs/approved",
);

const FORMATS = [
  { label: "1x1", width: 1080, height: 1080 },
  { label: "4x5", width: 1080, height: 1350 },
  { label: "9x16", width: 1080, height: 1920 },
] as const;

const COPY = {
  headline: "PreceptorIA já está disponível",
  body: "Apoio à decisão clínica com lettering exato — o modelo não desenha o nome da marca.",
  cta: "Começar teste",
  legal:
    "Apoio à decisão: não substitui avaliação e julgamento médico. Não inclua dados identificáveis de pacientes.",
};

const NAVY = { r: 7, g: 21, b: 34 };

async function brandWordmarkLogo(): Promise<Buffer> {
  // Exact registered casing "PreceptorIA". Alpha outside glyphs.
  const svg = `
<svg width="640" height="160" xmlns="http://www.w3.org/2000/svg">
  <rect width="640" height="160" fill="none"/>
  <text x="16" y="108"
    font-family="Arial, Helvetica, sans-serif"
    font-size="96" font-weight="700" fill="#FFC914"
    letter-spacing="-1">PreceptorIA</text>
</svg>`;
  return sharp(Buffer.from(svg)).ensureAlpha().png().toBuffer();
}

async function loadLogo(path: string | undefined): Promise<{ buffer: Buffer; source: string }> {
  if (path && existsSync(path)) {
    const buffer = await sharp(readFileSync(path)).ensureAlpha().png().toBuffer();
    return { buffer, source: path };
  }
  return { buffer: await brandWordmarkLogo(), source: "synthetic-wordmark-PreceptorIA.svg→png" };
}

function discoverBases(arg: string | undefined): string[] {
  if (arg && existsSync(arg)) {
    // single file
    try {
      const st = readdirSync(arg);
      return st
        .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
        .map((f) => join(arg, f))
        .sort();
    } catch {
      return [arg];
    }
  }
  if (existsSync(DEFAULT_BASES)) {
    return readdirSync(DEFAULT_BASES)
      .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
      .map((f) => join(DEFAULT_BASES, f))
      .sort();
  }
  return [];
}

async function solidBase(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: NAVY },
  })
    .png()
    .toBuffer();
}

/** Blur + desaturate so the base reads as "media without readable text". */
async function textlessMedia(
  base: Buffer,
  dims: { width: number; height: number },
): Promise<Buffer> {
  return sharp(base)
    .resize(dims.width, dims.height, { fit: "cover", position: "attention" })
    .blur(18)
    .modulate({ saturation: 0.85, brightness: 0.92 })
    .png()
    .toBuffer();
}

async function textOverlaySvg(
  width: number,
  height: number,
): Promise<Buffer> {
  const hSize = Math.round(width * 0.055);
  const bSize = Math.round(width * 0.032);
  const cSize = Math.round(width * 0.03);
  const lSize = Math.round(width * 0.02);
  const ctaY = Math.round(height * 0.72);
  const ctaH = Math.round(height * 0.065);
  const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="none"/>
  <text x="7%" y="${Math.round(height * 0.18)}"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${hSize}" font-weight="700" fill="#FFFFFF">${escapeXml(COPY.headline)}</text>
  <foreignObject x="7%" y="${Math.round(height * 0.24)}" width="86%" height="${Math.round(height * 0.35)}">
    <div xmlns="http://www.w3.org/1999/xhtml"
      style="color:#E8EEF4;font-family:Arial,Helvetica,sans-serif;font-size:${bSize}px;line-height:1.4;">
      ${escapeXml(COPY.body)}
    </div>
  </foreignObject>
  <rect x="7%" y="${ctaY}" width="${Math.round(width * 0.38)}" height="${ctaH}" rx="10" fill="#FFC914"/>
  <text x="9%" y="${ctaY + Math.round(ctaH * 0.68)}"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${cSize}" font-weight="700" fill="#071522">${escapeXml(COPY.cta)}</text>
  <text x="7%" y="${Math.round(height * 0.9)}"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${lSize}" fill="#A8B3C0">${escapeXml(COPY.legal)}</text>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function writePair(
  stem: string,
  full: Buffer,
): Promise<{ full: string; thumb: string }> {
  const fullPath = join(OUT, `${stem}.png`);
  const thumbPath = join(OUT, `${stem}-thumb.png`);
  writeFileSync(fullPath, full);
  writeFileSync(thumbPath, await sharp(full).resize(320).png().toBuffer());
  return { full: fullPath, thumb: thumbPath };
}

async function runOneBase(
  basePath: string | null,
  logo: Buffer,
  formats: typeof FORMATS,
): Promise<string[]> {
  const baseName = basePath ? basename(basePath, ".png").replace(/\s+/g, "-") : "solid-navy";
  const baseBuf = basePath ? readFileSync(basePath) : null;
  const written: string[] = [];

  for (const fmt of formats) {
    const dims = { width: fmt.width, height: fmt.height };
    const covered = baseBuf
      ? await sharp(baseBuf)
          .resize(dims.width, dims.height, { fit: "cover", position: "attention" })
          .png()
          .toBuffer()
      : await solidBase(dims.width, dims.height);

    // A) Logo only on existing media (model text may remain underneath)
    const logoOnly = await composeExactBrandAssets(
      covered,
      [{ buffer: logo, gravity: "southwest", widthRatio: 0.24 }],
      dims,
    );
    const a = await writePair(`${baseName}__${fmt.label}__A-logo-only`, logoOnly);
    written.push(a.full, a.thumb);

    // B) Full text layer on textless media + exact logo
    const media = baseBuf
      ? await textlessMedia(baseBuf, dims)
      : await solidBase(dims.width, dims.height);
    const textLayer = await textOverlaySvg(dims.width, dims.height);
    const withText = await sharp(media)
      .composite([{ input: textLayer, gravity: "northwest" }])
      .png()
      .toBuffer();
    const textAndLogo = await composeExactBrandAssets(
      withText,
      [{ buffer: logo, gravity: "southwest", widthRatio: 0.24 }],
      dims,
    );
    const b = await writePair(`${baseName}__${fmt.label}__B-text-layer`, textAndLogo);
    written.push(b.full, b.thumb);
  }
  return written;
}

async function contactSheet(
  thumbs: string[],
  outName: string,
  columns = 3,
): Promise<void> {
  if (thumbs.length === 0) return;
  const tiles = await Promise.all(
    thumbs.map(async (p) => {
      const buf = await sharp(readFileSync(p))
        .resize(320, 400, { fit: "contain", background: { r: 20, g: 28, b: 36, alpha: 1 } })
        .png()
        .toBuffer();
      return buf;
    }),
  );
  const rows = Math.ceil(tiles.length / columns);
  const sheetW = columns * 320;
  const sheetH = rows * 400;
  const composites = tiles.map((input, i) => ({
    input,
    left: (i % columns) * 320,
    top: Math.floor(i / columns) * 400,
  }));
  const sheet = await sharp({
    create: {
      width: sheetW,
      height: sheetH,
      channels: 3,
      background: { r: 20, g: 28, b: 36 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
  writeFileSync(join(OUT, outName), sheet);
}

function writeFindings(input: {
  logoSource: string;
  bases: string[];
  fileCount: number;
}): void {
  const body = `# #179 Composition prototype — findings

Generated: ${new Date().toISOString()}
Logo source: \`${input.logoSource}\`
Bases: ${input.bases.length > 0 ? input.bases.map((b) => `\`${basename(b)}\``).join(", ") : "(solid navy fallback)"}
Artifacts: ${input.fileCount} files in \`tmp/composition-prototype/\`

## What was built

Two deterministic post-resize paths, on each of the 3 priority formats (1:1, 4:5, 9:16):

| Path | Base media | Text | Logo |
|------|------------|------|------|
| **A — logo only** | Approved ref (or solid), covered to format | Still whatever the model/ref drew | Exact asset, SW, width 24% |
| **B — text layer** | Same media blurred (textless stand-in) | SVG: headline, body, CTA, legal — exact strings | Exact asset, same placement |

Composition uses existing \`composeExactBrandAssets\` (alpha required, \`fit: inside\`). No extra provider call. Sits on the permanent resize step (1080 not ÷16).

## Visual comparison (open these)

1. \`contact-A-logo-only.png\` — thumbs of path A across bases × formats
2. \`contact-B-text-layer.png\` — thumbs of path B
3. Any \`*__4x5__A-logo-only.png\` vs \`*__4x5__B-text-layer.png\` at full size
4. Matching \`-thumb.png\` (320px) — feed density check

### What path A proves

- Official (or wordmark) logo lands **pixel-stable**, correct proportions, correct casing when the asset is the wordmark.
- Fixes the empty dashed box class of failure: the mark is a real layer, not a model guess.
- Does **not** fix model-drawn body copy ("PreceptorIa", wrong legal text, hex instructions as body). Those stay in the pixels underneath.

### What path B proves

- Headline / body / CTA / legal are **glyphs**, not painted pixels — "PreceptorIA" and the clinical disclaimer are exact, once.
- Thumbnail readability depends on type scale; full-size is clean on navy.
- Requires the model to leave **textless** media (negative space + palette + photo). That is a prompt/contract change, not just a composite step.
- Layout is crude on purpose (prototype): clearspace vs photo subjects, multi-line body, and CTA collision with logo need real policy before production.

## Decision for #184 (scope of deterministic composition)

| Layer | In #184? | Why |
|-------|----------|-----|
| **Logo / wordmark / seal (exact assets)** | **Yes — ship** | Documented model failure mode; zero extra provider call; resize stage already exists; closes empty-box + wrong-lettering on the mark itself |
| **Headline, body, CTA, legal as full SVG text** | **No — defer** | Unlocks more, but needs textless generation contract, type ramp per format, collision rules with photo/logo, and a second product decision. Prototype shows it is *possible*; not required to fix the PreceptorIA stamp defects |

**Recommendation recorded for the map:** #184 implements **exact brand-asset composition only** (logo and similar exact-mode assets), with per-asset/per-format placement policy as already specified on that ticket. Full copy-as-SVG is a separate later slice if product wants zero model text.

## Constraints respected

- Logo never regenerated by the image model
- No new dependency
- Provider budget unchanged (0 image calls in this prototype)
- 3 priority formats covered at full + thumb

## How to re-run

\`\`\`bash
cd app
npx tsx scripts/prototype-exact-composition.ts \\
  path/to/official-logo.png \\
  tmp/preceptoria-refs/approved
\`\`\`
`;
  writeFileSync(join(OUT, "FINDINGS.md"), body);
  writeFileSync(
    join(OUT, "README.md"),
    [
      "# Composition prototype (#179)",
      "",
      "See **FINDINGS.md** for the decision that unblocks #184.",
      "",
      "- `contact-A-logo-only.png` / `contact-B-text-layer.png` — overview",
      "- `*__A-logo-only.png` — exact logo on real/approved media",
      "- `*__B-text-layer.png` — SVG copy + exact logo on textless media",
      "- `*-thumb.png` — 320px feed check",
    ].join("\n"),
  );
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const logoArg = process.argv[2];
  const baseArg = process.argv[3];
  const { buffer: logo, source: logoSource } = await loadLogo(logoArg);
  writeFileSync(join(OUT, "_logo-used.png"), logo);

  const bases = discoverBases(baseArg);
  const allThumbsA: string[] = [];
  const allThumbsB: string[] = [];
  let fileCount = 1; // logo

  if (bases.length === 0) {
    const written = await runOneBase(null, logo, FORMATS);
    fileCount += written.length;
    for (const p of written) {
      if (p.includes("__A-") && p.endsWith("-thumb.png")) allThumbsA.push(p);
      if (p.includes("__B-") && p.endsWith("-thumb.png")) allThumbsB.push(p);
    }
  } else {
    for (const base of bases) {
      const written = await runOneBase(base, logo, FORMATS);
      fileCount += written.length;
      for (const p of written) {
        if (p.includes("__A-") && p.endsWith("-thumb.png")) allThumbsA.push(p);
        if (p.includes("__B-") && p.endsWith("-thumb.png")) allThumbsB.push(p);
      }
    }
  }

  await contactSheet(allThumbsA, "contact-A-logo-only.png", 3);
  await contactSheet(allThumbsB, "contact-B-text-layer.png", 3);
  fileCount += 2;

  writeFindings({ logoSource, bases, fileCount });
  console.log(`Wrote ${fileCount} artifacts → ${OUT}`);
  console.log(`Decision: ${join(OUT, "FINDINGS.md")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
