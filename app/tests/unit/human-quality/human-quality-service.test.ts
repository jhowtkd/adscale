import { describe, it, expect, vi, beforeEach } from "vitest";
import { FeedbackValidationError } from "@/server/feedback/validate-refs";

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationById: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/human-quality-corpus", () => ({
  insertCorpusItem: vi.fn(),
  listPendingCorpusItems: vi.fn(),
  getCorpusItemById: vi.fn(),
  findCorpusItemByDerivationVersion: vi.fn(),
  submitCorpusEvaluation: vi.fn(),
}));

import { getDerivationById } from "@/server/repositories/derivation";
import { getCampaignById } from "@/server/repositories/campaign";
import {
  findCorpusItemByDerivationVersion,
  getCorpusItemById,
  insertCorpusItem,
  listPendingCorpusItems,
  submitCorpusEvaluation,
} from "@/server/repositories/human-quality-corpus";
import {
  HumanQualityServiceError,
  listPendingCorpusQueue,
  selectDerivationForCorpus,
  submitHumanEvaluation,
} from "@/server/human-quality/service";

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440003";
const DERIVATION_ID = "550e8400-e29b-41d4-a716-446655440004";
const CLIENT_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440010";
const ITEM_ID = "550e8400-e29b-41d4-a716-446655440001";

const mockGetDerivation = vi.mocked(getDerivationById);
const mockGetCampaign = vi.mocked(getCampaignById);
const mockFindExisting = vi.mocked(findCorpusItemByDerivationVersion);
const mockInsert = vi.mocked(insertCorpusItem);
const mockListPending = vi.mocked(listPendingCorpusItems);
const mockGetItem = vi.mocked(getCorpusItemById);
const mockSubmitEval = vi.mocked(submitCorpusEvaluation);

const derivation = {
  id: DERIVATION_ID,
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
  scoreIssues: ["weak hierarchy"],
  polishSuggestions: [],
  styleAssetId: "style-1",
  prompt: "secret prompt",
  outputKey: "outputs/secret.png",
};

