import "./load-env";

import fs from "fs";
import path from "path";
import sharp from "sharp";

import { env } from "@/server/validation/env";
import OpenAI from "openai";
import { buildDerivationPrompt } from "@/server/ai/prompt-builder";

const ADS_DIR = "/Users/jhonatan/Desktop/Outputs/Anuncios";
const REFS_DIR = "/Users/jhonatan/Desktop/Outputs/Referencias";
const OUT_DIR = "/Users/jhonatan/Desktop/Outputs/test-results/outputs";

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getImageFiles(dir: string): string[] {
  return fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
}

interface FormatConfig {
  apiSize: string;
  targetW: number;
  targetH: number;
  targetAspectRatio: number;
}

// OpenAI images.edit supports: "1024x1024" | "1024x1536" | "1536x1024" | "auto"
// We generate at the closest supported size, then post-process with sharp to the target format.
const FORMAT_CONFIG: Record<string, FormatConfig> = {
  "1:1":  { apiSize: "1024x1024", targetW: 1024, targetH: 1024, targetAspectRatio: 1 },
  "4:5":  { apiSize: "1024x1536", targetW: 1024, targetH: 1280, targetAspectRatio: 0.8 },
  "9:16": { apiSize: "1024x1536", targetW: 1024, targetH: 1824, targetAspectRatio: 0.5625 },
};

interface GenerationTask {
  type: "restyling" | "format_adaptation" | "art_variation";
  adIndex: number;
  refIndex?: number;
  format?: string;
  creativeLevel?: string;
  label: string;
}

interface GenerationResult {
  task: GenerationTask;
  success: boolean;
  path: string;
  error?: string;
  targetFormat?: string;
  actualDimensions?: string;
  actualAspectRatio?: number;
  targetAspectRatio?: number;
  formatValidation?: "pass" | "fail";
}

