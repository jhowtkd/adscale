import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST, GET } from "./route";

vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/user", () => ({
  getUserLocale: vi.fn(() => Promise.resolve("pt-BR")),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
  refreshCampaignStatus: vi.fn(),
  updateCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/derivation", () => ({
  createDerivation: vi.fn(),
  failStaleActiveDerivations: vi.fn(),
  getDerivationsByCampaign: vi.fn(),
  updateDerivationStatus: vi.fn(),
}));

vi.mock("@/server/repositories/asset", () => ({
  getAssetsByCampaign: vi.fn(),
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/server/billing/paywall", () => ({
  spend: vi.fn(() => Promise.resolve({ ok: true, creditsSpent: 5 })),
  spendOrApiError: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    signedDownloadUrl: vi.fn(),
  },}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { db } from "@/server/db";
import {
  getCampaignById,
  refreshCampaignStatus,
  updateCampaign,
} from "@/server/repositories/campaign";
import {
  createDerivation,
  failStaleActiveDerivations,
  getDerivationsByCampaign,
  updateDerivationStatus,
} from "@/server/repositories/derivation";
import { getAssetsByCampaign } from "@/server/repositories/asset";
import { inngest } from "@/server/jobs/client";
import { spend } from "@/server/billing/paywall";
import { objectStorage } from "@/server/storage";

const mockDbSelect = vi.mocked(db.select);
const mockGetCampaignById = vi.mocked(getCampaignById);
const mockUpdateCampaign = vi.mocked(updateCampaign);
const mockCreateDerivation = vi.mocked(createDerivation);
const mockFailStaleActiveDerivations = vi.mocked(failStaleActiveDerivations);
const mockGetDerivationsByCampaign = vi.mocked(getDerivationsByCampaign);
const mockUpdateDerivationStatus = vi.mocked(updateDerivationStatus);
const mockGetAssetsByCampaign = vi.mocked(getAssetsByCampaign);
const mockInngestSend = vi.mocked(inngest.send);
const mockSpendCredits = vi.mocked(spend);
const mockGetPresignedDownloadUrl = vi.mocked(objectStorage.signedDownloadUrl);

function makeParams(id: string) {
  return Promise.resolve({ id });
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/campaigns/camp-1/restyle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(id: string): Request {
  return new Request(`http://localhost/api/campaigns/${id}/restyle`, {
    method: "GET",
  });
}

function mockDbNoQueued() {
  mockDbSelect.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([]),
      }),
    }),
  } as unknown as ReturnType<typeof db.select>);
}

function mockDbHasQueued() {
  mockDbSelect.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([{ id: "existing" }]),
      }),
    }),
  } as unknown as ReturnType<typeof db.select>);
}

