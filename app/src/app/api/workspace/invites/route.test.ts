import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({
  getSessionFromHeaders: vi.fn(),
}));

vi.mock("@/server/auth/team", () => ({
  acceptInvite: vi.fn(),
}));

vi.mock("@/server/repositories/invitation", () => ({
  createInvitation: vi.fn(),
  getPendingInvitations: vi.fn(),
  cancelInvitation: vi.fn(),
}));

vi.mock("@/server/services/email", () => ({
  sendInviteEmail: vi.fn(),
}));

vi.mock("@/server/repositories/user", () => ({
  getUserLocale: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requireWorkspaceAccess, requireRole } from "@/server/auth/workspace";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";
import { getSessionFromHeaders } from "@/server/auth/session";
import { acceptInvite } from "@/server/auth/team";
import {
  createInvitation,
  getPendingInvitations,
  cancelInvitation,
} from "@/server/repositories/invitation";
import { sendInviteEmail } from "@/server/services/email";
import { getUserLocale } from "@/server/repositories/user";
import { GET, POST, PATCH, DELETE } from "./route";

const mockRequireWorkspaceAccess = vi.mocked(requireWorkspaceAccess);
const mockRequireRole = vi.mocked(requireRole);
const mockGetSession = vi.mocked(getSessionFromHeaders);
const mockAcceptInvite = vi.mocked(acceptInvite);
const mockGetPendingInvitations = vi.mocked(getPendingInvitations);
const mockCreateInvitation = vi.mocked(createInvitation);
const mockCancelInvitation = vi.mocked(cancelInvitation);
const mockSendInviteEmail = vi.mocked(sendInviteEmail);
const mockGetUserLocale = vi.mocked(getUserLocale);

const access = {
  user: { id: "user-1", email: "owner@example.com", name: "Owner" },
  workspace: { id: "workspace-1", name: "Acme Labs", slug: "acme-labs" },
};

const session = {
  user: { id: "user-2", email: "jane@example.com", name: "Jane Doe" },
};

function jsonRequest(
  method: string,
  url: string,
  body?: unknown
): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("GET /api/workspace/invites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireWorkspaceAccess.mockResolvedValue(
      access as Awaited<ReturnType<typeof requireWorkspaceAccess>>
    );
  });

  it("returns 401 when workspace access is unauthorized", async () => {
    mockRequireWorkspaceAccess.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized")
    );

    const res = await GET(new Request("http://localhost/api/workspace/invites"));

    expect(res.status).toBe(401);
    expect(mockGetPendingInvitations).not.toHaveBeenCalled();
  });

  it("omits invite tokens from the response", async () => {
    mockGetPendingInvitations.mockResolvedValue([
      {
        id: "invite-1",
        email: "new@example.com",
        role: "member",
        token: "secret-token",
        workspaceId: "workspace-1",
        createdAt: new Date("2026-01-01"),
        expiresAt: new Date("2026-01-08"),
      },
    ] as Awaited<ReturnType<typeof getPendingInvitations>>);

    const res = await GET(new Request("http://localhost/api/workspace/invites"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.invites).toHaveLength(1);
    expect(body.invites[0]).not.toHaveProperty("token");
    expect(body.invites[0].email).toBe("new@example.com");
    expect(mockGetPendingInvitations).toHaveBeenCalledWith("workspace-1");
  });
});

describe("POST /api/workspace/invites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireWorkspaceAccess.mockResolvedValue(
      access as Awaited<ReturnType<typeof requireWorkspaceAccess>>
    );
    mockRequireRole.mockResolvedValue({ role: "owner" });
    mockGetUserLocale.mockResolvedValue("en");
    mockCreateInvitation.mockResolvedValue({
      id: "invite-1",
      email: "admin@example.com",
      role: "admin",
      token: "new-token",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof createInvitation>>);
    mockSendInviteEmail.mockResolvedValue(undefined);
  });

  it("requires owner role when inviting an admin", async () => {
    mockRequireRole
      .mockResolvedValueOnce({ role: "admin" })
      .mockRejectedValueOnce(
        new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
      );

    const res = await POST(
      jsonRequest("POST", "http://localhost/api/workspace/invites", {
        email: "admin@example.com",
        role: "admin",
      })
    );

    expect(res.status).toBe(403);
    expect(mockRequireRole).toHaveBeenNthCalledWith(1, "workspace-1", "user-1", [
      "owner",
      "admin",
    ]);
    expect(mockRequireRole).toHaveBeenNthCalledWith(2, "workspace-1", "user-1", [
      "owner",
    ]);
    expect(mockCreateInvitation).not.toHaveBeenCalled();
    expect(mockSendInviteEmail).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid email", async () => {
    const res = await POST(
      jsonRequest("POST", "http://localhost/api/workspace/invites", {
        email: "not-an-email",
        role: "member",
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("invalidInput");
    expect(mockCreateInvitation).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/workspace/invites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(
      session as Awaited<ReturnType<typeof getSessionFromHeaders>>
    );
    mockAcceptInvite.mockResolvedValue(undefined);
  });

  it("returns 401 when session is missing", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await PATCH(
      jsonRequest("PATCH", "http://localhost/api/workspace/invites", {
        token: "invite-token",
      })
    );
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("unauthorized");
    expect(mockAcceptInvite).not.toHaveBeenCalled();
  });

  it("returns 403 inviteEmailMismatch when logged-in email does not match invite", async () => {
    mockAcceptInvite.mockRejectedValue(new Error("Invite email mismatch"));

    const res = await PATCH(
      jsonRequest("PATCH", "http://localhost/api/workspace/invites", {
        token: "invite-token",
      })
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe("inviteEmailMismatch");
    expect(mockAcceptInvite).toHaveBeenCalledWith(
      "invite-token",
      "user-2",
      "jane@example.com"
    );
  });

  it("returns 410 inviteExpired when the invite has expired", async () => {
    mockAcceptInvite.mockRejectedValue(new Error("Invite expired"));

    const res = await PATCH(
      jsonRequest("PATCH", "http://localhost/api/workspace/invites", {
        token: "expired-token",
      })
    );
    const body = await res.json();

    expect(res.status).toBe(410);
    expect(body.code).toBe("inviteExpired");
  });
});

describe("DELETE /api/workspace/invites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireWorkspaceAccess.mockResolvedValue(
      access as Awaited<ReturnType<typeof requireWorkspaceAccess>>
    );
    mockRequireRole.mockResolvedValue({ role: "owner" });
  });

  it("returns 404 when invite is not in the workspace", async () => {
    mockCancelInvitation.mockResolvedValue(false);

    const res = await DELETE(
      new Request("http://localhost/api/workspace/invites?id=invite-other")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe("notFound");
    expect(mockCancelInvitation).toHaveBeenCalledWith("invite-other", "workspace-1");
  });

  it("returns 400 when invite id is missing", async () => {
    const res = await DELETE(new Request("http://localhost/api/workspace/invites"));

    expect(res.status).toBe(400);
    expect(mockCancelInvitation).not.toHaveBeenCalled();
  });
});