async function generateImage(
  openai: OpenAI,
  task: GenerationTask,
  adBuffer: Buffer,
  refBuffer?: Buffer
): Promise<GenerationResult> {
  const outPath = path.join(OUT_DIR, `${task.label}.png`);
  const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const baseResult: GenerationResult = {
    task,
    success: false,
    path: outPath,
    targetFormat: task.format,
  };

  try {
    let prompt: string;
    let imageInput: OpenAI.Images.ImageEditParams["image"];
    let size: OpenAI.Images.ImageEditParams["size"] = "1024x1024";
    let formatCfg: FormatConfig = FORMAT_CONFIG["1:1"];

    if (task.type === "restyling") {
      if (!refBuffer) throw new Error("Restyling requires reference buffer");
      prompt = buildDerivationPrompt({
        generationMode: "restyling",
        campaign: { name: "Test", client: "Test", product: "Education", objective: "Leads", audience: "Young professionals", platforms: ["meta"], tone: "Professional", offer: "Discount", constraints: null, notes: null, status: "active", id: "1", workspaceId: "1", createdAt: new Date(), updatedAt: new Date() },
        ctaText: "INSCREVA-SE",
        targetFormat: "1:1",
        locale: "pt-BR",
        creativeLevel: "medium",
      });
      const tmpBase = path.join(OUT_DIR, `__tmp_base_${uniqueId}.jpg`);
      const tmpStyle = path.join(OUT_DIR, `__tmp_style_${uniqueId}.jpg`);
      fs.writeFileSync(tmpBase, adBuffer);
      fs.writeFileSync(tmpStyle, refBuffer);
      const baseFile = await OpenAI.toFile(fs.createReadStream(tmpBase), "base.jpg", { type: "image/jpeg" });
      const styleFile = await OpenAI.toFile(fs.createReadStream(tmpStyle), "style.jpg", { type: "image/jpeg" });
      imageInput = [baseFile, styleFile];
      fs.unlinkSync(tmpBase);
      fs.unlinkSync(tmpStyle);
    } else if (task.type === "format_adaptation") {
      formatCfg = FORMAT_CONFIG[task.format ?? "1:1"];
      prompt = buildDerivationPrompt({
        generationMode: "format_adaptation",
        campaign: { name: "Test", client: "Test", product: "Education", objective: "Leads", audience: "Young professionals", platforms: ["meta"], tone: "Professional", offer: "Discount", constraints: null, notes: null, status: "active", id: "1", workspaceId: "1", createdAt: new Date(), updatedAt: new Date() },
        ctaText: "INSCREVA-SE",
        targetFormat: task.format!,
        locale: "pt-BR",
      });
      const tmpBase = path.join(OUT_DIR, `__tmp_base_${uniqueId}.jpg`);
      fs.writeFileSync(tmpBase, adBuffer);
      imageInput = await OpenAI.toFile(fs.createReadStream(tmpBase), "base.jpg", { type: "image/jpeg" });
      fs.unlinkSync(tmpBase);
      size = formatCfg.apiSize as OpenAI.Images.ImageEditParams["size"];
    } else {
      // art_variation
      prompt = buildDerivationPrompt({
        generationMode: "art_variation",
        campaign: { name: "Test", client: "Test", product: "Education", objective: "Leads", audience: "Young professionals", platforms: ["meta"], tone: "Professional", offer: "Discount", constraints: null, notes: null, status: "active", id: "1", workspaceId: "1", createdAt: new Date(), updatedAt: new Date() },
        ctaText: "INSCREVA-SE",
        targetFormat: "1:1",
        locale: "pt-BR",
        creativeLevel: task.creativeLevel,
      });
      const tmpBase = path.join(OUT_DIR, `__tmp_base_${uniqueId}.jpg`);
      fs.writeFileSync(tmpBase, adBuffer);
      imageInput = await OpenAI.toFile(fs.createReadStream(tmpBase), "base.jpg", { type: "image/jpeg" });
      fs.unlinkSync(tmpBase);
    }

    const response = await openai.images.edit({
      model: env.OPENAI_IMAGE_MODEL,
      image: imageInput,
      prompt,
      n: 1,
      size,
    });

    let buffer: Buffer;
    const firstData = response.data?.[0];
    if (firstData?.b64_json) {
      buffer = Buffer.from(firstData.b64_json, "base64");
    } else if (firstData?.url) {
      const fetchRes = await fetch(firstData.url);
      buffer = Buffer.from(await fetchRes.arrayBuffer());
    } else {
      throw new Error("No image data in response");
    }

    // Normalize with sharp to exact target dimensions
    const targetW = formatCfg.targetW;
    const targetH = formatCfg.targetH;

    let processed = sharp(buffer);
    const meta = await processed.metadata();
    const currentW = meta.width ?? targetW;
    const currentH = meta.height ?? targetH;
    const currentAspect = currentH > 0 ? currentW / currentH : 0;
    const targetAspect = targetH > 0 ? targetW / targetH : 0;

    if (Math.abs(currentAspect - targetAspect) > 0.001) {
      processed = sharp(buffer).resize(targetW, targetH, { fit: "cover", position: "center" });
    } else {
      processed = sharp(buffer).resize(targetW, targetH, { fit: "fill" });
    }
    const normalized = await processed.png().toBuffer();
    fs.writeFileSync(outPath, normalized);

    // Validate dimensions of saved file
    const savedMeta = await sharp(normalized).metadata();
    const actualW = savedMeta.width ?? 0;
    const actualH = savedMeta.height ?? 0;
    const actualAspectRatio = actualH > 0 ? actualW / actualH : 0;
    const targetAspectRatio = formatCfg.targetAspectRatio;
    const aspectDiff = targetAspectRatio > 0 ? Math.abs(actualAspectRatio - targetAspectRatio) / targetAspectRatio : 0;
    const formatValidation: "pass" | "fail" = aspectDiff <= 0.05 ? "pass" : "fail";

    if (formatValidation === "fail") {
      console.warn(`   ⚠️ ${task.label}: aspect ratio mismatch. Expected ${targetAspectRatio.toFixed(4)}, got ${actualAspectRatio.toFixed(4)} (${actualW}x${actualH})`);
    }

    return {
      ...baseResult,
      success: true,
      actualDimensions: `${actualW}x${actualH}`,
      actualAspectRatio: Number(actualAspectRatio.toFixed(4)),
      targetAspectRatio: Number(targetAspectRatio.toFixed(4)),
      formatValidation,
    };
  } catch (e) {
    return {
      ...baseResult,
      success: false,
      error: String(e),
    };
  }
}

