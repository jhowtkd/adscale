import "./load-env";

import fs from "fs";
import path from "path";
import sharp from "sharp";

import { analyzeImageContent, analyzeImageStyle, ContentBrief, StyleBrief } from "@/server/ai/image-analysis";
import { extractContractFromAd, CreativeContract } from "@/server/ai/creative-contract";
import { analyzeSmartResize } from "@/server/ai/smart-resize";
import { analyzePreflight } from "@/server/ai/preflight-analysis";
import { analyzeDerivationCreative } from "@/server/ai/creative-score";
import { analyzeCreativeDiagnosis } from "@/server/ai/creative-diagnosis";
import { analyzeCreativeQa } from "@/server/ai/creative-qa";
import { simulatePersonas } from "@/server/ai/persona-simulator";
import { analyzeCompetitorCreative } from "@/server/ai/competitor-analyzer";
import { extractBrandKitFromImage } from "@/server/ai/brand-kit-extractor";
import { env } from "@/server/validation/env";
import OpenAI from "openai";
import { buildDerivationPrompt } from "@/server/ai/prompt-builder";
import { getCachedAnalysis } from "@/server/ai/analysis-cache";

// ── Paths ───────────────────────────────────────────────────────────────

const ADS_DIR = "/Users/jhonatan/Desktop/Outputs/Anuncios";
const REFS_DIR = "/Users/jhonatan/Desktop/Outputs/Referencias";
const OUT_DIR = "/Users/jhonatan/Desktop/Outputs/test-results";
const OUTPUTS_DIR = "/Users/jhonatan/Desktop/Outputs/test-results/outputs";

// ── Helpers ─────────────────────────────────────────────────────────────

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getImageFiles(dir: string): string[] {
  return fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
}

async function getImageMeta(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  const metadata = await sharp(buffer).metadata();
  await sharp(buffer).stats();

  // Extract dominant colors by resizing to 1x1 and getting pixel
  const dominant = await sharp(buffer).resize(1, 1).raw().toBuffer();
  const [r, g, b] = [dominant[0], dominant[1], dominant[2]];

  // Get a few sample colors from different regions
  const resized = await sharp(buffer).resize(4, 4).raw().toBuffer();
  const colors: string[] = [];
  for (let i = 0; i < resized.length; i += 3) {
    colors.push(`rgb(${resized[i]},${resized[i + 1]},${resized[i + 2]})`);
  }

  return {
    filePath,
    fileName: path.basename(filePath),
    sizeBytes: buffer.length,
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    hasAlpha: metadata.hasAlpha,
    channels: metadata.channels,
    density: metadata.density,
    dominantColor: `rgb(${r},${g},${b})`,
    sampleColors: [...new Set(colors)],
    aspectRatio: metadata.width && metadata.height ? (metadata.width / metadata.height).toFixed(3) : "unknown",
    mimeType: metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "png" ? "image/png" : `image/${metadata.format}`,
  };
}

function loadImageBuffer(filePath: string): Buffer {
  return fs.readFileSync(filePath);
}



function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Quality Evaluation ──────────────────────────────────────────────────

type QualityStatus = "pass" | "review" | "fail";

interface QualityEvaluation {
  executionStatus: "success" | "error" | "skipped";
  qualityStatus: QualityStatus;
  blockingIssues: string[];
}

function evaluateQuality(test: TestResult): QualityEvaluation {
  const executionStatus = test.status;
  const blockingIssues: string[] = [];

  if (test.status !== "success" || !test.result) {
    return { executionStatus, qualityStatus: "fail", blockingIssues: [test.error || "Execution failed"] };
  }

  const result = test.result as Record<string, unknown>;

  const toStringList = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      return value.map((item) => String(item)).filter(Boolean);
    }
    if (value && typeof value === "object") {
      return Object.values(value).map((item) => String(item)).filter(Boolean);
    }
    if (typeof value === "string") {
      return [value];
    }
    return [];
  };

  // 1. analyzeCreativeQa -> status can be "ready" | "warning" | "review" | "failed"
  if (test.function === "analyzeCreativeQa" || test.function.startsWith("output_qa_")) {
    const qaStatus = (result as { status?: string }).status;
    const issues = toStringList(result.issues);
    if (qaStatus === "failed") {
      blockingIssues.push(`QA failed: ${issues.join("; ") || "unknown issues"}`);
      return { executionStatus, qualityStatus: "fail", blockingIssues };
    }
    if (qaStatus === "review" || qaStatus === "warning") {
      blockingIssues.push(`QA requires review: ${issues.join("; ") || "check needed"}`);
      return { executionStatus, qualityStatus: "review", blockingIssues };
    }
  }

  // 2. analyzeDerivationCreative -> scoreIssues array
  if (test.function === "analyzeDerivationCreative" || test.function.startsWith("output_derivation_")) {
    const scoreIssues = toStringList(result.scoreIssues);
    if (scoreIssues && scoreIssues.length > 0) {
      blockingIssues.push(`Derivation issues: ${scoreIssues.join("; ")}`);
      // If issues mention "crop", "truncate", "missing", "CTA" -> fail, else review
      const criticalWords = ["crop", "truncate", "missing", "cta", "call to action", "illegible", "cut off", "hidden"];
      const hasCritical = scoreIssues.some((issue) => criticalWords.some((w) => issue.toLowerCase().includes(w)));
      if (hasCritical) {
        return { executionStatus, qualityStatus: "fail", blockingIssues };
      }
      return { executionStatus, qualityStatus: "review", blockingIssues };
    }
  }

  // 3. analyzePreflight -> criticalIssues array
  if (test.function === "analyzePreflight") {
    const criticalIssues = (result as { criticalIssues?: string[] }).criticalIssues;
    if (criticalIssues && criticalIssues.length > 0) {
      blockingIssues.push(`Preflight critical: ${criticalIssues.join("; ")}`);
      return { executionStatus, qualityStatus: "fail", blockingIssues };
    }
  }

  // 4. analyzeSmartResize -> crops that may exceed canvas
  if (test.function === "analyzeSmartResize") {
    const validationIssues = toStringList(result.validationIssues);
    if (validationIssues.length > 0) {
      blockingIssues.push(...validationIssues.map((issue) => `SmartResize validation: ${issue}`));
      return { executionStatus, qualityStatus: "fail", blockingIssues };
    }

    const crops = (result as { crops?: Record<string, { x: number; y: number; width: number; height: number }> }).crops;
    if (crops) {
      for (const [ratio, crop] of Object.entries(crops)) {
        if (crop.x < 0 || crop.y < 0 || crop.width < 0 || crop.height < 0) {
          blockingIssues.push(`SmartResize negative crop for ${ratio}`);
        }
        if (crop.x + crop.width > 1.001 || crop.y + crop.height > 1.001) {
          blockingIssues.push(`SmartResize crop exceeds canvas for ${ratio}: x+width=${(crop.x + crop.width).toFixed(3)}, y+height=${(crop.y + crop.height).toFixed(3)}`);
        }
      }
      if (blockingIssues.length > 0) {
        return { executionStatus, qualityStatus: "fail", blockingIssues };
      }
    }
  }

  // 5. validateContract / output_validateContract
  if (test.function === "validateContract" || test.function.startsWith("output_validateContract")) {
    const vr = result as { passed?: boolean; failures?: string[]; warnings?: string[] };
    if (vr && !vr.passed) {
      const issues = [...(vr.failures || []), ...(vr.warnings || [])];
      blockingIssues.push(...issues);
      return { executionStatus, qualityStatus: "fail", blockingIssues };
    }
    // Even if passed=true, warnings should downgrade quality to "review"
    if (vr && vr.warnings && vr.warnings.length > 0) {
      blockingIssues.push(...vr.warnings.map((w) => `Contract warning: ${w}`));
      return { executionStatus, qualityStatus: "review", blockingIssues };
    }
  }

  return { executionStatus, qualityStatus: "pass", blockingIssues };
}

