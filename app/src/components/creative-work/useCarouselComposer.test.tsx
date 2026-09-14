import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  creativeWorkKey,
  type CreativeWorkDetail,
} from "@/lib/hooks/use-creative-work";
import {
  carouselLayoutFamilyForRole,
  type CarouselBlockingQuestionV1,
  type CarouselDeckPlanV1,
  type CarouselDraftStateV1,
  type CarouselEditorialChangeV1,
  type CarouselNarrativeRole,
} from "@/server/creative-work/carousel-contracts";
import type { PreparedPlanProjectionV1 } from "@/server/creative-work/prepared-plan";
import type { CarouselEditorialState } from "@/server/creative-work/carousel-editorial-state";
import { CreativeWorkRequestError } from "@/lib/hooks/use-creative-work";

const mocks = vi.hoisted(() => ({
  work: vi.fn(),
  refetch: vi.fn(),
  plan: vi.fn(),
  planPending: vi.fn(() => false),
  reviseSlide: vi.fn(),
  reviseSlidePending: vi.fn(() => false),
  reviseDeck: vi.fn(),
  approve: vi.fn(),
  exportDeck: vi.fn(),
  autosave: vi.fn(),
  autosavePending: vi.fn(() => false),
  preparePlan: vi.fn(),
  confirmGeneration: vi.fn(),
  recordCanonicalEvent: vi.fn(),
  flushAutosave: vi.fn(),
  resolveCanonicalWorkRevision: vi.fn(),
  setCanonicalWorkRevision: vi.fn(),
  blockStaleRevision: vi.fn(),
  setError: vi.fn(),
}));

vi.mock("@/lib/hooks/use-creative-work", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hooks/use-creative-work")>()),
  useCreativeWork: (...args: unknown[]) => mocks.work(...args),
  usePlanCarouselWork: () => ({ mutateAsync: mocks.plan, isPending: mocks.planPending() }),
  useReviseCarouselSlide: () => ({ mutateAsync: mocks.reviseSlide, isPending: mocks.reviseSlidePending() }),
  useReviseCarouselDeck: () => ({ mutateAsync: mocks.reviseDeck, isPending: false }),
  useApproveCarouselDeck: () => ({ mutateAsync: mocks.approve, isPending: false }),
  useExportCarouselDeck: () => ({ mutateAsync: mocks.exportDeck, isPending: false }),
  useAutosaveCreativeWork: () => ({ mutateAsync: mocks.autosave, isPending: mocks.autosavePending() }),
}));

import { useCarouselComposer } from "./useCarouselComposer";
import { useComposerRevision } from "./useComposerRevision";

const WORK_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NOW = new Date().toISOString();

function planSlide(
  position: number,
  role: CarouselNarrativeRole,
  overrides: Record<string, unknown> = {},
) {
  return {
    slideId: `slide-${position}`,
    position,
    role,
    purpose: `Propósito ${position}`,
    primaryText: `Texto ${position}`,
    secondaryText: null,
    authority: "ai_proposal" as const,
    sourceFactIds: [],
    layoutFamily: carouselLayoutFamilyForRole(role),
    ...overrides,
  };
}

function carouselPlan(overrides: Record<string, unknown> = {}): CarouselDeckPlanV1 {
  return {
    version: 1,
    revision: "deck-r1",
    workId: WORK_ID,
    objective: "Lançar o produto",
    audience: null,
    tone: null,
    promise: "Promessa clara",
    format: "4:5",
    slides: [
      planSlide(1, "hook"),
      planSlide(2, "context"),
      planSlide(3, "problem"),
      planSlide(4, "argument"),
      planSlide(5, "cta"),
    ],
    ...overrides,
  };
}

function carouselDraft(overrides: Partial<CarouselDraftStateV1> = {}): CarouselDraftStateV1 {
  return {
    version: 1,
    revision: "draft-r1",
    answers: {},
    blockingQuestions: [],
    plan: null,
    changes: [],
    ...overrides,
  };
}