describe("POST /api/campaigns/[id]/restyle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbNoQueued();
    mockGetCampaignById.mockResolvedValue({
      id: "camp-1",
      name: "Test Campaign",
    } as Awaited<ReturnType<typeof getCampaignById>>);
    mockGetAssetsByCampaign.mockResolvedValue([
      {
        id: "550e8400-e29b-41d4-a716-446655440001",
        role: "base",
        key: "campaigns/camp-1/test.png",
        width: 1024,
        height: 1024,
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440002",
        role: "style_reference",
        key: "campaigns/camp-1/style.png",
        width: 1024,
        height: 1024,
      },
    ] as Awaited<ReturnType<typeof getAssetsByCampaign>>);
    mockCreateDerivation.mockResolvedValue({
      id: "derivation-1",
      campaignId: "camp-1",
      workspaceId: "workspace-1",
      status: "queued",
      generationMode: "restyling",
      format: "1024x1024",
    } as Awaited<ReturnType<typeof createDerivation>>);
    mockInngestSend.mockResolvedValue(undefined);
    mockSpendCredits.mockResolvedValue({ ok: true, creditsSpent: 5 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 404 when campaign is missing", async () => {
    mockGetCampaignById.mockResolvedValue(null);

    const res = await POST(postRequest({}), { params: makeParams("camp-1") });

    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid input", async () => {
    const res = await POST(postRequest({ styleIntensity: "invalid" }), {
      params: makeParams("camp-1"),
    });

    expect(res.status).toBe(400);
  });

  it("returns 429 when derivations are already queued or processing", async () => {
    mockDbHasQueued();

    const res = await POST(postRequest({}), { params: makeParams("camp-1") });

    expect(res.status).toBe(429);
  });

  it("returns 400 when no base asset exists", async () => {
    mockGetAssetsByCampaign.mockResolvedValue([]);

    const res = await POST(postRequest({}), { params: makeParams("camp-1") });

    expect(res.status).toBe(400);
  });

  it("returns 404 when styleAssetIds contain assets not in campaign", async () => {
    mockGetAssetsByCampaign.mockResolvedValue([
      { id: "550e8400-e29b-41d4-a716-446655440001", role: "base", key: "k1" },
    ] as Awaited<ReturnType<typeof getAssetsByCampaign>>);

    const res = await POST(
      postRequest({ styleAssetIds: ["550e8400-e29b-41d4-a716-446655440001", "550e8400-e29b-41d4-a716-446655440999"] }),
      { params: makeParams("camp-1") }
    );

    expect(res.status).toBe(404);
  });

  it("creates derivation, spends credits, sends event, and updates campaign", async () => {
    const res = await POST(
      postRequest({ styleAssetIds: ["550e8400-e29b-41d4-a716-446655440002"], styleIntensity: "strong" }),
      { params: makeParams("camp-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.derivations).toHaveLength(1);
    expect(body.derivations[0].id).toBe("derivation-1");

    expect(mockUpdateCampaign).toHaveBeenCalledWith(
      "camp-1",
      "workspace-1",
      expect.objectContaining({ generationMode: "restyling", styleIntensity: "strong" })
    );

    expect(mockSpendCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        action: "image_derivation",
        amount: 5,
        idempotencyKey: expect.stringContaining("restyling:camp-1:"),
      })
    );

    expect(mockCreateDerivation).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: "camp-1",
        workspaceId: "workspace-1",
        status: "queued",
        generationMode: "restyling",
        variantIndex: 0,
        format: "1024x1024",
        styleAssetId: "550e8400-e29b-41d4-a716-446655440002",
      })
    );

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "derivation.generate",
        data: expect.objectContaining({
          derivationId: "derivation-1",
          campaignId: "camp-1",
          workspaceId: "workspace-1",
          generationMode: "restyling",
          styleAssetId: "550e8400-e29b-41d4-a716-446655440002",
        }),
      })
    );

    expect(mockUpdateCampaign).toHaveBeenLastCalledWith(
      "camp-1",
      "workspace-1",
      expect.objectContaining({ status: "generating" })
    );
  });

  it("returns 500 when event send fails and marks derivation failed", async () => {
    mockInngestSend.mockRejectedValue(new Error("Inngest down"));

    const res = await POST(postRequest({}), { params: makeParams("camp-1") });

    expect(res.status).toBe(500);
    expect(mockUpdateDerivationStatus).toHaveBeenCalledWith(
      "derivation-1",
      "workspace-1",
      "failed"
    );
  });

  it("falls back to first asset when no role=base asset exists", async () => {
    mockGetAssetsByCampaign.mockResolvedValue([
      { id: "550e8400-e29b-41d4-a716-446655440002", role: null, key: "k2", width: 512, height: 512 },
      { id: "550e8400-e29b-41d4-a716-446655440003", role: "style_reference", key: "style", width: 512, height: 512 },
    ] as Awaited<ReturnType<typeof getAssetsByCampaign>>);

    const res = await POST(postRequest({}), { params: makeParams("camp-1") });

    expect(res.status).toBe(201);
    expect(mockCreateDerivation).toHaveBeenCalledWith(
      expect.objectContaining({ format: "512x512" })
    );
  });

  it("does not treat a style reference as the fallback base asset", async () => {
    mockGetAssetsByCampaign.mockResolvedValue([
      { id: "550e8400-e29b-41d4-a716-446655440003", role: "style_reference", key: "style", width: 512, height: 512 },
    ] as Awaited<ReturnType<typeof getAssetsByCampaign>>);

    const res = await POST(postRequest({}), { params: makeParams("camp-1") });

    expect(res.status).toBe(400);
    expect(mockCreateDerivation).not.toHaveBeenCalled();
    expect(mockUpdateCampaign).not.toHaveBeenCalled();
    expect(mockSpendCredits).not.toHaveBeenCalled();
  });

  it("rejects using the factual base asset as the style reference", async () => {
    const res = await POST(
      postRequest({ styleAssetIds: ["550e8400-e29b-41d4-a716-446655440001"] }),
      { params: makeParams("camp-1") }
    );

    expect(res.status).toBe(400);
    expect(mockCreateDerivation).not.toHaveBeenCalled();
    expect(mockUpdateCampaign).not.toHaveBeenCalled();
    expect(mockSpendCredits).not.toHaveBeenCalled();
  });
});

describe("GET /api/campaigns/[id]/restyle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFailStaleActiveDerivations.mockResolvedValue([]);
    mockGetDerivationsByCampaign.mockResolvedValue([
      {
        id: "d1",
        campaignId: "camp-1",
        workspaceId: "workspace-1",
        status: "completed",
        outputKey: "derivations/d1.png",
        format: "1:1",
      },
      {
        id: "d2",
        campaignId: "camp-1",
        workspaceId: "workspace-1",
        status: "queued",
        outputKey: null,
        format: "4:5",
      },
    ] as Awaited<ReturnType<typeof getDerivationsByCampaign>>);
    mockGetPresignedDownloadUrl.mockResolvedValue("https://cdn.example.com/d1.png");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns derivations with presigned image urls", async () => {
    const res = await GET(getRequest("camp-1"), { params: makeParams("camp-1") });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.derivations).toHaveLength(2);
    expect(body.derivations[0].imageUrl).toBe("https://cdn.example.com/d1.png");
    expect(body.derivations[1].imageUrl).toBeNull();
  });

  it("fails stale active derivations and refreshes campaign status when stale found", async () => {
    mockFailStaleActiveDerivations.mockResolvedValue([
      { id: "stale-1" },
    ] as Awaited<ReturnType<typeof failStaleActiveDerivations>>);

    const res = await GET(getRequest("camp-1"), { params: makeParams("camp-1") });

    expect(res.status).toBe(200);
    expect(refreshCampaignStatus).toHaveBeenCalledWith("camp-1", "workspace-1");
  });
});
