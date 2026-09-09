import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreativeWorkCarouselSlide, CreativeWorkItem } from "@/server/db/schema";
import { canonicalJsonStringify } from "@/server/creative-work/canonical-json";
import type {
  CarouselDeckPlanV1,
  CarouselSlideStatus,
  CarouselVisualContractV1,
} from "@/server/creative-work/carousel-contracts";
import { carouselLayoutFamilyForRole } from "@/server/creative-work/carousel-contracts";

const repo = vi.hoisted(() => ({
  getCreativeWork: vi.fn(),
}));
const carouselRepo = vi.hoisted(() => ({
  listCurrentCarouselSlides: vi.fn(),
  createCarouselSlideDescendant: vi.fn(),
  refreshCarouselWorkStatus: vi.fn(),
}));
const settlement = vi.hoisted(() => ({
  startGenerationSettlement: vi.fn(),
}));
const adapters = vi.hoisted(() => ({
  carouselSlideSettlementAdapter: vi.fn(),
  carouselSlideBillingKey: vi.fn(
    (workItemId: string, slideId: string) =>
      `creative-work:${workItemId}:carousel-slide:${slideId}:generate`,
  ),
}));
const chainDispatch = vi.hoisted(() => ({
  dispatchNextCarouselStage: vi.fn(),
}));
const textComposite = vi.hoisted(() => ({
  runCarouselTextComposition: vi.fn(),
}));
const fontAssets = vi.hoisted(() => ({
  approvedBrandFontAssets: vi.fn(() => []),
}));
const factPackGuard = vi.hoisted(() => ({
  validateTextFieldsAgainstFactPack: vi.fn(() => []),
}));
const storage = vi.hoisted(() => ({
  objectStorage: { get: vi.fn(), put: vi.fn() },
}));
const dbState = vi.hoisted(() => ({
  selectRows: [] as unknown[],
  updateRows: [] as unknown[],
}));
const dbMock = vi.hoisted(() => {
  const chain = {
    select: vi.fn(() => chain),
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(dbState.selectRows.shift() ?? [])),
    update: vi.fn(() => chain),
    set: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(dbState.updateRows.shift() ?? [])),
  };
  return chain;
});

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: repo.getCreativeWork,
}));
vi.mock("@/server/repositories/creative-work-carousel", () => ({
  listCurrentCarouselSlides: carouselRepo.listCurrentCarouselSlides,
  createCarouselSlideDescendant: carouselRepo.createCarouselSlideDescendant,
  refreshCarouselWorkStatus: carouselRepo.refreshCarouselWorkStatus,
}));
vi.mock("@/server/generation/settlement", () => settlement);
vi.mock("@/server/generation/settlement-adapters", () => adapters);
vi.mock("@/server/application/advance-carousel-generation", () => chainDispatch);
vi.mock("@/server/creative-work/text-composite", () => ({
  runCarouselTextComposition: textComposite.runCarouselTextComposition,
  TextCompositionError: class TextCompositionError extends Error {
    constructor(public code: string) {
      super(code);
      this.name = "TextCompositionError";
    }
  },
}));
vi.mock("@/server/brand-training/font-assets", () => fontAssets);
vi.mock("@/server/creative-work/fact-pack", () => factPackGuard);
vi.mock("@/server/storage", () => storage);
vi.mock("@/server/db", () => ({ db: dbMock }));

import { reviseCarouselDeck, reviseCarouselSlide } from "./revise-carousel";

const WORKSPACE = "workspace-1";
const WORK = "work-1";
const USER = "user-1";
const REVISION_KEY = "00000000-0000-4000-8000-000000000201";
const CONTRACT_HASH = "contract-hash-1";

let slides: CreativeWorkCarouselSlide[];

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
    contractHash: CONTRACT_HASH,
  };
}