function publicSlide(slide: ReturnType<typeof planSlide>, overrides: Record<string, unknown> = {}) {
  return {
    id: slide.slideId,
    lineageId: `lineage-${slide.position}`,
    parentSlideId: null,
    versionNumber: 1,
    deckRevision: "deck-r1",
    position: slide.position,
    role: slide.role,
    primaryText: slide.primaryText,
    secondaryText: slide.secondaryText,
    copyAuthority: slide.authority,
    sourceFactIds: [],
    layoutFamily: slide.layoutFamily,
    status: "completed",
    hasOutput: true,
    planSlideId: slide.slideId,
    errorCode: null,
    quality: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function editorialState(overrides: Partial<CarouselEditorialState> = {}): CarouselEditorialState {
  return {
    version: 1,
    revision: "script-1",
    contextHash: "ctx-1",
    research: {
      status: "not_needed",
      question: "O grupo começa em agosto?",
      thesis: "O consultório abre grupo em agosto.",
      sources: [],
      claims: [],
      gaps: [],
    },
    hooks: [
      { id: "hook-1", headline: "Grupo em agosto", promise: "Vagas limitadas", narrative: "Fato, prova, inscrição" },
      { id: "hook-2", headline: "Comece o cuidado", promise: "Rotina em grupo", narrative: "Dor, método, convite" },
      { id: "hook-3", headline: "Agosto abre vagas", promise: "Turma pequena", narrative: "Novidade, critério, CTA" },
    ],
    recommendedHookId: "hook-1",
    recommendation: "Abre com o fato datado.",
    selectedHookId: null,
    storyboard: [
      { slideId: "slide-1", learning: "Data", representation: "Tipografia com o fato principal", hierarchy: "Título", transition: "Prova", claimIds: [] },
      { slideId: "slide-2", learning: "Oferta", representation: "Comparar duas rotinas", hierarchy: "Dois blocos", transition: "Contraste", claimIds: [] },
      { slideId: "slide-3", learning: "Método", representation: "Diagrama", hierarchy: "Passos", transition: "Convite", claimIds: [] },
      { slideId: "slide-4", learning: "Prova", representation: "Detalhe", hierarchy: "Citação", transition: "Ação", claimIds: [] },
      { slideId: "slide-5", learning: "CTA", representation: "Tipografia", hierarchy: "Ação", transition: "Fim", claimIds: [] },
    ],
    caption: "Inscreva-se pelo WhatsApp",
    approvedScriptRevision: null,
    approvedCover: null,
    confirmedInteriorsRevision: null,
    ...overrides,
  };
}

function carouselDetail(overrides: {
  draft?: CarouselDraftStateV1 | null;
  editorial?: CarouselEditorialState | null;
  preparedPlan?: PreparedPlanProjectionV1 | null;
  slides?: ReturnType<typeof publicSlide>[];
  status?: string;
  carouselApprovedRevision?: string | null;
  carouselQuality?: Record<string, unknown> | null;
} = {}): CreativeWorkDetail {
  const draft = overrides.draft === undefined ? carouselDraft({ plan: carouselPlan() }) : overrides.draft;
  const editorial = overrides.editorial === undefined ? null : overrides.editorial;
  return {
    work: {
      id: WORK_ID,
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      createdByUserId: "user-1",
      draftKey: null,
      campaignId: null,
      title: "Carrossel",
      request: "Carrossel de lançamento",
      toolKind: "carousel",
      status: (overrides.status ?? "draft") as CreativeWorkDetail["work"]["status"],
      brief: { theme: "tema", objective: "objetivo", audience: "público", offer: null },
      format: "4:5",
      settings: {
        targetFormats: [],
        ...(draft ? { carouselDraft: draft } : {}),
        ...(editorial ? { carouselEditorial: editorial } : {}),
      },
      copy: null,
      identitySnapshot: null,
      carouselApprovedRevision: overrides.carouselApprovedRevision ?? null,
      carouselQuality: overrides.carouselQuality ?? null,
      createdAt: NOW,
      updatedAt: NOW,
    },
    outputs: [],
    sources: [],
    preparedPlan: overrides.preparedPlan ?? null,
    carouselSlides: overrides.slides ?? [],
  };
}

function carouselPreparedPlan(preparedRevision = "prep-1"): PreparedPlanProjectionV1 {
  return {
    version: 1,
    workId: WORK_ID,
    preparedRevision,
    protocol: "carousel",
    materials: [],
    preserve: [],
    explore: [],
    outputs: [],
    outputCount: 5,
    formats: ["4:5"],
  };
}

const blockingQuestion: CarouselBlockingQuestionV1 = {
  id: "q-1",
  field: "offer",
  question: "Qual é a oferta?",
  reason: "A copy precisa de uma oferta verificável",
};

function editorialChange(overrides: Partial<CarouselEditorialChangeV1> = {}): CarouselEditorialChangeV1 {
  return {
    id: "change-1",
    slideId: "slide-2",
    field: "primaryText",
    before: "Texto 2",
    after: "Sugestão da IA",
    reason: "Fica mais direto",
    status: "pending",
    ...overrides,
  };
}

let queryClient: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function cacheDetail(): CreativeWorkDetail | undefined {
  return queryClient.getQueryData(creativeWorkKey(WORK_ID)) as CreativeWorkDetail | undefined;
}

function cachedDraft(): CarouselDraftStateV1 | undefined {
  return cacheDetail()?.work.settings.carouselDraft;
}

function renderComposer(
  input: Partial<Parameters<typeof useCarouselComposer>[0]> = {},
  preparedPlan: PreparedPlanProjectionV1 | null = null,
) {
  const workIdRef = { current: WORK_ID as string | null };
  const draftEpochRef = { current: 0 };
  return renderHook(
    () =>
      useCarouselComposer({
        workId: WORK_ID,
        workIdRef,
        draftEpochRef,
        flushAutosave: mocks.flushAutosave,
        resolveCanonicalWorkRevision: mocks.resolveCanonicalWorkRevision,
        setCanonicalWorkRevision: mocks.setCanonicalWorkRevision,
        blockStaleRevision: mocks.blockStaleRevision,
        setError: mocks.setError,
        preparedPlan,
        preparePlan: mocks.preparePlan,
        confirmGeneration: mocks.confirmGeneration,
        recordCanonicalEvent: mocks.recordCanonicalEvent,
        ...input,
      }),
    { wrapper },
  );
}

function bindWorkToCache() {
  mocks.work.mockImplementation(() => ({
    data: queryClient.getQueryData(creativeWorkKey(WORK_ID)),
    isLoading: false,
    refetch: mocks.refetch,
  }));
  mocks.refetch.mockImplementation(async () => ({ data: cacheDetail() }));
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.plan.mockResolvedValue({ work: carouselDetail().work, draft: carouselDraft() });
  mocks.reviseSlide.mockResolvedValue({ slide: {}, slides: [], replay: false });
  mocks.reviseDeck.mockResolvedValue({});
  mocks.approve.mockResolvedValue({ approvedRevision: "deck-r1", replay: false });
  mocks.exportDeck.mockResolvedValue(new Blob(["zip"]));
  mocks.autosave.mockResolvedValue({ work: { id: WORK_ID } });
  mocks.autosavePending.mockReturnValue(false);
  mocks.preparePlan.mockResolvedValue(carouselPreparedPlan());
  mocks.confirmGeneration.mockResolvedValue(undefined);
  mocks.recordCanonicalEvent.mockReturnValue(undefined);
  mocks.flushAutosave.mockResolvedValue(WORK_ID);
  mocks.resolveCanonicalWorkRevision.mockResolvedValue(NOW);
  mocks.setCanonicalWorkRevision.mockReturnValue(NOW);
});

describe("useCarouselComposer phase derivation", () => {
  it("derives the wizard phase exactly from persisted state", () => {
    bindWorkToCache();

    queryClient.setQueryData(creativeWorkKey(WORK_ID), carouselDetail({ draft: null }));
    const entry = renderComposer();
    expect(entry.result.current.phase).toBe("entry");
    expect(entry.result.current.draft).toBeNull();

    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({ draft: carouselDraft({ blockingQuestions: [blockingQuestion] }) }),
    );
    const questions = renderComposer();
    expect(questions.result.current.phase).toBe("questions");
    expect(questions.result.current.findings).toEqual([]);

    queryClient.setQueryData(creativeWorkKey(WORK_ID), carouselDetail());
    const sequence = renderComposer();
    expect(sequence.result.current.phase).toBe("sequence");
    expect(sequence.result.current.canPrepare).toBe(false);
    expect(sequence.result.current.canGenerate).toBe(false);

    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({ preparedPlan: carouselPreparedPlan() }),
    );
    const ready = renderComposer(null, carouselPreparedPlan());
    expect(ready.result.current.phase).toBe("ready_to_generate");
    expect(ready.result.current.canGenerate).toBe(true);
    expect(ready.result.current.canPrepare).toBe(false);

    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({
        preparedPlan: carouselPreparedPlan(),
        slides: [
          publicSlide(planSlide(1, "hook"), { status: "completed" }),
          publicSlide(planSlide(2, "context"), { status: "processing" }),
        ],
      }),
    );
    const generating = renderComposer(null, carouselPreparedPlan());
    expect(generating.result.current.phase).toBe("generating");
    expect(generating.result.current.isBusy).toBe(false);

    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({
        preparedPlan: carouselPreparedPlan(),
        slides: [
          publicSlide(planSlide(1, "hook")),
          publicSlide(planSlide(2, "context")),
          publicSlide(planSlide(3, "problem")),
          publicSlide(planSlide(4, "argument")),
          publicSlide(planSlide(5, "cta")),
        ],
      }),
    );
    const review = renderComposer(null, carouselPreparedPlan());
    expect(review.result.current.phase).toBe("review");
    expect(review.result.current.slides).toHaveLength(5);
    expect(review.result.current.selectedSlide?.id).toBe("slide-1");
    expect(review.result.current.canApprove).toBe(true);
  });

  it("reloads hooks, script and cover from persisted editorial", () => {
    bindWorkToCache();

    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({ draft: carouselDraft({ plan: null }), editorial: editorialState() }),
    );
    const hooks = renderComposer();
    expect(hooks.result.current.phase).toBe("hooks");
    expect(hooks.result.current.editorial?.hooks).toHaveLength(3);

    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({ editorial: editorialState({ selectedHookId: "hook-1" }) }),
    );
    const script = renderComposer();
    expect(script.result.current.phase).toBe("sequence");
    expect(script.result.current.canApproveScript).toBe(true);

    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({
        editorial: editorialState({
          selectedHookId: "hook-1",
          approvedScriptRevision: "script-1",
        }),
        preparedPlan: carouselPreparedPlan(),
        slides: [
          publicSlide(planSlide(1, "hook"), { status: "completed" }),
          publicSlide(planSlide(2, "context"), { status: "draft", hasOutput: false }),
          publicSlide(planSlide(3, "problem"), { status: "draft", hasOutput: false }),
          publicSlide(planSlide(4, "argument"), { status: "draft", hasOutput: false }),
          publicSlide(planSlide(5, "cta"), { status: "draft", hasOutput: false }),
        ],
      }),
    );
    const cover = renderComposer(null, carouselPreparedPlan());
    expect(cover.result.current.phase).toBe("cover_review");
    expect(cover.result.current.canApproveCover).toBe(true);
    expect(cover.result.current.canGenerate).toBe(false);
    expect(cover.result.current.interiorsQuote).toEqual({ unitCount: 4, credits: 200 });

    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({
        editorial: editorialState({
          selectedHookId: "hook-1",
          approvedScriptRevision: null,
        }),
        preparedPlan: carouselPreparedPlan(),
        slides: [
          publicSlide(planSlide(1, "hook"), { status: "completed" }),
          publicSlide(planSlide(2, "context"), { status: "draft", hasOutput: false }),
          publicSlide(planSlide(3, "problem"), { status: "draft", hasOutput: false }),
          publicSlide(planSlide(4, "argument"), { status: "draft", hasOutput: false }),
          publicSlide(planSlide(5, "cta"), { status: "draft", hasOutput: false }),
        ],
      }),
    );
    const afterScriptInvalidated = renderComposer(null, carouselPreparedPlan());
    expect(afterScriptInvalidated.result.current.phase).toBe("sequence");
    expect(afterScriptInvalidated.result.current.canApproveScript).toBe(true);
    expect(afterScriptInvalidated.result.current.canApproveCover).toBe(false);
  });
});

