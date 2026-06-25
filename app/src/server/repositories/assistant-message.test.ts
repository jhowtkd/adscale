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
    orderBy: vi.fn(async () => state.selectResults.shift() ?? []),
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

import { getAssistantThreadById } from "./assistant-thread";
import {
  AssistantMessageValidationError,
  createAssistantMessage,
  listAssistantMessages,
  updateActionCardPayload,
} from "./assistant-message";

const mockGetThread = vi.mocked(getAssistantThreadById);

describe("assistant-message repository", () => {
  beforeEach(() => {
    state.selectResults = [];
    state.insertResult = [];
    state.updateResult = [];
    vi.clearAllMocks();
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      workspaceId: "ws-1",
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);
  });

  it("rejects denied persistence keys", async () => {
    await expect(
      createAssistantMessage("ws-1", {
        threadId: "thread-1",
        type: "assistant",
        content: "hello",
        payload: { reasoning: "hidden" },
      })
    ).rejects.toBeInstanceOf(AssistantMessageValidationError);
  });

  it("creates tool message with sanitized payload", async () => {
    state.insertResult = [
      {
        id: "msg-1",
        type: "tool",
        sequence: 1,
        payload: { toolName: "search", summary: "Found 3 items" },
      },
    ];

    const message = await createAssistantMessage("ws-1", {
      threadId: "thread-1",
      type: "tool",
      content: "search",
      payload: { toolName: "search", summary: "Found 3 items" },
    });

    expect(message.type).toBe("tool");
  });

  it("lists messages ordered by sequence", async () => {
    state.selectResults.push([
      { id: "m1", sequence: 1 },
      { id: "m2", sequence: 2 },
    ]);

    const messages = await listAssistantMessages("ws-1", "thread-1");
    expect(messages).toHaveLength(2);
  });

  it("updates action card payload status in place", async () => {
    state.selectResults.push([
      {
        id: "msg-card",
        type: "action_card",
        payload: { status: "pending", display: { title: "Run" } },
      },
    ]);
    state.updateResult = [
      {
        id: "msg-card",
        payload: { status: "running", display: { title: "Run" } },
      },
    ];

    const updated = await updateActionCardPayload("ws-1", "msg-card", {
      status: "running",
    });

    expect(updated?.payload).toMatchObject({ status: "running" });
  });
});