async function main() {
  ensureDir(OUT_DIR);
  console.log("🎨 ADScale Output Generator");
  console.log("============================\n");

  const adFiles = getImageFiles(ADS_DIR).map((f) => path.join(ADS_DIR, f));
  const refFiles = getImageFiles(REFS_DIR).map((f) => path.join(REFS_DIR, f));

  console.log(`📁 ${adFiles.length} ads, ${refFiles.length} references\n`);

  const adBuffers = adFiles.map((f) => fs.readFileSync(f));
  const refBuffers = refFiles.map((f) => fs.readFileSync(f));

  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000 });

  // Build task list
  const tasks: GenerationTask[] = [];

  for (let adIdx = 0; adIdx < adBuffers.length; adIdx++) {
    // Restyling: each ad with refs 0, 1, 2
    for (let refIdx = 0; refIdx < Math.min(3, refBuffers.length); refIdx++) {
      tasks.push({
        type: "restyling",
        adIndex: adIdx,
        refIndex: refIdx,
        label: `ad${adIdx + 1}_restyling_ref${refIdx + 1}`,
      });
    }

    // Format adaptation: 4:5 and 9:16
    tasks.push({
      type: "format_adaptation",
      adIndex: adIdx,
      format: "4:5",
      label: `ad${adIdx + 1}_format_4x5`,
    });
    tasks.push({
      type: "format_adaptation",
      adIndex: adIdx,
      format: "9:16",
      label: `ad${adIdx + 1}_format_9x16`,
    });

    // Art variation: conservative and bold
    tasks.push({
      type: "art_variation",
      adIndex: adIdx,
      creativeLevel: "conservative",
      label: `ad${adIdx + 1}_art_conservative`,
    });
    tasks.push({
      type: "art_variation",
      adIndex: adIdx,
      creativeLevel: "bold",
      label: `ad${adIdx + 1}_art_bold`,
    });
  }

  console.log(`🎯 ${tasks.length} generation tasks queued\n`);

  const results: GenerationResult[] = [];

  // Process in parallel batches of 5
  const BATCH_SIZE = 5;
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE);
    console.log(`🚀 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(tasks.length / BATCH_SIZE)}: ${batch.map((t) => t.label).join(", ")}`);

    const batchResults = await Promise.all(
      batch.map((task) =>
        generateImage(
          openai,
          task,
          adBuffers[task.adIndex],
          task.refIndex !== undefined ? refBuffers[task.refIndex] : undefined
        )
      )
    );

    for (let j = 0; j < batch.length; j++) {
      const res = batchResults[j];
      results.push(res);
      if (res.success) {
        const metaStr = res.formatValidation
          ? ` [${res.actualDimensions} ratio=${res.actualAspectRatio} ${res.formatValidation}]`
          : "";
        console.log(`   ✅ ${batch[j].label}${metaStr}`);
      } else {
        console.log(`   ❌ ${batch[j].label}: ${res.error}`);
      }
    }
  }

  // Generate index HTML
  generateIndexHtml(results, adFiles, refFiles);

  const successCount = results.filter((r) => r.success).length;
  const failValidationCount = results.filter((r) => r.success && r.formatValidation === "fail").length;
  console.log(`\n📊 SUMMARY: ${successCount}/${results.length} generated successfully`);
  if (failValidationCount > 0) {
    console.log(`⚠️  ${failValidationCount} images failed aspect-ratio validation`);
  }
  console.log(`📁 Outputs saved to: ${OUT_DIR}`);
}