describe("useCarouselComposer plan questions", () => {
  it("flushes the latest draft before resolving its revision and posting answers", async () => {
    queryClient.setQueryData(creativeWorkKey(WORK_ID), carouselDetail({ draft: null }));
    bindWorkToCache();
    const order: string[] = [];
    const savedRevision = new Date(Date.parse(NOW) + 1_000).toISOString();
    mocks.flushAutosave.mockImplementation(async () => {
      order.push("save");
      return WORK_ID;
    });
    mocks.resolveCanonicalWorkRevision.mockImplementation(async () => {
      order.push("revision");
      return savedRevision;
    });
    mocks.plan.mockImplementation(async () => {
      order.push("plan");
      return { work: carouselDetail().work, draft: carouselDraft() };
    });

    const { result } = renderComposer();
    await act(() => result.current.askForPlan({ objective: "Lançamento" }));

    expect(order).toEqual(["save", "revision", "plan"]);
    expect(mocks.plan).toHaveBeenCalledTimes(1);
    expect(mocks.plan).toHaveBeenCalledWith({
      workItemId: WORK_ID,
      expectedUpdatedAt: savedRevision,
      answers: { objective: "Lançamento" },
    });
  });

  it("organizes a first request using the draft created by the generic save command", async () => {
    const workIdRef = { current: null as string | null };
    mocks.flushAutosave.mockImplementation(async () => {
      workIdRef.current = WORK_ID;
      return WORK_ID;
    });
    const { result } = renderComposer({ workId: "", workIdRef });

    await act(() => result.current.askForPlan());

    expect(mocks.plan).toHaveBeenCalledWith({
      workItemId: WORK_ID,
      expectedUpdatedAt: NOW,
      answers: {},
    });
  });

  it("stays busy through saving and planning and ignores duplicate clicks", async () => {
    let finishSave!: (id: string) => void;
    let finishPlan!: (value: unknown) => void;
    mocks.flushAutosave.mockReturnValue(new Promise<string>((resolve) => { finishSave = resolve; }));
    mocks.plan.mockReturnValue(new Promise((resolve) => { finishPlan = resolve; }));
    const { result } = renderComposer();
    let pending!: Promise<void>;
    act(() => { pending = result.current.askForPlan(); });

    expect(result.current.isBusy).toBe(true);
    await act(() => result.current.askForPlan());
    expect(mocks.flushAutosave).toHaveBeenCalledTimes(1);
    expect(mocks.plan).not.toHaveBeenCalled();

    await act(async () => { finishSave(WORK_ID); });
    expect(result.current.isBusy).toBe(true);
    expect(mocks.plan).toHaveBeenCalledTimes(1);
    await act(async () => { finishPlan({ work: carouselDetail().work }); await pending; });
    expect(result.current.isBusy).toBe(false);
  });

  it.each(["save", "revision", "plan"])("exposes a %s failure without leaving the action busy", async (step) => {
    const failure = new Error(`Falha de ${step}`);
    if (step === "save") mocks.flushAutosave.mockRejectedValue(failure);
    if (step === "revision") mocks.resolveCanonicalWorkRevision.mockRejectedValue(failure);
    if (step === "plan") mocks.plan.mockRejectedValue(failure);
    const { result } = renderComposer();

    await act(() => result.current.askForPlan());

    expect(mocks.setError).toHaveBeenLastCalledWith(failure.message);
    expect(result.current.isBusy).toBe(false);
    if (step !== "plan") expect(mocks.plan).not.toHaveBeenCalled();
  });

  it.each(["save", "revision"])("shows an error when %s returns no canonical draft", async (step) => {
    if (step === "save") mocks.flushAutosave.mockResolvedValue(null);
    if (step === "revision") mocks.resolveCanonicalWorkRevision.mockResolvedValue(null);
    const { result } = renderComposer();

    await act(() => result.current.askForPlan());

    expect(mocks.setError).toHaveBeenLastCalledWith(expect.stringContaining("Não foi possível"));
    expect(mocks.plan).not.toHaveBeenCalled();
    expect(result.current.isBusy).toBe(false);
  });

  it("shows a save failure after the first draft was created without discarding its identity", async () => {
    const workIdRef = { current: null as string | null };
    mocks.flushAutosave.mockImplementation(async () => {
      workIdRef.current = WORK_ID;
      throw new Error("Não foi possível salvar a edição mais recente");
    });
    const { result } = renderComposer({ workId: "", workIdRef });

    await act(() => result.current.askForPlan());

    expect(mocks.setError).toHaveBeenLastCalledWith("Não foi possível salvar a edição mais recente");
    expect(workIdRef.current).toBe(WORK_ID);
    expect(mocks.plan).not.toHaveBeenCalled();
  });

  it("does not plan another work after resolving the previous work revision", async () => {
    const workIdRef = { current: WORK_ID as string | null };
    mocks.resolveCanonicalWorkRevision.mockImplementation(async () => {
      workIdRef.current = "another-work";
      return NOW;
    });
    const { result } = renderComposer({ workIdRef });

    await act(() => result.current.askForPlan());

    expect(mocks.plan).not.toHaveBeenCalled();
    expect(mocks.setError).toHaveBeenLastCalledWith(null);
  });

  it("does not plan an old request after a protocol switch during save", async () => {
    const draftEpochRef = { current: 0 };
    mocks.flushAutosave.mockImplementation(async () => {
      draftEpochRef.current += 1;
      return WORK_ID;
    });
    const { result } = renderComposer({ draftEpochRef });

    await act(() => result.current.askForPlan());

    expect(mocks.plan).not.toHaveBeenCalled();
    expect(mocks.setError).toHaveBeenCalledTimes(1);
    expect(mocks.setError).toHaveBeenCalledWith(null);
  });

  it("keeps blocking questions visible after the cache refetch", async () => {
    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({ draft: carouselDraft({ blockingQuestions: [blockingQuestion] }) }),
    );
    bindWorkToCache();

    const { result } = renderComposer();
    expect(result.current.phase).toBe("questions");

    await act(() => result.current.answerQuestions({ offer: "50% na primeira compra" }));

    expect(mocks.plan).toHaveBeenCalledWith(expect.objectContaining({
      answers: { offer: "50% na primeira compra" },
    }));
    expect(result.current.phase).toBe("questions");
  });

  it("answers planner questions with the revision returned by the previous plan", async () => {
    let serverDetail = carouselDetail({ draft: null });
    queryClient.setQueryData(creativeWorkKey(WORK_ID), serverDetail);
    bindWorkToCache();
    const { result: revision } = renderHook(() => useComposerRevision({
      data: cacheDetail(),
      refetch: mocks.refetch,
    }));
    const { result, rerender } = renderComposer(revision.current);
    const revisions = [NOW];
    mocks.plan.mockImplementation(async ({ expectedUpdatedAt, answers }) => {
      if (expectedUpdatedAt !== serverDetail.work.updatedAt) {
        throw Object.assign(new Error("Rascunho alterado"), { status: 409 });
      }
      const draft = Object.keys(answers).length === 0
        ? carouselDraft({ blockingQuestions: [blockingQuestion] })
        : carouselDraft({ answers, plan: carouselPlan() });
      const updatedAt = new Date(Date.parse(expectedUpdatedAt) + 1_000).toISOString();
      revisions.push(updatedAt);
      serverDetail = {
        ...serverDetail,
        work: { ...serverDetail.work, updatedAt, settings: { ...serverDetail.work.settings, carouselDraft: draft } },
      };
      queryClient.setQueryData(creativeWorkKey(WORK_ID), serverDetail);
      return { work: serverDetail.work, draft };
    });

    await act(() => result.current.askForPlan());
    rerender();
    expect(result.current.phase).toBe("questions");
    await act(() => result.current.answerQuestions({ offer: "50% na primeira compra" }));
    rerender();

    expect(mocks.plan.mock.calls.map(([input]) => input.expectedUpdatedAt)).toEqual(revisions.slice(0, 2));
    expect(await revision.current.resolveCanonicalWorkRevision(WORK_ID)).toBe(revisions[2]);
    expect(result.current.phase).toBe("sequence");
    expect(mocks.autosave).not.toHaveBeenCalled();
    expect(mocks.setError).toHaveBeenLastCalledWith(null);
  });

  it.each([false, true])("refreshes a 409 before the next explicit answer (first refresh fails: %s)", async (refreshFails) => {
    const initial = carouselDetail({ draft: carouselDraft({ blockingQuestions: [blockingQuestion] }) });
    queryClient.setQueryData(creativeWorkKey(WORK_ID), initial);
    bindWorkToCache();
    const currentRevision = new Date(Date.parse(NOW) + 1_000).toISOString();
    const acceptedRevision = new Date(Date.parse(NOW) + 2_000).toISOString();
    const current = { ...initial, work: { ...initial.work, updatedAt: currentRevision } };
    mocks.refetch.mockImplementation(async () => {
      queryClient.setQueryData(creativeWorkKey(WORK_ID), current);
      return { data: current };
    });
    if (refreshFails) mocks.refetch.mockRejectedValueOnce(new Error("Sem conexão"));
    const { result: revision } = renderHook(() => useComposerRevision({
      data: initial,
      refetch: mocks.refetch,
    }));
    const { result } = renderComposer(revision.current);
    mocks.plan.mockImplementation(async ({ expectedUpdatedAt }) => {
      if (expectedUpdatedAt !== currentRevision) {
        throw Object.assign(new Error("Rascunho alterado"), { status: 409 });
      }
      return { work: { ...current.work, updatedAt: acceptedRevision }, draft: carouselDraft() };
    });
    const answers = { offer: "50% na primeira compra" };

    await act(() => result.current.answerQuestions(answers));
    expect(mocks.plan).toHaveBeenCalledTimes(1);
    expect(mocks.setError).toHaveBeenLastCalledWith("Rascunho alterado");
    expect(result.current.isBusy).toBe(false);

    await act(() => result.current.answerQuestions(answers));
    expect(mocks.plan.mock.calls.map(([input]) => input.expectedUpdatedAt)).toEqual([NOW, currentRevision]);
    expect(mocks.plan).toHaveBeenLastCalledWith({ workItemId: WORK_ID, expectedUpdatedAt: currentRevision, answers });
    expect(await revision.current.resolveCanonicalWorkRevision(WORK_ID)).toBe(acceptedRevision);
    expect(mocks.setError).toHaveBeenLastCalledWith(null);
    expect(mocks.refetch).toHaveBeenCalledTimes(refreshFails ? 2 : 1);
  });

  it.each(["success", "conflict"] as const)("does not update revision or error after switching work during plan %s", async (outcome) => {
    const workIdRef = { current: WORK_ID as string | null };
    const draftEpochRef = { current: 0 };
    const { result } = renderComposer({ workIdRef, draftEpochRef });
    mocks.plan.mockImplementation(async () => {
      workIdRef.current = "another-work";
      draftEpochRef.current += 1;
      if (outcome === "conflict") throw Object.assign(new Error("Rascunho alterado"), { status: 409 });
      return { work: carouselDetail().work, draft: carouselDraft() };
    });

    await act(() => result.current.askForPlan());

    expect(mocks.setCanonicalWorkRevision).not.toHaveBeenCalled();
    expect(mocks.blockStaleRevision).not.toHaveBeenCalled();
    expect(mocks.refetch).not.toHaveBeenCalled();
    expect(mocks.setError).toHaveBeenLastCalledWith(null);
  });

  it("does not hydrate a conflict refresh after switching work", async () => {
    const workIdRef = { current: WORK_ID as string | null };
    const draftEpochRef = { current: 0 };
    mocks.plan.mockRejectedValue(Object.assign(new Error("Rascunho alterado"), { status: 409 }));
    mocks.refetch.mockImplementation(async () => {
      workIdRef.current = "another-work";
      draftEpochRef.current += 1;
      return { data: carouselDetail() };
    });
    const { result } = renderComposer({ workIdRef, draftEpochRef });

    await act(() => result.current.askForPlan());

    expect(mocks.blockStaleRevision).toHaveBeenCalledWith(WORK_ID);
    expect(mocks.setCanonicalWorkRevision).not.toHaveBeenCalled();
    expect(mocks.setError).toHaveBeenLastCalledWith(null);
  });
});

