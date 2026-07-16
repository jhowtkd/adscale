import { beforeEach, describe, expect, it, vi } from "vitest";

const getCreativeWork = vi.hoisted(() => vi.fn());
const getWorkspaceAssetById = vi.hoisted(() => vi.fn());
const getTemplateById = vi.hoisted(() => vi.fn());
const updateCreativeWorkSource = vi.hoisted(() => vi.fn());
const getObject = vi.hoisted(() => vi.fn());
const analyzeImageContent = vi.hoisted(() => vi.fn());
const analyzeImageStyle = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({ getCreativeWork, updateCreativeWorkSource }));
vi.mock("@/server/repositories/workspace-asset", () => ({ getWorkspaceAssetById }));
vi.mock("@/server/repositories/template", () => ({ getTemplateById }));
vi.mock("@/server/storage", () => ({ objectStorage: { get: getObject } }));
vi.mock("@/server/ai/image-analysis", () => ({ analyzeImageContent, analyzeImageStyle }));

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
  return { id, workspaceId: "ws-1", workItemId: "work-1", assetId: `asset-${id}`, templateId: null, usage, status: "uploaded" };
}

describe("analyzeCreativeWorkSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWorkspaceAssetById.mockResolvedValue({ id: "asset-source-1", workspaceId: "ws-1", key: "trusted/key.png", type: "image/png" });
    getObject.mockResolvedValue(Buffer.from("image"));
    analyzeImageContent.mockResolvedValue(content);
    analyzeImageStyle.mockResolvedValue(style);
    updateCreativeWorkSource.mockImplementation(async (_ws, _work, id, patch) => ({ ...source(id, "both"), ...patch }));
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
    expect(updateCreativeWorkSource).toHaveBeenLastCalledWith("ws-1", "work-1", "source-1", expect.objectContaining({ status: "ready" }));
  });

  it("keeps two source transitions independent when one fails", async () => {
    const sources = [source("source-1", "content"), source("source-2", "content")];
    getCreativeWork.mockResolvedValue({ work: {}, outputs: [], sources });
    getWorkspaceAssetById.mockImplementation(async (id) => ({ id, workspaceId: "ws-1", key: `${id}.png`, type: "image/png" }));
    analyzeImageContent.mockRejectedValueOnce(new Error("provider secret")).mockResolvedValueOnce(content);

    await expect(analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1" })).rejects.toThrow();
    await analyzeCreativeWorkSource({ workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-2" });

    expect(updateCreativeWorkSource).toHaveBeenCalledWith("ws-1", "work-1", "source-1", { status: "failed", failureCode: "analysis_failed" });
    expect(updateCreativeWorkSource).toHaveBeenCalledWith("ws-1", "work-1", "source-2", expect.objectContaining({ status: "ready", contentAnalysis: content }));
  });
});
