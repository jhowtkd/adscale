import { describe, it, expect, vi, beforeEach } from "vitest";
import { FeedbackValidationError } from "@/server/feedback/validate-refs";

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

vi.mock("@/server/repositories/human-quality-corpus", () => ({
  insertCorpusItem: vi.fn(),
  findCorpusItemByDerivationVersion: vi.fn(),
  getCorpusOperationsProgress: vi.fn(),
}));

import { getDerivationById } from "@/server/repositories/derivation";
import { getCampaignById } from "@/server/repositories/campaign";
import { resolveCampaignClientProfileId } from "@/server/repositories/client-reference";
import {
  findCorpusItemByDerivationVersion,
  getCorpusOperationsProgress,
  insertCorpusItem,
} from "@/server/repositories/human-quality-corpus";
import {
  batchSelectDerivationsForCorpus,
  getCorpusQueueProgress,
} from "@/server/human-quality/service";

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440003";
const CAMPAIGN_ID_2 = "550e8400-e29b-41d4-a716-446655440011";
const DERIVATION_A = "550e8400-e29b-41d4-a716-446655440004";
const DERIVATION_B = "550e8400-e29b-41d4-a716-446655440005";
const DERIVATION_C = "550e8400-e29b-41d4-a716-446655440006";
const CLIENT_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440010";

const mockGetDerivation = vi.mocked(getDerivationById);
const mockGetCampaign = vi.mocked(getCampaignById);
const mockResolveClientProfile = vi.mocked(resolveCampaignClientProfileId);
const mockFindExisting = vi.mocked(findCorpusItemByDerivationVersion);
const mockInsert = vi.mocked(insertCorpusItem);
const mockGetProgress = vi.mocked(getCorpusOperationsProgress);

const derivation = {
  id: DERIVATION_A,
  campaignId: CAMPAIGN_ID,
  workspaceId: WORKSPACE_ID,
  generationMode: "art_variation",
  format: "1:1",
  variantIndex: 0,
  ctaText: "Shop now",
  status: "completed",
  qualityScore: 72,
  qualityVerdict: "pass",
  scoreStatus: "analyzed",
  hardFailures: [],
  scoreIssues: [],
  polishSuggestions: [],
  styleAssetId: "style-1",
};

const campaign = {
  id: CAMPAIGN_ID,
  clientProfileId: CLIENT_PROFILE_ID,
};

