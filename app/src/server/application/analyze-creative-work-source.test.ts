import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { Inngest } from "inngest";
import { serve } from "inngest/edge";
import { createCreativeWorkSourceAnalyzeJobV2 } from "@/server/jobs/creative-work-source";
import { RASTER_LIMITS, RasterImageRejected, RasterRetryError } from "@/server/equipe/handoff/raster-image";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
      .mockResolvedValue({ work: { toolKind: "single" }, outputs: [], sources: [current] }); // every later read (lookups before the provider, reload after a lost CAS) sees the winner's row
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

// Durable retries, played by an executor that behaves like the real Inngest one (probed against the dev server, SDK 4.4, review-pr-621 A1/A3):
//  * the function body is replayed from the top on every invocation, memoized steps (by id, JSON on the wire) return their stored value;
//  * `attempt` is counted PER STEP: a step that throws is run again with attempt + 1, and as soon as any step completes the next step starts again at 0;
//  * an id that depends on `attempt` therefore introduces a NEW step in front of the failed one, and a step ends the invocation (nothing runs after it until the next one).
// Modelling `attempt` as one counter for the whole run (the previous emulator) hid the stranded-`analyzing` defect.
describe("analyzeCreativeWorkSource under durable retries", () => {
  const input = { workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" };
  type Row = ReturnType<typeof source> & { failureCode?: string | null; pieceReference?: unknown; contentAnalysis?: unknown };
  let row: Row;
  let clock: number;
  const touch = () => new Date(Date.parse("2026-07-16T12:00:00.000Z") + ++clock);
  const MAX_STEP_ATTEMPTS = SOURCE_ANALYSIS_MAX_ATTEMPTS; // retries = 2 => three runs of one step

  type Outcome = { kind: "step-done" } | { kind: "retry" } | { kind: "finished"; value: unknown } | { kind: "failed"; error: unknown };
  /** One execution of the function: returns its final value or the error that ended it. `memo` can be shared to replay. */
  async function execute(memo = new Map<string, string>(), hooks: { onBackoff?: () => void } = {}) {
    const log: Array<{ id: string; attempt: number }> = [];
    const backoffs: string[] = [];
    let attempt = 0, invocations = 0;
    for (; invocations < 60;) {
      invocations++;
      let end!: (outcome: Outcome) => void;
      const ended = new Promise<Outcome>(resolve => { end = resolve; });
      const run: SourceAnalysisExecution["run"] = <T,>(id: string, action: () => Promise<T>) => {
        if (memo.has(id)) return Promise.resolve(JSON.parse(memo.get(id)!) as T);
        log.push({ id, attempt });
        void (async () => {
          try {
            const value = await action();
            memo.set(id, JSON.stringify(value ?? null));
            attempt = 0; // the next step is a new step
            end({ kind: "step-done" });
          } catch (error) {
            if (error instanceof RetryAfterError && attempt < MAX_STEP_ATTEMPTS - 1) { backoffs.push(String(error.retryAfter)); attempt++; hooks.onBackoff?.(); end({ kind: "retry" }); }
            else end({ kind: "failed", error }); // NonRetriableError, or retries exhausted
          }
        })();
        return new Promise<T>(() => {}); // the invocation ends here, like the SDK's flow control
      };
      const outcome = await Promise.race([
        analyzeCreativeWorkSource(input, { attempt, run }).then<Outcome, Outcome>(value => ({ kind: "finished", value }), error => ({ kind: "failed", error })),
        ended,
      ]);
      if (outcome.kind === "finished") return { memo, log, backoffs, invocations, value: outcome.value };
      if (outcome.kind === "failed") return { memo, log, backoffs, invocations, error: outcome.error };
    }
    throw new Error("executor did not finish");
  }
  const attemptsOf = (log: Array<{ id: string; attempt: number }>, id: string) => log.filter(entry => entry.id === id).map(entry => entry.attempt);
  const retry = (reason: "capacity" | "wait_timeout" | "unavailable" = "capacity") => new RasterRetryError(reason);
  const providerCalls = () => analyzeImageContent.mock.calls.length;
  const writesOf = (status: string) => updateCreativeWorkSourceIfUnchanged.mock.calls.filter(call => call[4].status === status);

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

  it("allows three attempts in total", () => expect(SOURCE_ANALYSIS_MAX_ATTEMPTS).toBe(3));

  it("two queue failures then success: the analysis step runs 3 times (attempts 0,1,2), the claim and the persist once, one provider run, ready, backoff 15s then 30s", async () => {
    normalizeImageForAi.mockRejectedValueOnce(retry("capacity")).mockRejectedValueOnce(retry("wait_timeout"));
    const out = await execute();
    expect(out.error).toBeUndefined();
    expect(out.value).toMatchObject({ status: "ready" });
    expect(out.backoffs).toEqual(["15", "30"]);
    expect(attemptsOf(out.log, "analyze-source-result")).toEqual([0, 1, 2]);
    expect(out.log.filter(entry => entry.id === "claim-source")).toEqual([{ id: "claim-source", attempt: 0 }]);
    expect(out.log.filter(entry => entry.id === "persist-source-analysis")).toEqual([{ id: "persist-source-analysis", attempt: 0 }]);
    expect(out.log.map(entry => entry.id).filter(id => /\d$/.test(id))).toEqual([]); // no step id depends on `attempt`
    expect(normalizeImageForAi).toHaveBeenCalledTimes(3);
    expect(providerCalls()).toBe(1);
    expect(analyzeImageStyle).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({ status: "ready", failureCode: null });
  });

  it("keeps the same claim between queue failures: the row stays analyzing with the same version, and only one claim and one ready write reach the repository", async () => {
    const seen: Array<{ status: string; updatedAt: number }> = [];
    normalizeImageForAi.mockImplementation(async ({ buffer, mimeType }: { buffer: Buffer; mimeType?: string }) => {
      seen.push({ status: row.status, updatedAt: row.updatedAt.getTime() });
      if (seen.length < 3) throw retry("unavailable");
      return { buffer, mimeType, width: 1, height: 1, originalBytes: 1, finalBytes: 1, hasTransparency: false };
    });
    const out = await execute();
    expect(out.error).toBeUndefined();
    expect(seen).toHaveLength(3);
    expect(new Set(seen.map(entry => entry.status))).toEqual(new Set(["analyzing"]));
    expect(new Set(seen.map(entry => entry.updatedAt)).size).toBe(1);
    expect(writesOf("analyzing")).toHaveLength(1);
    expect(writesOf("uploaded")).toHaveLength(0);
    expect(writesOf("ready")).toHaveLength(1);
    // The persist CAS is the claim's own version, rehydrated as a Date.
    expect(writesOf("ready")[0]![3]).toEqual({ status: "analyzing", usage: "both", updatedAt: expect.any(Date) });
  });

  it("queue contention on every attempt: exactly 3 runs of the step, 0 provider calls, failed with the claim's own CAS, terminal", async () => {
    normalizeImageForAi.mockRejectedValue(retry("capacity"));
    const out = await execute();
    expect(out.error).toBeInstanceOf(NonRetriableError);
    expect(out.backoffs).toEqual(["15", "30"]);
    expect(attemptsOf(out.log, "analyze-source-result")).toEqual([0, 1, 2]);
    expect(out.log.filter(entry => entry.id === "claim-source")).toHaveLength(1);
    expect(out.log.some(entry => entry.id === "persist-source-analysis")).toBe(false);
    expect(normalizeImageForAi).toHaveBeenCalledTimes(3);
    expect(providerCalls()).toBe(0);
    expect(analyzeImageStyle).not.toHaveBeenCalled();
    expect(row).toMatchObject({ status: "failed", failureCode: "analysis_failed" });
    const claim = writesOf("analyzing");
    expect(claim).toHaveLength(1);
    const failure = writesOf("failed");
    expect(failure).toHaveLength(1);
    expect(failure[0]![3]).toEqual({ status: "analyzing", usage: "both", updatedAt: expect.any(Date) });
    expect(failure[0]![3].updatedAt.getTime()).toBe(Date.parse("2026-07-16T12:00:00.001Z")); // the version the one claim wrote
  });

  it("a replayed StepError raster_retry from the transparency step is retried like a live one", async () => {
    getCreativeWork.mockImplementation(async () => ({ work: { toolKind: "single" }, outputs: [], sources: [{ ...row }] }));
    inspectUsableTransparency.mockRejectedValueOnce(Object.assign(new Error("raster_retry:unavailable"), { name: "StepError" }));
    const out = await execute();
    expect(out.error).toBeUndefined();
    expect(out.backoffs).toEqual(["15"]);
    expect(providerCalls()).toBe(1);
    expect(row.status).toBe("ready");
  });

  it("a genuine failure (invalid image, bad origin, bad provider result) is terminal on the first run of the step", async () => {
    for (const make of [
      () => normalizeImageForAi.mockRejectedValueOnce(new RasterImageRejected("unreadable")),
      () => getWorkspaceAssetById.mockResolvedValueOnce(null),
      () => analyzeImageContent.mockResolvedValueOnce({ product: "incomplete" }),
    ]) {
      vi.clearAllMocks(); row = { ...source("source-1", "both"), failureCode: null }; clock = 0;
      make();
      const out = await execute();
      expect(out.error).toBeInstanceOf(NonRetriableError);
      expect(out.backoffs).toEqual([]);
      expect(attemptsOf(out.log, "analyze-source-result")).toEqual([0]);
      expect(row).toMatchObject({ status: "failed", failureCode: "analysis_failed" });
    }
  });

  it.each([
    ["a generic provider error", () => new Error("provider 500")],
    ["a queue-shaped error raised after the provider started", () => retry("unavailable")],
  ])("%s: exactly one provider call, terminal, no retry", async (_label, error) => {
    analyzeImageContent.mockRejectedValue(error());
    const out = await execute();
    expect(out.error).toBeInstanceOf(NonRetriableError);
    expect(out.backoffs).toEqual([]);
    expect(attemptsOf(out.log, "analyze-source-result")).toEqual([0]);
    expect(providerCalls()).toBe(1);
    expect(normalizeImageForAi).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({ status: "failed", failureCode: "analysis_failed" });
  });

  it("queue failures on the first runs, then a provider error: failed after exactly one provider call", async () => {
    normalizeImageForAi.mockRejectedValueOnce(retry("capacity"));
    analyzeImageContent.mockRejectedValueOnce(new Error("provider 500"));
    const out = await execute();
    expect(out.error).toBeInstanceOf(NonRetriableError);
    expect(attemptsOf(out.log, "analyze-source-result")).toEqual([0, 1]);
    expect(providerCalls()).toBe(1);
    expect(row.status).toBe("failed");
  });

  it("a persist that throws is terminal and a replay of the memoized result never reaches the vendor again", async () => {
    const realUpdate = updateCreativeWorkSourceIfUnchanged.getMockImplementation()!;
    let failPersist = true;
    updateCreativeWorkSourceIfUnchanged.mockImplementation(async (ws, work, id, expected, patch) => {
      if (patch.status === "ready" && failPersist) { failPersist = false; throw new Error("db_down"); }
      return realUpdate(ws, work, id, expected, patch);
    });
    const first = await execute();
    expect(first.error).toBeInstanceOf(NonRetriableError);
    expect(providerCalls()).toBe(1);
    expect(row).toMatchObject({ status: "failed", failureCode: "analysis_failed" });
    const replay = await execute(first.memo);
    expect(providerCalls()).toBe(1);
    expect(analyzeImageStyle).toHaveBeenCalledTimes(1);
    expect(normalizeImageForAi).toHaveBeenCalledTimes(1);
    expect(replay.log.filter(entry => entry.id === "analyze-source-result")).toHaveLength(0);
    expect(row.status).toBe("failed"); // the replay did not resurrect or overwrite the terminal row
  });

  it("a persist whose CAS is lost while our own claim is still the row is a terminal failure, not a silent success that strands analyzing", async () => {
    const realUpdate = updateCreativeWorkSourceIfUnchanged.getMockImplementation()!;
    updateCreativeWorkSourceIfUnchanged.mockImplementation(async (ws, work, id, expected, patch) => patch.status === "ready" ? null : realUpdate(ws, work, id, expected, patch));
    const out = await execute();
    expect(out.error).toBeInstanceOf(NonRetriableError);
    expect(row).toMatchObject({ status: "failed", failureCode: "analysis_failed" });
    expect(providerCalls()).toBe(1);
  });

  it("a persist whose CAS is lost to ANOTHER execution keeps that execution's row, in every state it can be in", async () => {
    for (const other of [
      { status: "ready", contentAnalysis: { marker: "other" } },
      { status: "analyzing", contentAnalysis: null },
      { status: "failed", failureCode: "analysis_failed" },
      { status: "uploaded", failureCode: null },
    ] as const) {
      vi.clearAllMocks(); row = { ...source("source-1", "both"), failureCode: null }; clock = 0;
      const realUpdate = updateCreativeWorkSourceIfUnchanged.getMockImplementation()!;
      updateCreativeWorkSourceIfUnchanged.mockImplementation(realUpdate); // reset call history only
      analyzeImageContent.mockImplementation(async () => { row = { ...row, ...other, updatedAt: touch() }; return content; }); // the other execution writes while we are at the provider
      const snapshotBefore = () => ({ ...row });
      const out = await execute();
      expect(out.error).toBeUndefined();
      const final = snapshotBefore();
      expect(final).toMatchObject(other);
      expect(writesOf("ready")).toHaveLength(1); // our attempt to persist was made once, lost the CAS, and was not repeated
      expect((out.value as Row).status).toBe(other.status);
      expect(providerCalls()).toBe(1);
    }
  });

  it("another execution that finishes during our queue wait keeps its result when we lose the final CAS", async () => {
    normalizeImageForAi.mockImplementationOnce(async () => {
      row = { ...row, status: "ready", contentAnalysis: { marker: "other" }, updatedAt: touch() };
      throw retry("capacity");
    });
    const out = await execute();
    expect(out.error).toBeUndefined();
    expect(row).toMatchObject({ status: "ready", contentAnalysis: { marker: "other" } });
    expect(out.backoffs).toEqual(["15"]);
  });

  it("when the failure CAS is lost to another execution, its row is kept and our execution still ends terminal", async () => {
    normalizeImageForAi.mockImplementation(async () => {
      row = { ...row, status: "ready", contentAnalysis: { marker: "other" }, updatedAt: touch() };
      throw retry("capacity");
    });
    const out = await execute();
    expect(out.error).toBeInstanceOf(NonRetriableError);
    expect(row).toMatchObject({ status: "ready", contentAnalysis: { marker: "other" } });
    expect(providerCalls()).toBe(0);
  });

  describe("a source or work item removed while the analysis is retrying", () => {
    const other = () => ({ ...source("source-2", "content"), status: "analyzing", failureCode: null, updatedAt: new Date("2026-07-16T12:30:00.000Z") });
    let removed: "none" | "source" | "work";
    let neighbour: ReturnType<typeof other>;
    beforeEach(() => {
      removed = "none";
      neighbour = other();
      getCreativeWork.mockImplementation(async () => {
        if (removed === "work") return null;
        return { work: {}, outputs: [], sources: [...(removed === "source" ? [] : [{ ...row }]), { ...neighbour }] };
      });
      const real = updateCreativeWorkSourceIfUnchanged.getMockImplementation()!;
      updateCreativeWorkSourceIfUnchanged.mockImplementation(async (ws, work, id, expected, patch) => {
        if (id !== "source-1") return null; // the neighbour is owned by someone else: any write attempt would lose or corrupt it
        if (removed !== "none") return null; // the row is gone
        return real(ws, work, id, expected, patch);
      });
    });
    const neighbourUntouched = () => {
      expect(updateCreativeWorkSourceIfUnchanged.mock.calls.filter(call => call[2] !== "source-1")).toEqual([]);
      expect(neighbour).toEqual(other());
    };
    const noTerminalWrites = () => {
      expect(writesOf("failed")).toEqual([]);
      expect(writesOf("uploaded")).toEqual([]);
      expect(row.status).not.toBe("ready"); // a persist may be attempted, but it lost: the row is gone
    };

    it.each(["source", "work"] as const)("%s removed while the queue wait fails: success with null at once, zero provider calls, no retry scheduled, no terminal write", async what => {
      normalizeImageForAi.mockImplementationOnce(async () => { removed = what; throw retry("capacity"); });
      const out = await execute();
      expect(out.error).toBeUndefined();
      expect(out.value).toBeNull();
      expect(providerCalls()).toBe(0);
      expect(analyzeImageStyle).not.toHaveBeenCalled();
      expect(out.backoffs).toEqual([]);
      expect(attemptsOf(out.log, "analyze-source-result")).toEqual([0]);
      noTerminalWrites();
      neighbourUntouched();
    });

    it.each(["source", "work"] as const)("%s removed during the backoff: the retried step finds nothing, ends with null, zero provider calls, no error, no terminal write", async what => {
      normalizeImageForAi.mockRejectedValueOnce(retry("capacity"));
      const out = await execute(undefined, { onBackoff: () => { removed = what; } });
      expect(out.error).toBeUndefined();
      expect(out.value).toBeNull();
      expect(providerCalls()).toBe(0);
      expect(analyzeImageStyle).not.toHaveBeenCalled();
      expect(normalizeImageForAi).toHaveBeenCalledTimes(1); // the retried step looked first and never decoded again
      expect(out.backoffs).toEqual(["15"]);
      expect(attemptsOf(out.log, "analyze-source-result")).toEqual([0, 1]);
      noTerminalWrites();
      neighbourUntouched();
    });

    it.each(["source", "work"] as const)("%s removed while the provider call is in flight: exactly one provider call, success with null, no error, no retry, no terminal write", async what => {
      analyzeImageContent.mockImplementation(async () => { removed = what; return content; });
      const out = await execute();
      expect(out.error).toBeUndefined();
      expect(out.value).toBeNull();
      expect(providerCalls()).toBe(1);
      expect(analyzeImageStyle).toHaveBeenCalledTimes(1);
      expect(out.backoffs).toEqual([]);
      expect(attemptsOf(out.log, "analyze-source-result")).toEqual([0]);
      noTerminalWrites();
      neighbourUntouched();
    });

    it("a removal after queue failures that had restored nothing: the claim written earlier is the only write, so no other execution's CAS is disturbed", async () => {
      normalizeImageForAi
        .mockRejectedValueOnce(retry("capacity"))
        .mockImplementationOnce(async () => { removed = "source"; throw retry("wait_timeout"); });
      const out = await execute();
      expect(out.error).toBeUndefined();
      expect(out.value).toBeNull();
      expect(providerCalls()).toBe(0);
      expect(updateCreativeWorkSourceIfUnchanged.mock.calls.map(call => call[4].status)).toEqual(["analyzing"]);
      neighbourUntouched();
    });
  });

  it("a source that is missing at the very first claim: null under an executor (no provider, no write), the original throw without one", async () => {
    getCreativeWork.mockResolvedValue({ work: {}, outputs: [], sources: [] });
    const out = await execute();
    expect(out.error).toBeUndefined();
    expect(out.value).toBeNull();
    expect(providerCalls()).toBe(0);
    expect(updateCreativeWorkSourceIfUnchanged).not.toHaveBeenCalled();
    await expect(analyzeCreativeWorkSource(input)).rejects.toThrow("creative_work_source_not_found");
  });

  describe("the retry budget fits inside the source analysis lease", () => {
    const routeSource = readFileSync(fileURLToPath(new URL("../../app/api/creative-work/[id]/route.ts", import.meta.url)), "utf8");
    const leaseMs = (() => {
      const match = /const SOURCE_ANALYSIS_LEASE_MS = ([\d\s*]+);/.exec(routeSource);
      if (!match) throw new Error("SOURCE_ANALYSIS_LEASE_MS not found in the creative-work route");
      return match[1]!.split("*").map(part => Number(part.trim())).reduce((a, b) => a * b, 1);
    })();
    const MIN_MARGIN_MS = 120_000;

    it("reads the real lease and queue limits", () => {
      expect(leaseMs).toBe(300_000);
      expect(RASTER_LIMITS.waitMs).toBe(45_000);
    });

    it("worst case (every attempt waits the whole queue, then each backoff) plus the minimum margin is no more than the lease", async () => {
      normalizeImageForAi.mockRejectedValue(retry("wait_timeout"));
      const out = await execute();
      const backoffMs = out.backoffs.reduce((sum, seconds) => sum + Number(seconds) * 1000, 0);
      expect(out.backoffs).toEqual(["15", "30"]);
      const worstCaseMs = SOURCE_ANALYSIS_MAX_ATTEMPTS * RASTER_LIMITS.waitMs + backoffMs;
      expect(worstCaseMs).toBe(180_000); // 3 x 45 s waiting + 15 s + 30 s
      expect(worstCaseMs + MIN_MARGIN_MS).toBeLessThanOrEqual(leaseMs);
    });
  });

  it("manual retry after failed: the row goes back to uploaded and a brand-new execution (fresh steps, attempt 0) analyses it exactly once", async () => {
    normalizeImageForAi.mockRejectedValue(retry("capacity"));
    const first = await execute();
    expect(first.error).toBeInstanceOf(NonRetriableError);
    expect(row.status).toBe("failed");
    expect(providerCalls()).toBe(0);
    normalizeImageForAi.mockReset();
    normalizeImageForAi.mockImplementation(async ({ buffer, mimeType }: { buffer: Buffer; mimeType?: string }) => ({ buffer, mimeType, width: 1, height: 1, originalBytes: 1, finalBytes: 1, hasTransparency: false }));
    row = { ...row, status: "uploaded", failureCode: null, updatedAt: touch() }; // what the retry route writes
    const second = await execute();
    expect(second.error).toBeUndefined();
    expect(second.value).toMatchObject({ status: "ready" });
    expect(attemptsOf(second.log, "claim-source")).toEqual([0]);
    expect(providerCalls()).toBe(1);
    expect(row.status).toBe("ready");
  });

  it("manual retry while the previous execution is still in its queue wait: the row is analyzing, so the retry claim is skipped and the provider runs once overall", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let first = true;
    normalizeImageForAi.mockImplementation(async ({ buffer, mimeType }: { buffer: Buffer; mimeType?: string }) => {
      if (first) { first = false; await gate; throw retry("capacity"); }
      return { buffer, mimeType, width: 1, height: 1, originalBytes: 1, finalBytes: 1, hasTransparency: false };
    });
    const running = execute();
    await vi.waitFor(() => expect(normalizeImageForAi).toHaveBeenCalledTimes(1));
    const duplicate = await execute(); // second delivery / second click while the first waits
    expect(duplicate.error).toBeUndefined();
    expect(duplicate.value).toMatchObject({ status: "analyzing" });
    expect(providerCalls()).toBe(0);
    release();
    const done = await running;
    expect(done.error).toBeUndefined();
    expect(providerCalls()).toBe(1);
    expect(analyzeImageStyle).toHaveBeenCalledTimes(1);
    expect(row.status).toBe("ready");
  });

  it("duplicate deliveries race for the claim: one claim wins, one provider run, one ready write", async () => {
    const [a, b] = await Promise.all([execute(), execute()]);
    expect([a.error, b.error]).toEqual([undefined, undefined]);
    expect(providerCalls()).toBe(1);
    expect(analyzeImageStyle).toHaveBeenCalledTimes(1);
    expect(normalizeImageForAi).toHaveBeenCalledTimes(1);
    const claims = await Promise.all(updateCreativeWorkSourceIfUnchanged.mock.results.map((result, i) => updateCreativeWorkSourceIfUnchanged.mock.calls[i]![4].status === "analyzing" ? result.value : undefined));
    expect(claims.filter(Boolean)).toHaveLength(1); // both asked, only one CAS won
    expect(writesOf("ready")).toHaveLength(1);
    expect(row.status).toBe("ready");
  });

  it("duplicate deliveries while the winner retries: still exactly one provider run", async () => {
    normalizeImageForAi.mockRejectedValueOnce(retry("capacity")).mockRejectedValueOnce(retry("capacity"));
    const [a, b] = await Promise.all([execute(), execute()]);
    expect([a.error, b.error]).toEqual([undefined, undefined]);
    expect(providerCalls()).toBe(1);
    expect(writesOf("ready")).toHaveLength(1);
    expect(row.status).toBe("ready");
  });

  it("memoized claim and result cross the wire as JSON: dates come back as strings, and the persist CAS is rehydrated to a Date that matches the row", async () => {
    const out = await execute();
    const claim = JSON.parse(out.memo.get("claim-source")!);
    expect(claim.analyzing.updatedAt).toEqual(expect.any(String));
    expect(writesOf("ready")[0]![3].updatedAt).toBeInstanceOf(Date);
    expect(out.error).toBeUndefined();
    expect(row.status).toBe("ready");
  });

  // The same function served by the REAL SDK request handler (wire protocol recorded from the dev server, see read.executor.test.ts), with `attempt` per step.
  async function wire(memory?: { steps: Record<string, { data: unknown }>; stack: string[] }) {
    const client = new Inngest({ id: "source-regression", isDev: true, baseUrl: "http://127.0.0.1:9", eventKey: "test", checkpointing: false });
    const job = createCreativeWorkSourceAnalyzeJobV2(client);
    const handler = serve({ client, functions: [job] });
    const steps: Record<string, { data: unknown }> = memory?.steps ?? {};
    const stack: string[] = memory?.stack ?? [];
    let attempt = 0, first = true;
    const failures: Array<{ status: number; headers: Record<string, string>; data: unknown; step?: string; attempt: number }> = [];
    const ran: Array<{ id: string; attempt: number }> = [];
    const call = async (stepId: string, immediate: boolean) => {
      const event = { id: "source-event", name: "creative-work.source.analyze.v2", ts: 1, data: input, user: {} };
      const body = { ctx: { attempt, disable_immediate_execution: !immediate, env: "", fn_id: "source-fn", generation_id: 1, job_id: "source-job", max_attempts: 3, qi_id: "source-qi", request_id: "source-request", run_id: "source-run", stack: { current: stack.length, stack }, step_id: "step", use_api: false }, defers: {}, event, events: [event], steps, use_api: false, version: first ? -1 : 2 };
      const response = await handler(new Request(`http://localhost/api/inngest?fnId=${client.id}-${job.id()}&stepId=${stepId}`, { method: "POST", headers: { "content-type": "application/json", host: "localhost:3000", "x-inngest-req-version": first ? "-1" : "2" }, body: JSON.stringify(body) }));
      first = false;
      return { status: response.status, headers: Object.fromEntries(response.headers), data: await response.json() };
    };
    type Op = { id: string; op: string; name?: string; data?: unknown; error?: { name?: string } };
    const record = (ops: Op[]) => { for (const op of ops.filter(op => op.op === "StepRun")) { steps[op.id] = { data: op.data }; stack.push(op.id); ran.push({ id: op.name ?? op.id, attempt }); attempt = 0; } }; // a step that completes: the next one starts at attempt 0
    const result = (value?: unknown) => ({ attempt, failures, steps, stack, ran, value });
    for (let guard = 0; guard < 60; guard++) {
      const root = await call("step", true);
      if (root.status === 200) return result(root.data);
      const ops = root.data as Op[];
      if (!Array.isArray(ops)) throw new Error(JSON.stringify(root));
      if (ops.some(op => op.op === "RunComplete")) return result(ops.find(op => op.op === "RunComplete")?.data);
      if (ops.some(op => op.op === "StepError" || op.op === "StepFailed")) {
        failures.push({ ...root, attempt });
        if (ops.some(op => op.op === "StepFailed") || root.headers["x-inngest-no-retry"] === "true" || attempt === 2) return result();
        attempt++;
        continue;
      }
      record(ops);
      for (const planned of ops.filter(op => op.op === "StepPlanned")) {
        const answer = await call(planned.id, false);
        const done = answer.data as Op[];
        record(done);
        const error = done.find(op => op.op === "StepError" || op.op === "StepFailed");
        if (error) {
          failures.push({ ...answer, step: planned.name, attempt });
          if (error.op === "StepFailed" || error.error?.name === "NonRetriableError" || answer.headers["x-inngest-no-retry"] === "true" || attempt === 2) return result();
          attempt++;
        }
      }
    }
    throw new Error("source executor did not finish");
  }

  it("real SDK wire: two queue failures reach ready with one provider call, one claim and the same row version", async () => {
    normalizeImageForAi.mockRejectedValueOnce(retry("capacity")).mockRejectedValueOnce(retry("wait_timeout"));
    const out = await wire();
    expect(row.status).toBe("ready");
    expect(providerCalls()).toBe(1);
    expect(out.failures.map(f => f.attempt)).toEqual([0, 1]);
    expect(out.failures.map(f => f.headers["x-inngest-no-retry"])).toEqual(["false", "false"]);
    expect(out.ran.filter(entry => entry.id === "claim-source")).toHaveLength(1);
    expect(writesOf("analyzing")).toHaveLength(1);
  });

  it("real SDK wire: exhausted queue attempts are terminal after exactly 3 runs of the step, with no provider call", async () => {
    normalizeImageForAi.mockRejectedValue(retry("capacity"));
    const out = await wire();
    expect(out.failures).toHaveLength(3);
    expect(out.failures.map(f => f.attempt)).toEqual([0, 1, 2]);
    expect(out.failures.map(f => (f.data as Array<{ op: string }>)[0]!.op)).toEqual(["StepError", "StepError", "StepFailed"]);
    expect(normalizeImageForAi).toHaveBeenCalledTimes(3);
    expect(row).toMatchObject({ status: "failed", failureCode: "analysis_failed" });
    expect(providerCalls()).toBe(0);
    expect(analyzeImageStyle).not.toHaveBeenCalled();
  });

  it("real SDK wire: a provider error is terminal on the first attempt", async () => {
    analyzeImageContent.mockRejectedValueOnce(new Error("provider failed"));
    const out = await wire();
    expect(out.failures).toHaveLength(1);
    expect(out.failures[0]!.data).toEqual(expect.arrayContaining([expect.objectContaining({ op: "StepFailed" })]));
    expect(row.status).toBe("failed");
    expect(providerCalls()).toBe(1);
  });

  it("real SDK wire: a persistence failure is terminal and the replay keeps the provider checkpoint", async () => {
    const update = updateCreativeWorkSourceIfUnchanged.getMockImplementation()!;
    let failOnce = true;
    updateCreativeWorkSourceIfUnchanged.mockImplementation(async (...args) => {
      if (args[4].status === "ready" && failOnce) { failOnce = false; throw new Error("storage failed"); }
      return update(...args);
    });
    const out = await wire();
    expect(out.failures[0]!.data).toEqual(expect.arrayContaining([expect.objectContaining({ op: "StepFailed" })]));
    expect(row.status).toBe("failed");
    const replay = await wire({ steps: out.steps, stack: out.stack });
    expect(replay.value).toMatchObject({ status: "failed" });
    expect(providerCalls()).toBe(1);
    expect(analyzeImageStyle).toHaveBeenCalledTimes(1);
    expect(normalizeImageForAi).toHaveBeenCalledTimes(1);
  });
});
