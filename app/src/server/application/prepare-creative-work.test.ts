import { beforeEach, describe, expect, it, vi } from "vitest";

const inferBrief = vi.hoisted(() => vi.fn());
const envState = vi.hoisted(() => ({ qualityRecoveryEnabled: "false" }));
const transactionExecutor = { scope: "preparation-tx" } as never;

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
  updateCreativeWorkDraftIfUnchanged: vi.fn(),
  getCreativeWorkSourceAssetDetails: vi.fn(),
  withCreativeWorkPreparationLock: vi.fn(async (_workspaceId, _workItemId, callback) => callback(transactionExecutor)),
}));
vi.mock("@/server/repositories/brand-kit", () => ({ getBrandKit: vi.fn() }));
vi.mock("@/server/creative-work/copy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/creative-work/copy")>()),
  generateSocialPostCopy: vi.fn(),
}));
vi.mock("./generate-social-post-copy", () => ({ generateSocialPostCopy: vi.fn() }));
vi.mock("@/server/validation/env", () => ({
  env: {
    get CREATIVE_WORK_QUALITY_RECOVERY_ENABLED() {
      return envState.qualityRecoveryEnabled;
    },
  },
}));
vi.mock("@/server/creative-work/prepare", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/creative-work/prepare")>()),
  inferSocialPostBrief: inferBrief,
}));