function generateIndexHtml(
  results: GenerationResult[],
  adFiles: string[],
  refFiles: string[]
) {
  function fileToDataUri(filePath: string): string {
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  }

  function escapeHtml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  const adResults: Record<number, GenerationResult[]> = {};
  for (let i = 0; i < adFiles.length; i++) adResults[i] = [];
  for (const r of results) adResults[r.task.adIndex].push(r);

  const sections: string[] = [];

  for (let adIdx = 0; adIdx < adFiles.length; adIdx++) {
    const adRes = adResults[adIdx];
    const restyling = adRes.filter((r) => r.task.type === "restyling");
    const formats = adRes.filter((r) => r.task.type === "format_adaptation");
    const arts = adRes.filter((r) => r.task.type === "art_variation");

    sections.push(`
    <div class="ad-section">
      <h2>📢 Ad ${adIdx + 1}: ${escapeHtml(path.basename(adFiles[adIdx]))}</h2>
      <div class="original">
        <p>Original:</p>
        <img src="${fileToDataUri(adFiles[adIdx])}" alt="Original">
      </div>
      
      <h3>🎨 Restyling</h3>
      <div class="grid">
        ${restyling.map((r) => `
        <div class="output-card ${r.success ? "success" : "error"}">
          <p>Style: Ref ${r.task.refIndex! + 1}</p>
          ${r.success ? `<img src="${fileToDataUri(r.path)}" alt="${r.task.label}">` : `<div class="error-msg">${escapeHtml(r.error || "Failed")}</div>`}
          <code>${r.task.label}</code>
        </div>`).join("")}
      </div>

      <h3>📐 Variação de Tamanho</h3>
      <div class="grid">
        ${formats.map((r) => `
        <div class="output-card ${r.success ? (r.formatValidation === "fail" ? "warning" : "success") : "error"}">
          <p>Format: ${r.task.format}</p>
          ${r.success ? `<img src="${fileToDataUri(r.path)}" alt="${r.task.label}">` : `<div class="error-msg">${escapeHtml(r.error || "Failed")}</div>`}
          <code>${r.task.label}</code>
          ${r.success ? `<div class="meta">${r.actualDimensions} | ratio ${r.actualAspectRatio} (target ${r.targetAspectRatio}) — ${r.formatValidation?.toUpperCase()}</div>` : ""}
        </div>`).join("")}
      </div>

      <h3>✨ Variação de Arte</h3>
      <div class="grid">
        ${arts.map((r) => `
        <div class="output-card ${r.success ? "success" : "error"}">
          <p>Level: ${r.task.creativeLevel}</p>
          ${r.success ? `<img src="${fileToDataUri(r.path)}" alt="${r.task.label}">` : `<div class="error-msg">${escapeHtml(r.error || "Failed")}</div>`}
          <code>${r.task.label}</code>
        </div>`).join("")}
      </div>
    </div>
    `);
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ADScale — Todos os Outputs Gerados</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #0f0f23; color: #e0e0e0; }
  .container { max-width: 1600px; margin: 0 auto; padding: 2rem; }
  h1 { color: #60a5fa; font-size: 2.5rem; }
  h2 { color: #34d399; font-size: 1.8rem; margin-top: 3rem; border-bottom: 2px solid #1e3a5f; padding-bottom: 0.5rem; }
  h3 { color: #fbbf24; font-size: 1.2rem; margin-top: 2rem; }
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin: 2rem 0; }
  .summary-card { background: #1a1a2e; border-radius: 12px; padding: 1.5rem; text-align: center; border: 1px solid #2d2d44; }
  .summary-card .number { font-size: 2rem; font-weight: bold; color: #60a5fa; }
  .ad-section { background: #1a1a2e; border-radius: 16px; padding: 2rem; margin: 2rem 0; border: 1px solid #2d2d44; }
  .original { margin: 1rem 0; }
  .original img { max-width: 300px; border-radius: 8px; border: 2px solid #2d2d44; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; margin: 1rem 0; }
  .output-card { background: #0f0f23; border-radius: 12px; padding: 1rem; border: 2px solid #2d2d44; }
  .output-card.success { border-color: #34d399; }
  .output-card.warning { border-color: #fbbf24; }
  .output-card.error { border-color: #f87171; }
  .output-card img { width: 100%; border-radius: 8px; }
  .output-card p { color: #94a3b8; font-size: 0.9rem; margin: 0 0 0.5rem; }
  .output-card code { font-size: 0.75rem; color: #60a5fa; word-break: break-all; }
  .output-card .meta { font-size: 0.7rem; color: #94a3b8; margin-top: 0.5rem; }
  .error-msg { color: #f87171; padding: 2rem; text-align: center; }
</style>
</head>
<body>
<div class="container">
  <h1>🎨 ADScale — Todos os Outputs Gerados</h1>
  <p style="color:#94a3b8">Gerado em ${new Date().toLocaleString("pt-BR")}</p>
  
  <div class="summary">
    <div class="summary-card"><div class="number">${results.filter((r) => r.success).length}</div><div>✅ Sucesso</div></div>
    <div class="summary-card"><div class="number">${results.filter((r) => !r.success).length}</div><div>❌ Falha</div></div>
    <div class="summary-card"><div class="number">${results.filter((r) => r.success && r.formatValidation === "fail").length}</div><div>⚠️ Ratio Fail</div></div>
    <div class="summary-card"><div class="number">${results.length}</div><div>Total</div></div>
  </div>

  ${sections.join("")}
</div>
</body>
</html>`;

  fs.writeFileSync(path.join(OUT_DIR, "index.html"), html);
  console.log(`📄 Index HTML saved to: ${path.join(OUT_DIR, "index.html")}`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
