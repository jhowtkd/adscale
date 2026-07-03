import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  insertResults: [] as unknown[][],
  updateResults: [] as unknown[][],
  updateReturningRows: [] as unknown[][],
}));

vi.mock("../db", () => {
  const selectChain = {
    from: vi.fn(() => selectChain),
    where: vi.fn(() => selectChain),
    orderBy: vi.fn(() => selectChain),
    limit: vi.fn(async () => state.selectResults.shift() ?? []),
    then(resolve: (value: unknown) => void) {
      resolve(state.selectResults.shift() ?? []);
    },
  };

  const buildInsertChain = () => {
    const returning = vi.fn(async () => state.insertResults.shift() ?? []);
    const afterConflict = { returning };
    const valuesReturn = {
      returning,
      onConflictDoUpdate: vi.fn(() => afterConflict),
    };
    return { values: vi.fn(() => valuesReturn) };
  };

  const buildUpdateChain = () => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => state.updateReturningRows.shift() ?? []),
      })),
    })),
  });

  return {
    db: {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => buildInsertChain()),
      update: vi.fn(() => buildUpdateChain()),
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({
        select: vi.fn(() => selectChain),
        insert: vi.fn(() => buildInsertChain()),
        update: vi.fn(() => buildUpdateChain()),
      })),
    },
  };
});

