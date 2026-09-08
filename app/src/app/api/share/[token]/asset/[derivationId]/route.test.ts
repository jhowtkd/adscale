import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

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

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
}));

vi.mock("@/server/application/submit-piece-review", () => ({
  submitPieceReview: vi.fn(),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    signedDownloadUrl: vi.fn(() => Promise.resolve("https://r2.example.com/signed")),
  },
}));

import { validateShareToken } from "@/lib/share-token";
import { getDerivationById } from "@/server/repositories/derivation";
import { getCreativeWork } from "@/server/repositories/creative-work";
import { submitPieceReview } from "@/server/application/submit-piece-review";
import { objectStorage } from "@/server/storage";

const mockValidateShareToken = vi.mocked(validateShareToken);
const mockGetDerivationById = vi.mocked(getDerivationById);
const mockGetCreativeWork = vi.mocked(getCreativeWork);
const mockSubmitPieceReview = vi.mocked(submitPieceReview);
const mockSignedDownloadUrl = vi.mocked(objectStorage.signedDownloadUrl);

function paramsWith(derivationId: string) {
  return Promise.resolve({ token: TOKEN, derivationId });
}

describe("GET /api/share/[token]/asset/[derivationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateShareToken.mockResolvedValue({
      id: "link-1",
      campaignId: CAMPAIGN_ID,
      workspaceId: WORKSPACE_ID,
      derivationIds: [DERIVATION_ID],
      creativeWorkId: null,
      outputId: null,
      outputVersion: null,
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    });
  });

  it("serves completed derivations (share policy accepts any output that has an outputKey)", async () => {
    // The share-asset route's policy is "the row has an outputKey" —
    // completed, approved, or any other status. A future "revoked" status
    // would need an explicit block here. The previous "reject completed"
    // policy was a v1 leftover that the asset-migration removed.
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

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://r2.example.com/signed");
    expect(mockSignedDownloadUrl).toHaveBeenCalledWith("out/draft.png");
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

const OUTPUT_ID = "550e8400-e29b-41d4-a716-446655440099";

describe("piece review share assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateShareToken.mockResolvedValue({
      id: "link-1",
      campaignId: null,
      workspaceId: WORKSPACE_ID,
      derivationIds: [],
      creativeWorkId: "work-1",
      outputId: OUTPUT_ID,
      outputVersion: 2,
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    });
  });

  it("refuses another piece that is not in the authorized package", async () => {
    const res = await GET(new Request("http://localhost"), {
      params: paramsWith(DERIVATION_ID),
    });
    expect(res.status).toBe(403);
  });

  it("serves the authorized Studio piece", async () => {
    mockGetCreativeWork.mockResolvedValue({
      work: { id: "work-1" },
      outputs: [{ id: OUTPUT_ID, outputKey: "out/piece.png" }],
      sources: [],
    } as never);

    const res = await GET(new Request("http://localhost"), {
      params: paramsWith(OUTPUT_ID),
    });

    expect(res.status).toBe(302);
    expect(mockSignedDownloadUrl).toHaveBeenCalledWith("out/piece.png");
  });

  it("stores guest feedback on the frozen version", async () => {
    mockSubmitPieceReview.mockResolvedValue({
      ok: true,
      value: {
        comment: { id: "c-1", outputVersion: 2 },
        history: [{ id: "c-1", outputVersion: 2 }],
      },
    } as never);

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorLabel: "Ana",
          decision: "comment",
          body: "Logo alto",
        }),
      }),
      { params: paramsWith(OUTPUT_ID) },
    );

    expect(res.status).toBe(200);
    expect(mockSubmitPieceReview).toHaveBeenCalledWith(expect.objectContaining({
      token: TOKEN,
      requestedOutputId: OUTPUT_ID,
      authorLabel: "Ana",
    }));
  });

  it("does not let external approval replace an objective rejection", async () => {
    mockSubmitPieceReview.mockResolvedValue({
      ok: false,
      error: { code: "objective_rejection" },
    });

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorLabel: "Ana", decision: "approve" }),
      }),
      { params: paramsWith(OUTPUT_ID) },
    );

    expect(res.status).toBe(409);
  });
});