describe("live corpus operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveClientProfile.mockImplementation(async (_workspaceId, campaign) => {
      return campaign.clientProfileId ?? null;
    });
  });

  describe("batchSelectDerivationsForCorpus", () => {
    it("returns per-item outcomes for mixed-validity derivations", async () => {
      mockGetDerivation.mockImplementation(async (id) => {
        if (id === DERIVATION_A) return derivation as never;
        if (id === DERIVATION_B) return { ...derivation, id: DERIVATION_B } as never;
        return null;
      });
      mockGetCampaign.mockResolvedValue(campaign as never);
      mockFindExisting.mockImplementation(async (_ws, id) =>
        id === DERIVATION_B ? ({ id: "existing" } as never) : null
      );
      mockInsert.mockResolvedValue({
        id: "item-a",
        status: "pending",
        derivationId: DERIVATION_A,
      } as never);

      const result = await batchSelectDerivationsForCorpus({
        workspaceId: WORKSPACE_ID,
        campaignId: CAMPAIGN_ID,
        selectedByUserId: "owner-1",
        derivationIds: [DERIVATION_A, DERIVATION_B, DERIVATION_C],
        cohort: "baseline",
      });

      expect(result.summary).toEqual({
        total: 3,
        selected: 1,
        duplicate: 1,
        invalid: 1,
        missingProfile: 0,
        unsafePayload: 0,
      });
      expect(result.results).toEqual([
        expect.objectContaining({ derivationId: DERIVATION_A, outcome: "selected" }),
        expect.objectContaining({ derivationId: DERIVATION_B, outcome: "duplicate" }),
        expect.objectContaining({ derivationId: DERIVATION_C, outcome: "invalid" }),
      ]);
    });

    it("reports missing client profile without failing the batch", async () => {
      mockGetDerivation.mockResolvedValue(derivation as never);
      mockGetCampaign.mockResolvedValue({
        id: CAMPAIGN_ID,
        clientProfileId: null,
        client: null,
      } as never);
      mockResolveClientProfile.mockResolvedValue(null);

      const result = await batchSelectDerivationsForCorpus({
        workspaceId: WORKSPACE_ID,
        campaignId: CAMPAIGN_ID,
        selectedByUserId: "owner-1",
        derivationIds: [DERIVATION_A],
      });

      expect(result.results[0]).toMatchObject({
        derivationId: DERIVATION_A,
        outcome: "missing_profile",
        errorCode: "missing_client_profile",
      });
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("reports unsafe payload without failing the batch", async () => {
      mockGetDerivation.mockResolvedValue(derivation as never);
      mockGetCampaign.mockResolvedValue(campaign as never);

      const result = await batchSelectDerivationsForCorpus({
        workspaceId: WORKSPACE_ID,
        campaignId: CAMPAIGN_ID,
        selectedByUserId: "owner-1",
        derivationIds: [DERIVATION_A],
        qualitySnapshot: { prompt: "secret" },
      });

      expect(result.results[0]).toMatchObject({
        derivationId: DERIVATION_A,
        outcome: "unsafe_payload",
        errorCode: "forbidden_corpus_payload",
      });
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("rejects batches above the conservative size cap", async () => {
      const derivationIds = Array.from({ length: 26 }, (_, index) =>
        `550e8400-e29b-41d4-a716-44665544${String(index).padStart(4, "0")}`
      );

      await expect(
        batchSelectDerivationsForCorpus({
          workspaceId: WORKSPACE_ID,
          campaignId: CAMPAIGN_ID,
          selectedByUserId: "owner-1",
          derivationIds,
        })
      ).rejects.toMatchObject({ code: "batch_size_exceeded" });
    });

    it("rejects empty derivation id lists", async () => {
      await expect(
        batchSelectDerivationsForCorpus({
          workspaceId: WORKSPACE_ID,
          campaignId: CAMPAIGN_ID,
          selectedByUserId: "owner-1",
          derivationIds: [],
        })
      ).rejects.toMatchObject({ code: "validation_error" });
    });
  });

  describe("getCorpusQueueProgress", () => {
    it("returns operational queue progress grouped by cohort, mode, format and campaign", async () => {
      const latestSelectedAt = new Date("2026-06-17T10:00:00.000Z");
      const latestEvaluatedAt = new Date("2026-06-17T11:00:00.000Z");
      mockGetProgress.mockResolvedValue({
        totalPending: 3,
        totalEvaluated: 2,
        byCohort: {
          baseline: { pending: 2, evaluated: 1 },
          post_learning: { pending: 1, evaluated: 1 },
        },
        byGenerationMode: {
          art_variation: { pending: 3, evaluated: 2 },
        },
        byFormat: {
          "1:1": { pending: 2, evaluated: 1 },
          "9:16": { pending: 1, evaluated: 1 },
        },
        byCampaign: {
          [CAMPAIGN_ID]: { pending: 2, evaluated: 1 },
          [CAMPAIGN_ID_2]: { pending: 1, evaluated: 1 },
        },
        latestSelectedAt,
        latestEvaluatedAt,
      });

      const progress = await getCorpusQueueProgress({ workspaceId: WORKSPACE_ID });

      expect(progress).toEqual({
        workspaceId: WORKSPACE_ID,
        totalPending: 3,
        totalEvaluated: 2,
        byCohort: {
          baseline: { pending: 2, evaluated: 1 },
          post_learning: { pending: 1, evaluated: 1 },
        },
        byGenerationMode: {
          art_variation: { pending: 3, evaluated: 2 },
        },
        byFormat: {
          "1:1": { pending: 2, evaluated: 1 },
          "9:16": { pending: 1, evaluated: 1 },
        },
        byCampaign: {
          [CAMPAIGN_ID]: { pending: 2, evaluated: 1 },
          [CAMPAIGN_ID_2]: { pending: 1, evaluated: 1 },
        },
        latestSelectedAt: latestSelectedAt.toISOString(),
        latestEvaluatedAt: latestEvaluatedAt.toISOString(),
      });
      expect(mockGetProgress).toHaveBeenCalledWith(WORKSPACE_ID);
    });
  });
});
