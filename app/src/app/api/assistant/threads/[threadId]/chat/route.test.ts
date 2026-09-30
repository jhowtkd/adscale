import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
  getLocale: vi.fn(() => Promise.resolve("pt-BR")),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
  requireRole: vi.fn(),
  WorkspaceAuthError: class WorkspaceAuthError extends Error {
    constructor(public code: string, message: string) {
      super(message);
      this.name = "WorkspaceAuthError";
    }
  },
  AUTH_ERROR_CODES: { unauthorized: "unauthorized", forbidden: "forbidden" },
  isWorkspaceAuthError: (e: unknown) => e instanceof Error && e.name === "WorkspaceAuthError",
}));

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));

vi.mock("@/server/assistant/orchestrator", () => ({
  runAssistantTurn: vi.fn(),
}));

// Classic-thread default: no goal run, so the chat route uses the guided
// orchestrator. Goal-agent streaming is covered by the loop's own tests.
vi.mock("@/server/repositories/assistant-goal", () => ({
  getGoalRunByThread: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/server/repositories/workspace-asset", () => ({
  getWorkspaceAssetById: vi.fn(),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    publicUrl: vi.fn((key: string) => `https://cdn.example/${key}`),
  },}));

// Equipe dispatch (#551): the pilot gate stays closed by default so the
// classic tests below never touch the Equipe modules.
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/equipe/domain", () => ({
  systemClock: vi.fn(() => ({ now: () => new Date("2026-10-05T14:00:00.000Z") })),
}));
vi.mock("@/server/equipe/data/postgres", () => ({
  createPostgresEquipeUnitOfWork: vi.fn(() => ({ repos: {} })),
}));
vi.mock("@/server/equipe/module/equipe-enabled", () => ({
  isEquipeEnabledForWorkspace: vi.fn(() => false),
}));
vi.mock("@/server/equipe/module/threads", () => ({
  findEquipeThreadByAssistantThread: vi.fn(),
}));
vi.mock("@/server/equipe/agents/gateway", () => ({
  LiveAdscaleGateway: vi.fn(),
}));
vi.mock("@/server/equipe/agents/ledger", () => ({
  DrizzleLedgerStore: vi.fn(),
}));
vi.mock("@/server/equipe/agents/runner", () => ({
  createEquipeAgents: vi.fn(() => ({})),
}));
vi.mock("@/server/equipe/agents/chat-turn", () => ({
  liveConversationWriter: vi.fn(() => ({})),
  runEquipeStrategistTurn: vi.fn(),
}));
// Ticket 04: runEquipeTurn now builds its module deps through the shared
// route factory (real uow.repos.people.list, live clock/gateway/outbox)
// instead of assembling them inline from separate mocks.
vi.mock("@/server/equipe/http/deps", () => ({
  createEquipeRouteDeps: vi.fn(),
}));

import { requireWorkspaceAccess, requireRole } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { runAssistantTurn } from "@/server/assistant/orchestrator";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { isEquipeEnabledForWorkspace } from "@/server/equipe/module/equipe-enabled";
import { findEquipeThreadByAssistantThread } from "@/server/equipe/module/threads";
import { runEquipeStrategistTurn } from "@/server/equipe/agents/chat-turn";
import { createEquipeRouteDeps } from "@/server/equipe/http/deps";

const mockRequireAccess = vi.mocked(requireWorkspaceAccess);
const mockRequireRole = vi.mocked(requireRole);
const mockGetThread = vi.mocked(getAssistantThreadById);
const mockRunTurn = vi.mocked(runAssistantTurn);
const mockGetWorkspaceAsset = vi.mocked(getWorkspaceAssetById);
const mockEquipeEnabled = vi.mocked(isEquipeEnabledForWorkspace);
const mockFindEquipeThread = vi.mocked(findEquipeThreadByAssistantThread);
const mockRunEquipeTurn = vi.mocked(runEquipeStrategistTurn);
const mockCreateEquipeRouteDeps = vi.mocked(createEquipeRouteDeps);

