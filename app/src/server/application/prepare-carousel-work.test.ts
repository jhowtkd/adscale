import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreativeWorkItem, CreativeWorkSource } from "@/server/db/schema";
import type {
  CarouselDeckPlanV1,
  CarouselDraftStateV1,
} from "@/server/creative-work/carousel-contracts";

const repo = vi.hoisted(() => ({
  getCreativeWork: vi.fn(),
  updateCreativeWorkDraftIfUnchanged: vi.fn(),
  updateCreativeWorkIfUnchanged: vi.fn(),
  getCreativeWorkSourceAssetDetails: vi.fn(),
}));
const identityMock = vi.hoisted(() => vi.fn());
const brandKitMock = vi.hoisted(() => vi.fn());
const billing = vi.hoisted(() => ({
  refundCredits: vi.fn(),
  spend: vi.fn(),
  checkSpend: vi.fn(),
  canSpend: vi.fn(),
  recordUsage: vi.fn(),
}));
const envState = vi.hoisted(() => ({
  sunburstPercent: 100,
  sunburstQuality: "max" as const,
}));
const inngestSendMock = vi.hoisted(() => vi.fn());
const getOpenAIMock = vi.hoisted(() => vi.fn());
const transactionExecutor = { scope: "preparation-tx" } as never;

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: (...args: unknown[]) => repo.getCreativeWork(...args),
  updateCreativeWorkDraftIfUnchanged: (...args: unknown[]) =>
    repo.updateCreativeWorkDraftIfUnchanged(...args),
  updateCreativeWorkIfUnchanged: (...args: unknown[]) =>
    repo.updateCreativeWorkIfUnchanged(...args),
  getCreativeWorkSourceAssetDetails: (...args: unknown[]) =>
    repo.getCreativeWorkSourceAssetDetails(...args),
  withCreativeWorkPreparationLock: (
    _workspaceId: string,
    _workItemId: string,
    callback: (executor: object) => Promise<unknown>
  ) => callback(transactionExecutor),
}));
vi.mock("@/server/repositories/brand-kit", () => ({
  getBrandKit: (...args: unknown[]) => brandKitMock(...args),
}));
vi.mock("@/server/creative-work/identity", () => ({
  createIdentitySnapshot: (...args: unknown[]) => identityMock(...args),
}));
vi.mock("@/server/billing/credits", () => billing);
vi.mock("@/server/jobs/client", () => ({
  inngest: { send: (...args: unknown[]) => inngestSendMock(...args) },
}));
vi.mock("@/server/ai/utils", () => ({
  getOpenAI: (...args: unknown[]) => getOpenAIMock(...args),
}));
vi.mock("@/server/validation/env", () => ({
  env: {
    get OPENAI_IMAGE_SUNBURST_PERCENT() {
      return envState.sunburstPercent;
    },
    get OPENAI_IMAGE_SUNBURST_QUALITY() {
      return envState.sunburstQuality;
    },
  },
}));

import { prepareCarouselWork } from "./prepare-carousel-work";

const UPDATED_AT = "2026-08-30T12:00:00.000Z";

function identityResult() {
  return {
    clientProfileId: "profile-1",
    confirmedAt: "2026-08-30T12:00:00.000Z",
    assets: [],
    brandKit: {
      colors: ["#112233"],
      fonts: [],
      fontAssets: [],
      toneOfVoice: null,
      prohibitedElements: null,
      requiredElements: null,
    },
  };
}

function approvedEditorial(overrides: Record<string, unknown> = {}) {
  return {
    version: 1 as const,
    revision: "script-1",
    contextHash: "ctx-1",
    research: { status: "not_needed" as const, question: "", thesis: "", sources: [], claims: [], gaps: [] },
    hooks: [],
    recommendedHookId: null,
    recommendation: null,
    selectedHookId: null,
    storyboard: [],
    caption: null,
    approvedScriptRevision: "script-1",
    approvedCover: null,
    confirmedInteriorsRevision: null,
    ...overrides,
  };
}

