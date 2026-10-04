import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { Inngest } from "inngest";
import { serve } from "inngest/edge";
import { createCreativeWorkSourceAnalyzeJobV2 } from "@/server/jobs/creative-work-source";
import { RasterImageRejected, RasterRetryError } from "@/server/equipe/handoff/raster-image";

const getCreativeWork = vi.hoisted(() => vi.fn());
const getWorkspaceAssetById = vi.hoisted(() => vi.fn());
const getTemplateById = vi.hoisted(() => vi.fn());
const updateCreativeWorkSourceIfUnchanged = vi.hoisted(() => vi.fn());
const getObject = vi.hoisted(() => vi.fn());
const analyzeImageContent = vi.hoisted(() => vi.fn());
const analyzeImageStyle = vi.hoisted(() => vi.fn());
const normalizeImageForAi = vi.hoisted(() => vi.fn());
const inspectUsableTransparency = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({ getCreativeWork, updateCreativeWorkSourceIfUnchanged }));
vi.mock("@/server/repositories/workspace-asset", () => ({ getWorkspaceAssetById }));
vi.mock("@/server/repositories/template", () => ({ getTemplateById }));
vi.mock("@/server/storage", () => ({ objectStorage: { get: getObject } }));
vi.mock("@/server/ai/normalize-image-for-ai", () => ({
  normalizeImageForAi: (...args: unknown[]) => normalizeImageForAi(...args),
  inspectUsableTransparency: (...args: unknown[]) => inspectUsableTransparency(...args),
}));
vi.mock("@/server/ai/image-analysis", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/ai/image-analysis")>(),
  analyzeImageContent,
  analyzeImageStyle,
}));

import { NonRetriableError, RetryAfterError } from "inngest";
import { analyzeCreativeWorkSource, SOURCE_ANALYSIS_MAX_ATTEMPTS, type SourceAnalysisExecution } from "./analyze-creative-work-source";

const content = {
  product: "Tênis", offer: "20%", cta: { text: "Comprar", style: "botão" },
  brandElements: ["logo"], keyVisual: "produto", textContent: { headline: "Novo", bullets: [] }, format: "4:5",
};
const style = {
  colorPalette: { dominant: ["azul"], accents: ["branco"], gradients: "nenhum" },
  typography: { personality: "bold", effects: [] }, textures: [], composition: "central",
  mood: "energético", decorativeElements: [], photoTreatment: "alto contraste",
};

function source(id: string, usage: "content" | "style" | "both") {
  return { id, workspaceId: "ws-1", workItemId: "work-1", assetId: `asset-${id}`, templateId: null, usage, status: "uploaded", updatedAt: new Date("2026-07-16T12:00:00.000Z") };
}

