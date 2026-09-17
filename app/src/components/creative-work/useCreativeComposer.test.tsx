import { act, render, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  active: vi.fn(),
  work: vi.fn(),
  create: vi.fn(),
  autosave: vi.fn(),
  prepare: vi.fn(),
  editBriefing: vi.fn(),
  source: vi.fn(),
  sourcePending: vi.fn(() => false),
  generate: vi.fn(),
  suggest: vi.fn(),
  upload: vi.fn(),
  retryOutput: vi.fn(),
  layerizeOutput: vi.fn(),
  reviseOutput: vi.fn(),
  selectOutput: vi.fn(),
  linkCampaign: vi.fn(),
  resolveBrandConflict: vi.fn(),
  resolveBrandConflictPending: vi.fn(() => false),
  refetch: vi.fn(),
  apiFetch: vi.fn(),
  brandFonts: vi.fn(() => ({ data: [], isLoading: false })),
  brandKnowledge: vi.fn(() => ({ data: { activeVersion: null }, isLoading: false })),
  recordBetaEvent: vi.fn(),
  carouselController: vi.fn(),
  instantiateRecipe: vi.fn(),
  instantiateOffer: vi.fn(),
  saveCommercialOffer: vi.fn(),
}));

// The carousel wizard controller has its own dedicated test file; the generic
// controller tests only observe that it is wired through as-is.
vi.mock("./useCarouselComposer", () => ({
  useCarouselComposer: (...args: unknown[]) => mocks.carouselController(...args),
}));

vi.mock("@/lib/hooks/use-active-client-profile", () => ({
  useActiveClientProfile: () => mocks.active(),
}));
vi.mock("@/lib/hooks/use-creative-work", async (importOriginal) => ({
  // Real pure helpers (categorize/verdict/extractBrandConflict…) — only the
  // data hooks are mocked, so the extractor can never drift from production.
  ...(await importOriginal<typeof import("@/lib/hooks/use-creative-work")>()),
  useCreativeWork: (...args: unknown[]) => mocks.work(...args),
  useCreateCreativeWorkDraft: () => ({ mutateAsync: mocks.create, isPending: false }),
  useAutosaveCreativeWork: () => ({ mutateAsync: mocks.autosave, isPending: false }),
  usePrepareCreativeWork: () => ({ mutateAsync: mocks.prepare, isPending: false }),
  useEditCreativeWorkBriefing: () => ({ mutateAsync: mocks.editBriefing, isPending: false }),
  useCreativeWorkSourceActions: () => ({ mutateAsync: mocks.source, isPending: mocks.sourcePending() }),
  useTriggerTriplet: () => ({ mutateAsync: mocks.generate, isPending: false }),
  useSuggestCreativeDirections: () => ({ mutateAsync: mocks.suggest, isPending: false }),
  useRetryOutput: () => ({ mutateAsync: mocks.retryOutput, isPending: false, variables: undefined }),
  useLayerizeOutput: () => ({ mutateAsync: mocks.layerizeOutput, isPending: false, variables: undefined }),
  useReviseOutput: () => ({ mutateAsync: mocks.reviseOutput, isPending: false, variables: undefined }),
  useSelectOutput: () => ({ mutateAsync: mocks.selectOutput, isPending: false, variables: undefined }),
  useLinkCreativeWorkCampaign: () => ({ mutateAsync: mocks.linkCampaign, isPending: false }),
  useResolveBrandConflict: () => ({ mutateAsync: mocks.resolveBrandConflict, isPending: mocks.resolveBrandConflictPending() }),
  useDownloadOutputUrl: () => (workItemId: string, outputId: string) => `/api/creative-work/${workItemId}/outputs/${outputId}/download`,
  useCreativeWorkCampaigns: () => ({ data: [] }),
}));
vi.mock("@/lib/hooks/use-visual-recipes", () => ({
  useVisualRecipes: () => ({ data: [], isLoading: false }),
  useInstantiateVisualRecipe: () => ({ mutateAsync: mocks.instantiateRecipe, isPending: false }),
}));
vi.mock("@/lib/hooks/use-commercial-offers", () => ({
  useCommercialOffers: () => ({ data: [], isLoading: false }),
  useInstantiateCommercialOffer: () => ({ mutateAsync: mocks.instantiateOffer, isPending: false }),
  useSaveCommercialOffer: () => ({ mutateAsync: mocks.saveCommercialOffer, isPending: false }),
}));
vi.mock("@/lib/hooks/use-brand-training", () => ({
  useBrandFonts: (...args: unknown[]) => mocks.brandFonts(...args),
  useBrandKnowledge: (...args: unknown[]) => mocks.brandKnowledge(...args),
}));
vi.mock("@/lib/hooks/use-record-beta-event", () => ({
  useRecordBetaEvent: () => ({ recordEvent: mocks.recordBetaEvent }),
}));
vi.mock("@/lib/assistant/chat-attachments", () => ({
  collectImageFiles: (files: File[] | FileList | null) => Array.from(files ?? []),
  uploadChatAttachment: (...args: unknown[]) => mocks.upload(...args),
}));
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => mocks.apiFetch(...args),
  isApiRequestUncertain: (error: unknown) => error instanceof Error && error.name === "TimeoutError",
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { name?: string }) => ({
    "composer.campaignLinked": "Campaign linked",
    "composer.campaignRemoved": "Campaign removed",
    "composer.campaignLinkFailed": "Could not update the campaign association.",
    "composer.progressiveBufferedFile": `${values?.name} is ready to use after you choose an objective.`,
    "composer.progressiveMultipleFiles": `${values?.name} was kept; add the other images after choosing an objective.`,
    "composer.progressiveUploadFailed": "Could not add the image.",
    restylePairError: "Adicione a arte original e a referência de estilo.",
  }[key] ?? key),
}));

import { useCreativeComposer } from "./useCreativeComposer";
import type { CarouselComposerInput } from "./useCarouselComposer";
import { createDefaultCreativeDirectionPool } from "@/server/creative-work/contracts";

const profileA = { id: "profile-a", name: "Marca A" };
const profileB = { id: "profile-b", name: "Marca B" };
const WORK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TARGET_WORK_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TEMPLATE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function active(overrides = {}) {
  return {
    profiles: [profileA], activeProfile: profileA, activeClientProfileId: profileA.id,
    requiresSelection: false, isLoading: false, selectProfile: vi.fn(), ...overrides,
  };
}

function restyleSources() {
  return [
    { id: "src-1", usage: "content" as const, status: "ready" as const },
    { id: "src-2", usage: "style" as const, status: "ready" as const },
  ];
}

function preparedPlan(workId = "work-1", protocol = "variations") {
  return {
    version: 1 as const,
    workId,
    preparedRevision: "2026-08-30T12:00:00.000Z",
    protocol,
    materials: [],
    preserve: [],
    explore: [],
    outputs: [],
    outputCount: 3,
    formats: ["4:5"],
  };
}

