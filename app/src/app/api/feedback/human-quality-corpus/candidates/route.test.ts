import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/human-quality-candidate", () => ({
  listCorpusCandidates: vi.fn(),
}));

vi.mock("@/server/human-quality/preview-images", () => ({
  getPreviewUrlsForDerivations: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { listCorpusCandidates } from "@/server/repositories/human-quality-candidate";
import { getPreviewUrlsForDerivations } from "@/server/human-quality/preview-images";

const CANDIDATE_ID = "550e8400-e29b-41d4-a716-446655440001";
const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const DERIVATION_ID = "550e8400-e29b-41d4-a716-446655440004";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockList = vi.mocked(listCorpusCandidates);
const mockPreviews = vi.mocked(getPreviewUrlsForDerivations);

describe("GET /api/feedback/human-quality-corpus/candidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    } as never);
    mockPreviews.mockResolvedValue(new Map([[DERIVATION_ID, "https://signed.example/p.png"]]));
  });

  it("lists unpromoted candidates for platform owner", async () => {
    mockList.mockResolvedValue([
      {
        id: CANDIDATE_ID,
        workspaceId: WORKSPACE_ID,
        clientProfileId: null,
        campaignId: "550e8400-e29b-41d4-a716-446655440003",
        derivationId: DERIVATION_ID,
        generationMode: "art_variation",
        format: "1:1",
        corpusVersion: 1,
        sourceLabel: "real_customer",
        artifactRef: { derivationId: DERIVATION_ID },
        qualitySnapshot: { qualityScore: 70 },
        promotedCorpusItemId: null,
        promotedAt: null,
        capturedAt: new Date("2026-06-20T00:00:00.000Z"),
        createdAt: new Date("2026-06-20T00:00:00.000Z"),
        updatedAt: new Date("2026-06-20T00:00:00.000Z"),
      },
    ] as never);

    const res = await GET(
      new Request("http://localhost/api/feedback/human-quality-corpus/candidates")
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].previewImageUrl).toBe("https://signed.example/p.png");
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ unpromotedOnly: true })
    );
  });
});
