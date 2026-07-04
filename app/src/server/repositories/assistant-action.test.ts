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

  const tx = {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => state.insertResult.shift() ?? []),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(undefined)),
      })),
    })),
  };

  return {
    db: {
      select: vi.fn(() => chain),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => state.updateResult),
          })),
        })),
      })),
      transaction: vi.fn(async (callback: (inner: typeof tx) => Promise<unknown>) =>
        callback(tx)
      ),
    },
  };
});

vi.mock("./assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));

vi.mock("./assistant-message", () => ({
  updateActionCardPayload: vi.fn(),
  touchAssistantThread: vi.fn(),
}));

import { updateActionCardPayload } from "./assistant-message";
import { getAssistantThreadById } from "./assistant-thread";
import {
  cancelAssistantAction,
  confirmAssistantAction,
  InvalidActionTransitionError,
  sanitizeSafeError,
  transitionAssistantAction,
} from "./assistant-action";

const mockGetThread = vi.mocked(getAssistantThreadById);
const mockUpdateCard = vi.mocked(updateActionCardPayload);

describe("assistant-action repository", () => {
  beforeEach(() => {
    state.selectResults = [];
    state.updateResult = [];
    vi.clearAllMocks();
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      workspaceId: "ws-1",
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);
    mockUpdateCard.mockResolvedValue({ id: "msg-1" } as Awaited<
      ReturnType<typeof updateActionCardPayload>
    >);
  });

  it("sanitizes internal errors", () => {
    expect(sanitizeSafeError("Error: boom\n    at foo")).toContain("Não foi possível");
    expect(sanitizeSafeError("Falha ao processar")).toBe("Falha ao processar");
  });

  it("transitions pending to confirmed", async () => {
    state.selectResults.push([
      {
        id: "action-1",
        status: "pending",
        messageId: "msg-1",
        threadId: "thread-1",
        jobRefs: [],
        safeError: null,
      },
    ]);
    state.updateResult = [{ id: "action-1", status: "confirmed" }];

    const updated = await confirmAssistantAction("ws-1", "action-1");
    expect(updated?.status).toBe("confirmed");
    expect(mockUpdateCard).toHaveBeenCalled();
  });

  it("rejects illegal transitions", async () => {
    state.selectResults.push([
      {
        id: "action-1",
        status: "completed",
        messageId: "msg-1",
        threadId: "thread-1",
        jobRefs: [],
      },
    ]);

    await expect(
      transitionAssistantAction("ws-1", "action-1", "running")
    ).rejects.toBeInstanceOf(InvalidActionTransitionError);
  });

  it("passes jobRef to action card payload on transition", async () => {
    state.selectResults.push([
      {
        id: "action-1",
        status: "confirmed",
        messageId: "msg-1",
        threadId: "thread-1",
        jobRefs: [],
        safeError: null,
      },
    ]);
    state.updateResult = [{ id: "action-1", status: "running" }];

    await transitionAssistantAction("ws-1", "action-1", "running", {
      jobRef: { kind: "derivation", id: "deriv-42" },
    });

    expect(mockUpdateCard).toHaveBeenCalledWith("ws-1", "msg-1", {
      status: "running",
      display: undefined,
      safeError: null,
      jobRefs: [{ kind: "derivation", id: "deriv-42" }],
    });
  });

  it("merges multiple jobRefs idempotently and keeps running status stable", async () => {
    state.selectResults.push([
      {
        id: "action-1",
        status: "running",
        messageId: "msg-1",
        threadId: "thread-1",
        jobRefs: [{ kind: "derivation", id: "deriv-a" }],
        safeError: null,
      },
    ]);
    state.updateResult = [{ id: "action-1", status: "running" }];

    // Same-status transition for a sibling job must not throw; it merges the ref.
    await transitionAssistantAction("ws-1", "action-1", "running", {
      jobRefs: [{ kind: "derivation", id: "deriv-b" }],
    });

    expect(mockUpdateCard).toHaveBeenCalledWith("ws-1", "msg-1", expect.objectContaining({
      jobRefs: [
        { kind: "derivation", id: "deriv-a" },
        { kind: "derivation", id: "deriv-b" },
      ],
    }));
  });

  it("cancels pending action with safe error", async () => {
    state.selectResults.push([
      {
        id: "action-1",
        status: "pending",
        messageId: "msg-1",
        threadId: "thread-1",
        jobRefs: [],
        safeError: null,
      },
    ]);
    state.updateResult = [{ id: "action-1", status: "canceled" }];

    const updated = await cancelAssistantAction("ws-1", "action-1");
    expect(updated?.status).toBe("canceled");
  });
});
