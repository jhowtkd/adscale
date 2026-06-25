import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/server/repositories/workspace", () => ({
  getWorkspaceSettings: vi.fn(),
  updateWorkspaceSettings: vi.fn(),
  WorkspaceSlugConflictError: class WorkspaceSlugConflictError extends Error {
    name = "WorkspaceSlugConflictError";
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import {
  requireWorkspaceAccess,
  requireRole,
  WorkspaceAuthError,
  AUTH_ERROR_CODES,
} from "@/server/auth/workspace";
import {
  getWorkspaceSettings,
  updateWorkspaceSettings,
  WorkspaceSlugConflictError,
} from "@/server/repositories/workspace";
import { GET, PATCH } from "./route";

const mockRequireWorkspaceAccess = vi.mocked(requireWorkspaceAccess);
const mockRequireRole = vi.mocked(requireRole);
const mockGetWorkspaceSettings = vi.mocked(getWorkspaceSettings);
const mockUpdateWorkspaceSettings = vi.mocked(updateWorkspaceSettings);

const workspace = {
  id: "workspace-1",
  name: "Acme Labs",
  slug: "acme-labs",
  description: "Creative lab",
  industry: "Marketing",
  website: "https://acme.example",
  timezone: "America/Sao_Paulo",
};

const access = {
  user: { id: "user-1", email: "owner@example.com", name: "Owner" },
  workspace: { id: "workspace-1", name: "Acme Labs", slug: "acme-labs" },
};

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/workspace/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/workspace/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireWorkspaceAccess.mockResolvedValue(
      access as Awaited<ReturnType<typeof requireWorkspaceAccess>>
    );
    mockGetWorkspaceSettings.mockResolvedValue(workspace);
  });

  it("returns 401 when workspace access is unauthorized", async () => {
    mockRequireWorkspaceAccess.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized")
    );

    const res = await GET(new Request("http://localhost/api/workspace/settings"));

    expect(res.status).toBe(401);
  });

  it("returns workspace settings with nulls as empty strings", async () => {
    mockGetWorkspaceSettings.mockResolvedValue({
      ...workspace,
      description: null,
      industry: null,
      website: null,
      timezone: null,
    });

    const res = await GET(new Request("http://localhost/api/workspace/settings"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      name: "Acme Labs",
      slug: "acme-labs",
      description: "",
      industry: "",
      website: "",
      timezone: "",
    });
    expect(mockGetWorkspaceSettings).toHaveBeenCalledWith("workspace-1");
  });
});

describe("PATCH /api/workspace/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireWorkspaceAccess.mockResolvedValue(
      access as Awaited<ReturnType<typeof requireWorkspaceAccess>>
    );
    mockRequireRole.mockResolvedValue({ role: "owner" });
    mockUpdateWorkspaceSettings.mockResolvedValue(workspace);
  });

  it("returns 403 for member role", async () => {
    mockRequireRole.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await PATCH(patchRequest({ name: "New Name" }));

    expect(res.status).toBe(403);
    expect(mockUpdateWorkspaceSettings).not.toHaveBeenCalled();
  });

  it("returns 200 for owner updates", async () => {
    mockUpdateWorkspaceSettings.mockResolvedValue({
      ...workspace,
      name: "Renamed Labs",
    });

    const res = await PATCH(patchRequest({ name: "Renamed Labs" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockRequireRole).toHaveBeenCalledWith("workspace-1", "user-1", [
      "owner",
      "admin",
    ]);
    expect(mockUpdateWorkspaceSettings).toHaveBeenCalledWith("workspace-1", {
      name: "Renamed Labs",
    });
    expect(body.name).toBe("Renamed Labs");
  });

  it("returns 400 for invalid slug", async () => {
    const res = await PATCH(patchRequest({ slug: "Invalid Slug!" }));

    expect(res.status).toBe(400);
    expect(mockUpdateWorkspaceSettings).not.toHaveBeenCalled();
  });

  it("returns 409 for duplicate slug", async () => {
    mockUpdateWorkspaceSettings.mockRejectedValue(new WorkspaceSlugConflictError());

    const res = await PATCH(patchRequest({ slug: "taken-slug" }));

    expect(res.status).toBe(409);
  });
});