describe("useCarouselComposer draft editing", () => {
  beforeEach(() => {
    queryClient.setQueryData(creativeWorkKey(WORK_ID), carouselDetail());
    bindWorkToCache();
  });

  it("edits update only settings.carouselDraft with human authority and supersede pending AI changes", async () => {
    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({ draft: carouselDraft({ plan: carouselPlan(), changes: [editorialChange()] }) }),
    );
    const { result } = renderComposer();

    await act(() => result.current.editSlide("slide-2", "primaryText", "Editado por mim"));

    const draft = cachedDraft()!;
    expect(draft.plan!.slides[1]).toEqual(expect.objectContaining({
      slideId: "slide-2",
      primaryText: "Editado por mim",
      authority: "human_edit",
    }));
    expect(draft.changes[0]!.status).toBe("superseded");
    const cached = cacheDetail()!;
    expect(cached.work.request).toBe("Carrossel de lançamento");
    expect(cached.work.status).toBe("draft");
    expect(cached.outputs).toEqual([]);
    expect(mocks.autosave).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: WORK_ID,
      request: "Carrossel de lançamento",
      intent: "carousel",
      format: "4:5",
      settings: expect.objectContaining({ carouselDraft: draft }),
    }));
  });

  it("accept applies the AI value and reject keeps the slide untouched", async () => {
    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({
        draft: carouselDraft({
          plan: carouselPlan(),
          changes: [
            editorialChange(),
            editorialChange({ id: "change-2", slideId: "slide-3", after: "Outra sugestão" }),
          ],
        }),
      }),
    );
    const { result } = renderComposer();

    await act(() => result.current.acceptChange("change-1"));
    await act(() => result.current.rejectChange("change-2"));

    const draft = cachedDraft()!;
    expect(draft.plan!.slides[1]!.primaryText).toBe("Sugestão da IA");
    expect(draft.changes[0]!.status).toBe("accepted");
    expect(draft.changes[1]!.status).toBe("rejected");
    expect(draft.plan!.slides[2]!.primaryText).toBe("Texto 3");
  });

  it("add and remove keep the deck between five and eight slides with stable IDs", async () => {
    const { result } = renderComposer();

    await act(() => result.current.addSlide());

    let draft = cachedDraft()!;
    expect(draft.plan!.slides).toHaveLength(6);
    expect(draft.plan!.slides.map((slide) => slide.position)).toEqual([1, 2, 3, 4, 5, 6]);
    const addedSlideId = draft.plan!.slides[5]!.slideId;
    expect(draft.plan!.slides.slice(0, 5).map((slide) => slide.slideId)).toEqual([
      "slide-1", "slide-2", "slide-3", "slide-4", "slide-5",
    ]);

    await act(() => result.current.removeSlide("slide-3"));

    draft = cachedDraft()!;
    expect(draft.plan!.slides.map((slide) => slide.slideId)).toEqual([
      "slide-1", "slide-2", "slide-4", "slide-5", addedSlideId,
    ]);
    expect(draft.plan!.slides.map((slide) => slide.position)).toEqual([1, 2, 3, 4, 5]);
  });

  it("refuses to add beyond eight slides or remove below five", async () => {
    const eight = Array.from({ length: 8 }, (_, index) => planSlide(index + 1, "context"));
    eight[0] = planSlide(1, "hook");
    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({ draft: carouselDraft({ plan: carouselPlan({ slides: eight }) }) }),
    );
    const { result } = renderComposer();

    await act(() => result.current.addSlide());
    expect(cachedDraft()!.plan!.slides).toHaveLength(8);

    queryClient.setQueryData(creativeWorkKey(WORK_ID), carouselDetail());
    await act(() => result.current.removeSlide("slide-1"));
    expect(cachedDraft()!.plan!.slides).toHaveLength(5);
    expect(mocks.autosave).not.toHaveBeenCalled();
  });

  it("reorders slides and renumbers positions without changing slide IDs", async () => {
    const { result } = renderComposer();

    await act(() => result.current.moveSlide("slide-5", 2));

    const draft = cachedDraft()!;
    expect(draft.plan!.slides.map((slide) => slide.slideId)).toEqual([
      "slide-1", "slide-5", "slide-2", "slide-3", "slide-4",
    ]);
    expect(draft.plan!.slides.map((slide) => slide.position)).toEqual([1, 2, 3, 4, 5]);
    expect(draft.plan!.slides[1]!.layoutFamily).toBe(carouselLayoutFamilyForRole("cta"));
  });
});

