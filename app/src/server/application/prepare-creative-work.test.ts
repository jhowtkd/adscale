import { beforeEach, describe, expect, it, vi } from "vitest";

const inferBrief = vi.hoisted(() => vi.fn());
const transactionExecutor = { scope: "preparation-tx" } as never;

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
  updateCreativeWorkDraftIfUnchanged: vi.fn(),
  getCreativeWorkSourceAssetDetails: vi.fn(),
  withCreativeWorkPreparationLock: vi.fn(async (_workspaceId, _workItemId, callback) => callback(transactionExecutor)),
}));
vi.mock("@/server/repositories/brand-kit", () => ({ getBrandKit: vi.fn() }));
vi.mock("@/server/creative-work/copy", () => ({ generateSocialPostCopy: vi.fn() }));
vi.mock("./generate-social-post-copy", () => ({ generateSocialPostCopy: vi.fn() }));
vi.mock("@/server/creative-work/prepare", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/creative-work/prepare")>()),
  inferSocialPostBrief: inferBrief,
}));

import { generateSocialPostCopy } from "@/server/creative-work/copy";
import {
  getCreativeWork,
  updateCreativeWorkDraftIfUnchanged,
  getCreativeWorkSourceAssetDetails,
  withCreativeWorkPreparationLock,
} from "@/server/repositories/creative-work";
import { getBrandKit } from "@/server/repositories/brand-kit";
import { prepareCreativeWork } from "./prepare-creative-work";
import { generateSocialPostCopy as generatePaidCopy } from "./generate-social-post-copy";

const getWork = vi.mocked(getCreativeWork);
const updateDraft = vi.mocked(updateCreativeWorkDraftIfUnchanged);
const getSourceAssets = vi.mocked(getCreativeWorkSourceAssetDetails);
const withLock = vi.mocked(withCreativeWorkPreparationLock);
const getKit = vi.mocked(getBrandKit);
const generateCopy = vi.mocked(generateSocialPostCopy);
const now = new Date("2026-07-16T12:00:00.000Z");
const work = {
  id: "work-1", workspaceId: "ws-1", clientProfileId: "profile-1", createdByUserId: "user-1",
  draftKey: "draft-1", title: "Promoção", request: "Promoção de matrícula para julho", campaignId: null,
  toolKind: "variations", status: "draft", brief: null, format: "4:5", settings: { targetFormats: [] },
  inputSnapshot: null, copy: null, identitySnapshot: null, createdAt: now, updatedAt: now,
} as const;

