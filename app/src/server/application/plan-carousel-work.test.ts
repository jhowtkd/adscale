import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCreativeWorkFactPack } from "@/server/creative-work/fact-pack";
import type { CreativeWorkCarouselSlide, CreativeWorkItem, CreativeWorkSource } from "@/server/db/schema";
import type {
  CarouselDeckPlanV1,
  CarouselDraftStateV1,
  CarouselVisualContractV1,
} from "@/server/creative-work/carousel-contracts";
import type { CarouselEditorialState, CarouselHook, CarouselResearch } from "@/server/creative-work/carousel-editorial-state";
import { recomputeCarouselEditorialHashes } from "@/server/creative-work/carousel-editorial-hash";

const repo = vi.hoisted(() => ({
  getCreativeWork: vi.fn(),
  updateCreativeWorkDraftIfUnchanged: vi.fn(),
  updateCreativeWorkIfUnchanged: vi.fn(),
}));
const brandKitMock = vi.hoisted(() => vi.fn());
const proposeMock = vi.hoisted(() => vi.fn());
const hooksMock = vi.hoisted(() => vi.fn());
const researchMock = vi.hoisted(() => vi.fn());
const listSlidesMock = vi.hoisted(() => vi.fn());
const refundCreditsMock = vi.hoisted(() => vi.fn());
const inngestSendMock = vi.hoisted(() => vi.fn());
const lockState = vi.hoisted(() => ({ held: false }));

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: (...args: unknown[]) => repo.getCreativeWork(...args),
  updateCreativeWorkDraftIfUnchanged: (...args: unknown[]) => repo.updateCreativeWorkDraftIfUnchanged(...args),
  updateCreativeWorkIfUnchanged: (...args: unknown[]) => repo.updateCreativeWorkIfUnchanged(...args),
  withCreativeWorkPreparationLock: async (
    _workspaceId: string,
    _workItemId: string,
    callback: (executor: object) => Promise<unknown>,
  ) => {
    lockState.held = true;
    try {
      return await callback({});
    } finally {
      lockState.held = false;
    }
  },
}));
vi.mock("@/server/repositories/brand-kit", () => ({
  getBrandKit: (...args: unknown[]) => brandKitMock(...args),
}));
vi.mock("@/server/creative-work/carousel-editorial", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/creative-work/carousel-editorial")>();
  return {
    ...actual,
    proposeCarouselDraft: (...args: unknown[]) => proposeMock(...args),
    proposeCarouselHooks: (...args: unknown[]) => hooksMock(...args),
  };
});
vi.mock("@/server/creative-work/carousel-research", () => ({
  researchCarousel: (...args: unknown[]) => researchMock(...args),
}));
vi.mock("@/server/repositories/creative-work-carousel", () => ({
  listCurrentCarouselSlides: (...args: unknown[]) => listSlidesMock(...args),
}));
vi.mock("@/server/billing/credits", () => ({
  refundCredits: (...args: unknown[]) => refundCreditsMock(...args),
  canSpend: vi.fn(),
  recordUsage: vi.fn(),
  spend: vi.fn(),
  checkSpend: vi.fn(),
}));
vi.mock("@/server/jobs/client", () => ({
  inngest: { send: (...args: unknown[]) => inngestSendMock(...args) },
}));

import { CarouselEditorialPlanInvalidError } from "@/server/creative-work/carousel-editorial";
import { planCarouselWork } from "./plan-carousel-work";

const UPDATED_AT = "2026-08-30T12:00:00.000Z";
const NEWER_AT = "2026-08-30T12:05:00.000Z";

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
    settings: { targetFormats: [] },
    inputSnapshot: null,
    identitySnapshot: null,
    createdAt: new Date("2026-08-30T11:00:00.000Z"),
    updatedAt: new Date(UPDATED_AT),
    ...overrides,
  } as CreativeWorkItem;
}

