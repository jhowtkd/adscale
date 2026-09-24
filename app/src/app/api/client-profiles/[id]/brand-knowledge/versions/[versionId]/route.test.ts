import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireWorkspaceAccess: vi.fn(),
  getVersion: vi.fn(),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: (...args: unknown[]) => mocks.requireWorkspaceAccess(...args),
}));
vi.mock("@/server/repositories/brand-knowledge", () => ({
  getBrandKnowledgeVersion: (...args: unknown[]) => mocks.getVersion(...args),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { GET } from "./route";

const profileId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const request = new Request(`http://localhost/api/client-profiles/${profileId}/brand-knowledge/versions/${versionId}`);
const context = { params: Promise.resolve({ id: profileId, versionId }) };

describe("brand knowledge version detail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspaceAccess.mockResolvedValue({ workspace: { id: "workspace-1" } });
  });

  it("returns the immutable snapshot through a workspace and profile scoped lookup", async () => {
    const version = { id: versionId, versionNumber: 1, snapshot: { claims: [{ id: "claim-1" }] } };
    mocks.getVersion.mockResolvedValue(version);

    const response = await GET(request, context);

    expect(response.status).toBe(200);
    expect(mocks.getVersion).toHaveBeenCalledWith("workspace-1", profileId, versionId);
    expect(await response.json()).toEqual({ version });
  });

  it("hides missing or out-of-scope versions", async () => {
    mocks.getVersion.mockResolvedValue(null);
    const response = await GET(request, context);
    expect(response.status).toBe(404);
  });

  it("returns 404 for a malformed version id without querying the database", async () => {
    const response = await GET(request, { params: Promise.resolve({ id: profileId, versionId: "invalid" }) });
    expect(response.status).toBe(404);
    expect(mocks.getVersion).not.toHaveBeenCalled();
  });

  it("requires workspace access before reading a version", async () => {
    mocks.requireWorkspaceAccess.mockRejectedValue(new Error("Unauthorized"));
    const response = await GET(request, context);
    expect(response.status).not.toBe(200);
    expect(mocks.getVersion).not.toHaveBeenCalled();
  });
});