/** People bound by runEquipeTurn for actor resolution; empty unless a test seeds an approver. */
function equipeRouteDeps(people: Array<{ id: string; userId: string; role: string; active: boolean }> = []) {
  return {
    uow: { repos: { people: { list: vi.fn(() => Promise.resolve(people)) } } },
    clock: { now: () => new Date("2026-10-05T14:00:00.000Z") },
    gateway: {},
    sendTaskEvent: vi.fn(),
  } as unknown as ReturnType<typeof createEquipeRouteDeps>;
}

async function collectSseBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    body += decoder.decode(value);
  }
  return body;
}

describe("POST /api/assistant/threads/[threadId]/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAccess.mockResolvedValue({
      user: { id: "user-1" },
      workspace: { id: "ws-1" },
    } as Awaited<ReturnType<typeof requireWorkspaceAccess>>);
    mockRequireRole.mockResolvedValue({ role: "member" });
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      clientProfileId: "profile-1",
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);
    mockGetWorkspaceAsset.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      workspaceId: "ws-1",
      key: "workspaces/ws-1/assets/test.png",
      type: "image/png",
      name: "test.png",
      size: 1024,
    } as Awaited<ReturnType<typeof getWorkspaceAssetById>>);
    mockCreateEquipeRouteDeps.mockReturnValue(equipeRouteDeps());
  });

  it("returns 404 when thread is missing", async () => {
    mockGetThread.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/assistant/threads/t1/chat", {
        method: "POST",
        body: JSON.stringify({ message: "Hi" }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) }
    );

    expect(res.status).toBe(404);
  });

  it("streams SSE text_delta and done events", async () => {
    mockRunTurn.mockImplementation(async function* () {
      yield { type: "text_delta", text: "Hello" };
      yield { type: "done", assistantMessageId: "msg-1" };
    });

    const res = await POST(
      new Request("http://localhost/api/assistant/threads/t1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hi" }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) }
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const body = await collectSseBody(res);
    expect(body).toContain("event: text_delta");
    expect(body).toContain("event: done");
    expect(body).not.toMatch(/reasoning|thinking|reasoning_details/);
  });

  it("returns 400 for invalid attachment types", async () => {
    const res = await POST(
      new Request("http://localhost/api/assistant/threads/t1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Veja esta imagem",
          attachments: [
            {
              assetId: "00000000-0000-4000-8000-000000000001",
              key: "workspaces/ws-1/assets/test.png",
              type: "application/pdf",
              name: "test.pdf",
              size: 1024,
            },
          ],
        }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) }
    );

    expect(res.status).toBe(400);
    expect(mockRunTurn).not.toHaveBeenCalled();
  });

  it("accepts message with valid image attachment", async () => {
    mockRunTurn.mockImplementation(async function* () {
      yield { type: "done", assistantMessageId: "msg-1" };
    });

    const res = await POST(
      new Request("http://localhost/api/assistant/threads/t1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Adaptar formatos",
          attachments: [
            {
              assetId: "00000000-0000-4000-8000-000000000001",
              key: "workspaces/ws-1/assets/test.png",
              type: "image/png",
              name: "test.png",
              size: 1024,
            },
          ],
        }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockRunTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            assetId: "00000000-0000-4000-8000-000000000001",
            key: "workspaces/ws-1/assets/test.png",
            url: "https://cdn.example/workspaces/ws-1/assets/test.png",
            type: "image/png",
          }),
        ],
      })
    );
  });

  it("returns 404 when attachment asset does not belong to the workspace", async () => {
    mockGetWorkspaceAsset.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/assistant/threads/t1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Adaptar formatos",
          attachments: [
            {
              assetId: "00000000-0000-4000-8000-000000000001",
              key: "workspaces/ws-1/assets/test.png",
              type: "image/png",
              name: "test.png",
              size: 1024,
            },
          ],
        }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) }
    );

    expect(res.status).toBe(404);
    expect(mockRunTurn).not.toHaveBeenCalled();
  });

  it("returns 401 without workspace access", async () => {
    const { WorkspaceAuthError, AUTH_ERROR_CODES } = await import(
      "@/server/auth/errors"
    );
    mockRequireAccess.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized")
    );

    const res = await POST(
      new Request("http://localhost/api/assistant/threads/t1/chat", {
        method: "POST",
        body: JSON.stringify({ message: "Hi" }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("routes Equipe threads to the strategist turn and streams equipe_card", async () => {
    mockEquipeEnabled.mockReturnValue(true);
    mockFindEquipeThread.mockResolvedValue({
      account: { id: "account-1" },
      thread: { id: "map-1", kind: "primary" },
    });
    const card = {
      kind: "batch",
      accountId: "account-1",
      title: "Lote",
      batchId: "batch-1",
      items: [{ itemId: "item-1", versionHash: "hash-1" }],
    };
    mockRunEquipeTurn.mockImplementation(async function* () {
      yield { type: "equipe_card", messageId: "msg-card", card };
      yield { type: "done", assistantMessageId: "msg-card" };
    });

    const res = await POST(
      new Request("http://localhost/api/assistant/threads/t1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "ok, pode postar" }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(mockRunEquipeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        accountId: "account-1",
        threadId: "t1",
        userMessage: "ok, pode postar",
      })
    );
    expect(mockRunTurn).not.toHaveBeenCalled();

    expect(body).toContain("event: equipe_card");
    expect(body).toContain('"messageId":"msg-card"');
    expect(body).toContain("event: done");
  });

  it("binds the active approver as actor and forwards the request locale (ticket 04)", async () => {
    mockEquipeEnabled.mockReturnValue(true);
    mockFindEquipeThread.mockResolvedValue({
      account: { id: "account-1" },
      thread: { id: "map-1", kind: "primary" },
    });
    mockCreateEquipeRouteDeps.mockReturnValue(equipeRouteDeps([
      { id: "person-1", userId: "user-1", role: "approver", active: true },
      { id: "person-2", userId: "user-1", role: "member", active: true },
    ]));
    mockRunEquipeTurn.mockImplementation(async function* () {
      yield { type: "done", assistantMessageId: "msg-1" };
    });

    const res = await POST(
      new Request("http://localhost/api/assistant/threads/t1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "https://acme.com" }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) },
    );
    await collectSseBody(res);

    expect(mockRunEquipeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "pt-BR",
        actor: { kind: "client_person", role: "approver", personId: "person-1" },
      }),
    );
  });

  it("omits actor when the signed-in user is not an active approver of the account", async () => {
    mockEquipeEnabled.mockReturnValue(true);
    mockFindEquipeThread.mockResolvedValue({
      account: { id: "account-1" },
      thread: { id: "map-1", kind: "primary" },
    });
    mockCreateEquipeRouteDeps.mockReturnValue(equipeRouteDeps([
      { id: "person-1", userId: "user-1", role: "member", active: true },
      { id: "person-2", userId: "user-1", role: "approver", active: false },
      { id: "person-3", userId: "someone-else", role: "approver", active: true },
    ]));
    mockRunEquipeTurn.mockImplementation(async function* () {
      yield { type: "done", assistantMessageId: "msg-1" };
    });

    const res = await POST(
      new Request("http://localhost/api/assistant/threads/t1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "oi" }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) },
    );
    await collectSseBody(res);

    const call = mockRunEquipeTurn.mock.calls[0]?.[0] as { actor?: unknown } | undefined;
    expect(call).toBeDefined();
    expect(call && "actor" in call).toBe(false);
  });

  it("forwards payload.fromSuggestion from the body to the strategist turn (ticket 02)", async () => {
    mockEquipeEnabled.mockReturnValue(true);
    mockFindEquipeThread.mockResolvedValue({
      account: { id: "account-1" },
      thread: { id: "map-1", kind: "primary" },
    });
    mockRunEquipeTurn.mockImplementation(async function* () {
      yield { type: "done", assistantMessageId: "msg-1" };
    });

    const res = await POST(
      new Request("http://localhost/api/assistant/threads/t1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Me explica a oportunidade 2",
          payload: { fromSuggestion: true },
        }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) }
    );

    expect(res.status).toBe(200);
    await collectSseBody(res);
    expect(mockRunEquipeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: "Me explica a oportunidade 2",
        fromSuggestion: true,
      })
    );
  });

  it("omits fromSuggestion (undefined) for an ordinary message", async () => {
    mockEquipeEnabled.mockReturnValue(true);
    mockFindEquipeThread.mockResolvedValue({
      account: { id: "account-1" },
      thread: { id: "map-1", kind: "primary" },
    });
    mockRunEquipeTurn.mockImplementation(async function* () {
      yield { type: "done", assistantMessageId: "msg-1" };
    });

    const res = await POST(
      new Request("http://localhost/api/assistant/threads/t1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "oi" }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) }
    );
    await collectSseBody(res);

    expect(mockRunEquipeTurn).toHaveBeenCalledWith(
      expect.objectContaining({ userMessage: "oi", fromSuggestion: undefined })
    );
  });

  it("forwards the presence of validated attachments to the Equipe turn", async () => {
    mockEquipeEnabled.mockReturnValue(true);
    mockFindEquipeThread.mockResolvedValue({ account: { id: "account-1" }, thread: { id: "map-1", kind: "primary" } });
    mockRunEquipeTurn.mockImplementation(async function* () {
      yield { type: "done", assistantMessageId: "msg-1" };
    });
    const res = await POST(new Request("http://localhost/api/assistant/threads/t1/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Analise esta imagem", attachments: [{
        assetId: "00000000-0000-4000-8000-000000000001", key: "workspaces/ws-1/assets/test.png",
        type: "image/png", name: "test.png", size: 1024,
      }] }),
    }), { params: Promise.resolve({ threadId: "t1" }) });
    expect(res.status).toBe(200);
    await collectSseBody(res);
    expect(mockRunEquipeTurn).toHaveBeenCalledWith(expect.objectContaining({ hasAttachments: true }));
    expect(mockRunTurn).not.toHaveBeenCalled();
  });

  it("rejects unknown keys inside payload", async () => {
    const res = await POST(
      new Request("http://localhost/api/assistant/threads/t1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "oi", payload: { hax: true } }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) }
    );

    expect(res.status).toBe(400);
    expect(mockRunEquipeTurn).not.toHaveBeenCalled();
    expect(mockRunTurn).not.toHaveBeenCalled();
  });

  it("keeps classic behavior for threads outside the Equipe map", async () => {
    mockEquipeEnabled.mockReturnValue(true);
    mockFindEquipeThread.mockResolvedValue(null);
    mockRunTurn.mockImplementation(async function* () {
      yield { type: "done", assistantMessageId: "msg-1" };
    });

    const res = await POST(
      new Request("http://localhost/api/assistant/threads/t1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hi" }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) }
    );

    expect(res.status).toBe(200);
    const body = await collectSseBody(res);
    expect(body).toContain("event: done");
    expect(mockRunTurn).toHaveBeenCalled();
    expect(mockRunEquipeTurn).not.toHaveBeenCalled();
  });

  it("skips the map lookup when the pilot gate is closed", async () => {
    mockEquipeEnabled.mockReturnValue(false);
    mockRunTurn.mockImplementation(async function* () {
      yield { type: "done", assistantMessageId: "msg-1" };
    });

    const res = await POST(
      new Request("http://localhost/api/assistant/threads/t1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hi" }),
      }),
      { params: Promise.resolve({ threadId: "t1" }) }
    );

    expect(res.status).toBe(200);
    const body = await collectSseBody(res);
    expect(body).toContain("event: done");
    expect(mockFindEquipeThread).not.toHaveBeenCalled();
    expect(mockRunEquipeTurn).not.toHaveBeenCalled();
    expect(mockRunTurn).toHaveBeenCalled();
  });
});
