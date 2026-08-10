import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/invitation", () => ({
  getInvitationByToken: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({
  getSessionFromHeaders: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { GET } from "../route";
import { getSessionFromHeaders } from "@/server/auth/session";
import { getInvitationByToken } from "@/server/repositories/invitation";

const mockGetInvitationByToken = vi.mocked(getInvitationByToken);
const mockGetSessionFromHeaders = vi.mocked(getSessionFromHeaders);

const pendingInvite = {
  id: "invite-1",
  workspaceId: "workspace-1",
  workspaceName: "Studio ADScale",
  email: "person@example.com",
  role: "member",
  status: "pending",
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-08-10T00:00:00.000Z"),
  senderName: "Ana",
};

describe("GET /api/workspace/invites?token=...", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionFromHeaders.mockResolvedValue(null);
  });

  it("returns safe workspace context and a masked recipient before sign-in", async () => {
    mockGetInvitationByToken.mockResolvedValue(pendingInvite);

    const res = await GET(new Request("http://localhost/api/workspace/invites?token=invite-token"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.invite).toEqual(expect.objectContaining({
      workspaceName: "Studio ADScale",
      recipientEmail: "p••••@example.com",
      senderName: "Ana",
    }));
    expect(body.account).toBeNull();
  });

  it("identifies the signed-in account without exposing the invite email", async () => {
    mockGetInvitationByToken.mockResolvedValue(pendingInvite);
    mockGetSessionFromHeaders.mockResolvedValue({ user: { email: "person@example.com" } } as never);

    const res = await GET(new Request("http://localhost/api/workspace/invites?token=invite-token"));
    const body = await res.json();

    expect(body.account).toEqual({ email: "person@example.com", matchesInvite: true });
    expect(body.invite.recipientEmail).toBe("p••••@example.com");
  });

  it.each([
    [null, 404, "inviteNotFound"],
    [{ ...pendingInvite, status: "revoked" }, 410, "inviteRemoved"],
    [{ ...pendingInvite, status: "accepted" }, 409, "inviteAlreadyAccepted"],
    [{ ...pendingInvite, expiresAt: new Date("2020-01-01T00:00:00.000Z") }, 410, "inviteExpired"],
  ])("returns a distinct actionable state for %s", async (invite, status, code) => {
    mockGetInvitationByToken.mockResolvedValue(invite as typeof pendingInvite | null);

    const res = await GET(new Request("http://localhost/api/workspace/invites?token=invite-token"));
    const body = await res.json();

    expect(res.status).toBe(status);
    expect(body.code).toBe(code);
  });
});
