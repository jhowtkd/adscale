import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/workspace")>();
  return {
    ...actual,
    requireWorkspaceAccess: vi.fn(),
    requireRole: vi.fn(),
  };
});

vi.mock("@/server/billing/trial", () => ({
  activateSignupTrial: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import {
  AUTH_ERROR_CODES,
  WorkspaceAuthError,
  requireRole,
  requireWorkspaceAccess,
} from "@/server/auth/workspace";
import { activateSignupTrial } from "@/server/billing/trial";
import { POST } from "./route";

const mockRequireWorkspaceAccess = vi.mocked(requireWorkspaceAccess);
const mockRequireRole = vi.mocked(requireRole);
const mockActivateSignupTrial = vi.mocked(activateSignupTrial);

const mockWorkspace = {
  id: "workspace-1",
  name: "Test Workspace",
  slug: "test-workspace",
};

const mockUser = {
  id: "user-1",
  email: "owner@example.com",
  name: "Owner User",
  emailVerified: true,
};

const mockEntitlement = {
  id: "ent-trial-1",
  workspaceId: "workspace-1",
  kind: "trial",
  status: "active",
  sourceCode: null,
  redeemedByUserId: "user-1",
  metadata: null,
  startsAt: new Date(),
  expiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockGrant = {
  id: "grant-trial-1",
  workspaceId: "workspace-1",
  source: "signup_trial",
  sourceId: "ent-trial-1",
  amount: 500,
  remaining: 500,
  expiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("POST /api/billing/trial/activate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireWorkspaceAccess.mockResolvedValue({
      workspace: mockWorkspace,
      user: mockUser,
    } as unknown as Awaited<ReturnType<typeof requireWorkspaceAccess>>);
    mockRequireRole.mockResolvedValue({ role: "owner" });
    mockActivateSignupTrial.mockResolvedValue({
      status: "activated",
      entitlement: mockEntitlement,
      grant: mockGrant,
    });
  });

  it("returns 401 when request is not authenticated", async () => {
    mockRequireWorkspaceAccess.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized")
    );

    const response = await POST(
      new Request("http://localhost/api/billing/trial/activate", {
        method: "POST",
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when user email is not verified", async () => {
    mockRequireWorkspaceAccess.mockResolvedValue({
      workspace: mockWorkspace,
      user: { ...mockUser, emailVerified: false },
    } as unknown as Awaited<ReturnType<typeof requireWorkspaceAccess>>);

    const response = await POST(
      new Request("http://localhost/api/billing/trial/activate", {
        method: "POST",
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe("email_unverified");
    expect(mockActivateSignupTrial).not.toHaveBeenCalled();
  });

  it("returns 403 when user is not workspace owner", async () => {
    mockRequireRole.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const response = await POST(
      new Request("http://localhost/api/billing/trial/activate", {
        method: "POST",
      })
    );

    expect(response.status).toBe(403);
    expect(mockActivateSignupTrial).not.toHaveBeenCalled();
  });

  it("returns 409 trial_not_eligible when workspace is not eligible for trial", async () => {
    mockActivateSignupTrial.mockResolvedValue({
      status: "not_eligible",
      entitlement: null,
      grant: null,
    });

    const response = await POST(
      new Request("http://localhost/api/billing/trial/activate", {
        method: "POST",
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("trial_not_eligible");
    expect(mockActivateSignupTrial).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      userId: "user-1",
    });
  });

  it("returns 200 with activated status and entitlement/grant data on successful activation", async () => {
    const response = await POST(
      new Request("http://localhost/api/billing/trial/activate", {
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("activated");
    expect(body.entitlement.id).toBe("ent-trial-1");
    expect(body.grant.amount).toBe(500);
    expect(mockRequireRole).toHaveBeenCalledWith("workspace-1", "user-1", ["owner"]);
    expect(mockActivateSignupTrial).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      userId: "user-1",
    });
  });

  it("returns 200 with already_active status when trial was previously activated", async () => {
    mockActivateSignupTrial.mockResolvedValue({
      status: "already_active",
      entitlement: mockEntitlement,
      grant: mockGrant,
    });

    const response = await POST(
      new Request("http://localhost/api/billing/trial/activate", {
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("already_active");
    expect(body.entitlement.id).toBe("ent-trial-1");
    expect(body.grant.id).toBe("grant-trial-1");
  });
});
