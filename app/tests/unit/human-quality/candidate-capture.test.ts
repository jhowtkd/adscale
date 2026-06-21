import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationById: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
  updateCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  resolveCampaignClientProfileId: vi.fn(),
}));

vi.mock("@/server/repositories/human-quality-candidate", () => ({
  findCorpusCandidateByDerivationVersion: vi.fn(),
  insertCorpusCandidate: vi.fn(),
}));

vi.mock("@/server/repositories/human-quality-corpus", () => ({
  findCorpusItemByDerivationVersion: vi.fn(),
}));

import { getDerivationById } from "@/server/repositories/derivation";
import { getCampaignById, updateCampaign } from "@/server/repositories/campaign";
import { resolveCampaignClientProfileId } from "@/server/repositories/client-reference";
import {
  findCorpusCandidateByDerivationVersion,
  insertCorpusCandidate,
} from "@/server/repositories/human-quality-candidate";
import { findCorpusItemByDerivationVersion } from "@/server/repositories/human-quality-corpus";
import {
  CorpusCandidateCaptureError,
  captureCorpusCandidateFromDerivation,
} from "@/server/human-quality/candidate-capture";

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440003";
const DERIVATION_ID = "550e8400-e29b-41d4-a716-446655440004";
const CLIENT_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440010";

const derivation = {
  id: DERIVATION_ID,
  campaignId: CAMPAIGN_ID,
  status: "completed",
  generationMode: "art_variation",
  format: "1:1",
  variantIndex: 0,
  ctaText: "Shop",
  qualityScore: 70,
  qualityVerdict: "pass",
  scoreStatus: "analyzed",
  hardFailures: [],
  scoreIssues: [],
  polishSuggestions: [],
  styleAssetId: "style-1",
  prompt: "secret",
  outputKey: "outputs/secret.png",
};

describe("captureCorpusCandidateFromDerivation", () => {
  const mockGetDerivation = vi.mocked(getDerivationById);
  const mockGetCampaign = vi.mocked(getCampaignById);
  const mockResolveClientProfile = vi.mocked(resolveCampaignClientProfileId);
  const mockUpdateCampaign = vi.mocked(updateCampaign);
  const mockFindCandidate = vi.mocked(findCorpusCandidateByDerivationVersion);
  const mockFindCorpusItem = vi.mocked(findCorpusItemByDerivationVersion);
  const mockInsert = vi.mocked(insertCorpusCandidate);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mockFindCandidate.mockResolvedValue(null);
    mockFindCorpusItem.mockResolvedValue(null);
    mockGetDerivation.mockResolvedValue(derivation as never);
    mockGetCampaign.mockResolvedValue({
      id: CAMPAIGN_ID,
      clientProfileId: CLIENT_PROFILE_ID,
    } as never);
    mockResolveClientProfile.mockResolvedValue(CLIENT_PROFILE_ID);
    mockUpdateCampaign.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("registers a privacy-safe candidate for completed derivations", async () => {
    mockInsert.mockResolvedValue({ id: "candidate-1" } as never);

    const result = await captureCorpusCandidateFromDerivation({
      workspaceId: WORKSPACE_ID,
      derivationId: DERIVATION_ID,
    });

    expect(result?.id).toBe("candidate-1");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        derivationId: DERIVATION_ID,
        sourceLabel: "real_customer",
      })
    );
    const payload = mockInsert.mock.calls[0][0];
    expect(payload.artifactRef).not.toHaveProperty("prompt");
    expect(payload.qualitySnapshot).not.toHaveProperty("outputKey");
  });

  it("returns existing candidate without inserting duplicate rows", async () => {
    mockFindCandidate.mockResolvedValue({ id: "existing" } as never);

    const result = await captureCorpusCandidateFromDerivation({
      workspaceId: WORKSPACE_ID,
      derivationId: DERIVATION_ID,
    });

    expect(result?.id).toBe("existing");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("labels synthetic fixture workspaces from env", async () => {
    vi.stubEnv("HUMAN_QUALITY_SYNTHETIC_WORKSPACE_IDS", WORKSPACE_ID);
    mockInsert.mockResolvedValue({ id: "candidate-2" } as never);

    await captureCorpusCandidateFromDerivation({
      workspaceId: WORKSPACE_ID,
      derivationId: DERIVATION_ID,
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLabel: "synthetic_fixture" })
    );
  });
});
