/**
 * #179 prototype — compare post-hoc logo composite vs SVG text layer.
 * Outputs PNGs under tmp/composition-prototype/ for visual review.
 * No new dependencies. Logo is never model-regenerated.
 *
 * Usage: npx tsx scripts/prototype-exact-composition.ts [logo.png] [base.png]
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { composeExactBrandAssets } from "../src/server/creative-work/composite";

const OUT = join(process.cwd(), "../tmp/composition-prototype");

async function solidBase(
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: color },
  })
    .png()
    .toBuffer();
}

async function defaultLogo(): Promise<Buffer> {
  // Simple wordmark-like logo with alpha — not the real brand mark.
  const svg = `
<svg width="400" height="120" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="120" fill="none"/>
  <text x="20" y="80" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="#FFC914">PreceptorIA</text>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function textOverlaySvg(
  width: number,
  height: number,
  copy: { headline: string; body: string; cta: string; legal: string },
): Promise<Buffer> {
  const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="none"/>
  <text x="8%" y="22%" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(width * 0.06)}" font-weight="700" fill="#FFFFFF">${escapeXml(copy.headline)}</text>
  <foreignObject x="8%" y="30%" width="84%" height="35%">
    <div xmlns="http://www.w3.org/1999/xhtml" style="color:#E8EEF4;font-family:Arial,Helvetica,sans-serif;font-size:${Math.round(width * 0.035)}px;line-height:1.35;">
      ${escapeXml(copy.body)}
    </div>
  </foreignObject>
  <rect x="8%" y="${height * 0.72}" width="${width * 0.36}" height="${height * 0.07}" rx="8" fill="#FFC914"/>
  <text x="10%" y="${height * 0.765}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(width * 0.032)}" font-weight="700" fill="#071522">${escapeXml(copy.cta)}</text>
  <text x="8%" y="${height * 0.92}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(width * 0.022)}" fill="#A8B3C0">${escapeXml(copy.legal)}</text>
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

async function runFormat(
  label: string,
  dims: { width: number; height: number },
  logo: Buffer,
  baseInput: Buffer | null,
) {
  const base =
    baseInput ??
    (await solidBase(dims.width, dims.height, { r: 7, g: 21, b: 34 }));
  const resizedBase = await sharp(base)
    .resize(dims.width, dims.height, { fit: "cover", position: "attention" })
    .png()
    .toBuffer();

  // A) Logo composite only (exact asset path)
  const withLogo = await composeExactBrandAssets(
    resizedBase,
    [{ buffer: logo, gravity: "southwest", widthRatio: 0.22 }],
    dims,
  );
  writeFileSync(join(OUT, `${label}-logo-composite.png`), withLogo);
  writeFileSync(
    join(OUT, `${label}-logo-composite-thumb.png`),
    await sharp(withLogo).resize(320).png().toBuffer(),
  );

  // B) Full text layer SVG over textless media
  const textLayer = await textOverlaySvg(dims.width, dims.height, {
    headline: "PreceptorIA já está disponível",
    body: "Apoio à decisão clínica com a marca correta — lettering exato, sem o modelo desenhar o nome.",
    cta: "Começar teste",
    legal:
      "Apoio à decisão: não substitui avaliação e julgamento médico. Não inclua dados identificáveis de pacientes.",
  });
  const withText = await sharp(resizedBase)
    .composite([{ input: textLayer, gravity: "northwest" }])
    .png()
    .toBuffer();
  const withTextAndLogo = await composeExactBrandAssets(
    withText,
    [{ buffer: logo, gravity: "southwest", widthRatio: 0.22 }],
    dims,
  );
  writeFileSync(join(OUT, `${label}-text-layer.png`), withTextAndLogo);
  writeFileSync(
    join(OUT, `${label}-text-layer-thumb.png`),
    await sharp(withTextAndLogo).resize(320).png().toBuffer(),
  );
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const logoPath = process.argv[2];
  const basePath = process.argv[3];
  const logo =
    logoPath && existsSync(logoPath)
      ? await sharp(readFileSync(logoPath)).ensureAlpha().png().toBuffer()
      : await defaultLogo();
  const base =
    basePath && existsSync(basePath) ? readFileSync(basePath) : null;

  const formats = [
    { label: "1x1", width: 1080, height: 1080 },
    { label: "4x5", width: 1080, height: 1350 },
    { label: "9x16", width: 1080, height: 1920 },
  ];
  for (const f of formats) {
    await runFormat(f.label, f, logo, base);
  }

  writeFileSync(
    join(OUT, "README.md"),
    [
      "# Composition prototype (#179)",
      "",
      "Compare side by side:",
      "- `*-logo-composite.png` — exact logo over generated (or solid) media; model may still draw body text",
      "- `*-text-layer.png` — SVG headline/body/CTA/legal + exact logo; media is textless",
      "",
      "Open full size and `*-thumb.png` (320px) for both.",
      "",
      "Decision unlocked: how far post-composition alone goes vs requiring all exact text out of the image model.",
    ].join("\n"),
  );
  console.log(`Wrote prototype artifacts to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
