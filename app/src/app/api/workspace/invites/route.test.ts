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

import {
  requireWorkspaceAccess,
  requireRole,
} from "@/server/auth/workspace";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";
import { getSessionFromHeaders } from "@/server/auth/session";
import { acceptInvite } from "@/server/auth/team";
import {
  cancelInvitation,
  createInvitation,
  getPendingInvitations,
} from "@/server/repositories/invitation";
import { sendInviteEmail } from "@/server/services/email";
import { getUserLocale } from "@/server/repositories/user";
import { DELETE, GET, PATCH, POST } from "./route";

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
  user: { id: "user-2", email: "invitee@example.com", name: "Invitee" },
};

function jsonRequest(
  method: string,
  path: string,
  body?: unknown
): Request {
  return new Request(`http://localhost/api/workspace/invites${path}`, {
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

    const res = await GET(jsonRequest("GET", ""));

    expect(res.status).toBe(401);
    expect(mockGetPendingInvitations).not.toHaveBeenCalled();
  });

  it("strips invite tokens from the list response", async () => {
    mockGetPendingInvitations.mockResolvedValue([
      {
        id: "invite-1",
        email: "new@example.com",
        role: "member",
        token: "secret-token",
        workspaceId: "workspace-1",
        createdBy: "user-1",
        expiresAt: new Date("2026-08-01"),
        createdAt: new Date("2026-07-01"),
      },
    ] as Awaited<ReturnType<typeof getPendingInvitations>>);

    const res = await GET(jsonRequest("GET", ""));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.invites).toEqual([
      {
        id: "invite-1",
        email: "new@example.com",
        role: "member",
        workspaceId: "workspace-1",
        createdBy: "user-1",
        expiresAt: expect.any(String),
        createdAt: expect.any(String),
      },
    ]);
    expect(body.invites[0]).not.toHaveProperty("token");
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
    mockCreateInvitation.mockResolvedValue({
      id: "invite-1",
      email: "new@example.com",
      role: "member",
      token: "invite-token",
      workspaceId: "workspace-1",
      createdBy: "user-1",
      expiresAt: new Date("2026-08-01"),
      createdAt: new Date("2026-07-01"),
    } as Awaited<ReturnType<typeof createInvitation>>);
    mockGetUserLocale.mockResolvedValue("en");
    mockSendInviteEmail.mockResolvedValue(undefined);
  });

  it("requires owner role when inviting an admin", async () => {
    mockRequireRole
      .mockResolvedValueOnce({ role: "admin" })
      .mockRejectedValueOnce(
        new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
      );

    const res = await POST(
      jsonRequest("POST", "", { email: "admin@example.com", role: "admin" })
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
});

describe("PATCH /api/workspace/invites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(
      session as Awaited<ReturnType<typeof getSessionFromHeaders>>
    );
  });

  it("returns 401 without session", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await PATCH(jsonRequest("PATCH", "", { token: "invite-token" }));

    expect(res.status).toBe(401);
    expect(mockAcceptInvite).not.toHaveBeenCalled();
  });

  it("returns 403 when invite email does not match the signed-in user", async () => {
    mockAcceptInvite.mockRejectedValue(new Error("Invite email mismatch"));

    const res = await PATCH(jsonRequest("PATCH", "", { token: "invite-token" }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe("inviteEmailMismatch");
    expect(mockAcceptInvite).toHaveBeenCalledWith(
      "invite-token",
      "user-2",
      "invitee@example.com"
    );
  });

  it("returns 410 when the invite has expired", async () => {
    mockAcceptInvite.mockRejectedValue(new Error("Invite expired"));

    const res = await PATCH(jsonRequest("PATCH", "", { token: "invite-token" }));
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

  it("scopes cancellation to the current workspace", async () => {
    mockCancelInvitation.mockResolvedValue({
      id: "invite-1",
      email: "new@example.com",
      role: "member",
      token: "invite-token",
      workspaceId: "workspace-1",
      createdBy: "user-1",
      expiresAt: new Date("2026-08-01"),
      createdAt: new Date("2026-07-01"),
    } as Awaited<ReturnType<typeof cancelInvitation>>);

    const res = await DELETE(
      jsonRequest("DELETE", "?id=invite-1")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mockCancelInvitation).toHaveBeenCalledWith("invite-1", "workspace-1");
  });

  it("returns 404 when the invite is not in the current workspace", async () => {
    mockCancelInvitation.mockResolvedValue(null);

    const res = await DELETE(
      jsonRequest("DELETE", "?id=invite-other-workspace")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe("notFound");
    expect(mockCancelInvitation).toHaveBeenCalledWith(
      "invite-other-workspace",
      "workspace-1"
    );
  });
});
