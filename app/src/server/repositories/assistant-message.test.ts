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
    orderBy: vi.fn(() => chain),
    for: vi.fn(async () => [{ id: "thread-1", workspaceId: "ws-1" }]),
    limit: vi.fn(async () => state.selectResults.shift() ?? []),
    then(resolve: (value: unknown) => void) {
      resolve(state.selectResults.shift() ?? []);
    },
  };

  return {
    db: {
      select: vi.fn(() => chain),
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
        select: vi.fn(() => chain),
        insert: vi.fn(() => ({
          values: vi.fn(() => ({ returning: vi.fn(async () => state.insertResult) })),
        })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({ where: vi.fn(async () => state.updateResult) })),
        })),
      })),
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

import {
  AssistantMessageValidationError,
  createAssistantMessage,
  listAssistantMessages,
  updateActionCardPayload,
} from "./assistant-message";

describe("assistant-message repository", () => {
  beforeEach(() => {
    state.selectResults = [];
    state.insertResult = [];
    state.updateResult = [];
    vi.clearAllMocks();
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
      { id: "m2", sequence: 2 },
      { id: "m1", sequence: 1 },
    ]);

    const messages = await listAssistantMessages("ws-1", "thread-1");
    expect(messages).toHaveLength(2);
    expect(messages[0]?.sequence).toBe(1);
    expect(messages[1]?.sequence).toBe(2);
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

  it("mirrors jobRef on action card payload for UI linking", async () => {
    state.selectResults.push([
      {
        id: "msg-card",
        type: "action_card",
        payload: { status: "running", display: { title: "Run" } },
      },
    ]);
    state.updateResult = [
      {
        id: "msg-card",
        payload: {
          status: "running",
          display: { title: "Run" },
          jobRef: { kind: "derivation", id: "deriv-1" },
        },
      },
    ];

    const updated = await updateActionCardPayload("ws-1", "msg-card", {
      jobRef: { kind: "derivation", id: "deriv-1" },
    });

    expect(updated?.payload).toMatchObject({
      jobRef: { kind: "derivation", id: "deriv-1" },
    });
  });

  it("creates equipe_card messages with item references", async () => {
    state.insertResult = [{ id: "msg-2", type: "equipe_card" }];

    const message = await createAssistantMessage("ws-1", {
      threadId: "thread-1",
      type: "equipe_card",
      content: "Lote pronto",
      payload: {
        kind: "batch",
        accountId: "account-1",
        title: "Calendário 23–27/11",
        batchId: "batch-1",
        items: [{ itemId: "item-1", versionHash: "hash-1" }],
      },
    });

    expect(message.type).toBe("equipe_card");
  });

  it("rejects equipe_card messages without the closed list", async () => {
    await expect(
      createAssistantMessage("ws-1", {
        threadId: "thread-1",
        type: "equipe_card",
        content: "Lote pronto",
        payload: {
          kind: "batch",
          accountId: "account-1",
          title: "Lote",
          items: [],
        },
      })
    ).rejects.toBeInstanceOf(AssistantMessageValidationError);

    await expect(
      createAssistantMessage("ws-1", {
        threadId: "thread-1",
        type: "equipe_card",
        content: "Lote pronto",
        payload: {
          kind: "batch",
          accountId: "account-1",
          title: "Lote",
          items: [{ itemId: "item-1", versionHash: "" }],
        },
      })
    ).rejects.toBeInstanceOf(AssistantMessageValidationError);
  });

  it("creates equipe_card plan_offer messages with an empty items list (ticket 02)", async () => {
    state.insertResult = [{ id: "msg-plan", type: "equipe_card" }];

    const message = await createAssistantMessage("ws-1", {
      threadId: "thread-1",
      type: "equipe_card",
      content: "Continue com a equipe",
      payload: {
        kind: "plan_offer",
        accountId: "account-1",
        title: "Continue com a equipe",
        items: [],
      },
    });

    expect(message.type).toBe("equipe_card");
  });

  it("accepts the free-budget-exhausted reason on plan_offer messages", async () => {
    state.insertResult = [{ id: "msg-plan", type: "equipe_card" }];

    const message = await createAssistantMessage("ws-1", {
      threadId: "thread-1",
      type: "equipe_card",
      content: "ADScale para a sua marca",
      payload: {
        kind: "plan_offer",
        accountId: "account-1",
        title: "ADScale para a sua marca",
        items: [],
        reason: "free_budget_exhausted",
      },
    });

    expect(message.id).toBe("msg-plan");
  });

  it("rejects equipe_card idea messages without ideaId", async () => {
    await expect(
      createAssistantMessage("ws-1", {
        threadId: "thread-1",
        type: "equipe_card",
        content: "Ideia",
        payload: { kind: "idea", accountId: "account-1", title: "Ideia", items: [] },
      })
    ).rejects.toBeInstanceOf(AssistantMessageValidationError);
  });

  it("creates equipe_event and staff_message messages", async () => {
    state.insertResult = [{ id: "msg-3", type: "equipe_event" }];

    const event = await createAssistantMessage("ws-1", {
      threadId: "thread-1",
      type: "equipe_event",
      content: "Redação IA criou a v2",
      payload: { kind: "version_created", text: "Redação IA criou a v2", actor: "agent" },
    });
    expect(event.type).toBe("equipe_event");

    state.insertResult = [{ id: "msg-4", type: "staff_message" }];

    const staff = await createAssistantMessage("ws-1", {
      threadId: "thread-1",
      type: "staff_message",
      content: "Oi, sou a Bruna",
      payload: { staffId: "staff-1", name: "Bruna Lima", photoUrl: null },
    });
    expect(staff.type).toBe("staff_message");
  });

  it("rejects equipe_event without text and staff_message without name", async () => {
    await expect(
      createAssistantMessage("ws-1", {
        threadId: "thread-1",
        type: "equipe_event",
        content: "",
        payload: { kind: "reminder", text: "" },
      })
    ).rejects.toBeInstanceOf(AssistantMessageValidationError);

    await expect(
      createAssistantMessage("ws-1", {
        threadId: "thread-1",
        type: "staff_message",
        content: "Oi",
        payload: { staffId: "staff-1", name: "" },
      })
    ).rejects.toBeInstanceOf(AssistantMessageValidationError);
  });
});