describe("analyzeCreativeWorkSource", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    getWorkspaceAssetById.mockResolvedValue({ id: "asset-source-1", workspaceId: "ws-1", key: "trusted/key.png", type: "image/png" });
    getObject.mockResolvedValue(Buffer.from("image"));
    analyzeImageContent.mockResolvedValue(content);
    analyzeImageStyle.mockResolvedValue(style);
    normalizeImageForAi.mockImplementation(async ({ buffer, mimeType }: { buffer: Buffer; mimeType?: string }) => ({
      buffer,
      mimeType: mimeType ?? "image/png",
      width: 1080,
      height: 1080,
      originalBytes: buffer.byteLength,
      finalBytes: buffer.byteLength,
      hasTransparency: false,
    }));
    inspectUsableTransparency.mockResolvedValue(false);
    updateCreativeWorkSourceIfUnchanged.mockImplementation(async (_ws, _work, id, expected, patch) => ({
      ...source(id, expected.usage), ...patch, updatedAt: new Date("2026-07-16T12:00:00.001Z"),
    }));
  });

  it.each([
    ["content", 1, 0],
    ["style", 0, 1],
    ["both", 1, 1],
  ] as const)("runs only the %s analyzers", async (usage, contentCalls, styleCalls) => {
    getCreativeWork.mockResolvedValue({ work: {}, outputs: [], sources: [source("source-1", usage)] });

    await analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" });

    expect(analyzeImageContent).toHaveBeenCalledTimes(contentCalls);
    expect(analyzeImageStyle).toHaveBeenCalledTimes(styleCalls);
    expect(getObject).toHaveBeenCalledWith("trusted/key.png");
    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenLastCalledWith(
      "ws-1", "work-1", "source-1",
      expect.objectContaining({ status: "analyzing", usage }),
      expect.objectContaining({ status: "ready" }),
    );
  });

  it("classifies an Arte Livre source in the existing content analysis call", async () => {
    getCreativeWork.mockResolvedValue({
      work: { toolKind: "single" }, outputs: [], sources: [source("source-1", "both")],
    });
    analyzeImageContent.mockResolvedValue({
      ...content,
      pieceReference: { category: "product_or_packaging", confidence: "high" },
    });

    await analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" });

    expect(analyzeImageContent).toHaveBeenCalledTimes(1);
    expect(analyzeImageContent).toHaveBeenCalledWith(expect.anything(), "image/png", { classifyPieceReference: true });
    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenLastCalledWith(
      "ws-1", "work-1", "source-1", expect.anything(),
      expect.objectContaining({ pieceReference: expect.objectContaining({
        category: "product_or_packaging", confidence: "high", classificationSource: "automatic", hasTransparency: false,
      }) }),
    );
  });

  it.each([
    ["opaque RGBA", 1, false],
    ["transparent pixels", 0.5, true],
  ])("persists usable transparency from real Sharp normalization for %s", async (_label, alpha, expectedTransparency) => {
    const actual = await vi.importActual<typeof import("@/server/ai/normalize-image-for-ai")>(
      "@/server/ai/normalize-image-for-ai",
    );
    normalizeImageForAi.mockImplementation(actual.normalizeImageForAi);
    inspectUsableTransparency.mockImplementation(actual.inspectUsableTransparency);
    const png = await sharp({
      create: { width: 4, height: 4, channels: 4, background: { r: 10, g: 20, b: 30, alpha } },
    }).png().toBuffer();
    getObject.mockResolvedValue(png);
    getCreativeWork.mockResolvedValue({
      work: { toolKind: "single" }, outputs: [], sources: [source("source-1", "both")],
    });
    analyzeImageContent.mockResolvedValue({
      ...content,
      pieceReference: { category: "additional_logo_or_seal", confidence: "high" },
    });

    await analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" });

    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenLastCalledWith(
      "ws-1", "work-1", "source-1", expect.anything(),
      expect.objectContaining({ pieceReference: expect.objectContaining({
        category: "additional_logo_or_seal",
        hasTransparency: expectedTransparency,
      }) }),
    );
  });

  it("keeps missing piece classification as a low-confidence choice", async () => {
    getCreativeWork.mockResolvedValue({
      work: { toolKind: "single" }, outputs: [], sources: [source("source-1", "content")],
    });
    analyzeImageContent.mockResolvedValue(content);

    await analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" });

    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenLastCalledWith(
      "ws-1", "work-1", "source-1", expect.anything(),
      expect.objectContaining({ pieceReference: expect.objectContaining({ category: null, confidence: "low" }) }),
    );
  });

  it("keeps two source transitions independent when one fails", async () => {
    const sources = [source("source-1", "content"), source("source-2", "content")];
    getCreativeWork.mockResolvedValue({ work: {}, outputs: [], sources });
    getWorkspaceAssetById.mockImplementation(async (id) => ({ id, workspaceId: "ws-1", key: `${id}.png`, type: "image/png" }));
    analyzeImageContent.mockRejectedValueOnce(new Error("provider secret")).mockResolvedValueOnce(content);

    await expect(analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" })).rejects.toThrow();
    await analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-2" });

    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenCalledWith("ws-1", "work-1", "source-1", expect.objectContaining({ status: "analyzing" }), { status: "failed", failureCode: "analysis_failed" });
    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenCalledWith("ws-1", "work-1", "source-2", expect.objectContaining({ status: "analyzing" }), expect.objectContaining({ status: "ready", contentAnalysis: expect.objectContaining(content) }));
  });

  it.each(["capacity", "wait_timeout", "unavailable"] as const)("returns %s contention to uploaded and rethrows the same error", async reason => {
    getCreativeWork.mockResolvedValue({ work: {}, sources: [source("source-1", "both")] });
    const error = new RasterRetryError(reason);
    normalizeImageForAi.mockRejectedValueOnce(error);
    await expect(analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" })).rejects.toBe(error);
    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenCalledTimes(2);
    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenLastCalledWith("ws-1", "work-1", "source-1",
      { status: "analyzing", usage: "both", updatedAt: new Date("2026-07-16T12:00:00.001Z") },
      { status: "uploaded", failureCode: null });
    expect(analyzeImageContent).not.toHaveBeenCalled();
    expect(analyzeImageStyle).not.toHaveBeenCalled();
  });

  it.each(["capacity", "wait_timeout", "unavailable"] as const)("recognizes replayed %s in the transparency step", async reason => {
    getCreativeWork.mockResolvedValue({ work: { toolKind: "single" }, sources: [source("source-1", "both")] });
    const error = Object.assign(new Error(`raster_retry:${reason}`), { name: "StepError" });
    inspectUsableTransparency.mockRejectedValueOnce(error);
    await expect(analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" })).rejects.toBe(error);
    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenLastCalledWith("ws-1", "work-1", "source-1", expect.objectContaining({ status: "analyzing" }), { status: "uploaded", failureCode: null });
    expect(analyzeImageContent).not.toHaveBeenCalled();
  });

  it("an invalid image remains a terminal analysis failure", async () => {
    getCreativeWork.mockResolvedValue({ work: {}, sources: [source("source-1", "both")] });
    const error = new RasterImageRejected("unreadable");
    normalizeImageForAi.mockRejectedValueOnce(error);
    await expect(analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" })).rejects.toBe(error);
    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenLastCalledWith("ws-1", "work-1", "source-1", expect.objectContaining({ status: "analyzing" }), { status: "failed", failureCode: "analysis_failed" });
  });

  it("an invalid origin remains failed", async () => {
    getCreativeWork.mockResolvedValue({ work: {}, sources: [source("source-1", "both")] });
    getWorkspaceAssetById.mockResolvedValueOnce(null);
    await expect(analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" })).rejects.toThrow("creative_work_source_origin_invalid");
    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenLastCalledWith("ws-1", "work-1", "source-1", expect.objectContaining({ status: "analyzing" }), { status: "failed", failureCode: "analysis_failed" });
  });

  it("does not overwrite a changed source when returning contention to uploaded", async () => {
    const current = { ...source("source-1", "style"), status: "ready", updatedAt: new Date("2026-07-16T12:00:00.002Z") };
    getCreativeWork.mockResolvedValue({ work: {}, sources: [source("source-1", "both")] });
    let persisted = current;
    updateCreativeWorkSourceIfUnchanged.mockImplementation(async (_ws, _work, id, expected, patch) => {
      if (patch.status === "analyzing") return { ...source(id, "both"), ...patch, updatedAt: new Date("2026-07-16T12:00:00.001Z") };
      if (expected.updatedAt.getTime() !== persisted.updatedAt.getTime()) return null;
      persisted = { ...persisted, ...patch };
      return persisted;
    });
    const error = new RasterRetryError("capacity");
    normalizeImageForAi.mockRejectedValueOnce(error);
    await expect(analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" })).rejects.toBe(error);
    expect(persisted).toBe(current);
    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenLastCalledWith("ws-1", "work-1", "source-1",
      { status: "analyzing", usage: "both", updatedAt: new Date("2026-07-16T12:00:00.001Z") }, { status: "uploaded", failureCode: null });
  });

  it("offers one deterministic failed analysis before succeeding on manual retry", async () => {
    vi.stubEnv("E2E_CONTROLLED_PROVIDER", "true");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    getCreativeWork.mockResolvedValue({ work: {}, outputs: [], sources: [source("controlled-failure", "both")] });
    getWorkspaceAssetById.mockResolvedValue({
      id: "asset-controlled-failure",
      workspaceId: "ws-1",
      key: "trusted/failure.png",
      name: "e2e-source-fail-once.png",
      type: "image/png",
    });

    await expect(analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "controlled-failure" })).rejects.toThrow("controlled_source_analysis_failure");
    await expect(analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "controlled-failure" })).resolves.toMatchObject({ status: "ready" });
  });

  it("does not let a Variations analysis erase the Single Piece normalization that invalidated its CAS", async () => {
    const normalizedPieceReference = {
      version: 1 as const,
      category: null,
      classificationSource: "automatic" as const,
      confidence: "low" as const,
      userInstruction: null,
      hasTransparency: false,
    };
    const current = {
      ...source("source-1", "both"),
      status: "analyzing",
      updatedAt: new Date("2026-07-16T12:00:00.002Z"),
      pieceReference: normalizedPieceReference,
    };
    getCreativeWork
      .mockResolvedValueOnce({ work: { toolKind: "variations" }, outputs: [], sources: [source("source-1", "content")] })
      .mockResolvedValueOnce({ work: { toolKind: "single" }, outputs: [], sources: [current] });
    updateCreativeWorkSourceIfUnchanged
      .mockResolvedValueOnce({ ...source("source-1", "content"), status: "analyzing", updatedAt: new Date("2026-07-16T12:00:00.001Z") })
      .mockResolvedValueOnce(null);

    await expect(analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" })).resolves.toEqual(current);

    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenLastCalledWith(
      "ws-1", "work-1", "source-1",
      { status: "analyzing", usage: "content", updatedAt: new Date("2026-07-16T12:00:00.001Z") },
      expect.objectContaining({ status: "ready" }),
    );
    expect(analyzeImageContent).toHaveBeenCalledWith(expect.anything(), "image/png", { classifyPieceReference: false });
  });

  it("claims the post-transition Single Piece version and classifies it after the stale claimant loses", async () => {
    const normalized = {
      ...source("source-1", "both"),
      status: "uploaded",
      updatedAt: new Date("2026-07-16T12:00:00.002Z"),
      pieceReference: {
        version: 1 as const,
        category: null,
        classificationSource: "automatic" as const,
        confidence: "low" as const,
        userInstruction: null,
        hasTransparency: false,
      },
    };
    getCreativeWork.mockResolvedValue({ work: { toolKind: "single" }, outputs: [], sources: [normalized] });
    analyzeImageContent.mockResolvedValue({
      ...content,
      pieceReference: { category: "product_or_packaging", confidence: "high" },
    });

    await analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" });

    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenNthCalledWith(
      1,
      "ws-1", "work-1", "source-1",
      { status: "uploaded", usage: "both", updatedAt: normalized.updatedAt },
      expect.objectContaining({ status: "analyzing" }),
    );
    expect(analyzeImageContent).toHaveBeenCalledWith(expect.anything(), "image/png", { classifyPieceReference: true });
    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenLastCalledWith(
      "ws-1", "work-1", "source-1", expect.objectContaining({ status: "analyzing", usage: "both" }),
      expect.objectContaining({ status: "ready", pieceReference: expect.objectContaining({ category: "product_or_packaging" }) }),
    );
  });

  it("reloads the canonical template source when another claimant wins the initial CAS", async () => {
    const uploaded = { ...source("source-1", "both"), assetId: null, templateId: "template-1" };
    const current = { ...uploaded, status: "analyzing", updatedAt: new Date("2026-07-16T12:00:00.002Z") };
    getCreativeWork
      .mockResolvedValueOnce({ work: {}, outputs: [], sources: [uploaded] })
      .mockResolvedValueOnce({ work: {}, outputs: [], sources: [current] });
    updateCreativeWorkSourceIfUnchanged.mockResolvedValueOnce(null);

    await expect(analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" })).resolves.toEqual(current);

    expect(getTemplateById).not.toHaveBeenCalled();
    expect(analyzeImageContent).not.toHaveBeenCalled();
    expect(analyzeImageStyle).not.toHaveBeenCalled();
  });

  it("maps a template synchronously without vision and validates the mapped analysis", async () => {
    getCreativeWork.mockResolvedValue({ work: {}, outputs: [], sources: [{ ...source("source-1", "both"), assetId: null, templateId: "template-1" }] });
    getTemplateById.mockResolvedValue({
      id: "template-1", workspaceId: "ws-1", product: "Tênis", offer: "20%", objective: "Venda",
      audience: "Corredores", ctaVariants: ["Comprar"], targetFormats: ["4:5"], tone: "direto", styleIntensity: "medium",
    });

    await analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" });

    expect(getObject).not.toHaveBeenCalled();
    expect(analyzeImageContent).not.toHaveBeenCalled();
    expect(analyzeImageStyle).not.toHaveBeenCalled();
    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenLastCalledWith(
      "ws-1", "work-1", "source-1", expect.objectContaining({ status: "analyzing" }),
      expect.objectContaining({ status: "ready", contentAnalysis: expect.objectContaining({ product: "Tênis" }), styleAnalysis: expect.objectContaining({ mood: "direto" }) }),
    );
  });

  it("persists localized reading and literal text without invoking image generation", async () => {
    getCreativeWork.mockResolvedValue({ work: {}, outputs: [], sources: [source("source-1", "both")] });
    analyzeImageContent.mockResolvedValue({
      ...content,
      summaryPt: "Resumo em português",
      literalText: "Inscreva-se agora!",
      entities: ["Cenbrap"],
    });
    analyzeImageStyle.mockResolvedValue({
      ...style,
      palette: [{ hex: "#123456", labelPt: "azul profundo" }],
      moodChipsPt: ["profissional", "acolhedor"],
      compositionPt: "hierarquia central",
      typography: { ...style.typography, stylePt: "institucional" },
    });

    await analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" });

    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenLastCalledWith(
      "ws-1", "work-1", "source-1",
      expect.objectContaining({ status: "analyzing" }),
      expect.objectContaining({
        status: "ready",
        contentAnalysis: expect.objectContaining({ summaryPt: "Resumo em português", literalText: "Inscreva-se agora!" }),
        styleAnalysis: expect.objectContaining({ palette: [{ hex: "#123456", labelPt: "azul profundo" }], moodChipsPt: ["profissional", "acolhedor"] }),
      }),
    );
  });

  it("rejects an invalid template mapping before ready persistence", async () => {
    getCreativeWork.mockResolvedValue({ work: {}, outputs: [], sources: [{ ...source("source-1", "style"), assetId: null, templateId: "template-1" }] });
    getTemplateById.mockResolvedValue({ id: "template-1", workspaceId: "ws-1", styleIntensity: null, tone: "direto" });

    await expect(analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" })).rejects.toThrow();
    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenLastCalledWith(
      "ws-1", "work-1", "source-1", expect.objectContaining({ status: "analyzing" }),
      { status: "failed", failureCode: "analysis_failed" },
    );
  });

  it("rejects an invalid provider result before ready persistence", async () => {
    getCreativeWork.mockResolvedValue({ work: {}, outputs: [], sources: [source("source-1", "content")] });
    analyzeImageContent.mockResolvedValue({ product: "incomplete" });

    await expect(analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" })).rejects.toThrow();
    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenLastCalledWith(
      "ws-1", "work-1", "source-1", expect.objectContaining({ status: "analyzing" }),
      { status: "failed", failureCode: "analysis_failed" },
    );
  });
});

// Queue-only retries under an Inngest-style executor: steps are memoized by id (JSON round-trip, like the wire), only successes are kept, a thrown step runs again.
describe("analyzeCreativeWorkSource under durable retries", () => {
  const input = { workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" };
  type Row = ReturnType<typeof source> & { failureCode?: string | null; pieceReference?: unknown };
  let row: Row;
  let clock: number;
  const touch = () => new Date(Date.parse("2026-07-16T12:00:00.000Z") + ++clock);

  function executor() {
    const cache = new Map<string, string>();
    const ran: string[] = [];
    const run: SourceAnalysisExecution["run"] = async (id, action) => {
      if (cache.has(id)) return JSON.parse(cache.get(id)!);
      ran.push(id);
      const value = await action();
      cache.set(id, JSON.stringify(value ?? null));
      return JSON.parse(cache.get(id)!);
    };
    return { cache, ran, run };
  }
  /** Plays the executor: re-invokes after a RetryAfterError while retries remain; a NonRetriableError or success ends it. */
  async function drive(exec = executor(), firstAttempt = 0) {
    const backoffs: string[] = [];
    for (let attempt = firstAttempt; attempt < SOURCE_ANALYSIS_MAX_ATTEMPTS; attempt++) {
      try {
        return { exec, backoffs, attempts: attempt + 1, value: await analyzeCreativeWorkSource(input, { attempt, run: exec.run }) };
      } catch (error) {
        if (error instanceof RetryAfterError) { backoffs.push(String(error.retryAfter)); continue; }
        return { exec, backoffs, attempts: attempt + 1, error };
      }
    }
    return { exec, backoffs, attempts: SOURCE_ANALYSIS_MAX_ATTEMPTS, error: new Error("executor_exhausted_with_retry") };
  }
  const retry = (reason: "capacity" | "wait_timeout" | "unavailable" = "capacity") => new RasterRetryError(reason);

  beforeEach(() => {
    vi.clearAllMocks();
    clock = 0;
    row = { ...source("source-1", "both"), failureCode: null };
    getCreativeWork.mockImplementation(async () => ({ work: {}, outputs: [], sources: [{ ...row }] }));
    updateCreativeWorkSourceIfUnchanged.mockImplementation(async (_ws, _work, _id, expected, patch) => {
      if (expected.status !== row.status || expected.usage !== row.usage || expected.updatedAt.getTime() !== row.updatedAt.getTime()) return null;
      row = { ...row, ...patch, updatedAt: touch() };
      return { ...row };
    });
    getWorkspaceAssetById.mockResolvedValue({ id: "asset-source-1", workspaceId: "ws-1", key: "trusted/key.png", type: "image/png" });
    getObject.mockResolvedValue(Buffer.from("image"));
    analyzeImageContent.mockResolvedValue(content);
    analyzeImageStyle.mockResolvedValue(style);
    inspectUsableTransparency.mockResolvedValue(false);
    normalizeImageForAi.mockImplementation(async ({ buffer, mimeType }: { buffer: Buffer; mimeType?: string }) => ({
      buffer, mimeType: mimeType ?? "image/png", width: 1080, height: 1080, originalBytes: buffer.byteLength, finalBytes: buffer.byteLength, hasTransparency: false,
    }));
  });

  // Uses the existing read.executor.test.ts wire protocol with the REAL SDK and source job.
  async function wire(memory?: { steps: Record<string, { data: unknown }>; stack: string[] }) {
    const client = new Inngest({ id: "source-regression", isDev: true, baseUrl: "http://127.0.0.1:9", eventKey: "test", checkpointing: false });
    const job = createCreativeWorkSourceAnalyzeJobV2(client);
    const handler = serve({ client, functions: [job] });
    const steps: Record<string, { data: unknown }> = memory?.steps ?? {};
    const stack: string[] = memory?.stack ?? [];
    let attempt = 0, first = true;
    const failures: Array<{ status: number; headers: Record<string, string>; data: unknown }> = [];
    const call = async (stepId: string, immediate: boolean) => {
      const event = { id: "source-event", name: "creative-work.source.analyze.v2", ts: 1, data: input, user: {} };
      const body = { ctx: { attempt, disable_immediate_execution: !immediate, env: "", fn_id: "source-fn", generation_id: 1, job_id: "source-job", max_attempts: 3, qi_id: "source-qi", request_id: "source-request", run_id: "source-run", stack: { current: stack.length, stack }, step_id: "step", use_api: false }, defers: {}, event, events: [event], steps, use_api: false, version: first ? -1 : 2 };
      const response = await handler(new Request(`http://localhost/api/inngest?fnId=${client.id}-${job.id()}&stepId=${stepId}`, { method: "POST", headers: { "content-type": "application/json", host: "localhost:3000", "x-inngest-req-version": first ? "-1" : "2" }, body: JSON.stringify(body) }));
      first = false;
      return { status: response.status, headers: Object.fromEntries(response.headers), data: await response.json() };
    };
    type Op = { id: string; op: string; name?: string; data?: unknown; error?: { name?: string } };
    for (let guard = 0; guard < 40; guard++) {
      const root = await call("step", true);
      if (root.status === 200) return { attempt, failures, steps, stack, value: root.data };
      const ops = root.data as Op[];
      if (!Array.isArray(ops)) throw new Error(JSON.stringify(root));
      if (ops.some(op => op.op === "RunComplete")) return { attempt, failures, steps, stack, value: ops.find(op => op.op === "RunComplete")?.data };
      if (ops.some(op => op.op === "StepError" || op.op === "StepFailed")) {
        failures.push(root);
        if (ops.some(op => op.op === "StepFailed") || root.headers["x-inngest-no-retry"] === "true" || attempt === 2) return { attempt, failures, steps, stack };
        attempt++;
        continue;
      }
      for (const op of ops.filter(op => op.op === "StepRun")) { steps[op.id] = { data: op.data }; stack.push(op.id); }
      for (const planned of ops.filter(op => op.op === "StepPlanned")) {
        const answer = await call(planned.id, false);
        const done = answer.data as Op[];
        for (const op of done.filter(op => op.op === "StepRun")) { steps[op.id] = { data: op.data }; stack.push(op.id); }
        const error = done.find(op => op.op === "StepError" || op.op === "StepFailed");
        if (error) {
          failures.push({ ...answer, step: planned.name });
          if (error.op === "StepFailed" || error.error?.name === "NonRetriableError" || answer.headers["x-inngest-no-retry"] === "true" || attempt === 2) return { attempt, failures, steps, stack };
          attempt++;
        }
      }
    }
    throw new Error("source executor did not finish");
  }

  it("real SDK wire: queue retries reach ready with one provider call", async () => {
    normalizeImageForAi.mockRejectedValueOnce(retry("capacity")).mockRejectedValueOnce(retry("wait_timeout"));
    const out = await wire();
    expect(row.status).toBe("ready");
    expect(analyzeImageContent).toHaveBeenCalledTimes(1);
    expect(out.attempt).toBe(2);
    expect(out.failures.map(f => f.headers["x-inngest-no-retry"])).toEqual(["false", "false"]);
  });

  it("real SDK wire: exhausted queue attempts are terminal with no provider", async () => {
    normalizeImageForAi.mockRejectedValue(retry("capacity"));
    const out = await wire();
    expect(out.attempt).toBe(2);
    expect(out.failures).toHaveLength(3);
    expect(out.failures.map(f => (f.data as Array<{ op: string }>)[0].op)).toEqual(["StepError", "StepError", "StepFailed"]);
    expect(row).toMatchObject({ status: "failed", failureCode: "analysis_failed" });
    expect(analyzeImageContent).not.toHaveBeenCalled();
    expect(analyzeImageStyle).not.toHaveBeenCalled();
  });

  it("real SDK wire: provider error is terminal on the first attempt", async () => {
    analyzeImageContent.mockRejectedValueOnce(new Error("provider failed"));
    const out = await wire();
    expect(out.attempt).toBe(0);
    expect(out.failures).toHaveLength(1);
    expect(out.failures[0].data).toEqual(expect.arrayContaining([expect.objectContaining({ op: "StepFailed" })]));
    expect(row.status).toBe("failed");
    expect(analyzeImageContent).toHaveBeenCalledTimes(1);
  });

  it("real SDK wire: persistence failure is terminal and replay retains the provider checkpoint and its usage", async () => {
    const update = updateCreativeWorkSourceIfUnchanged.getMockImplementation()!;
    let failOnce = true, observedUsage = 0;
    analyzeImageContent.mockImplementation(async () => { observedUsage++; return content; });
    updateCreativeWorkSourceIfUnchanged.mockImplementation(async (...args) => {
      if (args[4].status === "ready" && failOnce) { failOnce = false; throw new Error("storage failed"); }
      return update(...args);
    });
    const out = await wire();
    expect(out.failures[0].data).toEqual(expect.arrayContaining([expect.objectContaining({ op: "StepFailed" })]));
    expect(row.status).toBe("failed");
    const replay = await wire({ steps: out.steps, stack: out.stack });
    expect(replay.value).toMatchObject({ status: "failed" });
    expect(analyzeImageContent).toHaveBeenCalledTimes(1);
    expect(analyzeImageStyle).toHaveBeenCalledTimes(1);
    expect(normalizeImageForAi).toHaveBeenCalledTimes(1);
    expect(observedUsage).toBe(1);
  });

  it("allows three attempts in total", () => expect(SOURCE_ANALYSIS_MAX_ATTEMPTS).toBe(3));

  it("two queue failures then success: one provider run, source ready, backoff 45s then 90s, each attempt claims afresh", async () => {
    normalizeImageForAi.mockRejectedValueOnce(retry("capacity")).mockRejectedValueOnce(retry("wait_timeout"));
    const out = await drive();
    expect(out.error).toBeUndefined();
    expect(out.attempts).toBe(3);
    expect(out.backoffs).toEqual(["45", "90"]);
    expect(normalizeImageForAi).toHaveBeenCalledTimes(3);
    expect(analyzeImageContent).toHaveBeenCalledTimes(1);
    expect(analyzeImageStyle).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({ status: "ready", failureCode: null });
    expect(out.value).toMatchObject({ status: "ready" });
    expect(out.exec.ran).toEqual(["claim-source-0", "analyze-source-result", "claim-source-1", "analyze-source-result", "claim-source-2", "analyze-source-result", "persist-source-analysis"]);
  });

  it("restores uploaded between queue failures so the next claim can win", async () => {
    normalizeImageForAi.mockRejectedValueOnce(retry("unavailable"));
    const exec = executor();
    await expect(analyzeCreativeWorkSource(input, { attempt: 0, run: exec.run })).rejects.toBeInstanceOf(RetryAfterError);
    expect(row).toMatchObject({ status: "uploaded", failureCode: null });
    expect(analyzeImageContent).not.toHaveBeenCalled();
  });

  it("queue contention on every attempt: zero provider calls, source failed, terminal on the last attempt", async () => {
    normalizeImageForAi.mockRejectedValue(retry("capacity"));
    const out = await drive();
    expect(out.attempts).toBe(3);
    expect(out.backoffs).toEqual(["45", "90"]);
    expect(out.error).toBeInstanceOf(NonRetriableError);
    expect(analyzeImageContent).not.toHaveBeenCalled();
    expect(analyzeImageStyle).not.toHaveBeenCalled();
    expect(row).toMatchObject({ status: "failed", failureCode: "analysis_failed" });
    // The final failure is a CAS against the third claim's own version, not an earlier one.
    const last = updateCreativeWorkSourceIfUnchanged.mock.calls.at(-1)!;
    expect(last[3]).toMatchObject({ status: "analyzing" });
    expect(last[4]).toEqual({ status: "failed", failureCode: "analysis_failed" });
    const claims = updateCreativeWorkSourceIfUnchanged.mock.calls.filter(call => call[4].status === "analyzing");
    expect(claims).toHaveLength(3);
  });

  it("a replayed StepError raster_retry from the transparency step is retried like a live one", async () => {
    getCreativeWork.mockImplementation(async () => ({ work: { toolKind: "single" }, outputs: [], sources: [{ ...row }] }));
    inspectUsableTransparency.mockRejectedValueOnce(Object.assign(new Error("raster_retry:unavailable"), { name: "StepError" }));
    const out = await drive();
    expect(out.error).toBeUndefined();
    expect(out.backoffs).toEqual(["45"]);
    expect(analyzeImageContent).toHaveBeenCalledTimes(1);
    expect(row.status).toBe("ready");
  });

  it("a genuine failure (invalid image, bad origin, bad provider result) is never retried", async () => {
    for (const make of [
      () => normalizeImageForAi.mockRejectedValueOnce(new RasterImageRejected("unreadable")),
      () => getWorkspaceAssetById.mockResolvedValueOnce(null),
      () => analyzeImageContent.mockResolvedValueOnce({ product: "incomplete" }),
    ]) {
      vi.clearAllMocks(); row = { ...source("source-1", "both"), failureCode: null }; clock = 0;
      make();
      const out = await drive();
      expect(out.attempts).toBe(1);
      expect(out.backoffs).toEqual([]);
      expect(out.error).toBeInstanceOf(NonRetriableError);
      expect(out.exec.ran.filter(id => id.startsWith("claim-source-"))).toEqual(["claim-source-0"]);
      expect(row).toMatchObject({ status: "failed", failureCode: "analysis_failed" });
    }
  });

  it.each([
    ["a generic provider error", () => new Error("provider 500")],
    ["a queue-shaped error raised after the provider started", () => retry("unavailable")],
  ])("%s after the provider started: one provider call, terminal, no retry", async (_label, error) => {
    analyzeImageContent.mockRejectedValue(error());
    const out = await drive();
    expect(out.attempts).toBe(1);
    expect(out.backoffs).toEqual([]);
    expect(out.error).toBeInstanceOf(NonRetriableError);
    expect(analyzeImageContent).toHaveBeenCalledTimes(1);
    expect(normalizeImageForAi).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({ status: "failed", failureCode: "analysis_failed" });
  });

  it("a persist failure is terminal, and replaying the memoized result never calls the provider again", async () => {
    const realUpdate = updateCreativeWorkSourceIfUnchanged.getMockImplementation()!;
    let failPersist = true;
    updateCreativeWorkSourceIfUnchanged.mockImplementation(async (ws, work, id, expected, patch) => {
      if (patch.status === "ready" && failPersist) { failPersist = false; throw new Error("db_down"); }
      return realUpdate(ws, work, id, expected, patch);
    });
    const exec = executor();
    const first = await drive(exec);
    expect(first.error).toBeInstanceOf(NonRetriableError);
    expect(first.attempts).toBe(1);
    expect(analyzeImageContent).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({ status: "failed", failureCode: "analysis_failed" });
    // The analysis step stayed memoized; replay with the same attempt reuses claim + result and does not reach the vendor.
    const replay = await drive(exec);
    expect(replay.error).toBeUndefined();
    expect(analyzeImageContent).toHaveBeenCalledTimes(1);
    expect(analyzeImageStyle).toHaveBeenCalledTimes(1);
    expect(normalizeImageForAi).toHaveBeenCalledTimes(1);
    expect(replay.exec.ran.filter(id => id === "analyze-source-result")).toHaveLength(1);
    expect(replay.value).toMatchObject({ status: "failed" }); // CAS lost to the terminal failure, canonical row returned
  });

  it("a persist that lost its CAS is memoized as the canonical row; replay neither persists again nor calls the vendor", async () => {
    const exec = executor();
    let failOnce = true;
    const realUpdate = updateCreativeWorkSourceIfUnchanged.getMockImplementation()!;
    updateCreativeWorkSourceIfUnchanged.mockImplementation(async (ws, work, id, expected, patch) => {
      if (patch.status === "ready" && failOnce) { failOnce = false; return realUpdate(ws, work, id, { ...expected, status: "uploaded" }, patch); } // CAS miss
      return realUpdate(ws, work, id, expected, patch);
    });
    const first = await drive(exec);
    expect(first.error).toBeUndefined();
    expect(first.value).toMatchObject({ status: "analyzing" }); // lost CAS returns the canonical row
    const second = await drive(exec);
    expect(second.value).toMatchObject({ status: "analyzing" });
    expect(updateCreativeWorkSourceIfUnchanged.mock.calls.filter(call => call[4].status === "ready")).toHaveLength(1);
    expect(analyzeImageContent).toHaveBeenCalledTimes(1);
  });

  it("another execution that wins the race keeps its state: our restore loses the CAS and the next attempt skips the source", async () => {
    normalizeImageForAi.mockImplementationOnce(async () => {
      row = { ...row, status: "ready", updatedAt: touch() }; // the other execution finished while we were in the queue
      throw retry("capacity");
    });
    const out = await drive();
    expect(out.error).toBeUndefined();
    expect(out.attempts).toBe(2);
    expect(row.status).toBe("ready");
    expect(analyzeImageContent).not.toHaveBeenCalled();
    expect(normalizeImageForAi).toHaveBeenCalledTimes(1);
    expect(out.value).toMatchObject({ status: "ready" });
  });

  it("duplicate deliveries: only one execution claims, one provider run, no second claim wins", async () => {
    const [a, b] = await Promise.all([drive(), drive()]);
    expect([a.error, b.error]).toEqual([undefined, undefined]);
    expect(analyzeImageContent).toHaveBeenCalledTimes(1);
    expect(analyzeImageStyle).toHaveBeenCalledTimes(1);
    expect(normalizeImageForAi).toHaveBeenCalledTimes(1);
    expect(row.status).toBe("ready");
    expect(updateCreativeWorkSourceIfUnchanged.mock.calls.filter(call => call[4].status === "ready")).toHaveLength(1);
  });

  it("memoized claim and result survive the wire: dates come back as strings and the CAS still matches", async () => {
    const exec = executor();
    await drive(exec);
    expect(JSON.parse(exec.cache.get("claim-source-0")!).analyzing.updatedAt).toEqual(expect.any(String));
    const persist = updateCreativeWorkSourceIfUnchanged.mock.calls.find(call => call[4].status === "ready")!;
    expect(persist[3].updatedAt).toBeInstanceOf(Date);
  });
});