function work(overrides: Partial<CreativeWorkItem> = {}): CreativeWorkItem {
  return {
    id: "work-1",
    workspaceId: "workspace-1",
    clientProfileId: "profile-1",
    createdByUserId: "user-1",
    toolKind: "carousel",
    status: "draft",
    brief: null,
    format: "4:5",
    copy: null,
    request: "Grupo de terapia começa em agosto, vagas limitadas",
    settings: { targetFormats: [], carouselDraft: draftWithPlan(), carouselEditorial: approvedEditorial() },
    inputSnapshot: null,
    identitySnapshot: null,
    createdAt: new Date("2026-08-30T11:00:00.000Z"),
    updatedAt: new Date(UPDATED_AT),
    ...overrides,
  } as CreativeWorkItem;
}

function planOfFive(): CarouselDeckPlanV1 {
  return {
    version: 1,
    revision: "deck-r1",
    workId: "work-1",
    objective: "Divulgar o grupo de terapia",
    audience: null,
    tone: null,
    promise: "Grupo de terapia em agosto",
    format: "4:5",
    slides: [
      { slideId: "s1", position: 1, role: "hook", purpose: "Abrir", primaryText: "Grupo de terapia começa em agosto", secondaryText: null, authority: "ai_proposal", sourceFactIds: [], layoutFamily: "impact" },
      { slideId: "s2", position: 2, role: "context", purpose: "Contexto", primaryText: "O grupo acontece no consultório", secondaryText: null, authority: "ai_proposal", sourceFactIds: [], layoutFamily: "development" },
      { slideId: "s3", position: 3, role: "argument", purpose: "Argumento", primaryText: "As vagas são limitadas", secondaryText: null, authority: "ai_proposal", sourceFactIds: [], layoutFamily: "development" },
      { slideId: "s4", position: 4, role: "evidence", purpose: "Evidência", primaryText: "O consultório organiza o grupo de terapia", secondaryText: null, authority: "ai_proposal", sourceFactIds: [], layoutFamily: "development" },
      { slideId: "s5", position: 5, role: "closing", purpose: "Fechar", primaryText: "Comece em agosto", secondaryText: null, authority: "ai_proposal", sourceFactIds: [], layoutFamily: "respite" },
    ],
  };
}

function draftWithPlan(
  overrides: Partial<CarouselDraftStateV1> = {}
): CarouselDraftStateV1 {
  return {
    version: 1,
    revision: "deck-r1",
    answers: {},
    blockingQuestions: [],
    plan: planOfFive(),
    changes: [],
    ...overrides,
  };
}

function styleSource(
  overrides: Partial<CreativeWorkSource> = {}
): CreativeWorkSource {
  return {
    id: "source-style-1",
    workspaceId: "workspace-1",
    workItemId: "work-1",
    assetId: "asset-style",
    templateId: null,
    usage: "style",
    usageConfirmed: true,
    status: "ready",
    contentAnalysis: {
      product: "Oferta inventada da referência",
      offer: null,
      cta: null,
      brandElements: [],
      keyVisual: "Fundo azul",
      textContent: { headline: "Headline da referência", bullets: [] },
      format: "4:5",
    },
    styleAnalysis: { description: "Fundo azul" },
    pieceReference: null,
    failureCode: null,
    createdAt: new Date(),
    updatedAt: new Date(UPDATED_AT),
    ...overrides,
  } as CreativeWorkSource;
}

function aggregate(
  workOverrides: Partial<CreativeWorkItem> = {},
  sources: CreativeWorkSource[] = [styleSource()]
) {
  return { work: work(workOverrides), outputs: [], sources };
}

const baseInput = { workspaceId: "workspace-1", workItemId: "work-1" };