describe("prepareCreativeWork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withLock.mockImplementation(async (_workspaceId, _workItemId, callback) => callback(transactionExecutor) as never);
    getKit.mockResolvedValue({ name: "Cenbrap", toneOfVoice: "Direto", requiredElements: null, prohibitedElements: null } as never);
    generateCopy.mockResolvedValue({ headline: "Julho", body: "Matricule-se", cta: "Saiba mais" });
    inferBrief.mockReturnValue({ theme: work.request, objective: "Promover matrícula", audience: "Público", offer: "Matrícula" });
    updateDraft.mockImplementation(async (_ws, _id, _updatedAt, patch) => ({ ...work, ...patch } as never));
    getSourceAssets.mockResolvedValue(new Map());
  });

  it("persists inferred brief and pure copy without a billing adapter", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [] } as never);
    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(result.ok).toBe(true);
    expect(generateCopy).toHaveBeenCalledOnce();
    expect(generatePaidCopy).not.toHaveBeenCalled();
    expect(getWork).toHaveBeenCalledWith("ws-1", "work-1", transactionExecutor);
    expect(getKit).toHaveBeenCalledWith("ws-1", "profile-1", transactionExecutor);
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      brief: expect.objectContaining({ theme: "Promoção de matrícula para julho" }),
      copy: { headline: "Julho", body: "Matricule-se", cta: "Saiba mais" },
    }), transactionExecutor);
    if (result.ok) expect(result.value.quote).toMatchObject({ unitCount: 3, credits: 15 });
  });

  it("serializes identical concurrent prepares and calls copy once", async () => {
    let current = { ...work } as typeof work & { inputSnapshot?: unknown; brief?: unknown; copy?: unknown };
    let tail = Promise.resolve();
    withLock.mockImplementation((_ws, _id, callback) => {
      const run = tail.then(() => callback(transactionExecutor));
      tail = run.then(() => undefined);
      return run as never;
    });
    getWork.mockImplementation(async () => ({ work: current, outputs: [], sources: [] } as never));
    updateDraft.mockImplementation(async (_ws, _id, _updatedAt, patch) => {
      current = { ...current, ...patch } as typeof current;
      return current as never;
    });
    const [first, second] = await Promise.all([
      prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }),
      prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(generateCopy).toHaveBeenCalledOnce();
  });

  it("returns stale input when CAS loses to autosave or source change", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [] } as never);
    updateDraft.mockResolvedValue(null);
    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }))
      .resolves.toEqual({ ok: false, error: { code: "stale_input" } });
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.any(Object), transactionExecutor);
  });

  it("rejects a non-draft before inference or copy", async () => {
    getWork.mockResolvedValue({ work: { ...work, status: "ready" }, outputs: [], sources: [] } as never);
    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }))
      .resolves.toEqual({ ok: false, error: { code: "work_not_draft" } });
    expect(inferBrief).not.toHaveBeenCalled();
    expect(generateCopy).not.toHaveBeenCalled();
  });

  it("rejects malformed inferred briefs before copy or persistence", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [] } as never);
    inferBrief.mockReturnValue({ theme: "", objective: "", audience: "", offer: "" });
    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }))
      .resolves.toEqual({ ok: false, error: { code: "invalid_preparation" } });
    expect(generateCopy).not.toHaveBeenCalled();
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it.each([
    ["request", { request: "Pedido anterior", settings: work.settings, sources: [] }],
    ["settings", { request: work.request, settings: { targetFormats: ["1:1"] }, sources: [] }],
    ["source timestamp", { request: work.request, settings: work.settings, sources: [{ sourceId: "source-1", updatedAt: "2026-07-15T00:00:00.000Z" }] }],
  ])("invalidates cached preparation when %s changes", async (_case, inputSnapshot) => {
    getWork.mockResolvedValue({ work: {
      ...work, inputSnapshot,
      brief: { theme: "Tema", objective: "Objetivo", audience: "Público", offer: "Oferta" },
      copy: { headline: "H", body: "B", cta: "C" },
    }, outputs: [], sources: _case === "source timestamp" ? [{
      id: "source-1", status: "ready", updatedAt: new Date("2026-07-16T00:00:00.000Z"),
      usage: "content", usageConfirmed: true, contentAnalysis: null, styleAnalysis: null,
    }] : [] } as never);
    await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(generateCopy).toHaveBeenCalledOnce();
  });

  it("reuses persisted preparation when the input snapshot is unchanged", async () => {
    const snapshot = { request: work.request, settings: work.settings, sources: [] };
    getWork.mockResolvedValue({ work: {
      ...work, inputSnapshot: snapshot,
      brief: { theme: "Tema", objective: "Objetivo", audience: "Público", offer: "Oferta" },
      copy: { headline: "H", body: "B", cta: "C" },
    }, outputs: [], sources: [] } as never);
    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(result.ok).toBe(true);
    expect(generateCopy).not.toHaveBeenCalled();
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it("blocks while a source is still analyzing", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [{ status: "analyzing" }] } as never);
    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }))
      .resolves.toEqual({ ok: false, error: { code: "sources_not_ready" } });
    expect(generateCopy).not.toHaveBeenCalled();
  });

  it("requires an explicit usage choice for sources in the flexible single-piece flow", async () => {
    getWork.mockResolvedValue({ work: { ...work, toolKind: "single" }, outputs: [], sources: [{
      id: "source-1", status: "ready", usage: "both", usageConfirmed: false,
      updatedAt: now, contentAnalysis: null, styleAnalysis: null,
    }] } as never);

    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }))
      .resolves.toEqual({ ok: false, error: { code: "source_usage_required" } });
    expect(generateCopy).not.toHaveBeenCalled();
  });

  it("infers content and style roles for a restyle without asking the user", async () => {
    getWork.mockResolvedValue({ work: { ...work, toolKind: "restyle", request: "" }, outputs: [], sources: [
      { id: "source-style", assetId: "asset-style", status: "ready", usage: "both", usageConfirmed: false, updatedAt: now, contentAnalysis: null, styleAnalysis: { description: "Editorial" } },
      { id: "source-content", assetId: "asset-content", status: "ready", usage: "both", usageConfirmed: false, updatedAt: now, contentAnalysis: { product: "Curso" }, styleAnalysis: null },
    ] } as never);
    getSourceAssets.mockResolvedValue(new Map([
      ["source-style", { assetKey: "style.png", mimeType: "image/png", source: "curated_inspiration_copy" }],
      ["source-content", { assetKey: "content.png", mimeType: "image/png", source: "upload" }],
    ]) as never);
    inferBrief.mockReturnValue({ theme: "Curso", objective: "Reestilizar", audience: "Público", offer: "Curso" });

    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });

    expect(result.ok).toBe(true);
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      inputSnapshot: expect.objectContaining({ sources: expect.arrayContaining([
        expect.objectContaining({ sourceId: "source-style", usage: "style" }),
        expect.objectContaining({ sourceId: "source-content", usage: "content" }),
      ]) }),
    }), transactionExecutor);
  });

  it("infers the format from ready content analysis while the draft is in auto mode", async () => {
    const contentAnalysis = {
      product: "Curso", offer: "20%", cta: { text: "Inscreva-se", style: "botão" },
      brandElements: [], keyVisual: "Aluna", textContent: { headline: "Aprenda", bullets: [] }, format: "story 9:16",
    };
    getWork.mockResolvedValue({
      work: { ...work, settings: { targetFormats: [], formatMode: "auto" } },
      outputs: [],
      sources: [{ id: "source-1", status: "ready", usage: "content", usageConfirmed: true, updatedAt: now, contentAnalysis, styleAnalysis: null }],
    } as never);

    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });

    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({ format: "9:16" }), transactionExecutor);
    if (result.ok) expect(result.value.quote.plans).toEqual(expect.arrayContaining([expect.objectContaining({ targetFormat: "9:16" })]));
  });

  it("freezes ready source asset keys and analyses in the input snapshot", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [{
      id: "source-1", assetId: "asset-1", status: "ready", updatedAt: now,
      usage: "style", usageConfirmed: true, contentAnalysis: null, styleAnalysis: { description: "Editorial" },
    }] } as never);
    getSourceAssets.mockResolvedValue(new Map([["source-1", { assetKey: "workspaces/ws/source.png", mimeType: "image/png", source: "upload" }]]));
    await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      inputSnapshot: expect.objectContaining({ sources: [expect.objectContaining({ assetKey: "workspaces/ws/source.png", mimeType: "image/png", style: { description: "Editorial" } })] }),
    }), transactionExecutor);
  });
});
