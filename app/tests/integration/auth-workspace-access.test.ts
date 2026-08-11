import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/server/auth/session", () => ({
  getSession: vi.fn(),
  getSessionFromHeaders: vi.fn(),
}));

vi.mock("@/server/repositories/workspace", () => ({
  getWorkspaceForUser: vi.fn(),
  getWorkspaceForUserInWorkspace: vi.fn(),
}));

import { getSession, getSessionFromHeaders } from "@/server/auth/session";
import {
  getWorkspaceForUser,
  getWorkspaceForUserInWorkspace,
} from "@/server/repositories/workspace";
import {
  ACTIVE_WORKSPACE_COOKIE,
  AUTH_ERROR_CODES,
  WorkspaceAuthError,
  requireWorkspaceAccess,
} from "@/server/auth/workspace";
import { buildTrustedOrigins } from "@/server/auth/config";

const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockGetSessionFromHeaders = getSessionFromHeaders as ReturnType<typeof vi.fn>;
const mockGetWorkspaceForUser = getWorkspaceForUser as ReturnType<typeof vi.fn>;
const mockGetWorkspaceForUserInWorkspace = getWorkspaceForUserInWorkspace as ReturnType<typeof vi.fn>;

describe("requireWorkspaceAccess", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("throws a recognizable auth error when no session exists", async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(requireWorkspaceAccess()).rejects.toMatchObject({
      name: "WorkspaceAuthError",
      code: AUTH_ERROR_CODES.unauthorized,
      message: "Unauthorized",
    });
    expect(mockGetWorkspaceForUser).not.toHaveBeenCalled();
  });

  it("throws a recognizable no-workspace error when the user has no workspace", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "a@example.com" } });
    mockGetWorkspaceForUser.mockResolvedValue(null);

    await expect(requireWorkspaceAccess()).rejects.toMatchObject({
      name: "WorkspaceAuthError",
      code: AUTH_ERROR_CODES.noWorkspace,
      message: "No workspace",
    });
    expect(mockGetWorkspaceForUser).toHaveBeenCalledWith("user-1");
  });

  it("returns the server-derived user and workspace for an authenticated member", async () => {
    const user = { id: "user-1", email: "a@example.com" };
    const workspace = { id: "workspace-1", name: "Workspace" };

    mockGetSession.mockResolvedValue({ user });
    mockGetWorkspaceForUser.mockResolvedValue(workspace);

    await expect(requireWorkspaceAccess()).resolves.toEqual({ user, workspace });
    expect(mockGetWorkspaceForUser).toHaveBeenCalledWith("user-1");
  });

  it("uses request headers when a request is provided", async () => {
    const headers = new Headers({ cookie: "session=abc" });
    const request = new Request("https://app.example.com/api/test", { headers });
    const user = { id: "user-2", email: "b@example.com" };
    const workspace = { id: "workspace-2", name: "Request Workspace" };

    mockGetSessionFromHeaders.mockResolvedValue({ user });
    mockGetWorkspaceForUser.mockResolvedValue(workspace);

    await expect(requireWorkspaceAccess(request)).resolves.toEqual({ user, workspace });
    expect(mockGetSessionFromHeaders).toHaveBeenCalledWith(request.headers);
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("uses a valid active-workspace cookie for a multi-workspace member", async () => {
    const user = { id: "user-2", email: "b@example.com" };
    const workspace = { id: "workspace-2", name: "Invited Workspace" };
    const request = new Request("https://app.example.com/api/test", {
      headers: { cookie: `${ACTIVE_WORKSPACE_COOKIE}=workspace-2` },
    });
    mockGetSessionFromHeaders.mockResolvedValue({ user });
    mockGetWorkspaceForUserInWorkspace.mockResolvedValue(workspace);

    await expect(requireWorkspaceAccess(request)).resolves.toEqual({ user, workspace });
    expect(mockGetWorkspaceForUserInWorkspace).toHaveBeenCalledWith("user-2", "workspace-2");
    expect(mockGetWorkspaceForUser).not.toHaveBeenCalled();
  });

  it("falls back safely when the active workspace is not one of the user's workspaces", async () => {
    const user = { id: "user-2", email: "b@example.com" };
    const workspace = { id: "workspace-1", name: "Existing Workspace" };
    const request = new Request("https://app.example.com/api/test", {
      headers: { cookie: `${ACTIVE_WORKSPACE_COOKIE}=workspace-elsewhere` },
    });
    mockGetSessionFromHeaders.mockResolvedValue({ user });
    mockGetWorkspaceForUserInWorkspace.mockResolvedValue(null);
    mockGetWorkspaceForUser.mockResolvedValue(workspace);

    await expect(requireWorkspaceAccess(request)).resolves.toEqual({ user, workspace });
    expect(mockGetWorkspaceForUser).toHaveBeenCalledWith("user-2");
  });
});

describe("WorkspaceAuthError", () => {
  it("is still compatible with existing Error message checks", () => {
    const error = new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized");

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Unauthorized");
    expect(error.code).toBe(AUTH_ERROR_CODES.unauthorized);
  });
});

describe("buildTrustedOrigins", () => {
  it("deduplicates production origins without adding localhost", () => {
    expect(
      buildTrustedOrigins({
        betterAuthUrl: "https://app.example.com",
        appUrl: "https://app.example.com",
        isDevelopment: false,
      })
    ).toEqual(["https://app.example.com"]);
  });

  it("includes localhost origins only for development", () => {
    expect(
      buildTrustedOrigins({
        betterAuthUrl: "https://auth.example.com",
        appUrl: "https://app.example.com",
        isDevelopment: true,
      })
    ).toEqual([
      "https://auth.example.com",
      "https://app.example.com",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]);
  });
});