describe("useCarouselComposer prepare and generate", () => {
  beforeEach(() => {
    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({ editorial: editorialState({ selectedHookId: "hook-1", approvedScriptRevision: "script-1" }) }),
    );
    bindWorkToCache();
  });

  it("prepareCarousel flushes through the generic preparePlan and never calls generation", async () => {
    const { result } = renderComposer();

    await act(() => result.current.prepareCarousel());

    expect(mocks.preparePlan).toHaveBeenCalledTimes(1);
    expect(mocks.confirmGeneration).not.toHaveBeenCalled();
  });

  it("generateCarousel calls exactly one explicit confirmGeneration with the prepared revision", async () => {
    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({ preparedPlan: carouselPreparedPlan() }),
    );
    const { result } = renderComposer(null, carouselPreparedPlan());

    await act(() => result.current.generateCarousel());

    expect(mocks.preparePlan).not.toHaveBeenCalled();
    expect(mocks.confirmGeneration).toHaveBeenCalledTimes(1);
    expect(mocks.confirmGeneration).toHaveBeenCalledWith("prep-1");
  });

  it("never generates from Enter or textarea keydown events", async () => {
    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({ preparedPlan: carouselPreparedPlan() }),
    );
    const { result } = renderComposer(null, carouselPreparedPlan());

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await Promise.resolve();
    });

    expect(mocks.confirmGeneration).not.toHaveBeenCalled();
    expect(result.current.canGenerate).toBe(true);
  });

  it("disables a second generation click while the uncertain response is not reconciled", async () => {
    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({ preparedPlan: carouselPreparedPlan() }),
    );
    let release!: () => void;
    const inFlight = new Promise<void>((resolve) => { release = resolve; });
    mocks.confirmGeneration.mockReturnValue(inFlight);
    const { result } = renderComposer(null, carouselPreparedPlan());

    let first: Promise<void> | undefined;
    act(() => { first = result.current.generateCarousel(); });
    await act(async () => { await Promise.resolve(); });

    await act(() => result.current.generateCarousel());
    expect(mocks.confirmGeneration).toHaveBeenCalledTimes(1);
    expect(result.current.canGenerate).toBe(false);

    await act(async () => { release(); await first; });
    expect(result.current.canGenerate).toBe(true);

    await act(() => result.current.generateCarousel());
    expect(mocks.confirmGeneration).toHaveBeenCalledTimes(2);
  });
});

