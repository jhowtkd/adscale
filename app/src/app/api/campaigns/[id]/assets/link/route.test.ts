import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/workspace-asset", () => ({
  getWorkspaceAssetById: vi.fn(),
}));

vi.mock("@/server/repositories/asset", () => ({
  createAsset: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getCampaignById } from "@/server/repositories/campaign";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { createAsset } from "@/server/repositories/asset";

const mockGetCampaignById = vi.mocked(getCampaignById);
const mockGetWorkspaceAssetById = vi.mocked(getWorkspaceAssetById);
const mockCreateAsset = vi.mocked(createAsset);

function makeParams(id: string) {
  return Promise.resolve({ id });
}

function requestWith(body: unknown): Request {
  return new Request("http://localhost/api/campaigns/camp-1/assets/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/campaigns/[id]/assets/link", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("links workspace asset to campaign", async () => {
    mockGetCampaignById.mockResolvedValue({ id: "camp-1" } as Awaited<ReturnType<typeof getCampaignById>>);
    mockGetWorkspaceAssetById.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440000",
      key: "workspaces/ws-1/assets/logo.png",
      type: "image/png",
      size: 1024,
      width: 100,
      height: 100,
    } as Awaited<ReturnType<typeof getWorkspaceAssetById>>);
    mockCreateAsset.mockResolvedValue({ id: "550e8400-e29b-41d4-a716-446655440002", role: "linked" } as Awaited<ReturnType<typeof createAsset>>);

    const res = await POST(requestWith({ workspaceAssetId: "550e8400-e29b-41d4-a716-446655440000" }), { params: makeParams("camp-1") });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.asset.role).toBe("linked");
    expect(mockCreateAsset).toHaveBeenCalledWith(
      "workspace-1",
      "camp-1",
      expect.objectContaining({ key: "workspaces/ws-1/assets/logo.png", role: "linked" })
    );
  });

  it("returns 404 for missing campaign", async () => {
    mockGetCampaignById.mockResolvedValue(null);

    const res = await POST(requestWith({ workspaceAssetId: "wa-1" }), { params: makeParams("camp-999") });

    expect(res.status).toBe(404);
  });

  it("returns 404 for missing workspace asset", async () => {
    mockGetCampaignById.mockResolvedValue({ id: "camp-1" } as Awaited<ReturnType<typeof getCampaignById>>);
    mockGetWorkspaceAssetById.mockResolvedValue(null);

    const res = await POST(requestWith({ workspaceAssetId: "550e8400-e29b-41d4-a716-446655440001" }), { params: makeParams("camp-1") });

    expect(res.status).toBe(404);
  });

  it("rejects invalid workspaceAssetId", async () => {
    mockGetCampaignById.mockResolvedValue({ id: "camp-1" } as Awaited<ReturnType<typeof getCampaignById>>);

    const res = await POST(requestWith({ workspaceAssetId: "not-a-uuid" }), { params: makeParams("camp-1") });

    expect(res.status).toBe(400);
  });
});
