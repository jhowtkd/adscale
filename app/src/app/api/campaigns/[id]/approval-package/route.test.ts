import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "./route";

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
  updateCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationsByCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/share-link", () => ({
  getLatestShareLinkForCampaign: vi.fn(),
  upsertShareLinkForCampaign: vi.fn(),
}));

vi.mock("@/server/output-learning/output-decision-recorder", () => ({
  recordOutputDecisionEvidenceFromValidatedRootsBestEffort: vi.fn(() => Promise.resolve({ id: "evidence-1" })),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() =>
    Promise.resolve((key: string) => key)
  ),
}));

import { getCampaignById, updateCampaign } from "@/server/repositories/campaign";
import { getDerivationsByCampaign } from "@/server/repositories/derivation";
import {
  getLatestShareLinkForCampaign,
  upsertShareLinkForCampaign,
} from "@/server/repositories/share-link";
import { recordOutputDecisionEvidenceFromValidatedRootsBestEffort } from "@/server/output-learning/output-decision-recorder";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";

const mockGetCampaignById = vi.mocked(getCampaignById);
const mockUpdateCampaign = vi.mocked(updateCampaign);
const mockGetDerivationsByCampaign = vi.mocked(getDerivationsByCampaign);
const mockGetLatestShareLinkForCampaign = vi.mocked(getLatestShareLinkForCampaign);
const mockUpsertShareLinkForCampaign = vi.mocked(upsertShareLinkForCampaign);

const ROOT_ID = "11111111-1111-4111-8111-111111111111";
const CHILD_ID = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN_ID = "33333333-3333-4333-8333-333333333333";

const derivations = [
  {
    id: ROOT_ID,
    parentId: null,
    status: "approved",
    outputKey: "out/root-1.png",
    format: "1:1",
    generationMode: "art_variation",
    variantIndex: 0,
    ctaText: "Shop now",
    isPreview: false,
  },
  {
    id: CHILD_ID,
    parentId: ROOT_ID,
    status: "approved",
    outputKey: "out/child-4x5.png",
    format: "4:5",
    generationMode: "format_adaptation",
    variantIndex: 0,
    ctaText: "Shop now",
    isPreview: false,
  },
];

function paramsWith(id: string) {
  return Promise.resolve({ id });
}

describe("GET /api/campaigns/[id]/approval-package", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCampaignById.mockResolvedValue({
      id: CAMPAIGN_ID,
      notes: "Batch notes",
      product: "Shoes",
      offer: "20% off",
    } as Awaited<ReturnType<typeof getCampaignById>>);
    mockGetDerivationsByCampaign.mockResolvedValue(
      derivations as Awaited<ReturnType<typeof getDerivationsByCampaign>>
    );
    mockGetLatestShareLinkForCampaign.mockResolvedValue(null);
  });

  it("returns available approved roots and empty share link", async () => {
    const res = await GET(new Request("http://localhost"), {
      params: paramsWith(CAMPAIGN_ID),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.availableRoots).toHaveLength(1);
    expect(body.shareUrl).toBeNull();
    expect(body.package.items.length).toBeGreaterThanOrEqual(1);
  });

  it("returns zero eligible roots when only preview is approved (SESS-03 scenario)", async () => {
    mockGetDerivationsByCampaign.mockResolvedValue([
      {
        id: ROOT_ID,
        parentId: null,
        status: "approved",
        outputKey: "out/preview.png",
        format: "1:1",
        generationMode: "art_variation",
        variantIndex: 0,
        ctaText: "Shop now",
        isPreview: true,
      },
    ] as Awaited<ReturnType<typeof getDerivationsByCampaign>>);

    const res = await GET(new Request("http://localhost"), {
      params: paramsWith(CAMPAIGN_ID),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.availableRoots).toHaveLength(0);
  });

  it("returns 404 when campaign is missing", async () => {
    mockGetCampaignById.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), {
      params: paramsWith("44444444-4444-4444-8444-444444444444"),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 when share link expiresAt is serialized as a string", async () => {
    mockGetLatestShareLinkForCampaign.mockResolvedValue({
      token: "share-token",
      derivationIds: [ROOT_ID],
      expiresAt: "2026-06-12T00:00:00.000Z",
    } as unknown as Awaited<ReturnType<typeof getLatestShareLinkForCampaign>>);
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";

    const res = await GET(new Request("http://localhost"), {
      params: paramsWith(CAMPAIGN_ID),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.expiresAt).toBe("2026-06-12T00:00:00.000Z");
    expect(body.shareUrl).toBe("https://app.example.com/share/share-token");
  });
});

describe("POST /api/campaigns/[id]/approval-package", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCampaignById.mockResolvedValue({
      id: CAMPAIGN_ID,
      notes: "Old notes",
      product: "Shoes",
      offer: "20% off",
      clientProfileId: "profile-id",
    } as Awaited<ReturnType<typeof getCampaignById>>);
    mockGetDerivationsByCampaign.mockResolvedValue(
      derivations as Awaited<ReturnType<typeof getDerivationsByCampaign>>
    );
    mockUpsertShareLinkForCampaign.mockResolvedValue({
      token: "share-token",
      expiresAt: new Date("2026-06-12T00:00:00.000Z"),
    } as Awaited<ReturnType<typeof upsertShareLinkForCampaign>>);
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
  });

  it("creates package and share link for approved roots", async () => {
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          derivationIds: [ROOT_ID],
          notes: "Client package notes",
        }),
      }),
      { params: paramsWith(CAMPAIGN_ID) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shareUrl).toBe("https://app.example.com/share/share-token");
    expect(body.package.derivationIds).toEqual([ROOT_ID, CHILD_ID]);
    expect(mockUpdateCampaign).toHaveBeenCalledWith(CAMPAIGN_ID, "workspace-1", {
      notes: "Client package notes",
    });
    expect(mockUpsertShareLinkForCampaign).toHaveBeenCalled();
    expect(vi.mocked(recordOutputDecisionEvidenceFromValidatedRootsBestEffort)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "selected_for_delivery",
        derivationId: ROOT_ID,
        campaignId: CAMPAIGN_ID,
      }),
      expect.objectContaining({
        campaign: expect.objectContaining({ id: CAMPAIGN_ID }),
        approvedRootIds: new Set([ROOT_ID]),
      }),
    );
  });

  it("rejects non-approved selection", async () => {
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ derivationIds: [CHILD_ID] }),
      }),
      { params: paramsWith(CAMPAIGN_ID) }
    );

    expect(res.status).toBe(409);
  });

  it("does not load or record evidence when workspace access is denied", async () => {
    vi.mocked(requireWorkspaceAccess).mockRejectedValueOnce(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden"),
    );

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ derivationIds: [ROOT_ID] }),
      }),
      { params: paramsWith(CAMPAIGN_ID) },
    );

    expect(res.status).toBe(403);
    expect(mockGetCampaignById).not.toHaveBeenCalled();
    expect(recordOutputDecisionEvidenceFromValidatedRootsBestEffort).not.toHaveBeenCalled();
  });
});