describe("prepareCarouselWork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.sunburstPercent = 100;
    envState.sunburstQuality = "max";
    identityMock.mockResolvedValue(identityResult());
    brandKitMock.mockResolvedValue({
      name: "Cenbrap",
      toneOfVoice: "Acolhedor",
      requiredElements: null,
      prohibitedElements: null,
    });
    repo.getCreativeWorkSourceAssetDetails.mockResolvedValue(
      new Map([
        ["source-style-1", { assetKey: "workspaces/ws/assets/ref.png", mimeType: "image/png", source: "upload", name: "ref.png" }],
      ])
    );
    repo.updateCreativeWorkDraftIfUnchanged.mockImplementation(
      async (_ws: string, _id: string, _updatedAt: Date, patch: Record<string, unknown>) =>
        ({ ...work(), ...patch }) as CreativeWorkItem
    );
    repo.updateCreativeWorkIfUnchanged.mockImplementation(
      async (_ws: string, _id: string, _updatedAt: Date, patch: Record<string, unknown>) =>
        ({ ...work(), ...patch }) as CreativeWorkItem
    );
  });

  it("returns work_not_found for a work outside the workspace", async () => {
    repo.getCreativeWork.mockResolvedValue(null);

    const result = await prepareCarouselWork(baseInput);

    expect(result).toEqual({ ok: false, error: { code: "work_not_found" } });
    expect(identityMock).not.toHaveBeenCalled();
  });

  it("returns work_not_carousel for a non-carousel tool kind", async () => {
    repo.getCreativeWork.mockResolvedValue(aggregate({ toolKind: "social_post" }, []));

    const result = await prepareCarouselWork(baseInput);

    expect(result).toEqual({
      ok: false,
      error: { code: "work_not_carousel", details: { toolKind: "social_post" } },
    });
  });

  it("returns work_not_draft when the work left the draft state", async () => {
    repo.getCreativeWork.mockResolvedValue(aggregate({ status: "ready" }, []));

    const result = await prepareCarouselWork(baseInput);

    expect(result).toEqual({
      ok: false,
      error: { code: "work_not_draft", details: { status: "ready" } },
    });
  });

  it("returns sources_not_ready while a source analysis is pending", async () => {
    repo.getCreativeWork.mockResolvedValue(
      aggregate({}, [styleSource({ status: "analyzing" })])
    );

    const result = await prepareCarouselWork(baseInput);

    expect(result).toEqual({ ok: false, error: { code: "sources_not_ready" } });
    expect(identityMock).not.toHaveBeenCalled();
  });

  it("returns blocking_questions and persists nothing when the draft still asks", async () => {
    repo.getCreativeWork.mockResolvedValue(
      aggregate({
        settings: {
          targetFormats: [],
          carouselEditorial: approvedEditorial(),
          carouselDraft: draftWithPlan({
            plan: null,
            blockingQuestions: [{
              id: "q-1",
              field: "offer",
              question: "Qual é a condição de entrada?",
              reason: "O pedido não declara oferta.",
            }],
          }),
        },
      })
    );

    const result = await prepareCarouselWork(baseInput);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("blocking_questions");
    expect((result.error.details as { questions: unknown[] }).questions).toHaveLength(1);
    expect(repo.updateCreativeWorkDraftIfUnchanged).not.toHaveBeenCalled();
    expect(identityMock).not.toHaveBeenCalled();
  });

  it("returns editorial_invalid when no carousel draft was planned yet", async () => {
    repo.getCreativeWork.mockResolvedValue(
      aggregate({ settings: { targetFormats: [], carouselEditorial: approvedEditorial() } })
    );

    const result = await prepareCarouselWork(baseInput);

    expect(result).toEqual({
      ok: false,
      error: { code: "editorial_invalid", details: { reason: "carousel_draft_missing" } },
    });
  });

  it("rejects decks outside 5-8 slides with concrete structural findings", async () => {
    const fourSlides = planOfFive().slides.slice(0, 4);
    repo.getCreativeWork.mockResolvedValue(
      aggregate({
        settings: {
          targetFormats: [],
          carouselEditorial: approvedEditorial(),
          carouselDraft: draftWithPlan({
            plan: { ...planOfFive(), slides: fourSlides } as unknown as CarouselDeckPlanV1,
          }),
        },
      })
    );

    const result = await prepareCarouselWork(baseInput);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("editorial_invalid");
    expect(JSON.stringify(result.error.details)).toContain("slide_count");
    expect(repo.updateCreativeWorkDraftIfUnchanged).not.toHaveBeenCalled();
  });

  it("rejects 9:16 decks before any freezing", async () => {
    repo.getCreativeWork.mockResolvedValue(
      aggregate({
        settings: {
          targetFormats: [],
          carouselEditorial: approvedEditorial(),
          carouselDraft: draftWithPlan({
            plan: { ...planOfFive(), format: "9:16" } as unknown as CarouselDeckPlanV1,
          }),
        },
      })
    );

    const result = await prepareCarouselWork(baseInput);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("editorial_invalid");
    expect(JSON.stringify(result.error.details)).toContain("invalid_format");
  });

  it("blocks unsupported claims with the exact slide field and never persists", async () => {
    repo.getCreativeWork.mockResolvedValue(
      aggregate({
        settings: {
          targetFormats: [],
          carouselEditorial: approvedEditorial(),
          carouselDraft: draftWithPlan({
            plan: {
              ...planOfFive(),
              slides: planOfFive().slides.map((slide, index) =>
                index === 1
                  ? { ...slide, primaryText: "50% de desconto em setembro" }
                  : slide
              ),
            },
          }),
        },
      })
    );

    const result = await prepareCarouselWork(baseInput);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("editorial_invalid");
    const findings = (result.error.details as { findings: Array<{ code: string; path: string }> }).findings;
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsupported_claim", path: "slides.1.primaryText" }),
      ])
    );
    expect(repo.updateCreativeWorkDraftIfUnchanged).not.toHaveBeenCalled();
  });

  it("enforces the one temporary visual reference cap", async () => {
    repo.getCreativeWork.mockResolvedValue(
      aggregate({}, [styleSource(), styleSource({ id: "source-style-2", assetId: "asset-2" })])
    );

    const result = await prepareCarouselWork(baseInput);

    expect(result).toEqual({
      ok: false,
      error: { code: "temporary_reference_limit", details: { count: 2 } },
    });
  });

  it("freezes the temporary style source as visual-only and keeps its content out of the facts", async () => {
    repo.getCreativeWork.mockResolvedValue(aggregate());

    const result = await prepareCarouselWork(baseInput);

    expect(result.ok).toBe(true);
    const patch = repo.updateCreativeWorkDraftIfUnchanged.mock.calls[0][3] as {
      inputSnapshot: {
        factPack: unknown;
        sources: Array<{ sourceId: string; usage: string; content: unknown; style: unknown }>;
        carousel: { visualContract: { temporaryReferenceId: string | null } };
      };
    };
    expect(JSON.stringify(patch.inputSnapshot.factPack)).not.toContain("Oferta inventada da referência");
    expect(JSON.stringify(patch.inputSnapshot.factPack)).not.toContain("Headline da referência");
    expect(patch.inputSnapshot.sources).toEqual([
      expect.objectContaining({
        sourceId: "source-style-1",
        usage: "style",
        content: null,
        style: { description: "Fundo azul" },
        assetKey: "workspaces/ws/assets/ref.png",
      }),
    ]);
    expect(patch.inputSnapshot.carousel.visualContract.temporaryReferenceId).toBe("source-style-1");
  });

  it("creates the identity snapshot with published Brand Cortex enabled for carousel", async () => {
    repo.getCreativeWork.mockResolvedValue(aggregate());

    const result = await prepareCarouselWork(baseInput);

    expect(result.ok).toBe(true);
    expect(identityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        clientProfileId: "profile-1",
        selectedReferenceIds: [],
        brief: null,
        format: "4:5",
        includePublishedBrandKnowledge: true,
      })
    );
    const patch = repo.updateCreativeWorkDraftIfUnchanged.mock.calls[0][3] as {
      identitySnapshot: unknown;
    };
    expect(patch.identitySnapshot).toEqual(identityResult());
  });

  it("persists identity, deck and contract with one prepared revision while draft", async () => {
    repo.getCreativeWork.mockResolvedValue(aggregate());

    const result = await prepareCarouselWork(baseInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.deck.slides).toHaveLength(5);
    expect(result.value.visualContract.contractHash).toMatch(/^[a-f0-9]{64}$/);
    expect(repo.updateCreativeWorkDraftIfUnchanged).toHaveBeenCalledOnce();
    expect(repo.updateCreativeWorkDraftIfUnchanged).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      new Date(UPDATED_AT),
      expect.objectContaining({ identitySnapshot: expect.anything(), inputSnapshot: expect.anything() }),
      transactionExecutor,
    );
    const patch = repo.updateCreativeWorkDraftIfUnchanged.mock.calls[0][3] as {
      inputSnapshot: Record<string, unknown> & { carousel: unknown };
    };
    expect(patch.inputSnapshot.generationPolicyVersion).toBe("quality_recovery_v1");
    expect(patch.inputSnapshot.request).toBe("Grupo de terapia começa em agosto, vagas limitadas");
    expect(patch.inputSnapshot.settings).toEqual(work().settings);
    expect(patch.inputSnapshot.carousel).toEqual({
      version: 1,
      preparedRevision: expect.any(String),
      deck: expect.objectContaining({ slides: expect.arrayContaining([]) }),
      visualContract: expect.objectContaining({ contractHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
      generationScope: "cover",
      scriptRevision: "script-1",
      storyboard: [],
      caption: null,
    });
    expect(result.value.work.inputSnapshot?.carousel).toEqual({
      version: 1,
      preparedRevision: expect.any(String),
      deck: expect.objectContaining({ slides: expect.arrayContaining([]) }),
      visualContract: expect.objectContaining({ contractHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
      generationScope: "cover",
      scriptRevision: "script-1",
      storyboard: [],
      caption: null,
    });
    expect(result.value.work.status).toBe("draft");
  });

  it("freezes the candidate image policy in the preparation transaction", async () => {
    repo.getCreativeWork.mockResolvedValue(aggregate());
    await prepareCarouselWork(baseInput);
    expect(repo.updateCreativeWorkDraftIfUnchanged).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      new Date(UPDATED_AT),
      expect.objectContaining({
        inputSnapshot: expect.objectContaining({
          renderPolicy: { version: 1, model: "gpt-image-2.5-sunburst-2026-09-08", quality: "max" },
        }),
      }),
      transactionExecutor,
    );
  });

  it("reuses the prepared revision when an identical prepare runs again", async () => {
    repo.getCreativeWork.mockResolvedValue(aggregate());

    const first = await prepareCarouselWork(baseInput);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const patch = repo.updateCreativeWorkDraftIfUnchanged.mock.calls[0][3] as {
      identitySnapshot: unknown;
      inputSnapshot: CreativeWorkItem["inputSnapshot"];
    };
    const persisted = {
      ...work(),
      inputSnapshot: patch.inputSnapshot,
      identitySnapshot: patch.identitySnapshot,
      updatedAt: new Date("2026-08-30T12:00:01.000Z"),
    };
    repo.getCreativeWork.mockResolvedValue({ work: persisted, outputs: [], sources: [styleSource()] });
    repo.updateCreativeWorkDraftIfUnchanged.mockClear();
    envState.sunburstPercent = 0;

    const second = await prepareCarouselWork(baseInput);

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.preparedRevision).toBe(first.value.preparedRevision);
    expect(repo.updateCreativeWorkDraftIfUnchanged).not.toHaveBeenCalled();
  });

  it("invalidates the prepared revision when slide copy changes", async () => {
    repo.getCreativeWork.mockResolvedValue(aggregate());

    const first = await prepareCarouselWork(baseInput);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const patch = repo.updateCreativeWorkDraftIfUnchanged.mock.calls[0][3] as {
      inputSnapshot: CreativeWorkItem["inputSnapshot"];
    };
    // A human edit re-plans first: the draft deck (settings) is the authority,
    // so the changed copy arrives through settings.carouselDraft.plan.
    const draft = work().settings.carouselDraft;
    if (!draft?.plan) throw new Error("carousel draft missing");
    const persisted = {
      ...work(),
      settings: {
        targetFormats: [],
        carouselEditorial: approvedEditorial(),
        carouselDraft: {
          ...draft,
          plan: {
            ...draft.plan,
            slides: draft.plan.slides.map((slide, index) =>
              index === 1 ? { ...slide, primaryText: "texto revisado pelo humano" } : slide
            ),
          },
        },
      },
      inputSnapshot: patch.inputSnapshot,
      updatedAt: new Date("2026-08-30T12:00:01.000Z"),
    };
    repo.getCreativeWork.mockResolvedValue({ work: persisted, outputs: [], sources: [styleSource()] });
    repo.updateCreativeWorkDraftIfUnchanged.mockClear();

    const second = await prepareCarouselWork(baseInput);

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.preparedRevision).not.toBe(first.value.preparedRevision);
    expect(repo.updateCreativeWorkDraftIfUnchanged).toHaveBeenCalledOnce();
  });

  it("invalidates the prepared revision when the temporary reference changes", async () => {
    repo.getCreativeWork.mockResolvedValue(aggregate());

    const first = await prepareCarouselWork(baseInput);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const patch = repo.updateCreativeWorkDraftIfUnchanged.mock.calls[0][3] as {
      inputSnapshot: CreativeWorkItem["inputSnapshot"];
    };
    const persisted = {
      ...work(),
      inputSnapshot: patch.inputSnapshot,
      updatedAt: new Date("2026-08-30T12:00:01.000Z"),
    };
    const refreshedReference = styleSource({ updatedAt: new Date("2026-08-30T12:00:30.000Z") });
    repo.getCreativeWork.mockResolvedValue({
      work: persisted,
      outputs: [],
      sources: [refreshedReference],
    });
    repo.updateCreativeWorkDraftIfUnchanged.mockClear();

    const second = await prepareCarouselWork(baseInput);

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.preparedRevision).not.toBe(first.value.preparedRevision);
    expect(repo.updateCreativeWorkDraftIfUnchanged).toHaveBeenCalledOnce();
  });

  it("returns stale_input when the draft CAS loses the race", async () => {
    repo.getCreativeWork.mockResolvedValue(aggregate());
    repo.updateCreativeWorkDraftIfUnchanged.mockResolvedValue(null);

    const result = await prepareCarouselWork(baseInput);

    expect(result).toEqual({ ok: false, error: { code: "stale_input" } });
  });

  it("calls no billing, Inngest, image executor, or model seam", async () => {
    repo.getCreativeWork.mockResolvedValue(aggregate());

    await prepareCarouselWork(baseInput);

    expect(billing.spend).not.toHaveBeenCalled();
    expect(billing.checkSpend).not.toHaveBeenCalled();
    expect(billing.refundCredits).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
    expect(getOpenAIMock).not.toHaveBeenCalled();
  });

  it("blocks prepare when the storyboard references a missing claim", async () => {
    repo.getCreativeWork.mockResolvedValue(aggregate({
      settings: {
        targetFormats: [],
        carouselDraft: draftWithPlan(),
        carouselEditorial: approvedEditorial({
          research: {
            status: "ready",
            question: "O grupo começa em agosto?",
            thesis: "Grupo de terapia começa em agosto",
            sources: [],
            claims: [{
              id: "C1",
              text: "Grupo de terapia começa em agosto",
              sourceIds: [],
              kind: "fact",
              volatile: false,
            }],
            gaps: [],
          },
          storyboard: planOfFive().slides.map((slide) => ({
            slideId: slide.slideId,
            learning: "Avança o argumento",
            representation: "Tipografia com o fato",
            hierarchy: "Título e apoio",
            transition: "Próximo slide",
            claimIds: slide.slideId === "s2" ? ["missing-claim"] : ["C1"],
          })),
        }),
      },
    }));

    const result = await prepareCarouselWork(baseInput);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("editorial_invalid");
    expect(result.error.details).toMatchObject({
      reason: "missing_claim_reference",
      claimIds: ["missing-claim"],
    });
    expect(repo.updateCreativeWorkDraftIfUnchanged).not.toHaveBeenCalled();
  });

  it("refuses cover prepare until the current script is approved", async () => {
    repo.getCreativeWork.mockResolvedValue(aggregate({
      settings: {
        targetFormats: [],
        carouselDraft: draftWithPlan(),
        carouselEditorial: approvedEditorial({ approvedScriptRevision: null }),
      },
    }));

    const result = await prepareCarouselWork(baseInput);

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_generation_gate" } });
    expect(repo.updateCreativeWorkDraftIfUnchanged).not.toHaveBeenCalled();
  });

  it("prepares interiors from an approved cover without changing the billed settlement keys", async () => {
    const coverRevision = "prep-cover-1";
    repo.getCreativeWork.mockResolvedValue(aggregate({
      status: "partial",
      settings: {
        targetFormats: [],
        carouselDraft: draftWithPlan(),
        carouselEditorial: approvedEditorial({
          approvedCover: { slideId: "slide-1", scriptRevision: "script-1", preparedRevision: coverRevision },
        }),
      },
      inputSnapshot: {
        generationPolicyVersion: "quality_recovery_v1",
        request: "Grupo de terapia começa em agosto, vagas limitadas",
        settings: { targetFormats: [] },
        sources: [],
        carousel: {
          version: 1,
          preparedRevision: coverRevision,
          deck: planOfFive(),
          visualContract: {
            version: 1,
            brandSnapshotHash: "brand",
            temporaryReferenceId: null,
            palette: ["#112233"],
            typography: { fontAssetKey: null, fallbackFamily: "sans", authority: "fallback" },
            directionInstruction: null,
            layoutFamilies: {
              impact: { id: "impact-v1", density: "high", primaryRegion: { x: 1, y: 1, width: 2, height: 2, minFontPx: 1, maxFontPx: 2, align: "left" }, secondaryRegion: null, exactAssetSlots: [], backgroundInstruction: "impact" },
              development: { id: "development-v1", density: "medium", primaryRegion: { x: 1, y: 1, width: 2, height: 2, minFontPx: 1, maxFontPx: 2, align: "left" }, secondaryRegion: null, exactAssetSlots: [], backgroundInstruction: "development" },
              respite: { id: "respite-v1", density: "low", primaryRegion: { x: 1, y: 1, width: 2, height: 2, minFontPx: 1, maxFontPx: 2, align: "left" }, secondaryRegion: null, exactAssetSlots: [], backgroundInstruction: "respite" },
            },
            recurringMotifs: [],
            exactAssetKeys: [],
            prohibitedElements: [],
            safeAreaPx: 64,
            contractHash: "a".repeat(64),
          },
          generationScope: "cover",
          scriptRevision: "script-1",
        },
      },
    }));

    const result = await prepareCarouselWork(baseInput);

    expect(result.ok).toBe(true);
    expect(identityMock).not.toHaveBeenCalled();
    expect(repo.updateCreativeWorkDraftIfUnchanged).not.toHaveBeenCalled();
    expect(repo.updateCreativeWorkIfUnchanged).toHaveBeenCalledOnce();
    const patch = repo.updateCreativeWorkIfUnchanged.mock.calls[0][3] as {
      inputSnapshot: { carousel: { generationScope: string } };
    };
    expect(patch.inputSnapshot.carousel.generationScope).toBe("interiors");
  });
});

