import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/campaign", () => ({
  updateCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: vi.fn(),
  getClientReferencesByIds: vi.fn(),
}));

vi.mock("@/server/memory/brand-memory-dispatch", () => ({
  recordBrandMemoryEvent: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { updateCampaign } from "@/server/repositories/campaign";
import {
  getClientProfile,
  getClientReferencesByIds,
} from "@/server/repositories/client-reference";

const mockUpdateCampaign = vi.mocked(updateCampaign);
const mockGetClientProfile = vi.mocked(getClientProfile);
const mockGetClientReferencesByIds = vi.mocked(getClientReferencesByIds);

const CAMPAIGN_ID = "33333333-3333-4333-8333-333333333333";
const PROFILE_ID = "550e8400-e29b-41d4-a716-446655440000";

function patchRequest(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/campaigns/${CAMPAIGN_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/campaigns/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists clientProfileId when profile exists in workspace", async () => {
    mockGetClientProfile.mockResolvedValue({
      id: PROFILE_ID,
      workspaceId: "workspace-1",
      name: "Cliente Teste",
    } as Awaited<ReturnType<typeof getClientProfile>>);
    mockUpdateCampaign.mockResolvedValue({
      id: CAMPAIGN_ID,
      clientProfileId: PROFILE_ID,
      name: "Campaign",
      updatedAt: new Date("2026-06-12T00:00:00.000Z"),
    } as Awaited<ReturnType<typeof updateCampaign>>);

    const res = await PATCH(patchRequest({ clientProfileId: PROFILE_ID }), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(200);
    expect(mockUpdateCampaign).toHaveBeenCalledWith(CAMPAIGN_ID, "workspace-1", {
      clientProfileId: PROFILE_ID,
    });
    const body = await res.json();
    expect(body.campaign.clientProfileId).toBe(PROFILE_ID);
  });

  it("returns 404 when clientProfileId is not in workspace", async () => {
    mockGetClientProfile.mockResolvedValue(null);

    const res = await PATCH(patchRequest({ clientProfileId: PROFILE_ID }), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(404);
    expect(mockUpdateCampaign).not.toHaveBeenCalled();
  });

  it("allows clearing clientProfileId with null", async () => {
    mockUpdateCampaign.mockResolvedValue({
      id: CAMPAIGN_ID,
      clientProfileId: null,
      name: "Campaign",
      updatedAt: new Date("2026-06-12T00:00:00.000Z"),
    } as Awaited<ReturnType<typeof updateCampaign>>);

    const res = await PATCH(patchRequest({ clientProfileId: null }), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(200);
    expect(mockGetClientProfile).not.toHaveBeenCalled();
    expect(mockUpdateCampaign).toHaveBeenCalledWith(CAMPAIGN_ID, "workspace-1", {
      clientProfileId: null,
    });
  });
});