vi.mock("./assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));

import { getAssistantThreadById } from "./assistant-thread";
import {
  AssistantGoalConflictError,
  AssistantGoalValidationError,
  createGoalRun,
  getGoalRunByThread,
  getGoalRunScoped,
  grantCorpusConsent,
  listAnnotationsForVersion,
  markAnnotationsAddressed,
  revokeCorpusConsent,
  submitAnnotationBatch,
  updateGoalRun,
  upsertAnnotationDraft,
  type AnnotationDraftInput,
} from "./assistant-goal";

const mockGetThread = vi.mocked(getAssistantThreadById);

const baseScope = {
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  threadId: "thread-1",
  userId: "user-1",
};

const baseGoal = {
  id: "goal-1",
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  threadId: "thread-1",
  campaignId: null,
  objective: "Vender mais",
  stage: "intake",
  brief: {
    productOffer: "",
    audience: "",
    constraints: "",
    objective: "Vender mais",
    cta: "",
    referenceIds: [],
    baseAssetId: null,
  },
  plan: { strategy: "", angles: [], hooks: [], ctas: [] },
  assumptions: [],
  blockers: ["productOffer", "audience", "constraints"],
  queuedInstruction: null,
  selectedBaseVersionId: null,
  revision: 0,
  startedByUserId: "user-1",
  completedAt: null,
  stoppedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseAnnotation = {
  id: "ann-1",
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  threadId: "thread-1",
  goalRunId: "goal-1",
  versionId: "version-1",
  actionRecordId: null,
  addressedByVersionId: null,
  x: 0.1,
  y: 0.2,
  width: 0.3,
  height: 0.2,
  comment: "Menor",
  status: "draft",
  createdByUserId: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const draftInput: AnnotationDraftInput = {
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  threadId: "thread-1",
  goalRunId: "goal-1",
  versionId: "version-1",
  createdByUserId: "user-1",
  x: 0.1,
  y: 0.2,
  width: 0.3,
  height: 0.2,
  comment: "Menor",
};

describe("assistant-goal repository", () => {
  beforeEach(() => {
    state.selectResults = [];
    state.insertResults = [];
    state.updateResults = [];
    state.updateReturningRows = [];
    vi.clearAllMocks();
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      workspaceId: "ws-1",
      clientProfileId: "client-1",
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);
  });

  describe("goal run lifecycle", () => {
    it("creates one goal run per thread and returns the winner on replay", async () => {
      // First call: no existing run -> insert.
      state.selectResults.push([]);
      state.insertResults.push([baseGoal]);
      const created = await createGoalRun(baseScope);
      expect(created.id).toBe("goal-1");

      // Replay: an existing run is found -> returned without inserting.
      state.selectResults.push([baseGoal]);
      const replay = await createGoalRun(baseScope);
      expect(replay.id).toBe("goal-1");
      // Only one insert happened across both calls.
      expect(state.insertResults).toHaveLength(0);
    });

    it("rejects cross-workspace and cross-client goal reads", async () => {
      state.selectResults.push([
        { ...baseGoal, workspaceId: "ws-other" },
      ]);

      await expect(
        getGoalRunScoped("ws-1", "client-1", "thread-1")
      ).rejects.toBeInstanceOf(AssistantGoalValidationError);
    });

    it("updates stage only when expectedRevision matches", async () => {
      const updated = { ...baseGoal, stage: "planning", revision: 1 };
      state.updateReturningRows.push([updated]);

      const result = await updateGoalRun({
        goalRunId: "goal-1",
        workspaceId: "ws-1",
        clientProfileId: "client-1",
        threadId: "thread-1",
        expectedRevision: 0,
        patch: { stage: "planning" },
      });

      expect(result.revision).toBe(1);
      expect(result.stage).toBe("planning");
    });

    it("throws AssistantGoalConflictError when no row is updated", async () => {
      state.updateReturningRows.push([]);

      await expect(
        updateGoalRun({
          goalRunId: "goal-1",
          workspaceId: "ws-1",
          clientProfileId: "client-1",
          threadId: "thread-1",
          expectedRevision: 99,
          patch: { stage: "planning" },
        })
      ).rejects.toBeInstanceOf(AssistantGoalConflictError);
    });
  });

  describe("annotations", () => {
    it("persists normalized rectangle coordinates between 0 and 1", async () => {
      // upsertAnnotationDraft reads the scoped goal run before inserting.
      state.selectResults.push([baseGoal]);
      state.insertResults.push([baseAnnotation]);

      const ann = await upsertAnnotationDraft(draftInput);
      expect(ann.x).toBeGreaterThanOrEqual(0);
      expect(ann.x).toBeLessThanOrEqual(1);
      expect(ann.width).toBeGreaterThan(0);
      expect(ann.x + ann.width).toBeLessThanOrEqual(1);
    });

    it("rejects out-of-bounds rectangles", async () => {
      await expect(
        upsertAnnotationDraft({ ...draftInput, x: 0.9, width: 0.5 })
      ).rejects.toBeInstanceOf(AssistantGoalValidationError);
    });

    it("rejects annotations for a version outside the goal thread", async () => {
      // Goal exists for thread-1, but the version read is cross-thread.
      state.selectResults.push([baseGoal]);

      await expect(
        upsertAnnotationDraft({ ...draftInput, threadId: "thread-other" })
      ).rejects.toBeInstanceOf(AssistantGoalValidationError);
    });

    it("submits all draft annotations with one actionRecordId atomically", async () => {
      const drafts = [
        { ...baseAnnotation, id: "ann-1", status: "draft" },
        { ...baseAnnotation, id: "ann-2", status: "draft" },
      ];
      state.selectResults.push(drafts);
      const submitted = drafts.map((d) => ({
        ...d,
        status: "submitted" as const,
        actionRecordId: "action-1",
      }));
      state.updateReturningRows.push(submitted);

      const result = await submitAnnotationBatch({
        workspaceId: "ws-1",
        clientProfileId: "client-1",
        threadId: "thread-1",
        goalRunId: "goal-1",
        sourceVersionId: "version-1",
        actionRecordId: "action-1",
      });

      expect(result).toHaveLength(2);
      expect(result.every((r) => r.actionRecordId === "action-1")).toBe(true);
      expect(result.every((r) => r.status === "submitted")).toBe(true);
    });

    it("marks submitted annotations addressed by the produced version", async () => {
      const submitted = [
        { ...baseAnnotation, id: "ann-1", status: "submitted", actionRecordId: "action-1" },
      ];
      state.selectResults.push(submitted);
      const addressed = submitted.map((s) => ({
        ...s,
        status: "addressed" as const,
        addressedByVersionId: "version-2",
      }));
      state.updateReturningRows.push(addressed);

      const result = await markAnnotationsAddressed({
        workspaceId: "ws-1",
        clientProfileId: "client-1",
        threadId: "thread-1",
        sourceVersionId: "version-1",
        producedVersionId: "version-2",
      });

      expect(result.every((r) => r.status === "addressed")).toBe(true);
      expect(result.every((r) => r.addressedByVersionId === "version-2")).toBe(true);
    });

    it("lists annotations for a version scoped by goal", async () => {
      state.selectResults.push([baseAnnotation]);
      const list = await listAnnotationsForVersion(
        "ws-1",
        "goal-1",
        "version-1"
      );
      expect(list).toHaveLength(1);
    });
  });

  describe("corpus consent", () => {
    it("grants consent with reviewer identity and timestamps", async () => {
      const granted = {
        clientProfileId: "client-1",
        workspaceId: "ws-1",
        status: "granted",
        reviewedByUserId: "user-1",
        grantedAt: new Date(),
        revokedAt: null,
        updatedAt: new Date(),
      };
      state.insertResults.push([granted]);

      const result = await grantCorpusConsent({
        workspaceId: "ws-1",
        clientProfileId: "client-1",
        reviewedByUserId: "user-1",
      });

      expect(result.status).toBe("granted");
      expect(result.reviewedByUserId).toBe("user-1");
      expect(result.grantedAt).toBeInstanceOf(Date);
    });

    it("revokes consent with reviewer identity and timestamps", async () => {
      const revoked = {
        clientProfileId: "client-1",
        workspaceId: "ws-1",
        status: "revoked",
        reviewedByUserId: "user-1",
        grantedAt: null,
        revokedAt: new Date(),
        updatedAt: new Date(),
      };
      state.insertResults.push([revoked]);

      const result = await revokeCorpusConsent({
        workspaceId: "ws-1",
        clientProfileId: "client-1",
        reviewedByUserId: "user-1",
      });

      expect(result.status).toBe("revoked");
      expect(result.revokedAt).toBeInstanceOf(Date);
    });
  });
});
