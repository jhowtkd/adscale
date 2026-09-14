import { beforeEach, describe, expect, it, vi } from "vitest";

const inferBrief = vi.hoisted(() => vi.fn());
const reviewBrief = vi.hoisted(() => vi.fn());
const envState = vi.hoisted(() => ({
  qualityRecoveryEnabled: "false",
  sunburstPercent: 100,
  sunburstQuality: "max" as const,
}));
// Continua sendo o executor da FASE 1 (leituras e validações dentro do lock).
// A partir da Task 15 a persistência acontece na fase 3, FORA da transação,
// então updateCreativeWorkDraftIfUnchanged deixou de receber um 5º argumento.
const transactionExecutor = { scope: "preparation-tx" } as never;

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
  updateCreativeWorkDraftIfUnchanged: vi.fn(),
  getCreativeWorkSourceAssetDetails: vi.fn(),
  withCreativeWorkPreparationLock: vi.fn(async (_workspaceId, _workItemId, callback) => callback(transactionExecutor)),
}));
// Dependencia nova da Task 15: a preparacao reserva uma tentativa antes de
// sair da transacao. Sem este duplo, claimPreparationAttempt vai ao banco real.
// O caminho de concorrencia de verdade e coberto pela suite de integracao
// (tests/integration/creative-work-preparation-concurrency.test.ts).
vi.mock("@/server/repositories/creative-work-preparation", () => ({
  claimPreparationAttempt: vi.fn(async () => ({
    outcome: "claimed" as const,
    attempt: { id: "attempt-unit" },
  })),
  finalizePreparationAttempt: vi.fn(async () => ({ ok: true as const })),
  renewPreparationAttempt: vi.fn(async () => true),
}));
vi.mock("@/server/repositories/brand-kit", () => ({ getBrandKit: vi.fn() }));
vi.mock("@/server/repositories/brand-knowledge", () => ({ getActiveBrandKnowledgeVersion: vi.fn() }));
vi.mock("@/server/repositories/brand-training-sessions", () => ({ loadCalibrationCandidateForWork: vi.fn() }));
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
    get OPENAI_IMAGE_SUNBURST_PERCENT() {
      return envState.sunburstPercent;
    },
    get OPENAI_IMAGE_SUNBURST_QUALITY() {
      return envState.sunburstQuality;
    },
  },
}));
vi.mock("@/server/creative-work/prepare", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/creative-work/prepare")>()),
  inferSocialPostBrief: inferBrief,
}));
vi.mock("@/server/creative-work/briefing-review", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/creative-work/briefing-review")>()),
  reviewInferredBriefingOnce: reviewBrief,
}));

import { generateSocialPostCopy, CreativeCopyContextError } from "@/server/creative-work/copy";
import {
  getCreativeWork,
  updateCreativeWorkDraftIfUnchanged,
  getCreativeWorkSourceAssetDetails,
  withCreativeWorkPreparationLock,
} from "@/server/repositories/creative-work";
import { getBrandKit } from "@/server/repositories/brand-kit";
import { getActiveBrandKnowledgeVersion } from "@/server/repositories/brand-knowledge";
import { loadCalibrationCandidateForWork } from "@/server/repositories/brand-training-sessions";
import {
  claimPreparationAttempt,
  finalizePreparationAttempt,
  renewPreparationAttempt,
} from "@/server/repositories/creative-work-preparation";
import { logCreativeWorkPreparationAttempt } from "@/server/creative-work/job-telemetry";
vi.mock("@/server/creative-work/job-telemetry", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/creative-work/job-telemetry")>(),
  logCreativeWorkPreparationAttempt: vi.fn(),
}));
import { prepareCreativeWork } from "./prepare-creative-work";
import { generateSocialPostCopy as generatePaidCopy } from "./generate-social-post-copy";

const getWork = vi.mocked(getCreativeWork);
const updateDraft = vi.mocked(updateCreativeWorkDraftIfUnchanged);
const getSourceAssets = vi.mocked(getCreativeWorkSourceAssetDetails);
const withLock = vi.mocked(withCreativeWorkPreparationLock);
const getKit = vi.mocked(getBrandKit);
const getActiveVersion = vi.mocked(getActiveBrandKnowledgeVersion);
const loadCandidate = vi.mocked(loadCalibrationCandidateForWork);
const generateCopy = vi.mocked(generateSocialPostCopy);
const now = new Date("2026-07-16T12:00:00.000Z");
const work = {
  id: "work-1", workspaceId: "ws-1", clientProfileId: "profile-1", createdByUserId: "user-1",
  draftKey: "draft-1", title: "Promoção", request: "Promoção de matrícula para julho", campaignId: null,
  toolKind: "variations", status: "draft", brief: null, format: "4:5", settings: { targetFormats: [] },
  inputSnapshot: null, copy: null, identitySnapshot: null, createdAt: now, updatedAt: now,
} as const;
const readyVariationSource = {
  id: "source-base", assetId: "asset-base", templateId: null, status: "ready" as const,
  usage: "both" as const, usageConfirmed: true, updatedAt: now,
  contentAnalysis: null, styleAnalysis: null, pieceReference: null,
};

