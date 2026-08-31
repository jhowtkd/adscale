import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type {
  CreativeWorkCarouselSlide,
  CreativeWorkItem,
  CreativeWorkOutput,
  CreativeWorkSource,
} from "../db/schema";
import type {
  CarouselDeckPlanV1,
} from "../creative-work/carousel-contracts";

const mocks = vi.hoisted(() => {
  const state = {
    selectResults: [] as unknown[][],
    insertResults: [] as unknown[][],
    updateResults: [] as unknown[][],
  };

  const resetState = () => {
    state.selectResults.length = 0;
    state.insertResults.length = 0;
    state.updateResults.length = 0;
  };

  const chain = () => {
    const queryChain: Record<string, unknown> = {};
    queryChain.from = vi.fn(() => queryChain);
    queryChain.where = vi.fn(() => queryChain);
    queryChain.orderBy = vi.fn(() => queryChain);
    queryChain.limit = vi.fn(() => queryChain);
    queryChain.then = (resolve: (value: unknown) => void) =>
      Promise.resolve(state.selectResults.shift() ?? []).then(resolve);
    return queryChain;
  };

  const selectMock = vi.fn(() => chain());
  const executeMock = vi.fn(async () => undefined);

  const valuesMock = vi.fn(() => ({
    returning: vi.fn(() => Promise.resolve(state.insertResults.shift() ?? [])),
    onConflictDoNothing: vi.fn(() => Promise.resolve([])),
  }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));

  const setMock = vi.fn(() => ({
    where: vi.fn(() => ({
      returning: vi.fn(() => Promise.resolve(state.updateResults.shift() ?? [])),
    })),
  }));
  const updateMock = vi.fn(() => ({ set: setMock }));

  const transactionMock = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      select: selectMock,
      insert: insertMock,
      update: updateMock,
      delete: vi.fn(),
      execute: executeMock,
    }),
  );

  return {
    state,
    resetState,
    selectMock,
    executeMock,
    insertMock,
    valuesMock,
    updateMock,
    setMock,
    transactionMock,
  };
});

vi.mock("../db", () => ({
  db: {
    select: mocks.selectMock,
    insert: mocks.insertMock,
    update: mocks.updateMock,
    delete: vi.fn(),
    transaction: mocks.transactionMock,
    execute: mocks.executeMock,
  },
}));

const getCreativeWorkMock = vi.hoisted(() => ({ getCreativeWork: vi.fn() }));
vi.mock("./creative-work", () => ({
  getCreativeWork: getCreativeWorkMock.getCreativeWork,
}));

import {
  approveCarouselDeckRevision,
  completeCarouselSlide,
  createCarouselSlideDescendant,
  failCarouselSlide,
  getCreativeWorkCarouselAggregate,
  listCurrentCarouselSlides,
  markCarouselSlideProcessing,
  materializeCarouselSlides,
  queueCarouselSlide,
  refreshCarouselWorkStatus,
  setRemainingCarouselAnchorKey,
} from "./creative-work-carousel";
import type { CarouselDeckQualityV1 } from "../creative-work/carousel-contracts";

const dialect = new PgDialect();

function serializedCondition(condition: unknown) {
  return dialect.sqlToQuery(condition as SQL);
}

function slide(overrides: Partial<CreativeWorkCarouselSlide> = {}): CreativeWorkCarouselSlide {
  return {
    id: "slide-1",
    workspaceId: "ws-1",
    workItemId: "work-1",
    lineageId: "lineage-1",
    parentSlideId: null,
    versionNumber: 1,
    deckRevision: "deck-r1",
    position: 1,
    role: "hook",
    primaryText: "Gancho forte",
    secondaryText: null,
    copyAuthority: "ai_proposal",
    sourceFactIds: [],
    layoutFamily: "impact",
    status: "draft",
    providerBaseKey: null,
    outputKey: null,
    previewKey: null,
    visualContractHash: "contract-hash",
    anchorKey: null,
    generationOperationKey: "deck-r1:slide-1",
    errorCode: null,
    quality: null,
    isCurrent: true,
    createdAt: new Date(),
    queuedAt: null,
    terminalAt: null,
    updatedAt: new Date(),
    ...overrides,
  } as CreativeWorkCarouselSlide;
}

