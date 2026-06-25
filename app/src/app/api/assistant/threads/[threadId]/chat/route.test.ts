import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
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

import { requireWorkspaceAccess, requireRole } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { runAssistantTurn } from "@/server/assistant/orchestrator";

const mockRequireAccess = vi.mocked(requireWorkspaceAccess);
const mockRequireRole = vi.mocked(requireRole);
const mockGetThread = vi.mocked(getAssistantThreadById);
const mockRunTurn = vi.mocked(runAssistantTurn);

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
});
