import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH } from "./route";

const claims = [
  { id: "claim-1", claimKey: "palette.colors", value: ["#D71F2B"], scope: { level: "global" }, authority: "inferred", confidence: "medium", status: "candidate", evidenceRefs: [] },
];
const mocks = vi.hoisted(() => ({
  requireWorkspaceAccess: vi.fn(),
  listClaims: vi.fn(),
  listVersions: vi.fn(),
  reviewClaim: vi.fn(),
  getClientProfile: vi.fn(),
}));

vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess: (...args: unknown[]) => mocks.requireWorkspaceAccess(...args) }));
vi.mock("@/server/repositories/brand-knowledge", () => ({
  listBrandKnowledgeClaims: (...args: unknown[]) => mocks.listClaims(...args),
  listBrandKnowledgeVersions: (...args: unknown[]) => mocks.listVersions(...args),
  reviewBrandKnowledgeClaim: (...args: unknown[]) => mocks.reviewClaim(...args),
}));
vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: (...args: unknown[]) => mocks.getClientProfile(...args),
}));

describe("/api/client-profiles/[id]/brand-knowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspaceAccess.mockResolvedValue({ user: { id: "user-1" }, workspace: { id: "workspace-1" } });
    mocks.listClaims.mockResolvedValue(claims);
    mocks.listVersions.mockResolvedValue([{ id: "version-1", status: "active", hash: "a".repeat(64) }]);
    mocks.reviewClaim.mockResolvedValue({ ...claims[0], status: "approved", reviewedByUserId: "user-1" });
    mocks.getClientProfile.mockResolvedValue({ id: "profile-1" });
  });

  it("lists reviewable claims and immutable version history without mutating state", async () => {
    const response = await GET(new Request("http://localhost/api/client-profiles/profile-1/brand-knowledge"), { params: Promise.resolve({ id: "profile-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.listClaims).toHaveBeenCalledWith("workspace-1", "profile-1");
    expect(mocks.reviewClaim).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ claims, activeVersion: { id: "version-1" } });
  });

  it("records an explicit human decision with alternatives", async () => {
    const response = await PATCH(new Request("http://localhost/api/client-profiles/profile-1/brand-knowledge", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        claimId: "claim-1",
        status: "approved",
        value: ["#D71F2B"],
        alternatives: [{ claimId: "claim-2", value: ["#00FF00"] }],
      }),
    }), { params: Promise.resolve({ id: "profile-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.reviewClaim).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      clientProfileId: "profile-1",
      userId: "user-1",
      status: "approved",
      alternatives: [{ claimId: "claim-2", value: ["#00FF00"] }],
    }));
  });
});