describe("useCarouselComposer slide revisions", () => {
  const reviewSlides = [
    publicSlide(planSlide(1, "hook")),
    publicSlide(planSlide(2, "context")),
    publicSlide(planSlide(3, "problem")),
    publicSlide(planSlide(4, "argument")),
    publicSlide(planSlide(5, "cta"), { status: "failed", hasOutput: false, errorCode: "generation_failed" }),
  ];

  beforeEach(() => {
    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({ preparedPlan: carouselPreparedPlan(), slides: reviewSlides }),
    );
    bindWorkToCache();
  });

  it("routes copy revisions as kind copy and visual revisions as kind visual", async () => {
    const { result } = renderComposer(null, carouselPreparedPlan());

    await act(() => result.current.reviseSlide("slide-1", {
      kind: "copy", primaryText: "Novo gancho", secondaryText: null,
    }));
    await act(() => result.current.reviseSlide("slide-2", {
      kind: "visual", instruction: "Mais contraste no fundo",
    }));

    expect(mocks.reviseSlide).toHaveBeenNthCalledWith(1, expect.objectContaining({
      workItemId: WORK_ID,
      slideId: "slide-1",
      kind: "copy",
      expectedVersion: 1,
      revisionKey: expect.any(String),
      primaryText: "Novo gancho",
      secondaryText: null,
    }));
    expect(mocks.reviseSlide).toHaveBeenNthCalledWith(2, expect.objectContaining({
      workItemId: WORK_ID,
      slideId: "slide-2",
      kind: "visual",
      expectedVersion: 1,
      revisionKey: expect.any(String),
      instruction: "Mais contraste no fundo",
    }));
  });

  it("retries only the selected failed current slide and posts kind retry once", async () => {
    const { result } = renderComposer(null, carouselPreparedPlan());

    await act(() => result.current.retrySlide());
    expect(mocks.reviseSlide).not.toHaveBeenCalled();

    act(() => result.current.selectSlide("slide-5"));
    expect(result.current.selectedSlideId).toBe("slide-5");

    let release!: () => void;
    mocks.reviseSlide.mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));
    let first: Promise<void> | undefined;
    act(() => { first = result.current.retrySlide(); });
    await act(async () => { await Promise.resolve(); });
    await act(() => result.current.retrySlide());
    expect(mocks.reviseSlide).toHaveBeenCalledTimes(1);
    expect(mocks.reviseSlide).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: WORK_ID,
      slideId: "slide-5",
      kind: "retry",
      expectedVersion: 1,
      revisionKey: expect.any(String),
    }));

    await act(async () => { release(); await first; });
  });
});

