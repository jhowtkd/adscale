import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const TOKEN = "share-token-1";
const DERIVATION_ID = "550e8400-e29b-41d4-a716-446655440002";
const CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440001";
const WORKSPACE_ID = "workspace-1";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/lib/with-rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/share-token", () => ({
  validateShareToken: vi.fn(),
}));

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationById: vi.fn(),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    signedDownloadUrl: vi.fn(() => Promise.resolve("https://r2.example.com/signed")),
  },
}));

import { validateShareToken } from "@/lib/share-token";
import { getDerivationById } from "@/server/repositories/derivation";
import { objectStorage } from "@/server/storage";

const mockValidateShareToken = vi.mocked(validateShareToken);
const mockGetDerivationById = vi.mocked(getDerivationById);
const mockSignedDownloadUrl = vi.mocked(objectStorage.signedDownloadUrl);

function paramsWith(derivationId: string) {
  return Promise.resolve({ token: TOKEN, derivationId });
}

describe("GET /api/share/[token]/asset/[derivationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateShareToken.mockResolvedValue({
      campaignId: CAMPAIGN_ID,
      workspaceId: WORKSPACE_ID,
      derivationIds: [DERIVATION_ID],
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    });
  });

  it("rejects completed derivations even when listed on the share link", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: DERIVATION_ID,
      campaignId: CAMPAIGN_ID,
      status: "completed",
      isPreview: false,
      outputKey: "out/draft.png",
      olharVerdict: null,
      exportStatus: null,
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await GET(new Request("http://localhost"), {
      params: paramsWith(DERIVATION_ID),
    });

    expect(res.status).toBe(404);
    expect(mockSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("redirects to a signed URL for approved derivations", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: DERIVATION_ID,
      campaignId: CAMPAIGN_ID,
      status: "approved",
      isPreview: false,
      outputKey: "out/approved.png",
      olharVerdict: null,
      exportStatus: null,
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await GET(new Request("http://localhost"), {
      params: paramsWith(DERIVATION_ID),
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://r2.example.com/signed");
    expect(mockSignedDownloadUrl).toHaveBeenCalledWith("out/approved.png");
  });
});
