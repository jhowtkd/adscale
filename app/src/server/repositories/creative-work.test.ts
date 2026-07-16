import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreativeWorkItem, CreativeWorkOutput } from "../db/schema";

const mocks = vi.hoisted(() => {
  const state = {
    selectResults: [] as unknown[][],
    insertResults: [] as unknown[][],
    updateResults: [] as unknown[][],
    onConflictResults: [] as unknown[][],
    txUpdateResults: [] as unknown[][],
  };

  const resetState = () => {
    state.selectResults.length = 0;
    state.insertResults.length = 0;
    state.updateResults.length = 0;
    state.onConflictResults.length = 0;
    state.txUpdateResults.length = 0;
  };

  const whereMock = vi.fn();
  const orderByMock = vi.fn();
  const limitMock = vi.fn();
  const fromMock = vi.fn();

  const queryChain = (() => {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => {
      fromMock();
      return chain;
    });
    chain.where = vi.fn(() => {
      whereMock();
      return chain;
    });
    chain.orderBy = vi.fn(() => {
      orderByMock();
      return chain;
    });
    chain.limit = vi.fn(() => {
      limitMock();
      return chain;
    });
    chain.offset = vi.fn(() => chain);
    chain.groupBy = vi.fn(() => chain);
    chain.then = (resolve: (value: unknown) => void) =>
      Promise.resolve(state.selectResults.shift() ?? []).then(resolve);
    return chain;
  })();

  const selectMock = vi.fn(() => queryChain);

  const returningMock = vi.fn();
  const onConflictReturningMock = vi.fn();
  const onConflictDoNothingMock = vi.fn(() => ({
    returning: onConflictReturningMock,
  }));
  const valuesMock = vi.fn(() => ({
    returning: returningMock,
    onConflictDoNothing: onConflictDoNothingMock,
  }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));

  const setReturningMock = vi.fn();
  const setMock = vi.fn(() => ({
    where: vi.fn(() => ({ returning: setReturningMock })),
  }));
  const updateMock = vi.fn(() => ({ set: setMock }));

  const txSetReturningMock = vi.fn();
  const txSetMock = vi.fn(() => ({
    where: vi.fn(() => ({ returning: txSetReturningMock })),
  }));
  const txUpdateMock = vi.fn(() => ({ set: txSetMock }));

  const transactionMock = vi.fn(
    async (callback: (inner: unknown) => Promise<unknown>) =>
      callback({
        update: txUpdateMock,
      })
  );

  return {
    state,
    resetState,
    whereMock,
    orderByMock,
    limitMock,
    fromMock,
    selectMock,
    insertMock,
    valuesMock,
    returningMock,
    onConflictDoNothingMock,
    onConflictReturningMock,
    setMock,
    updateMock,
    setReturningMock,
    transactionMock,
    txUpdateMock,
    txSetMock,
    txSetReturningMock,
  };
});

vi.mock("../db", () => ({
  db: {
    select: mocks.selectMock,
    insert: mocks.insertMock,
    update: mocks.updateMock,
    transaction: mocks.transactionMock,
  },
}));

import {
  confirmCreativeWorkIdentity,
  completeCreativeWorkOutput,
  createCreativeWork,
  createCreativeWorkOutputs,
  failStaleCreativeWorkOutputs,
  failCreativeWorkOutput,
  getCreativeWork,
  markCreativeWorkOutputProcessing,
  refreshCreativeWorkStatus,
  selectCreativeWorkOutput,
  setCreativeWorkBrief,
  setCreativeWorkCopy,
  setCreativeWorkStatus,
} from "./creative-work";
import type {
  SocialPostBrief,
  SocialPostCopy,
} from "../creative-work/contracts";

const socialBrief: SocialPostBrief = {
  theme: "Novo produto",
  objective: "Gerar interesse",
  audience: "Empreendedores digitais",
  offer: "Teste gratuito",
};

const socialCopy: SocialPostCopy = {
  headline: "Novo produto lancado",
  body: "Uma nova forma de criar anuncios.",
  cta: "Saiba mais",
};