describe("useCarouselComposer approval and export", () => {
  const reviewSlides = [
    publicSlide(planSlide(1, "hook")),
    publicSlide(planSlide(2, "context")),
    publicSlide(planSlide(3, "problem")),
    publicSlide(planSlide(4, "argument")),
    publicSlide(planSlide(5, "cta")),
  ];

  beforeEach(() => {
    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({ preparedPlan: carouselPreparedPlan(), slides: reviewSlides }),
    );
    bindWorkToCache();
  });

  it("records the first persisted review phase once through the injected recorder", async () => {
    const { result, rerender } = renderComposer(null, carouselPreparedPlan());

    await waitFor(() =>
      expect(mocks.recordCanonicalEvent).toHaveBeenCalledWith("creative_work_reviewed", {
        creativeWorkId: WORK_ID,
        protocol: "carousel",
        outputCount: 5,
      }),
    );

    rerender();
    await act(async () => { await Promise.resolve(); });
    expect(mocks.recordCanonicalEvent).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe("review");
  });

  it("records one creative_work_approved on success and enables export only after approval", async () => {
    const { result } = renderComposer(null, carouselPreparedPlan());
    expect(result.current.canApprove).toBe(true);

    await act(() => result.current.exportDeck());
    expect(mocks.exportDeck).not.toHaveBeenCalled();

    await act(() => result.current.approveDeck());

    expect(mocks.approve).toHaveBeenCalledTimes(1);
    expect(mocks.approve).toHaveBeenCalledWith({ workItemId: WORK_ID, revision: "deck-r1" });
    const approvedCalls = () =>
      mocks.recordCanonicalEvent.mock.calls.filter(([event]) => event === "creative_work_approved");
    expect(approvedCalls()).toEqual([[
      "creative_work_approved",
      { creativeWorkId: WORK_ID, protocol: "carousel", outputCount: 5 },
    ]]);
    expect(cacheDetail()!.work.carouselApprovedRevision).toBe("deck-r1");
    expect(result.current.canApprove).toBe(false);

    await act(() => result.current.approveDeck());
    expect(mocks.approve).toHaveBeenCalledTimes(1);
    expect(approvedCalls()).toHaveLength(1);

    await act(() => result.current.exportDeck());
    expect(mocks.exportDeck).toHaveBeenCalledWith({ workItemId: WORK_ID });
  });

  it("downloadSlide opens the per-slide download endpoint only for completed slides", async () => {
    const open = vi.fn();
    const originalOpen = window.open;
    window.open = open as typeof window.open;
    try {
      queryClient.setQueryData(
        creativeWorkKey(WORK_ID),
        carouselDetail({
          preparedPlan: carouselPreparedPlan(),
          slides: [
            ...reviewSlides.slice(0, 4),
            publicSlide(planSlide(5, "cta"), { status: "failed", hasOutput: false, errorCode: "generation_failed" }),
          ],
        }),
      );
      const { result } = renderComposer(null, carouselPreparedPlan());

      await act(() => result.current.downloadSlide("slide-5"));
      expect(open).not.toHaveBeenCalled();

      await act(() => result.current.downloadSlide("slide-1"));
      expect(open).toHaveBeenCalledWith(
        `/api/creative-work/${WORK_ID}/carousel/slides/slide-1/download`,
        "_blank",
        "noopener,noreferrer",
      );

      await act(() => result.current.downloadSlide());
      expect(open).toHaveBeenLastCalledWith(
        `/api/creative-work/${WORK_ID}/carousel/slides/slide-1/download`,
        "_blank",
        "noopener,noreferrer",
      );
    } finally {
      window.open = originalOpen;
    }
  });
});

