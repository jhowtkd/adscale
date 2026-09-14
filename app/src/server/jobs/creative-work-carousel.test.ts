import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreativeWorkCarouselSlide, CreativeWorkItem } from "@/server/db/schema";
import type {
  CarouselDeckPlanV1,
  CarouselVisualContractV1,
} from "@/server/creative-work/carousel-contracts";

const repo = vi.hoisted(() => ({
  getCreativeWork: vi.fn(),
}));
const carouselRepo = vi.hoisted(() => ({
  listCurrentCarouselSlides: vi.fn(),
  markCarouselSlideProcessing: vi.fn(),
  completeCarouselSlide: vi.fn(),
  failCarouselSlide: vi.fn(),
  refreshCarouselWorkStatus: vi.fn(),
}));
const executor = vi.hoisted(() => ({
  executeCanonicalGeneration: vi.fn(),
}));
const qa = vi.hoisted(() => ({
  runCreativeWorkQualityAssessment: vi.fn(),
}));
const continuation = vi.hoisted(() => ({
  dispatchNextCarouselStage: vi.fn(),
}));
const settlement = vi.hoisted(() => ({
  settleTerminalRefund: vi.fn(),
}));
const storage = vi.hoisted(() => ({
  objectStorage: { get: vi.fn(), put: vi.fn() },
}));
const compositor = vi.hoisted(() => ({
  runCarouselTextComposition: vi.fn(),
}));
const promptBuilder = vi.hoisted(() => ({
  buildCarouselSlidePrompt: vi.fn(),
}));
const refPlan = vi.hoisted(() => ({
  planCarouselSlideReferences: vi.fn(),
}));
const normalize = vi.hoisted(() => ({
  normalizeReferenceBuffers: vi.fn(),
}));

vi.mock("@/server/repositories/creative-work", () => repo);
vi.mock("@/server/repositories/creative-work-carousel", () => carouselRepo);
vi.mock("@/server/generation/pipeline/execute", () => executor);
vi.mock("@/server/generation/pipeline/post-generation", () => qa);
vi.mock("@/server/application/advance-carousel-generation", () => continuation);
vi.mock("@/server/generation/settlement", () => settlement);
vi.mock("@/server/storage", () => storage);
vi.mock("@/server/creative-work/text-composite", () => ({
  ...compositor,
  TextCompositionError: class TextCompositionError extends Error {
    constructor(readonly code: string) {
      super(code);
      this.name = "TextCompositionError";
    }
  },
}));
vi.mock("@/server/creative-work/prompt", () => promptBuilder);
vi.mock("@/server/creative-work/reference-plan", () => ({
  ...refPlan,
  CreativeWorkReferenceError: class CreativeWorkReferenceError extends Error {
    readonly code = "reference_failure";
    constructor(message: string) {
      super(message);
      this.name = "CreativeWorkReferenceError";
    }
  },
}));
vi.mock("@/server/ai/normalize-image-for-ai", () => normalize);
vi.mock("@/server/beta-analytics/record", () => ({ recordBetaAnalyticsEvent: vi.fn().mockResolvedValue({ id: "analytics-1" }) }));

import { runCreativeWorkCarouselSlide } from "./creative-work-carousel";
import { GENERATION_CREDIT_COSTS } from "@/server/generation/canonical/types";

const WORK_ID = "work-1";
const SLIDE_ID = "slide-2";
const UNIT = GENERATION_CREDIT_COSTS.creativeWorkOutput;

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