function workItem(overrides: Partial<CreativeWorkItem> = {}): CreativeWorkItem {
  return {
    id: "work-1",
    workspaceId: "ws-1",
    clientProfileId: "profile-1",
    createdByUserId: "user-1",
    toolKind: "social_post",
    status: "draft",
    brief: socialBrief,
    format: "4:5",
    copy: null,
    identitySnapshot: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CreativeWorkItem;
}

function workOutput(overrides: Partial<CreativeWorkOutput> = {}): CreativeWorkOutput {
  return {
    id: "output-1",
    workspaceId: "ws-1",
    workItemId: "work-1",
    creativeLevel: "balanced",
    status: "queued",
    outputKey: null,
    cost: null,
    failureCode: null,
    quality: null,
    isSelected: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CreativeWorkOutput;
}

describe("creative-work repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetState();
    mocks.returningMock.mockImplementation(() => Promise.resolve(mocks.state.insertResults.shift() ?? []));
    mocks.setReturningMock.mockImplementation(() => Promise.resolve(mocks.state.updateResults.shift() ?? []));
    mocks.onConflictReturningMock.mockImplementation(() =>
      Promise.resolve(mocks.state.onConflictResults.shift() ?? [])
    );
    mocks.txSetReturningMock.mockImplementation(() =>
      Promise.resolve(mocks.state.txUpdateResults.shift() ?? [])
    );
  });

  describe("createCreativeWork", () => {
    it("inserts a social post work item with workspace and creator scope", async () => {
      const inserted = workItem({ id: "new-work" });
      mocks.state.insertResults.push([inserted]);

      const result = await createCreativeWork({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        createdByUserId: "user-1",
        toolKind: "social_post",
        brief: socialBrief,
        format: "4:5",
      });

      expect(mocks.insertMock).toHaveBeenCalledTimes(1);
      expect(mocks.valuesMock).toHaveBeenCalledTimes(1);
      expect(mocks.valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          clientProfileId: "profile-1",
          createdByUserId: "user-1",
          toolKind: "social_post",
          format: "4:5",
          status: "draft",
          brief: socialBrief,
        }),
      );
      expect(result.id).toBe("new-work");
    });
  });

  describe("getCreativeWork", () => {
    // Deviation from brief: the brief's spec test scaffold asserted
    // `whereMock` was called 1 time. In practice `getCreativeWork` runs two
    // scoped queries (one for the work item, one for its outputs), so the
    // assertion is `2`. The 2-query shape is the intended semantics.
    it("loads work by workspace and id", async () => {
      const work = workItem();
      const outputs = [
        workOutput({ id: "o1", creativeLevel: "conservative" }),
        workOutput({ id: "o2", creativeLevel: "balanced" }),
        workOutput({ id: "o3", creativeLevel: "bold" }),
      ];

      mocks.state.selectResults.push([work]);
      mocks.state.selectResults.push(outputs);

      const result = await getCreativeWork("ws-1", "work-1");

      expect(result).not.toBeNull();
      expect(result?.work.id).toBe("work-1");
      expect(result?.outputs).toHaveLength(3);
      expect(mocks.selectMock).toHaveBeenCalledTimes(2);
      expect(mocks.whereMock).toHaveBeenCalledTimes(2);
    });

    it("returns null when the work item is not in scope", async () => {
      mocks.state.selectResults.push([]);

      const result = await getCreativeWork("ws-1", "missing");

      expect(result).toBeNull();
      expect(mocks.whereMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("failStaleCreativeWorkOutputs", () => {
    it("turns only stale queued or processing outputs into retryable failures", async () => {
      const failed = workOutput({
        status: "failed",
        failureCode: "generation_timeout",
      });
      mocks.state.updateResults.push([failed]);
      const staleBefore = new Date("2026-07-15T12:00:00.000Z");

      const result = await failStaleCreativeWorkOutputs(
        "ws-1",
        "work-1",
        staleBefore,
      );

      expect(mocks.setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          failureCode: "generation_timeout",
        }),
      );
      expect(result).toEqual([failed]);
    });
  });

  describe("setCreativeWorkCopy", () => {
    it("updates the copy scoped by workspace and work id", async () => {
      const updated = workItem({ copy: socialCopy });
      mocks.state.updateResults.push([updated]);

      const result = await setCreativeWorkCopy("ws-1", "work-1", socialCopy);

      expect(mocks.updateMock).toHaveBeenCalledTimes(1);
      expect(mocks.setMock).toHaveBeenCalledWith(
        expect.objectContaining({ copy: socialCopy }),
      );
      expect(result?.copy).toEqual(socialCopy);
    });
  });

  describe("setCreativeWorkBrief", () => {
    it("updates the brief scoped by workspace and work id", async () => {
      const nextBrief = { ...socialBrief, theme: "Atualizado" };
      const updated = workItem({ brief: nextBrief });
      mocks.state.updateResults.push([updated]);

      const result = await setCreativeWorkBrief("ws-1", "work-1", nextBrief);

      expect(mocks.updateMock).toHaveBeenCalledTimes(1);
      expect(mocks.setMock).toHaveBeenCalledWith(
        expect.objectContaining({ brief: nextBrief }),
      );
      expect(result?.brief).toEqual(nextBrief);
    });
  });

  describe("confirmCreativeWorkIdentity", () => {
    it("persists the immutable identity snapshot server-side", async () => {
      const snapshot = {
        clientProfileId: "profile-1",
        confirmedAt: "2026-01-01T00:00:00.000Z",
        assets: [],
        brandKit: {
          colors: [],
          fonts: [],
          toneOfVoice: null,
          prohibitedElements: null,
          requiredElements: null,
        },
      };
      const updated = workItem({ identitySnapshot: snapshot });
      mocks.state.updateResults.push([updated]);

      const result = await confirmCreativeWorkIdentity("ws-1", "work-1", snapshot);

      expect(mocks.updateMock).toHaveBeenCalledTimes(1);
      expect(mocks.setMock).toHaveBeenCalledWith(
        expect.objectContaining({ identitySnapshot: snapshot }),
      );
      expect(result?.identitySnapshot).toEqual(snapshot);
    });

    it("transitions the work item status to ready alongside the snapshot", async () => {
      const snapshot = {
        clientProfileId: "profile-1",
        confirmedAt: "2026-01-01T00:00:00.000Z",
        assets: [],
        brandKit: {
          colors: [],
          fonts: [],
          toneOfVoice: null,
          prohibitedElements: null,
          requiredElements: null,
        },
      };
      const updated = workItem({
        identitySnapshot: snapshot,
        status: "ready",
      });
      mocks.state.updateResults.push([updated]);

      const result = await confirmCreativeWorkIdentity("ws-1", "work-1", snapshot);

      expect(mocks.setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          identitySnapshot: snapshot,
          status: "ready",
        }),
      );
      expect(result?.status).toBe("ready");
    });
  });

  describe("createCreativeWorkOutputs", () => {
    it("creates exactly one output per creative level", async () => {
      const outputs = [
        workOutput({ id: "o1", creativeLevel: "conservative", status: "queued" }),
        workOutput({ id: "o2", creativeLevel: "balanced", status: "queued" }),
        workOutput({ id: "o3", creativeLevel: "bold", status: "queued" }),
      ];
      mocks.state.onConflictResults.push([]);
      mocks.state.selectResults.push(outputs);

      const result = await createCreativeWorkOutputs("ws-1", "work-1");

      expect(mocks.valuesMock).toHaveBeenCalledWith([
        expect.objectContaining({ creativeLevel: "conservative", status: "queued" }),
        expect.objectContaining({ creativeLevel: "balanced", status: "queued" }),
        expect.objectContaining({ creativeLevel: "bold", status: "queued" }),
      ]);
      expect(mocks.onConflictDoNothingMock).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(3);
    });

    it("returns the existing outputs when called repeatedly", async () => {
      const existing = [
        workOutput({ id: "o1", creativeLevel: "conservative" }),
        workOutput({ id: "o2", creativeLevel: "balanced" }),
        workOutput({ id: "o3", creativeLevel: "bold" }),
      ];
      mocks.state.onConflictResults.push([]);
      mocks.state.selectResults.push(existing);

      const result = await createCreativeWorkOutputs("ws-1", "work-1");

      expect(result.map((o) => o.id)).toEqual(["o1", "o2", "o3"]);
    });
  });

  describe("markCreativeWorkOutputProcessing", () => {
    it("updates an output scoped by workspace, work item, and output id", async () => {
      const updated = workOutput({ status: "processing" });
      mocks.state.updateResults.push([updated]);

      const result = await markCreativeWorkOutputProcessing("ws-1", "work-1", "output-1");

      expect(mocks.updateMock).toHaveBeenCalledTimes(1);
      expect(mocks.setMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "processing" }),
      );
      expect(result?.status).toBe("processing");
    });
  });

  describe("completeCreativeWorkOutput", () => {
    it("records output key, cost, and quality", async () => {
      const quality = { objective: 0.9 };
      const updated = workOutput({
        status: "completed",
        outputKey: "assets/final.png",
        cost: 12,
        quality,
      });
      mocks.state.updateResults.push([updated]);

      const result = await completeCreativeWorkOutput("ws-1", "work-1", "output-1", {
        outputKey: "assets/final.png",
        cost: 12,
        quality,
      });

      expect(mocks.setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "completed",
          outputKey: "assets/final.png",
          cost: 12,
          quality,
          failureCode: null,
        }),
      );
      expect(result?.outputKey).toBe("assets/final.png");
    });
  });

  describe("failCreativeWorkOutput", () => {
    it("records the failure code", async () => {
      const updated = workOutput({ status: "failed", failureCode: "image_timeout" });
      mocks.state.updateResults.push([updated]);

      const result = await failCreativeWorkOutput(
        "ws-1",
        "work-1",
        "output-1",
        "image_timeout",
      );

      expect(mocks.setMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed", failureCode: "image_timeout" }),
      );
      expect(result?.failureCode).toBe("image_timeout");
    });
  });

  describe("refreshCreativeWorkStatus", () => {
    it("returns ready when no outputs exist", async () => {
      mocks.state.selectResults.push([]);
      const status = await refreshCreativeWorkStatus("ws-1", "work-1");
      expect(status).toBe("ready");
      // Aggregate status must be persisted so the wizard's polling hook
      // can engage; `refreshCreativeWorkStatus` is the single writer.
      expect(mocks.setMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ready" })
      );
    });

    it("returns partial when outputs are mixed", async () => {
      mocks.state.selectResults.push([
        { status: "completed" },
        { status: "failed" },
        { status: "completed" },
      ]);
      const status = await refreshCreativeWorkStatus("ws-1", "work-1");
      expect(status).toBe("partial");
      expect(mocks.setMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "partial" })
      );
    });

    it("returns completed when all outputs complete", async () => {
      mocks.state.selectResults.push([
        { status: "completed" },
        { status: "completed" },
        { status: "completed" },
      ]);
      const status = await refreshCreativeWorkStatus("ws-1", "work-1");
      expect(status).toBe("completed");
      expect(mocks.setMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "completed" })
      );
    });

    it("returns generating when any output is in flight", async () => {
      mocks.state.selectResults.push([
        { status: "completed" },
        { status: "processing" },
        { status: "queued" },
      ]);
      const status = await refreshCreativeWorkStatus("ws-1", "work-1");
      expect(status).toBe("generating");
      expect(mocks.setMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "generating" })
      );
    });
  });

  describe("setCreativeWorkStatus", () => {
    it("persists the provided status to the work item", async () => {
      mocks.state.updateResults.push([workItem({ status: "generating" })]);
      const result = await setCreativeWorkStatus("ws-1", "work-1", "generating");
      expect(mocks.setMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "generating" })
      );
      expect(result?.status).toBe("generating");
    });
  });

  describe("selectCreativeWorkOutput", () => {
    it("clears the previous selection and selects the new output in one transaction", async () => {
      // Only the second update call uses `.returning()` to fetch the selected
      // row. The first update simply awaits `.where()` to clear any prior
      // selected output. We therefore queue a single returning payload.
      const newlySelected = workOutput({ id: "output-1", isSelected: true });
      mocks.state.txUpdateResults.push([newlySelected]);

      const result = await selectCreativeWorkOutput("ws-1", "work-1", "output-1");

      expect(mocks.transactionMock).toHaveBeenCalledTimes(1);
      expect(mocks.txUpdateMock).toHaveBeenCalledTimes(2);
      // First update clears the previous selection (isSelected: false).
      // Second update marks the new one (isSelected: true).
      expect(mocks.txSetMock.mock.calls[0][0]).toEqual(
        expect.objectContaining({ isSelected: false })
      );
      expect(mocks.txSetMock.mock.calls[1][0]).toEqual(
        expect.objectContaining({ isSelected: true })
      );
      expect(result?.id).toBe("output-1");
      expect(result?.isSelected).toBe(true);
    });
  });
});
