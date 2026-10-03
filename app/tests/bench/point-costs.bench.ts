// Ticket 19, phase 1: cost per point, before (`main`'s frozen modules, sharp in the server) and after (the working tree), one clean process per fixture and mode.
// Points: measureImageBuffer (clock fixed), normalizeImageForAi, inspectUsableTransparency and analyzePreflight (fake vendor). For each: elapsed, RSS base/peak, and a digest of
// what came out (so the evidence also says "same result"), or the error. Fixtures are written by another process. Evidence, not an assertion: nothing fails on time or memory.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { it, vi } from "vitest";

const MODE = process.env.BENCH_MODE === "before" ? "before" : "after";
const SCENARIO = process.env.BENCH_SCENARIO ?? "";
const FIXTURES = process.env.BENCH_FIXTURES ?? "";
const OUT = process.env.BENCH_OUT ?? "";
const vendorRequests: unknown[] = [];
vi.mock("@/server/ai/utils", () => ({
  getOpenAI: () => ({ responses: { create: async (request: unknown) => { vendorRequests.push(request); return { output_text: JSON.stringify({ overallScore: 71, breakdown: {}, suggestions: [] }) }; } } }),
  extractOutputText: (response: { output_text?: string }) => response.output_text,
}));

const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex").slice(0, 16);
const mb = (bytes: number) => Math.round((bytes / 1048576) * 10) / 10;
const FIXED_CLOCK = () => new Date("2026-10-03T12:00:00.000Z");
type Point = { point: string; run: () => Promise<string> };

/** Runs `count` calls of one point at once with RSS sampled every 2 ms. */
async function observe(point: Point, count: number) {
  const base = process.memoryUsage.rss();
  let peak = base;
  const sampler = setInterval(() => { peak = Math.max(peak, process.memoryUsage.rss()); }, 2);
  const outcomes = await Promise.all(Array.from({ length: count }, async () => {
    const started = performance.now();
    try { const result = await point.run(); return { ms: Math.round(performance.now() - started), result }; }
    catch (error) { return { ms: Math.round(performance.now() - started), error: `${(error as Error).name}: ${(error as Error).message}`.slice(0, 120) }; }
  }));
  clearInterval(sampler);
  peak = Math.max(peak, process.memoryUsage.rss());
  return { baseRssMb: mb(base), peakRssMb: mb(peak), outcomes };
}

it(`point costs: ${SCENARIO} (${MODE})`, async () => {
  const manifest = JSON.parse(readFileSync(path.join(FIXTURES, "manifest.json"), "utf8")) as Record<string, { file: string; type: string; describes: string }>;
  const entry = manifest[SCENARIO];
  if (!entry || !/^image\/(png|jpeg|webp)$/.test(entry.type)) throw new Error(`not a raster scenario: ${SCENARIO}`);
  const bytes = readFileSync(path.join(FIXTURES, entry.file));
  const load = async <T>(oracle: string, real: string) => (MODE === "before" ? await import(`../fixtures/classic-raster-main/${oracle}`) : await import(real)) as T;
  const measure = await load<{ measureImageBuffer: (b: Buffer, o?: object) => Promise<unknown> }>("measure-image", "@/server/brand-training/measure-image");
  const normalize = await load<{ normalizeImageForAi: (i: { buffer: Buffer }) => Promise<{ buffer: Buffer; width: number; height: number; mimeType: string }>; inspectUsableTransparency: (b: Buffer) => Promise<boolean> }>("normalize-image-for-ai", "@/server/ai/normalize-image-for-ai");
  const preflight = await load<{ analyzePreflight: (i: object) => Promise<unknown> }>("preflight-analysis", "@/server/ai/preflight-analysis");
  const loaded = process.report.getReport().sharedObjects.some(object => /sharp|vips/i.test(object));
  const startRssMb = mb(process.memoryUsage.rss());
  const points: Point[] = [
    { point: "measureImageBuffer", run: async () => digest(JSON.stringify(await measure.measureImageBuffer(Buffer.from(bytes), { now: FIXED_CLOCK, colorTargets: [{ hex: "#071522" }, { hex: "#FFC914" }, { hex: "#FFFFFF" }] }))) },
    { point: "normalizeImageForAi", run: async () => { const r = await normalize.normalizeImageForAi({ buffer: Buffer.from(bytes) }); return `${r.mimeType} ${r.width}x${r.height} ${r.buffer.length}B ${digest(r.buffer)}`; } },
    { point: "inspectUsableTransparency", run: async () => String(await normalize.inspectUsableTransparency(Buffer.from(bytes))) },
    { point: "analyzePreflight (fake vendor)", run: async () => { vendorRequests.length = 0; await preflight.analyzePreflight({ assetBuffer: Buffer.from(bytes), mimeType: entry.type, claimedWidth: 1080, claimedHeight: 1350 }); return digest(JSON.stringify(vendorRequests)); } },
  ];
  const results = [];
  for (const point of points) {
    const first = await observe(point, 1), second = await observe(point, 1), eight = await observe(point, 8);
    results.push({ point: point.point, reading1: { ...first, ...first.outcomes[0] }, reading2: { baseRssMb: second.baseRssMb, peakRssMb: second.peakRssMb, ...second.outcomes[0] }, eightTogether: { baseRssMb: eight.baseRssMb, peakRssMb: eight.peakRssMb, msEach: eight.outcomes.map(o => o.ms), results: [...new Set(eight.outcomes.map(o => o.result ?? o.error))] } });
  }
  writeFileSync(OUT, JSON.stringify({ scenario: SCENARIO, mode: MODE, describes: entry.describes, fileBytes: bytes.length, sharpInServerProcess: loaded, startRssMb, points: results }, null, 2));
});
