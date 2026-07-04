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

import { requireWorkspaceAccess } from "@/server/auth/workspace";
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

function req(body: unknown): Request {
  return new Request(
    `http://localhost/api/assistant/threads/${threadId}/goal/corpus-consent`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
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
});
