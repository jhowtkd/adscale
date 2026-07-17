import { beforeEach, describe, expect, it, vi } from "vitest";

const getCreativeWork = vi.hoisted(() => vi.fn());
const getWorkspaceAssetById = vi.hoisted(() => vi.fn());
const getTemplateById = vi.hoisted(() => vi.fn());
const updateCreativeWorkSourceIfUnchanged = vi.hoisted(() => vi.fn());
const getObject = vi.hoisted(() => vi.fn());
const analyzeImageContent = vi.hoisted(() => vi.fn());
const analyzeImageStyle = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({ getCreativeWork, updateCreativeWorkSourceIfUnchanged }));
vi.mock("@/server/repositories/workspace-asset", () => ({ getWorkspaceAssetById }));
vi.mock("@/server/repositories/template", () => ({ getTemplateById }));
vi.mock("@/server/storage", () => ({ objectStorage: { get: getObject } }));
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
  beforeEach(() => {
    vi.clearAllMocks();
    getWorkspaceAssetById.mockResolvedValue({ id: "asset-source-1", workspaceId: "ws-1", key: "trusted/key.png", type: "image/png" });
    getObject.mockResolvedValue(Buffer.from("image"));
    analyzeImageContent.mockResolvedValue(content);
    analyzeImageStyle.mockResolvedValue(style);
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

  it("keeps two source transitions independent when one fails", async () => {
    const sources = [source("source-1", "content"), source("source-2", "content")];
    getCreativeWork.mockResolvedValue({ work: {}, outputs: [], sources });
    getWorkspaceAssetById.mockImplementation(async (id) => ({ id, workspaceId: "ws-1", key: `${id}.png`, type: "image/png" }));
    analyzeImageContent.mockRejectedValueOnce(new Error("provider secret")).mockResolvedValueOnce(content);

    await expect(analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" })).rejects.toThrow();
    await analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-2" });

    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenCalledWith("ws-1", "work-1", "source-1", expect.objectContaining({ status: "analyzing" }), { status: "failed", failureCode: "analysis_failed" });
    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenCalledWith("ws-1", "work-1", "source-2", expect.objectContaining({ status: "analyzing" }), expect.objectContaining({ status: "ready", contentAnalysis: content }));
  });

  it("does not let an old job overwrite a newer usage or manual edit", async () => {
    const current = { ...source("source-1", "style"), status: "analyzing", updatedAt: new Date("2026-07-16T12:00:00.002Z") };
    getCreativeWork
      .mockResolvedValueOnce({ work: {}, outputs: [], sources: [source("source-1", "content")] })
      .mockResolvedValueOnce({ work: {}, outputs: [], sources: [current] });
    updateCreativeWorkSourceIfUnchanged
      .mockResolvedValueOnce({ ...source("source-1", "content"), status: "analyzing", updatedAt: new Date("2026-07-16T12:00:00.001Z") })
      .mockResolvedValueOnce(null);

    await expect(analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" })).resolves.toEqual(current);

    expect(updateCreativeWorkSourceIfUnchanged).toHaveBeenLastCalledWith(
      "ws-1", "work-1", "source-1",
      { status: "analyzing", usage: "content", updatedAt: new Date("2026-07-16T12:00:00.001Z") },
      expect.objectContaining({ status: "ready" }),
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