function source(overrides: Partial<CreativeWorkSource> = {}): CreativeWorkSource {
  return {
    id: "source-1",
    workspaceId: "workspace-1",
    workItemId: "work-1",
    assetId: "asset-1",
    templateId: null,
    usage: "content",
    usageConfirmed: true,
    status: "ready",
    contentAnalysis: {
      product: "Grupo de terapia",
      offer: "Turmas de agosto",
      cta: { text: "Inscreva-se", style: "botão" },
      brandElements: [],
      keyVisual: "Sala de grupo",
      textContent: { headline: "Nova turma", bullets: ["Vagas limitadas"] },
      format: "4:5",
    },
    styleAnalysis: null,
    pieceReference: null,
    failureCode: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CreativeWorkSource;
}

function planOfFive(revision = "deck-r1"): CarouselDeckPlanV1 {
  return {
    version: 1,
    revision,
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

function deckDraft(plan: CarouselDeckPlanV1 | null = planOfFive(), revision = "deck-r1"): CarouselDraftStateV1 {
  return {
    version: 1,
    revision,
    answers: {},
    blockingQuestions: [],
    plan,
    changes: [],
  };
}

function questionsDraft(): CarouselDraftStateV1 {
  return {
    version: 1,
    revision: "questions-1",
    answers: {},
    blockingQuestions: [{
      id: "q-1",
      field: "offer",
      question: "Qual é a condição de entrada?",
      reason: "O pedido não declara oferta.",
    }],
    plan: null,
    changes: [],
  };
}

function threeHooks(): CarouselHook[] {
  return [
    { id: "hook-1", headline: "Grupo de terapia em agosto", promise: "O grupo começa em agosto", narrative: "Abre com a data e fecha nas vagas." },
    { id: "hook-2", headline: "Vagas limitadas no consultório", promise: "As vagas do grupo são limitadas", narrative: "Parte da escassez e explica o cuidado." },
    { id: "hook-3", headline: "Cuidado em grupo no consultório", promise: "O grupo acontece no consultório", narrative: "Começa pelo setting e caminha até agosto." },
  ];
}

function readyResearch(overrides: Partial<CarouselResearch> = {}): CarouselResearch {
  return {
    status: "not_needed",
    question: "O grupo de terapia começa em agosto?",
    thesis: "O consultório abre grupo em agosto com vagas limitadas.",
    sources: [],
    claims: [],
    gaps: [],
    ...overrides,
  };
}

function storyboardFor(plan: CarouselDeckPlanV1) {
  return plan.slides.map((slide) => ({
    slideId: slide.slideId,
    learning: "O leitor entende a oferta",
    representation: "Tipografia com o fato principal",
    hierarchy: "Título, apoio, marca",
    transition: "Segue para o próximo argumento",
    claimIds: [] as string[],
  }));
}

function visualContractFixture(): CarouselVisualContractV1 {
  const region = { x: 80, y: 96, width: 864, height: 420, minFontPx: 42, maxFontPx: 82, align: "left" as const };
  return {
    version: 1,
    brandSnapshotHash: "brand-hash-1",
    temporaryReferenceId: null,
    palette: ["#112233"],
    typography: { fontAssetKey: null, fallbackFamily: "sans", authority: "fallback" },
    directionInstruction: null,
    layoutFamilies: {
      impact: { id: "impact-v1", density: "high", primaryRegion: region, secondaryRegion: null, exactAssetSlots: [], backgroundInstruction: "impact" },
      development: { id: "development-v1", density: "medium", primaryRegion: region, secondaryRegion: null, exactAssetSlots: [], backgroundInstruction: "development" },
      respite: { id: "respite-v1", density: "low", primaryRegion: region, secondaryRegion: null, exactAssetSlots: [], backgroundInstruction: "respite" },
    },
    recurringMotifs: [],
    exactAssetKeys: [],
    prohibitedElements: [],
    safeAreaPx: 64,
    contractHash: "contract-hash-1",
  };
}

function preparedSnapshot() {
  return {
    version: 1 as const,
    preparedRevision: "prep-1",
    deck: planOfFive(),
    visualContract: visualContractFixture(),
  };
}

function editorialState(overrides: Partial<CarouselEditorialState> = {}, deck: unknown = null): CarouselEditorialState {
  const hooks = overrides.hooks ?? threeHooks();
  const selectedHookId = overrides.selectedHookId === undefined ? "hook-1" : overrides.selectedHookId;
  const seeded: CarouselEditorialState = {
    version: 1,
    revision: "pending",
    contextHash: "pending",
    research: readyResearch(),
    hooks,
    recommendedHookId: "hook-1",
    recommendation: "Abre com o fato datado.",
    selectedHookId,
    storyboard: [],
    caption: null,
    approvedScriptRevision: null,
    approvedCover: null,
    confirmedInteriorsRevision: null,
    ...overrides,
  };
  return recomputeCarouselEditorialHashes(seeded, {
    request: "Grupo de terapia começa em agosto, vagas limitadas",
    deck: deck ?? (overrides.storyboard ? { revision: "deck-r1" } : null),
  });
}

function coverSlide(overrides: Partial<CreativeWorkCarouselSlide> = {}): CreativeWorkCarouselSlide {
  return {
    id: "cover-1",
    workspaceId: "workspace-1",
    workItemId: "work-1",
    lineageId: "lineage-1",
    parentSlideId: null,
    versionNumber: 1,
    deckRevision: "deck-r1",
    position: 1,
    role: "hook",
    primaryText: "Grupo de terapia começa em agosto",
    secondaryText: null,
    copyAuthority: "ai_proposal",
    sourceFactIds: [],
    layoutFamily: "impact",
    status: "completed",
    providerBaseKey: "base-1",
    outputKey: "out-1",
    previewKey: "out-1",
    visualContractHash: "hash",
    anchorKey: null,
    generationOperationKey: "deck-r1:s1",
    errorCode: null,
    quality: { objectivePassed: true },
    isCurrent: true,
    createdAt: new Date("2026-08-30T12:00:00.000Z"),
    queuedAt: null,
    terminalAt: new Date("2026-08-30T12:01:00.000Z"),
    updatedAt: new Date("2026-08-30T12:01:00.000Z"),
    ...overrides,
  } as CreativeWorkCarouselSlide;
}

const baseInput = {
  workspaceId: "workspace-1",
  workItemId: "work-1",
  expectedUpdatedAt: UPDATED_AT,
  answers: {},
};

describe("planCarouselWork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lockState.held = false;
    brandKitMock.mockResolvedValue({
      name: "Cenbrap",
      toneOfVoice: "Acolhedor",
      requiredElements: null,
      prohibitedElements: null,
    });
    repo.updateCreativeWorkDraftIfUnchanged.mockResolvedValue({ ...work(), updatedAt: new Date("2026-08-30T12:00:01.000Z") });
    repo.updateCreativeWorkIfUnchanged.mockResolvedValue({ ...work(), updatedAt: new Date("2026-08-30T12:00:01.000Z") });
    refundCreditsMock.mockResolvedValue({ status: "refunded" });
    researchMock.mockImplementation(async () => {
      expect(lockState.held).toBe(false);
      return readyResearch();
    });
    hooksMock.mockImplementation(async () => {
      expect(lockState.held).toBe(false);
      return {
        hooks: threeHooks(),
        recommendedHookId: "hook-1",
        recommendation: "Abre com o fato datado.",
      };
    });
    proposeMock.mockImplementation(async () => {
      expect(lockState.held).toBe(false);
      return { draft: deckDraft(), storyboard: storyboardFor(planOfFive()), caption: "Inscreva-se" };
    });
    listSlidesMock.mockResolvedValue([]);
  });

  it("returns work_not_found for a work outside the workspace", async () => {
    repo.getCreativeWork.mockResolvedValue(null);

    const result = await planCarouselWork(baseInput);

    expect(result).toEqual({ ok: false, error: { code: "work_not_found" } });
    expect(proposeMock).not.toHaveBeenCalled();
    expect(hooksMock).not.toHaveBeenCalled();
    expect(researchMock).not.toHaveBeenCalled();
  });

  it("returns work_not_carousel for a non-carousel tool kind", async () => {
    repo.getCreativeWork.mockResolvedValue({ work: work({ toolKind: "social_post" }), outputs: [], sources: [] });

    const result = await planCarouselWork(baseInput);

    expect(result).toEqual({ ok: false, error: { code: "work_not_carousel", details: { toolKind: "social_post" } } });
    expect(proposeMock).not.toHaveBeenCalled();
  });

  it("returns work_not_draft when the work left the draft state", async () => {
    repo.getCreativeWork.mockResolvedValue({ work: work({ status: "ready" }), outputs: [], sources: [] });

    const result = await planCarouselWork(baseInput);

    expect(result).toEqual({ ok: false, error: { code: "work_not_draft", details: { status: "ready" } } });
  });

  it("returns sources_not_ready while a source analysis is pending", async () => {
    repo.getCreativeWork.mockResolvedValue({
      work: work(),
      outputs: [],
      sources: [source(), source({ id: "source-2", status: "uploaded" })],
    });

    const result = await planCarouselWork(baseInput);

    expect(result).toEqual({ ok: false, error: { code: "sources_not_ready" } });
    expect(proposeMock).not.toHaveBeenCalled();
  });

  it("returns stale_input when expectedUpdatedAt does not match the persisted work", async () => {
    repo.getCreativeWork.mockResolvedValue({ work: work(), outputs: [], sources: [] });

    const result = await planCarouselWork({ ...baseInput, expectedUpdatedAt: "2026-08-30T11:59:59.000Z" });

    expect(result).toEqual({ ok: false, error: { code: "stale_input" } });
    expect(proposeMock).not.toHaveBeenCalled();
    expect(repo.updateCreativeWorkDraftIfUnchanged).not.toHaveBeenCalled();
  });

  it("maps an absent command to propose_hooks and never calls the legacy planner as an alternate path", async () => {
    repo.getCreativeWork.mockResolvedValue({ work: work(), outputs: [], sources: [source()] });

    await planCarouselWork(baseInput);

    expect(researchMock).toHaveBeenCalled();
    expect(hooksMock).toHaveBeenCalled();
    expect(proposeMock).not.toHaveBeenCalled();
  });

  it("builds the fact pack with mode social_post, content sources only, and merges answers into the request", async () => {
    const styleSource = source({
      id: "source-style",
      assetId: "asset-2",
      usage: "style",
      contentAnalysis: {
        product: "Referência visual secreta",
        offer: null,
        cta: null,
        brandElements: [],
        keyVisual: "Fundo azul",
        textContent: { headline: "Headline da referência", bullets: [] },
        format: "4:5",
      },
    });
    repo.getCreativeWork.mockResolvedValue({
      work: work(),
      outputs: [],
      sources: [source(), styleSource],
    });

    await planCarouselWork({ ...baseInput, answers: { publico: "Adultos" } });

    const researchCall = researchMock.mock.calls[0][0] as {
      request: string;
      factualSources: Array<{ sourceId: string; content: string }>;
    };
    expect(researchCall.request).toContain("publico: Adultos");
    expect(researchCall.request).toContain("Grupo de terapia começa em agosto");
    expect(researchCall.factualSources.map((item) => item.sourceId)).toEqual(["source-1"]);
    expect(JSON.stringify(researchCall.factualSources)).not.toContain("Referência visual secreta");
    expect(JSON.stringify(researchCall.factualSources)).toContain("Grupo de terapia");
    expect(hooksMock).toHaveBeenCalledWith(expect.objectContaining({
      request: expect.stringContaining("publico: Adultos"),
      toneOfVoice: "Acolhedor",
    }));
  });

  it("fails closed when a late proposal A arrives after the draft was edited to B", async () => {
    const olderDraft = deckDraft(planOfFive("deck-a"), "deck-a");
    const newerDraft = deckDraft(planOfFive("deck-b"), "deck-b");
    const store = {
      work: work({ settings: { targetFormats: [], carouselDraft: olderDraft } }),
      outputs: [] as unknown[],
      sources: [source()],
    };
    repo.getCreativeWork.mockImplementation(async () => ({ ...store }));
    repo.updateCreativeWorkDraftIfUnchanged.mockImplementation(async (
      _ws: string,
      _id: string,
      expectedUpdatedAt: Date,
      patch: { settings?: CreativeWorkItem["settings"] },
    ) => {
      if (store.work.updatedAt.toISOString() !== expectedUpdatedAt.toISOString()) return null;
      store.work = {
        ...store.work,
        settings: { ...store.work.settings, ...patch.settings },
        updatedAt: new Date("2026-08-30T12:00:01.000Z"),
      };
      return store.work;
    });
    hooksMock.mockImplementation(async () => {
      expect(lockState.held).toBe(false);
      store.work = work({
        settings: { targetFormats: [], carouselDraft: newerDraft },
        updatedAt: new Date(NEWER_AT),
      });
      return {
        hooks: threeHooks(),
        recommendedHookId: "hook-1",
        recommendation: "Abre com o fato datado.",
      };
    });

    const result = await planCarouselWork(baseInput);
    const persistedDraft = store.work.settings.carouselDraft;

    expect(result).toMatchObject({ ok: false, error: { code: "stale_input" } });
    expect(persistedDraft.plan).toEqual(newerDraft.plan);
  });

  it("persists three hooks through the draft CAS and returns the public editorial envelope", async () => {
    repo.getCreativeWork.mockResolvedValue({ work: work(), outputs: [], sources: [source()] });
    const persisted = work({
      updatedAt: new Date("2026-08-30T12:00:01.000Z"),
      settings: { targetFormats: [], carouselEditorial: editorialState({ selectedHookId: null }) },
    });
    repo.updateCreativeWorkDraftIfUnchanged.mockResolvedValue(persisted);

    const result = await planCarouselWork(baseInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.editorial.hooks).toHaveLength(3);
    expect(result.value.editorial.hooks.some((hook) => hook.id === result.value.editorial.recommendedHookId)).toBe(true);
    expect(proposeMock).not.toHaveBeenCalled();
    expect(repo.updateCreativeWorkDraftIfUnchanged).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      new Date(UPDATED_AT),
      expect.objectContaining({
        settings: expect.objectContaining({
          carouselEditorial: expect.objectContaining({
            hooks: threeHooks(),
            recommendedHookId: "hook-1",
          }),
        }),
      }),
      undefined,
      undefined,
    );
  });

  it("persists the hook selection before the script call so a later planner failure keeps it", async () => {
    const existing = editorialState({ selectedHookId: null });
    const store = {
      work: work({ settings: { targetFormats: [], carouselEditorial: existing } }),
      outputs: [] as unknown[],
      sources: [source()],
    };
    repo.getCreativeWork.mockImplementation(async () => ({ ...store }));
    repo.updateCreativeWorkDraftIfUnchanged.mockImplementation(async (
      _ws: string,
      _id: string,
      expectedUpdatedAt: Date,
      patch: { settings?: CreativeWorkItem["settings"] },
    ) => {
      if (store.work.updatedAt.toISOString() !== expectedUpdatedAt.toISOString()) return null;
      store.work = {
        ...store.work,
        settings: { ...store.work.settings, ...patch.settings },
        updatedAt: new Date("2026-08-30T12:00:01.000Z"),
      };
      return store.work;
    });
    proposeMock.mockRejectedValue(new CarouselEditorialPlanInvalidError("bad response"));

    const result = await planCarouselWork({
      ...baseInput,
      command: { kind: "select_hook", hookId: "hook-2", headline: "Vagas agora no grupo" },
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "editorial_plan_invalid" },
    });
    expect(store.work.settings.carouselEditorial?.selectedHookId).toBe("hook-2");
    expect(store.work.settings.carouselEditorial?.hooks.find((hook) => hook.id === "hook-2")?.headline).toBe("Vagas agora no grupo");
    expect(proposeMock).toHaveBeenCalled();
  });

  it("persists a 5-8 slide plan, storyboard and caption after select_hook", async () => {
    const existing = editorialState({ selectedHookId: null });
    const store = {
      work: work({ settings: { targetFormats: [], carouselEditorial: existing } }),
      outputs: [] as unknown[],
      sources: [source()],
    };
    repo.getCreativeWork.mockImplementation(async () => ({ ...store }));
    repo.updateCreativeWorkDraftIfUnchanged.mockImplementation(async (
      _ws: string,
      _id: string,
      expectedUpdatedAt: Date,
      patch: { settings?: CreativeWorkItem["settings"] },
    ) => {
      if (store.work.updatedAt.toISOString() !== expectedUpdatedAt.toISOString()) return null;
      store.work = {
        ...store.work,
        settings: { ...store.work.settings, ...patch.settings },
        updatedAt: new Date(store.work.updatedAt.getTime() + 1000),
      };
      return store.work;
    });
    const draft = deckDraft();
    const storyboard = storyboardFor(planOfFive());
    proposeMock.mockImplementation(async () => {
      expect(lockState.held).toBe(false);
      return { draft, storyboard, caption: "Inscreva-se" };
    });

    const result = await planCarouselWork({ ...baseInput, command: { kind: "select_hook", hookId: "hook-1" } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.draft.plan?.slides).toHaveLength(5);
    expect(result.value.findings).toEqual([]);
    expect(result.value.editorial.storyboard.map((item) => item.slideId)).toEqual(planOfFive().slides.map((slide) => slide.slideId));
    expect(proposeMock).toHaveBeenCalledWith(expect.objectContaining({
      selectedHook: expect.objectContaining({ id: "hook-1" }),
    }));
    const factPack = (proposeMock.mock.calls[0][0] as { factPack: ReturnType<typeof buildCreativeWorkFactPack> }).factPack;
    expect(JSON.stringify(factPack.facts)).toContain("Grupo de terapia");
  });

  it("keeps the last persisted draft and reports editorial_plan_invalid when the hooks response is invalid", async () => {
    repo.getCreativeWork.mockResolvedValue({ work: work(), outputs: [], sources: [source()] });
    hooksMock.mockRejectedValue(new CarouselEditorialPlanInvalidError("bad response"));

    const result = await planCarouselWork(baseInput);

    expect(result).toEqual({
      ok: false,
      error: { code: "editorial_plan_invalid" },
    });
    expect(repo.updateCreativeWorkDraftIfUnchanged).not.toHaveBeenCalled();
  });

  it("returns research_unavailable, preserves the last script, and records the gap", async () => {
    const lastDraft = deckDraft();
    const store = {
      work: work({ settings: { targetFormats: [], carouselDraft: lastDraft, carouselEditorial: editorialState({ selectedHookId: "hook-2" }) } }),
      outputs: [] as unknown[],
      sources: [source()],
    };
    repo.getCreativeWork.mockImplementation(async () => ({ ...store }));
    repo.updateCreativeWorkDraftIfUnchanged.mockImplementation(async (
      _ws: string,
      _id: string,
      expectedUpdatedAt: Date,
      patch: { settings?: CreativeWorkItem["settings"] },
    ) => {
      if (store.work.updatedAt.toISOString() !== expectedUpdatedAt.toISOString()) return null;
      store.work = {
        ...store.work,
        settings: { ...store.work.settings, ...patch.settings },
        updatedAt: new Date("2026-08-30T12:00:01.000Z"),
      };
      return store.work;
    });
    researchMock.mockResolvedValue(readyResearch({
      status: "unavailable",
      gaps: ["A pesquisa externa não devolveu um resultado utilizável. Restrinja a tese ou envie o material."],
    }));

    const result = await planCarouselWork(baseInput);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "research_unavailable",
        details: { gaps: ["A pesquisa externa não devolveu um resultado utilizável. Restrinja a tese ou envie o material."] },
      },
    });
    expect(store.work.settings.carouselDraft?.plan).toEqual(lastDraft.plan);
    expect(store.work.settings.carouselEditorial?.selectedHookId).toBe("hook-2");
    expect(hooksMock).not.toHaveBeenCalled();
  });

  it("keeps still-valid approvals when research is unavailable", async () => {
    const lastDraft = deckDraft();
    const approved = editorialState({
      selectedHookId: "hook-1",
      storyboard: storyboardFor(planOfFive()),
      caption: "Inscreva-se",
      approvedScriptRevision: "script-keep",
      approvedCover: { slideId: "cover-1", scriptRevision: "script-keep", preparedRevision: "prep-1" },
      confirmedInteriorsRevision: "prep-1",
    }, lastDraft);
    const store = {
      work: work({ settings: { targetFormats: [], carouselDraft: lastDraft, carouselEditorial: approved } }),
      outputs: [] as unknown[],
      sources: [source()],
    };
    repo.getCreativeWork.mockImplementation(async () => ({ ...store }));
    repo.updateCreativeWorkDraftIfUnchanged.mockImplementation(async (
      _ws: string,
      _id: string,
      expectedUpdatedAt: Date,
      patch: { settings?: CreativeWorkItem["settings"] },
    ) => {
      if (store.work.updatedAt.toISOString() !== expectedUpdatedAt.toISOString()) return null;
      store.work = {
        ...store.work,
        settings: { ...store.work.settings, ...patch.settings },
        updatedAt: new Date("2026-08-30T12:00:01.000Z"),
      };
      return store.work;
    });
    researchMock.mockResolvedValue(readyResearch({
      status: "unavailable",
      gaps: ["A pesquisa externa não devolveu um resultado utilizável. Restrinja a tese ou envie o material."],
    }));

    const result = await planCarouselWork(baseInput);

    expect(result).toMatchObject({ ok: false, error: { code: "research_unavailable" } });
    expect(store.work.settings.carouselDraft?.plan).toEqual(lastDraft.plan);
    expect(store.work.settings.carouselEditorial?.approvedScriptRevision).toBe("script-keep");
    expect(store.work.settings.carouselEditorial?.approvedCover).toEqual({
      slideId: "cover-1",
      scriptRevision: "script-keep",
      preparedRevision: "prep-1",
    });
    expect(store.work.settings.carouselEditorial?.confirmedInteriorsRevision).toBe("prep-1");
    expect(repo.updateCreativeWorkDraftIfUnchanged).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      new Date(UPDATED_AT),
      expect.objectContaining({
        settings: expect.objectContaining({
          carouselDraft: lastDraft,
          carouselEditorial: expect.objectContaining({
            approvedScriptRevision: "script-keep",
            research: expect.objectContaining({ status: "unavailable" }),
          }),
        }),
      }),
      undefined,
      { persistCarouselApprovals: true },
    );
  });

  it("returns research_insufficient without replacing the last script", async () => {
    const lastDraft = deckDraft();
    repo.getCreativeWork.mockResolvedValue({
      work: work({ settings: { targetFormats: [], carouselDraft: lastDraft } }),
      outputs: [],
      sources: [source()],
    });
    researchMock.mockResolvedValue(readyResearch({
      status: "insufficient",
      gaps: ["As fontes foram apenas descobertas, sem abertura verificada. Não há evidência suficiente."],
    }));
    repo.updateCreativeWorkDraftIfUnchanged.mockImplementation(async (
      _ws: string,
      _id: string,
      _expected: Date,
      patch: { settings?: CreativeWorkItem["settings"] },
    ) => work({
      settings: { targetFormats: [], carouselDraft: lastDraft, ...patch.settings },
      updatedAt: new Date("2026-08-30T12:00:01.000Z"),
    }));

    const result = await planCarouselWork(baseInput);

    expect(result).toMatchObject({ ok: false, error: { code: "research_insufficient" } });
    expect(repo.updateCreativeWorkDraftIfUnchanged.mock.calls[0][3].settings.carouselDraft).toEqual(lastDraft);
  });

  it("returns invalid_editorial_transition for select_hook without a proposed list", async () => {
    repo.getCreativeWork.mockResolvedValue({ work: work(), outputs: [], sources: [source()] });

    const result = await planCarouselWork({ ...baseInput, command: { kind: "select_hook", hookId: "hook-1" } });

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_editorial_transition" } });
    expect(proposeMock).not.toHaveBeenCalled();
  });

  it("approves the exact script revision when lint has no blocking findings", async () => {
    const draft = deckDraft();
    const storyboard = storyboardFor(planOfFive());
    const editorial = editorialState({
      selectedHookId: "hook-1",
      storyboard,
      caption: "Inscreva-se",
    });
    const hashed = recomputeCarouselEditorialHashes(editorial, {
      request: "Grupo de terapia começa em agosto, vagas limitadas",
      deck: draft,
    });
    repo.getCreativeWork.mockResolvedValue({
      work: work({ settings: { targetFormats: [], carouselDraft: draft, carouselEditorial: hashed } }),
      outputs: [],
      sources: [source()],
    });
    const persisted = work({
      updatedAt: new Date("2026-08-30T12:00:01.000Z"),
      settings: {
        targetFormats: [],
        carouselDraft: draft,
        carouselEditorial: { ...hashed, approvedScriptRevision: hashed.revision },
      },
    });
    repo.updateCreativeWorkIfUnchanged.mockResolvedValue(persisted);

    const result = await planCarouselWork({
      ...baseInput,
      command: { kind: "approve_script", scriptRevision: hashed.revision },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.editorial.approvedScriptRevision).toBe(hashed.revision);
    expect(researchMock).not.toHaveBeenCalled();
    expect(proposeMock).not.toHaveBeenCalled();
    expect(repo.updateCreativeWorkIfUnchanged).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      new Date(UPDATED_AT),
      expect.objectContaining({
        settings: expect.objectContaining({
          carouselEditorial: expect.objectContaining({ approvedScriptRevision: hashed.revision }),
        }),
      }),
      {},
      { persistCarouselApprovals: true },
    );
  });

  it.each(["partial", "generating"] as const)(
    "re-approves the current script of a %s work after cover rejection",
    async (status) => {
      const draft = deckDraft();
      const hashed = recomputeCarouselEditorialHashes(editorialState({
        selectedHookId: "hook-1",
        storyboard: storyboardFor(planOfFive()),
        caption: "Inscreva-se",
      }), {
        request: "Grupo de terapia começa em agosto, vagas limitadas",
        deck: draft,
      });
      repo.getCreativeWork.mockResolvedValue({
        work: work({
          status,
          settings: { targetFormats: [], carouselDraft: draft, carouselEditorial: hashed },
        }),
        outputs: [],
        sources: [source()],
      });
      const persisted = work({
        status,
        updatedAt: new Date("2026-08-30T12:00:01.000Z"),
        settings: {
          targetFormats: [],
          carouselDraft: draft,
          carouselEditorial: { ...hashed, approvedScriptRevision: hashed.revision },
        },
      });
      repo.updateCreativeWorkIfUnchanged.mockResolvedValue(persisted);

      const result = await planCarouselWork({
        ...baseInput,
        command: { kind: "approve_script", scriptRevision: hashed.revision },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.editorial.approvedScriptRevision).toBe(hashed.revision);
      expect(repo.updateCreativeWorkDraftIfUnchanged).not.toHaveBeenCalled();
      expect(repo.updateCreativeWorkIfUnchanged).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects approve_script when the revision does not match or lint blocks", async () => {
    const draft = deckDraft();
    const hashed = editorialState({ storyboard: storyboardFor(planOfFive()) });
    repo.getCreativeWork.mockResolvedValue({
      work: work({ settings: { targetFormats: [], carouselDraft: draft, carouselEditorial: hashed } }),
      outputs: [],
      sources: [source()],
    });

    const mismatch = await planCarouselWork({
      ...baseInput,
      command: { kind: "approve_script", scriptRevision: "other-revision" },
    });
    expect(mismatch).toMatchObject({ ok: false, error: { code: "invalid_editorial_transition" } });

    const blockedDraft = deckDraft({
      ...planOfFive(),
      slides: planOfFive().slides.map((slide, index) => index === 0 ? { ...slide, role: "context" } : slide),
    });
    const blockedEditorial = recomputeCarouselEditorialHashes(hashed, {
      request: "Grupo de terapia começa em agosto, vagas limitadas",
      deck: blockedDraft,
    });
    repo.getCreativeWork.mockResolvedValue({
      work: work({ settings: { targetFormats: [], carouselDraft: blockedDraft, carouselEditorial: blockedEditorial } }),
      outputs: [],
      sources: [source()],
    });
    const blocked = await planCarouselWork({
      ...baseInput,
      command: { kind: "approve_script", scriptRevision: blockedEditorial.revision },
    });
    expect(blocked).toMatchObject({ ok: false, error: { code: "invalid_editorial_transition" } });
    expect(repo.updateCreativeWorkDraftIfUnchanged).not.toHaveBeenCalled();
  });

  it.each(["partial", "generating"] as const)(
    "approves the current completed cover of a %s work without dispatching interiors",
    async (status) => {
    const draft = deckDraft();
    const hashed = editorialState({
      storyboard: storyboardFor(planOfFive()),
      approvedScriptRevision: "script-1",
    });
    const prepared = recomputeCarouselEditorialHashes({ ...hashed, approvedScriptRevision: hashed.revision }, {
      request: "Grupo de terapia começa em agosto, vagas limitadas",
      deck: draft,
    });
    const withApproval = { ...prepared, approvedScriptRevision: prepared.revision };
    repo.getCreativeWork.mockResolvedValue({
      work: work({
        status,
        settings: { targetFormats: [], carouselDraft: draft, carouselEditorial: withApproval },
        inputSnapshot: {
          carousel: preparedSnapshot(),
        } as CreativeWorkItem["inputSnapshot"],
      }),
      outputs: [],
      sources: [source()],
    });
    listSlidesMock.mockResolvedValue([coverSlide()]);
    const persisted = work({
      status,
      updatedAt: new Date("2026-08-30T12:00:01.000Z"),
      settings: {
        targetFormats: [],
        carouselDraft: draft,
        carouselEditorial: {
          ...withApproval,
          approvedCover: { slideId: "cover-1", scriptRevision: prepared.revision, preparedRevision: "prep-1" },
        },
      },
    });
    repo.updateCreativeWorkIfUnchanged.mockResolvedValue(persisted);

    const result = await planCarouselWork({
      ...baseInput,
      command: { kind: "approve_cover", slideId: "cover-1", preparedRevision: "prep-1" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.editorial.approvedCover).toEqual({
      slideId: "cover-1",
      scriptRevision: prepared.revision,
      preparedRevision: "prep-1",
    });
    expect(inngestSendMock).not.toHaveBeenCalled();
    expect(refundCreditsMock).not.toHaveBeenCalled();
    expect(repo.updateCreativeWorkDraftIfUnchanged).not.toHaveBeenCalled();
    expect(repo.updateCreativeWorkIfUnchanged).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      {},
      { persistCarouselApprovals: true },
    );
  });

  it("rejects a cover that belongs to another work", async () => {
    const draft = deckDraft();
    const hashed = editorialState({ storyboard: storyboardFor(planOfFive()) });
    const withApproval = { ...hashed, approvedScriptRevision: hashed.revision };
    repo.getCreativeWork.mockResolvedValue({
      work: work({
        settings: { targetFormats: [], carouselDraft: draft, carouselEditorial: withApproval },
        inputSnapshot: {
          carousel: preparedSnapshot(),
        } as CreativeWorkItem["inputSnapshot"],
      }),
      outputs: [],
      sources: [source()],
    });
    listSlidesMock.mockResolvedValue([coverSlide({ id: "cover-this-work" })]);

    const result = await planCarouselWork({
      ...baseInput,
      command: { kind: "approve_cover", slideId: "cover-other-work", preparedRevision: "prep-1" },
    });

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_editorial_transition" } });
    expect(repo.updateCreativeWorkDraftIfUnchanged).not.toHaveBeenCalled();
  });

  it("treats a second identical approval as a reload of the same decision", async () => {
    const draft = deckDraft();
    const hashed = editorialState({ storyboard: storyboardFor(planOfFive()) }, draft);
    const approved = {
      ...hashed,
      approvedScriptRevision: hashed.revision,
      approvedCover: { slideId: "cover-1", scriptRevision: hashed.revision, preparedRevision: "prep-1" },
    };
    const current = work({
      settings: { targetFormats: [], carouselDraft: draft, carouselEditorial: approved },
      inputSnapshot: {
        carousel: preparedSnapshot(),
      } as CreativeWorkItem["inputSnapshot"],
    });
    repo.getCreativeWork.mockResolvedValue({ work: current, outputs: [], sources: [source()] });
    listSlidesMock.mockResolvedValue([coverSlide()]);

    const script = await planCarouselWork({
      ...baseInput,
      command: { kind: "approve_script", scriptRevision: hashed.revision },
    });
    expect(script.ok).toBe(true);
    if (script.ok) {
      expect(script.value.editorial.approvedScriptRevision).toBe(hashed.revision);
      expect(script.value.editorial.approvedCover?.slideId).toBe("cover-1");
    }

    const cover = await planCarouselWork({
      ...baseInput,
      command: { kind: "approve_cover", slideId: "cover-1", preparedRevision: "prep-1" },
    });
    expect(cover.ok).toBe(true);
    if (!cover.ok) return;
    expect(cover.value.editorial.approvedCover).toEqual(approved.approvedCover);
    expect(repo.updateCreativeWorkDraftIfUnchanged).not.toHaveBeenCalled();
  });

  it("returns stale_input when the draft CAS loses the race", async () => {
    repo.getCreativeWork.mockResolvedValue({ work: work(), outputs: [], sources: [source()] });
    repo.updateCreativeWorkDraftIfUnchanged.mockResolvedValue(null);

    const result = await planCarouselWork(baseInput);

    expect(result).toEqual({ ok: false, error: { code: "stale_input" } });
  });

  it("calls no billing, Inngest, or image provider seam", async () => {
    repo.getCreativeWork.mockResolvedValue({ work: work(), outputs: [], sources: [source()] });

    await planCarouselWork(baseInput);

    expect(refundCreditsMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });
});