describe("useCarouselComposer editorial commands", () => {
  it("selects a hook without confirming image generation", async () => {
    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({ draft: carouselDraft({ plan: null }), editorial: editorialState() }),
    );
    bindWorkToCache();
    mocks.plan.mockResolvedValue({
      work: {},
      draft: carouselDraft(),
      editorial: editorialState({ selectedHookId: "hook-1" }),
    });
    const { result } = renderComposer();

    await act(() => result.current.selectHook("hook-1"));

    expect(mocks.plan).toHaveBeenCalledWith(expect.objectContaining({
      command: { kind: "select_hook", hookId: "hook-1" },
    }));
    expect(mocks.confirmGeneration).not.toHaveBeenCalled();
    expect(mocks.preparePlan).not.toHaveBeenCalled();
  });

  it("approves the script then leaves cover generation to the existing confirm", async () => {
    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({ editorial: editorialState({ selectedHookId: "hook-1" }) }),
    );
    bindWorkToCache();
    mocks.plan.mockResolvedValue({
      work: {},
      draft: carouselDraft({ plan: carouselPlan() }),
      editorial: editorialState({ selectedHookId: "hook-1", approvedScriptRevision: "script-1" }),
    });
    const { result } = renderComposer();

    await act(() => result.current.approveScript());

    expect(mocks.plan).toHaveBeenCalledWith(expect.objectContaining({
      command: { kind: "approve_script", scriptRevision: "script-1" },
    }));
    expect(mocks.confirmGeneration).not.toHaveBeenCalled();
  });

  it("approves the cover then prepares interiors and confirms only while the revision stays current", async () => {
    const approvedEditorial = editorialState({
      selectedHookId: "hook-1",
      approvedScriptRevision: "script-1",
      approvedCover: { slideId: "slide-1", scriptRevision: "script-1", preparedRevision: "prep-1" },
    });
    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({
        editorial: editorialState({ selectedHookId: "hook-1", approvedScriptRevision: "script-1" }),
        preparedPlan: carouselPreparedPlan(),
        slides: [
          publicSlide(planSlide(1, "hook"), { status: "completed" }),
          publicSlide(planSlide(2, "context"), { status: "draft", hasOutput: false }),
          publicSlide(planSlide(3, "problem"), { status: "draft", hasOutput: false }),
          publicSlide(planSlide(4, "argument"), { status: "draft", hasOutput: false }),
          publicSlide(planSlide(5, "cta"), { status: "draft", hasOutput: false }),
        ],
      }),
    );
    bindWorkToCache();
    mocks.plan.mockResolvedValue({
      work: { updatedAt: NOW },
      draft: carouselDraft({ plan: carouselPlan() }),
      editorial: approvedEditorial,
    });
    mocks.preparePlan.mockResolvedValue(carouselPreparedPlan());
    const { result } = renderComposer(null, carouselPreparedPlan());

    await act(() => result.current.approveCoverAndGenerate());

    expect(mocks.plan).toHaveBeenCalledWith(expect.objectContaining({
      command: { kind: "approve_cover", slideId: "slide-1", preparedRevision: "prep-1" },
    }));
    expect(mocks.preparePlan).toHaveBeenCalledTimes(1);
    expect(mocks.confirmGeneration).toHaveBeenCalledTimes(1);
    expect(mocks.confirmGeneration).toHaveBeenCalledWith("prep-1");
  });

  it("stops the lote when prepare returns a different revision", async () => {
    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({
        editorial: editorialState({ selectedHookId: "hook-1", approvedScriptRevision: "script-1" }),
        preparedPlan: carouselPreparedPlan(),
        slides: [
          publicSlide(planSlide(1, "hook"), { status: "completed" }),
          publicSlide(planSlide(2, "context"), { status: "draft", hasOutput: false }),
          publicSlide(planSlide(3, "problem"), { status: "draft", hasOutput: false }),
          publicSlide(planSlide(4, "argument"), { status: "draft", hasOutput: false }),
          publicSlide(planSlide(5, "cta"), { status: "draft", hasOutput: false }),
        ],
      }),
    );
    bindWorkToCache();
    mocks.plan.mockResolvedValue({
      work: { updatedAt: NOW },
      draft: carouselDraft({ plan: carouselPlan() }),
      editorial: editorialState({
        selectedHookId: "hook-1",
        approvedScriptRevision: "script-1",
        approvedCover: { slideId: "slide-1", scriptRevision: "script-1", preparedRevision: "prep-1" },
      }),
    });
    mocks.preparePlan.mockResolvedValue(carouselPreparedPlan("prep-stale"));
    const { result } = renderComposer(null, carouselPreparedPlan());

    await act(() => result.current.approveCoverAndGenerate());

    expect(mocks.preparePlan).toHaveBeenCalledTimes(1);
    expect(mocks.confirmGeneration).not.toHaveBeenCalled();
  });

  it("keeps a recoverable research failure and does not confirm generation", async () => {
    queryClient.setQueryData(
      creativeWorkKey(WORK_ID),
      carouselDetail({ draft: carouselDraft({ plan: null }), editorial: editorialState() }),
    );
    bindWorkToCache();
    mocks.plan.mockRejectedValue(
      new CreativeWorkRequestError(
        "A evidência não basta para sustentar a tese. Restrinja o argumento ou envie fontes.",
        "research_insufficient",
        422,
        { gaps: ["Falta a data de abertura"] },
      ),
    );
    const { result } = renderComposer();

    await act(() => result.current.regenerateHooks());

    expect(result.current.editorialError).toMatch(/evidência não basta/);
    expect(mocks.confirmGeneration).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("hooks");
  });
});
