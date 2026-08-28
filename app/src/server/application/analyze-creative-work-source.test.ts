import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

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

import { analyzeCreativeWorkSource } from "./analyze-creative-work-source";

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
