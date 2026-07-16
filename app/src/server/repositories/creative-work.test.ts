import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { CreativeWorkItem, CreativeWorkOutput } from "../db/schema";

const mocks = vi.hoisted(() => {
  const state = {
    selectResults: [] as unknown[][],
    insertResults: [] as unknown[][],
    updateResults: [] as unknown[][],
    deleteResults: [] as unknown[][],
    onConflictResults: [] as unknown[][],
    txUpdateResults: [] as unknown[][],
  };

  const resetState = () => {
    state.selectResults.length = 0;
    state.insertResults.length = 0;
    state.updateResults.length = 0;
    state.deleteResults.length = 0;
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
    chain.where = vi.fn((condition: unknown) => {
      whereMock(condition);
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
    where: vi.fn((condition: unknown) => {
      whereMock(condition);
      return { returning: setReturningMock };
    }),
  }));
  const updateMock = vi.fn(() => ({ set: setMock }));
  const deleteReturningMock = vi.fn();
  const deleteMock = vi.fn(() => ({
    where: vi.fn(() => ({ returning: deleteReturningMock })),
  }));

  const txSetReturningMock = vi.fn();
  const txSetMock = vi.fn(() => ({
    where: vi.fn((condition: unknown) => {
      whereMock(condition);
      return { returning: txSetReturningMock };
    }),
  }));
  const txUpdateMock = vi.fn(() => ({ set: txSetMock }));
  const executeMock = vi.fn();

  const transactionMock = vi.fn(
    async (callback: (inner: unknown) => Promise<unknown>) =>
      callback({
        update: txUpdateMock,
        select: selectMock,
        insert: insertMock,
        delete: deleteMock,
        execute: executeMock,
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
    deleteMock,
    deleteReturningMock,
    setReturningMock,
    transactionMock,
    txUpdateMock,
    txSetMock,
    txSetReturningMock,
    executeMock,
  };
});

const scopeMocks = vi.hoisted(() => ({
  getClientProfile: vi.fn(),
  getCampaignById: vi.fn(),
  resolveCampaignClientProfileId: vi.fn(),
}));

vi.mock("../db", () => ({
  db: {
    select: mocks.selectMock,
    insert: mocks.insertMock,
    update: mocks.updateMock,
    delete: mocks.deleteMock,
    transaction: mocks.transactionMock,
  },
}));

vi.mock("./client-reference", () => ({
  getClientProfile: scopeMocks.getClientProfile,
  resolveCampaignClientProfileId: scopeMocks.resolveCampaignClientProfileId,
}));
vi.mock("./campaign", () => ({ getCampaignById: scopeMocks.getCampaignById }));

import {
  confirmCreativeWorkIdentity,
  confirmCreativeWorkSnapshotsIfUnchanged,
  completeCreativeWorkOutput,
  createCreativeWork,
  createCreativeWorkDraft,
  createCreativeWorkSource,
  createPlannedCreativeWorkOutputs,
  createCreativeWorkRevision,
  deleteCreativeWorkSource,
  createCreativeWorkOutputs,
  failStaleCreativeWorkOutputs,
  failCreativeWorkOutput,
  failQueuedCreativeWorkOutput,
  getCreativeWork,
  markCreativeWorkOutputProcessing,
  incrementCreativeWorkOutputRetry,
  requeueCreativeWorkOutputOnce,
  linkCreativeWorkCampaign,
  refreshCreativeWorkStatus,
  selectCreativeWorkOutput,
  setCreativeWorkBrief,
  setCreativeWorkCopy,
  setCreativeWorkStatus,
  updateCreativeWorkSource,
  updateCreativeWorkSourceIfUnchanged,
  updateCreativeWorkDraft,
  updateCreativeWorkDraftIfUnchanged,
  withCreativeWorkPreparationLock,
} from "./creative-work";
import type {
  SocialPostBrief,
  SocialPostCopy,
} from "../creative-work/contracts";

const dialect = new PgDialect();

function serializedCondition(condition: unknown) {
  return dialect.sqlToQuery(condition as SQL);
}

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
    mocks.deleteReturningMock.mockImplementation(() => Promise.resolve(mocks.state.deleteResults.shift() ?? []));
    mocks.onConflictReturningMock.mockImplementation(() =>
      Promise.resolve(mocks.state.onConflictResults.shift() ?? [])
    );
    mocks.txSetReturningMock.mockImplementation(() =>
      Promise.resolve(mocks.state.txUpdateResults.shift() ?? [])
    );
    scopeMocks.getClientProfile.mockResolvedValue({ id: "profile-1", workspaceId: "ws-1" });
    scopeMocks.getCampaignById.mockResolvedValue({ id: "campaign-1", workspaceId: "ws-1", clientProfileId: "profile-1" });
    scopeMocks.resolveCampaignClientProfileId.mockImplementation(async (_workspaceId, campaign) => campaign.clientProfileId ?? null);
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

  describe("drafts, sources, and versions", () => {
    it("creates an idempotent draft with the preparation fields", async () => {
      const inserted = workItem({ id: "draft-1", brief: null });
      mocks.state.onConflictResults.push([inserted]);

      const result = await createCreativeWorkDraft({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        createdByUserId: "user-1",
        draftKey: "00000000-0000-4000-8000-000000000099",
        intent: "single",
        title: "Draft title",
        request: "Make one ad",
      });

      expect(mocks.valuesMock).toHaveBeenCalledWith(expect.objectContaining({
        draftKey: "00000000-0000-4000-8000-000000000099",
        toolKind: "single",
        title: "Draft title",
        request: "Make one ad",
        format: "4:5",
        settings: { targetFormats: [] },
        brief: null,
      }));
      expect(result.id).toBe("draft-1");
    });

    it("returns the existing scoped draft after a draftKey conflict", async () => {
      const existing = workItem({ id: "same-draft", draftKey: "draft-key", brief: null });
      mocks.state.onConflictResults.push([]);
      mocks.state.selectResults.push([existing]);
      const result = await createCreativeWorkDraft({
        workspaceId: "ws-1", clientProfileId: "profile-1", createdByUserId: "user-1",
        draftKey: "draft-key", intent: "single", title: "Draft", request: "One ad",
      });
      expect(result?.id).toBe("same-draft");
    });

    it("rejects a draft when the client profile is outside the workspace", async () => {
      scopeMocks.getClientProfile.mockResolvedValue(null);
      const result = await createCreativeWorkDraft({
        workspaceId: "ws-1", clientProfileId: "profile-other", createdByUserId: "user-1",
        draftKey: "00000000-0000-4000-8000-000000000099", intent: "single", title: "Draft", request: "One ad",
      });
      expect(result).toBeNull();
      expect(mocks.insertMock).not.toHaveBeenCalled();
    });

    it.each([
      ["outside the workspace", null],
      ["linked to another profile", { id: "campaign-1", workspaceId: "ws-1", clientProfileId: "profile-2" }],
    ])("rejects a draft campaign %s before insert", async (_case, campaign) => {
      scopeMocks.getCampaignById.mockResolvedValue(campaign);
      const result = await createCreativeWorkDraft({
        workspaceId: "ws-1", clientProfileId: "profile-1", campaignId: "campaign-1", createdByUserId: "user-1",
        draftKey: "00000000-0000-4000-8000-000000000099", intent: "single", title: "Draft", request: "One ad",
      });
      expect(result).toBeNull();
      expect(mocks.insertMock).not.toHaveBeenCalled();
    });

    it("accepts a same-workspace campaign with the draft profile", async () => {
      const inserted = workItem({ id: "draft-campaign", campaignId: "campaign-1", brief: null });
      mocks.state.onConflictResults.push([inserted]);
      const result = await createCreativeWorkDraft({
        workspaceId: "ws-1", clientProfileId: "profile-1", campaignId: "campaign-1", createdByUserId: "user-1",
        draftKey: "00000000-0000-4000-8000-000000000099", intent: "single", title: "Draft", request: "One ad",
      });
      expect(result?.id).toBe("draft-campaign");
      expect(mocks.valuesMock).toHaveBeenCalledWith(expect.objectContaining({ campaignId: "campaign-1", clientProfileId: "profile-1" }));
    });

    it("rejects a source update outside the scoped work", async () => {
      mocks.state.txUpdateResults.push([]);
      const result = await updateCreativeWorkSource("ws-2", "work-1", "source-1", { status: "ready" });
      expect(result).toBeNull();
      const query = serializedCondition(mocks.whereMock.mock.calls[0][0]);
      expect(query.sql).toContain('"creative_work_sources"."workspace_id"');
      expect(query.sql).toContain('"creative_work_sources"."work_item_id"');
      expect(query.sql).toContain('"creative_work_sources"."id"');
      expect(query.params).toEqual(["ws-2", "work-1", "source-1"]);
    });

    it("rejects a revision when its parent is outside the scoped work", async () => {
      mocks.state.selectResults.push([]);
      const result = await createCreativeWorkRevision(
        "ws-2",
        "work-1",
        "00000000-0000-4000-8000-000000000100",
        "output-1",
        "Use a shorter headline",
        null,
      );
      expect(result).toBeNull();
      expect(mocks.insertMock).not.toHaveBeenCalled();
      const parentScope = mocks.whereMock.mock.calls
        .map(([condition]) => serializedCondition(condition))
        .find((query) => query.params.includes("output-1"));
      expect(parentScope?.sql).toContain('"creative_work_outputs"."workspace_id"');
      expect(parentScope?.sql).toContain('"creative_work_outputs"."work_item_id"');
      expect(parentScope?.sql).toContain('"creative_work_outputs"."id"');
      expect(parentScope?.params).toEqual(["ws-2", "work-1", "output-1"]);
    });

    it("creates consecutive revisions and returns the same row for a repeated operation key", async () => {
      const parent = workOutput({ id: "output-1", targetFormat: "4:5", versionNumber: 1 });
      const revision2 = workOutput({ id: "output-2", parentOutputId: "output-1", targetFormat: "4:5", versionNumber: 2, operationKey: "revision-key-2" });
      const revision3 = workOutput({ id: "output-3", parentOutputId: "output-1", targetFormat: "4:5", versionNumber: 3, operationKey: "revision-key-3" });

      mocks.state.selectResults.push([], [parent], [], [{ maxVersion: 1 }]);
      mocks.state.onConflictResults.push([revision2]);
      await expect(createCreativeWorkRevision("ws-1", "work-1", "revision-key-2", "output-1", "Shorter", null)).resolves.toEqual(revision2);

      mocks.state.selectResults.push([], [parent], [], [{ maxVersion: 2 }]);
      mocks.state.onConflictResults.push([revision3]);
      await expect(createCreativeWorkRevision("ws-1", "work-1", "revision-key-3", "output-1", "Different", null)).resolves.toEqual(revision3);

      mocks.state.selectResults.push([revision2]);
      await expect(createCreativeWorkRevision("ws-1", "work-1", "revision-key-2", "output-1", "Ignored retry", null)).resolves.toEqual(revision2);
      expect(mocks.valuesMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ versionNumber: 2, operationKey: "revision-key-2" }));
      expect(mocks.valuesMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ versionNumber: 3, operationKey: "revision-key-3" }));
      expect(mocks.executeMock).toHaveBeenCalledTimes(2);
      expect(mocks.selectMock.mock.calls[3][0]).toEqual({ maxVersion: expect.anything() });
      expect(mocks.executeMock.mock.invocationCallOrder[0]).toBeLessThan(mocks.selectMock.mock.invocationCallOrder[3]);
      expect(mocks.executeMock.mock.invocationCallOrder[0]).toBeLessThan(mocks.insertMock.mock.invocationCallOrder[0]);
    });

    it("updates draft preparation fields under workspace scope", async () => {
      const updated = workItem({ id: "work-1" });
      mocks.state.updateResults.push([updated]);
      await expect(updateCreativeWorkDraft("ws-1", "work-1", { title: "New title" })).resolves.toEqual(updated);
      expect(mocks.setMock).toHaveBeenCalledWith(expect.objectContaining({ title: "New title" }));
    });

    it("updates preparation only when updatedAt still matches", async () => {
      const capturedAt = new Date("2026-07-16T12:00:00.000Z");
      mocks.state.updateResults.push([]);
      await expect(updateCreativeWorkDraftIfUnchanged("ws-1", "work-1", capturedAt, { title: "Stale" }))
        .resolves.toBeNull();
      const query = serializedCondition(mocks.whereMock.mock.calls.at(-1)?.[0]);
      expect(query.sql).toContain('"creative_work_items"."updated_at"');
      expect(query.params).toHaveLength(4);
    });

    it("holds the preparation callback under a work-scoped advisory transaction lock", async () => {
      const callback = vi.fn(async (executor) => {
        expect(executor).toMatchObject({ execute: mocks.executeMock });
        return "prepared";
      });
      await expect(withCreativeWorkPreparationLock("ws-1", "work-1", callback)).resolves.toBe("prepared");
      expect(mocks.executeMock).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ execute: mocks.executeMock }));
      expect(mocks.executeMock.mock.invocationCallOrder[0]).toBeLessThan(callback.mock.invocationCallOrder[0]);
    });

    it("creates a source with exactly one origin delegated to the DB constraint", async () => {
      const source = { id: "source-1", workspaceId: "ws-1", workItemId: "work-1", assetId: "asset-1", templateId: null };
      mocks.state.selectResults.push([{ id: "work-1" }], [{ id: "asset-1" }]);
      mocks.state.insertResults.push([source]);
      mocks.state.txUpdateResults.push([workItem()]);
      await expect(createCreativeWorkSource({
        workspaceId: "ws-1", workItemId: "work-1", assetId: "asset-1", usage: "both", status: "uploaded",
      })).resolves.toEqual(source);
      expect(mocks.valuesMock).toHaveBeenCalledWith(expect.objectContaining({ assetId: "asset-1", usage: "both" }));
      expect(mocks.txUpdateMock).toHaveBeenCalledWith(expect.anything());
    });

    it("touches the parent work after updating or deleting a source", async () => {
      const source = { id: "source-1", workspaceId: "ws-1", workItemId: "work-1", status: "ready" };
      mocks.state.txUpdateResults.push([source], [workItem()]);
      await updateCreativeWorkSource("ws-1", "work-1", "source-1", { status: "ready" });
      mocks.state.deleteResults.push([source]);
      mocks.state.txUpdateResults.push([workItem()]);
      await deleteCreativeWorkSource("ws-1", "work-1", "source-1");
      expect(mocks.txUpdateMock).toHaveBeenCalledTimes(3);
    });

    it("updates a source only for the expected attempt and advances its timestamp", async () => {
      const expectedAt = new Date("2026-07-16T12:00:00.000Z");
      const source = { id: "source-1", workspaceId: "ws-1", workItemId: "work-1", status: "analyzing", usage: "style" };
      mocks.state.txUpdateResults.push([source], [workItem()]);

      await expect(updateCreativeWorkSourceIfUnchanged(
        "ws-1", "work-1", "source-1",
        { status: "uploaded", usage: "style", updatedAt: expectedAt },
        { status: "analyzing" },
      )).resolves.toEqual(source);

      expect(mocks.txSetMock).toHaveBeenCalledWith(expect.objectContaining({
        status: "analyzing",
        updatedAt: expect.anything(),
      }));
      const query = serializedCondition(mocks.whereMock.mock.calls[0][0]);
      expect(query.sql).toContain('"creative_work_sources"."status"');
      expect(query.sql).toContain('"creative_work_sources"."usage"');
      expect(query.sql).toContain('"creative_work_sources"."updated_at"');
      expect(query.params).toEqual(["ws-1", "work-1", "source-1", "uploaded", "style", expectedAt.toISOString()]);
    });

    it("does not touch the parent when the source attempt CAS is stale", async () => {
      mocks.state.txUpdateResults.push([]);
      await expect(updateCreativeWorkSourceIfUnchanged(
        "ws-1", "work-1", "source-1",
        { status: "failed", usage: "content", updatedAt: new Date("2026-07-16T12:00:00.000Z") },
        { status: "uploaded" },
      )).resolves.toBeNull();
      expect(mocks.txUpdateMock).toHaveBeenCalledOnce();
    });

    it("creates deterministic initial output plans", async () => {
      const planned = workOutput({ targetFormat: "1:1", versionNumber: 1, operationKey: "bold:1:1:1" });
      mocks.state.selectResults.push([{ id: "work-1" }], [planned]);
      const result = await createPlannedCreativeWorkOutputs("ws-1", "work-1", [{ creativeLevel: "bold", targetFormat: "1:1" }]);
      expect(mocks.valuesMock).toHaveBeenCalledWith([expect.objectContaining({ operationKey: "bold:1:1:1", versionNumber: 1 })]);
      expect(result).toEqual({ outputs: [planned], newlyCreatedIds: [] });
    });

    it("increments retries only on a scoped output", async () => {
      const retried = workOutput({ retryCount: 1 });
      mocks.state.updateResults.push([retried]);
      await expect(incrementCreativeWorkOutputRetry("ws-1", "work-1", "output-1")).resolves.toEqual(retried);
      expect(mocks.setMock).toHaveBeenCalledWith(expect.objectContaining({ retryCount: expect.anything() }));
    });

    it("atomically queues only the first automatic retry", async () => {
      const retried = workOutput({ retryCount: 1, status: "queued" });
      mocks.state.updateResults.push([retried]);
      await expect(requeueCreativeWorkOutputOnce("ws-1", "work-1", "output-1")).resolves.toEqual(retried);
      expect(mocks.setMock).toHaveBeenCalledWith(expect.objectContaining({ status: "queued", retryCount: expect.anything() }));
      const query = serializedCondition(mocks.whereMock.mock.calls.at(-1)?.[0]);
      expect(query.sql).toContain('"retry_count"');
      expect(query.params).toContain(0);
      expect(query.params).toContain("processing");
    });

    it("links only a same-workspace campaign with a compatible client profile", async () => {
      const work = workItem();
      const linked = workItem({ campaignId: "campaign-1" });
      mocks.state.selectResults.push([work]);
      mocks.state.updateResults.push([linked]);
      await expect(linkCreativeWorkCampaign("ws-1", "work-1", "campaign-1")).resolves.toEqual(linked);
      expect(mocks.setMock).toHaveBeenCalledWith(expect.objectContaining({ campaignId: "campaign-1" }));
    });

    it("returns null when deleting a source outside the scoped work", async () => {
      await expect(deleteCreativeWorkSource("ws-2", "work-1", "source-1")).resolves.toBeNull();
    });
  });

  describe("getCreativeWork", () => {
    // Deviation from brief: the brief's spec test scaffold asserted
    // `whereMock` was called 1 time. In practice `getCreativeWork` runs three
    // scoped queries (work item, outputs, and sources), so the assertion is `3`.
    it("loads work by workspace and id", async () => {
      const work = workItem();
      const outputs = [
        workOutput({ id: "o1", creativeLevel: "conservative" }),
        workOutput({ id: "o2", creativeLevel: "balanced" }),
        workOutput({ id: "o3", creativeLevel: "bold" }),
      ];

      mocks.state.selectResults.push([work]);
      mocks.state.selectResults.push(outputs);
      mocks.state.selectResults.push([]);

      const result = await getCreativeWork("ws-1", "work-1");

      expect(result).not.toBeNull();
      expect(result?.work.id).toBe("work-1");
      expect(result?.outputs).toHaveLength(3);
      expect(mocks.selectMock).toHaveBeenCalledTimes(3);
      expect(mocks.whereMock).toHaveBeenCalledTimes(3);
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

  describe("confirmCreativeWorkSnapshotsIfUnchanged", () => {
    it("freezes input and identity only for the prepared draft revision", async () => {
      const expectedAt = new Date("2026-07-16T12:00:00.000Z");
      const snapshot = { clientProfileId: "profile-1", confirmedAt: "now", assets: [], brandKit: { colors: [], fonts: [], toneOfVoice: null, prohibitedElements: null, requiredElements: null } };
      const inputSnapshot = { request: "latest", settings: { targetFormats: [] }, sources: [] };
      mocks.state.updateResults.push([workItem({ status: "ready", identitySnapshot: snapshot, inputSnapshot })]);
      await confirmCreativeWorkSnapshotsIfUnchanged("ws-1", "work-1", expectedAt, inputSnapshot, snapshot);
      expect(mocks.setMock).toHaveBeenCalledWith(expect.objectContaining({ status: "ready", inputSnapshot, identitySnapshot: snapshot }));
      const query = serializedCondition(mocks.whereMock.mock.calls.at(-1)?.[0]);
      expect(query.params).toEqual(expect.arrayContaining(["ws-1", "work-1", "draft", expectedAt.toISOString()]));
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
      expect(serializedCondition(mocks.whereMock.mock.calls.at(-1)?.[0]).params).toContain("queued");
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
      expect(serializedCondition(mocks.whereMock.mock.calls.at(-1)?.[0]).params).toContain("processing");
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
      expect(serializedCondition(mocks.whereMock.mock.calls.at(-1)?.[0]).params).toContain("processing");
    });
  });

  describe("failQueuedCreativeWorkOutput", () => {
    it("compensates dispatch only while the row is still queued", async () => {
      mocks.state.updateResults.push([workOutput({ status: "failed", failureCode: "dispatch_failed" })]);
      await failQueuedCreativeWorkOutput("ws-1", "work-1", "output-1", "dispatch_failed");
      expect(serializedCondition(mocks.whereMock.mock.calls.at(-1)?.[0]).params).toContain("queued");
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