import { generateSocialPostCopy, CreativeCopyContextError } from "@/server/creative-work/copy";
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
    envState.qualityRecoveryEnabled = "false";
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

  it("routes copy-safe brand context while keeping the visual fields explicit", async () => {
    getKit.mockResolvedValue({
      name: "Cenbrap",
      description: "Educação clínica para profissionais",
      toneNotes: "Técnico e acolhedor",
      constraints: "Não usar elementos 3D decorativos",
      toneOfVoice: "Direto",
      requiredElements: "Apoio à decisão: não substitui avaliação médica",
      prohibitedElements: "Sem promessas de cura",
    } as never);
    getWork.mockResolvedValue({ work, outputs: [], sources: [] } as never);

    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });

    expect(result.ok).toBe(true);
    expect(generateCopy).toHaveBeenCalledWith(expect.objectContaining({
      description: "Educação clínica para profissionais",
      toneNotes: "Técnico e acolhedor",
      constraints: "Não usar elementos 3D decorativos",
    }));
  });

  it("persists an exploratory briefing with an unknown offer instead of using the theme as fallback", async () => {
    const sparseWork = { ...work, toolKind: "single", request: "Algo moderno para Instagram" };
    getWork.mockResolvedValue({ work: sparseWork, outputs: [], sources: [] } as never);
    inferBrief.mockReturnValue({ theme: "Algo moderno para Instagram", objective: "Promover Algo moderno para Instagram", audience: "", offer: null });

    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.briefing).toMatchObject({
        readiness: "exploratory",
        confidence: "low",
        offer: { value: null, state: "unknown" },
      });
      expect(result.value.quote).toBeDefined();
    }
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      inputSnapshot: expect.objectContaining({
        inferredBriefing: expect.objectContaining({
          offer: { value: null, state: "unknown" },
          readiness: "exploratory",
        }),
      }),
    }), transactionExecutor);
  });

  it("freezes the selected font and layout into the Peça única input snapshot", async () => {
    const single = {
      ...work,
      toolKind: "single",
      format: "4:5",
      settings: {
        targetFormats: [],
        formatMode: "manual",
        textLayout: "bottom",
        fontAssetKey: "fonts/body.ttf",
      },
    } as const;
    getWork.mockResolvedValue({ work: single, outputs: [], sources: [] } as never);
    getKit.mockResolvedValue({
      name: "Cenbrap",
      toneOfVoice: "Direto",
      requiredElements: null,
      prohibitedElements: null,
      brandFontAssets: [
        { assetKey: "fonts/headline.ttf" },
        { assetKey: "fonts/body.ttf" },
      ],
    } as never);

    await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });

    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      inputSnapshot: expect.objectContaining({
        typographyPlan: expect.objectContaining({
          version: 1,
          execution: "deterministic",
          format: "4:5",
          requestedLayout: "bottom",
          fontAssetKey: "fonts/body.ttf",
          fontSelection: "operator_selected",
        }),
      }),
    }), transactionExecutor);
  });

  it("rejects a pending font selected from a stale draft", async () => {
    getWork.mockResolvedValue({
      work: {
        ...work,
        toolKind: "single",
        settings: {
          targetFormats: [],
          formatMode: "manual",
          textLayout: "top",
          fontAssetKey: "fonts/pending.ttf",
        },
      },
      outputs: [],
      sources: [],
    } as never);
    getKit.mockResolvedValue({
      brandFontAssets: [{
        assetKey: "fonts/pending.ttf",
        family: "Pending Sans",
        source: "Upload",
        weight: 400,
        style: "normal",
        sha256: "pending",
        reviewStatus: "pending_approval",
        uploadedAt: "2026-08-13T10:00:00.000Z",
        uploadedByUserId: "user-1",
        approvedAt: null,
        approvedByUserId: null,
      }],
    } as never);

    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }))
      .resolves.toEqual({ ok: false, error: { code: "invalid_preparation" } });
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it("does not persist the Peça Única envelope for other protocols", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [] } as never);

    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).not.toHaveProperty("briefing");
    const patch = updateDraft.mock.calls[0]?.[3] as { inputSnapshot: Record<string, unknown> };
    expect(patch.inputSnapshot).not.toHaveProperty("inferredBriefing");
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
    // Real round trip: the first prepare persists the snapshot (fact pack
    // included); the second prepare must reuse it without regenerating copy.
    let current = { ...work } as typeof work & { inputSnapshot?: unknown; brief?: unknown; copy?: unknown };
    getWork.mockImplementation(async () => ({ work: current, outputs: [], sources: [] } as never));
    updateDraft.mockImplementation(async (_ws, _id, _updatedAt, patch) => {
      current = { ...current, ...patch } as typeof current;
      return current as never;
    });
    const first = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    const second = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(generateCopy).toHaveBeenCalledOnce();
    expect(updateDraft).toHaveBeenCalledOnce();
  });

  it("reuses preparation when the persisted snapshot only differs in jsonb key order", async () => {
    // PostgreSQL jsonb does not preserve key order: a snapshot read back with
    // recursively reordered keys is still the same input and must hit the
    // reuse branch — no copy regeneration, no draft update.
    const reverseKeys = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reverseKeys);
      if (value !== null && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>).reverse().map(([key, entry]) => [key, reverseKeys(entry)]),
        );
      }
      return value;
    };
    let current = { ...work } as typeof work & { inputSnapshot?: unknown; brief?: unknown; copy?: unknown };
    getWork.mockImplementation(async () => ({ work: current, outputs: [], sources: [] } as never));
    updateDraft.mockImplementation(async (_ws, _id, _updatedAt, patch) => {
      current = { ...current, ...patch } as typeof current;
      return current as never;
    });

    const first = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(first.ok).toBe(true);
    const persistedSnapshot = current.inputSnapshot;
    const reorderedSnapshot = reverseKeys(persistedSnapshot);
    expect(JSON.stringify(reorderedSnapshot)).not.toBe(JSON.stringify(persistedSnapshot));
    current = { ...current, inputSnapshot: reorderedSnapshot };

    const second = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });

    expect(second.ok).toBe(true);
    expect(generateCopy).toHaveBeenCalledOnce();
    expect(updateDraft).toHaveBeenCalledOnce();
  });

  it("re-prepares an unchanged snapshot written before the fact pack existed, rebuilding only the missing block", async () => {
    const snapshot = { request: work.request, settings: work.settings, sources: [] };
    getWork.mockResolvedValue({ work: {
      ...work, inputSnapshot: snapshot,
      brief: { theme: "Tema", objective: "Objetivo", audience: "Público", offer: "Oferta" },
      copy: { headline: "H", body: "B", cta: "C" },
    }, outputs: [], sources: [] } as never);
    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(result.ok).toBe(true);
    expect(generateCopy).toHaveBeenCalledOnce();
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      inputSnapshot: expect.objectContaining({
        request: work.request,
        sources: [],
        factPack: expect.objectContaining({ version: 1, request: work.request }),
      }),
    }), transactionExecutor);
  });

  it("freezes the policy version as legacy into the snapshot while the switch is disabled", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [] } as never);
    await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      inputSnapshot: expect.objectContaining({ generationPolicyVersion: "legacy" }),
    }), transactionExecutor);
  });

  it("freezes quality_recovery_v1 into the snapshot while the switch is enabled", async () => {
    envState.qualityRecoveryEnabled = "true";
    getWork.mockResolvedValue({ work, outputs: [], sources: [] } as never);
    await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      inputSnapshot: expect.objectContaining({ generationPolicyVersion: "quality_recovery_v1" }),
    }), transactionExecutor);
  });

  it("re-prepares an old legacy snapshot when the enabled switch changes the resolved version", async () => {
    envState.qualityRecoveryEnabled = "true";
    const snapshot = { request: work.request, settings: work.settings, sources: [] };
    getWork.mockResolvedValue({ work: {
      ...work, inputSnapshot: snapshot,
      brief: { theme: "Tema", objective: "Objetivo", audience: "Público", offer: "Oferta" },
      copy: { headline: "H", body: "B", cta: "C" },
    }, outputs: [], sources: [] } as never);
    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(result.ok).toBe(true);
    expect(generateCopy).toHaveBeenCalledOnce();
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      inputSnapshot: expect.objectContaining({ generationPolicyVersion: "quality_recovery_v1" }),
    }), transactionExecutor);
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

  it("freezes a fact pack with the full request, all content facts and provenance — never style-only facts", async () => {
    const longRequest =
      "Post para o consultório de Psicologia: grupo de terapia começa em agosto, vagas limitadas, atendimento online. " +
      "Explique como funciona o grupo, quem conduz os encontros semanais e por que começar agora faz diferença.";
    const contentAnalysis = (product: string, offer: string) => ({
      product, offer,
      cta: { text: "Inscreva-se", style: "botão" },
      brandElements: [], keyVisual: "roda de conversa",
      textContent: { headline: "Cuide da sua mente", bullets: [] }, format: "4:5",
    });
    getWork.mockResolvedValue({ work: { ...work, toolKind: "single", request: longRequest }, outputs: [], sources: [
      { id: "source-content-1", status: "ready", usage: "content", usageConfirmed: true, updatedAt: now, contentAnalysis: contentAnalysis("Grupo de terapia", "Inscrições abertas"), styleAnalysis: null },
      { id: "source-content-2", status: "ready", usage: "both", usageConfirmed: true, updatedAt: now, contentAnalysis: contentAnalysis("Mentoria individual", "Turma de agosto"), styleAnalysis: null },
      { id: "source-style", status: "ready", usage: "style", usageConfirmed: true, updatedAt: now, contentAnalysis: contentAnalysis("Condomínio fechado", "R$ 900.000 à vista"), styleAnalysis: { description: "Editorial" } },
    ] } as never);

    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });

    expect(result.ok).toBe(true);
    // The full, untruncated request reaches both the snapshot and the copy call.
    expect(generateCopy).toHaveBeenCalledWith(expect.objectContaining({
      factPack: expect.objectContaining({ request: longRequest }),
    }));
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      inputSnapshot: expect.objectContaining({
        factPack: expect.objectContaining({
          version: 1,
          request: longRequest,
          facts: expect.arrayContaining([
            expect.objectContaining({ value: "agosto", class: "date", required: true, origin: "request" }),
            expect.objectContaining({ value: "vagas limitadas", class: "condition", required: true, origin: "request" }),
            expect.objectContaining({ value: "Grupo de terapia", class: "product", origin: "source", sourceId: "source-content-1" }),
            expect.objectContaining({ value: "Mentoria individual", class: "product", origin: "source", sourceId: "source-content-2" }),
            expect.objectContaining({ value: "Cenbrap", class: "brand", required: true, origin: "brand" }),
          ]),
        }),
        inferredBriefing: expect.objectContaining({
          offer: { value: "Inscrições abertas", state: "sourced" },
        }),
      }),
    }), transactionExecutor);
    const patch = updateDraft.mock.calls[0]?.[3] as { inputSnapshot: { factPack: unknown } };
    const serialized = JSON.stringify(patch.inputSnapshot.factPack);
    expect(serialized).not.toContain("Condomínio fechado");
    expect(serialized).not.toContain("R$ 900.000");
    expect(serialized).not.toContain("Público da marca");
  });

  it("fails as invalid_context before persistence when the copy keeps claims without origin", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [] } as never);
    generateCopy.mockRejectedValue(new CreativeCopyContextError([
      { class: "price", value: "50%", field: "headline" },
    ]));

    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }))
      .resolves.toEqual({
        ok: false,
        error: { code: "invalid_context", details: { violations: [{ class: "price", value: "50%", field: "headline" }] } },
      });
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it("propagates provider failures from copy generation instead of masking them as invalid_context", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [] } as never);
    generateCopy.mockRejectedValue(new Error("provider unavailable"));
    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }))
      .rejects.toThrow("provider unavailable");
    expect(updateDraft).not.toHaveBeenCalled();
  });

  describe("restyle brand conflict (R-003)", () => {
    // Canonical XTB case: the content art explicitly carries the broker brand
    // XTB while the workspace active brand is Cenbrap.
    const xtbContentAnalysis = {
      product: "Corretora XTB",
      offer: "",
      cta: { text: "Invista", style: "botão" },
      brandElements: ["logo da XTB", "paleta azul"],
      keyVisual: "gráficos de mercado",
      textContent: { headline: "Invista com a XTB", bullets: [] },
      format: "4:5",
    };
    const styleAnalysis = { description: "Editorial escuro" };
    const restyleSources = [
      { id: "source-content", assetId: "asset-content", status: "ready", usage: "both", usageConfirmed: true, updatedAt: now, contentAnalysis: xtbContentAnalysis, styleAnalysis: null },
      { id: "source-style", assetId: "asset-style", status: "ready", usage: "both", usageConfirmed: true, updatedAt: now, contentAnalysis: null, styleAnalysis },
    ];
    const restyleAssetDetails = new Map([
      ["source-content", { assetKey: "xtb.png", mimeType: "image/png", source: "upload" }],
      ["source-style", { assetKey: "style.png", mimeType: "image/png", source: "curated_inspiration_copy" }],
    ]);
    const restyleWork = (settings: unknown = { targetFormats: [] }) => ({
      ...work, toolKind: "restyle", request: "", settings,
    });

    function mockRestyleAggregate(settings?: unknown) {
      getWork.mockResolvedValue({
        work: restyleWork(settings ?? { targetFormats: [] }),
        outputs: [],
        sources: restyleSources,
      } as never);
      getSourceAssets.mockResolvedValue(restyleAssetDetails as never);
      inferBrief.mockReturnValue({ theme: "Corretora XTB", objective: "Reestilizar", audience: "", offer: "Investimentos" });
    }

    it("blocks preparation with a typed brand_conflict before copy, persistence or billing", async () => {
      mockRestyleAggregate();
      const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
      expect(result).toEqual({
        ok: false,
        error: {
          code: "brand_conflict",
          details: {
            detectedBrand: "XTB",
            activeBrand: "Cenbrap",
            sourceId: "source-content",
            choices: ["source", "active"],
          },
        },
      });
      expect(generateCopy).not.toHaveBeenCalled();
      expect(updateDraft).not.toHaveBeenCalled();
    });

    it("resumes the same draft with the source brand once the source choice is saved", async () => {
      getKit.mockResolvedValue({ name: "Cenbrap", toneOfVoice: "Direto", requiredElements: "Logo Cenbrap", prohibitedElements: "Clipart" } as never);
      // 1) The same draft first blocks on the conflict.
      mockRestyleAggregate();
      const blocked = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
      expect(blocked).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "brand_conflict" }) }));
      expect(generateCopy).not.toHaveBeenCalled();
      expect(updateDraft).not.toHaveBeenCalled();

      // 2) The persisted choice — bound to the detected brand it answered —
      // lets the SAME draft prepare without asking again; copy is generated
      // once, for the resumed prepare only.
      mockRestyleAggregate({ targetFormats: [], brandConflictChoice: "source", brandConflictDetectedBrand: "XTB" });
      const resumed = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
      expect(resumed.ok).toBe(true);
      expect(generateCopy).toHaveBeenCalledOnce();
      // The copy speaks for the art's brand; the active kit's voice/elements
      // belong to the other brand and stay out.
      expect(generateCopy).toHaveBeenCalledWith(expect.objectContaining({
        brandName: "XTB",
        toneOfVoice: null,
        requiredElements: null,
        prohibitedElements: null,
      }));
      expect(updateDraft).toHaveBeenCalledOnce();
      expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
        inputSnapshot: expect.objectContaining({
          settings: expect.objectContaining({ brandConflictChoice: "source", brandConflictDetectedBrand: "XTB" }),
          factPack: expect.objectContaining({
            identity: { clientProfileId: "profile-1", brandName: "XTB", brandAuthority: "source" },
            brand: { requiredElements: [], prohibitedElements: [] },
            facts: expect.arrayContaining([
              expect.objectContaining({ value: "XTB", class: "brand", required: true, origin: "brand" }),
            ]),
          }),
        }),
      }), transactionExecutor);
      const patch = updateDraft.mock.calls[0]?.[3] as { inputSnapshot: { factPack: unknown } };
      expect(JSON.stringify(patch.inputSnapshot.factPack)).not.toContain('"Cenbrap"');
    });

    it("converts to the active brand when the saved choice is active", async () => {
      mockRestyleAggregate({ targetFormats: [], brandConflictChoice: "active", brandConflictDetectedBrand: "XTB" });
      const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
      expect(result.ok).toBe(true);
      expect(generateCopy).toHaveBeenCalledWith(expect.objectContaining({ brandName: "Cenbrap", toneOfVoice: "Direto" }));
      expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
        inputSnapshot: expect.objectContaining({
          factPack: expect.objectContaining({
            identity: { clientProfileId: "profile-1", brandName: "Cenbrap", brandAuthority: "active" },
            facts: expect.arrayContaining([
              expect.objectContaining({ value: "Cenbrap", class: "brand", required: true, origin: "brand" }),
            ]),
          }),
        }),
      }), transactionExecutor);
    });

    it("asks again when the saved choice was bound to a different detected brand", async () => {
      // The old choice answered an XTB conflict; the current draft now
      // carries an explicit Nu art — the stale binding never auto-resolves it.
      const nuContentAnalysis = {
        product: "Banco Nu",
        offer: "",
        cta: { text: "Abra sua conta", style: "botão" },
        brandElements: ["logo Nu"],
        keyVisual: "cartão roxo",
        textContent: { headline: "Nu para todos", bullets: [] },
        format: "4:5",
      };
      getWork.mockResolvedValue({
        work: restyleWork({ targetFormats: [], brandConflictChoice: "source", brandConflictDetectedBrand: "XTB" }),
        outputs: [],
        sources: [{ ...restyleSources[0], contentAnalysis: nuContentAnalysis }, restyleSources[1]],
      } as never);
      getSourceAssets.mockResolvedValue(restyleAssetDetails as never);

      const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });

      expect(result).toEqual({
        ok: false,
        error: {
          code: "brand_conflict",
          details: {
            detectedBrand: "Nu",
            activeBrand: "Cenbrap",
            sourceId: "source-content",
            choices: ["source", "active"],
          },
        },
      });
      expect(generateCopy).not.toHaveBeenCalled();
      expect(updateDraft).not.toHaveBeenCalled();
    });

    it("asks again when a saved choice predates the detected-brand binding", async () => {
      // Settings persisted before the binding existed carry only the bare
      // choice — without a matching detectedBrand they never auto-resolve.
      mockRestyleAggregate({ targetFormats: [], brandConflictChoice: "source" });
      const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
      expect(result).toEqual(expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "brand_conflict" }),
      }));
      expect(generateCopy).not.toHaveBeenCalled();
      expect(updateDraft).not.toHaveBeenCalled();
    });

    it("registers the active brand in the fact pack without any question when the art's brand does not conflict", async () => {
      getWork.mockResolvedValue({
        work: restyleWork(),
        outputs: [],
        sources: [
          { ...restyleSources[0], contentAnalysis: { ...xtbContentAnalysis, product: "Consultoria Cenbrap", brandElements: ["logo Cenbrap"], textContent: { headline: "Cenbrap para você", bullets: [] } } },
          restyleSources[1],
        ],
      } as never);
      getSourceAssets.mockResolvedValue(restyleAssetDetails as never);
      inferBrief.mockReturnValue({ theme: "Cenbrap", objective: "Reestilizar", audience: "", offer: "Consultoria" });

      const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });

      expect(result.ok).toBe(true);
      expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
        inputSnapshot: expect.objectContaining({
          factPack: expect.objectContaining({
            identity: { clientProfileId: "profile-1", brandName: "Cenbrap", brandAuthority: "active" },
          }),
        }),
      }), transactionExecutor);
    });

    it("proceeds with the active brand when the detected brands are ambiguous", async () => {
      const ambiguousAnalysis = {
        ...xtbContentAnalysis,
        product: "XTB e Nu comparados",
        brandElements: ["logo da XTB", "Nu"],
        textContent: { headline: "XTB ou Nu: compare", bullets: [] },
      };
      getWork.mockResolvedValue({
        work: restyleWork(),
        outputs: [],
        sources: [{ ...restyleSources[0], contentAnalysis: ambiguousAnalysis }, restyleSources[1]],
      } as never);
      getSourceAssets.mockResolvedValue(restyleAssetDetails as never);
      inferBrief.mockReturnValue({ theme: "Comparativo", objective: "Reestilizar", audience: "", offer: "Investimentos" });

      const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });

      expect(result.ok).toBe(true);
      expect(generateCopy).toHaveBeenCalledWith(expect.objectContaining({ brandName: "Cenbrap" }));
    });

    it("never asks about brands outside restyle, even with an explicit foreign brand", async () => {
      getWork.mockResolvedValue({
        work: { ...work, toolKind: "variations" },
        outputs: [],
        sources: [{ id: "source-content", assetId: "asset-content", status: "ready", usage: "content", usageConfirmed: true, updatedAt: now, contentAnalysis: xtbContentAnalysis, styleAnalysis: null }],
      } as never);
      getSourceAssets.mockResolvedValue(new Map([["source-content", { assetKey: "xtb.png", mimeType: "image/png", source: "upload" }]]) as never);

      const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });

      expect(result.ok).toBe(true);
      expect(result).not.toMatchObject({ error: { code: "brand_conflict" } });
      expect(generateCopy).toHaveBeenCalledOnce();
    });
  });
});
