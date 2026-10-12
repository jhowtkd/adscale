import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-goal", () => ({
  grantCorpusConsent: vi.fn(),
  revokeCorpusConsent: vi.fn(),
}));

import { requireRole, requireWorkspaceAccess } from "@/server/auth/workspace";
import { AUTH_ERROR_CODES, WorkspaceAuthError } from "@/server/auth/errors";
import { CorpusConsentError } from "@/server/human-quality/corpus";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { grantCorpusConsent, revokeCorpusConsent } from "@/server/repositories/assistant-goal";

const mockRequireAccess = vi.mocked(requireWorkspaceAccess);
const mockGetThread = vi.mocked(getAssistantThreadById);
const mockGrant = vi.mocked(grantCorpusConsent);
const mockRevoke = vi.mocked(revokeCorpusConsent);

const workspace = { id: "ws-1" };
const user = { id: "user-1", email: "owner@adscale.com" };
const threadId = "00000000-0000-4000-8000-0000000000t1";
const params = Promise.resolve({ threadId });

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(
    `http://localhost/api/assistant/threads/${threadId}/goal/corpus-consent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }
  );
}

describe("POST .../corpus-consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAccess.mockResolvedValue({ user, workspace } as never);
    mockGetThread.mockResolvedValue({
      id: threadId,
      workspaceId: "ws-1",
      clientProfileId: "client-1",
    } as never);
    mockGrant.mockResolvedValue({ status: "granted", reviewedByUserId: "user-1" } as never);
    mockRevoke.mockResolvedValue({ status: "revoked", reviewedByUserId: "user-1" } as never);
  });

  it("grants consent for the thread's client", async () => {
    const response = await POST(req({ action: "grant" }), { params });

    expect(response.status).toBe(200);
    expect(mockGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        clientProfileId: "client-1",
        reviewedByUserId: "user-1",
      })
    );
  });

  it("revokes consent for the thread's client", async () => {
    const response = await POST(req({ action: "revoke" }), { params });

    expect(response.status).toBe(200);
    expect(mockRevoke).toHaveBeenCalledWith(
      expect.objectContaining({ clientProfileId: "client-1" })
    );
  });

  it("rejects an unknown action", async () => {
    const response = await POST(req({ action: "maybe" }), { params });

    expect(response.status).toBe(400);
  });

  it("refuses a member even when the body claims owner role and another author", async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden"));
    const response = await POST(req({ action: "grant", role: "owner", reviewedByUserId: "another-user" }), { params });
    expect(response.status).toBe(403);
    expect(requireRole).toHaveBeenCalledWith("ws-1", "user-1", ["owner", "admin"]);
    expect(mockGrant).not.toHaveBeenCalled();
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it.each(["Idempotency-Key", "X-Idempotency-Key"])("preserves the classic body and takes replay identity from %s", async (header) => {
    expect((await POST(req({ action: "grant" }, { [header]: "classic-change" }), { params })).status).toBe(200);
    expect(mockGrant).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "classic-change" }));
  });

  it("creates a fresh key for each deliberate classic call without a header", async () => {
    await POST(req({ action: "grant" }), { params });
    await POST(req({ action: "grant" }), { params });
    const keys = mockGrant.mock.calls.map(([input]) => input.idempotencyKey);
    expect(keys.every((key) => /^[0-9a-f-]{36}$/.test(key!))).toBe(true);
    expect(new Set(keys).size).toBe(2);
  });

  it("returns a domain conflict and refuses a foreign/missing thread", async () => {
    mockGrant.mockRejectedValueOnce(new CorpusConsentError("Conflict", "idempotency_conflict"));
    const conflict = await POST(req({ action: "grant" }), { params });
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ code: "idempotency_conflict" });
    mockGetThread.mockResolvedValueOnce(null);
    expect((await POST(req({ action: "grant" }), { params })).status).toBe(404);
    expect(mockGetThread).toHaveBeenCalledWith(workspace.id, threadId);
    expect(mockGrant).toHaveBeenCalledTimes(1);
  });
});