function deckFixture(): CarouselDeckPlanV1 {
  return {
    version: 1,
    revision: "deck-r1",
    workId: WORK_ID,
    objective: "Divulgar o grupo de terapia",
    audience: null,
    tone: null,
    promise: "Grupo de terapia em agosto",
    format: "4:5",
    slides: [
      { slideId: "slide-1", position: 1, role: "hook", purpose: "Prender", primaryText: "Gancho", secondaryText: null, authority: "ai_proposal", sourceFactIds: [], layoutFamily: "impact" },
      { slideId: "slide-2", position: 2, role: "context", purpose: "Contexto", primaryText: "Contexto", secondaryText: null, authority: "ai_proposal", sourceFactIds: [], layoutFamily: "development" },
      { slideId: "slide-3", position: 3, role: "problem", purpose: "Problema", primaryText: "Problema", secondaryText: null, authority: "ai_proposal", sourceFactIds: [], layoutFamily: "impact" },
      { slideId: "slide-4", position: 4, role: "argument", purpose: "Argumento", primaryText: "Argumento", secondaryText: null, authority: "ai_proposal", sourceFactIds: [], layoutFamily: "development" },
      { slideId: "slide-5", position: 5, role: "closing", purpose: "Fechar", primaryText: "Fechamento", secondaryText: null, authority: "ai_proposal", sourceFactIds: [], layoutFamily: "respite" },
    ],
  };
}

function slideRow(overrides: Partial<CreativeWorkCarouselSlide> = {}): CreativeWorkCarouselSlide {
  return {
    id: SLIDE_ID,
    workspaceId: "workspace-1",
    workItemId: WORK_ID,
    lineageId: "lineage-1",
    parentSlideId: null,
    versionNumber: 1,
    deckRevision: "deck-r1",
    position: 2,
    role: "context",
    primaryText: "Contexto exato",
    secondaryText: null,
    copyAuthority: "ai_proposal",
    sourceFactIds: [],
    layoutFamily: "development",
    status: "queued",
    providerBaseKey: null,
    outputKey: null,
    previewKey: null,
    visualContractHash: "contract-hash-1",
    anchorKey: "creative-work/work-1/carousel/prep-1/anchor-board.png",
    generationOperationKey: "deck-r1:slide-2",
    errorCode: null,
    quality: null,
    isCurrent: true,
    createdAt: new Date("2026-08-30T10:00:00.000Z"),
    queuedAt: new Date("2026-08-30T10:01:00.000Z"),
    terminalAt: null,
    updatedAt: new Date("2026-08-30T10:01:00.000Z"),
    ...overrides,
  } as CreativeWorkCarouselSlide;
}

function workFixture(slide: CreativeWorkCarouselSlide) {
  return {
    work: {
      id: WORK_ID,
      workspaceId: "workspace-1",
      toolKind: "carousel",
      status: "generating",
      clientProfileId: "profile-1",
      createdByUserId: "user-1",
      carouselQuality: null,
      identitySnapshot: { clientProfileId: "profile-1", confirmedAt: "2026-08-30T09:00:00.000Z", assets: [], brandKit: { colors: ["#112233"], fonts: [], toneOfVoice: null } },
      inputSnapshot: {
        generationPolicyVersion: "quality_recovery_v1",
        request: "Quero um carrossel sobre o grupo de terapia",
        settings: {},
        sources: [],
        factPack: null,
        carousel: {
          version: 1,
          preparedRevision: "prep-1",
          deck: deckFixture(),
          visualContract: visualContractFixture(),
          generationScope: "cover",
          scriptRevision: "script-1",
          storyboard: [{
            slideId: "slide-1",
            learning: "A capa ancora a tese",
            representation: "Retrato com paleta aprovada",
            hierarchy: "Título e marca",
            transition: "Abre o argumento",
            claimIds: [],
          }],
          caption: "Inscreva-se pelo direct",
        },
      },
    } as unknown as CreativeWorkItem,
    outputs: [],
    sources: [],
  };
}

const input = { event: { workspaceId: "workspace-1", workItemId: WORK_ID, slideId: SLIDE_ID }, runId: "run-1", attempt: 0 };

async function realPng(width = 1024, height = 1280): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp({ create: { width, height, channels: 3, background: "#dddddd" } }).png().toBuffer();
}

