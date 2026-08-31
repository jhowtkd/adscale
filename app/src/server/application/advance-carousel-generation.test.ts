import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreativeWorkCarouselSlide, CreativeWorkItem } from "@/server/db/schema";
import type {
  CarouselDeckPlanV1,
  CarouselSlideStatus,
  CarouselVisualContractV1,
} from "@/server/creative-work/carousel-contracts";

const repo = vi.hoisted(() => ({
  getCreativeWork: vi.fn(),
  materializeCarouselSlides: vi.fn(),
  refreshCarouselWorkStatus: vi.fn(),
}));
const carouselRepo = vi.hoisted(() => ({
  listCurrentCarouselSlides: vi.fn(),
  queueCarouselSlide: vi.fn(),
  setRemainingCarouselAnchorKey: vi.fn(),
}));
const paywall = vi.hoisted(() => ({
  checkSpend: vi.fn(),
  spend: vi.fn(),
}));
const credits = vi.hoisted(() => ({
  refundCredits: vi.fn(),
  recordUsage: vi.fn(),
}));
const usageRepo = vi.hoisted(() => ({
  getUsageByIdempotencyKey: vi.fn(),
  trackUsage: vi.fn(),
}));
const send = vi.hoisted(() => vi.fn());
const analytics = vi.hoisted(() => ({
  recordBetaAnalyticsEvent: vi.fn(),
}));
const visuals = vi.hoisted(() => ({
  buildCarouselAnchorBoard: vi.fn(),
  buildCarouselContactSheet: vi.fn(),
  reviewCarouselSet: vi.fn(),
}));
const storage = vi.hoisted(() => ({
  objectStorage: { get: vi.fn(), put: vi.fn() },
}));
const dbState = vi.hoisted(() => ({ updateRows: [] as unknown[] }));
const dbMock = vi.hoisted(() => {
  const chain = {
    update: vi.fn(() => chain),
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(dbState.updateRows.shift() ?? [])),
  };
  return chain;
});

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: repo.getCreativeWork,
}));
vi.mock("@/server/repositories/creative-work-carousel", () => ({
  listCurrentCarouselSlides: carouselRepo.listCurrentCarouselSlides,
  queueCarouselSlide: carouselRepo.queueCarouselSlide,
  setRemainingCarouselAnchorKey: carouselRepo.setRemainingCarouselAnchorKey,
  materializeCarouselSlides: repo.materializeCarouselSlides,
  refreshCarouselWorkStatus: repo.refreshCarouselWorkStatus,
}));
vi.mock("@/server/billing/paywall", () => ({
  checkSpend: paywall.checkSpend,
  spend: paywall.spend,
}));
vi.mock("@/server/billing/credits", () => credits);
vi.mock("@/server/repositories/usage", () => usageRepo);
vi.mock("@/server/jobs/client", () => ({ inngest: { send } }));
vi.mock("@/server/beta-analytics/record", () => analytics);
vi.mock("@/server/creative-work/carousel-visual", () => visuals);
vi.mock("@/server/storage", () => storage);
vi.mock("@/server/db", () => ({ db: dbMock }));

import { dispatchNextCarouselStage } from "./advance-carousel-generation";
import { generateCarouselWork } from "./generate-carousel-work";

const UNIT = 50;
const PREPARED_REVISION = "prep-1";
const ANCHOR_BOARD_KEY = `creative-work/work-1/carousel/${PREPARED_REVISION}/anchor-board.png`;

const dispatches: Array<{ id: string; name: string; data: Record<string, unknown> }> = [];
let slides: CreativeWorkCarouselSlide[];
let queuedOnce = new Set<string>();
let workQuality: Record<string, unknown> | null;

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

function deckFixture(slideCount = 5): CarouselDeckPlanV1 {
  const roles = ["hook", "context", "problem", "argument", "closing", "evidence", "method", "cta"] as const;
  return {
    version: 1,
    revision: "deck-r1",
    workId: "work-1",
    objective: "Divulgar o grupo de terapia",
    audience: null,
    tone: null,
    promise: "Grupo de terapia em agosto",
    format: "4:5",
    slides: Array.from({ length: slideCount }, (_, index) => ({
      slideId: `slide-${index + 1}`,
      position: index + 1,
      role: roles[index],
      purpose: `Propósito ${index + 1}`,
      primaryText: `Texto primário ${index + 1} do grupo de terapia`,
      secondaryText: null,
      authority: "ai_proposal" as const,
      sourceFactIds: [],
      layoutFamily: index === 0 ? "impact" : index === slideCount - 1 ? "respite" : "development",
    })),
  };
}