function deckFixture(slideCount = 5): CarouselDeckPlanV1 {
  const roles = ["hook", "context", "problem", "argument", "closing", "evidence", "method", "cta"] as const;
  return {
    version: 1,
    revision: "deck-r1",
    workId: WORK,
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
    workspaceId: WORKSPACE,
    workItemId: WORK,
    lineageId: "lineage-1",
    parentSlideId: null,
    versionNumber: 1,
    deckRevision: "deck-r1",
    position: 1,
    role: "hook",
    primaryText: "Gancho exato do grupo",
    secondaryText: null,
    copyAuthority: "ai_proposal",
    sourceFactIds: [],
    layoutFamily: "impact",
    status: "draft",
    providerBaseKey: null,
    outputKey: null,
    previewKey: null,
    visualContractHash: CONTRACT_HASH,
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

function slideRoleAt(position: number) {
  const roles = ["hook", "context", "problem", "argument", "closing"] as const;
  return roles[position - 1];
}

function completedSlideRow(position: number, overrides: Partial<CreativeWorkCarouselSlide> = {}) {
  return carouselSlideRow({
    id: `slide-${position}`,
    lineageId: `lineage-${position}`,
    position,
    role: slideRoleAt(position),
    layoutFamily: carouselLayoutFamilyForRole(slideRoleAt(position)),
    primaryText: `Texto primário ${position} do grupo de terapia`,
    status: "completed",
    providerBaseKey: `base-${position}`,
    outputKey: `out-${position}`,
    previewKey: `out-${position}`,
    quality: { objectivePassed: true },
    ...overrides,
  });
}

function workFixture(overrides: Partial<CreativeWorkItem> = {}): { work: CreativeWorkItem; outputs: unknown[]; sources: unknown[] } {
  return {
    work: {
      id: WORK,
      workspaceId: WORKSPACE,
      toolKind: "carousel",
      status: "completed",
      clientProfileId: "profile-1",
      createdByUserId: USER,
      carouselApprovedRevision: null,
      carouselQuality: null,
      inputSnapshot: {
        factPack: { facts: [] },
        carousel: {
          version: 1,
          preparedRevision: "prep-1",
          deck: deckFixture(5),
          visualContract: visualContractFixture(),
        },
      },
    } as CreativeWorkItem,
    outputs: [],
    sources: [],
    ...overrides,
  };
}

function resetDeck(statuses: Record<number, CarouselSlideStatus> = {}) {
  slides = [1, 2, 3, 4, 5].map((position) => {
    const status = statuses[position] ?? "completed";
    if (status === "completed") return completedSlideRow(position);
    return carouselSlideRow({
      id: `slide-${position}`,
      lineageId: `lineage-${position}`,
      position,
      role: slideRoleAt(position),
      layoutFamily: carouselLayoutFamilyForRole(slideRoleAt(position)),
      primaryText: `Texto primário ${position} do grupo de terapia`,
      status,
      ...(status === "failed" ? { errorCode: "objective_failed" } : {}),
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDeck();
  dbState.selectRows.length = 0;
  dbState.updateRows.length = 0;
  repo.getCreativeWork.mockResolvedValue(workFixture());
  carouselRepo.listCurrentCarouselSlides.mockImplementation(async () => [...slides]);
  carouselRepo.refreshCarouselWorkStatus.mockImplementation(async () => workFixture().work);
  carouselRepo.createCarouselSlideDescendant.mockImplementation(
    async (input: { parentSlideId: string; status: CarouselSlideStatus; position: number; role: string }) => {
      const parent = slides.find((row) => row.id === input.parentSlideId);
      if (!parent || !parent.isCurrent) return null;
      const child = carouselSlideRow({
        id: `child-${input.parentSlideId}`,
        lineageId: parent.lineageId,
        parentSlideId: input.parentSlideId,
        versionNumber: parent.versionNumber + 1,
        position: input.position,
        role: input.role as CreativeWorkCarouselSlide["role"],
        status: input.status,
      });
      slides = [...slides.map((row) => (row.id === parent.id ? { ...row, isCurrent: false } : row)), child];
      return child;
    },
  );
  settlement.startGenerationSettlement.mockResolvedValue({
    ok: true,
    value: { slide: { id: "child-slide-1" } },
  });
  adapters.carouselSlideSettlementAdapter.mockImplementation((args: Record<string, unknown>) => args);
  chainDispatch.dispatchNextCarouselStage.mockResolvedValue({ ok: true, value: { dispatched: 1 } });
  textComposite.runCarouselTextComposition.mockResolvedValue({
    buffer: Buffer.from("recomposed-final"),
    provenance: { authority: "fallback" },
  });
  storage.objectStorage.get.mockResolvedValue(Buffer.from("provider-base-bytes"));
  storage.objectStorage.put.mockResolvedValue(undefined);
  factPackGuard.validateTextFieldsAgainstFactPack.mockReturnValue([]);
});

const slideInput = {
  workspaceId: WORKSPACE,
  workItemId: WORK,
  slideId: "slide-1",
  expectedVersion: 1,
  revisionKey: REVISION_KEY,
  userId: USER,
};

describe("reviseCarouselSlide", () => {
  it("copy revision creates a completed child, keeps the old row, sets human authority, reuses the provider base and records zero provider or credit calls", async () => {
    const result = await reviseCarouselSlide({
      ...slideInput,
      kind: "copy",
      primaryText: "Novo texto primário do gancho",
      secondaryText: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.replay).toBe(false);
    expect(result.value.slide.status).toBe("completed");
    expect(result.value.slide.versionNumber).toBe(2);
    expect(slides.find((row) => row.id === "slide-1")?.isCurrent).toBe(false);

    expect(carouselRepo.createCarouselSlideDescendant).toHaveBeenCalledTimes(1);
    expect(carouselRepo.createCarouselSlideDescendant).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE,
        workItemId: WORK,
        parentSlideId: "slide-1",
        copyAuthority: "human_edit",
        status: "completed",
        providerBaseKey: "base-1",
        primaryText: "Novo texto primário do gancho",
        secondaryText: null,
        visualContractHash: CONTRACT_HASH,
        generationOperationKey: REVISION_KEY,
      }),
    );
    expect(storage.objectStorage.get).toHaveBeenCalledWith("base-1");
    expect(storage.objectStorage.put).toHaveBeenCalledTimes(1);
    expect(textComposite.runCarouselTextComposition).toHaveBeenCalledTimes(1);
    expect(textComposite.runCarouselTextComposition).toHaveBeenCalledWith(
      expect.objectContaining({ primaryText: "Novo texto primário do gancho", secondaryText: null }),
    );
    expect(adapters.carouselSlideSettlementAdapter).not.toHaveBeenCalled();
    expect(settlement.startGenerationSettlement).not.toHaveBeenCalled();
    expect(chainDispatch.dispatchNextCarouselStage).not.toHaveBeenCalled();
  });

  it("rejects copy text that is not grounded in the frozen fact pack before writing any descendant", async () => {
    factPackGuard.validateTextFieldsAgainstFactPack.mockReturnValue([
      { field: "slides.1.primaryText", code: "unsupported_claim", message: "claim not grounded" },
    ]);

    const result = await reviseCarouselSlide({
      ...slideInput,
      kind: "copy",
      primaryText: "Promessa impossível",
      secondaryText: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_context");
    expect(carouselRepo.createCarouselSlideDescendant).not.toHaveBeenCalled();
    expect(storage.objectStorage.put).not.toHaveBeenCalled();
    expect(textComposite.runCarouselTextComposition).not.toHaveBeenCalled();
  });

  it("visual revision creates a draft child with the same contract and anchor, settles exactly one provider call and keeps the parent", async () => {
    const result = await reviseCarouselSlide({
      ...slideInput,
      kind: "visual",
      instruction: "  Fundo mais claro  ",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slide.status).toBe("draft");

    expect(carouselRepo.createCarouselSlideDescendant).toHaveBeenCalledWith(
      expect.objectContaining({
        parentSlideId: "slide-1",
        status: "draft",
        providerBaseKey: null,
        outputKey: null,
        visualContractHash: CONTRACT_HASH,
        copyAuthority: "ai_proposal",
        primaryText: "Texto primário 1 do grupo de terapia",
        generationOperationKey: REVISION_KEY,
      }),
    );
    expect(adapters.carouselSlideSettlementAdapter).toHaveBeenCalledTimes(1);
    expect(adapters.carouselSlideSettlementAdapter).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      workItemId: WORK,
      slideId: result.value.slide.id,
      userId: USER,
      anchorKey: null,
      operationKey: REVISION_KEY,
    });
    expect(settlement.startGenerationSettlement).toHaveBeenCalledTimes(1);
    expect(slides.find((row) => row.id === "slide-1")?.isCurrent).toBe(false);
  });

  it("does not invalidate dependent slides when an anchor is visually revised (I5 blocked)", async () => {
    slides = slides.map((row) => (
      row.position === 1 || row.position === 3
        ? { ...row, anchorKey: "creative-work/work-1/anchor-board.png" }
        : row
    ));

    const result = await reviseCarouselSlide({
      ...slideInput,
      kind: "visual",
      instruction: "Troque o fundo da capa",
    });

    expect(result.ok).toBe(true);
    expect(carouselRepo.createCarouselSlideDescendant).toHaveBeenCalledOnce();
    expect(settlement.startGenerationSettlement).toHaveBeenCalledTimes(1);
    expect(adapters.carouselSlideSettlementAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ anchorKey: "creative-work/work-1/anchor-board.png" }),
    );
    expect(chainDispatch.dispatchNextCarouselStage).not.toHaveBeenCalled();
    expect(slides.find((row) => row.id === "slide-3")?.isCurrent).toBe(true);
    expect(slides.filter((row) => row.isCurrent)).toHaveLength(5);
  });

  it("retry is accepted only from a failed current slide, creates one child with the same copy and settles one provider call without requeueing the parent", async () => {
    resetDeck({ 2: "failed" });
    const result = await reviseCarouselSlide({
      ...slideInput,
      slideId: "slide-2",
      kind: "retry",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slide.status).toBe("draft");
    expect(carouselRepo.createCarouselSlideDescendant).toHaveBeenCalledWith(
      expect.objectContaining({
        parentSlideId: "slide-2",
        status: "draft",
        primaryText: "Texto primário 2 do grupo de terapia",
        copyAuthority: "ai_proposal",
        layoutFamily: "development",
        generationOperationKey: REVISION_KEY,
      }),
    );
    expect(settlement.startGenerationSettlement).toHaveBeenCalledTimes(1);
    expect(slides.find((row) => row.id === "slide-2")?.status).toBe("failed");
    expect(slides.find((row) => row.id === "slide-2")?.isCurrent).toBe(false);

    const completedResult = await reviseCarouselSlide({
      ...slideInput,
      slideId: "slide-1",
      kind: "retry",
    });
    expect(completedResult.ok).toBe(false);
    if (completedResult.ok) return;
    expect(completedResult.error.code).toBe("slide_not_failed");
    expect(carouselRepo.createCarouselSlideDescendant).toHaveBeenCalledTimes(1);
  });

  it("stale expectedVersion returns a conflict without writing", async () => {
    const result = await reviseCarouselSlide({
      ...slideInput,
      expectedVersion: 7,
      kind: "copy",
      primaryText: "Texto novo",
      secondaryText: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("slide_version_conflict");
    expect(carouselRepo.createCarouselSlideDescendant).not.toHaveBeenCalled();
    expect(settlement.startGenerationSettlement).not.toHaveBeenCalled();
  });

  it("an idempotent revisionKey returns the same descendant without new writes", async () => {
    const existing = completedSlideRow(1, {
      id: "child-slide-1",
      lineageId: "lineage-1",
      parentSlideId: "slide-1",
      versionNumber: 2,
      generationOperationKey: REVISION_KEY,
      copyAuthority: "human_edit",
    });
    dbState.selectRows.push([existing]);
    slides = slides.map((row) => (row.id === "slide-1" ? { ...row, isCurrent: false } : row));
    slides = [...slides, existing];

    const result = await reviseCarouselSlide({
      ...slideInput,
      kind: "copy",
      primaryText: "Texto novo",
      secondaryText: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.replay).toBe(true);
    expect(result.value.slide.id).toBe("child-slide-1");
    expect(carouselRepo.createCarouselSlideDescendant).not.toHaveBeenCalled();
    expect(settlement.startGenerationSettlement).not.toHaveBeenCalled();
    expect(storage.objectStorage.put).not.toHaveBeenCalled();
  });
});

describe("reviseCarouselDeck", () => {
  const deckInput = {
    workspaceId: WORKSPACE,
    workItemId: WORK,
    expectedRevision: "deck-r1",
    revisionKey: REVISION_KEY,
    userId: USER,
  };

  it("reorder recalculates positions and role→family mapping and invalidates only lineages whose position or family changed", async () => {
    const plan = deckFixture(5);
    const reorderedSlides = plan.slides.map((slide) => {
      if (slide.slideId === "slide-2") return { ...slide, position: 5 };
      if (slide.slideId === "slide-5") return { ...slide, position: 2 };
      return slide;
    });
    const result = await reviseCarouselDeck({
      ...deckInput,
      plan: { ...plan, slides: reorderedSlides },
      globalVisualInstruction: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.replay).toBe(false);
    expect(result.value.deckRevision).toBe(`deck-${REVISION_KEY}`);

    const calls = carouselRepo.createCarouselSlideDescendant.mock.calls.map(
      (call) => call[0] as Record<string, unknown>,
    );
    expect(calls).toHaveLength(2);
    const movedClosing = calls.find((call) => call.parentSlideId === "slide-5");
    const movedContext = calls.find((call) => call.parentSlideId === "slide-2");
    expect(movedClosing).toMatchObject({ position: 2, role: "closing", layoutFamily: "respite", status: "completed" });
    expect(movedContext).toMatchObject({ position: 5, role: "context", layoutFamily: "development", status: "completed" });
    for (const call of calls) {
      expect(call.deckRevision).toBe(`deck-${REVISION_KEY}`);
    }
    // Position-only moves keep the parent's final output; no recomposition.
    expect(storage.objectStorage.put).not.toHaveBeenCalled();
    for (const slideId of ["slide-1", "slide-3", "slide-4"]) {
      expect(slides.find((row) => row.id === slideId)?.isCurrent).toBe(true);
    }
    expect(chainDispatch.dispatchNextCarouselStage).not.toHaveBeenCalled();

    expect(dbMock.update).toHaveBeenCalledTimes(1);
    const setArg = dbMock.set.mock.calls[0][0] as { inputSnapshot: { carousel: { deck: { revision: string } } } };
    expect(setArg.inputSnapshot.carousel.deck.revision).toBe(`deck-${REVISION_KEY}`);
  });

  it("global visual instruction creates a new deck revision, invalidates every current slide, clears approval and quality and restarts the anchor trio first", async () => {
    repo.getCreativeWork.mockResolvedValue(
      workFixture({
        work: {
          ...(workFixture().work as CreativeWorkItem),
          carouselApprovedRevision: "deck-r1",
          carouselQuality: {
            version: 1,
            objectivePassed: true,
            advisoryWarnings: ["aviso anterior"],
            contactSheetKey: "sheet",
            reviewedAt: "2026-08-30T10:00:00.000Z",
          },
        },
      } as { work: CreativeWorkItem; outputs: unknown[]; sources: unknown[] }),
    );

    const plan = deckFixture(5);
    const result = await reviseCarouselDeck({
      ...deckInput,
      plan,
      globalVisualInstruction: "  Sem retratos humanos  ",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.deckRevision).toBe(`deck-${REVISION_KEY}`);

    const setArg = dbMock.set.mock.calls[0][0] as {
      inputSnapshot: { carousel: { deck: { revision: string }; visualContract: CarouselVisualContractV1 } };
      carouselApprovedRevision: string | null;
      carouselQuality: unknown;
    };
    expect(setArg.carouselApprovedRevision).toBeNull();
    expect(setArg.carouselQuality).toBeNull();
    expect(setArg.inputSnapshot.carousel.deck.revision).toBe(`deck-${REVISION_KEY}`);
    expect(setArg.inputSnapshot.carousel.visualContract.directionInstruction).toBe("Sem retratos humanos");
    const { contractHash: _ignored, ...withoutHash } = setArg.inputSnapshot.carousel.visualContract;
    const expectedHash = createHash("sha256").update(canonicalJsonStringify(withoutHash)).digest("hex");
    expect(setArg.inputSnapshot.carousel.visualContract.contractHash).toBe(expectedHash);
    expect(setArg.inputSnapshot.carousel.visualContract.contractHash).not.toBe(CONTRACT_HASH);

    const calls = carouselRepo.createCarouselSlideDescendant.mock.calls.map(
      (call) => call[0] as Record<string, unknown>,
    );
    expect(calls).toHaveLength(5);
    for (const call of calls) {
      expect(call.status).toBe("draft");
      expect(call.visualContractHash).toBe(expectedHash);
      expect(call.deckRevision).toBe(`deck-${REVISION_KEY}`);
      expect(call.generationOperationKey).toMatch(new RegExp(`^${REVISION_KEY}::slide-`));
    }
    expect(chainDispatch.dispatchNextCarouselStage).toHaveBeenCalledTimes(1);
    expect(chainDispatch.dispatchNextCarouselStage).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      workItemId: WORK,
      userId: USER,
    });
    expect(carouselRepo.refreshCarouselWorkStatus).toHaveBeenCalled();
  });

  it("a stale expectedRevision returns a conflict without writing", async () => {
    const result = await reviseCarouselDeck({
      ...deckInput,
      expectedRevision: "deck-r0",
      plan: deckFixture(5),
      globalVisualInstruction: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("revision_conflict");
    expect(carouselRepo.createCarouselSlideDescendant).not.toHaveBeenCalled();
    expect(dbMock.update).not.toHaveBeenCalled();
    expect(chainDispatch.dispatchNextCarouselStage).not.toHaveBeenCalled();
  });

  it("an idempotent deck revisionKey returns the same current slides without writing", async () => {
    const replayed = completedSlideRow(1, { deckRevision: `deck-${REVISION_KEY}` });
    dbState.selectRows.push([replayed]);

    const result = await reviseCarouselDeck({
      ...deckInput,
      plan: deckFixture(5),
      globalVisualInstruction: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.replay).toBe(true);
    expect(result.value.deckRevision).toBe(`deck-${REVISION_KEY}`);
    expect(carouselRepo.createCarouselSlideDescendant).not.toHaveBeenCalled();
    expect(dbMock.update).not.toHaveBeenCalled();
    expect(chainDispatch.dispatchNextCarouselStage).not.toHaveBeenCalled();
  });
});