describe("human-quality service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("selectDerivationForCorpus", () => {
    it("creates pending corpus item from derivation metadata", async () => {
      mockGetDerivation.mockResolvedValue(derivation as never);
      mockGetCampaign.mockResolvedValue({
        id: CAMPAIGN_ID,
        clientProfileId: CLIENT_PROFILE_ID,
      } as never);
      mockFindExisting.mockResolvedValue(null);
      mockInsert.mockResolvedValue({
        id: ITEM_ID,
        status: "pending",
        cohort: "baseline",
      } as never);

      const result = await selectDerivationForCorpus({
        workspaceId: WORKSPACE_ID,
        campaignId: CAMPAIGN_ID,
        derivationId: DERIVATION_ID,
        selectedByUserId: "owner-1",
      });

      expect(result.status).toBe("pending");
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          derivationId: DERIVATION_ID,
          clientProfileId: CLIENT_PROFILE_ID,
          cohort: "baseline",
        })
      );
      const insertArg = mockInsert.mock.calls[0][0];
      expect(insertArg.qualitySnapshot).not.toHaveProperty("prompt");
      expect(insertArg.qualitySnapshot).not.toHaveProperty("outputKey");
      expect(insertArg.artifactRef).toEqual(
        expect.objectContaining({ derivationId: DERIVATION_ID })
      );
    });

    it("defaults invalid cohort to baseline", async () => {
      mockGetDerivation.mockResolvedValue(derivation as never);
      mockGetCampaign.mockResolvedValue({
        id: CAMPAIGN_ID,
        clientProfileId: CLIENT_PROFILE_ID,
      } as never);
      mockFindExisting.mockResolvedValue(null);
      mockInsert.mockResolvedValue({ id: ITEM_ID } as never);

      await selectDerivationForCorpus({
        workspaceId: WORKSPACE_ID,
        campaignId: CAMPAIGN_ID,
        derivationId: DERIVATION_ID,
        selectedByUserId: "owner-1",
        cohort: "invalid-cohort",
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ cohort: "baseline" })
      );
    });

    it("rejects forbidden payload overrides", async () => {
      mockGetDerivation.mockResolvedValue(derivation as never);
      mockGetCampaign.mockResolvedValue({
        id: CAMPAIGN_ID,
        clientProfileId: CLIENT_PROFILE_ID,
      } as never);

      await expect(
        selectDerivationForCorpus({
          workspaceId: WORKSPACE_ID,
          campaignId: CAMPAIGN_ID,
          derivationId: DERIVATION_ID,
          selectedByUserId: "owner-1",
          qualitySnapshot: { prompt: "leak" },
        })
      ).rejects.toMatchObject({ code: "forbidden_corpus_payload" });
    });

    it("rejects duplicate derivation version", async () => {
      mockGetDerivation.mockResolvedValue(derivation as never);
      mockGetCampaign.mockResolvedValue({
        id: CAMPAIGN_ID,
        clientProfileId: CLIENT_PROFILE_ID,
      } as never);
      mockFindExisting.mockResolvedValue({ id: "existing" } as never);

      await expect(
        selectDerivationForCorpus({
          workspaceId: WORKSPACE_ID,
          campaignId: CAMPAIGN_ID,
          derivationId: DERIVATION_ID,
          selectedByUserId: "owner-1",
        })
      ).rejects.toMatchObject({ code: "duplicate_corpus_item" });
    });

    it("rejects derivation outside workspace", async () => {
      mockGetDerivation.mockResolvedValue(null);

      await expect(
        selectDerivationForCorpus({
          workspaceId: WORKSPACE_ID,
          campaignId: CAMPAIGN_ID,
          derivationId: DERIVATION_ID,
          selectedByUserId: "owner-1",
        })
      ).rejects.toBeInstanceOf(FeedbackValidationError);
    });

    it("rejects campaign without client profile", async () => {
      mockGetDerivation.mockResolvedValue(derivation as never);
      mockGetCampaign.mockResolvedValue({
        id: CAMPAIGN_ID,
        clientProfileId: null,
      } as never);

      await expect(
        selectDerivationForCorpus({
          workspaceId: WORKSPACE_ID,
          campaignId: CAMPAIGN_ID,
          derivationId: DERIVATION_ID,
          selectedByUserId: "owner-1",
        })
      ).rejects.toMatchObject({ code: "missing_client_profile" });
    });
  });

  describe("listPendingCorpusQueue", () => {
    it("delegates to repository pending list", async () => {
      mockListPending.mockResolvedValue([{ id: ITEM_ID, status: "pending" }] as never);

      const items = await listPendingCorpusQueue({
        workspaceId: WORKSPACE_ID,
        limit: 10,
      });

      expect(items).toHaveLength(1);
      expect(mockListPending).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        limit: 10,
      });
    });
  });

  describe("submitHumanEvaluation", () => {
    it("submits evaluation for pending corpus item", async () => {
      mockGetItem.mockResolvedValue({ id: ITEM_ID, status: "pending" } as never);
      mockSubmitEval.mockResolvedValue({
        item: { id: ITEM_ID, status: "evaluated" },
        evaluation: { id: "eval-1", visualScore: 80 },
      } as never);

      const result = await submitHumanEvaluation({
        workspaceId: WORKSPACE_ID,
        corpusItemId: ITEM_ID,
        reviewerUserId: "reviewer-1",
        visualScore: 80,
        factualPass: true,
        intent: "approve",
        primaryFailureReason: "other",
      });

      expect(result.item.status).toBe("evaluated");
      expect(mockSubmitEval).toHaveBeenCalledWith(
        expect.objectContaining({
          visualScore: 80,
          intent: "approve",
        })
      );
    });

    it("rejects invalid visual score", async () => {
      await expect(
        submitHumanEvaluation({
          workspaceId: WORKSPACE_ID,
          corpusItemId: ITEM_ID,
          reviewerUserId: "reviewer-1",
          visualScore: 101,
          factualPass: true,
          intent: "approve",
          primaryFailureReason: "other",
        })
      ).rejects.toBeInstanceOf(HumanQualityServiceError);
    });

    it("rejects missing corpus item", async () => {
      mockGetItem.mockResolvedValue(null);

      await expect(
        submitHumanEvaluation({
          workspaceId: WORKSPACE_ID,
          corpusItemId: ITEM_ID,
          reviewerUserId: "reviewer-1",
          visualScore: 70,
          factualPass: false,
          intent: "reject",
          primaryFailureReason: "weak_hierarchy",
        })
      ).rejects.toMatchObject({ code: "corpus_item_not_found" });
    });

    it("rejects already evaluated corpus item", async () => {
      mockGetItem.mockResolvedValue({ id: ITEM_ID, status: "evaluated" } as never);

      await expect(
        submitHumanEvaluation({
          workspaceId: WORKSPACE_ID,
          corpusItemId: ITEM_ID,
          reviewerUserId: "reviewer-1",
          visualScore: 70,
          factualPass: false,
          intent: "reject",
          primaryFailureReason: "weak_hierarchy",
        })
      ).rejects.toMatchObject({ code: "corpus_item_not_pending" });
    });
  });
});