function carouselSlideRow(
  overrides: Partial<CreativeWorkCarouselSlide>,
): CreativeWorkCarouselSlide {
  return {
    id: "slide-1",
    workspaceId: "workspace-1",
    workItemId: "work-1",
    lineageId: "lineage-1",
    parentSlideId: null,
    versionNumber: 1,
    deckRevision: "deck-r1",
    position: 1,
    role: "hook",
    primaryText: "Gancho exato",
    secondaryText: null,
    copyAuthority: "ai_proposal",
    sourceFactIds: [],
    layoutFamily: "impact",
    status: "draft",
    providerBaseKey: null,
    outputKey: null,
    previewKey: null,
    visualContractHash: "contract-hash-1",
    anchorKey: null,
    generationOperationKey: "deck-r1:slide-1",
    errorCode: null,
    quality: null,
    isCurrent: true,
    createdAt: new Date("2026-08-30T10:00:00.000Z"),
    queuedAt: null,
    terminalAt: null,
    updatedAt: new Date("2026-08-30T10:00:00.000Z"),
    ...overrides,
  } as CreativeWorkCarouselSlide;
}

function slideRow(position: number, status: CarouselSlideStatus): CreativeWorkCarouselSlide {
  return carouselSlideRow({
    id: `slide-${position}`,
    position,
    status,
    ...(status === "completed"
      ? { providerBaseKey: `base-${position}`, outputKey: `out-${position}`, quality: { objectivePassed: true } }
      : {}),
    ...(status === "failed" ? { errorCode: "objective_failed" } : {}),
  });
}

function workFixture() {
  return {
    work: {
      id: "work-1",
      workspaceId: "workspace-1",
      toolKind: "carousel",
      status: "generating",
      clientProfileId: "profile-1",
      createdByUserId: "user-1",
      carouselQuality: workQuality,
      inputSnapshot: {
        carousel: {
          version: 1,
          preparedRevision: PREPARED_REVISION,
          deck: deckFixture(5),
          visualContract: visualContractFixture(),
        },
      },
    } as CreativeWorkItem,
    outputs: [],
    sources: [],
  };
}

function resetDeck(statuses: Record<number, CarouselSlideStatus> = {}) {
  slides = [1, 2, 3, 4, 5].map((position) => slideRow(position, statuses[position] ?? "draft"));
  queuedOnce = new Set();
  dispatches.length = 0;
  workQuality = null;
}

function completeSlide(position: number) {
  slides = slides.map((slide) =>
    slide.position === position
      ? {
          ...slide,
          status: "completed" as const,
          providerBaseKey: `base-${position}`,
          outputKey: `out-${position}`,
          quality: { objectivePassed: true },
        }
      : slide,
  );
}

function failSlide(position: number) {
  slides = slides.map((slide) =>
    slide.position === position
      ? { ...slide, status: "failed" as const, errorCode: "objective_failed" }
      : slide,
  );
}

const stageInput = { workspaceId: "workspace-1", workItemId: "work-1", userId: "user-1" };
const generateInput = { ...stageInput, preparedRevision: PREPARED_REVISION };

