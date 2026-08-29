import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "..");
const CASES = path.join(ROOT, "docs/client-cases");
const OUT = path.join(CASES, "derivatives");
const SHOTS = path.join(CASES, "screenshots");
const RESULTS = path.join(CASES, "results");

const BRANDS = {
  nike: { name: "Nike", sub: "Pegasus 41", accent: "#B4FF00", dark: "#0A0A0A" },
  amazon: { name: "Amazon", sub: "Institucional", accent: "#FF9900", dark: "#0F1B2D" },
  "burger-king": { name: "Burger King", sub: "Rebrand", accent: "#FF6B1A", dark: "#4A0E0E" },
};
const STAGES = ["context", "training", "direction", "results", "decision"];
const STAGE_LABEL = {
  context: "Contexto",
  training: "Treino de marca",
  direction: "Direção",
  results: "Resultados",
  decision: "Decisão",
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function baseCss() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; background: #0A0A0A; color: #F5F5F0; -webkit-font-smoothing: antialiased; }
    .frame { width: 100vw; height: 100vh; overflow: hidden; position: relative; }
    .eyebrow { font-size: 13px; letter-spacing: 0.28em; text-transform: uppercase; opacity: 0.65; }
    img { object-fit: cover; }
  `;
}

function coverSlide(brand, title, subtitle) {
  return `<!DOCTYPE html><html><head><style>${baseCss()}
    .frame { display: flex; flex-direction: column; justify-content: center; padding: 0 8vw; background: ${brand.dark}; }
    .accent { width: 72px; height: 6px; background: ${brand.accent}; margin-bottom: 42px; }
    h1 { font-size: 7.5vw; line-height: 1.02; letter-spacing: -0.02em; font-weight: 800; max-width: 80vw; }
    h1 em { color: ${brand.accent}; font-style: normal; }
    p { margin-top: 30px; font-size: 1.6vw; opacity: 0.75; max-width: 56vw; line-height: 1.5; }
    .footer { position: absolute; bottom: 5vh; left: 8vw; right: 8vw; display: flex; justify-content: space-between; align-items: center; }
    .logo { font-weight: 800; font-size: 22px; letter-spacing: -0.01em; }
    .logo span { color: ${brand.accent}; }
  </style></head><body><div class="frame">
    <div class="eyebrow">${esc(brand.name)} · ${esc(brand.sub)}</div>
    <div style="height: 26px"></div>
    <div class="accent"></div>
    <h1>${title}</h1>
    <p>${subtitle}</p>
    <div class="footer"><div class="logo">AD<span>Scale</span></div><div class="eyebrow">Cases de clientes</div></div>
  </div></body></html>`;
}

function stageSlide(brand, stageLabel, screenPath, idx, total) {
  const b64 = readFileSync(screenPath).toString("base64");
  return `<!DOCTYPE html><html><head><style>${baseCss()}
    .frame { display: flex; background: #0A0A0A; align-items: center; }
    .left { width: 34%; padding: 0 3.2vw; }
    .accent { width: 56px; height: 5px; background: ${brand.accent}; margin: 26px 0 34px; }
    h2 { font-size: 3.4vw; line-height: 1.06; font-weight: 800; letter-spacing: -0.015em; }
    .brandline { margin-top: 22px; font-size: 1.15vw; opacity: 0.7; line-height: 1.55; }
    .count { margin-top: 48px; font-size: 15px; opacity: 0.45; letter-spacing: 0.2em; }
    .shot { flex: 1; height: 100vh; display: flex; align-items: center; justify-content: center; padding: 3.4vh 3.4vw 3.4vh 0; }
    .shot img { max-width: 100%; max-height: 100%; border-radius: 10px; box-shadow: 0 30px 80px rgba(0,0,0,0.55); }
    .logo { position: absolute; bottom: 3.6vh; left: 3.2vw; font-weight: 800; font-size: 17px; }
    .logo span { color: ${brand.accent}; }
  </style></head><body><div class="frame">
    <div class="left">
      <div class="eyebrow">${esc(brand.name)} · ${esc(brand.sub)}</div>
      <div class="accent"></div>
      <h2>${stageLabel}</h2>
      <div class="brandline">Do treino de marca à decisão — ${esc(brand.name)} no ADScale.</div>
      <div class="count">${String(idx).padStart(2, "0")} / ${String(total).padStart(2, "0")}</div>
    </div>
    <div class="shot"><img src="data:image/png;base64,${b64}" /></div>
    <div class="logo">AD<span>Scale</span></div>
  </div></body></html>`;
}

function carouselCover(brand) {
  return `<!DOCTYPE html><html><head><style>${baseCss()}
    .frame { display: flex; flex-direction: column; justify-content: space-between; padding: 9vw 8vw; background: ${brand.dark}; }
    .top { display: flex; flex-direction: column; gap: 24px; }
    .accent { width: 64px; height: 6px; background: ${brand.accent}; }
    h1 { font-size: 9.5vw; line-height: 1.0; font-weight: 800; letter-spacing: -0.02em; }
    h1 em { color: ${brand.accent}; font-style: normal; }
    .mid p { font-size: 2.6vw; opacity: 0.75; line-height: 1.5; max-width: 70vw; }
    .bottom { display: flex; justify-content: space-between; align-items: flex-end; }
    .logo { font-weight: 800; font-size: 20px; } .logo span { color: ${brand.accent}; }
    .swipe { font-size: 14px; letter-spacing: 0.24em; text-transform: uppercase; opacity: 0.55; }
  </style></head><body><div class="frame">
    <div class="top"><div class="eyebrow">${esc(brand.name)} · ${esc(brand.sub)}</div><div class="accent"></div>
      <h1>${esc(brand.name)}<br /><em>no ADScale.</em></h1></div>
    <div class="mid"><p>Mesma marca, sistema consistente, peças novas geradas com o Brand Training treinado com o material do próprio cliente.</p></div>
    <div class="bottom"><div class="logo">AD<span>Scale</span></div><div class="swipe">Arraste →</div></div>
  </div></body></html>`;
}

function storyFrame(brand, piecePath) {
  const b64 = readFileSync(piecePath).toString("base64");
  return `<!DOCTYPE html><html><head><style>${baseCss()}
    .frame { background: ${brand.dark}; display: flex; align-items: center; justify-content: center; }
    .bg { position: absolute; inset: 0; background: radial-gradient(circle at 50% 35%, ${brand.accent}22, transparent 60%); }
    .card { position: relative; height: 78vh; aspect-ratio: 4/5; border-radius: 22px; overflow: hidden; box-shadow: 0 40px 120px rgba(0,0,0,0.6); }
    .card img { width: 100%; height: 100%; object-fit: cover; }
    .logo { position: absolute; top: 4.2vh; left: 0; right: 0; text-align: center; font-weight: 800; font-size: 20px; letter-spacing: 0.02em; }
    .logo span { color: ${brand.accent}; }
  </style></head><body><div class="frame">
    <div class="bg"></div>
    <div class="logo">AD<span>Scale</span></div>
    <div class="card"><img src="data:image/png;base64,${b64}" /></div>
  </div></body></html>`;
}

async function shoot(browser, html, outPath, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.waitForTimeout(350);
  await page.screenshot({ path: outPath, animations: "disabled" });
  await page.close();
}

async function main() {
  for (const dir of ["16x9", "4x5", "9x16"]) mkdirSync(path.join(OUT, dir), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const V16 = { width: 1920, height: 1080 };
  const V45 = { width: 1080, height: 1350 };
  const V916 = { width: 1080, height: 1920 };

  for (const [slug, brand] of Object.entries(BRANDS)) {
    const stageShots = STAGES.map((stage) => {
      const p = path.join(SHOTS, `${slug}-${stage}-1440.png`);
      if (!existsSync(p)) throw new Error(`missing screen ${p}`);
      return p;
    });

    await shoot(browser, coverSlide(brand, `A marca <em>${esc(brand.name)}</em> treinada dentro do produto.`, "Brand Training com o material do próprio cliente, briefing no produto e peças geradas de verdade."), path.join(OUT, "16x9", `${slug}-00-cover.png`), V16);
    for (let i = 0; i < stageShots.length; i++) {
      await shoot(browser, stageSlide(brand, STAGE_LABEL[STAGES[i]], stageShots[i], i + 1, stageShots.length), path.join(OUT, "16x9", `${slug}-${String(i + 1).padStart(2, "0")}-${STAGES[i]}.png`), V16);
    }

    await shoot(browser, carouselCover(brand), path.join(OUT, "4x5", `${slug}-00-cover.png`), V45);
    for (const n of [1, 2]) {
      const piece = path.join(RESULTS, `${slug}-${n === 1 ? "primary" : "fresh"}.png`);
    }
    const pieces = readFileSync(path.join(CASES, "evidence", "resolved-manifest.json"), "utf8");

    const manifest = JSON.parse(pieces);
    let pieceIdx = 0;
    for (const outputId of manifest.studies[slug].selectedRealOutputIds) {
      pieceIdx += 1;
      const piecePath = path.join(RESULTS, `${slug}-${outputId.slice(0, 8)}.png`);
      if (!existsSync(piecePath)) throw new Error(`missing piece ${piecePath}`);
      await shoot(browser, storyFrame(brand, piecePath), path.join(OUT, "4x5", `${slug}-peca-${pieceIdx}.png`), V45);
      await shoot(browser, storyFrame(brand, piecePath), path.join(OUT, "9x16", `${slug}-peca-${pieceIdx}.png`), V916);
    }
    console.log(slug, "derivatives ok");
  }

  await browser.close();
  console.log("derivatives complete");
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