describe("runCreativeWorkCarouselSlide", () => {
  let slide: CreativeWorkCarouselSlide;

  beforeEach(async () => {
    vi.clearAllMocks();
    slide = slideRow();

    repo.getCreativeWork.mockImplementation(async () => workFixture(slide));
    carouselRepo.listCurrentCarouselSlides.mockResolvedValue([slide]);
    carouselRepo.markCarouselSlideProcessing.mockImplementation(async (i: { slideId: string }) => {
      const rows: CreativeWorkCarouselSlide[] = await carouselRepo.listCurrentCarouselSlides();
      const found = rows.find((row) => row.id === i.slideId);
      return found ? { ...found, status: "processing" as const } : null;
    });
    carouselRepo.completeCarouselSlide.mockImplementation(async (i: { slideId: string }) =>
      ({ ...slide, status: "completed", outputKey: i.outputKey, providerBaseKey: i.providerBaseKey, previewKey: i.previewKey, quality: i.quality }));
    carouselRepo.failCarouselSlide.mockImplementation(async (i: { slideId: string; errorCode: string }) =>
      ({ ...slide, status: "failed", errorCode: i.errorCode }));
    carouselRepo.refreshCarouselWorkStatus.mockResolvedValue(workFixture(slide).work);

    executor.executeCanonicalGeneration.mockResolvedValue({
      outputKey: `creative-work/${WORK_ID}/carousel/slides/${SLIDE_ID}/123.png`,
      revisedPrompt: "",
      buffer: await realPng(),
      imageOperation: "generate",
      candidates: [{
        provider: "openai",
        model: "gpt-image-2.5-sunburst-2026-09-08",
        outputKey: `creative-work/${WORK_ID}/carousel/slides/${SLIDE_ID}/123.png`,
        durationMs: 8000,
        winner: true,
        observation: {
          callId: "call-carousel",
          key: SLIDE_ID,
          operation: "generate",
          requested: { version: 1, model: "gpt-image-2.5-sunburst-2026-09-08", quality: "max" },
          requestedSize: "1024x1280",
          returnedSize: "1024x1280",
          returnedQuality: "max",
          requestId: "req-carousel",
          durationMs: 8000,
          usage: null,
        },
      }],
      destination: { kind: "creative_work_carousel_slide", id: SLIDE_ID },
      surface: "quick_tool",
    });
    qa.runCreativeWorkQualityAssessment.mockResolvedValue({
      objectiveVerdict: "pass",
      quality: { version: 1, objectiveVerdict: "pass", objectiveCodes: [], findings: [], attempt: 1 },
    });
    continuation.dispatchNextCarouselStage.mockResolvedValue({ ok: true, value: { dispatched: 0 } });
    settlement.settleTerminalRefund.mockResolvedValue({ refunded: true, applied: true, reason: "terminal", status: "refunded" });
    storage.objectStorage.get.mockImplementation(async (key: string) => {
      if (key.endsWith("anchor-board.png")) return Buffer.from("anchor-board-png");
      return realPng();
    });
    storage.objectStorage.put.mockResolvedValue(undefined);
    compositor.runCarouselTextComposition.mockResolvedValue({
      buffer: await realPng(),
      provenance: { version: 1, copyHash: "copy-hash", baseHash: "base-hash", outputHash: "out-hash", fontAuthority: "fallback", fontFamily: "sans", layers: [] },
    });
    promptBuilder.buildCarouselSlidePrompt.mockReturnValue("CAROUSEL PROMPT");
    refPlan.planCarouselSlideReferences.mockReturnValue([
      { role: "anchor_board", required: true, assetKey: "creative-work/work-1/carousel/prep-1/anchor-board.png", mimeType: "image/png", label: "Anchor board" },
    ]);
    normalize.normalizeReferenceBuffers.mockImplementation(async (refs: unknown[]) => refs);
  });

  it("skips before the provider when the work is missing or cross-workspace", async () => {
    repo.getCreativeWork.mockResolvedValue(null);

    const result = await runCreativeWorkCarouselSlide(input);

    expect(result).toMatchObject({ success: true, slideId: SLIDE_ID, skipped: true });
    expect(executor.executeCanonicalGeneration).not.toHaveBeenCalled();
  });

  it("skips before the provider when the slide is missing", async () => {
    carouselRepo.listCurrentCarouselSlides.mockResolvedValue([]);

    const result = await runCreativeWorkCarouselSlide(input);

    expect(result).toMatchObject({ success: true, slideId: SLIDE_ID, skipped: true });
    expect(executor.executeCanonicalGeneration).not.toHaveBeenCalled();
  });

  it("skips a duplicate completed event", async () => {
    carouselRepo.listCurrentCarouselSlides.mockResolvedValue([{ ...slide, status: "completed" }]);

    const result = await runCreativeWorkCarouselSlide(input);

    expect(result).toMatchObject({ success: true, slideId: SLIDE_ID, skipped: true });
    expect(carouselRepo.markCarouselSlideProcessing).not.toHaveBeenCalled();
    expect(executor.executeCanonicalGeneration).not.toHaveBeenCalled();
  });

  it("claims the slide queued→processing via CAS and skips when the lease is lost", async () => {
    carouselRepo.markCarouselSlideProcessing.mockResolvedValue(null);

    const result = await runCreativeWorkCarouselSlide(input);

    expect(result).toMatchObject({ success: true, slideId: SLIDE_ID, skipped: true });
    expect(carouselRepo.markCarouselSlideProcessing).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workItemId: WORK_ID,
      slideId: SLIDE_ID,
    });
    expect(executor.executeCanonicalGeneration).not.toHaveBeenCalled();
  });

  it("requests the same-call art critique only for budgeted snapshots (plan 04, T4)", async () => {
    const budgeted = workFixture(slide);
    budgeted.work.inputSnapshot = {
      ...budgeted.work.inputSnapshot,
      artRefinement: {
        version: 1,
        maxRevisionsPerRoot: 2,
        acceptedCreditCeiling: 30,
        acceptedBy: "user-1",
        acceptedAt: "2026-09-13T00:00:00.000Z",
      },
    };
    repo.getCreativeWork.mockImplementation(async () => budgeted);

    await runCreativeWorkCarouselSlide(input);

    expect(qa.runCreativeWorkQualityAssessment).toHaveBeenCalledWith(
      expect.objectContaining({ qa: expect.objectContaining({ artCritique: { enabled: true } }) }),
    );

    qa.runCreativeWorkQualityAssessment.mockClear();
    repo.getCreativeWork.mockImplementation(async () => workFixture(slide));
    await runCreativeWorkCarouselSlide(input);
    const legacyQa = qa.runCreativeWorkQualityAssessment.mock.calls[0]?.[0] as { qa: Record<string, unknown> };
    expect(legacyQa.qa).not.toHaveProperty("artCritique");
  });

  it("makes exactly one direct canonical image call with the plan's GenerationRequest", async () => {
    await runCreativeWorkCarouselSlide(input);

    expect(executor.executeCanonicalGeneration).toHaveBeenCalledTimes(1);
    const request = executor.executeCanonicalGeneration.mock.calls[0][0];
    expect(request).toMatchObject({
      authorship: { workspaceId: "workspace-1", userId: "user-1" },
      origin: "quick_tool",
      surface: "quick_tool",
      intent: { mode: "social_post", objective: "Divulgar o grupo de terapia" },
      identity: { clientProfileId: "profile-1", brandConstraints: null },
      format: { targetFormat: "4:5", dimensions: { width: 1024, height: 1280 } },
      source: {
        parentId: null,
        sourceVersionId: null,
        lineageId: "lineage-1",
        packageSource: "creative_work_carousel_slide",
      },
      prompt: { text: "CAROUSEL PROMPT" },
      cost: { chargeAmount: UNIT, refundPolicy: "default" },
      idempotency: {
        billingKey: `creative-work:${WORK_ID}:carousel-slide:${SLIDE_ID}:generate`,
        skipWhenOutputExists: true,
      },
      destination: {
        kind: "creative_work_carousel_slide",
        id: SLIDE_ID,
        storagePrefix: `creative-work/${WORK_ID}/carousel/slides/${SLIDE_ID}`,
        workItemId: WORK_ID,
      },
      executionPolicy: "direct",
      attempt: 0,
    });
    expect(request.identity.referenceImages).toHaveLength(1);
    expect(promptBuilder.buildCarouselSlidePrompt).toHaveBeenCalledWith(expect.objectContaining({
      slide: expect.objectContaining({ slideId: "slide-2", position: 2 }),
      generationScope: "cover",
      storyboard: [expect.objectContaining({ slideId: "slide-1" })],
    }));
    expect(request.renderPolicy).toEqual({
      version: 1,
      model: "gpt-image-2-2026-04-21",
      quality: "medium",
    });
  });

  it("forwards the frozen sunburst policy from the prepared carousel snapshot", async () => {
    repo.getCreativeWork.mockResolvedValue({
      ...workFixture(slide),
      work: {
        ...workFixture(slide).work,
        inputSnapshot: {
          ...workFixture(slide).work.inputSnapshot,
          renderPolicy: { version: 1, model: "gpt-image-2.5-sunburst-2026-09-08", quality: "max" },
        },
      },
    });

    await runCreativeWorkCarouselSlide(input);

    expect(executor.executeCanonicalGeneration.mock.calls[0]?.[0].renderPolicy).toEqual({
      version: 1,
      model: "gpt-image-2.5-sunburst-2026-09-08",
      quality: "max",
    });
  });

  it("persists the untouched provider base separately from the composed final output", async () => {
    const composed = await realPng();
    compositor.runCarouselTextComposition.mockResolvedValue({
      buffer: composed,
      provenance: { version: 1, copyHash: "copy-hash", baseHash: "base-hash", outputHash: "out-hash", fontAuthority: "fallback", fontFamily: "sans", layers: [] },
    });

    await runCreativeWorkCarouselSlide(input);

    // provider base = executor's own key, untouched; final = separate key.
    expect(storage.objectStorage.put).toHaveBeenCalledTimes(1);
    const [finalKey, finalBuffer] = storage.objectStorage.put.mock.calls[0];
    expect(finalKey).toBe(`creative-work/${WORK_ID}/carousel/slides/${SLIDE_ID}/final.png`);
    expect(finalBuffer).toBe(composed);

    expect(carouselRepo.completeCarouselSlide).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      workItemId: WORK_ID,
      slideId: SLIDE_ID,
      providerBaseKey: `creative-work/${WORK_ID}/carousel/slides/${SLIDE_ID}/123.png`,
      outputKey: `creative-work/${WORK_ID}/carousel/slides/${SLIDE_ID}/final.png`,
      previewKey: `creative-work/${WORK_ID}/carousel/slides/${SLIDE_ID}/final.png`,
      quality: expect.objectContaining({
        version: 1,
        objectiveVerdict: "pass",
        generationEvidence: expect.objectContaining({
          observations: [expect.objectContaining({ callId: "call-carousel" })],
        }),
      }),
    }));
  });

  it("composes exact assets before copy and passes the frozen copy to the compositor", async () => {
    await runCreativeWorkCarouselSlide(input);

    expect(compositor.runCarouselTextComposition).toHaveBeenCalledTimes(1);
    const composeInput = compositor.runCarouselTextComposition.mock.calls[0][0];
    expect(composeInput).toMatchObject({
      primaryText: "Contexto exato",
      secondaryText: null,
      dimensions: { width: 1024, height: 1280 },
      safeAreaPx: 64,
      font: null,
      fontBuffer: null,
      fallbackFamily: "sans",
    });
    expect(composeInput.primaryRegion).toMatchObject({ x: 80, y: 96, width: 864, height: 420 });
  });

  it("completes the slide and dispatches the next stage exactly once on objective pass", async () => {
    const result = await runCreativeWorkCarouselSlide(input);

    expect(result).toEqual({ success: true, slideId: SLIDE_ID });
    expect(carouselRepo.completeCarouselSlide).toHaveBeenCalledTimes(1);
    expect(continuation.dispatchNextCarouselStage).toHaveBeenCalledTimes(1);
    expect(continuation.dispatchNextCarouselStage).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workItemId: WORK_ID,
      userId: "user-1",
    });
  });

  it("still asks dispatchNextCarouselStage after the cover completes so the gate can pause interiors", async () => {
    const cover = slideRow({
      id: "slide-1",
      position: 1,
      role: "hook",
      layoutFamily: "impact",
      generationOperationKey: "deck-r1:slide-1",
      anchorKey: null,
    });
    carouselRepo.listCurrentCarouselSlides.mockResolvedValue([cover]);
    carouselRepo.markCarouselSlideProcessing.mockResolvedValue({ ...cover, status: "processing" });

    await runCreativeWorkCarouselSlide({
      event: { workspaceId: "workspace-1", workItemId: WORK_ID, slideId: "slide-1" },
    });

    expect(carouselRepo.completeCarouselSlide).toHaveBeenCalledTimes(1);
    expect(continuation.dispatchNextCarouselStage).toHaveBeenCalledTimes(1);
  });

  it("fails only that slide with refund on objective fail — no second correction call", async () => {
    qa.runCreativeWorkQualityAssessment.mockResolvedValue({
      objectiveVerdict: "fail",
      quality: { version: 1, objectiveVerdict: "fail", objectiveCodes: ["wrong_dimensions"], findings: [], attempt: 1 },
    });

    const result = await runCreativeWorkCarouselSlide(input);

    expect(result).toMatchObject({ success: false, slideId: SLIDE_ID });
    expect(carouselRepo.failCarouselSlide).toHaveBeenCalledWith(expect.objectContaining({
      slideId: SLIDE_ID,
      errorCode: "objective_failed",
    }));
    expect(carouselRepo.completeCarouselSlide).not.toHaveBeenCalled();
    expect(executor.executeCanonicalGeneration).toHaveBeenCalledTimes(1); // no second image call
    expect(settlement.settleTerminalRefund).toHaveBeenCalledTimes(1);
    expect(settlement.settleTerminalRefund).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      decision: expect.objectContaining({ refund: true, amount: UNIT }),
    }));
  });

  it("completes with a visible warning on objective inconclusive", async () => {
    qa.runCreativeWorkQualityAssessment.mockResolvedValue({
      objectiveVerdict: "inconclusive",
      quality: { version: 1, objectiveVerdict: "inconclusive", objectiveCodes: [], findings: [{ code: "evaluator_timeout" }], attempt: 1 },
    });

    const result = await runCreativeWorkCarouselSlide(input);

    expect(result).toEqual({ success: true, slideId: SLIDE_ID });
    expect(carouselRepo.completeCarouselSlide).toHaveBeenCalledWith(expect.objectContaining({
      quality: expect.objectContaining({ objectiveVerdict: "inconclusive" }),
    }));
    expect(carouselRepo.failCarouselSlide).not.toHaveBeenCalled();
  });

  it("fails only that slide on wrong provider dimensions", async () => {
    executor.executeCanonicalGeneration.mockResolvedValue({
      outputKey: "provider.png",
      revisedPrompt: "",
      buffer: await realPng(512, 640),
      imageOperation: "generate",
      candidates: [],
      destination: { kind: "creative_work_carousel_slide", id: SLIDE_ID },
      surface: "quick_tool",
    });

    const result = await runCreativeWorkCarouselSlide(input);

    expect(result).toMatchObject({ success: false, slideId: SLIDE_ID });
    expect(carouselRepo.failCarouselSlide).toHaveBeenCalledWith(expect.objectContaining({
      slideId: SLIDE_ID,
      errorCode: "wrong_dimensions",
    }));
    expect(qa.runCreativeWorkQualityAssessment).not.toHaveBeenCalled();
    expect(settlement.settleTerminalRefund).toHaveBeenCalledTimes(1);
  });

  it("fails only that slide on corrupt provider output", async () => {
    executor.executeCanonicalGeneration.mockResolvedValue({
      outputKey: "provider.png",
      revisedPrompt: "",
      buffer: Buffer.from("not-a-png"),
      imageOperation: "generate",
      candidates: [],
      destination: { kind: "creative_work_carousel_slide", id: SLIDE_ID },
      surface: "quick_tool",
    });

    const result = await runCreativeWorkCarouselSlide(input);

    expect(result).toMatchObject({ success: false, slideId: SLIDE_ID });
    expect(carouselRepo.failCarouselSlide).toHaveBeenCalledWith(expect.objectContaining({
      slideId: SLIDE_ID,
      errorCode: "provider_output_corrupt",
    }));
    expect(settlement.settleTerminalRefund).toHaveBeenCalledTimes(1);
  });

  it("fails only that slide on copy overflow", async () => {
    const { TextCompositionError } = await import("@/server/creative-work/text-composite");
    compositor.runCarouselTextComposition.mockRejectedValue(new TextCompositionError("brand_text_overflow"));

    const result = await runCreativeWorkCarouselSlide(input);

    expect(result).toMatchObject({ success: false, slideId: SLIDE_ID });
    expect(carouselRepo.failCarouselSlide).toHaveBeenCalledWith(expect.objectContaining({
      slideId: SLIDE_ID,
      errorCode: "copy_overflow",
    }));
    expect(settlement.settleTerminalRefund).toHaveBeenCalledTimes(1);
  });

  it("fails only that slide when an exact asset is missing", async () => {
    // Give the layout plan an exact asset slot that storage cannot load.
    const contract = visualContractFixture();
    contract.layoutFamilies.development.exactAssetSlots = [
      { assetKey: "brand-training/missing-logo.png", x: 800, y: 1100, width: 160, height: 160 },
    ];
    contract.exactAssetKeys = ["brand-training/missing-logo.png"];
    repo.getCreativeWork.mockImplementation(async () => ({
      ...workFixture(slide),
      work: {
        ...workFixture(slide).work,
        inputSnapshot: {
          ...workFixture(slide).work.inputSnapshot,
          carousel: { version: 1, preparedRevision: "prep-1", deck: deckFixture(), visualContract: contract },
        },
      },
    }));
    storage.objectStorage.get.mockImplementation(async (key: string) => {
      if (key.includes("missing-logo")) throw new Error("NoSuchKey");
      if (key.endsWith("anchor-board.png")) return Buffer.from("anchor-board-png");
      return realPng();
    });

    const result = await runCreativeWorkCarouselSlide(input);

    expect(result).toMatchObject({ success: false, slideId: SLIDE_ID });
    expect(carouselRepo.failCarouselSlide).toHaveBeenCalledWith(expect.objectContaining({
      slideId: SLIDE_ID,
      errorCode: "exact_asset_missing",
    }));
    expect(settlement.settleTerminalRefund).toHaveBeenCalledTimes(1);
  });

  it("fails only that slide on contract hash mismatch before the provider", async () => {
    carouselRepo.listCurrentCarouselSlides.mockResolvedValue([
      { ...slide, visualContractHash: "stale-hash" },
    ]);

    const result = await runCreativeWorkCarouselSlide(input);

    expect(result).toMatchObject({ success: false, slideId: SLIDE_ID });
    expect(carouselRepo.failCarouselSlide).toHaveBeenCalledWith(expect.objectContaining({
      slideId: SLIDE_ID,
      errorCode: "contract_mismatch",
    }));
    expect(executor.executeCanonicalGeneration).not.toHaveBeenCalled();
    expect(settlement.settleTerminalRefund).toHaveBeenCalledTimes(1);
  });

  it("fails only that slide on unauthorized reference", async () => {
    const { CreativeWorkReferenceError } = await import("@/server/creative-work/reference-plan");
    refPlan.planCarouselSlideReferences.mockImplementation(() => {
      throw new CreativeWorkReferenceError("non-anchor slide is missing its shared anchor board reference");
    });

    const result = await runCreativeWorkCarouselSlide(input);

    expect(result).toMatchObject({ success: false, slideId: SLIDE_ID });
    expect(carouselRepo.failCarouselSlide).toHaveBeenCalledWith(expect.objectContaining({
      slideId: SLIDE_ID,
      errorCode: "reference_failure",
    }));
    expect(executor.executeCanonicalGeneration).not.toHaveBeenCalled();
    expect(settlement.settleTerminalRefund).toHaveBeenCalledTimes(1);
  });

  it("on anchor failure does not call dispatchNextCarouselStage", async () => {
    // Anchor slide (position 1 of a 5-slide deck).
    const anchor = slideRow({ id: "slide-1", position: 1, role: "hook", layoutFamily: "impact", generationOperationKey: "deck-r1:slide-1" });
    carouselRepo.listCurrentCarouselSlides.mockResolvedValue([anchor]);
    carouselRepo.markCarouselSlideProcessing.mockResolvedValue({ ...anchor, status: "processing" });
    qa.runCreativeWorkQualityAssessment.mockResolvedValue({
      objectiveVerdict: "fail",
      quality: { version: 1, objectiveVerdict: "fail", objectiveCodes: ["wrong_brand"], findings: [], attempt: 1 },
    });

    const result = await runCreativeWorkCarouselSlide({
      event: { workspaceId: "workspace-1", workItemId: WORK_ID, slideId: "slide-1" },
    });

    expect(result).toMatchObject({ success: false, slideId: "slide-1" });
    expect(carouselRepo.failCarouselSlide).toHaveBeenCalled();
    expect(continuation.dispatchNextCarouselStage).not.toHaveBeenCalled();
  });

  it("on non-anchor failure calls dispatchNextCarouselStage once for aggregate reconciliation", async () => {
    qa.runCreativeWorkQualityAssessment.mockResolvedValue({
      objectiveVerdict: "fail",
      quality: { version: 1, objectiveVerdict: "fail", objectiveCodes: ["wrong_dimensions"], findings: [], attempt: 1 },
    });

    const result = await runCreativeWorkCarouselSlide(input);

    expect(result).toMatchObject({ success: false, slideId: SLIDE_ID });
    expect(continuation.dispatchNextCarouselStage).toHaveBeenCalledTimes(1);
  });

  it("marks and refunds the same slide idempotently when the job is interrupted", async () => {
    const { runCreativeWorkCarouselSlideOnFailure } = await import("./creative-work-carousel");

    await runCreativeWorkCarouselSlideOnFailure({
      event: { workspaceId: "workspace-1", workItemId: WORK_ID, slideId: SLIDE_ID },
      error: new Error("worker killed"),
    });

    expect(carouselRepo.failCarouselSlide).toHaveBeenCalledWith(expect.objectContaining({
      slideId: SLIDE_ID,
      errorCode: "generation_interrupted",
    }));
    expect(settlement.settleTerminalRefund).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      decision: expect.objectContaining({
        refund: true,
        idempotencyKey: `creative-work:${WORK_ID}:output:${SLIDE_ID}:terminal-refund`,
      }),
    }));
  });
});
