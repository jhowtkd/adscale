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
  confirmCarouselInteriorsRevision: vi.fn(),
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
const continuation = vi.hoisted(() => ({
  dispatchNextCarouselStage: vi.fn(),
}));

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: repo.getCreativeWork,
}));
vi.mock("@/server/repositories/creative-work-carousel", () => ({
  listCurrentCarouselSlides: carouselRepo.listCurrentCarouselSlides,
  queueCarouselSlide: carouselRepo.queueCarouselSlide,
  queueAuthorizedCarouselSlide: async (input: { slideId: string; anchorKey: string | null; operationKey: string }) => {
    const queued = await carouselRepo.queueCarouselSlide(input);
    if (queued) return { outcome: "claimed", slide: queued };
    const current = (await carouselRepo.listCurrentCarouselSlides()).find((row: { id: string }) => row.id === input.slideId);
    if (!current) return { outcome: "missing" };
    if (current.status === "draft" || current.status === "failed") return { outcome: "unauthorized" };
    return { outcome: "already_claimed", slide: current };
  },
  setRemainingCarouselAnchorKey: carouselRepo.setRemainingCarouselAnchorKey,
  materializeCarouselSlides: repo.materializeCarouselSlides,
  refreshCarouselWorkStatus: repo.refreshCarouselWorkStatus,
  confirmCarouselInteriorsRevision: repo.confirmCarouselInteriorsRevision,
}));
vi.mock("@/server/application/advance-carousel-generation", () => continuation);
vi.mock("@/server/billing/paywall", () => ({
  checkSpend: paywall.checkSpend,
  spend: paywall.spend,
}));
vi.mock("@/server/billing/credits", () => credits);
vi.mock("@/server/repositories/usage", () => usageRepo);
vi.mock("@/server/jobs/client", () => ({ inngest: { send } }));
vi.mock("@/server/beta-analytics/record", () => analytics);

import { generateCarouselWork } from "./generate-carousel-work";

const UNIT = 50;
const PREPARED_REVISION = "prep-1";

const dispatches: Array<{ id: string; name: string; data: Record<string, unknown> }> = [];
let slides: CreativeWorkCarouselSlide[];
let queuedOnce = new Set<string>();

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

function slideRow(position: number, status: CarouselSlideStatus): CreativeWorkCarouselSlide {
  return carouselSlideRow({
    id: `slide-${position}`,
    position,
    status,
  });
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

function coverEditorial(overrides: Record<string, unknown> = {}) {
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

function workFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    work: {
      id: "work-1",
      workspaceId: "workspace-1",
      toolKind: "carousel",
      status: "draft",
      clientProfileId: "profile-1",
      createdByUserId: "user-1",
      updatedAt: new Date("2026-08-30T10:00:00.000Z"),
      carouselQuality: null,
      settings: { targetFormats: [], carouselEditorial: coverEditorial() },
      inputSnapshot: {
        carousel: {
          version: 1,
          preparedRevision: PREPARED_REVISION,
          deck: deckFixture(5),
          visualContract: visualContractFixture(),
          generationScope: "cover",
          scriptRevision: "script-1",
        },
      },
      ...overrides,
    } as CreativeWorkItem,
    outputs: [],
    sources: [],
  };
}

function resetDeck(statuses: Record<number, CarouselSlideStatus> = {}) {
  slides = [1, 2, 3, 4, 5].map((position) => slideRow(position, statuses[position] ?? "draft"));
  queuedOnce = new Set();
  dispatches.length = 0;
}

const baseInput = {
  workspaceId: "workspace-1",
  workItemId: "work-1",
  userId: "user-1",
  preparedRevision: PREPARED_REVISION,
};