describe("dispatchNextCarouselStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDeck();
    dbState.updateRows.length = 0;
    paywall.checkSpend.mockResolvedValue({ allowed: true, amount: 5 * UNIT, balance: 10_000 });
    paywall.spend.mockResolvedValue({ ok: true, creditsSpent: UNIT });
    credits.refundCredits.mockResolvedValue({ status: "refunded" });
    usageRepo.trackUsage.mockResolvedValue({ id: "usage-ack" });
    usageRepo.getUsageByIdempotencyKey.mockImplementation(
      async (_workspaceId: string, idempotencyKey: string) =>
        idempotencyKey.endsWith(":dispatch-refund")
          ? null
          : {
              idempotencyKey,
              metadata: {
                settlementDispatchAckRequired: true,
                settlementDispatchAckKey: `${idempotencyKey}:dispatch-ack`,
              },
            },
    );
    send.mockImplementation(async (event: { id: string; name: string; data: Record<string, unknown> }) => {
      dispatches.push(event);
    });
    analytics.recordBetaAnalyticsEvent.mockResolvedValue({ id: "analytics-1" });
    visuals.buildCarouselAnchorBoard.mockResolvedValue(Buffer.from("anchor-board"));
    visuals.buildCarouselContactSheet.mockResolvedValue(Buffer.from("contact-sheet"));
    visuals.reviewCarouselSet.mockResolvedValue(["aviso-1"]);
    storage.objectStorage.get.mockResolvedValue(Buffer.from("png-bytes"));
    storage.objectStorage.put.mockResolvedValue(undefined);
    repo.getCreativeWork.mockImplementation(async () => workFixture());
    repo.materializeCarouselSlides.mockImplementation(async () => [...slides]);
    repo.refreshCarouselWorkStatus.mockImplementation(async () => workFixture().work);
    carouselRepo.listCurrentCarouselSlides.mockImplementation(async () => [...slides]);
    carouselRepo.setRemainingCarouselAnchorKey.mockImplementation(
      async (input: { slideIds: string[]; anchorKey: string }) => {
        const updated: CreativeWorkCarouselSlide[] = [];
        slides = slides.map((slide) => {
          if (input.slideIds.includes(slide.id) && slide.anchorKey === null) {
            const row = { ...slide, anchorKey: input.anchorKey };
            updated.push(row);
            return row;
          }
          return slide;
        });
        return updated;
      },
    );
    carouselRepo.queueCarouselSlide.mockImplementation(
      async (input: { slideId: string; anchorKey: string | null; operationKey: string }) => {
        if (queuedOnce.has(input.slideId)) return null;
        const slide = slides.find((row) => row.id === input.slideId);
        if (!slide || (slide.status !== "draft" && slide.status !== "failed")) return null;
        queuedOnce.add(input.slideId);
        const queued = {
          ...slide,
          status: "queued" as const,
          anchorKey: input.anchorKey,
          generationOperationKey: input.operationKey,
          queuedAt: new Date(),
        };
        slides = slides.map((row) => (row.id === input.slideId ? queued : row));
        return queued;
      },
    );
  });

  it("dispatches cover first, nothing while it is in flight, then only the ceil-middle after cover completes", async () => {
    await generateCarouselWork(generateInput);
    expect(dispatches.map((event) => event.data.position)).toEqual([1]);

    // Cover still queued: the chain waits.
    await dispatchNextCarouselStage(stageInput);
    expect(dispatches.map((event) => event.data.position)).toEqual([1]);

    completeSlide(1);
    await dispatchNextCarouselStage(stageInput);
    expect(dispatches.map((event) => event.data.position)).toEqual([1, 3]);
  });

  it("dispatches closing after the middle completes and never two anchors at once", async () => {
    resetDeck({ 1: "completed" });
    await dispatchNextCarouselStage(stageInput);
    expect(dispatches.map((event) => event.data.position)).toEqual([3]);

    completeSlide(3);
    await dispatchNextCarouselStage(stageInput);
    expect(dispatches.map((event) => event.data.position)).toEqual([3, 5]);
  });

  it("after all anchors complete it stores one anchor board, keys remaining drafts, and dispatches them", async () => {
    resetDeck({ 1: "completed", 3: "completed", 5: "completed" });

    const result = await dispatchNextCarouselStage(stageInput);

    expect(result.ok).toBe(true);
    expect(visuals.buildCarouselAnchorBoard).toHaveBeenCalledTimes(1);
    expect(visuals.buildCarouselAnchorBoard).toHaveBeenCalledWith({
      anchors: [
        { position: 1, buffer: Buffer.from("png-bytes") },
        { position: 3, buffer: Buffer.from("png-bytes") },
        { position: 5, buffer: Buffer.from("png-bytes") },
      ],
    });
    expect(storage.objectStorage.put).toHaveBeenCalledWith(
      ANCHOR_BOARD_KEY,
      expect.any(Buffer),
      "image/png",
    );
    expect(carouselRepo.setRemainingCarouselAnchorKey).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      slideIds: ["slide-2", "slide-4"],
      anchorKey: ANCHOR_BOARD_KEY,
    }));
    expect(dispatches.map((event) => event.data.position)).toEqual([2, 4]);
    expect(dispatches.map((event) => event.data.anchorKey)).toEqual([ANCHOR_BOARD_KEY, ANCHOR_BOARD_KEY]);
    expect(paywall.spend).toHaveBeenCalledTimes(2);
  });

  it("dispatches remaining slides in parallel through separate settlements", async () => {
    resetDeck({ 1: "completed", 3: "completed", 5: "completed" });

    await dispatchNextCarouselStage(stageInput);

    const spentKeys = paywall.spend.mock.calls.map((call) => call[0].idempotencyKey);
    expect(spentKeys).toEqual([
      "creative-work:work-1:carousel-slide:slide-2:generate",
      "creative-work:work-1:carousel-slide:slide-4:generate",
    ]);
    expect(dispatches.map((event) => event.data.slideId)).toEqual(["slide-2", "slide-4"]);
  });

  it("an anchor objective failure dispatches nothing else and builds no board", async () => {
    resetDeck({ 1: "completed", 3: "failed" });

    const result = await dispatchNextCarouselStage(stageInput);

    expect(result).toMatchObject({ ok: false, error: { code: "anchor_failed" } });
    expect(dispatches).toHaveLength(0);
    expect(visuals.buildCarouselAnchorBoard).not.toHaveBeenCalled();
    expect(storage.objectStorage.put).not.toHaveBeenCalled();
    expect(carouselRepo.setRemainingCarouselAnchorKey).not.toHaveBeenCalled();
  });

  it("a non-anchor dispatch failure preserves its completed siblings and refunds only its key", async () => {
    resetDeck({ 1: "completed", 3: "completed", 5: "completed" });
    send.mockImplementation(async (event: { id: string; name: string; data: Record<string, unknown> }) => {
      if (event.data.slideId === "slide-2") throw new Error("inngest unavailable");
      dispatches.push(event);
    });

    const result = await dispatchNextCarouselStage(stageInput);

    expect(result.ok).toBe(true);
    expect(dispatches.map((event) => event.data.slideId)).toEqual(["slide-4"]);
    expect(credits.refundCredits).toHaveBeenCalledTimes(1);
    expect(credits.refundCredits).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "creative-work:work-1:carousel-slide:slide-2:generate:dispatch-refund",
      amount: UNIT,
    }));
  });

  it("the idempotent queue CAS prevents duplicate sends on re-entry", async () => {
    resetDeck({ 1: "completed", 3: "completed", 5: "completed" });

    await dispatchNextCarouselStage(stageInput);
    await dispatchNextCarouselStage(stageInput);

    expect(dispatches.map((event) => event.data.position)).toEqual([2, 4]);
    expect(paywall.spend).toHaveBeenCalledTimes(2);
  });

  it("when every current slide is terminal it refreshes the aggregate and records the set review exactly once", async () => {
    resetDeck({ 1: "completed", 2: "completed", 3: "completed", 4: "completed", 5: "completed" });
    dbState.updateRows.push([{ id: "work-1" }]);

    const result = await dispatchNextCarouselStage(stageInput);

    expect(result.ok).toBe(true);
    expect(repo.refreshCarouselWorkStatus).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workItemId: "work-1",
    });
    expect(visuals.buildCarouselContactSheet).toHaveBeenCalledTimes(1);
    expect(visuals.reviewCarouselSet).toHaveBeenCalledTimes(1);
    expect(dbMock.update).toHaveBeenCalled();
    // Winning CAS persists the review block once.
    expect(dbState.updateRows).toEqual([]);
    expect(analytics.recordBetaAnalyticsEvent).toHaveBeenCalledTimes(1);
    expect(analytics.recordBetaAnalyticsEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: "output_ready",
      source: "server",
      properties: expect.objectContaining({
        creativeWorkId: "work-1",
        protocol: "carousel",
        outputCount: 5,
      }),
    }));

    // Re-entry with the review already persisted never repeats the event.
    workQuality = { version: 1, objectivePassed: true, advisoryWarnings: ["aviso-1"], contactSheetKey: "sheet", reviewedAt: "now" };
    await dispatchNextCarouselStage(stageInput);
    expect(visuals.reviewCarouselSet).toHaveBeenCalledTimes(1);
    expect(analytics.recordBetaAnalyticsEvent).toHaveBeenCalledTimes(1);
  });

  it("never emits output_ready from an individual slide completion", async () => {
    resetDeck({ 1: "completed" });
    await dispatchNextCarouselStage(stageInput);
    completeSlide(3);
    await dispatchNextCarouselStage(stageInput);

    const readyEvents = analytics.recordBetaAnalyticsEvent.mock.calls.filter(
      (call) => call[0].eventKey === "output_ready",
    );
    expect(readyEvents).toHaveLength(0);
  });

  it("does not trigger the set review while any current slide failed", async () => {
    resetDeck({ 1: "completed", 2: "completed", 3: "completed", 4: "failed", 5: "completed" });

    await dispatchNextCarouselStage(stageInput);

    expect(repo.refreshCarouselWorkStatus).toHaveBeenCalledTimes(1);
    expect(visuals.reviewCarouselSet).not.toHaveBeenCalled();
    expect(analytics.recordBetaAnalyticsEvent).not.toHaveBeenCalled();
  });
});