describe("prepareCreativeWork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Padrao: a preparacao reserva a tentativa e a finaliza. Testes que
    // exercitam concorrencia sobrescrevem estes valores.
    vi.mocked(claimPreparationAttempt).mockResolvedValue({
      outcome: "claimed",
      attempt: { id: "attempt-unit" },
    } as never);
    vi.mocked(finalizePreparationAttempt).mockResolvedValue({ ok: true } as never);
    vi.mocked(renewPreparationAttempt).mockResolvedValue(true);
    envState.qualityRecoveryEnabled = "false";
    envState.sunburstPercent = 100;
    envState.sunburstQuality = "max";
    withLock.mockImplementation(async (_workspaceId, _workItemId, callback) => callback(transactionExecutor) as never);
    getKit.mockResolvedValue({ name: "Cenbrap", toneOfVoice: "Direto", requiredElements: null, prohibitedElements: null } as never);
    generateCopy.mockResolvedValue({ headline: "Julho", body: "Matricule-se", cta: "Saiba mais" });
    reviewBrief.mockResolvedValue(null);
    inferBrief.mockReturnValue({ theme: work.request, objective: "Promover matrícula", audience: "Público", offer: "Matrícula" });
    updateDraft.mockImplementation(async (_ws, _id, _updatedAt, patch) => ({
      ...work,
      ...patch,
      toolKind: patch.inputSnapshot?.inferredBriefing ? "single" : work.toolKind,
    } as never));
    getSourceAssets.mockResolvedValue(new Map());
    getActiveVersion.mockResolvedValue(null);
    loadCandidate.mockResolvedValue(null);
  });

  it("freezes briefing people from the published catalog into the snapshot", async () => {
    getActiveVersion.mockResolvedValue({
      snapshot: {
        claims: [{
          claimKey: "people.catalog",
          value: {
            version: 1,
            people: [{
              id: "11111111-1111-4111-8111-111111111111",
              name: "Ana",
              aliases: [],
              referenceIds: ["22222222-2222-4222-8222-222222222222"],
              primaryReferenceId: "22222222-2222-4222-8222-222222222222",
              preserve: ["formato do rosto"],
              referenceAdequacy: "confirmed",
            }],
          },
        }],
      },
    } as never);
    getWork.mockResolvedValue({
      work: {
        ...work,
        toolKind: "variations",
        request: "Arte com a Ana apresentando a oferta",
        settings: { targetFormats: [] },
      },
      outputs: [],
      sources: [readyVariationSource],
    } as never);
    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(result.ok).toBe(true);
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      inputSnapshot: expect.objectContaining({
        people: [{
          personId: "11111111-1111-4111-8111-111111111111",
          name: "Ana",
          referenceIds: ["22222222-2222-4222-8222-222222222222"],
          primaryReferenceId: "22222222-2222-4222-8222-222222222222",
          preserve: ["formato do rosto"],
        }],
      }),
    }));
  });

  it("blocks unknown person IDs before copy with catalog options", async () => {
    getActiveVersion.mockResolvedValue({
      snapshot: {
        claims: [{
          claimKey: "people.catalog",
          value: {
            version: 1,
            people: [{
              id: "11111111-1111-4111-8111-111111111111",
              name: "Ana",
              aliases: [],
              referenceIds: ["22222222-2222-4222-8222-222222222222"],
              primaryReferenceId: "22222222-2222-4222-8222-222222222222",
              preserve: [],
              referenceAdequacy: "confirmed",
            }],
          },
        }],
      },
    } as never);
    getWork.mockResolvedValue({
      work: {
        ...work,
        toolKind: "variations",
        settings: { targetFormats: [], personIds: ["99999999-9999-4999-8999-999999999999"] },
      },
      outputs: [],
      sources: [readyVariationSource],
    } as never);
    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" })).resolves.toEqual({
      ok: false,
      error: {
        code: "person_unknown",
        personId: "99999999-9999-4999-8999-999999999999",
        options: [{ id: "11111111-1111-4111-8111-111111111111", name: "Ana" }],
      },
    });
    expect(generateCopy).not.toHaveBeenCalled();
  });

  it("freezes the trained visual direction from the published repertoire", async () => {
    getActiveVersion.mockResolvedValue({
      snapshot: {
        claims: [{
          claimKey: "visual.repertoire",
          value: {
            version: 1,
            common: [{
              id: "11111111-1111-4111-8111-111111111111",
              dimension: "hierarchy",
              observation: "Título domina a leitura",
              application: "Dar ao título escala superior ao texto de apoio",
              avoid: "Competição de dois focos",
              evidenceIds: ["ref-1"],
              confidence: "high",
            }],
            languages: [{
              id: "22222222-2222-4222-8222-222222222222",
              name: "Comercial",
              contexts: ["oferta"],
              rules: [],
            }],
          },
        }],
      },
    } as never);
    getWork.mockResolvedValue({
      work: {
        ...work,
        toolKind: "variations",
        request: "Arte Comercial para a oferta de julho",
        settings: { targetFormats: [] },
      },
      outputs: [],
      sources: [readyVariationSource],
    } as never);
    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(result.ok).toBe(true);
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      inputSnapshot: expect.objectContaining({
        visualDirection: expect.objectContaining({
          languageId: "22222222-2222-4222-8222-222222222222",
          ruleIds: ["11111111-1111-4111-8111-111111111111"],
          dominantIdea: "Dar ao título escala superior ao texto de apoio",
          preserve: ["Competição de dois focos"],
        }),
      }),
    }));
  });

  it("blocks unknown and ambiguous visual languages before copy", async () => {
    getActiveVersion.mockResolvedValue({
      snapshot: {
        claims: [{
          claimKey: "visual.repertoire",
          value: {
            version: 1,
            common: [],
            languages: [
              { id: "22222222-2222-4222-8222-222222222222", name: "Comercial", contexts: ["oferta"], rules: [] },
              { id: "33333333-3333-4333-8333-333333333333", name: "Comercial", contexts: ["varejo"], rules: [] },
            ],
          },
        }],
      },
    } as never);
    getWork.mockResolvedValue({
      work: {
        ...work,
        toolKind: "variations",
        settings: { targetFormats: [], visualLanguageId: "99999999-9999-4999-8999-999999999999" },
      },
      outputs: [],
      sources: [readyVariationSource],
    } as never);
    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" })).resolves.toEqual({
      ok: false,
      error: {
        code: "visual_language_unknown",
        visualLanguageId: "99999999-9999-4999-8999-999999999999",
        options: [
          { id: "22222222-2222-4222-8222-222222222222", name: "Comercial" },
          { id: "33333333-3333-4333-8333-333333333333", name: "Comercial" },
        ],
      },
    });
    expect(generateCopy).not.toHaveBeenCalled();

    getWork.mockResolvedValue({
      work: {
        ...work,
        toolKind: "variations",
        request: "Peça comercial de julho",
        settings: { targetFormats: [] },
      },
      outputs: [],
      sources: [readyVariationSource],
    } as never);
    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" })).resolves.toEqual({
      ok: false,
      error: {
        code: "visual_language_ambiguous",
        name: "Comercial",
        options: [
          { id: "22222222-2222-4222-8222-222222222222", name: "Comercial" },
          { id: "33333333-3333-4333-8333-333333333333", name: "Comercial" },
        ],
      },
    });
    expect(generateCopy).not.toHaveBeenCalled();
  });

  it("keeps legacy snapshots readable without a visual direction", async () => {
    getActiveVersion.mockResolvedValue({ snapshot: { claims: [] } } as never);
    getWork.mockResolvedValue({
      work: { ...work, toolKind: "variations", settings: { targetFormats: [] } },
      outputs: [],
      sources: [readyVariationSource],
    } as never);
    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(result.ok).toBe(true);
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      inputSnapshot: expect.not.objectContaining({ visualDirection: expect.anything() }),
    }));
  });

  it("blocks an automatic low-confidence piece reference before copy", async () => {
    getWork.mockResolvedValue({ work: { ...work, toolKind: "single" }, outputs: [], sources: [{ id: "source-1", assetId: "asset-1", templateId: null, status: "ready", usage: "both", usageConfirmed: true, pieceReference: { version: 1, category: null, classificationSource: "automatic", confidence: "low", userInstruction: null, hasTransparency: false } }] } as never);
    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" })).resolves.toEqual({ ok: false, error: { code: "piece_reference_required" } });
    expect(generateCopy).not.toHaveBeenCalled();
  });

  it("returns the specific exact transparency error before any generation work", async () => {
    getWork.mockResolvedValue({ work: { ...work, toolKind: "single" }, outputs: [], sources: [{ id: "source-1", assetId: "asset-1", templateId: null, status: "ready", usage: "both", usageConfirmed: true, pieceReference: { version: 1, category: "additional_logo_or_seal", classificationSource: "user", confidence: "high", userInstruction: null, hasTransparency: false } }] } as never);
    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" })).resolves.toEqual({ ok: false, error: { code: "piece_reference_exact_incompatible" } });
    expect(generateCopy).not.toHaveBeenCalled();
  });

  it("accepts a user-corrected reference, freezes its rendering contract, and keeps legacy sources compatible", async () => {
    const corrected = {
      id: "source-corrected", assetId: "asset-1", templateId: null, status: "ready", usage: "both", usageConfirmed: true, updatedAt: now,
      contentAnalysis: null, styleAnalysis: { description: "editorial" },
      pieceReference: { version: 1, category: "product_or_packaging", classificationSource: "user", confidence: "low", userInstruction: "Mostrar o rótulo", hasTransparency: false },
    };
    getWork.mockResolvedValue({ work: { ...work, toolKind: "single" }, outputs: [], sources: [corrected] } as never);
    getSourceAssets.mockResolvedValue(new Map([["source-corrected", { assetKey: "workspaces/ws/assets/product.png", mimeType: "image/png", name: "product.png" }]]));

    const correctedResult = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });

    expect(correctedResult.ok).toBe(true);
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      inputSnapshot: expect.objectContaining({ sources: [expect.objectContaining({
        sourceId: "source-corrected", assetKey: "workspaces/ws/assets/product.png", mimeType: "image/png", label: "product.png",
        pieceReference: {
          version: 1, category: "product_or_packaging", treatment: "recognizable_preservation",
          userInstruction: "Mostrar o rótulo", hasTransparency: false,
        },
      })] }),
    }));

    updateDraft.mockClear();
    getWork.mockResolvedValue({
      work: { ...work, toolKind: "single" }, outputs: [],
      sources: [{ ...corrected, id: "source-legacy", pieceReference: undefined }],
    } as never);
    getSourceAssets.mockResolvedValue(new Map([["source-legacy", { assetKey: "workspaces/ws/assets/legacy.png", mimeType: "image/png", name: "legacy.png" }]]));

    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" })).resolves.toMatchObject({ ok: true });
    expect(updateDraft).toHaveBeenCalledOnce();
  });

  it("keeps Single temporary analyses visual-only when building facts and copy", async () => {
    const temporary = {
      id: "source-moodboard", assetId: "asset-moodboard", templateId: null, status: "ready", usage: "both", usageConfirmed: true, updatedAt: now,
      contentAnalysis: { product: "Oferta inventada do moodboard", offer: "R$ 9,99", brandElements: ["Logo de terceiro"] }, styleAnalysis: { description: "Papel granulado" },
      pieceReference: { version: 1, category: "style_reference", classificationSource: "user", confidence: "high", userInstruction: "Só textura", hasTransparency: false },
    };
    getWork.mockResolvedValue({ work: { ...work, toolKind: "single" }, outputs: [], sources: [temporary] } as never);
    getSourceAssets.mockResolvedValue(new Map([["source-moodboard", { assetKey: "workspaces/ws/assets/moodboard.png", mimeType: "image/png", name: "moodboard.png" }]]));

    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" })).resolves.toMatchObject({ ok: true });

    const patch = updateDraft.mock.calls[0]?.[3] as { inputSnapshot: { factPack: unknown; sources: Array<{ pieceReference?: unknown }> } };
    expect(JSON.stringify(patch.inputSnapshot.factPack)).not.toContain("Oferta inventada do moodboard");
    expect(JSON.stringify(patch.inputSnapshot.factPack)).not.toContain("Logo de terceiro");
    expect(patch.inputSnapshot.sources[0]?.pieceReference).toEqual(expect.objectContaining({ category: "style_reference", userInstruction: "Só textura" }));
    expect(generateCopy).toHaveBeenCalledWith(expect.objectContaining({ factPack: expect.not.objectContaining({ facts: expect.arrayContaining([expect.objectContaining({ value: "Oferta inventada do moodboard" })]) }) }));
  });

  it.each(["variations", "format_adaptation"] as const)(
    "treats stale Piece metadata as ordinary factual source data for persisted %s work",
    async (toolKind) => {
      const stale = {
        id: "source-stale", assetId: "asset-stale", templateId: null, status: "ready", usage: "content", usageConfirmed: false, updatedAt: now,
        contentAnalysis: { product: "Oferta da arte" }, styleAnalysis: null,
        pieceReference: { version: 1, category: "additional_logo_or_seal", classificationSource: "automatic", confidence: "low", userInstruction: "rodapé", hasTransparency: false },
      };
      getWork.mockResolvedValue({ work: {
        ...work,
        toolKind,
        settings: toolKind === "format_adaptation" ? { targetFormats: ["1:1"] } : work.settings,
      }, outputs: [], sources: [stale] } as never);
      getSourceAssets.mockResolvedValue(new Map([["source-stale", { assetKey: "workspaces/ws/assets/stale.png", mimeType: "image/png", name: "stale.png" }]]));

      await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" })).resolves.toMatchObject({ ok: true });

      const patch = updateDraft.mock.calls[0]?.[3] as { inputSnapshot: { factPack: unknown; sources: Array<{ pieceReference?: unknown }> } };
      expect(JSON.stringify(patch.inputSnapshot.factPack)).toContain("Oferta da arte");
      expect(patch.inputSnapshot.sources[0]?.pieceReference).toBeUndefined();
    },
  );

  it("treats stale Piece metadata as ordinary source data for persisted restyle work", async () => {
    const staleContent = {
      id: "source-stale", assetId: "asset-stale", templateId: null, status: "ready", usage: "content", usageConfirmed: false, updatedAt: now,
      contentAnalysis: { product: "Oferta da arte" }, styleAnalysis: null,
      pieceReference: { version: 1, category: "additional_logo_or_seal", classificationSource: "automatic", confidence: "low", userInstruction: "rodapé", hasTransparency: false },
    };
    const style = {
      id: "source-style", assetId: "asset-style", templateId: null, status: "ready", usage: "style", usageConfirmed: false, updatedAt: now,
      contentAnalysis: null, styleAnalysis: { description: "Editorial" }, pieceReference: null,
    };
    getWork.mockResolvedValue({ work: { ...work, toolKind: "restyle" }, outputs: [], sources: [staleContent, style] } as never);
    getSourceAssets.mockResolvedValue(new Map([
      ["source-stale", { assetKey: "workspaces/ws/assets/stale.png", mimeType: "image/png", name: "stale.png" }],
      ["source-style", { assetKey: "workspaces/ws/assets/style.png", mimeType: "image/png", name: "style.png" }],
    ]));

    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" })).resolves.toMatchObject({ ok: true });

    const patch = updateDraft.mock.calls[0]?.[3] as { inputSnapshot: { factPack: unknown; sources: Array<{ sourceId: string; pieceReference?: unknown }> } };
    expect(JSON.stringify(patch.inputSnapshot.factPack)).toContain("Oferta da arte");
    expect(patch.inputSnapshot.sources.find((source) => source.sourceId === "source-stale")?.pieceReference).toBeUndefined();
  });

  it("persists inferred brief and pure copy without a billing adapter", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [readyVariationSource] } as never);
    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(result.ok).toBe(true);
    expect(generateCopy).toHaveBeenCalledOnce();
    expect(generatePaidCopy).not.toHaveBeenCalled();
    expect(getWork).toHaveBeenCalledWith("ws-1", "work-1", transactionExecutor);
    expect(getKit).toHaveBeenCalledWith("ws-1", "profile-1", transactionExecutor);
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      brief: expect.objectContaining({ theme: "Promoção de matrícula para julho" }),
      copy: { headline: "Julho", body: "Matricule-se", cta: "Saiba mais" },
    }));
    if (result.ok) expect(result.value.quote).toMatchObject({ unitCount: 3, credits: 150 });
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
    getWork.mockResolvedValue({ work, outputs: [], sources: [readyVariationSource] } as never);

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
    }));
  });

  it("blocks an incomplete single-piece briefing before copy or persistence", async () => {
    const sparseWork = { ...work, toolKind: "single", request: "Pedido sem direção" };
    getWork.mockResolvedValue({ work: sparseWork, outputs: [], sources: [] } as never);
    inferBrief.mockReturnValue({ theme: "", objective: "", audience: "", offer: null });

    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "briefing_blocked",
        details: {
          reason: "missing_direction",
          readiness: "blocked",
          briefing: { readiness: "blocked" },
        },
      },
    });
    expect(reviewBrief).toHaveBeenCalledOnce();
    expect(generateCopy).not.toHaveBeenCalled();
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it("revises a blocked briefing once and persists the recovered envelope", async () => {
    const sparseWork = { ...work, toolKind: "single", request: "Pedido sem direção" };
    getWork.mockResolvedValue({ work: sparseWork, outputs: [], sources: [] } as never);
    inferBrief.mockReturnValue({ theme: "", objective: "", audience: "", offer: null });
    reviewBrief.mockResolvedValue({
      theme: "Curso de Psicologia",
      objective: "Apresentar o curso",
      audience: "Profissionais",
      offer: null,
    });

    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });

    expect(result.ok).toBe(true);
    expect(reviewBrief).toHaveBeenCalledOnce();
    expect(generateCopy).toHaveBeenCalledOnce();
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      brief: expect.objectContaining({ theme: "Curso de Psicologia" }),
      inputSnapshot: expect.objectContaining({
        inferredBriefing: expect.objectContaining({
          message: { value: "Curso de Psicologia", state: "inferred", confidence: "medium" },
          readiness: "exploratory",
        }),
      }),
    }));
  });

  it("does not loop after the single automatic revision fails validation", async () => {
    const sparseWork = { ...work, toolKind: "single", request: "Pedido sem direção" };
    getWork.mockResolvedValue({ work: sparseWork, outputs: [], sources: [] } as never);
    inferBrief.mockReturnValue({ theme: "", objective: "", audience: "", offer: null });
    reviewBrief.mockResolvedValue({ theme: "", objective: "", audience: "", offer: null } as never);

    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });

    expect(result).toMatchObject({ ok: false, error: { code: "briefing_blocked" } });
    expect(reviewBrief).toHaveBeenCalledOnce();
    expect(generateCopy).not.toHaveBeenCalled();
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it("reuses a recovered briefing without a second automatic review", async () => {
    const sparseWork = { ...work, toolKind: "single", request: "Pedido sem direção" };
    let current = { ...sparseWork } as typeof sparseWork & { inputSnapshot?: unknown; brief?: unknown; copy?: unknown };
    getWork.mockImplementation(async () => ({ work: current, outputs: [], sources: [] } as never));
    inferBrief.mockReturnValue({ theme: "", objective: "", audience: "", offer: null });
    reviewBrief.mockResolvedValue({
      theme: "Curso de Psicologia",
      objective: "Apresentar o curso",
      audience: "Profissionais",
      offer: null,
    });
    updateDraft.mockImplementation(async (_ws, _id, _updatedAt, patch) => {
      current = { ...current, ...patch } as typeof current;
      return current as never;
    });

    const first = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    const second = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(inferBrief).toHaveBeenCalledOnce();
    expect(reviewBrief).toHaveBeenCalledOnce();
    expect(generateCopy).toHaveBeenCalledOnce();
    expect(updateDraft).toHaveBeenCalledOnce();
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
    }));
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
    getWork.mockResolvedValue({ work, outputs: [], sources: [readyVariationSource] } as never);

    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).not.toHaveProperty("briefing");
    const patch = updateDraft.mock.calls[0]?.[3] as { inputSnapshot: Record<string, unknown> };
    expect(patch.inputSnapshot).not.toHaveProperty("inferredBriefing");
  });

  it("freezes the refinement budget only on explicit opt-in, never for calibration (plan 04, T1)", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [readyVariationSource] } as never);

    const accepted = await prepareCreativeWork({
      workspaceId: "ws-1",
      workItemId: "work-1",
      artRefinement: { acceptedBy: "user-1" },
    });
    expect(accepted.ok).toBe(true);
    const patch = updateDraft.mock.calls[0]?.[3] as { inputSnapshot: Record<string, unknown> };
    expect(patch.inputSnapshot).toHaveProperty("artRefinement", expect.objectContaining({
      version: 1,
      maxRevisionsPerRoot: 2,
      acceptedBy: "user-1",
    }));
    expect((patch.inputSnapshot.artRefinement as { acceptedCreditCeiling: number }).acceptedCreditCeiling)
      .toBeGreaterThan(0);

    updateDraft.mockClear();
    getWork.mockResolvedValue({
      work: { ...work, trainingSessionId: "session-1", trainingRound: 1, trainingSlot: 0 },
      outputs: [],
      sources: [readyVariationSource],
    } as never);
    // Plan 01, T2: calibration works prepare only through the authorized
    // internal context; the budget assertion below runs on that path.
    loadCandidate.mockResolvedValue({
      hash: "c".repeat(64),
      knowledge: { schemaVersion: 1, profileId: "profile-1", compiledAt: now.toISOString(), claims: [], excluded: [] },
      identity: {
        clientProfileId: "profile-1",
        confirmedAt: now.toISOString(),
        assets: [],
        brandKit: { colors: [], fonts: [], toneOfVoice: null, prohibitedElements: null, requiredElements: null },
      },
      evidenceHashes: {},
    } as never);
    const calibration = await prepareCreativeWork({
      workspaceId: "ws-1",
      workItemId: "work-1",
      artRefinement: { acceptedBy: "user-1" },
      calibration: { sessionId: "session-1", round: 1, slot: 0 },
    });
    expect(calibration.ok).toBe(true);
    const calibrationPatch = updateDraft.mock.calls[0]?.[3] as { inputSnapshot: Record<string, unknown> } | undefined;
    if (calibrationPatch) expect(calibrationPatch.inputSnapshot).not.toHaveProperty("artRefinement");
  });

  it("descarta ANTES de pagar a chamada de copy quando a tentativa e perdida", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [readyVariationSource] } as never);
    // A edicao venceu durante a revisao do briefing: a renovacao falha.
    vi.mocked(renewPreparationAttempt).mockResolvedValue(false);

    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });

    expect(result).toMatchObject({ ok: false, error: { code: "stale_input" } });
    // O ponto do fix: nao se paga o provedor por um resultado que ja nasceu velho.
    expect(generateCopy).not.toHaveBeenCalled();
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it("nao devolve briefing velho pelo atalho de reuso quando o finalize recusa", async () => {
    // Round trip real, como no teste de reuso acima: a primeira preparacao
    // persiste o snapshot; so entao a SEGUNDA toma o atalho de reuso. Sem
    // isso o teste passaria pelo finalize da fase 3 e nao provaria este fix.
    let current = { ...work } as typeof work & { inputSnapshot?: unknown; brief?: unknown; copy?: unknown };
    getWork.mockImplementation(async () => ({ work: current, outputs: [], sources: [readyVariationSource] } as never));
    updateDraft.mockImplementation(async (_ws, _id, _updatedAt, patch) => {
      current = { ...current, ...patch } as typeof current;
      return current as never;
    });

    const first = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(first.ok).toBe(true);

    // Agora uma edicao entra na janela entre a leitura e o fechamento da
    // tentativa da SEGUNDA preparacao, que iria pelo atalho.
    vi.mocked(finalizePreparationAttempt).mockResolvedValue({ ok: false, reason: "not_running" } as never);
    const second = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });

    // Devolver ok:true com o briefing lido antes da edicao seria mentir.
    expect(second).toMatchObject({ ok: false, error: { code: "stale_input" } });
    // E o atalho nao pode ter regerado copy.
    expect(generateCopy).toHaveBeenCalledOnce();
  });

  it("duas preparacoes identicas concorrentes chamam copy UMA vez", async () => {
    let current = { ...work } as typeof work & { inputSnapshot?: unknown; brief?: unknown; copy?: unknown };
    let tail = Promise.resolve();
    withLock.mockImplementation((_ws, _id, callback) => {
      const run = tail.then(() => callback(transactionExecutor));
      tail = run.then(() => undefined);
      return run as never;
    });
    getWork.mockImplementation(async () => ({ work: current, outputs: [], sources: [readyVariationSource] } as never));
    updateDraft.mockImplementation(async (_ws, _id, _updatedAt, patch) => {
      current = { ...current, ...patch } as typeof current;
      return current as never;
    });
    // A dedupe deixou de ser efeito colateral da serializacao pelo lock e
    // passou a ser explicita: a segunda requisicao encontra a tentativa da
    // primeira e recebe estado tipado. O duplo precisa modelar isso.
    vi.mocked(claimPreparationAttempt)
      .mockResolvedValueOnce({ outcome: "claimed", attempt: { id: "attempt-1" } } as never)
      .mockResolvedValue({ outcome: "joined", attempt: { id: "attempt-1" } } as never);

    const [first, second] = await Promise.all([
      prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }),
      prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }),
    ]);
    expect(first.ok).toBe(true);
    // Antes da Task 15 a segunda devolvia ok reaproveitando o snapshot ja
    // persistido. Agora devolve o estado tipado que a Task 17 expoe como 409.
    expect(second).toMatchObject({
      ok: false,
      error: { code: "preparation_in_progress", details: { attemptId: "attempt-1" } },
    });
    // A INVARIANTE nao mudou, e e o ponto do teste: uma unica chamada ao
    // provedor para duas preparacoes iguais (medida na Task 8).
    expect(generateCopy).toHaveBeenCalledOnce();
  });

  it("returns stale input when CAS loses to autosave or source change", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [readyVariationSource] } as never);
    updateDraft.mockResolvedValue(null);
    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }))
      .resolves.toEqual({ ok: false, error: { code: "stale_input" } });
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.any(Object));
  });

  it("rejects a non-draft before inference or copy", async () => {
    getWork.mockResolvedValue({ work: { ...work, status: "ready" }, outputs: [], sources: [] } as never);
    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }))
      .resolves.toEqual({ ok: false, error: { code: "work_not_draft" } });
    expect(inferBrief).not.toHaveBeenCalled();
    expect(generateCopy).not.toHaveBeenCalled();
  });

  it("rejects an expired pinned commercial offer before inference or copy", async () => {
    getWork.mockResolvedValue({
      work: {
        ...work,
        inputSnapshot: {
          request: work.request,
          settings: work.settings,
          sources: [],
          commercialOffer: {
            offerId: "offer-1",
            version: 1,
            product: "Pós",
            offer: "turma",
            price: "R$ 497",
            validFrom: "2026-01-01T00:00:00.000Z",
            validUntil: "2026-02-01T00:00:00.000Z",
          },
        },
      },
      outputs: [],
      sources: [],
    } as never);
    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }))
      .resolves.toEqual({ ok: false, error: { code: "offer_expired" } });
    expect(inferBrief).not.toHaveBeenCalled();
    expect(generateCopy).not.toHaveBeenCalled();
  });

  it("rejects malformed inferred briefs before copy or persistence", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [readyVariationSource] } as never);
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
    }] : [readyVariationSource] } as never);
    await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(generateCopy).toHaveBeenCalledOnce();
  });

  it("reuses persisted preparation when the input snapshot is unchanged", async () => {
    // Real round trip: the first prepare persists the snapshot (fact pack
    // included); the second prepare must reuse it without regenerating copy.
    let current = { ...work } as typeof work & { inputSnapshot?: unknown; brief?: unknown; copy?: unknown };
    getWork.mockImplementation(async () => ({ work: current, outputs: [], sources: [readyVariationSource] } as never));
    updateDraft.mockImplementation(async (_ws, _id, _updatedAt, patch) => {
      current = { ...current, ...patch } as typeof current;
      return current as never;
    });
    const first = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    envState.sunburstPercent = 0;
    const second = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(generateCopy).toHaveBeenCalledOnce();
    expect(updateDraft).toHaveBeenCalledOnce();
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      inputSnapshot: expect.objectContaining({
        renderPolicy: { version: 1, model: "gpt-image-2.5-sunburst-2026-09-08", quality: "max" },
      }),
    }));
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
    getWork.mockImplementation(async () => ({ work: current, outputs: [], sources: [readyVariationSource] } as never));
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
    }, outputs: [], sources: [readyVariationSource] } as never);
    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(result.ok).toBe(true);
    expect(generateCopy).toHaveBeenCalledOnce();
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      inputSnapshot: expect.objectContaining({
        request: work.request,
        sources: [expect.objectContaining({ sourceId: "source-base" })],
        factPack: expect.objectContaining({ version: 1, request: work.request }),
        renderPolicy: { version: 1, model: "gpt-image-2-2026-04-21", quality: "medium" },
      }),
    }));
  });

  it("freezes the candidate image policy in the preparation transaction", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [readyVariationSource] } as never);
    await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now,
      expect.objectContaining({ inputSnapshot: expect.objectContaining({
        renderPolicy: { version: 1, model: "gpt-image-2.5-sunburst-2026-09-08", quality: "max" },
      }) }));
  });

  it("assigns a sunburst cohort on first prepare of a pinned commercial-offer draft", async () => {
    getWork.mockResolvedValue({
      work: {
        ...work,
        brief: null,
        copy: null,
        inputSnapshot: {
          request: work.request,
          settings: work.settings,
          sources: [],
          commercialOffer: {
            offerId: "offer-1",
            version: 1,
            product: "Pós",
            offer: "turma",
            price: "R$ 497",
            validFrom: "2026-01-01T00:00:00.000Z",
            validUntil: "2027-12-01T00:00:00.000Z",
          },
        },
      },
      outputs: [],
      sources: [readyVariationSource],
    } as never);
    await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now,
      expect.objectContaining({ inputSnapshot: expect.objectContaining({
        renderPolicy: { version: 1, model: "gpt-image-2.5-sunburst-2026-09-08", quality: "max" },
      }) }));
  });

  it("freezes the policy version as legacy into the snapshot while the switch is disabled", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [readyVariationSource] } as never);
    await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      inputSnapshot: expect.objectContaining({ generationPolicyVersion: "legacy" }),
    }));
  });

  it("freezes quality_recovery_v1 into the snapshot while the switch is enabled", async () => {
    envState.qualityRecoveryEnabled = "true";
    getWork.mockResolvedValue({ work, outputs: [], sources: [readyVariationSource] } as never);
    await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      inputSnapshot: expect.objectContaining({ generationPolicyVersion: "quality_recovery_v1" }),
    }));
  });

  it("re-prepares an old legacy snapshot when the enabled switch changes the resolved version", async () => {
    envState.qualityRecoveryEnabled = "true";
    const snapshot = { request: work.request, settings: work.settings, sources: [] };
    getWork.mockResolvedValue({ work: {
      ...work, inputSnapshot: snapshot,
      brief: { theme: "Tema", objective: "Objetivo", audience: "Público", offer: "Oferta" },
      copy: { headline: "H", body: "B", cta: "C" },
    }, outputs: [], sources: [readyVariationSource] } as never);
    const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
    expect(result.ok).toBe(true);
    expect(generateCopy).toHaveBeenCalledOnce();
    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
      inputSnapshot: expect.objectContaining({ generationPolicyVersion: "quality_recovery_v1" }),
    }));
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

  it("requires persisted content and style roles for a restyle", async () => {
    getWork.mockResolvedValue({ work: { ...work, toolKind: "restyle", request: "" }, outputs: [], sources: [
      { id: "source-style", assetId: "asset-style", status: "ready", usage: "style", usageConfirmed: true, updatedAt: now, contentAnalysis: null, styleAnalysis: { description: "Editorial" } },
      { id: "source-content", assetId: "asset-content", status: "ready", usage: "content", usageConfirmed: true, updatedAt: now, contentAnalysis: { product: "Curso" }, styleAnalysis: null },
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
    }));
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

    expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({ format: "9:16" }));
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
    }));
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
    }));
    const patch = updateDraft.mock.calls[0]?.[3] as { inputSnapshot: { factPack: unknown } };
    const serialized = JSON.stringify(patch.inputSnapshot.factPack);
    expect(serialized).not.toContain("Condomínio fechado");
    expect(serialized).not.toContain("R$ 900.000");
    expect(serialized).not.toContain("Público da marca");
  });

  it("fails as invalid_context before persistence when the copy keeps claims without origin", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [readyVariationSource] } as never);
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

  it("records the finalize refusal reason when discarding a provider error", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [readyVariationSource] } as never);
    generateCopy.mockRejectedValue(new Error("provider unavailable"));
    vi.mocked(finalizePreparationAttempt).mockResolvedValue({ ok: false, reason: "not_running" } as never);
    await expect(prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" })).rejects.toThrow("provider unavailable");
    expect(logCreativeWorkPreparationAttempt).toHaveBeenCalledWith(expect.objectContaining({ phase: "invalidated", reason: "not_running" }));
  });

  it("propagates provider failures from copy generation instead of masking them as invalid_context", async () => {
    getWork.mockResolvedValue({ work, outputs: [], sources: [readyVariationSource] } as never);
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
      { id: "source-content", assetId: "asset-content", status: "ready", usage: "content", usageConfirmed: true, updatedAt: now, contentAnalysis: xtbContentAnalysis, styleAnalysis: null },
      { id: "source-style", assetId: "asset-style", status: "ready", usage: "style", usageConfirmed: true, updatedAt: now, contentAnalysis: null, styleAnalysis },
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
      }));
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
      }));
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
      }));
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

  describe("calibration-owned works (plan 01, T2)", () => {
    const calibrationWork = {
      ...work,
      toolKind: "single",
      request: "[Texto de teste de calibração] Peça com a Bia apresentando a marca.",
      trainingSessionId: "session-1",
      trainingRound: 1,
      trainingSlot: 0,
    };
    const candidateB = {
      hash: "b".repeat(64),
      knowledge: {
        schemaVersion: 1,
        profileId: "profile-1",
        compiledAt: "2026-09-13T12:00:00.000Z",
        claims: [
          {
            id: "claim-b",
            claimKey: "people.catalog",
            kind: "fact",
            value: {
              version: 1,
              people: [{
                id: "33333333-3333-4333-8333-333333333333",
                name: "Bia",
                aliases: [],
                referenceIds: ["44444444-4444-4344-8344-444444444444"],
                primaryReferenceId: "44444444-4444-4344-8344-444444444444",
                preserve: ["sinal na bochecha"],
                referenceAdequacy: "confirmed",
              }],
            },
            scope: { level: "global" },
            authority: "human",
            confidence: "high",
            evidenceRefs: [],
            reviewedAt: "2026-09-13T12:00:00.000Z",
            reviewedByUserId: "user-1",
          },
        ],
        excluded: [],
      },
      identity: {
        clientProfileId: "profile-1",
        confirmedAt: "2026-09-13T12:00:00.000Z",
        assets: [],
        brandKit: {
          colors: ["#BEEF00"],
          fonts: ["Frozen Sans"],
          toneOfVoice: "Tom congelado B",
          prohibitedElements: "frozen-no",
          requiredElements: "frozen-yes",
        },
      },
      evidenceHashes: {},
    };

    it("refuses generic preparation without the bound internal context", async () => {
      getWork.mockResolvedValue({ work: calibrationWork, outputs: [], sources: [] } as never);
      await expect(
        prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" }),
      ).resolves.toMatchObject({ ok: false, error: { code: "calibration_managed" } });
      await expect(
        prepareCreativeWork({
          workspaceId: "ws-1",
          workItemId: "work-1",
          calibration: { sessionId: "session-1", round: 1, slot: 1 },
        }),
      ).resolves.toMatchObject({ ok: false, error: { code: "calibration_managed" } });
      expect(updateDraft).not.toHaveBeenCalled();
    });

    it.each([undefined, "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"])(
      "keeps calibration language choice explicit (%s)", async (explicitId) => {
      const languageId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
      const candidate = { ...candidateB, knowledge: { ...candidateB.knowledge, claims: [{
        ...candidateB.knowledge.claims[0], claimKey: "visual.repertoire", value: {
          version: 1, common: [{id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb", dimension: "hierarchy",
            observation: "Título dominante", application: "Destacar o título", avoid: "", evidenceIds: ["r1"], confidence: "high"}],
          languages: [{id: languageId, name: "Institucional", contexts: ["institucional"], rules: []}],
        },
      }] } };
      getWork.mockResolvedValue({ work: { ...calibrationWork, request: "Apresentação Institucional",
        settings: { targetFormats: [], ...(explicitId ? { visualLanguageId: explicitId } : {}) } }, outputs: [], sources: [] } as never);
      vi.mocked(loadCalibrationCandidateForWork).mockResolvedValue(candidate as never);
      const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1",
        calibration: { sessionId: "session-1", round: 1, slot: 0 } });
      expect(result.ok).toBe(true);
      expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
        inputSnapshot: expect.objectContaining({ visualDirection: expect.objectContaining({ languageId: explicitId ?? null }) }),
      }));
    });

    it("composes calibration examples from the frozen candidate, not the live kit", async () => {
      getWork.mockResolvedValue({ work: calibrationWork, outputs: [], sources: [] } as never);
      loadCandidate.mockResolvedValue(candidateB as never);
      // Live kit/version changed after the round was created (identity A).
      getKit.mockResolvedValue({ name: "Cenbrap", toneOfVoice: "Tom ao vivo A", requiredElements: "live-yes", prohibitedElements: "live-no" } as never);
      getActiveVersion.mockResolvedValue({ snapshot: { claims: [] } } as never);

      const result = await prepareCreativeWork({
        workspaceId: "ws-1",
        workItemId: "work-1",
        calibration: { sessionId: "session-1", round: 1, slot: 0 },
      });

      expect(result.ok).toBe(true);
      expect(loadCandidate).toHaveBeenCalledWith("ws-1", "work-1");
      expect(getActiveVersion).not.toHaveBeenCalled();
      expect(generateCopy).toHaveBeenCalledWith(expect.objectContaining({
        toneOfVoice: "Tom congelado B",
        requiredElements: "frozen-yes",
        prohibitedElements: "frozen-no",
      }));
      expect(updateDraft).toHaveBeenCalledWith("ws-1", "work-1", now, expect.objectContaining({
        inputSnapshot: expect.objectContaining({
          people: [expect.objectContaining({ personId: "33333333-3333-4333-8333-333333333333", name: "Bia" })],
        }),
      }));
    });

    it("keeps regular works on the live kit without loading a candidate", async () => {
      getWork.mockResolvedValue({ work: { ...work, toolKind: "variations" }, outputs: [], sources: [readyVariationSource] } as never);
      const result = await prepareCreativeWork({ workspaceId: "ws-1", workItemId: "work-1" });
      expect(result.ok).toBe(true);
      expect(loadCandidate).not.toHaveBeenCalled();
      expect(generateCopy).toHaveBeenCalledWith(expect.objectContaining({ toneOfVoice: "Direto" }));
    });
  });
});