describe("generateCarouselWork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDeck();
    paywall.checkSpend.mockResolvedValue({ allowed: true, amount: UNIT, balance: 10_000 });
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
    repo.getCreativeWork.mockImplementation(async () => workFixture());
    repo.materializeCarouselSlides.mockImplementation(async () => [...slides]);
    repo.refreshCarouselWorkStatus.mockResolvedValue({
      id: "work-1",
      status: "generating",
    } as CreativeWorkItem);
    repo.confirmCarouselInteriorsRevision.mockResolvedValue(workFixture().work);
    continuation.dispatchNextCarouselStage.mockResolvedValue({ ok: true, value: { dispatched: 1 } });
    carouselRepo.listCurrentCarouselSlides.mockImplementation(async () => [...slides]);
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

  it("returns stale_input when the prepared revision does not match the frozen snapshot", async () => {
    const result = await generateCarouselWork({ ...baseInput, preparedRevision: "prep-2" });

    expect(result).toEqual({ ok: false, error: { code: "stale_input" } });
    expect(paywall.checkSpend).not.toHaveBeenCalled();
    expect(repo.materializeCarouselSlides).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("returns work_not_found for a work outside the workspace", async () => {
    repo.getCreativeWork.mockResolvedValue(null);

    const result = await generateCarouselWork(baseInput);

    expect(result).toEqual({ ok: false, error: { code: "work_not_found" } });
    expect(paywall.checkSpend).not.toHaveBeenCalled();
  });

  it("returns work_not_carousel for a non-carousel work", async () => {
    repo.getCreativeWork.mockResolvedValue(
      workFixture({ toolKind: "social_post", inputSnapshot: null }),
    );

    const result = await generateCarouselWork(baseInput);

    expect(result).toMatchObject({ ok: false, error: { code: "work_not_carousel" } });
    expect(paywall.checkSpend).not.toHaveBeenCalled();
  });

  it("proves the cover balance before materialization and before any dispatch", async () => {
    const order: string[] = [];
    paywall.checkSpend.mockImplementation(async () => {
      order.push("checkSpend");
      return { allowed: true, amount: UNIT, balance: 10_000 };
    });
    repo.materializeCarouselSlides.mockImplementation(async () => {
      order.push("materialize");
      return [...slides];
    });
    paywall.spend.mockImplementation(async () => {
      order.push("spend");
      return { ok: true, creditsSpent: UNIT };
    });
    send.mockImplementation(async (event: { id: string; name: string; data: Record<string, unknown> }) => {
      order.push("send");
      dispatches.push(event);
    });

    const result = await generateCarouselWork(baseInput);

    expect(result.ok).toBe(true);
    expect(paywall.checkSpend).toHaveBeenCalledWith("workspace-1", "image_derivation", UNIT);
    expect(order.indexOf("checkSpend")).toBeLessThan(order.indexOf("materialize"));
    expect(order.indexOf("materialize")).toBeLessThan(order.indexOf("spend"));
  });

  it("creates no rows and dispatches nothing when the balance cannot cover the cover unit", async () => {
    paywall.checkSpend.mockResolvedValue({
      allowed: false,
      amount: UNIT,
      balance: 10,
      reason: "insufficient_credits",
    });

    const result = await generateCarouselWork(baseInput);

    expect(result).toMatchObject({ ok: false, error: { code: "credit_blocked" } });
    expect(repo.materializeCarouselSlides).not.toHaveBeenCalled();
    expect(paywall.spend).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(analytics.recordBetaAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("materializes idempotently: a replay joins the queued anchor without a second dispatch or debit", async () => {
    await generateCarouselWork(baseInput);
    expect(dispatches.map((event) => event.data.position)).toEqual([1]);

    const result = await generateCarouselWork(baseInput);

    expect(result.ok).toBe(true);
    expect(repo.materializeCarouselSlides).toHaveBeenCalledTimes(2);
    expect(repo.materializeCarouselSlides.mock.calls[0][0]).toEqual(
      repo.materializeCarouselSlides.mock.calls[1][0],
    );
    expect(dispatches.map((event) => event.data.position)).toEqual([1]);
    expect(paywall.spend).toHaveBeenCalledTimes(1);
    expect(analytics.recordBetaAnalyticsEvent).toHaveBeenCalledTimes(1);
  });

  it("dispatches only position 1 initially through its own one-unit settlement", async () => {
    const result = await generateCarouselWork(baseInput);

    expect(result.ok).toBe(true);
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]).toMatchObject({
      name: "creative-work.carousel-slide.generate",
      data: { workspaceId: "workspace-1", workItemId: "work-1", slideId: "slide-1", position: 1 },
    });
    expect(paywall.spend).toHaveBeenCalledTimes(1);
    expect(paywall.spend).toHaveBeenCalledWith(expect.objectContaining({
      action: "image_derivation",
      amount: UNIT,
      idempotencyKey: "creative-work:work-1:carousel-slide:slide-1:generate",
    }));
  });

  it("records generation_confirmed once with the Studio correlation after the first settlement", async () => {
    const result = await generateCarouselWork({
      ...baseInput,
      studioSessionId: "00000000-0000-4000-8000-000000000001",
      rolloutVariant: "progressive",
    });

    expect(result.ok).toBe(true);
    expect(analytics.recordBetaAnalyticsEvent).toHaveBeenCalledTimes(1);
    expect(analytics.recordBetaAnalyticsEvent).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      userId: "user-1",
      eventKey: "generation_confirmed",
      source: "server",
      properties: expect.objectContaining({
        creativeWorkId: "work-1",
        protocol: "carousel",
        outputCount: 1,
        studioSessionId: "00000000-0000-4000-8000-000000000001",
        rolloutVariant: "progressive",
      }),
    }));
  });

  it("returns dispatch_failed and records no analytics when the first settlement fails", async () => {
    send.mockRejectedValue(new Error("inngest unavailable"));

    const result = await generateCarouselWork(baseInput);

    expect(result).toMatchObject({ ok: false, error: { code: "dispatch_failed" } });
    expect(analytics.recordBetaAnalyticsEvent).not.toHaveBeenCalled();
    expect(credits.refundCredits).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "creative-work:work-1:carousel-slide:slide-1:generate:dispatch-refund",
    }));
  });

  it("refuses cover generation when the script is not approved", async () => {
    repo.getCreativeWork.mockResolvedValue(workFixture({
      settings: {
        targetFormats: [],
        carouselEditorial: coverEditorial({ approvedScriptRevision: null }),
      },
    }));

    const result = await generateCarouselWork(baseInput);

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_generation_gate" } });
    expect(paywall.checkSpend).not.toHaveBeenCalled();
    expect(repo.materializeCarouselSlides).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses a legacy snapshot without generationScope and never dispatches", async () => {
    repo.getCreativeWork.mockResolvedValue(workFixture({
      inputSnapshot: {
        carousel: {
          version: 1,
          preparedRevision: PREPARED_REVISION,
          deck: deckFixture(5),
          visualContract: visualContractFixture(),
        },
      },
    }));

    const result = await generateCarouselWork(baseInput);

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_generation_gate" } });
    expect(paywall.checkSpend).not.toHaveBeenCalled();
    expect(repo.materializeCarouselSlides).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("confirms interiors through CAS and does not settle the cover again", async () => {
    resetDeck({ 1: "completed" });
    const interiorsWork = workFixture({
      status: "partial",
      settings: {
        targetFormats: [],
        carouselEditorial: coverEditorial({
          approvedCover: { slideId: "slide-1", scriptRevision: "script-1", preparedRevision: PREPARED_REVISION },
        }),
      },
      inputSnapshot: {
        carousel: {
          version: 1,
          preparedRevision: PREPARED_REVISION,
          deck: deckFixture(5),
          visualContract: visualContractFixture(),
          generationScope: "interiors",
          scriptRevision: "script-1",
        },
      },
    });
    repo.getCreativeWork.mockResolvedValue(interiorsWork);
    repo.confirmCarouselInteriorsRevision.mockResolvedValue(interiorsWork.work);

    const result = await generateCarouselWork(baseInput);

    expect(result.ok).toBe(true);
    expect(paywall.checkSpend).toHaveBeenCalledWith("workspace-1", "image_derivation", 4 * UNIT);
    expect(repo.confirmCarouselInteriorsRevision).toHaveBeenCalledWith(expect.objectContaining({
      preparedRevision: PREPARED_REVISION,
      scriptRevision: "script-1",
      coverSlideId: "slide-1",
    }));
    expect(continuation.dispatchNextCarouselStage).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("treats two concurrent interiors confirms as one lote confirmation", async () => {
    resetDeck({ 1: "completed" });
    const interiorsWork = workFixture({
      status: "partial",
      settings: {
        targetFormats: [],
        carouselEditorial: coverEditorial({
          approvedCover: { slideId: "slide-1", scriptRevision: "script-1", preparedRevision: PREPARED_REVISION },
        }),
      },
      inputSnapshot: {
        carousel: {
          version: 1,
          preparedRevision: PREPARED_REVISION,
          deck: deckFixture(5),
          visualContract: visualContractFixture(),
          generationScope: "interiors",
          scriptRevision: "script-1",
        },
      },
    });
    const confirmed = {
      ...interiorsWork.work,
      settings: {
        ...interiorsWork.work.settings,
        carouselEditorial: {
          ...coverEditorial({
            approvedCover: { slideId: "slide-1", scriptRevision: "script-1", preparedRevision: PREPARED_REVISION },
            confirmedInteriorsRevision: PREPARED_REVISION,
          }),
        },
      },
    };
    let confirmCalls = 0;
    repo.getCreativeWork.mockResolvedValue(interiorsWork);
    repo.confirmCarouselInteriorsRevision.mockImplementation(async () => {
      confirmCalls += 1;
      if (confirmCalls === 1) return confirmed;
      repo.getCreativeWork.mockResolvedValue({ ...interiorsWork, work: confirmed });
      return null;
    });

    const [first, second] = await Promise.all([
      generateCarouselWork(baseInput),
      generateCarouselWork(baseInput),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(repo.confirmCarouselInteriorsRevision).toHaveBeenCalledTimes(2);
    expect(continuation.dispatchNextCarouselStage).toHaveBeenCalledTimes(2);
  });

  it("rejects interiors when the script is invalidated between read and confirmation claim", async () => {
    resetDeck({ 1: "completed" });
    const interiorsWork = workFixture({
      status: "partial",
      settings: {
        targetFormats: [],
        carouselEditorial: coverEditorial({
          approvedCover: { slideId: "slide-1", scriptRevision: "script-1", preparedRevision: PREPARED_REVISION },
        }),
      },
      inputSnapshot: {
        carousel: {
          version: 1,
          preparedRevision: PREPARED_REVISION,
          deck: deckFixture(5),
          visualContract: visualContractFixture(),
          generationScope: "interiors",
          scriptRevision: "script-1",
        },
      },
    });
    repo.getCreativeWork.mockResolvedValue(interiorsWork);
    repo.confirmCarouselInteriorsRevision.mockResolvedValue(null);

    const result = await generateCarouselWork(baseInput);

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_generation_gate" } });
    expect(continuation.dispatchNextCarouselStage).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("blocks the interiors lote when the remaining balance is insufficient", async () => {
    resetDeck({ 1: "completed" });
    repo.getCreativeWork.mockResolvedValue(workFixture({
      status: "partial",
      settings: {
        targetFormats: [],
        carouselEditorial: coverEditorial({
          approvedCover: { slideId: "slide-1", scriptRevision: "script-1", preparedRevision: PREPARED_REVISION },
        }),
      },
      inputSnapshot: {
        carousel: {
          version: 1,
          preparedRevision: PREPARED_REVISION,
          deck: deckFixture(5),
          visualContract: visualContractFixture(),
          generationScope: "interiors",
          scriptRevision: "script-1",
        },
      },
    }));
    paywall.checkSpend.mockResolvedValue({
      allowed: false,
      amount: 4 * UNIT,
      balance: 10,
      reason: "insufficient_credits",
    });

    const result = await generateCarouselWork(baseInput);

    expect(result).toMatchObject({ ok: false, error: { code: "credit_blocked" } });
    expect(repo.confirmCarouselInteriorsRevision).not.toHaveBeenCalled();
    expect(continuation.dispatchNextCarouselStage).not.toHaveBeenCalled();
  });
});