function workDetail(overrides = {}) {
  const now = new Date().toISOString();
  const work = {
      id: "work-1", clientProfileId: profileA.id, request: "Pedido salvo", toolKind: "variations",
      status: "draft", format: "4:5", settings: { targetFormats: [] }, createdAt: now, updatedAt: now, ...overrides,
  };
  return { work, outputs: [], sources: [], preparedPlan: preparedPlan(work.id, work.toolKind) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function carouselControllerStub() {
  return {
    draft: null,
    editorial: null,
    slides: [],
    quality: null,
    selectedSlideId: null,
    selectedSlide: null,
    phase: "entry",
    findings: [],
    editorialError: null,
    coverQuote: { unitCount: 1, credits: 50 },
    interiorsQuote: { unitCount: 4, credits: 200 },
    canPrepare: false,
    canGenerate: false,
    canApprove: false,
    canApproveScript: false,
    canApproveCover: false,
    isBusy: false,
    askForPlan: vi.fn(() => Promise.resolve()),
    answerQuestions: vi.fn(() => Promise.resolve()),
    selectHook: vi.fn(() => Promise.resolve()),
    regenerateHooks: vi.fn(() => Promise.resolve()),
    approveScript: vi.fn(() => Promise.resolve()),
    approveCoverAndGenerate: vi.fn(() => Promise.resolve()),
    acceptChange: vi.fn(() => Promise.resolve()),
    rejectChange: vi.fn(() => Promise.resolve()),
    editSlide: vi.fn(() => Promise.resolve()),
    addSlide: vi.fn(() => Promise.resolve()),
    removeSlide: vi.fn(() => Promise.resolve()),
    moveSlide: vi.fn(() => Promise.resolve()),
    prepareCarousel: vi.fn(() => Promise.resolve()),
    generateCarousel: vi.fn(() => Promise.resolve()),
    reviseSlide: vi.fn(() => Promise.resolve()),
    retrySlide: vi.fn(() => Promise.resolve()),
    approveDeck: vi.fn(() => Promise.resolve()),
    downloadSlide: vi.fn(),
    exportDeck: vi.fn(() => Promise.resolve()),
    selectSlide: vi.fn(),
  };
}

describe("useCreativeComposer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    const stored = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
        removeItem: (key: string) => stored.delete(key),
        clear: () => stored.clear(),
      },
    });
    window.history.replaceState({}, "", "/");
    if (typeof window.localStorage?.clear === "function") window.localStorage.clear();
    window.sessionStorage.clear();
    mocks.active.mockReturnValue(active());
    mocks.work.mockReturnValue({ data: undefined, isLoading: false });
    mocks.carouselController.mockReturnValue(carouselControllerStub());
    mocks.create.mockImplementation((input: { request: string; intent: string; format: string; settings: { targetFormats: string[] } }) => Promise.resolve({
      work: {
        ...workDetail().work,
        id: WORK_ID,
        request: input.request,
        toolKind: input.intent,
        format: input.format,
        settings: input.settings,
      },
      quote: { unitCount: 3, credits: 150 },
    }));
    mocks.autosave.mockResolvedValue({ work: workDetail().work });
    mocks.prepare.mockResolvedValue({ work: workDetail().work, quote: { unitCount: 3, credits: 150 }, preparedPlan: preparedPlan() });
    mocks.generate.mockResolvedValue({ work: { status: "generating" }, outputs: [] });
    mocks.suggest.mockResolvedValue({ directions: [] });
    mocks.upload.mockResolvedValue({ assetId: "asset-1", name: "arte.png" });
    mocks.source.mockResolvedValue({ source: { id: "source-1" } });
    mocks.sourcePending.mockReturnValue(false);
    mocks.selectOutput.mockResolvedValue({});
    mocks.instantiateRecipe.mockResolvedValue({ work: { id: TARGET_WORK_ID } });
    mocks.instantiateOffer.mockResolvedValue({ work: { id: TARGET_WORK_ID } });
    mocks.saveCommercialOffer.mockResolvedValue({ offer: { id: "offer-1", version: 1 } });
    // clearAllMocks keeps mockReturnValue implementations — reset explicitly.
    mocks.resolveBrandConflictPending.mockReturnValue(false);
    mocks.brandFonts.mockReturnValue({ data: [], isLoading: false });
    mocks.brandKnowledge.mockReturnValue({ data: { activeVersion: null }, isLoading: false });
  });

  it("keeps text-only progressive entry local until an objective is chosen", async () => {
    const { result } = renderHook(() => useCreativeComposer({ workflowVariant: "progressive" }));

    act(() => result.current.setRequest("Nova campanha de primavera"));
    await act(() => vi.advanceTimersByTimeAsync(600));

    expect(result.current.objective).toBeNull();
    expect(result.current.hasEntry).toBe(true);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.autosave).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(window.location.search).not.toContain("workId");
  });

  it("buffers only the first progressive file until the objective is chosen", async () => {
    const first = new File(["first"], "primeira.png", { type: "image/png" });
    const second = new File(["second"], "segunda.png", { type: "image/png" });
    const { result } = renderHook(() => useCreativeComposer({ workflowVariant: "progressive" }));

    await act(async () => { await result.current.addFiles([first, second]); });

    expect(result.current.bufferedFile).toBe(first);
    expect(result.current.announcement).toBe("primeira.png was kept; add the other images after choosing an objective.");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    act(() => result.current.clearBufferedFile());
    expect(result.current.bufferedFile).toBeNull();
  });

  it("uses localized campaign announcements and fallback errors", async () => {
    mocks.work.mockReturnValue({ data: workDetail({ id: WORK_ID }), isLoading: false, refetch: mocks.refetch });
    mocks.refetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: WORK_ID }));

    await act(async () => { await result.current.linkCampaign(TARGET_WORK_ID); });
    expect(result.current.announcement).toBe("Campaign linked");

    mocks.linkCampaign.mockRejectedValueOnce({});
    await act(async () => { await result.current.linkCampaign(null); });
    expect(result.current.error).toBe("Could not update the campaign association.");
  });

  it("materializes the selected progressive objective with the buffered file exactly once", async () => {
    const file = new File(["image"], "arte.png", { type: "image/png" });
    const { result } = renderHook(() => useCreativeComposer({ workflowVariant: "progressive" }));
    act(() => result.current.setRequest("Lançamento"));
    await act(async () => { await result.current.addFiles([file]); });

    await act(async () => { await result.current.selectIntent("variations"); });

    expect(result.current.objective).toBe("variations");
    expect(mocks.upload).toHaveBeenCalledWith(file);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      request: "Lançamento",
      intent: "variations",
      assetId: "asset-1",
    }));
    expect(result.current.bufferedFile).toBeNull();
    expect(window.location.search).toContain(`workId=${WORK_ID}`);
  });

  it("keeps a buffered progressive file after upload failure", async () => {
    const file = new File(["image"], "arte.png", { type: "image/png" });
    mocks.upload.mockRejectedValueOnce(new Error("upload indisponível"));
    const { result } = renderHook(() => useCreativeComposer({ workflowVariant: "progressive" }));
    await act(async () => { await result.current.addFiles([file]); });

    await act(async () => { await result.current.selectIntent("single"); });

    expect(result.current.bufferedFile).toBe(file);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(result.current.error).toBe("upload indisponível");
  });

  it("holds a template link as progressive entry context until an explicit objective", async () => {
    const { result } = renderHook(() => useCreativeComposer({
      workflowVariant: "progressive",
      initialTemplateId: TEMPLATE_ID,
    }));
    await act(async () => Promise.resolve());

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.source).not.toHaveBeenCalled();
    await act(async () => { await result.current.selectIntent("restyle"); });
    await act(async () => Promise.resolve());

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ templateId: TEMPLATE_ID }));
  });

  it("exposes the frozen Brand Cortex snapshot on Peça única", async () => {
    mocks.work.mockReturnValue({
      data: workDetail({
        toolKind: "single",
        status: "ready",
        identitySnapshot: {
          assets: [{
            referenceId: "ref-1",
            label: "Logo oficial",
            usageMode: "exact",
          }],
          referenceSelection: { reasons: { "ref-1": ["logo primário"] } },
          brandKnowledge: {
            mode: "published",
            versionNumber: 3,
          },
        },
      }),
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1", initialIntent: "single" }));

    expect(result.current.brandIdentity).toEqual({
      source: "snapshot",
      mode: "published",
      versionNumber: 3,
      assets: [{
        referenceId: "ref-1",
        label: "Logo oficial",
        usageMode: "exact",
        reasons: ["logo primário"],
      }],
    });
    expect(mocks.brandKnowledge).toHaveBeenCalledWith(null);
  });

  it("projects the canonical revision credit cost for the review gate", async () => {
    mocks.work.mockReturnValue({
      data: { ...workDetail({ toolKind: "single", status: "partial" }), revisionCreditCost: 10 },
      isLoading: false,
      isError: false,
    });
    const withCost = renderHook(() => useCreativeComposer({ initialWorkId: "work-1", initialIntent: "single" }));
    expect(withCost.result.current.revisionCreditCost).toBe(10);
    withCost.unmount();

    mocks.work.mockReturnValue({
      data: workDetail({ toolKind: "single", status: "partial" }),
      isLoading: false,
      isError: false,
    });
    const withoutCost = renderHook(() => useCreativeComposer({ initialWorkId: "work-1", initialIntent: "single" }));
    expect(withoutCost.result.current.revisionCreditCost).toBeNull();
  });

  it("keeps an approval failure on the affected output until retry", async () => {
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false, isError: false });
    mocks.selectOutput.mockRejectedValueOnce(new Error("Falha na aprovação"));
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(() => result.current.approveOutput("output-1"));

    expect(result.current.approvalErrorOutputId).toBe("output-1");
    expect(result.current.error).toBe("Falha na aprovação");

    await act(() => result.current.approveOutput("output-1"));

    expect(result.current.approvalErrorOutputId).toBeNull();
  });

  it("instantiates a visual recipe as a new single piece", async () => {
    const { result } = renderHook(() => useCreativeComposer({ initialIntent: "variations" }));

    await act(() => result.current.instantiateRecipe("recipe-1"));

    expect(mocks.instantiateRecipe).toHaveBeenCalledWith(expect.objectContaining({
      clientProfileId: profileA.id,
      recipeId: "recipe-1",
    }));
    expect(result.current.workId).toBe(TARGET_WORK_ID);
    expect(result.current.intent).toBe("single");
  });

  it("instantiates a commercial offer as a new single piece", async () => {
    const { result } = renderHook(() => useCreativeComposer({ initialIntent: "variations" }));

    await act(() => result.current.instantiateOffer("offer-1"));

    expect(mocks.instantiateOffer).toHaveBeenCalledWith(expect.objectContaining({
      clientProfileId: profileA.id,
      offerId: "offer-1",
    }));
    expect(result.current.workId).toBe(TARGET_WORK_ID);
    expect(result.current.intent).toBe("single");
  });

  it("starts a new composer from the whitelisted intent and canonical quote", () => {
    const { result } = renderHook(() =>
      useCreativeComposer({ initialIntent: "format_adaptation" })
    );

    expect(result.current.intent).toBe("format_adaptation");
    expect(result.current.targetFormats).toEqual(["1:1", "9:16"]);
    expect(result.current.quote).toEqual({ unitCount: 2, credits: 100 });
  });

  it("starts a carousel composer with a zeroed deck quote and no direction pool", () => {
    const { result } = renderHook(() => useCreativeComposer({ initialIntent: "carousel" }));

    expect(result.current.intent).toBe("carousel");
    expect(result.current.objective).toBe("carousel");
    expect(result.current.directionPool).toBeNull();
    expect(result.current.targetFormats).toEqual([]);
    // The carousel quote always comes from its own deck size, never from the
    // legacy output quoter (which throws for carousel).
    expect(result.current.quote).toEqual({ unitCount: 0, credits: 0 });
  });

  it("materializes the carousel objective with the buffered file as one style reference", async () => {
    const { result } = renderHook(() => useCreativeComposer({ workflowVariant: "progressive" }));
    act(() => result.current.setRequest("Carrossel de lançamento"));
    const file = new File(["image"], "referencia.png", { type: "image/png" });

    await act(async () => { await result.current.addFiles([file]); });
    expect(result.current.bufferedFile).toBe(file);

    await act(async () => { await result.current.selectIntent("carousel"); });

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      intent: "carousel", usage: "style",
    }));
    expect(result.current.intent).toBe("carousel");
  });

  it("limits carousel uploads to one non-failed style reference", async () => {
    const now = new Date().toISOString();
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ toolKind: "carousel", request: "" }),
        sources: [{
          id: "source-1", workItemId: "work-1", assetId: "asset-1", templateId: null,
          name: "referencia.png", previewUrl: null, origin: "upload", usage: "style",
          usageConfirmed: true, status: "ready", contentAnalysis: null, styleAnalysis: null,
          pieceReference: null, failureCode: null, createdAt: now, updatedAt: now,
        }],
      },
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() =>
      useCreativeComposer({ initialWorkId: "work-1", initialIntent: "carousel" })
    );
    await act(async () => Promise.resolve());

    const first = new File(["a"], "primeira.png", { type: "image/png" });
    const second = new File(["b"], "segunda.png", { type: "image/png" });
    await act(async () => { await result.current.addFiles([first, second]); });

    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.source).not.toHaveBeenCalled();
  });

  it("attaches a carousel upload with the forced style usage", async () => {
    mocks.work.mockReturnValue({
      data: workDetail({ toolKind: "carousel", request: "" }),
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() =>
      useCreativeComposer({ initialWorkId: "work-1", initialIntent: "carousel" })
    );
    await act(async () => Promise.resolve());

    const first = new File(["a"], "primeira.png", { type: "image/png" });
    const second = new File(["b"], "segunda.png", { type: "image/png" });
    await act(async () => { await result.current.addFiles([first, second]); });

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.source).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-1", action: "attachSource", usage: "style",
    }));
  });

  it("offers only human-approved brand font files", () => {
    mocks.brandFonts.mockReturnValue({
      data: [
        { assetKey: "pending.ttf", family: "Pending", reviewStatus: "pending_approval" },
        { assetKey: "approved.ttf", family: "Approved", reviewStatus: "approved" },
        { assetKey: "legacy.ttf", family: "Legacy" },
        { assetKey: "archived.ttf", family: "Archived", reviewStatus: "archived" },
      ],
      isLoading: false,
    });

    const { result } = renderHook(() => useCreativeComposer({ initialIntent: "single" }));

    expect(result.current.fontOptions.map((font) => font.assetKey)).toEqual([
      "approved.ttf",
      "legacy.ttf",
    ]);
  });

  it("selects between one and five directions and recalculates the quote", async () => {
    const base = createDefaultCreativeDirectionPool();
    const pool = {
      ...base,
      directions: [
        ...base.directions,
        { ...base.directions[0], id: "00000000-0000-4000-8000-000000000004", label: "Direção 4", order: 3 },
        { ...base.directions[0], id: "00000000-0000-4000-8000-000000000005", label: "Direção 5", order: 4 },
      ],
      selectedIds: base.directions.map((direction) => direction.id),
    };
    mocks.work.mockReturnValue({
      data: workDetail({ settings: { targetFormats: [], directionPool: pool } }),
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    await act(async () => Promise.resolve());

    act(() => result.current.toggleDirection(pool.selectedIds[0]));
    expect(result.current.directionPool?.selectedIds).toHaveLength(2);
    expect(result.current.quote).toEqual({ unitCount: 2, credits: 100 });

    act(() => {
      result.current.toggleDirection(pool.directions[3].id);
      result.current.toggleDirection(pool.directions[4].id);
    });
    expect(result.current.directionPool?.selectedIds).toHaveLength(4);
    expect(result.current.quote).toEqual({ unitCount: 4, credits: 200 });

    act(() => result.current.toggleDirection(pool.selectedIds[1]));
    expect(result.current.directionPool?.selectedIds).toHaveLength(3);
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(mocks.autosave).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({
        directionPool: expect.objectContaining({ selectedIds: expect.any(Array) }),
      }),
    }));
  });

  it("applies five contextual suggestions automatically when the user has not touched directions", async () => {
    vi.useRealTimers();
    const suggestions = Array.from({ length: 5 }, (_, index) => ({
      id: `00000000-0000-4000-8000-00000000000${index + 1}`,
      label: `Sugestão ${index + 1}`,
      instruction: `Instrução ${index + 1}`,
      order: index,
      safetyBand: "safe" as const,
      provenance: "ai-suggestion" as const,
    }));
    mocks.work.mockReturnValue({
      data: {
        ...workDetail(),
        sources: [{ id: "source-1", status: "ready" }],
      },
      isLoading: false,
      isError: false,
    });
    mocks.suggest.mockResolvedValue({ directions: suggestions });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    await waitFor(() => expect(result.current.directionPool?.directions[0].provenance).toBe("ai-suggestion"));

    expect(mocks.suggest).toHaveBeenCalledWith("work-1");
    expect(result.current.directionPool?.selectedIds).toEqual(suggestions.slice(0, 3).map((suggestion) => suggestion.id));
    expect(result.current.quote).toEqual({ unitCount: 3, credits: 150 });
  });

  it("keeps a restored manual selection and its cost when initial suggestions arrive", async () => {
    vi.useRealTimers();
    const pool = createDefaultCreativeDirectionPool();
    pool.selectedIds = [pool.directions[0].id];
    const suggestions = pool.directions.map((direction, index) => ({
      ...direction,
      id: `00000000-0000-4000-8000-0000000000f${index}`,
      provenance: "ai-suggestion" as const,
    }));
    const response = deferred<{ directions: typeof suggestions }>();
    mocks.suggest.mockReturnValue(response.promise);
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ settings: { targetFormats: [], directionPool: pool } }),
        sources: [{ id: "source-1", status: "ready" }],
      },
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    await waitFor(() => expect(mocks.suggest).toHaveBeenCalledTimes(1));

    await act(async () => response.resolve({ directions: suggestions }));

    expect(result.current.directionPool?.selectedIds).toEqual(pool.selectedIds);
    expect(result.current.quote).toEqual({ unitCount: 1, credits: 50 });
    expect(result.current.pendingDirectionSuggestions?.directions).toEqual(suggestions);
  });

  it.each(["resolve", "reject"] as const)("ignores an obsolete suggestion %s after requesting a newer round", async (settlement) => {
    vi.useRealTimers();
    const suggestions = createDefaultCreativeDirectionPool().directions.map((direction) => ({
      ...direction,
      provenance: "ai-suggestion" as const,
    }));
    const older = deferred<{ directions: typeof suggestions }>();
    const newer = deferred<{ directions: typeof suggestions }>();
    mocks.suggest.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    mocks.work.mockReturnValue({
      data: { ...workDetail(), sources: [{ id: "source-1", status: "ready" }] },
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    await waitFor(() => expect(mocks.suggest).toHaveBeenCalledTimes(1));
    act(() => result.current.requestDirectionSuggestions());
    await waitFor(() => expect(mocks.suggest).toHaveBeenCalledTimes(2));
    await act(async () => newer.resolve({ directions: suggestions }));
    const acceptedPool = result.current.directionPool;

    await act(async () => {
      if (settlement === "resolve") older.resolve({ directions: [{ ...suggestions[0], label: "Resposta antiga" }] });
      else older.reject(new Error("Falha antiga"));
    });

    expect(result.current.directionPool).toEqual(acceptedPool);
    expect(result.current.directionSuggestionState).toBe("ready");
    expect(result.current.pendingDirectionSuggestions).toBeNull();
  });

  it.each(["resolve", "reject"] as const)("ignores a suggestion %s from the previous protocol", async (settlement) => {
    vi.useRealTimers();
    const suggestions = createDefaultCreativeDirectionPool().directions;
    const response = deferred<{ directions: typeof suggestions }>();
    mocks.suggest.mockReturnValue(response.promise);
    mocks.work.mockImplementation((id) => ({
      data: id === "work-1"
        ? { ...workDetail(), sources: [{ id: "source-1", status: "ready" }] }
        : undefined,
      isLoading: false,
      isError: false,
    }));
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    await waitFor(() => expect(mocks.suggest).toHaveBeenCalledTimes(1));
    await act(async () => { await result.current.selectIntent("single"); });
    expect(result.current.intent).toBe("single");

    await act(async () => {
      if (settlement === "resolve") response.resolve({ directions: suggestions });
      else response.reject(new Error("Falha antiga"));
    });

    expect(result.current.intent).toBe("single");
    expect(result.current.directionPool).toBeNull();
    expect(result.current.directionSuggestionState).toBe("idle");
    expect(result.current.pendingDirectionSuggestions).toBeNull();
  });

  it("requests suggestions again on demand even when suggestions are already persisted (#129)", async () => {
    vi.useRealTimers();
    const aiDirection = {
      id: "00000000-0000-4000-8000-0000000000a1",
      label: "Sugerida",
      instruction: "Instrução sugerida",
      order: 0,
      safetyBand: "safe" as const,
      provenance: "ai-suggestion" as const,
    };
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({
          settings: {
            targetFormats: [],
            directionPool: { version: 1, directions: [aiDirection], selectedIds: [aiDirection.id], manualInstruction: null },
          },
        }),
        sources: [{ id: "source-1", status: "ready" }],
      },
      isLoading: false,
      isError: false,
    });
    const freshSuggestion = { ...aiDirection, id: "00000000-0000-4000-8000-0000000000b1", label: "Nova", order: 1 };
    mocks.suggest.mockResolvedValue({ directions: [freshSuggestion] });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    await act(async () => Promise.resolve());

    // Persisted suggestions never trigger another automatic fetch on reload…
    expect(mocks.suggest).not.toHaveBeenCalled();
    expect(result.current.directionSuggestionState).toBe("ready");

    // …but "Sugerir novamente" always fetches a new round and keeps the selection.
    act(() => result.current.requestDirectionSuggestions());
    await waitFor(() => expect(mocks.suggest).toHaveBeenCalledWith("work-1"));
    await waitFor(() => expect(result.current.directionSuggestionState).toBe("ready"));
    expect(result.current.directionPool?.selectedIds).toEqual([aiDirection.id]);
    expect(result.current.directionPool?.directions.map((direction) => direction.id)).toEqual([
      aiDirection.id,
      freshSuggestion.id,
    ]);
  });

  it("keeps selected chips and replaces only the unselected ones when applying suggestions", async () => {
    vi.useRealTimers();
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false, isError: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    await act(async () => Promise.resolve());

    const defaults = result.current.directionPool!.directions;
    act(() => result.current.toggleDirection(defaults[0].id));
    const keptIds = result.current.directionPool!.selectedIds;
    expect(keptIds).toHaveLength(2);

    const suggestions = Array.from({ length: 5 }, (_, index) => ({
      id: `00000000-0000-4000-8000-0000000000b${index}`,
      label: `Sugestão ${index}`,
      instruction: `Instrução ${index}`,
      order: index,
      safetyBand: "safe" as const,
      provenance: "ai-suggestion" as const,
    }));
    act(() => result.current.applyDirectionSuggestions(suggestions));

    expect(result.current.directionPool?.selectedIds).toEqual(keptIds);
    expect(result.current.directionPool?.directions.map((direction) => direction.id)).toEqual([
      ...keptIds,
      ...suggestions.slice(0, 3).map((suggestion) => suggestion.id),
    ]);
    expect(result.current.quote).toEqual({ unitCount: 2, credits: 100 });
  });

  it("applies the full received set with new selections when confirming the late initial response (#129)", async () => {
    vi.useRealTimers();
    const suggestions = Array.from({ length: 5 }, (_, index) => ({
      id: `00000000-0000-4000-8000-0000000000c${index}`,
      label: `Sugestão ${index}`,
      instruction: `Instrução ${index}`,
      order: index,
      safetyBand: "safe" as const,
      provenance: "ai-suggestion" as const,
    }));
    mocks.work.mockReturnValue({
      data: {
        ...workDetail(),
        sources: [{ id: "source-1", status: "ready" }],
      },
      isLoading: false,
      isError: false,
    });
    const round = deferred<{ directions: typeof suggestions }>();
    mocks.suggest.mockReturnValue(round.promise);

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    await act(async () => Promise.resolve());
    await waitFor(() => expect(result.current.directionSuggestionState).toBe("loading"));

    // The user picks chips before the late response lands (#129).
    const defaults = result.current.directionPool!.directions;
    act(() => result.current.toggleDirection(defaults[0].id));
    const chosenIds = result.current.directionPool!.selectedIds;
    expect(chosenIds).toHaveLength(2);

    await act(async () => round.resolve({ directions: suggestions }));
    await waitFor(() => expect(result.current.directionSuggestionState).toBe("ready"));

    // The late response waits for confirmation flagged as a replacement.
    expect(result.current.pendingDirectionSuggestions).toEqual({ directions: suggestions, preserveSelection: false });
    expect(result.current.directionPool?.selectedIds).toEqual(chosenIds);

    act(() => {
      const pending = result.current.pendingDirectionSuggestions!;
      result.current.applyDirectionSuggestions(pending.directions, pending.preserveSelection);
    });

    // The full received set applies, with its top suggestions selected.
    expect(result.current.directionPool?.directions.map((direction) => direction.id)).toEqual(
      suggestions.map((suggestion) => suggestion.id),
    );
    expect(result.current.directionPool?.selectedIds).toEqual(
      suggestions.slice(0, 3).map((suggestion) => suggestion.id),
    );
    expect(result.current.pendingDirectionSuggestions).toBeNull();
    expect(result.current.quote).toEqual({ unitCount: 3, credits: 150 });
  });

  it("preserves the selected chips when confirming a 'Sugerir novamente' response (#129)", async () => {
    vi.useRealTimers();
    const firstRound = Array.from({ length: 5 }, (_, index) => ({
      id: `00000000-0000-4000-8000-0000000000d${index}`,
      label: `Sugestão ${index}`,
      instruction: `Instrução ${index}`,
      order: index,
      safetyBand: "safe" as const,
      provenance: "ai-suggestion" as const,
    }));
    mocks.work.mockReturnValue({
      data: {
        ...workDetail(),
        sources: [{ id: "source-1", status: "ready" }],
      },
      isLoading: false,
      isError: false,
    });
    mocks.suggest.mockResolvedValue({ directions: firstRound });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    await waitFor(() => expect(result.current.directionPool?.directions[0].provenance).toBe("ai-suggestion"));

    // The user adjusts the selection after the auto-apply…
    act(() => result.current.toggleDirection(firstRound[0].id));
    const keptIds = result.current.directionPool!.selectedIds;
    expect(keptIds).toHaveLength(2);

    // …then asks for a new round, which also lands as a pending confirmation.
    const second = deferred<{ directions: typeof firstRound }>();
    mocks.suggest.mockReturnValue(second.promise);
    act(() => result.current.requestDirectionSuggestions());
    await waitFor(() => expect(result.current.directionSuggestionState).toBe("loading"));

    const fresh = firstRound.slice(0, 2).map((suggestion, index) => ({
      ...suggestion,
      id: `00000000-0000-4000-8000-0000000000e${index}`,
      label: `Nova ${index}`,
    }));
    await act(async () => second.resolve({ directions: fresh }));
    await waitFor(() => expect(result.current.directionSuggestionState).toBe("ready"));

    expect(result.current.pendingDirectionSuggestions).toEqual({ directions: fresh, preserveSelection: true });

    act(() => {
      const pending = result.current.pendingDirectionSuggestions!;
      result.current.applyDirectionSuggestions(pending.directions, pending.preserveSelection);
    });

    expect(result.current.directionPool?.selectedIds).toEqual(keptIds);
    expect(result.current.directionPool?.directions.map((direction) => direction.id)).toEqual([
      ...keptIds,
      ...fresh.map((suggestion) => suggestion.id),
    ]);
  });

  it("never autosaves or regenerates a hydrated non-draft work", async () => {
    mocks.work.mockReturnValue({
      data: workDetail({ id: WORK_ID, status: "generating" }),
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() =>
      useCreativeComposer({ initialWorkId: WORK_ID })
    );
    await act(async () => Promise.resolve());

    act(() => result.current.setRequest("Não deve salvar"));
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    await act(() => result.current.generateLegacy());

    expect(mocks.autosave).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(result.current.canGenerate).toBe(false);
  });

  it("skips a stored variation draft only for an explicit fresh Studio entry", async () => {
    const storedDraftId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const storedValues = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storedValues.get(key) ?? null,
        setItem: (key: string, value: string) => storedValues.set(key, value),
        removeItem: (key: string) => storedValues.delete(key),
        clear: () => storedValues.clear(),
      },
    });
    window.localStorage.setItem(
      "adscale:creative-draft:v1:profile-a:variations",
      storedDraftId,
    );
    window.history.replaceState({}, "", "/?mode=arte&compose=1&intent=variations&fresh=1");

    const fresh = renderHook(() => useCreativeComposer({
      initialIntent: "variations",
      freshEntry: true,
    }));
    await act(async () => Promise.resolve());

    expect(fresh.result.current.workId).toBeNull();
    expect(window.location.search).not.toContain("workId=");

    fresh.unmount();
    window.history.replaceState({}, "", "/?intent=variations");
    const resumed = renderHook(() => useCreativeComposer({ initialIntent: "variations" }));

    await act(async () => Promise.resolve());
    expect(resumed.result.current.workId).toBe(storedDraftId);
    expect(window.location.search).toContain(`workId=${storedDraftId}`);
  });

  it("stops retrying autosave after the server reports a non-draft conflict", async () => {
    mocks.work.mockReturnValue({
      data: workDetail({ id: WORK_ID, status: "draft" }),
      isLoading: false,
      isError: false,
    });
    mocks.autosave.mockRejectedValue(new Error("creativeWorkNotDraft"));
    const { result, rerender } = renderHook(() =>
      useCreativeComposer({ initialWorkId: WORK_ID })
    );
    await act(async () => Promise.resolve());

    act(() => result.current.setRequest("Mudança concorrente"));
    await act(() => vi.advanceTimersByTimeAsync(600));
    rerender();
    await act(() => vi.advanceTimersByTimeAsync(2_000));

    expect(mocks.autosave).toHaveBeenCalledOnce();
  });

  it("detaches a non-draft work before switching protocols", async () => {
    mocks.work.mockImplementation((id: string | null) => ({
      data: id === WORK_ID
        ? workDetail({ id: WORK_ID, status: "generating" })
        : undefined,
      isLoading: false,
      isError: false,
    }));
    const { result } = renderHook(() =>
      useCreativeComposer({ initialWorkId: WORK_ID })
    );
    await act(async () => Promise.resolve());

    act(() => result.current.selectIntent("restyle"));
    await act(() => vi.advanceTimersByTimeAsync(1_000));

    expect(result.current.intent).toBe("restyle");
    expect(result.current.workId).toBeNull();
    expect(result.current.request).toBe("");
    expect(window.location.search).toBe("?intent=restyle");
    expect(mocks.autosave).not.toHaveBeenCalled();
  });

  it("switches an empty protocol immediately", async () => {
    const { result } = renderHook(() => useCreativeComposer());

    act(() => result.current.selectIntent("restyle"));
    await act(async () => Promise.resolve());

    expect(result.current.intent).toBe("restyle");
    expect(result.current.pendingProtocolSwitch).toBeNull();
    expect(result.current.protocolSwitchNotice).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("preserves a draft, reuses its original safely, and returns to it", async () => {
    const detail = {
      ...workDetail({ id: WORK_ID }),
      sources: [{
        id: "source-1", assetId: "asset-1", templateId: null, status: "ready",
        usage: "both", usageConfirmed: true,
      }],
    };
    mocks.work.mockImplementation((id: string | null) => ({
      data: id === WORK_ID ? detail : undefined,
      isLoading: false,
      isError: false,
    }));
    mocks.create.mockResolvedValueOnce({
      work: workDetail({ id: TARGET_WORK_ID, request: "", toolKind: "restyle" }).work,
      quote: { unitCount: 1, credits: 5 },
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: WORK_ID }));
    await act(async () => Promise.resolve());

    await act(async () => result.current.selectIntent("restyle"));

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      request: "", intent: "restyle", assetId: "asset-1", usage: "content",
    }));
    expect(result.current.protocolSwitchNotice).toEqual({ from: "variations", to: "restyle" });
    expect(result.current.workId).toBe(TARGET_WORK_ID);

    await act(async () => result.current.returnToPreviousProtocol());

    expect(result.current.intent).toBe("variations");
    expect(result.current.workId).toBe(WORK_ID);
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it("restores the current protocol draft from local storage on reload", async () => {
    window.localStorage.setItem(`adscale:creative-draft:v1:${profileA.id}:variations`, WORK_ID);

    const { result } = renderHook(() => useCreativeComposer());
    await act(async () => Promise.resolve());

    expect(result.current.workId).toBe(WORK_ID);
    expect(window.location.search).toBe(`?workId=${WORK_ID}`);
  });

  it("does not reuse a style reference outside Restyle", async () => {
    const detail = {
      ...workDetail({ id: WORK_ID, toolKind: "restyle" }),
      sources: [{
        id: "source-1", assetId: "asset-style", templateId: null, status: "ready",
        usage: "style", usageConfirmed: true,
      }],
    };
    mocks.work.mockReturnValue({ data: detail, isLoading: false, isError: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: WORK_ID, initialIntent: "restyle" }));
    await act(async () => Promise.resolve());

    await act(async () => result.current.selectIntent("variations"));

    expect(result.current.intent).toBe("variations");
    expect(result.current.workId).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("asks before switching while an upload is pending", async () => {
    const uploading = deferred<{ assetId: string; name: string }>();
    mocks.upload.mockReturnValueOnce(uploading.promise);
    const { result } = renderHook(() => useCreativeComposer());
    const add = result.current.addFiles([new File(["image"], "arte.png", { type: "image/png" })]);
    await act(async () => Promise.resolve());

    act(() => result.current.selectIntent("restyle"));

    expect(result.current.intent).toBe("variations");
    expect(result.current.pendingProtocolSwitch).toBe("restyle");

    await act(async () => {
      uploading.resolve({ assetId: "asset-1", name: "arte.png" });
      await add;
    });
  });

  it("waits for an in-flight autosave before switching protocols", async () => {
    const saving = deferred<{ work: { id: string } }>();
    mocks.autosave.mockReturnValueOnce(saving.promise);
    mocks.work.mockImplementation((id: string | null) => ({
      data: id === WORK_ID ? workDetail({ id: WORK_ID }) : undefined,
      isLoading: false,
      isError: false,
    }));
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: WORK_ID }));
    await act(async () => Promise.resolve());

    act(() => result.current.setRequest("Pedido mais recente"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    act(() => result.current.selectIntent("restyle"));
    act(() => result.current.confirmProtocolSwitch());
    await act(async () => Promise.resolve());

    expect(result.current.intent).toBe("variations");

    await act(async () => saving.resolve({ work: { id: WORK_ID } }));

    expect(mocks.autosave).toHaveBeenCalledWith(expect.objectContaining({ request: "Pedido mais recente" }));
    expect(result.current.intent).toBe("restyle");
  });

  it("ignores a stale draft creation that finishes after switching protocols", async () => {
    const creating = deferred<{ work: ReturnType<typeof workDetail>["work"]; quote: { unitCount: number; credits: number } }>();
    mocks.create.mockReturnValueOnce(creating.promise);
    const { result } = renderHook(() => useCreativeComposer());

    act(() => result.current.setRequest("Pedido antigo"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    act(() => result.current.selectIntent("restyle"));
    expect(result.current.intent).toBe("variations");
    expect(result.current.pendingProtocolSwitch).toBe("restyle");
    act(() => result.current.confirmProtocolSwitch());
    await act(async () => creating.resolve({
      work: workDetail({ id: WORK_ID, request: "Pedido antigo", toolKind: "variations" }).work,
      quote: { unitCount: 3, credits: 150 },
    }));

    expect(result.current.intent).toBe("restyle");
    expect(result.current.workId).toBeNull();
    expect(window.location.search).toBe("?intent=restyle");
  });

  it("focuses the real textarea once after StrictMode's synthetic cleanup", () => {
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      const id = ++frameId;
      frames.set(id, callback);
      return id;
    });
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames.delete(id);
    });
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, "focus");

    function Probe({ requested }: { requested: boolean }) {
      const composer = useCreativeComposer({ focusComposer: requested });
      return <textarea ref={composer.composerRef} />;
    }

    const view = render(<StrictMode><Probe requested /></StrictMode>);
    act(() => {
      for (const [id, callback] of frames) {
        frames.delete(id);
        callback(0);
      }
    });
    expect(focus).toHaveBeenCalledOnce();
    view.rerender(<StrictMode><Probe requested /></StrictMode>);
    expect(frames.size).toBe(0);

    view.unmount();
    render(<Probe requested={false} />);
    expect(focus).toHaveBeenCalledOnce();
    raf.mockRestore();
    cancel.mockRestore();
    focus.mockRestore();
  });

  it("attaches an initial template once under StrictMode", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    );
    renderHook(
      () =>
        useCreativeComposer({
          initialTemplateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
      { wrapper }
    );

    await act(async () => Promise.resolve());

    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientProfileId: profileA.id,
        templateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        usage: "both",
      })
    );
  });

  it("consumes template and compose params once after a new StrictMode draft attaches", async () => {
    window.history.replaceState({}, "", `/?templateId=${TEMPLATE_ID}&compose=1`);
    const replace = vi.spyOn(window.history, "replaceState");
    mocks.create.mockImplementation((input: { templateId?: string }) => Promise.resolve({
      work: { ...workDetail({ id: WORK_ID }).work, request: "", toolKind: "variations" },
      quote: { unitCount: 3, credits: 150 },
      input,
    }));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    );

    renderHook(() => useCreativeComposer({ initialTemplateId: TEMPLATE_ID }), { wrapper });
    await act(async () => Promise.resolve());

    expect(mocks.create).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledTimes(2);
    expect(window.location.search).toBe(`?workId=${WORK_ID}`);
    replace.mockRestore();
  });

  it("does not double-attach a template already visible after reload", async () => {
    const templateId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    mocks.work.mockReturnValue({
      data: {
        ...workDetail(),
        sources: [
          {
            id: "source-template",
            templateId,
            assetId: null,
            usage: "both",
            status: "ready",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() =>
      useCreativeComposer({ initialWorkId: "work-1", initialTemplateId: templateId })
    );
    await act(async () => Promise.resolve());

    expect(result.current.sources).toEqual([
      expect.objectContaining({ templateId, id: "source-template" }),
    ]);
    expect(mocks.source).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("consumes a hydrated template URL so source removal plus reload cannot reattach or refocus", async () => {
    window.history.replaceState(
      {},
      "",
      `/?workId=${WORK_ID}&intent=restyle&templateId=${TEMPLATE_ID}&compose=1`
    );
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ id: WORK_ID }),
        sources: [{ id: "source-template", templateId: TEMPLATE_ID, assetId: null, usage: "both", status: "ready" }],
      },
      isLoading: false,
      isError: false,
    });
    const replace = vi.spyOn(window.history, "replaceState");
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      const id = ++frameId;
      frames.set(id, callback);
      return id;
    });
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, "focus");
    function Probe({ reload = false }: { reload?: boolean }) {
      const composer = useCreativeComposer(reload ? {
        initialWorkId: WORK_ID,
        initialIntent: "restyle",
      } : {
        initialWorkId: WORK_ID,
        initialIntent: "restyle",
        initialTemplateId: TEMPLATE_ID,
        focusComposer: true,
      });
      return <textarea ref={composer.composerRef} />;
    }
    const first = render(<StrictMode><Probe /></StrictMode>);
    await act(async () => Promise.resolve());
    act(() => {
      for (const [id, callback] of frames) {
        frames.delete(id);
        callback(0);
      }
    });

    expect(window.location.search).toBe(`?workId=${WORK_ID}&intent=restyle`);
    expect(replace).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
    first.unmount();

    mocks.work.mockReturnValue({
      data: workDetail({ id: WORK_ID }),
      isLoading: false,
      isError: false,
    });
    render(<StrictMode><Probe reload /></StrictMode>);
    await act(async () => Promise.resolve());

    expect(mocks.source).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    expect(focus).toHaveBeenCalledOnce();
    replace.mockRestore();
    raf.mockRestore();
    focus.mockRestore();
  });

  it("attaches an initial template to the hydrated draft instead of creating another work", async () => {
    const templateId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    mocks.work.mockReturnValue({
      data: workDetail(),
      isLoading: false,
      isError: false,
    });

    renderHook(() =>
      useCreativeComposer({ initialWorkId: "work-1", initialTemplateId: templateId })
    );
    await act(async () => Promise.resolve());

    expect(mocks.source).toHaveBeenCalledOnce();
    expect(mocks.source).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-1",
      action: "attachSource",
      templateId,
      usage: "both",
    }));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps URL params after a transient template failure and retries explicitly", async () => {
    window.history.replaceState(
      {},
      "",
      `/?workId=${WORK_ID}&templateId=${TEMPLATE_ID}&compose=1`
    );
    mocks.work.mockReturnValue({
      data: workDetail({ id: WORK_ID }),
      isLoading: false,
      isError: false,
    });
    mocks.source
      .mockRejectedValueOnce(new Error("Falha transitória"))
      .mockResolvedValueOnce({ source: { id: "source-template" } });
    const { result } = renderHook(() => useCreativeComposer({
      initialWorkId: WORK_ID,
      initialTemplateId: TEMPLATE_ID,
      focusComposer: true,
    }));
    await act(async () => Promise.resolve());

    expect(mocks.source).toHaveBeenCalledOnce();
    expect(window.location.search).toContain(`templateId=${TEMPLATE_ID}`);
    expect(result.current.retryInitialTemplate).not.toBeNull();

    await act(async () => result.current.retryInitialTemplate?.());
    await act(async () => Promise.resolve());

    expect(mocks.source).toHaveBeenCalledTimes(2);
    expect(window.location.search).toBe(`?workId=${WORK_ID}`);
    expect(result.current.retryInitialTemplate).toBeNull();
  });

  it("waits for an explicit brand selection before attaching an initial template", async () => {
    const templateId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    mocks.active.mockReturnValue(
      active({
        profiles: [profileA, profileB],
        activeProfile: null,
        activeClientProfileId: null,
        requiresSelection: true,
      })
    );
    const { rerender } = renderHook(() =>
      useCreativeComposer({ initialTemplateId: templateId })
    );
    await act(async () => Promise.resolve());
    expect(mocks.create).not.toHaveBeenCalled();

    mocks.active.mockReturnValue(active());
    rerender();
    await act(async () => Promise.resolve());

    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ clientProfileId: profileA.id, templateId })
    );
  });

  it("creates one draft after the first non-empty debounced save", async () => {
    const { result } = renderHook(() => useCreativeComposer());
    act(() => result.current.setRequest("  Campanha de julho  "));
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      clientProfileId: profileA.id,
      request: "  Campanha de julho  ",
      intent: "variations",
    }));

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it("creates an attachment-first draft with the accepted uploaded asset", async () => {
    const { result } = renderHook(() => useCreativeComposer());
    const file = new File(["image"], "arte.png", { type: "image/png" });

    await act(() => result.current.addFiles([file]));

    expect(mocks.upload).toHaveBeenCalledWith(file);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      request: "",
      assetId: "asset-1",
      usage: "both",
    }));
  });

  it("slices Single file selection to the remaining temporary-reference slots before upload", async () => {
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ toolKind: "single" }),
        sources: [
          { id: "source-1", assetId: "asset-1", status: "ready", usage: "both", usageConfirmed: true },
          { id: "source-2", assetId: "asset-2", status: "ready", usage: "both", usageConfirmed: true },
        ],
      },
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    const files = [
      new File(["1"], "first.png", { type: "image/png" }),
      new File(["2"], "second.png", { type: "image/png" }),
      new File(["3"], "third.png", { type: "image/png" }),
    ];

    await act(() => result.current.addFiles(files));

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledWith(files[0]);
    expect(mocks.source).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-1", action: "attachSource", assetId: "asset-1", usage: "both",
    }));
    expect(result.current.announcement).toContain("2 arquivos não enviados pelo limite de 3");
  });

  it("attaches an upload that finishes while the text-only draft is being created", async () => {
    const creating = deferred<{
      work: ReturnType<typeof workDetail>["work"];
      quote: { unitCount: number; credits: number };
    }>();
    mocks.create.mockReturnValue(creating.promise);
    const { result } = renderHook(() => useCreativeComposer());
    const file = new File(["image"], "arte-race.png", { type: "image/png" });

    act(() => result.current.setRequest("Campanha mobile"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(mocks.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ assetId: expect.anything() })
    );

    await act(async () => {
      const adding = result.current.addFiles([file]);
      await Promise.resolve();
      creating.resolve({
        work: {
          ...workDetail().work,
          id: WORK_ID,
          request: "Campanha mobile",
        },
        quote: { unitCount: 3, credits: 150 },
      });
      await adding;
    });

    expect(mocks.source).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: WORK_ID,
      action: "attachSource",
      assetId: "asset-1",
      usage: "both",
    }));
  });

  it("surfaces a raced source attach failure and succeeds when the user retries", async () => {
    const creating = deferred<{
      work: ReturnType<typeof workDetail>["work"];
      quote: { unitCount: number; credits: number };
    }>();
    mocks.create.mockReturnValue(creating.promise);
    mocks.source
      .mockRejectedValueOnce(new Error("attach failed"))
      .mockResolvedValueOnce({ source: { id: "source-1" } });
    const { result } = renderHook(() => useCreativeComposer());
    const file = new File(["image"], "arte-race.png", { type: "image/png" });

    act(() => result.current.setRequest("Campanha mobile"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    await act(async () => {
      const adding = result.current.addFiles([file]);
      await Promise.resolve();
      creating.resolve({
        work: {
          ...workDetail().work,
          id: WORK_ID,
          request: "Campanha mobile",
        },
        quote: { unitCount: 3, credits: 150 },
      });
      await adding;
    });

    expect(result.current.error).toBe("attach failed");
    expect(result.current.announcement).not.toBe("Arte adicionada");

    await act(() => result.current.addFiles([file]));

    expect(mocks.source).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.announcement).toBe("Arte adicionada");
  });

  it("re-reads instead of surfacing a transient 409 when a source retry loses its race", async () => {
    vi.useRealTimers();
    const refetch = mocks.refetch.mockResolvedValue({ data: workDetail() });
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ id: WORK_ID }),
        sources: [{
          id: "source-1",
          status: "failed",
          usage: "both",
          usageConfirmed: true,
        }],
      },
      isLoading: false,
      isError: false,
      refetch,
    });
    mocks.source.mockRejectedValueOnce(
      Object.assign(new Error("Entrada inválida"), { code: "invalidInput", status: 409 }),
    );

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: WORK_ID }));
    await act(async () => Promise.resolve());
    await act(async () => result.current.retrySource("source-1"));

    expect(refetch).toHaveBeenCalledOnce();
    expect(result.current.error).toBeNull();
  });

  it("refreshes the work revision between successful source mutations", async () => {
    const initialRevision = "2026-08-30T12:00:00.000Z";
    const nextRevision = "2026-08-30T12:00:00.001Z";
    const finalRevision = "2026-08-30T12:00:00.002Z";
    const initial = workDetail({ id: WORK_ID, updatedAt: initialRevision });
    mocks.work.mockReturnValue({ data: initial, isLoading: false, isError: false, refetch: mocks.refetch });
    mocks.refetch
      .mockResolvedValueOnce({ data: workDetail({ id: WORK_ID, updatedAt: nextRevision }) })
      .mockResolvedValueOnce({ data: workDetail({ id: WORK_ID, updatedAt: finalRevision }) });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: WORK_ID }));
    await act(async () => { await result.current.updateSource("source-1", "style"); });
    await act(async () => { await result.current.updateSource("source-1", "content"); });

    expect(mocks.source).toHaveBeenNthCalledWith(1, expect.objectContaining({
      workItemId: WORK_ID,
      action: "updateSource",
      expectedUpdatedAt: initialRevision,
    }));
    expect(mocks.source).toHaveBeenNthCalledWith(2, expect.objectContaining({
      workItemId: WORK_ID,
      action: "updateSource",
      expectedUpdatedAt: nextRevision,
    }));
    expect(mocks.refetch).toHaveBeenCalledTimes(2);
  });

  it("persists a corrected source reading on the same creative work", async () => {
    mocks.work.mockReturnValue({ data: workDetail({ id: WORK_ID }), isLoading: false, isError: false });
    const content = {
      product: "Curso",
      offer: "30%",
      cta: { text: "Inscreva-se", style: "botão" },
      brandElements: [],
      keyVisual: "Médica",
      textContent: { headline: "Nova turma", bullets: ["Agosto"] },
      format: "4:5",
    };
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: WORK_ID }));

    await act(async () => result.current.editSource("source-1", content, null));

    expect(mocks.source).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: WORK_ID,
      action: "editSourceAnalysis",
      sourceId: "source-1",
      content,
      style: null,
    }));
  });

  it("delivers an upload announcement to the composer mounted after draft canonicalization", async () => {
    const creating = deferred<{
      work: ReturnType<typeof workDetail>["work"];
      quote: { unitCount: number; credits: number };
    }>();
    mocks.create.mockReturnValue(creating.promise);
    const first = renderHook(() => useCreativeComposer());
    const file = new File(["image"], "arte-remount.png", { type: "image/png" });

    let adding!: Promise<void>;
    await act(async () => {
      adding = first.result.current.addFiles([file]);
      await Promise.resolve();
    });
    first.unmount();
    const replacement = renderHook(() => useCreativeComposer({ initialWorkId: WORK_ID }));

    await act(async () => {
      creating.resolve({
        work: { ...workDetail().work, id: WORK_ID },
        quote: { unitCount: 3, credits: 150 },
      });
      await adding;
    });

    expect(replacement.result.current.announcement).toBe("Arte adicionada");
  });

  it("rejects an unsafe work identifier returned while creating a draft", async () => {
    mocks.create.mockResolvedValue({
      work: { ...workDetail().work, id: "../../other-workspace" },
      quote: { unitCount: 3, credits: 150 },
    });
    const { result } = renderHook(() => useCreativeComposer());

    await act(() => result.current.addInspiration({
      id: "inspiration-1", source: "template", title: "Template", previewUrl: null,
      templateId: TEMPLATE_ID,
      assetId: null, suggestedIntent: "variations",
    }));

    expect(result.current.workId).toBeNull();
    expect(result.current.error).toMatch(/identificador/i);
    expect(window.location.search).toBe("");
  });

  it("attaches a template inspiration to the same existing composer", async () => {
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false, isError: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(() => result.current.addInspiration({
      id: "template-1", source: "template", title: "Lançamento", previewUrl: null,
      templateId: "template-1", assetId: null, suggestedIntent: "variations",
    }));

    expect(mocks.source).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-1", action: "attachSource", templateId: "template-1", usage: "both",
    }));
  });

  it("attaches an inspiration only after a confirmed cross-protocol switch", async () => {
    const saving = deferred<{ work: { id: string } }>();
    mocks.autosave.mockReturnValueOnce(saving.promise);
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false, isError: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    await act(async () => Promise.resolve());
    act(() => result.current.setRequest("Rascunho alterado"));
    await act(() => vi.advanceTimersByTimeAsync(500));

    const attaching = result.current.addInspiration({
      id: "template-restyle", source: "template", title: "Restyle", previewUrl: null,
      templateId: "template-restyle", assetId: null, suggestedIntent: "restyle",
    });
    await act(async () => Promise.resolve());

    expect(result.current.pendingProtocolSwitch).toBe("restyle");
    expect(mocks.source).not.toHaveBeenCalled();
    act(() => result.current.confirmProtocolSwitch());
    await act(async () => { saving.resolve({ work: { id: "work-1" } }); });
    await act(async () => { await attaching; });

    expect(result.current.intent).toBe("restyle");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      templateId: "template-restyle", usage: "style", intent: "restyle",
    }));
  });

  it("does not attach an inspiration when its cross-protocol switch is cancelled", async () => {
    const saving = deferred<{ work: { id: string } }>();
    mocks.autosave.mockReturnValueOnce(saving.promise);
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false, isError: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    await act(async () => Promise.resolve());
    act(() => result.current.setRequest("Rascunho alterado"));
    await act(() => vi.advanceTimersByTimeAsync(500));

    const attaching = result.current.addInspiration({
      id: "template-restyle", source: "template", title: "Restyle", previewUrl: null,
      templateId: "template-restyle", assetId: null, suggestedIntent: "restyle",
    });
    await act(async () => Promise.resolve());
    act(() => result.current.cancelProtocolSwitch());
    await act(async () => { await attaching; });

    expect(result.current.intent).toBe("variations");
    expect(mocks.source).not.toHaveBeenCalled();
  });

  it("does not materialize a curated inspiration until its cross-protocol switch is confirmed", async () => {
    const saving = deferred<{ work: { id: string } }>();
    mocks.autosave.mockReturnValueOnce(saving.promise);
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false, isError: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    await act(async () => Promise.resolve());
    act(() => result.current.setRequest("Rascunho alterado"));
    await act(() => vi.advanceTimersByTimeAsync(500));

    const attaching = result.current.addInspiration({
      id: "curated-1", source: "curated", title: "Editorial", previewUrl: null,
      templateId: null, assetId: null, curatedInspirationId: "curated-1", suggestedIntent: "restyle",
    });
    await act(async () => Promise.resolve());
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    act(() => result.current.cancelProtocolSwitch());
    await act(async () => { await attaching; });
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    expect(mocks.source).not.toHaveBeenCalled();
  });

  it("records every explicit progressive objective switch", async () => {
    const { result } = renderHook(() => useCreativeComposer({
      workflowVariant: "progressive", workspaceId: "ws-1", studioSessionId: "session-1",
    }));

    await act(async () => { await result.current.selectIntent("variations"); });
    await act(async () => { await result.current.selectIntent("restyle"); });
    await act(async () => { await result.current.selectIntent("single"); });

    expect(mocks.recordBetaEvent.mock.calls.filter(([event]) => event === "studio_goal_selected")).toEqual([
      ["studio_goal_selected", expect.objectContaining({ protocol: "variations" })],
      ["studio_goal_selected", expect.objectContaining({ protocol: "restyle" })],
      ["studio_goal_selected", expect.objectContaining({ protocol: "single" })],
    ]);
  });

  it("records the restored protocol as another explicit objective selection", async () => {
    mocks.work.mockImplementation((id: string | null) => ({
      data: id === WORK_ID ? workDetail({ id: WORK_ID }) : undefined,
      isLoading: false,
      isError: false,
    }));
    const { result } = renderHook(() => useCreativeComposer({
      initialWorkId: WORK_ID, workflowVariant: "progressive", workspaceId: "ws-1", studioSessionId: "session-1",
    }));
    await act(async () => result.current.selectIntent("restyle"));
    await act(async () => result.current.returnToPreviousProtocol());
    expect(mocks.recordBetaEvent.mock.calls.filter(([event]) => event === "studio_goal_selected").map(([, payload]) => payload.protocol)).toEqual([
      "restyle", "variations",
    ]);
  });

  it("hydrates a resumed progressive work without inventing a goal selection", async () => {
    mocks.work.mockImplementation((id: string | null) => ({
      data: id === WORK_ID ? workDetail({ id: WORK_ID, toolKind: "restyle" }) : undefined,
      isLoading: false,
      isError: false,
    }));
    const { result } = renderHook(() => useCreativeComposer({
      initialWorkId: WORK_ID, workflowVariant: "progressive", workspaceId: "ws-1", studioSessionId: "session-1",
    }));
    await act(async () => Promise.resolve());
    expect(result.current.intent).toBe("restyle");
    expect(result.current.objective).toBe("restyle");
    expect(mocks.recordBetaEvent).not.toHaveBeenCalledWith("studio_goal_selected", expect.anything());
  });

  it("creates an asset-backed draft when an approved inspiration starts an empty composer", async () => {
    const { result } = renderHook(() => useCreativeComposer());

    await act(() => result.current.addInspiration({
      id: "output-1", source: "approved_work", title: "Matrículas",
      previewUrl: "/api/workspace/assets/asset-1/file", templateId: null,
      assetId: "asset-1", suggestedIntent: "restyle",
    }));

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      clientProfileId: profileA.id, request: "", intent: "restyle", assetId: "asset-1", usage: "style",
    }));
    expect(result.current.intent).toBe("restyle");
    expect(mocks.source).not.toHaveBeenCalled();
  });

  it("materializes a curated Home inspiration before attaching it", async () => {
    mocks.apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ assetId: "asset-curated" }),
    });
    const { result } = renderHook(() => useCreativeComposer());

    await act(() => result.current.addInspiration({
      id: "curated-1", source: "curated", title: "Editorial",
      previewUrl: "/api/creative-work/inspirations/curated-1/file", templateId: null,
      assetId: null, curatedInspirationId: "curated-1", suggestedIntent: "restyle",
    }));

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      "/api/creative-work/inspirations/curated-1",
      { method: "POST", timeoutMs: 60_000 },
    );
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      assetId: "asset-curated",
      usage: "style",
    }));
  });

  it("attaches the first uploaded image as restyle content", async () => {
    const { result } = renderHook(() => useCreativeComposer({ initialIntent: "restyle" }));
    const file = new File(["image"], "original.png", { type: "image/png" });

    await act(() => result.current.addFiles([file]));

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      intent: "restyle", assetId: expect.any(String), usage: "content",
    }));
  });

  it("creates a template-backed draft when a template starts an empty composer", async () => {
    const { result } = renderHook(() => useCreativeComposer());

    await act(() => result.current.addInspiration({
      id: "template-1", source: "template", title: "Lançamento", previewUrl: null,
      templateId: "template-1", assetId: null, suggestedIntent: "variations",
    }));

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      clientProfileId: profileA.id, request: "", templateId: "template-1", usage: "both",
    }));
    expect(mocks.source).not.toHaveBeenCalled();
  });

  it("mutates with the post-create revision after a template-backed draft", async () => {
    const createdRevision = "2026-08-31T15:00:00.001Z";
    mocks.create.mockImplementation((input: { request: string; intent: string; format: string; settings: { targetFormats: string[] } }) => Promise.resolve({
      work: {
        ...workDetail().work,
        id: WORK_ID,
        request: input.request,
        toolKind: input.intent,
        format: input.format,
        settings: input.settings,
        updatedAt: createdRevision,
      },
      quote: { unitCount: 3, credits: 150 },
    }));
    const { result } = renderHook(() => useCreativeComposer());

    await act(() => result.current.addInspiration({
      id: "template-1", source: "template", title: "Lançamento", previewUrl: null,
      templateId: "template-1", assetId: null, suggestedIntent: "variations",
    }));
    await act(() => result.current.addInspiration({
      id: "template-2", source: "template", title: "Outra", previewUrl: null,
      templateId: "template-2", assetId: null, suggestedIntent: "variations",
    }));

    expect(mocks.source).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: WORK_ID,
      action: "attachSource",
      templateId: "template-2",
      expectedUpdatedAt: createdRevision,
    }));
  });

  it("does not announce an attached inspiration when draft creation fails", async () => {
    mocks.create.mockRejectedValue(new Error("draft failed"));
    const { result } = renderHook(() => useCreativeComposer());

    await act(() => result.current.addInspiration({
      id: "template-1", source: "template", title: "Lançamento", previewUrl: null,
      templateId: "template-1", assetId: null, suggestedIntent: "variations",
    }));

    expect(result.current.error).toBe("draft failed");
    expect(result.current.announcement).toBe("");
  });

  it("applies a tool preset to the same focused composer and updates its canonical quote", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
    const { result } = renderHook(() => useCreativeComposer());
    const textarea = document.createElement("textarea");
    (result.current.composerRef as { current: HTMLTextAreaElement | null }).current = textarea;
    document.body.appendChild(textarea);

    act(() => result.current.selectIntent("single"));

    expect(result.current.intent).toBe("single");
    expect(result.current.quote).toEqual({ unitCount: 1, credits: 50 });
    expect(document.activeElement).toBe(textarea);
    textarea.remove();
    vi.unstubAllGlobals();
  });

  it("does not create without a valid brand and focuses the global switcher", async () => {
    mocks.active.mockReturnValue(active({
      profiles: [profileA, profileB], activeProfile: null, activeClientProfileId: null, requiresSelection: true,
    }));
    const select = document.createElement("select");
    select.id = "active-brand-switcher";
    document.body.appendChild(select);
    const { result } = renderHook(() => useCreativeComposer());

    act(() => result.current.setRequest("Novo anúncio"));
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(mocks.create).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(select);
    select.remove();
  });

  it("restores request and the stored brand even when the global brand differs", async () => {
    mocks.active.mockReturnValue(active({ profiles: [profileA, profileB] }));
    mocks.work.mockReturnValue({ data: workDetail({ clientProfileId: profileB.id }), isLoading: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    expect(result.current.request).toBe("Pedido salvo");
    expect(result.current.brandName).toBe("Marca B");
    expect(result.current.state).toBe("ready");
  });

  it("keeps generation disabled while a confirmed source is being reanalyzed", () => {
    mocks.work.mockReturnValue({
      data: {
        ...workDetail(),
        sources: [{ id: "source-1", usageConfirmed: true, status: "analyzing" }],
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    expect(result.current.state).toBe("analyzing");
    expect(result.current.canGenerate).toBe(false);
  });

  it.each([
    ["low confidence", { category: null, confidence: "low", classificationSource: "automatic", hasTransparency: false }],
    ["failed", { category: "style_reference", confidence: "high", classificationSource: "automatic", hasTransparency: false }, "failed"],
    ["exact without alpha", { category: "additional_logo_or_seal", confidence: "high", classificationSource: "user", hasTransparency: false }],
  ] as const)("blocks Single generation for a %s temporary reference", (_label, pieceReference, status = "ready") => {
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ toolKind: "single" }),
        sources: [{ id: "source-1", usage: "both", usageConfirmed: true, status, pieceReference }],
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    expect(result.current.canGenerate).toBe(false);
  });

  it("enables restyle with two ready sources without asking for usage confirmation", () => {
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ toolKind: "restyle", request: "" }),
        sources: [
          { id: "source-1", usage: "content", usageConfirmed: false, status: "ready" },
          { id: "source-2", usage: "style", usageConfirmed: false, status: "ready" },
        ],
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    expect(result.current.canGenerate).toBe(true);
  });

  it("does not let a failed source block non-Single generation", () => {
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ toolKind: "variations" }),
        sources: [
          { id: "source-ready", usage: "style", usageConfirmed: false, status: "ready", pieceReference: null },
          { id: "source-failed", usage: "style", usageConfirmed: false, status: "failed", pieceReference: null },
        ],
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    expect(result.current.canGenerate).toBe(true);
  });

  it("does not enable restyle from a single ready both source", () => {
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ toolKind: "restyle", request: "" }),
        sources: [
          { id: "source-1", usage: "both", usageConfirmed: true, status: "ready" },
        ],
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    expect(result.current.canGenerate).toBe(false);
  });

  it("does not prepare restyle without original art and a style reference", async () => {
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ toolKind: "restyle", request: "" }),
        sources: [
          { id: "source-1", usage: "style", usageConfirmed: false, status: "ready" },
        ],
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1", initialIntent: "restyle" }));

    await act(async () => { await result.current.preparePlan(); });

    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.autosave).not.toHaveBeenCalled();
    expect(result.current.error).toBe("Adicione a arte original e a referência de estilo.");
  });

  it.each(["uploaded", "analyzing"])("reports a %s restyle reference as pending instead of absent", async (status) => {
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ toolKind: "restyle", request: "Preserve a pessoa" }),
        sources: [
          { id: "original", usage: "content", usageConfirmed: true, status: "ready" },
          { id: "style", usage: "style", usageConfirmed: true, status },
        ],
      },
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1", initialIntent: "restyle" }));

    await act(async () => { await result.current.preparePlan(); });

    expect(result.current.request).toBe("Preserve a pessoa");
    expect(result.current.error).toBe("Aguarde a análise da arte terminar antes de gerar.");
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("gives the carousel the current request save command before the debounce fires", async () => {
    const { result } = renderHook(() => useCreativeComposer({ initialIntent: "carousel" }));
    act(() => result.current.setRequest("Pedido escrito agora"));
    const carousel = mocks.carouselController.mock.lastCall![0] as CarouselComposerInput;
    let savedId: string | null = null;

    await act(async () => { savedId = await carousel.flushAutosave(); });

    expect(savedId).toBe(WORK_ID);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      intent: "carousel",
      request: "Pedido escrito agora",
    }));
    expect(carousel.workIdRef.current).toBe(WORK_ID);
    expect(await carousel.resolveCanonicalWorkRevision(WORK_ID)).toEqual(expect.any(String));
    act(() => carousel.setError("Não foi possível organizar o conteúdo"));
    expect(result.current.error).toBe("Não foi possível organizar o conteúdo");
  });

  it("gives carousel planning the saved revision of the latest edit in an existing draft", async () => {
    const initial = workDetail({ id: WORK_ID, toolKind: "carousel" });
    const updatedAt = new Date(Date.parse(initial.work.updatedAt) + 1_000).toISOString();
    mocks.work.mockReturnValue({ data: initial, isLoading: false, isError: false });
    mocks.autosave.mockImplementation(async (input) => ({
      work: { ...initial.work, request: input.request, updatedAt },
    }));
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: WORK_ID, initialIntent: "carousel" }));
    act(() => result.current.setRequest("Edição ainda sem debounce"));
    const carousel = mocks.carouselController.mock.lastCall![0] as CarouselComposerInput;

    await act(async () => { await carousel.flushAutosave(); });

    expect(mocks.autosave).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: WORK_ID,
      request: "Edição ainda sem debounce",
    }));
    expect(await carousel.resolveCanonicalWorkRevision(WORK_ID)).toBe(updatedAt);
    expect(result.current.request).toBe("Edição ainda sem debounce");
  });

  it("persists variation instructions without trimming outer whitespace", async () => {
    mocks.work.mockReturnValue({ data: workDetail({ toolKind: "variations" }), isLoading: false, isError: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    act(() => {
      result.current.setRequest("  - Copy mais direta\n- Novo CTA  ");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(mocks.autosave).toHaveBeenCalledWith(expect.objectContaining({
      request: "  - Copy mais direta\n- Novo CTA  ",
    }));
  });

  it("does not expose the global brand while an existing work is still hydrating", () => {
    mocks.work.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    expect(result.current.clientProfileId).toBeNull();
  });

  it("lets the user pin the displayed 4:5 format while the draft is automatic", () => {
    const { result } = renderHook(() => useCreativeComposer());

    expect(result.current.format).toBe("4:5");
    expect(result.current.formatMode).toBe("auto");

    act(() => result.current.setFormat("4:5"));

    expect(result.current.formatMode).toBe("manual");
  });

  it("derives offered formats from the 3:4 switch plus the current protocol (ICE-04B)", () => {
    const enabled = renderHook(() =>
      useCreativeComposer({ initialIntent: "single", threeFourCreationEnabled: true }),
    );
    expect(enabled.result.current.offeredFormats).toEqual(["1:1", "4:5", "9:16", "3:4"]);
    enabled.unmount();

    const unvalidated = renderHook(() =>
      useCreativeComposer({ initialIntent: "variations", threeFourCreationEnabled: true }),
    );
    expect(unvalidated.result.current.offeredFormats).toEqual(["1:1", "4:5", "9:16"]);
    unvalidated.unmount();

    const disabled = renderHook(() =>
      useCreativeComposer({ initialIntent: "single" }),
    );
    expect(disabled.result.current.offeredFormats).toEqual(["1:1", "4:5", "9:16"]);
    disabled.unmount();
  });

  it("autosaves a format-mode change when the displayed ratio stays the same", async () => {
    mocks.work.mockReturnValue({
      data: workDetail({ settings: { targetFormats: [], formatMode: "auto" } }),
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    act(() => result.current.setFormat("4:5"));
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(mocks.autosave).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-1",
      format: "4:5",
      settings: { targetFormats: [], formatMode: "manual" },
    }));
  });

  it("retries a failed revision only as a fresh paid revision command", async () => {
    const revision = {
      id: "output-v2",
      workspaceId: "ws-1",
      workItemId: "work-1",
      creativeLevel: "balanced" as const,
      targetFormat: "4:5" as const,
      versionNumber: 2,
      parentOutputId: "output-v1",
      revisionInstruction: "Use mais contraste",
      revisionAssetId: "asset-1",
      retryCount: 0,
      operationKey: "revision:00000000-0000-4000-8000-000000000101",
      status: "failed" as const,
      outputKey: null,
      cost: null,
      failureCode: "credit_blocked",
      quality: null,
      isSelected: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mocks.work.mockReturnValue({ data: { ...workDetail(), outputs: [revision] }, isLoading: false, isError: false });
    mocks.reviseOutput.mockResolvedValue({ output: { ...revision, id: "output-v3", status: "queued" } });
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000105");
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(() => result.current.retryRevisionOutput(revision));

    expect(mocks.retryOutput).not.toHaveBeenCalled();
    expect(mocks.reviseOutput).toHaveBeenCalledWith({
      workItemId: "work-1",
      outputId: "output-v1",
      revisionKey: "00000000-0000-4000-8000-000000000105",
      instruction: "Use mais contraste",
      revisionAssetId: "asset-1",
    });
  });

  it.each([
    ["single", { targetFormats: [] }, { unitCount: 1, credits: 50 }],
    ["restyle", { targetFormats: [] }, { unitCount: 1, credits: 50 }],
    ["format_adaptation", { targetFormats: ["1:1", "9:16"] }, { unitCount: 2, credits: 100 }],
  ] as const)("hydrates %s as authoritative without autosaving variations over it", async (toolKind, settings, expectedQuote) => {
    mocks.work.mockReturnValue({ data: workDetail({ toolKind, settings }), isLoading: false, isError: false });
    const { result } = renderHook(() =>
      useCreativeComposer({ initialWorkId: "work-1", initialIntent: "single" })
    );

    expect(result.current.intent).toBe(toolKind);
    expect(result.current.quote).toEqual(expectedQuote);
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(mocks.autosave).not.toHaveBeenCalled();
  });

  it.each([
    ["restyle", { unitCount: 1, credits: 50 }],
    ["single", { unitCount: 1, credits: 50 }],
    ["format_adaptation", { unitCount: 2, credits: 100 }],
  ] as const)("starts a separate %s draft instead of mutating the restored work", async (nextIntent, expectedQuote) => {
    mocks.work.mockReturnValue({ data: workDetail({ toolKind: "variations" }), isLoading: false, isError: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    expect(result.current.intent).toBe("variations");
    expect(result.current.quote).toEqual({ unitCount: 3, credits: 150 });
    await act(async () => Promise.resolve());
    act(() => result.current.selectIntent(nextIntent));
    await act(async () => Promise.resolve());
    expect(result.current.intent).toBe(nextIntent);
    expect(result.current.quote).toEqual(expectedQuote);
    expect(result.current.workId).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(mocks.autosave).not.toHaveBeenCalled();

    await act(() => result.current.addFiles([
      new File(["image"], "nova-arte.png", { type: "image/png" }),
    ]));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      intent: nextIntent,
      settings: nextIntent === "format_adaptation"
        ? { targetFormats: ["1:1", "9:16"], formatMode: "manual" }
        : { targetFormats: [], formatMode: "manual" },
    }));
  });

  it("autosaves an existing work under its stored brand when no global brand is active", async () => {
    mocks.active.mockReturnValue(active({
      profiles: [profileA, profileB], activeProfile: null, activeClientProfileId: null, requiresSelection: true,
    }));
    mocks.work.mockReturnValue({ data: workDetail({ clientProfileId: profileB.id }), isLoading: false, isError: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    act(() => result.current.setRequest("Edição da marca persistida"));
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(mocks.autosave).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-1", request: "Edição da marca persistida",
    }));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps generation disabled while an inline briefing edit is saving", async () => {
    const updatedAt = new Date("2026-07-13T12:00:00.000Z");
    const briefing = {
      version: 1,
      message: { value: "Mensagem", state: "sourced" },
      objective: { value: "Objetivo", state: "sourced" },
      audience: { value: null, state: "unknown" },
      offer: { value: null, state: "unknown" },
      tone: { value: null, state: "unknown" },
      constraints: { value: null, state: "unknown" },
      readiness: "exploratory" as const,
      confidence: "low" as const,
    };
    const factPack = {
      version: 1,
      request: "Pedido salvo",
      facts: [],
      brand: { requiredElements: [], prohibitedElements: [] },
      identity: { clientProfileId: profileA.id, brandName: "Marca A", brandAuthority: "active" as const },
    };
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({
          toolKind: "single",
          request: "Pedido salvo",
          updatedAt,
          settings: { targetFormats: [], briefingOverrides: {}, briefingVersion: 1 },
          inputSnapshot: {
            request: "Pedido salvo",
            settings: { targetFormats: [], briefingOverrides: {}, briefingVersion: 1 },
            sources: [],
            inferredBriefing: briefing,
            factPack,
          },
        }),
        inferredBriefing: briefing,
        briefingFactPack: factPack,
        sources: [],
      },
      isLoading: false,
      isError: false,
    });
    const pending = deferred<{
      work: ReturnType<typeof workDetail>["work"];
      briefing: typeof briefing;
      briefingFactPack: typeof factPack;
      briefingOverrides: { audience: string };
      briefingVersion: number;
    }>();
    mocks.editBriefing.mockReturnValueOnce(pending.promise);

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.inferredBriefing).toEqual(briefing);

    let edit!: Promise<void>;
    act(() => { edit = result.current.editBriefingField("audience", "Professores"); });
    expect(mocks.editBriefing).toHaveBeenCalledWith({
      workItemId: "work-1",
      field: "audience",
      value: "Professores",
      expectedUpdatedAt: updatedAt.toISOString(),
    });
    expect(result.current.briefingEditState).toBe("saving");
    expect(result.current.canGenerate).toBe(false);

    pending.resolve({
      work: workDetail().work,
      briefing,
      briefingFactPack: factPack,
      briefingOverrides: { audience: "Professores" },
      briefingVersion: 2,
    });
    await act(async () => { await edit; });
    expect(result.current.briefingEditState).toBe("saved");
  });

  it("waits for create A, persists latest B, then prepares and generates", async () => {
    const createA = deferred<{ work: ReturnType<typeof workDetail>["work"]; quote: { unitCount: number; credits: number } }>();
    mocks.create.mockReturnValueOnce(createA.promise);
    const { result } = renderHook(() => useCreativeComposer());
    act(() => result.current.setRequest("Pedido A"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ request: "Pedido A" }));

    act(() => result.current.setRequest("Pedido B"));
    let generation!: Promise<void>;
    act(() => { generation = result.current.generateLegacy(); });
    expect(mocks.prepare).not.toHaveBeenCalled();

    createA.resolve({
      work: { ...workDetail().work, id: WORK_ID, request: "Pedido A", toolKind: "variations" },
      quote: { unitCount: 3, credits: 150 },
    });
    await act(async () => { await generation; });

    expect(mocks.autosave).toHaveBeenCalledWith(expect.objectContaining({ request: "Pedido B" }));
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.autosave.mock.invocationCallOrder[0]).toBeLessThan(mocks.prepare.mock.invocationCallOrder[0]);
    expect(mocks.prepare.mock.invocationCallOrder[0]).toBeLessThan(mocks.generate.mock.invocationCallOrder[0]);
  });

  it("patches B before paid work when a replayed create returns persisted A", async () => {
    const lostResponse = deferred<never>();
    mocks.create
      .mockReturnValueOnce(lostResponse.promise)
      .mockResolvedValueOnce({
        work: { ...workDetail().work, id: WORK_ID, request: "Pedido A", toolKind: "variations" },
        quote: { unitCount: 3, credits: 150 },
      });
    const { result } = renderHook(() => useCreativeComposer());

    act(() => result.current.setRequest("Pedido A"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    act(() => result.current.setRequest("Pedido B"));
    lostResponse.reject(new Error("response lost after commit"));
    await act(async () => { await Promise.resolve(); });

    await act(async () => { await result.current.generateLegacy(); });

    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.autosave).toHaveBeenCalledWith(expect.objectContaining({ request: "Pedido B" }));
    expect(mocks.autosave.mock.invocationCallOrder[0]).toBeLessThan(mocks.prepare.mock.invocationCallOrder[0]);
  });

  it("serializes autosaves and never starts B before A settles", async () => {
    const saveA = deferred<{ work: ReturnType<typeof workDetail>["work"] }>();
    const saveB = deferred<{ work: ReturnType<typeof workDetail>["work"] }>();
    mocks.autosave.mockReturnValueOnce(saveA.promise).mockReturnValueOnce(saveB.promise);
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false, isError: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    act(() => result.current.setRequest("Pedido A"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    act(() => result.current.setRequest("Pedido B"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(mocks.autosave).toHaveBeenCalledTimes(1);

    saveA.resolve({ work: { ...workDetail().work, updatedAt: "2026-08-30T12:00:00.001Z" } });
    await act(async () => { await Promise.resolve(); });
    expect(mocks.autosave).toHaveBeenCalledTimes(2);
    expect(mocks.autosave).toHaveBeenLastCalledWith(expect.objectContaining({ request: "Pedido B" }));
    saveB.resolve({ work: { ...workDetail().work, updatedAt: "2026-08-30T12:00:00.002Z" } });
    await act(async () => { await Promise.resolve(); });
  });

  it("flushes autosave and submits paid generation only once", async () => {
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    expect(result.current.request).toBe("Pedido salvo");
    act(() => result.current.setRequest("Pedido mais recente"));

    await act(async () => {
      await Promise.all([result.current.generateLegacy(), result.current.generateLegacy()]);
    });

    expect(mocks.autosave).toHaveBeenCalledOnce();
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.autosave.mock.invocationCallOrder[0]).toBeLessThan(mocks.generate.mock.invocationCallOrder[0]);
  });

  it("prepares a plan without confirming generation", async () => {
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    let plan!: Awaited<ReturnType<typeof result.current.preparePlan>>;
    await act(async () => { plan = await result.current.preparePlan(); });

    expect(plan).toEqual(expect.objectContaining({ preparedRevision: "2026-08-30T12:00:00.000Z" }));
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("confirms only the supplied prepared revision", async () => {
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.confirmGeneration("2026-08-30T12:00:00.000Z"); });

    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-1",
      preparedRevision: "2026-08-30T12:00:00.000Z",
    }));
  });

  it("notifies an accepted generation once and never on prepare alone", async () => {
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false });
    const onGenerationAccepted = vi.fn();
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1", onGenerationAccepted }));

    await act(async () => { await result.current.preparePlan(); });
    expect(onGenerationAccepted).not.toHaveBeenCalled();

    await act(async () => { await result.current.confirmGeneration("2026-08-30T12:00:00.000Z"); });
    expect(onGenerationAccepted).toHaveBeenCalledOnce();
  });

  it("does not notify acceptance when confirmation is blocked", async () => {
    mocks.work.mockReturnValue({ data: { ...workDetail(), preparedPlan: null }, isLoading: false });
    const onGenerationAccepted = vi.fn();
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1", onGenerationAccepted }));

    await act(async () => { await result.current.confirmGeneration(); });

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(onGenerationAccepted).not.toHaveBeenCalled();
    expect(result.current.error).toBe("Revise o plano antes de gerar.");
  });

  it("does not confirm when the prepared plan is missing", async () => {
    mocks.work.mockReturnValue({ data: { ...workDetail(), preparedPlan: null }, isLoading: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.confirmGeneration(); });

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(result.current.error).toBe("Revise o plano antes de gerar.");
  });

  it("keeps the prepared briefing available to the Home surface", async () => {
    const briefing = {
      version: 1,
      message: { value: "Pedido salvo", state: "sourced" },
      objective: { value: "Gerar interesse", state: "inferred", confidence: "medium" },
      audience: { value: null, state: "unknown" },
      offer: { value: null, state: "unknown" },
      tone: { value: "Direto", state: "sourced" },
      constraints: { value: null, state: "unknown" },
      readiness: "exploratory",
      confidence: "low",
    } as const;
    const briefingFactPack = {
      version: 1,
      request: "Pedido salvo",
      facts: [{ value: "Pedido salvo", class: "text", required: true, origin: "request" }],
      brand: { requiredElements: [], prohibitedElements: [] },
      identity: { clientProfileId: profileA.id, brandName: "Marca A", brandAuthority: "active" },
    } as const;
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false });
    mocks.prepare.mockResolvedValue({
      work: workDetail().work,
      quote: { unitCount: 3, credits: 150 },
      preparedPlan: preparedPlan(),
      briefing,
      briefingFactPack,
      readiness: briefing.readiness,
      confidence: briefing.confidence,
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.generateLegacy(); });

    expect(result.current.inferredBriefing).toEqual(briefing);
    expect(result.current.briefingFactPack).toEqual(briefingFactPack);
  });

  it("shows a blocked briefing and disables paid generation until the request changes", async () => {
    const briefing = {
      version: 1,
      message: { value: null, state: "unknown" },
      objective: { value: null, state: "unknown" },
      audience: { value: null, state: "unknown" },
      offer: { value: null, state: "unknown" },
      tone: { value: null, state: "unknown" },
      constraints: { value: null, state: "unknown" },
      readiness: "blocked",
      confidence: "high",
    } as const;
    const factPack = {
      version: 1,
      request: "Pedido salvo",
      facts: [],
      brand: { requiredElements: [], prohibitedElements: [] },
      identity: { clientProfileId: profileA.id, brandName: "Marca A", brandAuthority: "active" },
    } as const;
    mocks.work.mockReturnValue({ data: workDetail({ toolKind: "single" }), isLoading: false });
    mocks.prepare.mockRejectedValue(Object.assign(new Error("Direção insuficiente"), {
      code: "briefing_blocked",
      details: { reason: "missing_direction", readiness: "blocked", confidence: "high", briefing, factPack },
    }));

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1", initialIntent: "single" }));

    await act(async () => { await result.current.generateLegacy(); });

    expect(result.current.inferredBriefing).toEqual(briefing);
    expect(result.current.canGenerate).toBe(false);
    expect(mocks.generate).not.toHaveBeenCalled();

    act(() => { result.current.setRequest("Nova direção segura"); });
    expect(result.current.inferredBriefing).toBeNull();
  });

  it("reconciles an uncertain generation response before showing an error", async () => {
    const refetch = vi.fn().mockResolvedValue({ data: {
      ...workDetail({ status: "generating" }),
      outputs: [{ status: "queued" }],
    } });
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false, refetch });
    mocks.generate.mockRejectedValue(Object.assign(new Error("request timed out"), { name: "TimeoutError" }));
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.generateLegacy(); });

    expect(refetch).toHaveBeenCalledOnce();
    expect(result.current.error).toBeNull();
    expect(result.current.announcement).toContain("Geração aceita");
  });

  it("does not treat a prepared work without outputs as an accepted generation", async () => {
    const refetch = vi.fn().mockResolvedValue({ data: {
      ...workDetail({ status: "ready" }),
      outputs: [],
    } });
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false, refetch });
    mocks.generate.mockRejectedValue(Object.assign(new Error("request timed out"), { name: "TimeoutError" }));
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.generateLegacy(); });

    expect(refetch).toHaveBeenCalledOnce();
    expect(result.current.announcement).not.toContain("Geração aceita");
    expect(result.current.error).toBe("A geração não foi confirmada. Tente gerar novamente.");
  });

  it("resumes a prepared work without outputs straight at generation, without preparing again", async () => {
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ status: "ready" }),
        sources: [{ id: "source-1", status: "ready" }],
        outputs: [],
      },
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    await act(async () => Promise.resolve());

    expect(result.current.canGenerate).toBe(true);
    await act(async () => { await result.current.generateLegacy(); });

    expect(mocks.autosave).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-1",
      preparedRevision: "2026-08-30T12:00:00.000Z",
    }));
    expect(result.current.announcement).toContain("Geração iniciada");
  });

  it("keeps a hydrated progressive ready plan visible and confirms its existing revision", async () => {
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ status: "ready" }),
        sources: [{ id: "source-1", status: "ready" }],
        outputs: [],
      },
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1", workflowVariant: "progressive" }));
    await act(async () => Promise.resolve());

    expect(result.current.preparedPlan?.preparedRevision).toBe("2026-08-30T12:00:00.000Z");
    expect(result.current.canConfirm).toBe(true);
    await act(async () => { await result.current.confirmGeneration("2026-08-30T12:00:00.000Z"); });

    expect(mocks.autosave).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-1",
      preparedRevision: "2026-08-30T12:00:00.000Z",
    }));
  });

  it("does not revalidate a hydrated progressive plan after a local edit", async () => {
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ status: "ready" }),
        sources: [{ id: "source-1", status: "ready" }],
        outputs: [],
      },
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1", workflowVariant: "progressive" }));
    await act(async () => Promise.resolve());

    act(() => result.current.setRequest("Pedido alterado após retomar"));

    expect(result.current.preparedPlan).toBeNull();
    expect(result.current.canConfirm).toBe(false);
  });

  it("reopens an edited hydrated progressive retry before preparing and confirming a new revision", async () => {
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ status: "ready" }),
        sources: [{ id: "source-1", status: "ready" }],
        outputs: [],
      },
      isLoading: false,
      isError: false,
    });
    const refreshedPlan = { ...preparedPlan(), preparedRevision: "2026-08-30T12:01:00.000Z" };
    mocks.prepare.mockResolvedValue({
      work: { ...workDetail().work, request: "Pedido revisado", updatedAt: new Date(refreshedPlan.preparedRevision) },
      quote: { unitCount: 3, credits: 150 },
      preparedPlan: refreshedPlan,
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1", workflowVariant: "progressive" }));
    await act(async () => Promise.resolve());

    act(() => result.current.setRequest("Pedido revisado"));
    await act(async () => { await result.current.confirmGeneration("2026-08-30T12:00:00.000Z"); });

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(result.current.canConfirm).toBe(false);

    let plan: Awaited<ReturnType<typeof result.current.preparePlan>>;
    await act(async () => { plan = await result.current.preparePlan(); });

    expect(mocks.autosave).toHaveBeenCalledWith(expect.objectContaining({ workItemId: "work-1", request: "Pedido revisado" }));
    expect(mocks.prepare).toHaveBeenCalledWith({ workItemId: "work-1" });
    expect(plan?.preparedRevision).toBe(refreshedPlan.preparedRevision);

    await act(async () => { await result.current.confirmGeneration(plan?.preparedRevision); });

    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-1", preparedRevision: refreshedPlan.preparedRevision,
    }));
  });

  it("does not autosave a format inferred by prepare while generation starts", async () => {
    mocks.work.mockReturnValue({
      data: {
        ...workDetail({ toolKind: "restyle", format: "4:5", settings: { targetFormats: [], formatMode: "auto" } }),
        sources: [
          { id: "content", usage: "content", status: "ready" },
          { id: "style", usage: "style", status: "ready" },
        ],
      },
      isLoading: false,
      isError: false,
    });
    mocks.prepare.mockResolvedValue({
      work: workDetail({
        toolKind: "restyle",
        format: "9:16",
        settings: { targetFormats: [], formatMode: "auto" },
      }).work,
      quote: { unitCount: 1, credits: 50 },
      preparedPlan: preparedPlan("work-1", "restyle"),
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.generateLegacy(); });
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(result.current.format).toBe("9:16");
    expect(mocks.autosave).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledOnce();
  });

  it("keeps an auto-inferred progressive plan confirmable without preparing twice", async () => {
    mocks.work.mockReturnValue({
      data: workDetail({ format: "4:5", settings: { targetFormats: [], formatMode: "auto" } }),
      isLoading: false,
      isError: false,
    });
    mocks.prepare.mockResolvedValue({
      work: workDetail({ format: "9:16", settings: { targetFormats: [], formatMode: "auto" } }).work,
      quote: { unitCount: 1, credits: 50 },
      preparedPlan: preparedPlan(),
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1", workflowVariant: "progressive" }));

    let plan!: Awaited<ReturnType<typeof result.current.preparePlan>>;
    await act(async () => { plan = await result.current.preparePlan(); });
    expect(plan?.preparedRevision).toBe("2026-08-30T12:00:00.000Z");
    await act(async () => { await result.current.confirmGeneration(plan?.preparedRevision); });

    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ preparedRevision: plan?.preparedRevision }));
  });

  it("invalidates a progressive plan when its inputs change while prepare is pending", async () => {
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false, isError: false });
    const pending = deferred<{ work: ReturnType<typeof workDetail>["work"]; quote: { unitCount: number; credits: number }; preparedPlan: ReturnType<typeof preparedPlan> }>();
    mocks.prepare.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1", workflowVariant: "progressive" }));

    let preparation!: Promise<unknown>;
    act(() => { preparation = result.current.preparePlan(); });
    act(() => result.current.setRequest("Pedido alterado durante preparo"));
    pending.resolve({ work: workDetail().work, quote: { unitCount: 3, credits: 150 }, preparedPlan: preparedPlan() });
    await act(async () => { await preparation; });

    expect(result.current.preparedPlan).toBeNull();
    expect(result.current.canConfirm).toBe(false);
    await act(async () => { await result.current.confirmGeneration("2026-08-30T12:00:00.000Z"); });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("invalidates a progressive plan when accepted direction suggestions land during prepare", async () => {
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false, isError: false });
    const pending = deferred<{ work: ReturnType<typeof workDetail>["work"]; quote: { unitCount: number; credits: number }; preparedPlan: ReturnType<typeof preparedPlan> }>();
    mocks.prepare.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1", workflowVariant: "progressive" }));
    const suggestions = [{
      id: "00000000-0000-4000-8000-0000000000e1",
      label: "Direção nova",
      instruction: "Uma direção nova",
      order: 1,
      safetyBand: "safe" as const,
      provenance: "ai-suggestion" as const,
    }];

    let preparation!: Promise<unknown>;
    act(() => { preparation = result.current.preparePlan(); });
    act(() => result.current.applyDirectionSuggestions(suggestions, false));
    pending.resolve({ work: workDetail().work, quote: { unitCount: 1, credits: 50 }, preparedPlan: preparedPlan() });
    await act(async () => { await preparation; });

    expect(result.current.preparedPlan).toBeNull();
    expect(result.current.canConfirm).toBe(false);
    await act(async () => { await result.current.confirmGeneration("2026-08-30T12:00:00.000Z"); });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("invalidates a progressive plan when automatic format is restored during prepare", async () => {
    mocks.work.mockReturnValue({
      data: workDetail({ settings: { targetFormats: [], formatMode: "manual" } }),
      isLoading: false,
      isError: false,
    });
    const pending = deferred<{ work: ReturnType<typeof workDetail>["work"]; quote: { unitCount: number; credits: number }; preparedPlan: ReturnType<typeof preparedPlan> }>();
    mocks.prepare.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1", workflowVariant: "progressive" }));

    let preparation!: Promise<unknown>;
    act(() => { preparation = result.current.preparePlan(); });
    act(() => result.current.setFormatAuto());
    pending.resolve({ work: workDetail().work, quote: { unitCount: 3, credits: 150 }, preparedPlan: preparedPlan() });
    await act(async () => { await preparation; });

    expect(result.current.preparedPlan).toBeNull();
    expect(result.current.canConfirm).toBe(false);
    await act(async () => { await result.current.confirmGeneration("2026-08-30T12:00:00.000Z"); });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("keeps the non-blocking brand training suggestion returned by generation", async () => {
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false });
    mocks.generate.mockResolvedValue({
      work: { status: "generating" }, outputs: [],
      brandTrainingSuggestion: "missing_visual_references",
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.generateLegacy(); });

    expect(result.current.brandTrainingSuggestion).toBe("missing_visual_references");
  });

  it("restores the brand training suggestion from the persisted identity snapshot", () => {
    mocks.work.mockReturnValue({
      data: workDetail({ status: "generating", identitySnapshot: { assets: [] } }),
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    expect(result.current.brandTrainingSuggestion).toBe("missing_visual_references");
  });

  it("persists the latest edit when an existing draft unmounts before debounce", async () => {
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false, isError: false });
    const { result, unmount } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    act(() => result.current.setRequest("Última edição"));
    unmount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(mocks.autosave).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-1", request: "Última edição",
    }));
  });

  it("does not flush an existing work that unmounts before its GET hydrates", async () => {
    mocks.work.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { unmount } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    unmount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(mocks.autosave).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("hydrates a deferred existing work, then persists its latest edit on unmount", async () => {
    let query = { data: undefined as ReturnType<typeof workDetail> | undefined, isLoading: true, isError: false };
    mocks.work.mockImplementation(() => query);
    const { result, rerender, unmount } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    query = { data: workDetail(), isLoading: false, isError: false };
    rerender();
    act(() => result.current.setRequest("Edição após hidratar"));
    unmount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(mocks.autosave).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-1", request: "Edição após hidratar",
    }));
  });

  it("creates the latest non-empty draft when it unmounts before debounce", async () => {
    const { result, unmount } = renderHook(() => useCreativeComposer());

    act(() => result.current.setRequest("Último rascunho"));
    unmount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ request: "Último rascunho" }));
  });

  it("does not create an empty draft when it unmounts before debounce", async () => {
    const { unmount } = renderHook(() => useCreativeComposer());
    unmount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("does not persist during StrictMode's synthetic cleanup", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { unmount } = renderHook(() => useCreativeComposer(), { wrapper });
    await act(async () => { await Promise.resolve(); });

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.autosave).not.toHaveBeenCalled();
    unmount();
  });

  it("disables generate while a source is still uploaded or analyzing", () => {
    mocks.work.mockReturnValue({
      data: {
        work: workDetail().work,
        outputs: [],
        sources: [{ id: "source-1", status: "uploaded", usage: "both" }],
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    expect(result.current.state).toBe("analyzing");
    expect(result.current.canGenerate).toBe(false);
  });

  it("blocks generation while a piece-source mutation is in flight", async () => {
    mocks.sourcePending.mockReturnValue(true);
    mocks.work.mockReturnValue({ data: workDetail({ toolKind: "single" }), isLoading: false, isError: false });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1", initialIntent: "single" }));

    expect(result.current.canGenerate).toBe(false);
    await act(async () => { await result.current.generateLegacy(); });
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("blocks generation from the instant a replacement upload begins until its source mutation settles", async () => {
    const upload = deferred<{ assetId: string; name: string }>();
    mocks.upload.mockReturnValue(upload.promise);
    mocks.work.mockReturnValue({
      data: {
        work: workDetail({ toolKind: "single" }).work,
        outputs: [],
        sources: [{ id: "source-1", assetId: "asset-old", status: "ready", usage: "both", pieceReference: { category: "style_reference", confidence: "high" } }],
      },
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1", initialIntent: "single" }));

    let replacing!: Promise<boolean>;
    act(() => { replacing = result.current.replacePieceReference("source-1", new File(["png"], "replacement.png", { type: "image/png" })); });
    expect(result.current.canGenerate).toBe(false);
    await act(async () => {
      await result.current.preparePlan();
      await result.current.confirmGeneration("2026-08-30T12:00:00.000Z");
      await result.current.generateLegacy();
    });
    expect(mocks.prepare).not.toHaveBeenCalled();
    upload.resolve({ assetId: "asset-new", name: "replacement.png" });
    await act(async () => { await replacing; });
    expect(mocks.source).toHaveBeenCalledWith(expect.objectContaining({ workItemId: "work-1", action: "replacePieceReference", sourceId: "source-1", assetId: "asset-new" }));
  });

  it("blocks generate() before prepare when sources are pending analysis", async () => {
    mocks.work.mockReturnValue({
      data: {
        work: workDetail().work,
        outputs: [],
        sources: [{ id: "source-1", status: "uploaded", usage: "both" }],
      },
      isLoading: false,
      isError: false,
    });
    mocks.autosave.mockResolvedValue({ work: workDetail().work });

    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => {
      await result.current.generateLegacy();
    });

    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/análise/i);
  });

  it("surfaces a prepare 422 brand_conflict as a choice, never as a generic error (R-008)", async () => {
    mocks.work.mockReturnValue({
      data: { ...workDetail({ toolKind: "restyle" }), sources: restyleSources() },
      isLoading: false,
    });
    mocks.prepare.mockRejectedValue(Object.assign(new Error("Conflito de marca"), {
      code: "brand_conflict",
      details: { detectedBrand: "XTB", activeBrand: "Marca A", sourceId: "src-1", choices: ["source", "active"] },
    }));
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.generateLegacy(); });

    expect(result.current.brandConflict).toEqual({
      detectedBrand: "XTB", activeBrand: "Marca A", sourceId: "src-1", choices: ["source", "active"],
    });
    expect(result.current.error).toBeNull();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("keeps a prepare failure without conflict payload as a generic error", async () => {
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false });
    mocks.prepare.mockRejectedValue(Object.assign(new Error("Contexto inválido"), {
      code: "invalid_context",
      details: { violations: ["preço sem origem"] },
    }));
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.generateLegacy(); });

    expect(result.current.brandConflict).toBeNull();
    expect(result.current.error).toBe("Contexto inválido");
  });

  it("saves the brand choice on the same draft and resumes the interrupted submit (R-008)", async () => {
    const detail = { ...workDetail({ toolKind: "restyle" }), sources: restyleSources() };
    mocks.work.mockReturnValue({ data: detail, isLoading: false });
    mocks.prepare
      .mockRejectedValueOnce(Object.assign(new Error("Conflito de marca"), {
        code: "brand_conflict",
        details: { detectedBrand: "XTB", activeBrand: "Marca A", sourceId: "src-1", choices: ["source", "active"] },
      }))
      .mockResolvedValueOnce({
        work: { ...workDetail().work, format: "4:5" },
        quote: { unitCount: 1, credits: 50 },
        preparedPlan: preparedPlan("work-1", "restyle"),
      });
    mocks.generate.mockResolvedValue({ work: { status: "generating" }, outputs: [], brandTrainingSuggestion: null });
    mocks.resolveBrandConflict.mockResolvedValue({ work: { ...detail.work, updatedAt: "2026-08-31T15:00:00.001Z" } });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.generateLegacy(); });
    expect(result.current.brandConflict).not.toBeNull();
    expect(mocks.generate).not.toHaveBeenCalled();

    await act(async () => { await result.current.resolveBrandConflict("source"); });

    // The choice persisted on the SAME draft (no create) and the interrupted
    // submit resumed: prepare ran again and generation was dispatched.
    expect(mocks.resolveBrandConflict).toHaveBeenCalledWith({
      workItemId: "work-1",
      choice: "source",
      expectedUpdatedAt: new Date(detail.work.updatedAt).toISOString(),
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.prepare).toHaveBeenCalledTimes(2);
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(result.current.brandConflict).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("ignores a second brand choice while the first is still applying (double-click guard)", async () => {
    mocks.work.mockReturnValue({ data: { ...workDetail({ toolKind: "restyle" }), sources: restyleSources() }, isLoading: false });
    mocks.prepare.mockRejectedValue(Object.assign(new Error("Conflito de marca"), {
      code: "brand_conflict",
      details: { detectedBrand: "XTB", activeBrand: "Marca A", sourceId: "src-1", choices: ["source", "active"] },
    }));
    mocks.resolveBrandConflictPending.mockReturnValue(true);
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.generateLegacy(); });
    await act(async () => { await result.current.resolveBrandConflict("active"); });

    // A choice already in flight (isPending) drops the repeated command.
    expect(mocks.resolveBrandConflict).not.toHaveBeenCalled();
  });

  it("ignores resolveBrandConflict when there is no pending conflict", async () => {
    mocks.work.mockReturnValue({ data: workDetail({ toolKind: "restyle" }), isLoading: false });
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));

    await act(async () => { await result.current.resolveBrandConflict("active"); });

    expect(mocks.resolveBrandConflict).not.toHaveBeenCalled();
  });

  it("treats typed Layerize dispatch rejection as uncertain without replacing the operation id", async () => {
    mocks.work.mockReturnValue({ data: workDetail(), isLoading: false });
    mocks.layerizeOutput.mockRejectedValue(Object.assign(new Error("dispatch"), { code: "creativeWorkLayerizationDispatchFailed" }));
    const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
    let outcome: unknown;
    await act(async () => { outcome = await result.current.layerizeOutput("output-1", false, "persisted-op"); });
    expect(outcome).toBe("uncertain");
    expect(mocks.layerizeOutput).toHaveBeenCalledWith(expect.objectContaining({ workItemId: "work-1", outputId: "output-1", operationId: "persisted-op" }));
  });
});
