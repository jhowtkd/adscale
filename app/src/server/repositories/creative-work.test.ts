import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { CreativeWorkItem, CreativeWorkOutput } from "../db/schema";
import type { LayerizationState } from "../layerize/contracts";
import { isPieceReferenceReady } from "../creative-work/piece-reference";

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
  const innerJoinMock = vi.fn();

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
    chain.innerJoin = vi.fn((_table: unknown, condition: unknown) => {
      innerJoinMock(condition);
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
    chain.for = vi.fn(() => chain);
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
    innerJoinMock,
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

import { creativeWorkOutputs } from "../db/schema";
import {
  claimCreativeWorkOutputImageCall,
  claimCreativeWorkOutputManualRetryAttempt,
  releaseCreativeWorkOutputManualRetryAttempt,
  countCreativeWorkProcessingOutputs,
  confirmCreativeWorkIdentity,
  confirmCreativeWorkSnapshotsIfUnchanged,
  completeCreativeWorkOutput,
  createCreativeWork,
  createCreativeWorkDraft,
  autosaveCreativeWorkDraft,
  mutateCreativeWorkPieceReference,
  mutateCreativeWorkDraftSource,
  createCreativeWorkDraftWithSource,
  claimCreativeWorkPieceTrainingReference,
  promoteCreativeWorkPieceReference,
  createCreativeWorkSource,
  createPlannedCreativeWorkOutputs,
  createCreativeWorkRevision,
  deleteCreativeWorkSource,
  createCreativeWorkOutputs,
  failStaleCreativeWorkOutputs,
  failStaleCreativeWorkSources,
  failCreativeWorkOutput,
  failQueuedCreativeWorkOutput,
  getCreativeWork,
  markCreativeWorkOutputProcessing,
  incrementCreativeWorkOutputRetry,
  requeueCreativeWorkOutputOnce,
  requeueFailedCreativeWorkOutput,
  linkCreativeWorkCampaign,
  listCreativeWorkInspirationCandidates,
  refreshCreativeWorkStatus,
  recordCreativeWorkGenerationAggregate,
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
    targetFormat: "4:5",
    versionNumber: 1,
    parentOutputId: null,
    revisionInstruction: null,
    revisionAssetId: null,
    retryCount: 0,
    imageCallCount: 0,
    operationKey: "balanced:4:5:1",
    status: "queued",
    outputKey: null,
    cost: null,
    failureCode: null,
    quality: null,
    isSelected: false,
    createdAt: new Date(),
    terminalAt: null,
    updatedAt: new Date(),
    ...overrides,
  } as CreativeWorkOutput;
}

function queuedLayerization(): LayerizationState {
  return {
    status: "queued",
    attemptId: "attempt-1",
    callbackTokenHash: "a".repeat(64),
    callbackConsumedAt: null,
    requestedByUserId: "owner-1",
    createdAt: "2026-08-13T12:00:00.000Z",
    updatedAt: "2026-08-13T12:00:00.000Z",
    callbackDeadlineAt: "2026-08-13T14:00:00.000Z",
    latencyMs: null,
    providerRequestId: null,
    providerModel: "bytedance/seedream/v5/pro/layerize",
    providerEndpoint: "https://queue.fal.run/bytedance/seedream/v5/pro/layerize",
    estimatedCostUsd: null,
    baseWidth: null,
    baseHeight: null,
    layers: [],
    psdKey: null,
    diagnosticZipKey: null,
    fidelity: null,
    failureCode: null,
  };
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

  describe("piece-reference training promotion claims", () => {
    it("keeps the migration additive for historical training-reference duplicates", () => {
      const migration = readFileSync(
        new URL("../../../drizzle/0089_creative_work_piece_reference.sql", import.meta.url),
        "utf8",
      );

      expect(migration).toContain('ADD COLUMN IF NOT EXISTS "piece_reference" jsonb');
      expect(migration).not.toContain("client_references_workspace_profile_asset_key_unique");
      expect(migration).not.toContain("DELETE FROM");
    });

    it("serializes concurrent get-or-create claims to one scoped training reference", async () => {
      const reference = {
        id: "training-1", workspaceId: "ws-1", clientProfileId: "profile-1",
        assetKey: "trusted/piece.png", label: "piece.png", kind: "other",
        reviewStatus: "pending_analysis", createdAt: new Date(), notes: null,
        trainingCategory: null, usageMode: null, trainingAnalysis: null,
        reviewedAt: null, reviewedByUserId: null, sourceDerivationId: null,
      };
      // The first lock holder creates; a concurrent waiter observes that row
      // after the same advisory lock is released.
      mocks.state.selectResults.push([], [reference]);
      mocks.state.insertResults.push([reference]);
      const input = {
        workspaceId: "ws-1", clientProfileId: "profile-1",
        assetKey: "trusted/piece.png", label: "piece.png",
      };

      const [winner, loser] = await Promise.all([
        claimCreativeWorkPieceTrainingReference(input),
        claimCreativeWorkPieceTrainingReference(input),
      ]);

      expect(winner).toEqual({ reference, claimed: true });
      expect(loser).toEqual({ reference, claimed: false });
      expect(mocks.returningMock).toHaveBeenCalledOnce();
      expect(mocks.executeMock).toHaveBeenCalledTimes(2);
      expect(mocks.valuesMock).toHaveBeenCalledWith(expect.objectContaining({
        workspaceId: "ws-1", clientProfileId: "profile-1", assetKey: "trusted/piece.png",
        reviewStatus: "pending_analysis",
      }));
    });

    it("prefers an approved historical duplicate and ignores archived or rejected rows", async () => {
      const pending = { id: "pending", reviewStatus: "pending_analysis", createdAt: new Date("2026-08-01") };
      const approved = { id: "approved", reviewStatus: "approved", createdAt: new Date("2026-08-02") };
      mocks.state.selectResults.push([
        { id: "archived", reviewStatus: "archived", createdAt: new Date("2026-08-03") },
        { id: "rejected", reviewStatus: "rejected", createdAt: new Date("2026-08-04") },
        approved,
        pending,
      ]);

      await expect(claimCreativeWorkPieceTrainingReference({
        workspaceId: "ws-1", clientProfileId: "profile-1", assetKey: "trusted/piece.png", label: "piece.png",
      })).resolves.toEqual({ reference: approved, claimed: false });

      expect(mocks.orderByMock).toHaveBeenCalled();
      expect(mocks.returningMock).not.toHaveBeenCalled();
    });
  });

  describe("Single Piece autosave and attachment serialization", () => {
    it("rejects both same-ordinal recovery claims before a no-op update can claim ownership", async () => {
      const first = claimCreativeWorkOutputManualRetryAttempt(
        "ws-1", "work-1", "output-1", 4, 2, 2,
      );
      const second = claimCreativeWorkOutputManualRetryAttempt(
        "ws-1", "work-1", "output-1", 4, 2, 2,
      );
      await expect(Promise.all([first, second])).resolves.toEqual([null, null]);
      // Old code issued an UPDATE whose SET value equaled the WHERE value,
      // allowing every caller to receive the same returned row as "claimed".
      expect(mocks.txUpdateMock).not.toHaveBeenCalled();
    });
    it("releases only the exact failed manual reservation, never a newer ordinal", async () => {
      mocks.state.updateResults.push([{ id: "output-1", manualRetryAttempt: null }]);

      await expect(releaseCreativeWorkOutputManualRetryAttempt(
        "ws-1", "work-1", "output-1", 4, 2,
      )).resolves.toMatchObject({ id: "output-1", manualRetryAttempt: null });

      expect(mocks.setMock).toHaveBeenCalledWith(expect.objectContaining({ manualRetryAttempt: null }));
      const releaseWhere = serializedCondition(mocks.whereMock.mock.calls.at(-1)?.[0]);
      expect(releaseWhere.params).toEqual(expect.arrayContaining([
        "ws-1", "work-1", "output-1", "failed", 4, 2,
      ]));

      mocks.state.updateResults.push([]);
      await expect(releaseCreativeWorkOutputManualRetryAttempt(
        "ws-1", "work-1", "output-1", 4, 2,
      )).resolves.toBeNull();
      // A failed CAS result means an ordinal changed by another attempt is
      // untouched; the caller cannot clear a newer reservation.
      expect(mocks.setMock).toHaveBeenCalledTimes(2);
    });
    it("promotes through one executor: prepare lock, locked snapshot read, then training claim lock/write", async () => {
      const updatedAt = new Date("2026-08-28T12:00:00.000Z");
      const source = {
        id: "source-1", assetId: "asset-1", updatedAt,
        pieceReference: { category: "logo" },
      };
      const reference = { id: "training-1", reviewStatus: "pending_analysis", assetKey: "trusted/logo.png" };
      mocks.state.selectResults.push([source], [{ id: "asset-1", key: "trusted/logo.png", name: "locked-logo.png" }], []);
      mocks.state.insertResults.push([reference]);

      await expect(promoteCreativeWorkPieceReference({
        workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1", clientProfileId: "profile-1",
        assetKey: "trusted/logo.png", label: "logo.png",
        expected: { assetId: "asset-1", assetKey: "trusted/logo.png", updatedAt, category: "logo" },
      })).resolves.toEqual({ reference, claimed: true });

      expect(mocks.transactionMock).toHaveBeenCalledOnce();
      expect(mocks.executeMock).toHaveBeenCalledTimes(2);
      const prepareLock = dialect.sqlToQuery(mocks.executeMock.mock.calls[0][0] as SQL);
      const trainingLock = dialect.sqlToQuery(mocks.executeMock.mock.calls[1][0] as SQL);
      expect(prepareLock.params).toContain("ws-1:work-1:prepare");
      expect(trainingLock.params).toContain("ws-1:profile-1:trusted/logo.png:piece-training");
      expect(mocks.executeMock.mock.invocationCallOrder[0]).toBeLessThan(mocks.selectMock.mock.invocationCallOrder[0]);
      expect(mocks.selectMock.mock.invocationCallOrder[1]).toBeLessThan(mocks.executeMock.mock.invocationCallOrder[1]);
      expect(mocks.executeMock.mock.invocationCallOrder[1]).toBeLessThan(mocks.valuesMock.mock.invocationCallOrder[0]);
    });

    it.each([
      ["asset changed", { id: "source-1", assetId: "asset-2", updatedAt: new Date("2026-08-28T12:00:00.000Z"), pieceReference: { category: "logo" } }],
      ["timestamp changed", { id: "source-1", assetId: "asset-1", updatedAt: new Date("2026-08-28T12:00:01.000Z"), pieceReference: { category: "logo" } }],
      ["category changed", { id: "source-1", assetId: "asset-1", updatedAt: new Date("2026-08-28T12:00:00.000Z"), pieceReference: { category: "seal" } }],
      ["source removed", null],
    ])("rejects promotion when the locked snapshot is stale: %s", async (_reason, source) => {
      const updatedAt = new Date("2026-08-28T12:00:00.000Z");
      mocks.state.selectResults.push(source ? [source] : []);

      await expect(promoteCreativeWorkPieceReference({
        workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1", clientProfileId: "profile-1",
        assetKey: "trusted/logo.png", label: "logo.png",
        expected: { assetId: "asset-1", assetKey: "trusted/logo.png", updatedAt, category: "logo" },
      })).resolves.toBeNull();

      expect(mocks.transactionMock).toHaveBeenCalledOnce();
      expect(mocks.executeMock).toHaveBeenCalledOnce();
      expect(mocks.valuesMock).not.toHaveBeenCalled();
    });
    it.each([
      ["asset key changed", { id: "asset-1", key: "trusted/rotated.png", name: "rotated.png" }],
      ["asset removed", null],
    ])("rejects promotion when the locked workspace asset is stale: %s", async (_reason, asset) => {
      const updatedAt = new Date("2026-08-28T12:00:00.000Z");
      mocks.state.selectResults.push(
        [{ id: "source-1", assetId: "asset-1", updatedAt, pieceReference: { category: "logo" } }],
        asset ? [asset] : [],
      );

      await expect(promoteCreativeWorkPieceReference({
        workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1", clientProfileId: "profile-1",
        assetKey: "prelock/logo.png", label: "prelock-logo.png",
        expected: { assetId: "asset-1", assetKey: "trusted/logo.png", updatedAt, category: "logo" },
      })).resolves.toBeNull();

      expect(mocks.transactionMock).toHaveBeenCalledOnce();
      expect(mocks.executeMock).toHaveBeenCalledOnce();
      expect(mocks.valuesMock).not.toHaveBeenCalled();
    });
    it("uses the same per-work advisory scope for source attachment and preparation", () => {
      const source = readFileSync(new URL("./creative-work.ts", import.meta.url), "utf8");
      expect(source).toContain('`${workspaceId}:${workItemId}:prepare`');
      expect(source).toContain('pg_advisory_xact_lock(hashtext(${`${workspaceId}:${workItemId}:prepare`}))');
    });
    it("distinguishes a missing work from a persisted immutable autosave", async () => {
      await expect(autosaveCreativeWorkDraft({
        workspaceId: "ws-1", workItemId: "missing", request: "Peça", intent: "single", format: "4:5", settings: { targetFormats: [] },
      })).resolves.toEqual({ work: null, error: "not_found", sourcesNeedingSingleAnalysis: [] });

      mocks.state.selectResults.push([workItem({ id: "work-closed", toolKind: "single", status: "completed" })]);
      await expect(autosaveCreativeWorkDraft({
        workspaceId: "ws-1", workItemId: "work-closed", request: "Peça", intent: "single", format: "4:5", settings: { targetFormats: [] },
      })).resolves.toEqual({ work: null, error: "not_draft", sourcesNeedingSingleAnalysis: [] });
      expect(mocks.txUpdateMock).not.toHaveBeenCalled();
    });

    it("reopens a prepared ready retry with no outputs and invalidates its frozen plan", async () => {
      const ready = workItem({
        id: "work-ready", toolKind: "single", status: "ready",
        brief: socialBrief, copy: socialCopy, inputSnapshot: { request: "Peça", settings: { targetFormats: [] }, sources: [] },
        identitySnapshot: { clientProfileId: "profile-1", confirmedAt: "now", assets: [], brandKit: null },
      });
      const reopened = workItem({ ...ready, status: "draft", brief: null, copy: null, inputSnapshot: null, identitySnapshot: null });
      mocks.state.selectResults.push([ready], [{ outputCount: 0 }]);
      mocks.state.txUpdateResults.push([reopened]);

      await expect(autosaveCreativeWorkDraft({
        workspaceId: "ws-1", workItemId: "work-ready", expectedUpdatedAt: ready.updatedAt, request: "Peça revisada", intent: "single", format: "4:5", settings: { targetFormats: [] },
      })).resolves.toEqual({ work: reopened, error: null, sourcesNeedingSingleAnalysis: [] });

      expect(mocks.txSetMock).toHaveBeenCalledWith(expect.objectContaining({
        status: "draft", identitySnapshot: null, brief: null, copy: null, inputSnapshot: null,
        request: "Peça revisada",
      }));
    });

    it("rejects a stale tab before it can reopen a newer prepared retry", async () => {
      const r2 = workItem({ id: "work-ready", status: "ready", updatedAt: new Date("2026-08-31T12:00:01.000Z") });
      mocks.state.selectResults.push([r2], [{ outputCount: 1 }]);

      await expect(autosaveCreativeWorkDraft({
        workspaceId: "ws-1", workItemId: "work-ready", expectedUpdatedAt: new Date("2026-08-31T12:00:00.000Z"), request: "R1", intent: "single", format: "4:5", settings: { targetFormats: [] },
      })).resolves.toEqual({ work: null, error: "not_draft", sourcesNeedingSingleAnalysis: [] });

      expect(mocks.txUpdateMock).not.toHaveBeenCalled();
    });

    it("does not reopen a ready work once it has outputs", async () => {
      mocks.state.selectResults.push([workItem({ id: "work-with-output", status: "ready" })], [{ outputCount: 1 }]);

      await expect(autosaveCreativeWorkDraft({
        workspaceId: "ws-1", workItemId: "work-with-output", request: "Peça", intent: "single", format: "4:5", settings: { targetFormats: [] },
      })).resolves.toEqual({ work: null, error: "not_draft", sourcesNeedingSingleAnalysis: [] });

      expect(mocks.txUpdateMock).not.toHaveBeenCalled();
    });
    it("rejects a Variations to Single transition with four asset sources before changing the work", async () => {
      const work = workItem({ id: "work-1", toolKind: "variations", status: "draft" });
      mocks.state.selectResults.push([work], [
        { id: "source-1", assetId: "asset-1" }, { id: "source-2", assetId: "asset-2" },
        { id: "source-3", assetId: "asset-3" }, { id: "source-4", assetId: "asset-4" },
      ]);

      await expect(autosaveCreativeWorkDraft({
        workspaceId: "ws-1", workItemId: "work-1", request: "Peça", intent: "single", format: "4:5", settings: { targetFormats: [] },
      })).resolves.toEqual({ work: null, error: "single_piece_reference_limit", sourcesNeedingSingleAnalysis: [] });

      expect(mocks.executeMock).toHaveBeenCalledOnce();
      expect(mocks.txUpdateMock).not.toHaveBeenCalled();
    });

    it("normalizes up to three existing assets under the same lock before persisting Single", async () => {
      const work = workItem({ id: "work-1", toolKind: "variations", status: "draft" });
      const updated = workItem({ id: "work-1", toolKind: "single", status: "draft" });
      const assetSources = [
        { id: "source-1", assetId: "asset-1", pieceReference: null },
        { id: "source-2", assetId: "asset-2", pieceReference: { version: 1, category: "style_reference" } },
      ];
      mocks.state.selectResults.push([work], assetSources);
      const normalizedOne = { ...assetSources[0], usage: "both", usageConfirmed: true, status: "uploaded", failureCode: null };
      const normalizedTwo = { ...assetSources[1], usage: "both", usageConfirmed: true, status: "uploaded", failureCode: null };
      mocks.state.txUpdateResults.push([normalizedOne], [normalizedTwo], [updated]);

      await expect(autosaveCreativeWorkDraft({
        workspaceId: "ws-1", workItemId: "work-1", request: "Peça", intent: "single", format: "4:5", settings: { targetFormats: [] },
      })).resolves.toEqual({ work: updated, error: null, sourcesNeedingSingleAnalysis: [normalizedOne, normalizedTwo] });

      expect(mocks.executeMock).toHaveBeenCalledOnce();
      expect(mocks.txSetMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
        usage: "both", usageConfirmed: true,
        status: "uploaded", failureCode: null, contentAnalysis: null, styleAnalysis: null,
        pieceReference: { version: 1, category: null, classificationSource: "automatic", confidence: "low", userInstruction: null, hasTransparency: false },
        updatedAt: expect.anything(),
      }));
      expect(mocks.txSetMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
        usage: "both", usageConfirmed: true,
        pieceReference: { version: 1, category: "style_reference" },
      }));
    });

    it("preserves legacy null Piece metadata and unconfirmed usage on an ordinary Single autosave", async () => {
      const legacySingle = workItem({ id: "work-1", toolKind: "single", status: "draft" });
      const updated = workItem({ id: "work-1", toolKind: "single", status: "draft" });
      mocks.state.selectResults.push([legacySingle]);
      mocks.state.txUpdateResults.push([updated]);

      await expect(autosaveCreativeWorkDraft({
        workspaceId: "ws-1", workItemId: "work-1", request: "Peça antiga", intent: "single", format: "4:5", settings: { targetFormats: [] },
      })).resolves.toEqual({ work: updated, error: null, sourcesNeedingSingleAnalysis: [] });

      // Only the work row is written: no source normalization may invent a
      // Piece contract or confirm a historical source during a same-mode save.
      expect(mocks.txSetMock).toHaveBeenCalledOnce();
      expect(mocks.txSetMock.mock.calls[0]?.[0]).not.toHaveProperty("pieceReference");
      expect(mocks.txSetMock.mock.calls[0]?.[0]).not.toHaveProperty("usageConfirmed");
    });

    it("serializes Piece correction with prepare and invalidates prepared artifacts in the same draft transaction", async () => {
      const source = {
        id: "source-1", assetId: "asset-1", status: "ready", usage: "both", usageConfirmed: true,
        pieceReference: { version: 1, category: "style_reference", classificationSource: "automatic", confidence: "high", userInstruction: null, hasTransparency: false },
      };
      const corrected = {
        ...source,
        pieceReference: { ...source.pieceReference, category: "graphic_or_texture", classificationSource: "user", userInstruction: "Apenas textura" },
      };
      mocks.state.selectResults.push(
        [{ id: "work-1", toolKind: "single" }],
        [source],
      );
      mocks.state.txUpdateResults.push([corrected], [workItem({ toolKind: "single", status: "draft" })]);

      await expect(mutateCreativeWorkPieceReference({
        workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1",
        mutation: { kind: "correct", category: "graphic_or_texture", userInstruction: "  Apenas textura  " },
      })).resolves.toEqual(corrected);

      expect(mocks.executeMock).toHaveBeenCalledWith(expect.anything());
      expect(mocks.txSetMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
        pieceReference: expect.objectContaining({ category: "graphic_or_texture", classificationSource: "user", userInstruction: "Apenas textura" }),
      }));
      expect(mocks.txSetMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ brief: null, copy: null, inputSnapshot: null }));
    });

    it("preserves the locked sibling field for overlapping category and instruction corrections", async () => {
      const original = {
        id: "source-1", assetId: "asset-1", status: "ready", usage: "both", usageConfirmed: true,
        pieceReference: { version: 1, category: "product_or_packaging", classificationSource: "automatic", confidence: "high", userInstruction: "Manter rótulo", hasTransparency: false },
      };
      const afterCategory = {
        ...original,
        pieceReference: { ...original.pieceReference, category: "style_reference", classificationSource: "user" },
      };
      const afterInstruction = {
        ...afterCategory,
        pieceReference: { ...afterCategory.pieceReference, userInstruction: "Só a textura" },
      };
      mocks.state.selectResults.push(
        [{ id: "work-1", toolKind: "single" }], [original],
        [{ id: "work-1", toolKind: "single" }], [afterCategory],
      );
      mocks.state.txUpdateResults.push(
        [afterCategory], [workItem({ toolKind: "single", status: "draft" })],
        [afterInstruction], [workItem({ toolKind: "single", status: "draft" })],
      );

      await mutateCreativeWorkPieceReference({
        workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1",
        mutation: { kind: "correct", category: "style_reference" },
      });
      await mutateCreativeWorkPieceReference({
        workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1",
        mutation: { kind: "correct", userInstruction: "Só a textura" },
      });

      expect(mocks.txSetMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
        pieceReference: expect.objectContaining({ category: "style_reference", userInstruction: "Manter rótulo" }),
      }));
      expect(mocks.txSetMock).toHaveBeenNthCalledWith(3, expect.objectContaining({
        pieceReference: expect.objectContaining({ category: "style_reference", userInstruction: "Só a textura" }),
      }));
    });

    it("does not confirm a low-confidence classification from instruction-only edits", async () => {
      const automaticLow = {
        id: "source-1", assetId: "asset-1", status: "ready", usage: "both", usageConfirmed: true,
        pieceReference: { version: 1 as const, category: "product_or_packaging" as const, classificationSource: "automatic" as const, confidence: "low" as const, userInstruction: "Manter rótulo", hasTransparency: false },
      };
      const afterInstruction = {
        ...automaticLow,
        pieceReference: { ...automaticLow.pieceReference, userInstruction: null },
      };
      const afterConfirmation = {
        ...afterInstruction,
        pieceReference: { ...afterInstruction.pieceReference, classificationSource: "user" as const },
      };
      mocks.state.selectResults.push(
        [{ id: "work-1", toolKind: "single" }], [automaticLow],
        [{ id: "work-1", toolKind: "single" }], [afterInstruction],
      );
      mocks.state.txUpdateResults.push(
        [afterInstruction], [workItem({ toolKind: "single", status: "draft" })],
        [afterConfirmation], [workItem({ toolKind: "single", status: "draft" })],
      );

      await expect(mutateCreativeWorkPieceReference({
        workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1",
        mutation: { kind: "correct", userInstruction: "" },
      })).resolves.toEqual(afterInstruction);
      expect(isPieceReferenceReady(afterInstruction.pieceReference)).toBe(false);
      expect(mocks.txSetMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
        pieceReference: expect.objectContaining({ classificationSource: "automatic", confidence: "low", userInstruction: null }),
      }));

      await expect(mutateCreativeWorkPieceReference({
        workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1",
        mutation: { kind: "correct", category: "product_or_packaging" },
      })).resolves.toEqual(afterConfirmation);
      expect(isPieceReferenceReady(afterConfirmation.pieceReference)).toBe(true);
      expect(mocks.txSetMock).toHaveBeenNthCalledWith(3, expect.objectContaining({
        pieceReference: expect.objectContaining({ category: "product_or_packaging", classificationSource: "user", confidence: "low", userInstruction: null }),
      }));
    });

    it("returns a conflict without changing the source when prepare already made the work non-draft", async () => {
      mocks.state.selectResults.push([]);

      await expect(mutateCreativeWorkPieceReference({
        workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1",
        mutation: { kind: "replace", assetId: "asset-2" },
      })).resolves.toBeNull();

      expect(mocks.txSetMock).not.toHaveBeenCalled();
    });

    it("uses the prepare lock to atomically remove a draft source and invalidate its frozen inputs", async () => {
      const source = { id: "source-1", workspaceId: "ws-1", workItemId: "work-1", assetId: "asset-1", usage: "both", status: "ready", updatedAt: new Date() };
      mocks.state.selectResults.push([{ id: "work-1" }], [source]);
      mocks.state.deleteResults.push([source]);
      mocks.state.txUpdateResults.push([workItem({ toolKind: "single", status: "draft" })]);

      await expect(mutateCreativeWorkDraftSource({
        workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1", mutation: { kind: "remove" },
      })).resolves.toEqual(source);

      expect(mocks.executeMock).toHaveBeenCalledWith(expect.anything());
      expect(mocks.txSetMock).toHaveBeenCalledWith(expect.objectContaining({ brief: null, copy: null, inputSnapshot: null }));
    });

    it("reopens a ready zero-output work before changing a source under its revision CAS", async () => {
      const updatedAt = new Date("2026-08-31T12:00:00.000Z");
      const ready = workItem({ id: "work-1", status: "ready", updatedAt });
      const source = { id: "source-1", workspaceId: "ws-1", workItemId: "work-1", assetId: "asset-1", usage: "both", status: "ready", updatedAt };
      mocks.state.selectResults.push([ready], [{ outputCount: 0 }], [source]);
      mocks.state.deleteResults.push([source]);
      mocks.state.txUpdateResults.push([workItem({ status: "draft", brief: null, copy: null, inputSnapshot: null, identitySnapshot: null })]);

      await expect(mutateCreativeWorkDraftSource({
        workspaceId: "ws-1", workItemId: "work-1", expectedUpdatedAt: updatedAt, sourceId: "source-1", mutation: { kind: "remove" },
      })).resolves.toEqual(source);

      expect(mocks.txSetMock).toHaveBeenCalledWith(expect.objectContaining({ status: "draft", identitySnapshot: null, brief: null, copy: null, inputSnapshot: null }));
    });

    it("returns a conflict without changing a source after prepare owns the draft", async () => {
      mocks.state.selectResults.push([]);

      await expect(mutateCreativeWorkDraftSource({
        workspaceId: "ws-1", workItemId: "work-1", sourceId: "source-1", mutation: { kind: "update", patch: { status: "uploaded" } },
      })).resolves.toBeNull();
      expect(mocks.txSetMock).not.toHaveBeenCalled();
    });

    it("reads tool kind after the shared lock and normalizes a racing attach as Single", async () => {
      const source = { id: "source-1", workspaceId: "ws-1", workItemId: "work-1", assetId: "asset-1", usage: "both", usageConfirmed: true, status: "uploaded" };
      mocks.state.selectResults.push(
        [{ id: "asset-1" }],
        [{ id: "work-1", toolKind: "single" }],
        [],
        [{ sourceCount: 0 }],
      );
      mocks.state.onConflictResults.push([source]);
      mocks.state.txUpdateResults.push([workItem()]);

      await expect(createCreativeWorkSource({
        workspaceId: "ws-1", workItemId: "work-1", assetId: "asset-1", usage: "content", usageConfirmed: false, status: "uploaded",
      })).resolves.toEqual({ source, claimedForAnalysis: true });

      expect(mocks.executeMock).toHaveBeenCalledOnce();
      expect(mocks.valuesMock).toHaveBeenCalledWith(expect.objectContaining({
        usage: "both", usageConfirmed: true,
        pieceReference: { version: 1, category: null, classificationSource: "automatic", confidence: "low", userInstruction: null, hasTransparency: false },
      }));
    });
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
          title: socialBrief.theme,
          request: `${socialBrief.theme} — ${socialBrief.offer}`,
        }),
      );
      expect(result.id).toBe("new-work");
    });
  });

  describe("drafts, sources, and versions", () => {
    it("lists only completed selected assets scoped to the active workspace and brand", async () => {
      const candidate = {
        id: "output-1", workspaceId: "ws-1", clientProfileId: "profile-1", title: "Matrículas",
        assetId: "asset-1", status: "completed", isSelected: true, updatedAt: new Date(),
      };
      mocks.state.selectResults.push([candidate]);

      await expect(listCreativeWorkInspirationCandidates("ws-1", "profile-1")).resolves.toEqual([candidate]);

      const where = serializedCondition(mocks.whereMock.mock.calls.at(-1)?.[0]);
      expect(where.sql).toContain('"creative_work_outputs"."workspace_id"');
      expect(where.sql).toContain('"creative_work_items"."client_profile_id"');
      expect(where.sql).toContain('"creative_work_outputs"."status"');
      expect(where.sql).toContain('"creative_work_outputs"."is_selected"');
      expect(where.params).toEqual(["ws-1", "profile-1", "completed", true]);
      const joins = mocks.innerJoinMock.mock.calls.map(([condition]) => serializedCondition(condition));
      expect(joins.some((query) => query.params.includes("creative_work"))).toBe(true);
      expect(joins.every((query) => query.params.includes("ws-1"))).toBe(true);
    });

    it("atomically creates one attachment-first draft and source", async () => {
      const work = workItem({ id: "draft-asset", draftKey: "draft-key", request: "", brief: null });
      const source = { id: "source-1", workspaceId: "ws-1", workItemId: work.id, assetId: "asset-1", templateId: null, usage: "both", status: "uploaded" };
      const asset = { id: "asset-1", workspaceId: "ws-1", name: "arte.png", type: "image/png", source: "upload" };
      mocks.state.selectResults.push([{ id: "profile-1" }], [asset], [work]);
      mocks.state.onConflictResults.push([work], [source]);

      await expect(createCreativeWorkDraftWithSource({
        workspaceId: "ws-1", clientProfileId: "profile-1", createdByUserId: "user-1",
        draftKey: "draft-key", intent: "variations", title: "", request: "", format: "4:5",
        settings: { targetFormats: [] }, assetId: "asset-1", usage: "both",
      })).resolves.toEqual({ work, source, asset, claimedForAnalysis: true });

      expect(mocks.transactionMock).toHaveBeenCalledOnce();
      expect(mocks.onConflictDoNothingMock).toHaveBeenCalledTimes(2);
    });

    it("atomically creates one template-first draft and source", async () => {
      const work = workItem({ id: "draft-template", draftKey: "draft-key", request: "", brief: null });
      const source = { id: "source-template", workspaceId: "ws-1", workItemId: work.id, assetId: null, templateId: "template-1", usage: "both", status: "uploaded" };
      const template = { id: "template-1", workspaceId: "ws-1", name: "Lançamento" };
      mocks.state.selectResults.push([{ id: "profile-1" }], [template], [work]);
      mocks.state.onConflictResults.push([work], [source]);

      await expect(createCreativeWorkDraftWithSource({
        workspaceId: "ws-1", clientProfileId: "profile-1", createdByUserId: "user-1",
        draftKey: "draft-key", intent: "variations", title: "", request: "", format: "4:5",
        settings: { targetFormats: [] }, templateId: "template-1", usage: "both",
      })).resolves.toEqual({ work, source, template, claimedForAnalysis: true });

      expect(mocks.transactionMock).toHaveBeenCalledOnce();
      expect(mocks.onConflictDoNothingMock).toHaveBeenCalledTimes(2);
    });

    it("normalizes an initial Single asset source while leaving a Single template legacy-shaped", async () => {
      const assetWork = workItem({ id: "single-asset", draftKey: "single-asset-key", request: "", brief: null, toolKind: "single" });
      const assetSource = { id: "single-asset-source", workspaceId: "ws-1", workItemId: assetWork.id, assetId: "asset-1", templateId: null, usage: "both", usageConfirmed: true, status: "uploaded" };
      const asset = { id: "asset-1", workspaceId: "ws-1", name: "produto.png", type: "image/png", source: "upload" };
      const templateWork = workItem({ id: "single-template", draftKey: "single-template-key", request: "", brief: null, toolKind: "single" });
      const templateSource = { id: "single-template-source", workspaceId: "ws-1", workItemId: templateWork.id, assetId: null, templateId: "template-1", usage: "style", usageConfirmed: false, status: "uploaded" };
      const template = { id: "template-1", workspaceId: "ws-1", name: "Lançamento" };
      mocks.state.selectResults.push(
        [{ id: "profile-1" }], [asset], [assetWork], [], [{ sourceCount: 0 }],
        [{ id: "profile-1" }], [template], [templateWork],
      );
      mocks.state.onConflictResults.push([assetWork], [assetSource], [templateWork], [templateSource]);

      await createCreativeWorkDraftWithSource({
        workspaceId: "ws-1", clientProfileId: "profile-1", createdByUserId: "user-1", draftKey: "single-asset-key",
        intent: "single", title: "", request: "", format: "4:5", settings: { targetFormats: [] }, assetId: "asset-1", usage: "style",
      });
      await createCreativeWorkDraftWithSource({
        workspaceId: "ws-1", clientProfileId: "profile-1", createdByUserId: "user-1", draftKey: "single-template-key",
        intent: "single", title: "", request: "", format: "4:5", settings: { targetFormats: [] }, templateId: "template-1", usage: "style",
      });

      expect(mocks.valuesMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
        assetId: "asset-1", usage: "both", usageConfirmed: true,
        pieceReference: { version: 1, category: null, classificationSource: "automatic", confidence: "low", userInstruction: null, hasTransparency: false },
      }));
      expect(mocks.valuesMock).toHaveBeenNthCalledWith(4, expect.objectContaining({
        templateId: "template-1", usage: "style", usageConfirmed: false, pieceReference: null,
      }));
    });

    it("takes a work-scoped advisory lock and rejects a fourth Single asset before insert", async () => {
      mocks.state.selectResults.push(
        [{ id: "asset-4", type: "image/png" }],
        [{ id: "work-1", toolKind: "single" }],
        [],
        [{ sourceCount: 3 }],
      );

      await expect(createCreativeWorkSource({
        workspaceId: "ws-1", workItemId: "work-1", assetId: "asset-4", usage: "both", status: "uploaded",
        pieceReference: { version: 1, category: null, classificationSource: "automatic", confidence: "low", userInstruction: null, hasTransparency: false },
      })).resolves.toEqual({ limitReached: true });

      expect(mocks.executeMock).toHaveBeenCalledOnce();
      expect(mocks.onConflictDoNothingMock).not.toHaveBeenCalled();
      const scopedCount = serializedCondition(mocks.whereMock.mock.calls.at(-1)?.[0]);
      expect(scopedCount.params).toEqual(expect.arrayContaining(["ws-1", "work-1"]));
    });

    it("re-reads the locked work before replaying a Variations request as a fourth Single asset", async () => {
      const readBeforeLock = workItem({ id: "single-replay", draftKey: "replay-key", toolKind: "variations", clientProfileId: "profile-1", request: "", brief: null });
      const lockedSingle = { ...readBeforeLock, toolKind: "single" as const };
      const asset = { id: "asset-four", workspaceId: "ws-1", name: "quarto.png", type: "image/png", source: "upload" };
      mocks.state.selectResults.push(
        [{ id: "profile-1" }], [asset], [readBeforeLock], [lockedSingle], [], [{ sourceCount: 3 }],
      );
      mocks.state.onConflictResults.push([]);

      await expect(createCreativeWorkDraftWithSource({
        workspaceId: "ws-1", clientProfileId: "profile-1", createdByUserId: "user-1", draftKey: "replay-key",
        intent: "variations", title: "", request: "", format: "4:5", settings: { targetFormats: [] }, assetId: "asset-four", usage: "style",
      })).resolves.toEqual({ limitReached: true });

      expect(mocks.executeMock).toHaveBeenCalledOnce();
      expect(mocks.onConflictDoNothingMock).toHaveBeenCalledOnce();
      expect(mocks.valuesMock).not.toHaveBeenCalledWith(expect.objectContaining({ assetId: "asset-four" }));
      const lockOrder = mocks.executeMock.mock.invocationCallOrder[0];
      const selectOrders = mocks.selectMock.mock.invocationCallOrder;
      // profile, asset, stale Variations replay, lock, reread Single, source count
      expect(selectOrders[2]).toBeLessThan(lockOrder!);
      expect(lockOrder).toBeLessThan(selectOrders[3]!);
    });

    it.each([
      ["approved asset", { assetId: "asset-1" }, { id: "asset-1", type: "image/png" }],
      ["template", { templateId: "template-1" }, { id: "template-1" }],
    ] as const)("replays the same scoped %s source after its unique-index conflict", async (_label, sourceOrigin, origin) => {
      const existing = {
        id: "source-existing", workspaceId: "ws-1", workItemId: "work-1",
        assetId: "assetId" in sourceOrigin ? sourceOrigin.assetId : null,
        templateId: "templateId" in sourceOrigin ? sourceOrigin.templateId : null,
        usage: "both", status: "ready", createdAt: new Date(), updatedAt: new Date(),
      };
      mocks.state.selectResults.push([{ id: "work-1" }], [origin], [existing]);
      mocks.state.onConflictResults.push([]);

      await expect(createCreativeWorkSource({
        workspaceId: "ws-1", workItemId: "work-1", ...sourceOrigin,
        usage: "both", status: "uploaded",
      })).resolves.toEqual({ source: existing, claimedForAnalysis: false });

      expect(mocks.onConflictDoNothingMock).toHaveBeenCalledOnce();
      expect(mocks.txUpdateMock).not.toHaveBeenCalled();
      const replayScope = serializedCondition(mocks.whereMock.mock.calls.at(-1)?.[0]);
      expect(replayScope.sql).toContain('"creative_work_sources"."workspace_id"');
      expect(replayScope.sql).toContain('"creative_work_sources"."work_item_id"');
      expect(replayScope.params).toContain("ws-1");
      expect(replayScope.params).toContain("work-1");
      expect(replayScope.params).toContain(origin.id);
    });

    it("does not mask a replay whose usage payload differs", async () => {
      const existing = {
        id: "source-existing", workspaceId: "ws-1", workItemId: "work-1",
        assetId: "asset-1", templateId: null, usage: "content", status: "ready",
      };
      mocks.state.selectResults.push([{ id: "work-1" }], [{ id: "asset-1", type: "image/png" }], [existing]);
      mocks.state.onConflictResults.push([]);

      await expect(createCreativeWorkSource({
        workspaceId: "ws-1", workItemId: "work-1", assetId: "asset-1",
        usage: "style", status: "uploaded",
      })).resolves.toBeNull();
    });

    it("reuses the same work and source when draftKey plus asset is replayed", async () => {
      const work = workItem({ id: "same-draft", draftKey: "draft-key", clientProfileId: "profile-1", request: "", brief: null });
      const source = { id: "same-source", workspaceId: "ws-1", workItemId: work.id, assetId: "asset-1", templateId: null, usage: "both", status: "uploaded" };
      const asset = { id: "asset-1", workspaceId: "ws-1", name: "arte.png", type: "image/png", source: "upload" };
      mocks.state.selectResults.push([{ id: "profile-1" }], [asset], [work], [work], [source]);
      mocks.state.onConflictResults.push([], []);

      await expect(createCreativeWorkDraftWithSource({
        workspaceId: "ws-1", clientProfileId: "profile-1", createdByUserId: "user-1",
        draftKey: "draft-key", intent: "variations", title: "", request: "", format: "4:5",
        settings: { targetFormats: [] }, assetId: "asset-1", usage: "both",
      })).resolves.toEqual({ work, source, asset, claimedForAnalysis: false });

      expect(mocks.onConflictDoNothingMock).toHaveBeenCalledTimes(2);
    });

    it.each([
      ["approved asset", { assetId: "asset-1" }, { id: "asset-1", type: "image/png", name: "Arte" }],
      ["template", { templateId: "template-1" }, { id: "template-1", name: "Template" }],
    ] as const)("rejects attachment-first %s replay with divergent usage", async (_label, sourceOrigin, origin) => {
      const work = workItem({ id: "same-draft", draftKey: "draft-key", clientProfileId: "profile-1", request: "", brief: null });
      const existing = {
        id: "same-source", workspaceId: "ws-1", workItemId: work.id,
        assetId: "assetId" in sourceOrigin ? sourceOrigin.assetId : null,
        templateId: "templateId" in sourceOrigin ? sourceOrigin.templateId : null,
        usage: "content", status: "uploaded",
      };
      mocks.state.selectResults.push([{ id: "profile-1" }], [origin], [work], [work], [existing]);
      mocks.state.onConflictResults.push([], []);

      await expect(createCreativeWorkDraftWithSource({
        workspaceId: "ws-1", clientProfileId: "profile-1", createdByUserId: "user-1",
        draftKey: "draft-key", intent: "variations", title: "", request: "", format: "4:5",
        settings: { targetFormats: [] }, ...sourceOrigin, usage: "style",
      })).resolves.toBeNull();
    });

    it("rejects a replay when the draftKey belongs to another client profile", async () => {
      const work = workItem({ id: "other-draft", draftKey: "draft-key", clientProfileId: "other-profile", request: "", brief: null });
      const asset = { id: "asset-1", workspaceId: "ws-1", name: "arte.png", type: "image/png", source: "upload" };
      mocks.state.selectResults.push([{ id: "profile-1" }], [asset], [work], [work]);
      mocks.state.onConflictResults.push([]);

      await expect(createCreativeWorkDraftWithSource({
        workspaceId: "ws-1", clientProfileId: "profile-1", createdByUserId: "user-1",
        draftKey: "draft-key", intent: "variations", title: "", request: "", format: "4:5",
        settings: { targetFormats: [] }, assetId: "asset-1", usage: "both",
      })).resolves.toBeNull();
    });

    it("rejects the transaction when source persistence cannot be resolved", async () => {
      const work = workItem({ id: "draft-asset", draftKey: "draft-key", request: "", brief: null });
      const asset = { id: "asset-1", workspaceId: "ws-1", name: "arte.png", type: "image/png", source: "upload" };
      mocks.state.selectResults.push([{ id: "profile-1" }], [asset], [work], []);
      mocks.state.onConflictResults.push([work], []);

      await expect(createCreativeWorkDraftWithSource({
        workspaceId: "ws-1", clientProfileId: "profile-1", createdByUserId: "user-1",
        draftKey: "draft-key", intent: "variations", title: "", request: "", format: "4:5",
        settings: { targetFormats: [] }, assetId: "asset-1", usage: "both",
      })).rejects.toThrow("creative_work_source_conflict_without_row");
    });
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

    it("namespaces revision operations and atomically claims only the inserted row for dispatch", async () => {
      const parent = workOutput({ id: "output-1", targetFormat: "4:5", versionNumber: 1 });
      const key2 = "00000000-0000-4000-8000-000000000102";
      const key3 = "00000000-0000-4000-8000-000000000103";
      const revision2 = workOutput({ id: "output-2", parentOutputId: "output-1", targetFormat: "4:5", versionNumber: 2, operationKey: `revision:${key2}`, revisionInstruction: "Shorter" });
      const revision3 = workOutput({ id: "output-3", parentOutputId: "output-1", targetFormat: "4:5", versionNumber: 3, operationKey: `revision:${key3}`, revisionInstruction: "Different" });

      mocks.state.selectResults.push([parent], [], [], [{ maxVersion: 1 }]);
      mocks.state.onConflictResults.push([revision2]);
      await expect(createCreativeWorkRevision("ws-1", "work-1", key2, "output-1", "Shorter", null)).resolves.toEqual({
        output: revision2,
        claimedForDispatch: true,
      });

      mocks.state.selectResults.push([parent], [], [], [{ maxVersion: 2 }]);
      mocks.state.onConflictResults.push([revision3]);
      await expect(createCreativeWorkRevision("ws-1", "work-1", key3, "output-1", "Different", null)).resolves.toEqual({
        output: revision3,
        claimedForDispatch: true,
      });

      mocks.state.selectResults.push([parent], [revision2]);
      await expect(createCreativeWorkRevision("ws-1", "work-1", key2, "output-1", "Shorter", null)).resolves.toEqual({
        output: revision2,
        claimedForDispatch: false,
      });
      expect(mocks.valuesMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ versionNumber: 2, operationKey: `revision:${key2}` }));
      expect(mocks.valuesMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ versionNumber: 3, operationKey: `revision:${key3}` }));
      expect(mocks.executeMock).toHaveBeenCalledTimes(2);
      expect(mocks.selectMock.mock.calls[3][0]).toEqual({ maxVersion: expect.anything() });
      expect(mocks.executeMock.mock.invocationCallOrder[0]).toBeLessThan(mocks.selectMock.mock.invocationCallOrder[3]);
      expect(mocks.executeMock.mock.invocationCallOrder[0]).toBeLessThan(mocks.insertMock.mock.invocationCallOrder[0]);
    });

    it("rejects a replay key when parent, instruction, or asset differs", async () => {
      const key = "00000000-0000-4000-8000-000000000104";
      const revision = workOutput({
        id: "output-2",
        parentOutputId: "output-1",
        operationKey: `revision:${key}`,
        revisionInstruction: "Shorter",
        revisionAssetId: "asset-1",
      });

      for (const command of [
        { parentId: "other-parent", instruction: "Shorter", assetId: "asset-1" },
        { parentId: "output-1", instruction: "Different", assetId: "asset-1" },
        { parentId: "output-1", instruction: "Shorter", assetId: "asset-2" },
      ]) {
        mocks.state.selectResults.push([workOutput({ id: command.parentId })], [revision]);
        await expect(createCreativeWorkRevision(
          "ws-1",
          "work-1",
          key,
          command.parentId,
          command.instruction,
          command.assetId,
        )).resolves.toBeNull();
      }

      expect(mocks.insertMock).not.toHaveBeenCalled();
    });

    it("keeps revision identity and version sequence scoped to the parent direction", async () => {
      const directionId = "00000000-0000-4000-8000-0000000000d1";
      const snapshot = { label: "A", instruction: "Make it A", order: 0 };
      const parent = workOutput({
        id: "output-1",
        targetFormat: "4:5",
        versionNumber: 1,
        operationKey: `balanced:4:5:1:direction:${directionId}`,
        directionId,
        directionSnapshot: snapshot,
      });
      const key = "00000000-0000-4000-8000-000000000105";
      const revision = workOutput({
        id: "output-2",
        parentOutputId: "output-1",
        targetFormat: "4:5",
        versionNumber: 2,
        operationKey: `revision:${key}`,
        revisionInstruction: "Shorter",
        directionId,
        directionSnapshot: snapshot,
      });

      mocks.state.selectResults.push([parent], [], [], [{ maxVersion: 1 }]);
      mocks.state.onConflictResults.push([revision]);

      await expect(createCreativeWorkRevision("ws-1", "work-1", key, "output-1", "Shorter", null)).resolves.toEqual({
        output: revision,
        claimedForDispatch: true,
      });

      expect(mocks.valuesMock).toHaveBeenCalledWith(expect.objectContaining({
        versionNumber: 2,
        operationKey: `revision:${key}`,
        directionId,
        directionSnapshot: snapshot,
      }));
      const lockQuery = serializedCondition(mocks.executeMock.mock.calls[0][0]);
      expect(lockQuery.params).toEqual([`ws-1:work-1:balanced:4:5:direction:${directionId}`]);
      const versionScopeQuery = mocks.whereMock.mock.calls
        .map(([condition]) => serializedCondition(condition))
        .find((query) => query.params.includes("balanced") && query.params.includes(directionId));
      expect(versionScopeQuery?.params).toEqual(["ws-1", "work-1", "balanced", "4:5", directionId]);
    });

    it("rejects the same revision key against a different directional parent", async () => {
      const directionA = "00000000-0000-4000-8000-0000000000d1";
      const directionB = "00000000-0000-4000-8000-0000000000d2";
      const parentA = workOutput({
        id: "output-a",
        directionId: directionA,
        directionSnapshot: { label: "A", instruction: "Make it A", order: 0 },
      });
      const parentB = workOutput({
        id: "output-b",
        directionId: directionB,
        directionSnapshot: { label: "B", instruction: "Make it B", order: 1 },
      });
      const key = "00000000-0000-4000-8000-000000000108";
      const revision = workOutput({
        id: "output-a2",
        parentOutputId: parentA.id,
        operationKey: `revision:${key}`,
        revisionInstruction: "Shorter",
        directionId: directionA,
      });

      mocks.state.selectResults.push([parentA], [], [], [{ maxVersion: 1 }]);
      mocks.state.onConflictResults.push([revision]);
      await expect(createCreativeWorkRevision("ws-1", "work-1", key, parentA.id, "Shorter", null)).resolves.toEqual({
        output: revision,
        claimedForDispatch: true,
      });

      mocks.state.selectResults.push([parentB], [revision]);
      await expect(createCreativeWorkRevision("ws-1", "work-1", key, parentB.id, "Shorter", null)).resolves.toBeNull();

      expect(mocks.valuesMock).toHaveBeenCalledOnce();
      expect(mocks.executeMock).toHaveBeenCalledOnce();
    });

    it("keeps revisions of different directions at the same level and format in independent sequences", async () => {
      const directionA = "00000000-0000-4000-8000-0000000000d1";
      const directionB = "00000000-0000-4000-8000-0000000000d2";
      const parentA = workOutput({
        id: "output-a",
        operationKey: `balanced:4:5:1:direction:${directionA}`,
        directionId: directionA,
        directionSnapshot: { label: "A", instruction: "Make it A", order: 0 },
      });
      const parentB = workOutput({
        id: "output-b",
        operationKey: `balanced:4:5:1:direction:${directionB}`,
        directionId: directionB,
        directionSnapshot: { label: "B", instruction: "Make it B", order: 1 },
      });
      const keyA = "00000000-0000-4000-8000-000000000106";
      const keyB = "00000000-0000-4000-8000-000000000107";
      const revisionA = workOutput({
        id: "output-a2",
        parentOutputId: "output-a",
        versionNumber: 2,
        operationKey: `revision:${keyA}`,
        revisionInstruction: "Shorter",
        directionId: directionA,
      });
      const revisionB = workOutput({
        id: "output-b2",
        parentOutputId: "output-b",
        versionNumber: 2,
        operationKey: `revision:${keyB}`,
        revisionInstruction: "Shorter",
        directionId: directionB,
      });

      mocks.state.selectResults.push([parentA], [], [], [{ maxVersion: 1 }]);
      mocks.state.onConflictResults.push([revisionA]);
      await expect(createCreativeWorkRevision("ws-1", "work-1", keyA, "output-a", "Shorter", null)).resolves.toEqual({
        output: revisionA,
        claimedForDispatch: true,
      });

      mocks.state.selectResults.push([parentB], [], [], [{ maxVersion: 1 }]);
      mocks.state.onConflictResults.push([revisionB]);
      await expect(createCreativeWorkRevision("ws-1", "work-1", keyB, "output-b", "Shorter", null)).resolves.toEqual({
        output: revisionB,
        claimedForDispatch: true,
      });

      expect(mocks.valuesMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
        versionNumber: 2,
        operationKey: `revision:${keyA}`,
        directionId: directionA,
      }));
      expect(mocks.valuesMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
        versionNumber: 2,
        operationKey: `revision:${keyB}`,
        directionId: directionB,
      }));
      const versionScopes = mocks.whereMock.mock.calls
        .map(([condition]) => serializedCondition(condition))
        .filter((query) => query.params.length === 5 && query.params[0] === "ws-1");
      expect(versionScopes.map((query) => query.params.at(-1))).toEqual([directionA, directionB]);
      const lockScopes = mocks.executeMock.mock.calls
        .map(([query]) => serializedCondition(query).params[0]);
      expect(lockScopes).toEqual([
        `ws-1:work-1:balanced:4:5:direction:${directionA}`,
        `ws-1:work-1:balanced:4:5:direction:${directionB}`,
      ]);
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
      expect(query.sql).toContain("date_trunc('milliseconds'");
      expect(query.sql).toContain("timestamp without time zone");
      expect(query.params).toHaveLength(4);
      expect(query.params.at(-1)).toBe(capturedAt.toISOString());
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
      mocks.state.onConflictResults.push([source]);
      mocks.state.txUpdateResults.push([workItem()]);
      await expect(createCreativeWorkSource({
        workspaceId: "ws-1", workItemId: "work-1", assetId: "asset-1", usage: "both", status: "uploaded",
      })).resolves.toEqual({ source, claimedForAnalysis: true });
      expect(mocks.valuesMock).toHaveBeenCalledWith(expect.objectContaining({ assetId: "asset-1", usage: "both" }));
      expect(mocks.txUpdateMock).toHaveBeenCalledWith(expect.anything());
      expect(mocks.txSetMock).toHaveBeenLastCalledWith(expect.objectContaining({
        brief: null,
        copy: null,
        inputSnapshot: null,
      }));
    });

    it("invalidates prepared fields after updating or deleting a source", async () => {
      const source = { id: "source-1", workspaceId: "ws-1", workItemId: "work-1", status: "ready" };
      mocks.state.txUpdateResults.push([source], [workItem()]);
      await updateCreativeWorkSource("ws-1", "work-1", "source-1", { status: "ready" });
      mocks.state.deleteResults.push([source]);
      mocks.state.txUpdateResults.push([workItem()]);
      await deleteCreativeWorkSource("ws-1", "work-1", "source-1");
      expect(mocks.txUpdateMock).toHaveBeenCalledTimes(3);
      expect(mocks.txSetMock.mock.calls.slice(1)).toEqual([
        [expect.objectContaining({ brief: null, copy: null, inputSnapshot: null })],
        [expect.objectContaining({ brief: null, copy: null, inputSnapshot: null })],
      ]);
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
      expect(mocks.txSetMock).toHaveBeenLastCalledWith(expect.objectContaining({
        brief: null,
        copy: null,
        inputSnapshot: null,
      }));
      const query = serializedCondition(mocks.whereMock.mock.calls[0][0]);
      expect(query.sql).toContain('"creative_work_sources"."status"');
      expect(query.sql).toContain('"creative_work_sources"."usage"');
      expect(query.sql).toContain('"creative_work_sources"."updated_at"');
      expect(query.sql).toContain("date_trunc('milliseconds'");
      expect(query.sql).toContain("timestamp without time zone");
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

    it("freezes direction id and snapshot on planned outputs", async () => {
      const planned = workOutput({
        id: "output-direction",
        targetFormat: "4:5",
        versionNumber: 1,
        operationKey: "balanced:4:5:1:direction:00000000-0000-4000-8000-0000000000d1",
        directionId: "00000000-0000-4000-8000-0000000000d1",
        directionSnapshot: { label: "A", instruction: "Make it A", order: 0 },
      });
      mocks.state.selectResults.push([{ id: "work-1" }], [planned]);
      const result = await createPlannedCreativeWorkOutputs("ws-1", "work-1", [{
        creativeLevel: "balanced",
        targetFormat: "4:5",
        versionNumber: 1,
        directionId: "00000000-0000-4000-8000-0000000000d1",
        directionSnapshot: { label: "A", instruction: "Make it A", order: 0 },
      }]);
      expect(mocks.valuesMock).toHaveBeenCalledWith([expect.objectContaining({
        operationKey: "balanced:4:5:1:direction:00000000-0000-4000-8000-0000000000d1",
        directionId: "00000000-0000-4000-8000-0000000000d1",
        directionSnapshot: { label: "A", instruction: "Make it A", order: 0 },
      })]);
      expect(result.outputs).toHaveLength(1);
    });

    it("creates distinct plans for each selected direction without unique conflicts", async () => {
      const planned = [
        workOutput({
          id: "output-direction-a",
          targetFormat: "4:5",
          versionNumber: 1,
          operationKey: "balanced:4:5:1:direction:00000000-0000-4000-8000-0000000000d1",
          directionId: "00000000-0000-4000-8000-0000000000d1",
          directionSnapshot: { label: "A", instruction: "Make it A", order: 0 },
        }),
        workOutput({
          id: "output-direction-b",
          targetFormat: "4:5",
          versionNumber: 1,
          operationKey: "balanced:4:5:1:direction:00000000-0000-4000-8000-0000000000d2",
          directionId: "00000000-0000-4000-8000-0000000000d2",
          directionSnapshot: { label: "B", instruction: "Make it B", order: 1 },
        }),
      ];
      mocks.state.selectResults.push([{ id: "work-1" }], planned);
      const result = await createPlannedCreativeWorkOutputs("ws-1", "work-1", [
        {
          creativeLevel: "balanced",
          targetFormat: "4:5",
          versionNumber: 1,
          directionId: "00000000-0000-4000-8000-0000000000d1",
          directionSnapshot: { label: "A", instruction: "Make it A", order: 0 },
        },
        {
          creativeLevel: "balanced",
          targetFormat: "4:5",
          versionNumber: 1,
          directionId: "00000000-0000-4000-8000-0000000000d2",
          directionSnapshot: { label: "B", instruction: "Make it B", order: 1 },
        },
      ]);
      const rows = mocks.valuesMock.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(2);
      const keys = rows.map((row) => row.operationKey);
      expect(new Set(keys).size).toBe(2);
      expect(keys).toEqual([
        "balanced:4:5:1:direction:00000000-0000-4000-8000-0000000000d1",
        "balanced:4:5:1:direction:00000000-0000-4000-8000-0000000000d2",
      ]);
      expect(result.outputs).toHaveLength(2);
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

    it("increments the durable attempt when manually requeuing a failed output", async () => {
      const retried = workOutput({ retryCount: 2, status: "queued" });
      mocks.state.updateResults.push([retried]);

      await expect(requeueFailedCreativeWorkOutput(
        "ws-1",
        "work-1",
        "output-1",
        1,
      )).resolves.toEqual(retried);

      expect(mocks.setMock).toHaveBeenCalledWith(expect.objectContaining({
        status: "queued",
        retryCount: expect.anything(),
      }));
      const query = serializedCondition(mocks.whereMock.mock.calls.at(-1)?.[0]);
      expect(query.params).toContain("failed");
      expect(query.params).toContain(1);
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

  describe("claimCreativeWorkOutputImageCall", () => {
    it("defines the durable counter as NOT NULL with a zero default so existing rows read as 0", () => {
      const column = creativeWorkOutputs.imageCallCount;
      expect(column.notNull).toBe(true);
      expect(column.hasDefault).toBe(true);
      expect(column.default).toBe(0);
    });

    it("relies on the column default instead of listing imageCallCount when planning outputs", async () => {
      const planned = workOutput({ targetFormat: "1:1", versionNumber: 1, operationKey: "bold:1:1:1", imageCallCount: 0 });
      mocks.state.selectResults.push([{ id: "work-1" }], [planned]);

      await createPlannedCreativeWorkOutputs("ws-1", "work-1", [{ creativeLevel: "bold", targetFormat: "1:1" }]);

      const seedRows = mocks.valuesMock.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>;
      expect(seedRows.length).toBeGreaterThan(0);
      expect(seedRows.every((row) => !("imageCallCount" in row))).toBe(true);
    });

    it("claims the first image call atomically on the scoped output (0→1)", async () => {
      const claimed = workOutput({ imageCallCount: 1, status: "processing" });
      mocks.state.updateResults.push([claimed]);

      await expect(claimCreativeWorkOutputImageCall("ws-1", "work-1", "output-1")).resolves.toEqual(claimed);

      const setPatch = mocks.setMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(setPatch).toHaveProperty("imageCallCount");
      // The claim is the sole authority on provider calls: it never reuses
      // the operational retry counter nor flips status.
      expect(setPatch).not.toHaveProperty("retryCount");
      expect(setPatch).not.toHaveProperty("status");
      const query = serializedCondition(mocks.whereMock.mock.calls.at(-1)?.[0]);
      expect(query.sql).toContain('"creative_work_outputs"."image_call_count"');
      expect(query.params).toEqual(["ws-1", "work-1", "output-1", 2]);
    });

    it("claims the second and final image call (1→2)", async () => {
      const claimed = workOutput({ imageCallCount: 2, status: "processing" });
      mocks.state.updateResults.push([claimed]);

      await expect(claimCreativeWorkOutputImageCall("ws-1", "work-1", "output-1")).resolves.toEqual(claimed);

      const query = serializedCondition(mocks.whereMock.mock.calls.at(-1)?.[0]);
      expect(query.sql).toContain('"creative_work_outputs"."image_call_count"');
      expect(query.params).toEqual(["ws-1", "work-1", "output-1", 2]);
    });

    it("refuses a third image call before the provider is reached (2→3 rejected by the CAS guard)", async () => {
      // The guarded UPDATE matches no row once image_call_count = 2, so the
      // claim fails without side effects instead of reaching the provider.
      mocks.state.updateResults.push([]);

      await expect(claimCreativeWorkOutputImageCall("ws-1", "work-1", "output-1")).resolves.toBeNull();

      expect(mocks.setMock).toHaveBeenCalledOnce();
      const setPatch = mocks.setMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(setPatch).not.toHaveProperty("retryCount");
    });

    it("refuses to claim an output outside the workspace/work-item scope", async () => {
      mocks.state.updateResults.push([]);

      await expect(claimCreativeWorkOutputImageCall("ws-2", "work-1", "output-1")).resolves.toBeNull();
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
      const query = serializedCondition(mocks.whereMock.mock.calls.at(-1)?.[0]);
      expect(query.sql).toContain("timestamp without time zone");
      expect(query.params.at(-1)).toBe(staleBefore);
      expect(result).toEqual([failed]);
    });
  });

  describe("failStaleCreativeWorkSources", () => {
    it("turns stale uploaded or analyzing sources into retryable failures", async () => {
      const failed = {
        id: "source-1",
        status: "failed",
        failureCode: "analysis_timeout",
      };
      mocks.state.updateResults.push([failed]);
      const staleBefore = new Date("2026-07-15T12:00:00.000Z");

      const result = await failStaleCreativeWorkSources(
        "ws-1",
        "work-1",
        staleBefore,
      );

      expect(mocks.setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          failureCode: "analysis_timeout",
        }),
      );
      const query = serializedCondition(mocks.whereMock.mock.calls.at(-1)?.[0]);
      expect(query.sql).toContain("timestamp without time zone");
      expect(query.params.at(-1)).toBe(staleBefore);
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
      expect(query.sql).toContain("date_trunc('milliseconds'");
      expect(query.sql).toContain("timestamp without time zone");
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
      mocks.state.selectResults.push([{ generationCorrelationId: "generation-1" }], outputs);

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
      mocks.state.selectResults.push([{ generationCorrelationId: "generation-1" }], existing);

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

  describe("countCreativeWorkProcessingOutputs", () => {
    it("returns the current processing-unit snapshot scoped to the generation", async () => {
      mocks.state.selectResults.push([{ count: "2" }]);

      await expect(countCreativeWorkProcessingOutputs("ws-1", "work-1")).resolves.toBe(2);
      expect(serializedCondition(mocks.whereMock.mock.calls.at(-1)?.[0]).params).toEqual(
        expect.arrayContaining(["ws-1", "work-1", "processing"]),
      );
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

  describe("recordCreativeWorkGenerationAggregate", () => {
    it("fixes the first terminal and closes a partial aggregate with durable CAS markers", async () => {
      const createdAt = new Date("2026-07-28T12:00:00.000Z");
      const queuedAt = new Date("2026-07-28T12:00:00.100Z");
      const firstTerminalAt = new Date("2026-07-28T12:00:00.250Z");
      const completedAt = new Date("2026-07-28T12:00:01.000Z");
      mocks.state.selectResults.push(
        [{
          generationCorrelationId: "generation-1",
          createdAt,
          generationFirstTerminalAt: null,
          generationCompletedAt: null,
        }],
        [
          { status: "completed", queuedAt, createdAt: queuedAt, terminalAt: completedAt, updatedAt: new Date("2026-07-16T12:15:00.000Z") },
          { status: "failed", queuedAt, createdAt: queuedAt, terminalAt: firstTerminalAt, updatedAt: new Date("2026-07-16T12:20:00.000Z") },
        ],
      );
      mocks.state.txUpdateResults.push([{ id: "work-1" }], [{ id: "work-1" }]);

      await expect(recordCreativeWorkGenerationAggregate("ws-1", "work-1")).resolves.toMatchObject({
        generationCorrelationId: "generation-1",
        unitCount: 2,
        terminalCount: 2,
        successCount: 1,
        failureCount: 1,
        result: "partial",
        timeToFirstOutputMs: 150,
        totalDurationMs: 900,
        firstTerminalEmitted: true,
        completionEmitted: true,
      });
    });
  });

  describe("selectCreativeWorkOutput", () => {
    it("clears the previous selection and selects the new output in one transaction", async () => {
      const newlySelected = workOutput({ id: "output-1", isSelected: true });
      mocks.state.selectResults.push([workOutput({
        id: "output-1",
        status: "completed",
        outputKey: "creative-work/output-1/out.png",
        quality: { schemaVersion: 1, objectiveVerdict: "pass" },
      })]);
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

    it("keeps the previous selection when the locked candidate fails objective policy", async () => {
      mocks.state.selectResults.push([
        workOutput({
          id: "output-2",
          status: "completed",
          outputKey: "creative-work/output-2/out.png",
          quality: { schemaVersion: 1, objectiveVerdict: "fail" },
        }),
      ]);

      await expect(
        selectCreativeWorkOutput("ws-1", "work-1", "output-2", { confirmObjective: true })
      ).resolves.toBeNull();
      expect(mocks.txUpdateMock).not.toHaveBeenCalled();
    });

    it("keeps the previous selection for a locked legacy hard failure", async () => {
      mocks.state.selectResults.push([
        workOutput({
          id: "output-2",
          status: "completed",
          outputKey: "creative-work/output-2/out.png",
          quality: { qualityVerdict: "acceptable", hardFailures: [{ code: "wrong_brand" }] },
        }),
      ]);

      await expect(
        selectCreativeWorkOutput("ws-1", "work-1", "output-2", { confirmObjective: true })
      ).resolves.toBeNull();
      expect(mocks.txUpdateMock).not.toHaveBeenCalled();
    });

    it("checks Layerize locks while holding the work outputs transaction lock", async () => {
      mocks.state.selectResults.push([
        workOutput({
          id: "output-1",
          status: "completed",
          outputKey: "creative-work/output-1/out.png",
          quality: { schemaVersion: 1, objectiveVerdict: "pass" },
        }),
        workOutput({
          id: "output-2",
          status: "completed",
          outputKey: "creative-work/output-2/out.png",
          isSelected: true,
          layerization: queuedLayerization(),
        }),
      ]);

      await expect(
        selectCreativeWorkOutput("ws-1", "work-1", "output-1", { confirmObjective: true })
      ).resolves.toBeNull();
      expect(mocks.txUpdateMock).not.toHaveBeenCalled();
    });
  });

  describe("carousel visual-reference cap", () => {
    it("rejects a second non-failed carousel source before insert and analysis dispatch", async () => {
      mocks.state.selectResults.push(
        [{ id: "asset-2", type: "image/png" }],
        [{ id: "work-1", toolKind: "carousel" }],
        [],
        [{ sourceCount: 1 }],
      );

      await expect(createCreativeWorkSource({
        workspaceId: "ws-1", workItemId: "work-1", assetId: "asset-2", usage: "content", status: "uploaded",
      })).resolves.toEqual({ limitReached: true, reason: "carousel_reference_limit" });

      expect(mocks.executeMock).toHaveBeenCalledOnce();
      expect(mocks.valuesMock).not.toHaveBeenCalled();
      const capCondition = serializedCondition(mocks.whereMock.mock.calls.at(-1)?.[0]);
      expect(capCondition.sql).toContain('"creative_work_sources"."status"');
    });

    it("allows the first carousel source by forcing its usage to style", async () => {
      const work = workItem({ toolKind: "carousel", request: "", brief: null });
      const source = { id: "source-1", workspaceId: "ws-1", workItemId: "work-1", assetId: "asset-1", templateId: null, usage: "style", usageConfirmed: true, status: "uploaded" };
      mocks.state.selectResults.push(
        [{ id: "asset-1", type: "image/png" }],
        [{ id: "work-1", toolKind: "carousel" }],
        [],
        [{ sourceCount: 0 }],
      );
      mocks.state.onConflictResults.push([source]);
      mocks.state.txUpdateResults.push([work]);

      await expect(createCreativeWorkSource({
        workspaceId: "ws-1", workItemId: "work-1", assetId: "asset-1", usage: "content", status: "uploaded",
      })).resolves.toEqual({ source, claimedForAnalysis: true });

      expect(mocks.valuesMock).toHaveBeenCalledWith(expect.objectContaining({
        assetId: "asset-1", usage: "style", usageConfirmed: true,
      }));
    });

    it("ignores failed carousel sources when enforcing the one-reference cap", async () => {
      const work = workItem({ toolKind: "carousel", request: "", brief: null });
      const source = { id: "source-2", workspaceId: "ws-1", workItemId: "work-1", assetId: "asset-2", templateId: null, usage: "style", usageConfirmed: true, status: "uploaded" };
      mocks.state.selectResults.push(
        [{ id: "asset-2", type: "image/png" }],
        [{ id: "work-1", toolKind: "carousel" }],
        [],
        [{ sourceCount: 0 }],
      );
      mocks.state.onConflictResults.push([source]);
      mocks.state.txUpdateResults.push([work]);

      await expect(createCreativeWorkSource({
        workspaceId: "ws-1", workItemId: "work-1", assetId: "asset-2", usage: "style", status: "uploaded",
      })).resolves.toEqual({ source, claimedForAnalysis: true });
    });

    it("replays the same carousel source without counting it against the cap", async () => {
      const existing = {
        id: "source-existing", workspaceId: "ws-1", workItemId: "work-1",
        assetId: "asset-1", templateId: null, usage: "style", status: "ready", updatedAt: new Date(),
      };
      mocks.state.selectResults.push(
        [{ id: "asset-1", type: "image/png" }],
        [{ id: "work-1", toolKind: "carousel" }],
        [existing],
      );

      await expect(createCreativeWorkSource({
        workspaceId: "ws-1", workItemId: "work-1", assetId: "asset-1", usage: "content", status: "uploaded",
      })).resolves.toEqual({ source: existing, claimedForAnalysis: false });

      expect(mocks.valuesMock).not.toHaveBeenCalled();
    });

    it("caps the attachment-first draft creation for carousel before the source insert", async () => {
      const work = workItem({ toolKind: "carousel", request: "", brief: null });
      mocks.state.selectResults.push(
        [{ id: "profile-1" }],
        [{ id: "asset-1", type: "image/png" }],
        [work],
        [work],
        [],
        [{ sourceCount: 1 }],
      );

      await expect(createCreativeWorkDraftWithSource({
        workspaceId: "ws-1", clientProfileId: "profile-1", createdByUserId: "user-1", draftKey: "carousel-key",
        intent: "carousel", title: "", request: "", format: "4:5", settings: { targetFormats: [] },
        assetId: "asset-1", usage: "content",
      })).resolves.toEqual({ limitReached: true, reason: "carousel_reference_limit" });

      expect(mocks.executeMock).toHaveBeenCalledOnce();
      expect(mocks.valuesMock).toHaveBeenCalledTimes(1);
    });

    it("forces the attachment-first carousel source usage to style", async () => {
      const work = workItem({ toolKind: "carousel", request: "", brief: null });
      const source = { id: "source-1", workspaceId: "ws-1", workItemId: work.id, assetId: "asset-1", templateId: null, usage: "style", usageConfirmed: true, status: "uploaded" };
      mocks.state.selectResults.push(
        [{ id: "profile-1" }],
        [{ id: "asset-1", type: "image/png" }],
        [work],
        [],
        [{ sourceCount: 0 }],
      );
      mocks.state.onConflictResults.push([work], [source]);

      await expect(createCreativeWorkDraftWithSource({
        workspaceId: "ws-1", clientProfileId: "profile-1", createdByUserId: "user-1", draftKey: "carousel-key",
        intent: "carousel", title: "", request: "", format: "4:5", settings: { targetFormats: [] },
        assetId: "asset-1", usage: "content",
      })).resolves.toEqual({ work, source, asset: { id: "asset-1", type: "image/png" }, claimedForAnalysis: true });

      expect(mocks.valuesMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
        assetId: "asset-1", usage: "style", usageConfirmed: true,
      }));
    });

    it("rejects an autosave into carousel while two non-failed sources exist", async () => {
      mocks.state.selectResults.push(
        [workItem({ toolKind: "variations", request: "", brief: null })],
        [
          { id: "source-1", usage: "content", status: "ready" },
          { id: "source-2", usage: "style", status: "ready" },
        ],
      );

      await expect(autosaveCreativeWorkDraft({
        workspaceId: "ws-1", workItemId: "work-1", request: "", intent: "carousel", format: "4:5",
        settings: { targetFormats: [] },
      })).resolves.toEqual({ work: null, error: "carousel_reference_limit", sourcesNeedingSingleAnalysis: [] });

      expect(mocks.txUpdateMock).not.toHaveBeenCalled();
    });

    it("renormalizes the single carousel source to style on autosave and re-queues its analysis", async () => {
      const carouselWork = workItem({ toolKind: "carousel", request: "", brief: null });
      const normalized = { id: "source-1", usage: "style", status: "uploaded", updatedAt: new Date("2026-08-30T12:00:00.001Z") };
      mocks.state.selectResults.push(
        [carouselWork],
        [{ id: "source-1", usage: "content", status: "ready", updatedAt: new Date() }],
      );
      mocks.state.txUpdateResults.push([normalized], [carouselWork]);

      await expect(autosaveCreativeWorkDraft({
        workspaceId: "ws-1", workItemId: "work-1", request: "Novo pedido", intent: "carousel", format: "4:5",
        settings: { targetFormats: [] },
      })).resolves.toEqual({ work: carouselWork, error: null, sourcesNeedingSingleAnalysis: [normalized] });

      expect(mocks.txSetMock).toHaveBeenCalledWith(expect.objectContaining({
        usage: "style", usageConfirmed: true, status: "uploaded", failureCode: null,
      }));
    });

    it("does not renormalize a carousel source that is already style", async () => {
      const carouselWork = workItem({ toolKind: "carousel", request: "", brief: null });
      mocks.state.selectResults.push(
        [carouselWork],
        [{ id: "source-1", usage: "style", status: "ready", updatedAt: new Date() }],
      );
      mocks.state.txUpdateResults.push([carouselWork]);

      await expect(autosaveCreativeWorkDraft({
        workspaceId: "ws-1", workItemId: "work-1", request: "Novo pedido", intent: "carousel", format: "4:5",
        settings: { targetFormats: [] },
      })).resolves.toEqual({ work: carouselWork, error: null, sourcesNeedingSingleAnalysis: [] });

      expect(mocks.txSetMock).toHaveBeenCalledTimes(1);
    });
  });
});