// ── Test Runner ─────────────────────────────────────────────────────────

interface TestResult {
  function: string;
  status: "success" | "error" | "skipped";
  result?: unknown;
  error?: string;
  durationMs: number;
  // Quality evaluation (computed post-run)
  qualityStatus?: QualityStatus;
  blockingIssues?: string[];
}

interface ImageResult {
  meta: Awaited<ReturnType<typeof getImageMeta>>;
  tests: TestResult[];
  // Extracted context from analyzeImageContent
  extractedContext?: {
    product: string;
    offer: string;
    cta: string;
    brandElements: string[];
  };
  // Formal creative contract extracted from the ad
  contract?: CreativeContract;
}

interface OutputResult {
  filePath: string;
  fileName: string;
  adIndex: number;
  outputType: string;
  tests: TestResult[];
}

async function runTest<T>(
  name: string,
  fn: () => Promise<T>
): Promise<TestResult> {
  const start = Date.now();
  try {
    const result = await fn();
    const test: TestResult = { function: name, status: "success", result, durationMs: Date.now() - start };
    const quality = evaluateQuality(test);
    test.qualityStatus = quality.qualityStatus;
    test.blockingIssues = quality.blockingIssues;
    return test;
  } catch (e) {
    const test: TestResult = { function: name, status: "error", error: String(e), durationMs: Date.now() - start };
    const quality = evaluateQuality(test);
    test.qualityStatus = quality.qualityStatus;
    test.blockingIssues = quality.blockingIssues;
    return test;
  }
}

// ── Progress Streaming ──────────────────────────────────────────────────

type ProgressEvent =
  | { type: "ad_started"; adIndex: number; adName: string }
  | { type: "test_completed"; adIndex: number; testName: string; qualityStatus: string }
  | { type: "ad_completed"; adIndex: number; adName: string; qualityStatus: string };

const progressListeners: Array<(event: ProgressEvent) => void> = [];

export function onProgress(listener: (event: ProgressEvent) => void): () => void {
  progressListeners.push(listener);
  return () => {
    const idx = progressListeners.indexOf(listener);
    if (idx !== -1) progressListeners.splice(idx, 1);
  };
}

function emitProgress(event: ProgressEvent): void {
  for (const listener of progressListeners) {
    try {
      listener(event);
    } catch {
      // ignore listener errors
    }
  }
  // Also log to console for backward compatibility
  if (event.type === "ad_started") {
    console.log(`🧪 Testing Ad ${event.adIndex + 1}: ${event.adName}`);
  } else if (event.type === "test_completed") {
    console.log(`   ✅ ${event.testName} completed (${event.qualityStatus})`);
  } else if (event.type === "ad_completed") {
    console.log(`   ✅ ${event.qualityStatus}\n`);
  }
}

// ── Concurrency Limiter ─────────────────────────────────────────────────