function workItem(overrides: Partial<CreativeWorkItem> = {}): CreativeWorkItem {
  return {
    id: "work-1",
    workspaceId: "ws-1",
    clientProfileId: "profile-1",
    createdByUserId: "user-1",
    toolKind: "carousel",
    status: "ready",
    brief: null,
    format: "4:5",
    copy: null,
    identitySnapshot: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CreativeWorkItem;
}

const deck: CarouselDeckPlanV1 = {
  version: 1,
  revision: "deck-r1",
  workId: "work-1",
  objective: "Vender o novo plano",
  audience: "Lojistas",
  tone: "Direto",
  promise: "Mais vendas em 7 dias",
  format: "4:5",
  slides: [
    {
      slideId: "slide-1",
      position: 1,
      role: "hook",
      purpose: "Abrir com dor",
      primaryText: "Gancho forte",
      secondaryText: null,
      authority: "ai_proposal",
      sourceFactIds: ["fact-1"],
      layoutFamily: "impact",
    },
    {
      slideId: "slide-2",
      position: 2,
      role: "context",
      purpose: "Contextualizar",
      primaryText: "Contexto curto",
      secondaryText: "Apoio",
      authority: "user_input",
      sourceFactIds: [],
      layoutFamily: "development",
    },
  ],
};

describe("carousel slide repository (CAS transitions)", () => {
  beforeEach(() => {
    mocks.resetState();
    vi.clearAllMocks();
  });

  describe("listCurrentCarouselSlides", () => {
    it("returns current slides ordered by position", async () => {
      const rows = [slide({ position: 1 }), slide({ id: "slide-2", position: 2 })];
      mocks.state.selectResults.push(rows);

      const result = await listCurrentCarouselSlides("ws-1", "work-1");

      expect(result).toEqual(rows);
      expect(serializedCondition(mocks.selectMock.mock.results[0]!.value.where.mock.calls[0]![0])).toMatchObject({
        sql: expect.stringContaining('"is_current"'),
      });
    });
  });

  describe("materializeCarouselSlides", () => {
    it("holds the per-work advisory lock, inserts draft rows idempotently and returns current slides", async () => {
      const currentRows = [
        slide({ deckRevision: "deck-r1", generationOperationKey: "deck-r1:slide-1" }),
        slide({ id: "slide-2", lineageId: "lineage-2", position: 2, role: "context", layoutFamily: "development", generationOperationKey: "deck-r1:slide-2" }),
      ];
      mocks.state.selectResults.push(currentRows);

      const result = await materializeCarouselSlides({
        workspaceId: "ws-1",
        workItemId: "work-1",
        deck,
        visualContractHash: "contract-hash",
      });

      expect(result).toEqual(currentRows);
      expect(mocks.transactionMock).toHaveBeenCalledTimes(1);
      expect(mocks.executeMock).toHaveBeenCalledTimes(1);
      expect(serializedCondition(mocks.executeMock.mock.calls[0]![0]).sql).toContain("pg_advisory_xact_lock");
      const lockParams = serializedCondition(mocks.executeMock.mock.calls[0]![0]).params as string[];
      expect(lockParams[0]).toContain("carousel");

      const inserted = mocks.valuesMock.mock.calls[0]![0] as Array<Record<string, unknown>>;
      expect(inserted).toHaveLength(2);
      expect(inserted[0]).toMatchObject({
        workspaceId: "ws-1",
        workItemId: "work-1",
        versionNumber: 1,
        deckRevision: "deck-r1",
        position: 1,
        role: "hook",
        primaryText: "Gancho forte",
        secondaryText: null,
        copyAuthority: "ai_proposal",
        sourceFactIds: ["fact-1"],
        layoutFamily: "impact",
        status: "draft",
        visualContractHash: "contract-hash",
        generationOperationKey: "deck-r1:slide-1",
        isCurrent: true,
      });
      expect(inserted[0].lineageId).toEqual(expect.any(String));
      expect(inserted[1]).toMatchObject({
        position: 2,
        role: "context",
        copyAuthority: "user_input",
        generationOperationKey: "deck-r1:slide-2",
      });
    });
  });

  describe("queueCarouselSlide", () => {
    it("moves draft to queued with anchor and operation key", async () => {
      const queued = slide({ status: "queued", anchorKey: "anchor-1", generationOperationKey: "op-1" });
      mocks.state.updateResults.push([queued]);

      const result = await queueCarouselSlide({
        workspaceId: "ws-1",
        workItemId: "work-1",
        slideId: "slide-1",
        anchorKey: "anchor-1",
        operationKey: "op-1",
      });

      expect(result).toEqual(queued);
      const patch = mocks.setMock.mock.calls[0]![0] as Record<string, unknown>;
      expect(patch).toMatchObject({
        status: "queued",
        anchorKey: "anchor-1",
        generationOperationKey: "op-1",
        errorCode: null,
      });
      expect(patch.queuedAt).toBeInstanceOf(Date);
      const condition = serializedCondition(mocks.setMock.mock.results[0]!.value.where.mock.calls[0]![0]);
      expect(condition.sql).toContain("in");
    });

    it("requeues a failed slide", async () => {
      const requeued = slide({ status: "queued" });
      mocks.state.updateResults.push([requeued]);

      const result = await queueCarouselSlide({
        workspaceId: "ws-1",
        workItemId: "work-1",
        slideId: "slide-1",
        anchorKey: null,
        operationKey: "op-2",
      });

      expect(result).toEqual(requeued);
    });

    it("returns null when the slide is not draft or failed", async () => {
      mocks.state.updateResults.push([]);

      const result = await queueCarouselSlide({
        workspaceId: "ws-1",
        workItemId: "work-1",
        slideId: "slide-1",
        anchorKey: null,
        operationKey: "op-3",
      });

      expect(result).toBeNull();
    });
  });

  describe("markCarouselSlideProcessing", () => {
    it("moves queued to processing", async () => {
      const processing = slide({ status: "processing" });
      mocks.state.updateResults.push([processing]);

      const result = await markCarouselSlideProcessing({
        workspaceId: "ws-1",
        workItemId: "work-1",
        slideId: "slide-1",
      });

      expect(result).toEqual(processing);
      const patch = mocks.setMock.mock.calls[0]![0] as Record<string, unknown>;
      expect(patch.status).toBe("processing");
    });

    it("returns null when the slide is not queued", async () => {
      mocks.state.updateResults.push([]);

      const result = await markCarouselSlideProcessing({
        workspaceId: "ws-1",
        workItemId: "work-1",
        slideId: "slide-1",
      });

      expect(result).toBeNull();
    });
  });

  describe("completeCarouselSlide", () => {
    it("moves processing to completed with provider keys and quality", async () => {
      const completed = slide({
        status: "completed",
        providerBaseKey: "provider/base",
        outputKey: "provider/base/output.png",
        previewKey: "provider/base/preview.png",
        quality: { score: 1 },
        terminalAt: new Date(),
      });
      mocks.state.updateResults.push([completed]);

      const result = await completeCarouselSlide({
        workspaceId: "ws-1",
        workItemId: "work-1",
        slideId: "slide-1",
        providerBaseKey: "provider/base",
        outputKey: "provider/base/output.png",
        previewKey: "provider/base/preview.png",
        quality: { score: 1 },
      });

      expect(result).toEqual(completed);
      const patch = mocks.setMock.mock.calls[0]![0] as Record<string, unknown>;
      expect(patch).toMatchObject({
        status: "completed",
        providerBaseKey: "provider/base",
        outputKey: "provider/base/output.png",
        previewKey: "provider/base/preview.png",
        errorCode: null,
      });
      expect(patch.terminalAt).toBeInstanceOf(Date);
    });

    it("returns null for late completions after the lease was lost", async () => {
      mocks.state.updateResults.push([]);

      const result = await completeCarouselSlide({
        workspaceId: "ws-1",
        workItemId: "work-1",
        slideId: "slide-1",
        providerBaseKey: "provider/base",
        outputKey: "provider/base/output.png",
        previewKey: null,
        quality: {},
      });

      expect(result).toBeNull();
    });
  });

  describe("failCarouselSlide", () => {
    it("moves processing to failed with an error code", async () => {
      const failed = slide({ status: "failed", errorCode: "provider_error", terminalAt: new Date() });
      mocks.state.updateResults.push([failed]);

      const result = await failCarouselSlide({
        workspaceId: "ws-1",
        workItemId: "work-1",
        slideId: "slide-1",
        errorCode: "provider_error",
      });

      expect(result).toEqual(failed);
      const patch = mocks.setMock.mock.calls[0]![0] as Record<string, unknown>;
      expect(patch).toMatchObject({ status: "failed", errorCode: "provider_error" });
    });

    it("returns null when the slide is not processing", async () => {
      mocks.state.updateResults.push([]);

      const result = await failCarouselSlide({
        workspaceId: "ws-1",
        workItemId: "work-1",
        slideId: "slide-1",
        errorCode: "provider_error",
      });

      expect(result).toBeNull();
    });
  });

  describe("setRemainingCarouselAnchorKey", () => {
    it("sets the anchor key only on slides that still miss one", async () => {
      const anchored = [
        slide({ id: "slide-2", position: 2, anchorKey: "anchor-1" }),
        slide({ id: "slide-3", position: 3, anchorKey: "anchor-1" }),
      ];
      mocks.state.updateResults.push(anchored);

      const result = await setRemainingCarouselAnchorKey({
        workspaceId: "ws-1",
        workItemId: "work-1",
        slideIds: ["slide-2", "slide-3"],
        anchorKey: "anchor-1",
      });

      expect(result).toEqual(anchored);
      const patch = mocks.setMock.mock.calls[0]![0] as Record<string, unknown>;
      expect(patch.anchorKey).toBe("anchor-1");
    });

    it("returns an empty list without querying when no slide ids are given", async () => {
      const result = await setRemainingCarouselAnchorKey({
        workspaceId: "ws-1",
        workItemId: "work-1",
        slideIds: [],
        anchorKey: "anchor-1",
      });

      expect(result).toEqual([]);
      expect(mocks.updateMock).not.toHaveBeenCalled();
    });
  });

  describe("createCarouselSlideDescendant", () => {
    it("keeps one current slide per position while preserving the parent", async () => {
      const parent = slide({ id: "slide-1", position: 1, versionNumber: 1, status: "completed" });
      const flippedParent = { ...parent, isCurrent: false };
      const child = slide({
        id: "slide-1-r2",
        lineageId: parent.lineageId,
        parentSlideId: parent.id,
        versionNumber: 2,
        deckRevision: "deck-r2",
        primaryText: "Novo gancho",
        copyAuthority: "human_edit",
        status: "draft",
        generationOperationKey: "slide-1-r2",
      });
      mocks.state.selectResults.push([parent]);
      mocks.state.updateResults.push([flippedParent]);
      mocks.state.insertResults.push([child]);

      const result = await createCarouselSlideDescendant({
        workspaceId: "ws-1",
        workItemId: "work-1",
        parentSlideId: parent.id,
        deckRevision: "deck-r2",
        position: 1,
        role: "hook",
        primaryText: "Novo gancho",
        secondaryText: null,
        copyAuthority: "human_edit",
        sourceFactIds: [],
        layoutFamily: "impact",
        visualContractHash: "contract-hash",
        generationOperationKey: "slide-1-r2",
        status: "draft",
        providerBaseKey: null,
        outputKey: null,
        previewKey: null,
      });

      expect(result).toEqual(child);
      expect(result?.parentSlideId).toBe(parent.id);
      expect(result?.lineageId).toBe(parent.lineageId);
      expect(result?.versionNumber).toBe(2);

      const flippedPatch = mocks.setMock.mock.calls[0]![0] as Record<string, unknown>;
      expect(flippedPatch.isCurrent).toBe(false);
      const insertedChild = mocks.valuesMock.mock.calls[0]![0] as Record<string, unknown>;
      expect(insertedChild).toMatchObject({
        parentSlideId: "slide-1",
        lineageId: "lineage-1",
        versionNumber: 2,
        isCurrent: true,
        status: "draft",
      });
      expect(mocks.transactionMock).toHaveBeenCalledTimes(1);
      expect(mocks.executeMock).toHaveBeenCalledTimes(1);
    });

    it("inserts a completed descendant with provider keys and terminal timestamps", async () => {
      const parent = slide({ id: "slide-1", status: "completed" });
      const child = slide({ id: "slide-1-r2", status: "completed", providerBaseKey: "p/b", outputKey: "p/b/o.png" });
      mocks.state.selectResults.push([parent]);
      mocks.state.updateResults.push([{ ...parent, isCurrent: false }]);
      mocks.state.insertResults.push([child]);

      await createCarouselSlideDescendant({
        workspaceId: "ws-1",
        workItemId: "work-1",
        parentSlideId: parent.id,
        deckRevision: "deck-r2",
        position: 1,
        role: "hook",
        primaryText: "Novo gancho",
        secondaryText: null,
        copyAuthority: "human_edit",
        sourceFactIds: [],
        layoutFamily: "impact",
        visualContractHash: "contract-hash",
        generationOperationKey: "slide-1-r2",
        status: "completed",
        providerBaseKey: "p/b",
        outputKey: "p/b/o.png",
        previewKey: null,
      });

      const insertedChild = mocks.valuesMock.mock.calls[0]![0] as Record<string, unknown>;
      expect(insertedChild).toMatchObject({
        status: "completed",
        providerBaseKey: "p/b",
        outputKey: "p/b/o.png",
      });
      expect(insertedChild.queuedAt).toBeInstanceOf(Date);
      expect(insertedChild.terminalAt).toBeInstanceOf(Date);
    });

    it("returns null when the parent slide is missing or no longer current", async () => {
      mocks.state.selectResults.push([]);

      const result = await createCarouselSlideDescendant({
        workspaceId: "ws-1",
        workItemId: "work-1",
        parentSlideId: "missing",
        deckRevision: "deck-r2",
        position: 1,
        role: "hook",
        primaryText: "Novo gancho",
        secondaryText: null,
        copyAuthority: "human_edit",
        sourceFactIds: [],
        layoutFamily: "impact",
        visualContractHash: "contract-hash",
        generationOperationKey: "slide-1-r2",
        status: "draft",
        providerBaseKey: null,
        outputKey: null,
        previewKey: null,
      });

      expect(result).toBeNull();
      expect(mocks.updateMock).not.toHaveBeenCalled();
      expect(mocks.insertMock).not.toHaveBeenCalled();
    });
  });

  describe("refreshCarouselWorkStatus", () => {
    it("derives generating while any current slide is queued or processing", async () => {
      mocks.state.selectResults.push([workItem()]);
      mocks.state.selectResults.push([
        slide({ status: "completed" }),
        slide({ id: "slide-2", status: "queued" }),
      ]);
      const updated = workItem({ status: "generating" });
      mocks.state.updateResults.push([updated]);

      const result = await refreshCarouselWorkStatus({ workspaceId: "ws-1", workItemId: "work-1" });

      expect(result).toEqual(updated);
      expect(mocks.setMock.mock.calls[0]![0]).toMatchObject({ status: "generating" });
    });

    it("derives ready when the work has no current slides", async () => {
      mocks.state.selectResults.push([workItem()]);
      mocks.state.selectResults.push([]);
      mocks.state.updateResults.push([workItem({ status: "ready" })]);

      const result = await refreshCarouselWorkStatus({ workspaceId: "ws-1", workItemId: "work-1" });

      expect(mocks.setMock.mock.calls[0]![0]).toMatchObject({ status: "ready" });
      expect(result?.status).toBe("ready");
    });

    it("derives completed when every current slide is completed", async () => {
      mocks.state.selectResults.push([workItem()]);
      mocks.state.selectResults.push([slide({ status: "completed" }), slide({ id: "slide-2", status: "completed" })]);
      mocks.state.updateResults.push([workItem({ status: "completed" })]);

      await refreshCarouselWorkStatus({ workspaceId: "ws-1", workItemId: "work-1" });

      expect(mocks.setMock.mock.calls[0]![0]).toMatchObject({ status: "completed" });
    });

    it("derives failed when every current slide is failed", async () => {
      mocks.state.selectResults.push([workItem()]);
      mocks.state.selectResults.push([slide({ status: "failed" }), slide({ id: "slide-2", status: "failed" })]);
      mocks.state.updateResults.push([workItem({ status: "failed" })]);

      await refreshCarouselWorkStatus({ workspaceId: "ws-1", workItemId: "work-1" });

      expect(mocks.setMock.mock.calls[0]![0]).toMatchObject({ status: "failed" });
    });

    it("derives partial for mixed terminal outcomes", async () => {
      mocks.state.selectResults.push([workItem()]);
      mocks.state.selectResults.push([slide({ status: "completed" }), slide({ id: "slide-2", status: "failed" })]);
      mocks.state.updateResults.push([workItem({ status: "partial" })]);

      await refreshCarouselWorkStatus({ workspaceId: "ws-1", workItemId: "work-1" });

      expect(mocks.setMock.mock.calls[0]![0]).toMatchObject({ status: "partial" });
    });

    it("returns null when the work does not exist", async () => {
      mocks.state.selectResults.push([]);

      const result = await refreshCarouselWorkStatus({ workspaceId: "ws-1", workItemId: "missing" });

      expect(result).toBeNull();
      expect(mocks.updateMock).not.toHaveBeenCalled();
    });
  });

  describe("approveCarouselDeckRevision", () => {
    it("persists the approved deck revision", async () => {
      const approved = workItem({ carouselApprovedRevision: "deck-r2" });
      mocks.state.updateResults.push([approved]);

      const result = await approveCarouselDeckRevision({
        workspaceId: "ws-1",
        workItemId: "work-1",
        deckRevision: "deck-r2",
      });

      expect(result).toEqual(approved);
      expect(mocks.setMock.mock.calls[0]![0]).toMatchObject({ carouselApprovedRevision: "deck-r2" });
    });

    it("returns null when the work does not exist", async () => {
      mocks.state.updateResults.push([]);

      const result = await approveCarouselDeckRevision({
        workspaceId: "ws-1",
        workItemId: "missing",
        deckRevision: "deck-r2",
      });

      expect(result).toBeNull();
    });
  });

  describe("getCreativeWorkCarouselAggregate", () => {
    it("reuses getCreativeWork and appends current slides for carousel works", async () => {
      const work = workItem();
      const outputs = [{ id: "output-1" }] as unknown as CreativeWorkOutput[];
      const sources = [{ id: "source-1" }] as unknown as CreativeWorkSource[];
      const slides = [slide()];
      getCreativeWorkMock.getCreativeWork.mockResolvedValue({ work, outputs, sources });
      mocks.state.selectResults.push(slides);

      const result = await getCreativeWorkCarouselAggregate("ws-1", "work-1");

      expect(getCreativeWorkMock.getCreativeWork).toHaveBeenCalledWith("ws-1", "work-1");
      expect(result).toEqual({ work, outputs, sources, carouselSlides: slides });
      expect(result?.outputs).toBe(outputs);
    });

    it("returns an empty slide list for non-carousel works without querying slides", async () => {
      const work = workItem({ toolKind: "single" });
      const outputs = [{ id: "output-1" }] as unknown as CreativeWorkOutput[];
      getCreativeWorkMock.getCreativeWork.mockResolvedValue({ work, outputs, sources: [] });

      const result = await getCreativeWorkCarouselAggregate("ws-1", "work-1");

      expect(result).toEqual({ work, outputs, sources: [], carouselSlides: [] });
      expect(mocks.selectMock).not.toHaveBeenCalled();
    });

    it("returns null when the work does not exist", async () => {
      getCreativeWorkMock.getCreativeWork.mockResolvedValue(null);

      const result = await getCreativeWorkCarouselAggregate("ws-1", "missing");

      expect(result).toBeNull();
      expect(mocks.selectMock).not.toHaveBeenCalled();
    });
  });
});

describe("carousel deck quality column contract", () => {
  it("accepts the CarouselDeckQualityV1 payload shape on the work item", () => {
    const quality: CarouselDeckQualityV1 = {
      version: 1,
      objectivePassed: true,
      advisoryWarnings: [],
      contactSheetKey: null,
      reviewedAt: null,
    };
    const work = workItem({ carouselQuality: quality, carouselApprovedRevision: "deck-r1" });
    expect(work.carouselQuality?.version).toBe(1);
    expect(work.carouselApprovedRevision).toBe("deck-r1");
  });
});
