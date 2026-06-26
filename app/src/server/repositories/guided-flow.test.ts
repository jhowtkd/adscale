import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  insertResult: [] as unknown[],
  updateResult: [] as unknown[],
}));

vi.mock("../db", () => {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(async () => state.selectResults.shift() ?? []),
    then(resolve: (value: unknown) => void) {
      resolve(state.selectResults.shift() ?? []);
    },
  };

  return {
    db: {
      select: vi.fn(() => chain),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => state.insertResult),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => state.updateResult),
          })),
        })),
      })),
    },
  };
});

vi.mock("./assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));

vi.mock("@/server/assistant/guided-flow-telemetry-lifecycle", () => ({
  emitGuidedFlowLifecycleFromPatch: vi.fn(),
}));

import { getAssistantThreadById } from "./assistant-thread";
import {
  GuidedFlowValidationError,
  getGuidedFlowByThread,
  patchGuidedFlow,
  upsertGuidedFlow,
} from "./guided-flow";

const mockGetThread = vi.mocked(getAssistantThreadById);

const thread = {
  id: "thread-1",
  workspaceId: "ws-1",
  clientProfileId: "profile-1",
};

const baseFlow = {
  id: "flow-1",
  workspaceId: "ws-1",
  clientProfileId: "profile-1",
  threadId: "thread-1",
  path: "unclassified",
  status: "active",
  currentStep: "start",
  slots: {},
  missingFields: [],
  assetIds: [],
  referenceIds: [],
  campaignId: null,
};

describe("guided-flow repository", () => {
  beforeEach(() => {
    state.selectResults = [];
    state.insertResult = [];
    state.updateResult = [];
    vi.clearAllMocks();
    mockGetThread.mockResolvedValue(thread as Awaited<ReturnType<typeof getAssistantThreadById>>);
  });

  it("returns null when no flow exists", async () => {
    state.selectResults.push([]);

    const flow = await getGuidedFlowByThread("ws-1", "thread-1");
    expect(flow).toBeNull();
  });

  it("rejects denied persistence keys on upsert", async () => {
    state.selectResults.push([]);

    await expect(
      upsertGuidedFlow("ws-1", "thread-1", "profile-1", {
        path: "from_zero",
        status: "active",
        currentStep: "collect_brief",
        slots: { reasoning: "hidden" },
      })
    ).rejects.toBeInstanceOf(GuidedFlowValidationError);
  });

  it("rejects cross-client profile mismatch", async () => {
    state.selectResults.push([]);

    await expect(
      upsertGuidedFlow("ws-1", "thread-1", "other-profile", {
        path: "from_zero",
        status: "active",
        currentStep: "collect_brief",
      })
    ).rejects.toBeInstanceOf(GuidedFlowValidationError);
  });

  it("creates a new guided flow", async () => {
    state.selectResults.push([]);
    state.insertResult = [baseFlow];

    const flow = await upsertGuidedFlow("ws-1", "thread-1", "profile-1", {
      path: "unclassified",
      status: "active",
      currentStep: "start",
    });

    expect(flow.threadId).toBe("thread-1");
  });

  it("patches existing flow with shallow slot merge", async () => {
    state.selectResults.push([
      { ...baseFlow, slots: { offer: "50% off" } },
    ]);
    state.selectResults.push([
      { ...baseFlow, slots: { offer: "50% off", audience: "SMB" } },
    ]);
    state.updateResult = [
      { ...baseFlow, slots: { offer: "50% off", audience: "SMB" } },
    ];

    const flow = await patchGuidedFlow("ws-1", "thread-1", "profile-1", {
      slots: { audience: "SMB" },
    });

    expect(flow.slots).toEqual({ offer: "50% off", audience: "SMB" });
  });

  it("rejects cross-workspace mutation on patch", async () => {
    state.selectResults.push([
      { ...baseFlow, workspaceId: "ws-other" },
    ]);

    await expect(
      patchGuidedFlow("ws-1", "thread-1", "profile-1", { status: "blocked" })
    ).rejects.toThrow("Cross-workspace");
  });
});