async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  concurrency: number
): Promise<void> {
  const executing: Promise<void>[] = [];
  for (let i = 0; i < items.length; i++) {
    const promise = fn(items[i], i).then(() => {
      const idx = executing.indexOf(promise);
      if (idx !== -1) executing.splice(idx, 1);
    });
    executing.push(promise);
    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

// ── Cached Test Runner ──────────────────────────────────────────────────

async function runCachedTest<T>(
  name: string,
  buffer: Buffer,
  fn: () => Promise<T>
): Promise<TestResult> {
  const start = Date.now();
  try {
    const result = await getCachedAnalysis(buffer, name, fn);
    const test: TestResult = { function: name, status: "success", result, durationMs: Date.now() - start };
    const quality = evaluateQuality(test);
    test.qualityStatus = quality.qualityStatus;
    test.blockingIssues = quality.blockingIssues;
    return test;
  } catch (e) {
    const test: TestResult = { function: name, status: "error", error: String(e), durationMs: Date.now() - start };
    const quality = evaluateQuality(test);
    test.qualityStatus = quality.qualityStatus;
    test.blockingIssues = quality.blockingIssues;
    return test;
  }
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  ensureDir(OUT_DIR);
  console.log("🔍 ADScale Creative Test Suite");
  console.log("================================\n");

  const adFiles = getImageFiles(ADS_DIR).map((f) => path.join(ADS_DIR, f));
  const refFiles = getImageFiles(REFS_DIR).map((f) => path.join(REFS_DIR, f));

  console.log(`📁 Found ${adFiles.length} ads and ${refFiles.length} references\n`);

  // ── Load metadata for all images ──
  console.log("📊 Loading image metadata...");
  const adMetas = await Promise.all(adFiles.map(getImageMeta));
  const refMetas = await Promise.all(refFiles.map(getImageMeta));
  console.log("✅ Metadata loaded\n");

  const adResults: ImageResult[] = [];
  const refResults: ImageResult[] = [];

  // ── Test all ads (max 3 concurrent) ──
  await runWithConcurrency(
    adMetas,
    async (meta, i) => {
      emitProgress({ type: "ad_started", adIndex: i, adName: meta.fileName });
      const tests: TestResult[] = [];
      let extractedContext: ImageResult["extractedContext"] | undefined;

      // 1. analyzeImageContent — extract real context first
      let contract: CreativeContract | undefined;

      const buffer = loadImageBuffer(meta.filePath);

      const contentTest = await runCachedTest("analyzeImageContent", buffer, async () => {
        return analyzeImageContent(buffer, meta.mimeType);
      });
      tests.push(contentTest);
      emitProgress({ type: "test_completed", adIndex: i, testName: "analyzeImageContent", qualityStatus: contentTest.qualityStatus || "pass" });

      // Extract context from the returned result (works for both fresh and cached)
      const contentResult = contentTest.result as ContentBrief | undefined;
      const ctx = contentResult
        ? {
            product: contentResult.product,
            offer: contentResult.offer,
            cta: contentResult.cta?.text ?? "INSCREVA-SE",
            brandElements: contentResult.brandElements,
          }
        : { product: "Education Course", offer: "Special discount", cta: "INSCREVA-SE", brandElements: [] };

      // Batch independent tests: analyzeImageStyle, analyzeSmartResize, analyzePreflight
      const [styleTest, smartResizeTest, preflightTest] = await Promise.all([
        runCachedTest("analyzeImageStyle", buffer, async () => analyzeImageStyle(buffer, meta.mimeType)),
        runCachedTest("analyzeSmartResize", buffer, async () =>
          analyzeSmartResize(buffer.toString("base64"))
        ),
        runCachedTest("analyzePreflight", buffer, async () =>
          analyzePreflight({
            assetBuffer: buffer,
            mimeType: meta.mimeType,
            campaignBrief: {
              name: `Test Campaign ${i + 1}`,
              client: ctx.brandElements[0] || "Test Client",
              product: ctx.product,
              objective: "Lead Generation",
              audience: "Young professionals",
              platforms: ["meta_ads", "google_ads"],
              tone: "Professional",
              offer: ctx.offer,
              constraints: null,
              notes: null,
              ctaVariants: [ctx.cta, "SAIBA MAIS"].filter(Boolean),
            },
            locale: "pt-BR",
          })
        ),
      ]);
      tests.push(styleTest, smartResizeTest, preflightTest);
      for (const t of [styleTest, smartResizeTest, preflightTest]) {
        emitProgress({ type: "test_completed", adIndex: i, testName: t.function, qualityStatus: t.qualityStatus || "pass" });
      }

      // Extract Creative Contract from the ad itself
      const styleResult = styleTest.result as StyleBrief | undefined;
      if (contentResult) {
        contract = extractContractFromAd(meta, contentResult, styleResult);
        console.log(`   📋 Contract extracted: CTA=[${contract.ctaVariants.join(", ")}], Offer="${contract.offer}", Product="${contract.productName}"`);
      }

      // Batch 2: vision-based scoring (first 2 ads only) — all independent
      if (i < 2) {
        const [diagnosisTest, derivationTest, qaTest] = await Promise.all([
          runCachedTest("analyzeCreativeDiagnosis", buffer, async () =>
            analyzeCreativeDiagnosis({
              campaign: {
                name: `Test Campaign ${i + 1}`,
                client: ctx.brandElements[0] || "Test Client",
                product: ctx.product,
                objective: "Lead Generation",
                audience: "Young professionals",
                platforms: ["meta_ads"],
                tone: "Professional",
                offer: ctx.offer,
                constraints: null,
                notes: null,
                ctaVariants: [ctx.cta],
              },
              imageBuffer: buffer,
              mimeType: meta.mimeType,
              locale: "pt-BR",
            })
          ),
          runCachedTest("analyzeDerivationCreative", buffer, async () =>
            analyzeDerivationCreative({
              imageBuffer: buffer,
              mimeType: meta.mimeType,
              campaign: {
                name: `Test Campaign ${i + 1}`,
                client: (contract?.clientName ?? ctx.brandElements[0] ?? "Test Client"),
                product: contract?.productName ?? ctx.product,
                offer: contract?.offer ?? ctx.offer,
                objective: "Lead Generation",
                audience: "Young professionals",
              },
              derivation: {
                ctaText: contract?.ctaVariants[0] ?? ctx.cta,
                format: contract?.targetFormats[0] ?? "1:1",
                generationMode: "art_variation",
                feedback: null,
                creativeLevel: "balanced",
              },
              locale: "pt-BR",
            })
          ),
          runCachedTest("analyzeCreativeQa", buffer, async () =>
            analyzeCreativeQa({
              imageBuffer: buffer,
              mimeType: meta.mimeType,
              locale: "pt-BR",
              campaign: {
                name: `Test Campaign ${i + 1}`,
                client: (contract?.clientName ?? ctx.brandElements[0] ?? "Test Client"),
                product: contract?.productName ?? ctx.product,
                offer: contract?.offer ?? ctx.offer,
                objective: "Lead Generation",
                audience: "Young professionals",
                tone: "Professional",
              },
              derivation: {
                ctaText: contract?.ctaVariants[0] ?? ctx.cta,
                format: contract?.targetFormats[0] ?? "1:1",
                generationMode: "art_variation",
              },
            })
          ),
        ]);
        tests.push(diagnosisTest, derivationTest, qaTest);
        for (const t of [diagnosisTest, derivationTest, qaTest]) {
          emitProgress({ type: "test_completed", adIndex: i, testName: t.function, qualityStatus: t.qualityStatus || "pass" });
        }
      }

      // 9. validateContract — sanity check that the ad passes its own contract
      if (contract) {
        const validateTest = await runTest("validateContract", async () => {
          const result = contract!.validateOutput({
            detectedCta: contract!.ctaVariants[0],
            detectedOffer: contract!.offer,
            detectedProduct: contract!.productName,
            hasLogo: contract!.logoRequired,
            hasLegalTerms: contract!.legalTerms.length > 0,
            dimensions: { width: meta.width ?? 0, height: meta.height ?? 0 },
          });
          return result;
        });
        tests.push(validateTest);
        emitProgress({ type: "test_completed", adIndex: i, testName: validateTest.function, qualityStatus: validateTest.qualityStatus || "pass" });
      }

      // simulatePersonas (ad 2 only - index 1)
      if (i === 1) {
        const personaTest = await runTest("simulatePersonas", () =>
          simulatePersonas({
            campaign: {
              objective: "Lead Generation",
              audience: "Young professionals seeking higher education",
              offer: ctx.offer,
              ctaText: ctx.cta,
              tone: "Professional and urgent",
              constraints: null,
              clientName: ctx.brandElements[0] || "Test Client",
              productName: ctx.product,
            },
            creative: { type: "derivation", description: `Ad for ${ctx.product}` },
            locale: "pt-BR",
          })
        );
        tests.push(personaTest);
        emitProgress({ type: "test_completed", adIndex: i, testName: personaTest.function, qualityStatus: personaTest.qualityStatus || "pass" });
      }

      // analyzeCompetitorCreative (ad 3 only - index 2)
      if (i === 2) {
        const competitorTest = await runCachedTest("analyzeCompetitorCreative", buffer, async () =>
          analyzeCompetitorCreative(buffer, meta.mimeType, ctx.product || "FASEC", "meta_ads")
        );
        tests.push(competitorTest);
        emitProgress({ type: "test_completed", adIndex: i, testName: competitorTest.function, qualityStatus: competitorTest.qualityStatus || "pass" });
      }

      // extractBrandKitFromImage (ad 5 only - index 4)
      if (i === 4) {
        const brandKitTest = await runCachedTest("extractBrandKitFromImage", buffer, async () =>
          extractBrandKitFromImage(buffer, meta.mimeType)
        );
        tests.push(brandKitTest);
        emitProgress({ type: "test_completed", adIndex: i, testName: brandKitTest.function, qualityStatus: brandKitTest.qualityStatus || "pass" });
      }

      adResults[i] = { meta, tests, extractedContext: ctx, contract };
      const passed = tests.filter((t) => t.status === "success").length;
      const qualityPass = tests.filter((t) => t.qualityStatus === "pass").length;
      emitProgress({
        type: "ad_completed",
        adIndex: i,
        adName: meta.fileName,
        qualityStatus: `${passed}/${tests.length} tests passed | 🏆 ${qualityPass}/${tests.length} quality pass`,
      });
    },
    3 // max 3 ads concurrent
  );

  // ── Test references (style analysis only, max 3 concurrent) ──
  await runWithConcurrency(
    refMetas,
    async (meta, i) => {
      console.log(`🧪 Testing Ref ${i + 1}: ${meta.fileName} (${meta.width}x${meta.height})`);
      const tests: TestResult[] = [];
      const buffer = loadImageBuffer(meta.filePath);

      const [styleTest, smartResizeTest] = await Promise.all([
        runCachedTest("analyzeImageStyle", buffer, () => analyzeImageStyle(buffer, meta.mimeType)),
        runCachedTest("analyzeSmartResize", buffer, () => analyzeSmartResize(buffer.toString("base64"))),
      ]);
      tests.push(styleTest, smartResizeTest);

      refResults[i] = { meta, tests };
      console.log(`   ✅ ${tests.filter((t) => t.status === "success").length}/${tests.length} tests passed\n`);
    },
    3
  );

  // ── Evaluate generated outputs ──
  console.log("📦 Evaluating generated outputs...");
  const outputResults: OutputResult[] = [];

  if (fs.existsSync(OUTPUTS_DIR)) {
    const outputFiles = getImageFiles(OUTPUTS_DIR)
      .filter((f) => /^ad\d+_/.test(f))
      .map((f) => path.join(OUTPUTS_DIR, f));

    // Process outputs in parallel batches (max 5 concurrent)
    await runWithConcurrency(
      outputFiles,
      async (outPath) => {
        const fileName = path.basename(outPath);
        const match = fileName.match(/^ad(\d+)_(.+?)\.png$/i);
        if (!match) return;

        const adIndex = parseInt(match[1], 10) - 1;
        const outputType = match[2];

        const tests: TestResult[] = [];
        const outMeta = await getImageMeta(outPath);
        const outBuffer = loadImageBuffer(outPath);

        const parentCtx = adResults[adIndex]?.extractedContext;
        const parentContract = adResults[adIndex]?.contract;
        const ctaText = parentContract?.ctaVariants[0] ?? parentCtx?.cta ?? "INSCREVA-SE";
        const product = parentContract?.productName ?? parentCtx?.product ?? "Education Course";
        const offer = parentContract?.offer ?? parentCtx?.offer ?? "Special discount";
        const client = parentContract?.clientName ?? parentCtx?.brandElements?.[0] ?? "Test Client";

        let format = "1:1";
        if (outputType.includes("4x5")) format = "4:5";
        else if (outputType.includes("9x16")) format = "9:16";

        let generationMode = "restyling";
        if (outputType.startsWith("format_")) generationMode = "format_variation";
        else if (outputType.startsWith("art_")) generationMode = "art_variation";

        const creativeLevel = outputType.includes("bold") ? "bold" : outputType.includes("conservative") ? "conservative" : "balanced";

        // Run all 3 QA checks in parallel for this output
        const [derivationTest, qaTest, validateTest] = await Promise.all([
          runTest(`output_derivation_${outputType}`, () =>
            analyzeDerivationCreative({
              imageBuffer: outBuffer,
              mimeType: outMeta.mimeType,
              campaign: { name: `Output Test ${fileName}`, client, product, offer, objective: "Lead Generation", audience: "Young professionals" },
              derivation: { ctaText, format, generationMode, feedback: null, creativeLevel },
              locale: "pt-BR",
            })
          ),
          runTest(`output_qa_${outputType}`, () =>
            analyzeCreativeQa({
              imageBuffer: outBuffer,
              mimeType: outMeta.mimeType,
              locale: "pt-BR",
              campaign: { name: `Output Test ${fileName}`, client, product, offer, objective: "Lead Generation", audience: "Young professionals", tone: "Professional" },
              derivation: { ctaText, format, generationMode },
            })
          ),
          parentContract
            ? runTest(`output_validateContract_${outputType}`, async () => {
                const outputContent = await analyzeImageContent(outBuffer, outMeta.mimeType);
                // Determine expected format from output type
                let expectedFormat: string | undefined;
                if (outputType === "format_4x5") expectedFormat = "4:5";
                else if (outputType === "format_9x16") expectedFormat = "9:16";
                return parentContract.validateOutput({
                  detectedCta: outputContent.cta?.text,
                  detectedOffer: outputContent.offer,
                  detectedProduct: outputContent.product,
                  hasLogo: outputContent.brandElements?.some((el) => /logo|marca|brand/i.test(el)),
                  hasLegalTerms: parentContract.legalTerms.length > 0
                    ? parentContract.legalTerms.some((term) =>
                        [outputContent.offer, outputContent.textContent?.headline, ...(outputContent.textContent?.bullets ?? [])]
                          .filter((t): t is string => typeof t === "string")
                          .join(" ")
                          .toLowerCase()
                          .includes(term.toLowerCase())
                      )
                    : undefined,
                  dimensions: { width: outMeta.width ?? 0, height: outMeta.height ?? 0 },
                }, expectedFormat);
              })
            : Promise.resolve(null),
        ]);

        tests.push(derivationTest, qaTest);
        if (validateTest) tests.push(validateTest);

        outputResults.push({ filePath: outPath, fileName, adIndex, outputType, tests });
        const qualityPass = tests.filter((t) => t.qualityStatus === "pass").length;
        console.log(`   🔍 QA on ${fileName}... 🏆 ${qualityPass}/${tests.length} quality pass`);
      },
      5
    );
  }
  console.log("");

  // ── Restyling Test (Ad 1 + Ref 1) ──
  console.log("🎨 Running Restyling Test (Ad 1 + Ref 1)...");
  let restylingResult: TestResult | null = null;
  let restylingOutputPath: string | null = null;

  try {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000 });
    const baseBuffer = loadImageBuffer(adMetas[0].filePath);
    const styleBuffer = loadImageBuffer(refMetas[0].filePath);

    // Create temp files for OpenAI SDK (it needs file paths)
    const tmpBase = path.join(OUT_DIR, "tmp_base.jpg");
    const tmpStyle = path.join(OUT_DIR, "tmp_style.jpg");
    fs.writeFileSync(tmpBase, baseBuffer);
    fs.writeFileSync(tmpStyle, styleBuffer);

    const baseFile = await OpenAI.toFile(fs.createReadStream(tmpBase), "base.jpg", { type: "image/jpeg" });
    const styleFile = await OpenAI.toFile(fs.createReadStream(tmpStyle), "style.jpg", { type: "image/jpeg" });

    const ad1Ctx = adResults[0]?.extractedContext;

    const prompt = buildDerivationPrompt({
      generationMode: "restyling",
      campaign: {
        id: "test-campaign",
        workspaceId: "test-workspace",
        name: "Test Restyling",
        client: ad1Ctx?.brandElements?.[0] || "Test Client",
        product: ad1Ctx?.product || "Education Course",
        offer: ad1Ctx?.offer || "Special discount",
        objective: "Lead Generation",
        audience: "Young professionals",
        platforms: ["meta_ads"],
        tone: "Professional",
        constraints: null,
        notes: null,
        status: "draft",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      ctaText: ad1Ctx?.cta || "INSCREVA-SE",
      targetFormat: "1:1",
      preflightResult: null,
      creativeDiagnosis: null,
      competitorAnalyses: null,
      brandKit: null,
      locale: "pt-BR",
    });

    const start = Date.now();
    const response = await openai.images.edit({
      model: env.OPENAI_IMAGE_MODEL,
      image: [baseFile, styleFile],
      prompt,
      n: 1,
      size: "1024x1024",
    });

    let outputBuffer: Buffer;
    const firstData = response.data?.[0];
    if (firstData?.b64_json) {
      outputBuffer = Buffer.from(firstData.b64_json, "base64");
    } else if (firstData?.url) {
      const fetchRes = await fetch(firstData.url);
      outputBuffer = Buffer.from(await fetchRes.arrayBuffer());
    } else {
      throw new Error("No image data in restyling response");
    }

    restylingOutputPath = path.join(OUT_DIR, "restyling_output.png");
    fs.writeFileSync(restylingOutputPath, outputBuffer);

    // Normalize with sharp
    const normalized = await sharp(outputBuffer)
      .resize(1024, 1024, { fit: "inside" })
      .png()
      .toBuffer();
    fs.writeFileSync(restylingOutputPath, normalized);

    restylingResult = {
      function: "restyling (openai.images.edit)",
      status: "success",
      result: { outputPath: restylingOutputPath, size: normalized.length, dimensions: "1024x1024" },
      durationMs: Date.now() - start,
      qualityStatus: "pass",
      blockingIssues: [],
    };

    // Cleanup temp files
    fs.unlinkSync(tmpBase);
    fs.unlinkSync(tmpStyle);

    console.log("   ✅ Restyling completed\n");
  } catch (e) {
    restylingResult = {
      function: "restyling (openai.images.edit)",
      status: "error",
      error: String(e),
      durationMs: 0,
      qualityStatus: "fail",
      blockingIssues: [String(e)],
    };
    console.log(`   ❌ Restyling failed: ${e}\n`);
  }

  // ── Generate HTML Report ──
  console.log("📄 Generating HTML report...");
  const html = generateHtmlReport(adResults, refResults, outputResults, restylingResult, restylingOutputPath);
  const reportPath = path.join(OUT_DIR, "report.html");
  fs.writeFileSync(reportPath, html);
  console.log(`✅ Report saved to: ${reportPath}\n`);

  // ── Summary ──
  const allTests = [
    ...adResults.flatMap((a) => a.tests),
    ...refResults.flatMap((r) => r.tests),
    ...outputResults.flatMap((o) => o.tests),
    ...(restylingResult ? [restylingResult] : []),
  ];

  const totalTests = allTests.length;
  const passedTests = allTests.filter((t) => t.status === "success").length;
  const qualityPass = allTests.filter((t) => t.qualityStatus === "pass").length;
  const qualityReview = allTests.filter((t) => t.qualityStatus === "review").length;
  const qualityFail = allTests.filter((t) => t.qualityStatus === "fail").length;

  console.log("📊 SUMMARY");
  console.log("=========");
  console.log(`Total tests: ${totalTests}`);
  console.log(`Execution: ${passedTests}/${totalTests} passed`);
  console.log(`Quality: ${qualityPass}/${totalTests} approved`);
  console.log(`Requires review: ${qualityReview}/${totalTests}`);
  console.log(`Blocked: ${qualityFail}/${totalTests}`);
  console.log(`Execution success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log(`Quality pass rate: ${totalTests > 0 ? ((qualityPass / totalTests) * 100).toFixed(1) : 0}%`);

  // Save raw JSON too — strip buffers to avoid huge files
  const serializable = {
    adResults: adResults.map((a) => ({
      meta: a.meta,
      tests: a.tests.map((t) => ({
        function: t.function,
        status: t.status,
        qualityStatus: t.qualityStatus,
        blockingIssues: t.blockingIssues,
        durationMs: t.durationMs,
        error: t.error,
        // Don't include full result objects if they contain buffers
        resultSummary: summarizeResultForJson(t.result),
      })),
      extractedContext: a.extractedContext,
    })),
    refResults: refResults.map((r) => ({
      meta: r.meta,
      tests: r.tests.map((t) => ({
        function: t.function,
        status: t.status,
        qualityStatus: t.qualityStatus,
        blockingIssues: t.blockingIssues,
        durationMs: t.durationMs,
        error: t.error,
        resultSummary: summarizeResultForJson(t.result),
      })),
    })),
    outputResults: outputResults.map((o) => ({
      fileName: o.fileName,
      adIndex: o.adIndex,
      outputType: o.outputType,
      tests: o.tests.map((t) => ({
        function: t.function,
        status: t.status,
        qualityStatus: t.qualityStatus,
        blockingIssues: t.blockingIssues,
        durationMs: t.durationMs,
        error: t.error,
        resultSummary: summarizeResultForJson(t.result),
      })),
    })),
    restylingResult: restylingResult
      ? {
          function: restylingResult.function,
          status: restylingResult.status,
          qualityStatus: restylingResult.qualityStatus,
          blockingIssues: restylingResult.blockingIssues,
          durationMs: restylingResult.durationMs,
          error: restylingResult.error,
        }
      : null,
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "results.json"),
    JSON.stringify(serializable, null, 2)
  );
}

function summarizeResultForJson(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const obj = result as Record<string, unknown>;
  // If result contains buffer-like fields, strip them
  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value instanceof Buffer) {
      stripped[key] = `<Buffer ${value.length} bytes>`;
    } else if (typeof value === "object" && value !== null) {
      stripped[key] = summarizeResultForJson(value);
    } else {
      stripped[key] = value;
    }
  }
  return stripped;
}

// ── HTML Report Generator ───────────────────────────────────────────────

function generateHtmlReport(
  adResults: ImageResult[],
  refResults: ImageResult[],
  outputResults: OutputResult[],
  restylingResult: TestResult | null,
  restylingOutputPath: string | null
): string {
  const allTests = [
    ...adResults.flatMap((a) => a.tests.map((t) => ({ ...t, imageName: a.meta.fileName, type: "ad" as const }))),
    ...refResults.flatMap((r) => r.tests.map((t) => ({ ...t, imageName: r.meta.fileName, type: "ref" as const }))),
    ...outputResults.flatMap((o) => o.tests.map((t) => ({ ...t, imageName: o.fileName, type: "output" as const }))),
    ...(restylingResult ? [{ ...restylingResult, imageName: "Restyling", type: "restyling" as const }] : []),
  ];

  const passed = allTests.filter((t) => t.status === "success").length;
  const failed = allTests.filter((t) => t.status === "error").length;

  const qualityPass = allTests.filter((t) => t.qualityStatus === "pass").length;
  const qualityReview = allTests.filter((t) => t.qualityStatus === "review").length;
  const qualityFail = allTests.filter((t) => t.qualityStatus === "fail").length;

  const bugs: { function: string; image: string; error: string; qualityStatus: string }[] = [];
  for (const t of allTests) {
    if (t.status === "error" && t.error) {
      bugs.push({ function: t.function, image: t.imageName, error: t.error, qualityStatus: t.qualityStatus || "fail" });
    } else if (t.qualityStatus === "fail" || t.qualityStatus === "review") {
      bugs.push({
        function: t.function,
        image: t.imageName,
        error: t.blockingIssues?.join("; ") || "Quality issue",
        qualityStatus: t.qualityStatus,
      });
    }
  }

  function renderJson(obj: unknown): string {
    return `<pre class="json">${escapeHtml(JSON.stringify(obj, null, 2))}</pre>`;
  }

  function imageToRelPath(filePath: string): string {
    // Relative from the report's output directory
    return path.relative(OUT_DIR, filePath).replace(/\\/g, "/");
  }

  function qualityBadge(status?: string): string {
    switch (status) {
      case "pass": return `<span class="badge quality-pass">✓ PASS</span>`;
      case "review": return `<span class="badge quality-review">⚠ REVIEW</span>`;
      case "fail": return `<span class="badge quality-fail">✗ FAIL</span>`;
      default: return `<span class="badge quality-unknown">?</span>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ADScale Creative Test Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #0f0f23; color: #e0e0e0; line-height: 1.6; }
  .container { max-width: 1400px; margin: 0 auto; padding: 2rem; }
  h1 { color: #60a5fa; font-size: 2.5rem; margin-bottom: 0.5rem; }
  h2 { color: #34d399; font-size: 1.8rem; margin-top: 2.5rem; border-bottom: 2px solid #1e3a5f; padding-bottom: 0.5rem; }
  h3 { color: #fbbf24; font-size: 1.3rem; margin-top: 1.5rem; }
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 2rem 0; }
  .summary-card { background: #1a1a2e; border-radius: 12px; padding: 1.5rem; text-align: center; border: 1px solid #2d2d44; }
  .summary-card .number { font-size: 2.5rem; font-weight: bold; }
  .summary-card.pass .number { color: #34d399; }
  .summary-card.fail .number { color: #f87171; }
  .summary-card.total .number { color: #60a5fa; }
  .summary-card.rate .number { color: #fbbf24; }
  .summary-card.review .number { color: #fbbf24; }
  .summary-card.blocked .number { color: #f87171; }
  .image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; margin: 1.5rem 0; }
  .image-card { background: #1a1a2e; border-radius: 12px; overflow: hidden; border: 1px solid #2d2d44; }
  .image-card img { width: 100%; height: 200px; object-fit: cover; display: block; }
  .image-card .info { padding: 1rem; }
  .image-card .name { font-weight: bold; color: #60a5fa; font-size: 0.9rem; word-break: break-all; }
  .image-card .meta { font-size: 0.8rem; color: #94a3b8; margin-top: 0.5rem; }
  .test-section { background: #1a1a2e; border-radius: 12px; padding: 1.5rem; margin: 1rem 0; border: 1px solid #2d2d44; }
  .test-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem; }
  .test-name { font-weight: bold; color: #e0e0e0; font-size: 1.1rem; }
  .badge { padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.75rem; font-weight: bold; text-transform: uppercase; }
  .badge.success { background: #064e3b; color: #34d399; }
  .badge.error { background: #7f1d1d; color: #f87171; }
  .badge.skipped { background: #4b5563; color: #9ca3af; }
  .badge.quality-pass { background: #064e3b; color: #34d399; }
  .badge.quality-review { background: #78350f; color: #fbbf24; }
  .badge.quality-fail { background: #7f1d1d; color: #f87171; }
  .duration { font-size: 0.8rem; color: #94a3b8; }
  pre.json { background: #0f0f23; border: 1px solid #2d2d44; border-radius: 8px; padding: 1rem; overflow-x: auto; font-size: 0.8rem; color: #c4b5fd; max-height: 400px; }
  .bug-list { background: #1a1a2e; border-radius: 12px; padding: 1.5rem; border: 1px solid #7f1d1d; }
  .bug-item { background: #0f0f23; border-radius: 8px; padding: 1rem; margin: 0.5rem 0; border-left: 4px solid #f87171; }
  .bug-item.review { border-left-color: #fbbf24; }
  .bug-function { color: #fbbf24; font-weight: bold; }
  .bug-image { color: #60a5fa; font-size: 0.9rem; }
  .bug-error { color: #f87171; font-family: monospace; font-size: 0.85rem; margin-top: 0.5rem; }
  .bug-error.review { color: #fbbf24; }
  .comparison { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin: 1rem 0; }
  .comparison img { width: 100%; border-radius: 8px; border: 2px solid #2d2d44; }
  .comparison-label { text-align: center; color: #94a3b8; font-size: 0.85rem; margin-top: 0.5rem; }
  .color-swatch { display: inline-block; width: 20px; height: 20px; border-radius: 4px; border: 1px solid #fff; margin-right: 4px; vertical-align: middle; }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
  th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #2d2d44; }
  th { color: #60a5fa; font-weight: bold; }
  td { color: #e0e0e0; }
  .restyling-output { text-align: center; margin: 2rem 0; }
  .restyling-output img { max-width: 500px; border-radius: 12px; border: 2px solid #34d399; }
  .output-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1rem; margin: 1rem 0; }
  .output-card { background: #1a1a2e; border-radius: 12px; overflow: hidden; border: 1px solid #2d2d44; padding: 1rem; }
  .output-card img { width: 100%; height: 180px; object-fit: cover; border-radius: 8px; display: block; }
  .quality-bar { display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap; }
</style>
</head>
<body>
<div class="container">
  <h1>🧪 ADScale Creative Test Report</h1>
  <p style="color:#94a3b8">Generated on ${new Date().toLocaleString("pt-BR")}</p>

  <h2>📊 Execution Summary</h2>
  <div class="summary">
    <div class="summary-card total"><div class="number">${allTests.length}</div><div>Total Tests</div></div>
    <div class="summary-card pass"><div class="number">${passed}</div><div>Passed</div></div>
    <div class="summary-card fail"><div class="number">${failed}</div><div>Failed</div></div>
    <div class="summary-card rate"><div class="number">${allTests.length > 0 ? ((passed / allTests.length) * 100).toFixed(1) : 0}%</div><div>Execution Rate</div></div>
  </div>

  <h2>🏆 Quality Summary</h2>
  <div class="summary">
    <div class="summary-card total"><div class="number">${allTests.length}</div><div>Total Evaluated</div></div>
    <div class="summary-card pass"><div class="number">${qualityPass}</div><div>Approved</div></div>
    <div class="summary-card review"><div class="number">${qualityReview}</div><div>Requires Review</div></div>
    <div class="summary-card blocked"><div class="number">${qualityFail}</div><div>Blocked</div></div>
    <div class="summary-card rate"><div class="number">${allTests.length > 0 ? ((qualityPass / allTests.length) * 100).toFixed(1) : 0}%</div><div>Quality Pass Rate</div></div>
  </div>

  <h2>📸 Creative Assets Overview</h2>
  <h3>Ads (${adResults.length})</h3>
  <div class="image-grid">
    ${adResults.map((a) => `
    <div class="image-card">
      <img src="${imageToRelPath(a.meta.filePath)}" alt="${escapeHtml(a.meta.fileName)}">
      <div class="info">
        <div class="name">${escapeHtml(a.meta.fileName)}</div>
        <div class="meta">
          ${a.meta.width}×${a.meta.height}px • ${(a.meta.sizeBytes / 1024).toFixed(1)}KB • ${a.meta.format}<br>
          Aspect: ${a.meta.aspectRatio} • Channels: ${a.meta.channels}<br>
          <span class="color-swatch" style="background:${a.meta.dominantColor}"></span>Dominant: ${a.meta.dominantColor}
          ${a.extractedContext ? `<br><strong>Product:</strong> ${escapeHtml(a.extractedContext.product)}<br><strong>CTA:</strong> ${escapeHtml(a.extractedContext.cta)}` : ""}
        </div>
      </div>
    </div>`).join("")}
  </div>

  <h3>References (${refResults.length})</h3>
  <div class="image-grid">
    ${refResults.map((r) => `
    <div class="image-card">
      <img src="${imageToRelPath(r.meta.filePath)}" alt="${escapeHtml(r.meta.fileName)}">
      <div class="info">
        <div class="name">${escapeHtml(r.meta.fileName)}</div>
        <div class="meta">
          ${r.meta.width}×${r.meta.height}px • ${(r.meta.sizeBytes / 1024).toFixed(1)}KB • ${r.meta.format}<br>
          Aspect: ${r.meta.aspectRatio}<br>
          <span class="color-swatch" style="background:${r.meta.dominantColor}"></span>Dominant: ${r.meta.dominantColor}
        </div>
      </div>
    </div>`).join("")}
  </div>

  <h3>Generated Outputs (${outputResults.length})</h3>
  <div class="output-grid">
    ${outputResults.map((o) => `
    <div class="output-card">
      <img src="${imageToRelPath(o.filePath)}" alt="${escapeHtml(o.fileName)}">
      <div class="info">
        <div class="name">${escapeHtml(o.fileName)}</div>
        <div class="meta">Parent: Ad ${o.adIndex + 1} • Type: ${escapeHtml(o.outputType)}</div>
        <div class="quality-bar">
          ${o.tests.map((t) => `${qualityBadge(t.qualityStatus)}`).join(" ")}
        </div>
      </div>
    </div>`).join("")}
  </div>

  <h2>📊 Technical Analysis Summary</h2>
  <table>
    <thead><tr><th>Image</th><th>Dimensions</th><th>Format</th><th>Size</th><th>Aspect</th><th>Dominant Color</th></tr></thead>
    <tbody>
      ${adResults.map((a) => `<tr><td>Ad: ${escapeHtml(a.meta.fileName)}</td><td>${a.meta.width}×${a.meta.height}</td><td>${a.meta.format}</td><td>${(a.meta.sizeBytes / 1024).toFixed(1)}KB</td><td>${a.meta.aspectRatio}</td><td><span class="color-swatch" style="background:${a.meta.dominantColor}"></span>${a.meta.dominantColor}</td></tr>`).join("")}
      ${refResults.map((r) => `<tr><td>Ref: ${escapeHtml(r.meta.fileName)}</td><td>${r.meta.width}×${r.meta.height}</td><td>${r.meta.format}</td><td>${(r.meta.sizeBytes / 1024).toFixed(1)}KB</td><td>${r.meta.aspectRatio}</td><td><span class="color-swatch" style="background:${r.meta.dominantColor}"></span>${r.meta.dominantColor}</td></tr>`).join("")}
    </tbody>
  </table>

  <h2>🧪 Function Test Results</h2>
  ${adResults.map((a, idx) => `
    <h3>Ad ${idx + 1}: ${escapeHtml(a.meta.fileName)}</h3>
    ${a.tests.map((t) => `
    <div class="test-section">
      <div class="test-header">
        <span class="test-name">${escapeHtml(t.function)}</span>
        <span>
          <span class="badge ${t.status}">${t.status}</span>
          ${qualityBadge(t.qualityStatus)}
        </span>
      </div>
      <div class="duration">⏱️ ${t.durationMs}ms</div>
      ${t.blockingIssues && t.blockingIssues.length > 0 ? `<div style="color:#f87171;font-size:0.85rem;margin:0.5rem 0">⚠️ ${escapeHtml(t.blockingIssues.join("; "))}</div>` : ""}
      ${t.status === "success" ? renderJson(t.result) : `<div class="bug-error">${escapeHtml(t.error || "")}</div>`}
    </div>`).join("")}
  `).join("")}

  ${refResults.map((r, idx) => `
    <h3>Ref ${idx + 1}: ${escapeHtml(r.meta.fileName)}</h3>
    ${r.tests.map((t) => `
    <div class="test-section">
      <div class="test-header">
        <span class="test-name">${escapeHtml(t.function)}</span>
        <span>
          <span class="badge ${t.status}">${t.status}</span>
          ${qualityBadge(t.qualityStatus)}
        </span>
      </div>
      <div class="duration">⏱️ ${t.durationMs}ms</div>
      ${t.blockingIssues && t.blockingIssues.length > 0 ? `<div style="color:#f87171;font-size:0.85rem;margin:0.5rem 0">⚠️ ${escapeHtml(t.blockingIssues.join("; "))}</div>` : ""}
      ${t.status === "success" ? renderJson(t.result) : `<div class="bug-error">${escapeHtml(t.error || "")}</div>`}
    </div>`).join("")}
  `).join("")}

  ${outputResults.map((o, idx) => `
    <h3>Output ${idx + 1}: ${escapeHtml(o.fileName)}</h3>
    ${o.tests.map((t) => `
    <div class="test-section">
      <div class="test-header">
        <span class="test-name">${escapeHtml(t.function)}</span>
        <span>
          <span class="badge ${t.status}">${t.status}</span>
          ${qualityBadge(t.qualityStatus)}
        </span>
      </div>
      <div class="duration">⏱️ ${t.durationMs}ms</div>
      ${t.blockingIssues && t.blockingIssues.length > 0 ? `<div style="color:#f87171;font-size:0.85rem;margin:0.5rem 0">⚠️ ${escapeHtml(t.blockingIssues.join("; "))}</div>` : ""}
      ${t.status === "success" ? renderJson(t.result) : `<div class="bug-error">${escapeHtml(t.error || "")}</div>`}
    </div>`).join("")}
  `).join("")}

  <h2>🎨 Restyling Test</h2>
  <div class="test-section">
    <div class="test-header">
      <span class="test-name">Restyling (Ad 1 + Ref 1)</span>
      <span>
        <span class="badge ${restylingResult?.status || "skipped"}">${restylingResult?.status || "skipped"}</span>
        ${qualityBadge(restylingResult?.qualityStatus)}
      </span>
    </div>
    <div class="duration">⏱️ ${restylingResult?.durationMs || 0}ms</div>
    ${restylingResult?.blockingIssues && restylingResult.blockingIssues.length > 0 ? `<div style="color:#f87171;font-size:0.85rem;margin:0.5rem 0">⚠️ ${escapeHtml(restylingResult.blockingIssues.join("; "))}</div>` : ""}
    ${restylingResult?.status === "success" && restylingOutputPath ? `
    <div class="comparison">
      <div>
        <img src="${imageToRelPath(adResults[0].meta.filePath)}" alt="Base">
        <div class="comparison-label">Base (Ad 1)</div>
      </div>
      <div>
        <img src="${imageToRelPath(refResults[0].meta.filePath)}" alt="Style">
        <div class="comparison-label">Style (Ref 1)</div>
      </div>
      <div>
        <img src="${imageToRelPath(restylingOutputPath)}" alt="Output">
        <div class="comparison-label">Restyled Output</div>
      </div>
    </div>
    ` : `<div class="bug-error">${escapeHtml(restylingResult?.error || "Not executed")}</div>`}
  </div>

  <h2>🐛 Bugs & Issues Identified</h2>
  ${bugs.length === 0 ? `<p style="color:#34d399;font-size:1.2rem">✅ No bugs found! All tests passed successfully.</p>` : `
  <div class="bug-list">
    <p style="color:#f87171;font-weight:bold">${bugs.length} issue(s) found:</p>
    ${bugs.map((b) => `
    <div class="bug-item ${b.qualityStatus === "review" ? "review" : ""}">
      <div class="bug-function">🔧 ${escapeHtml(b.function)}</div>
      <div class="bug-image">📷 ${escapeHtml(b.image)}</div>
      <div class="bug-error ${b.qualityStatus === "review" ? "review" : ""}">${b.qualityStatus === "review" ? "⚠️ REVIEW: " : "❌ "}${escapeHtml(b.error)}</div>
    </div>`).join("")}
  </div>`}

</div>
</body>
</html>`;
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
