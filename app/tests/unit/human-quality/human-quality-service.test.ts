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

vi.mock("@/server/repositories/human-quality-candidate", () => ({
  findCorpusCandidateByDerivationVersion: vi.fn(),
}));

vi.mock("@/server/repositories/human-quality-feedback-artifact", () => ({
  findEvaluationByCorpusItemId: vi.fn(),
  insertFeedbackArtifact: vi.fn(),
}));

vi.mock("@/server/repositories/human-quality-corpus", () => ({
  insertCorpusItem: vi.fn(),
  listPendingCorpusItems: vi.fn(),
  getCorpusItemById: vi.fn(),
  getCorpusItemByIdAnyWorkspace: vi.fn(),
  findCorpusItemByDerivationVersion: vi.fn(),
  submitCorpusEvaluation: vi.fn(),
}));

vi.mock("@/server/output-learning/output-decision-recorder", () => ({
  recordOutputDecisionEvidence: vi.fn(),
}));

vi.mock("@/server/brand-taste/calibration-signal-recorder", () => ({
  recordCalibrationSignalFromOutputDecisionEvent: vi.fn(),
}));

import { getDerivationById } from "@/server/repositories/derivation";
import { getCampaignById, updateCampaign } from "@/server/repositories/campaign";
import { resolveCampaignClientProfileId } from "@/server/repositories/client-reference";
import {
  findCorpusItemByDerivationVersion,
  getCorpusItemById,
  getCorpusItemByIdAnyWorkspace,
  insertCorpusItem,
  listPendingCorpusItems,
  submitCorpusEvaluation,
} from "@/server/repositories/human-quality-corpus";
import { findCorpusCandidateByDerivationVersion } from "@/server/repositories/human-quality-candidate";
import {
  findEvaluationByCorpusItemId,
  insertFeedbackArtifact,
} from "@/server/repositories/human-quality-feedback-artifact";
import { recordOutputDecisionEvidence } from "@/server/output-learning/output-decision-recorder";
import { recordCalibrationSignalFromOutputDecisionEvent } from "@/server/brand-taste/calibration-signal-recorder";
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
const CLIENT_PROFILE_ID_B = "550e8400-e29b-41d4-a716-446655440011";
const ITEM_ID = "550e8400-e29b-41d4-a716-446655440001";
const EVAL_ID = "550e8400-e29b-41d4-a716-446655440020";
const EVAL_ID_A = "550e8400-e29b-41d4-a716-446655440021";
const EVAL_ID_B = "550e8400-e29b-41d4-a716-446655440022";
const REVIEWED_AT = "2026-06-25T12:00:00.000Z";

const mockGetDerivation = vi.mocked(getDerivationById);
const mockGetCampaign = vi.mocked(getCampaignById);
const mockUpdateCampaign = vi.mocked(updateCampaign);
const mockResolveClientProfile = vi.mocked(resolveCampaignClientProfileId);
const mockFindExisting = vi.mocked(findCorpusItemByDerivationVersion);
const mockInsert = vi.mocked(insertCorpusItem);
const mockListPending = vi.mocked(listPendingCorpusItems);
const mockGetItem = vi.mocked(getCorpusItemById);
const mockGetItemGlobal = vi.mocked(getCorpusItemByIdAnyWorkspace);
const mockSubmitEval = vi.mocked(submitCorpusEvaluation);
const mockFindCandidate = vi.mocked(findCorpusCandidateByDerivationVersion);
const mockFindExistingEval = vi.mocked(findEvaluationByCorpusItemId);
const mockInsertArtifact = vi.mocked(insertFeedbackArtifact);
const mockRecordOutputDecision = vi.mocked(recordOutputDecisionEvidence);
const mockRecordCalibrationSignal = vi.mocked(
  recordCalibrationSignalFromOutputDecisionEvent
);

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
    mockResolveClientProfile.mockImplementation(async (_workspaceId, campaign) => {
      return campaign.clientProfileId ?? null;
    });
    mockUpdateCampaign.mockResolvedValue({} as never);
    mockFindExistingEval.mockResolvedValue(null);
    mockFindCandidate.mockResolvedValue(null);
    mockInsertArtifact.mockResolvedValue({ id: "artifact-1" } as never);
    mockRecordOutputDecision.mockResolvedValue({
      id: "output-decision-1",
      workspaceId: WORKSPACE_ID,
      userId: "reviewer-1",
      clientProfileId: CLIENT_PROFILE_ID,
      campaignId: CAMPAIGN_ID,
      derivationId: DERIVATION_ID,
      action: "approved",
      contextSnapshot: {},
      createdAt: new Date(REVIEWED_AT),
    } as never);
    mockRecordCalibrationSignal.mockResolvedValue({
      status: "recorded",
      signalId: "calibration-signal-1",
    });
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
        client: null,
      } as never);
      mockResolveClientProfile.mockResolvedValue(null);

      await expect(
        selectDerivationForCorpus({
          workspaceId: WORKSPACE_ID,
          campaignId: CAMPAIGN_ID,
          derivationId: DERIVATION_ID,
          selectedByUserId: "owner-1",
        })
      ).rejects.toMatchObject({ code: "missing_client_profile" });
    });

    it("resolves client profile from campaign.client and backfills the link", async () => {
      mockGetDerivation.mockResolvedValue(derivation as never);
      mockGetCampaign.mockResolvedValue({
        id: CAMPAIGN_ID,
        clientProfileId: null,
        client: "CENBRAP",
      } as never);
      mockResolveClientProfile.mockResolvedValue(CLIENT_PROFILE_ID);
      mockFindExisting.mockResolvedValue(null);
      mockInsert.mockResolvedValue({ id: ITEM_ID } as never);

      await selectDerivationForCorpus({
        workspaceId: WORKSPACE_ID,
        campaignId: CAMPAIGN_ID,
        derivationId: DERIVATION_ID,
        selectedByUserId: "owner-1",
      });

      expect(mockResolveClientProfile).toHaveBeenCalledWith(WORKSPACE_ID, {
        clientProfileId: null,
        client: "CENBRAP",
      });
      expect(mockUpdateCampaign).toHaveBeenCalledWith(CAMPAIGN_ID, WORKSPACE_ID, {
        clientProfileId: CLIENT_PROFILE_ID,
      });
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ clientProfileId: CLIENT_PROFILE_ID })
      );
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
      mockGetItem.mockResolvedValue({
        id: ITEM_ID,
        workspaceId: WORKSPACE_ID,
        clientProfileId: CLIENT_PROFILE_ID,
        campaignId: CAMPAIGN_ID,
        derivationId: DERIVATION_ID,
        cohort: "baseline",
        generationMode: "art_variation",
        format: "1:1",
        corpusVersion: 1,
        status: "pending",
      } as never);
      mockSubmitEval.mockResolvedValue({
        item: { id: ITEM_ID, status: "evaluated" },
        evaluation: {
          id: EVAL_ID,
          visualScore: 80,
          intent: "approve",
          primaryFailureReason: "other",
          createdAt: new Date(REVIEWED_AT),
        },
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
          workspaceId: WORKSPACE_ID,
          visualScore: 80,
          intent: "approve",
        })
      );
      expect(result.feedbackArtifact.id).toBe("artifact-1");
      expect(mockInsertArtifact).toHaveBeenCalled();
    });

    it("rejects duplicate evaluation for corpus item", async () => {
      mockGetItem.mockResolvedValue({
        id: ITEM_ID,
        workspaceId: WORKSPACE_ID,
        status: "pending",
      } as never);
      mockFindExistingEval.mockResolvedValue({ id: "eval-existing" });

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
      ).rejects.toMatchObject({ code: "corpus_evaluation_duplicate" });
      expect(mockSubmitEval).not.toHaveBeenCalled();
    });

    it("resolves workspace from corpus item when workspaceId is omitted", async () => {
      mockGetItemGlobal.mockResolvedValue({
        id: ITEM_ID,
        workspaceId: WORKSPACE_ID,
        clientProfileId: CLIENT_PROFILE_ID,
        campaignId: CAMPAIGN_ID,
        derivationId: DERIVATION_ID,
        cohort: "baseline",
        generationMode: "art_variation",
        format: "1:1",
        corpusVersion: 1,
        status: "pending",
      } as never);
      mockSubmitEval.mockResolvedValue({
        item: { id: ITEM_ID, status: "evaluated" },
        evaluation: {
          id: EVAL_ID,
          visualScore: 80,
          intent: "approve",
          primaryFailureReason: "other",
          createdAt: new Date(REVIEWED_AT),
        },
      } as never);

      await submitHumanEvaluation({
        corpusItemId: ITEM_ID,
        reviewerUserId: "reviewer-1",
        visualScore: 80,
        factualPass: true,
        intent: "approve",
        primaryFailureReason: "other",
      });

      expect(mockGetItemGlobal).toHaveBeenCalledWith(ITEM_ID);
      expect(mockGetItem).not.toHaveBeenCalled();
      expect(mockSubmitEval).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WORKSPACE_ID })
      );
    });

    it("rejects mismatched workspace scope", async () => {
      mockGetItem.mockResolvedValue({
        id: ITEM_ID,
        workspaceId: WORKSPACE_ID,
        status: "pending",
      } as never);

      await expect(
        submitHumanEvaluation({
          workspaceId: "550e8400-e29b-41d4-a716-446655440099",
          corpusItemId: ITEM_ID,
          reviewerUserId: "reviewer-1",
          visualScore: 70,
          factualPass: false,
          intent: "reject",
          primaryFailureReason: "weak_hierarchy",
        })
      ).rejects.toMatchObject({ code: "corpus_item_workspace_mismatch" });
      expect(mockSubmitEval).not.toHaveBeenCalled();
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
      mockGetItem.mockResolvedValue({
        id: ITEM_ID,
        workspaceId: WORKSPACE_ID,
        status: "evaluated",
      } as never);

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

    it("records output decision and calibration signal for operator_imported approval", async () => {
      mockGetItem.mockResolvedValue({
        id: ITEM_ID,
        workspaceId: WORKSPACE_ID,
        clientProfileId: CLIENT_PROFILE_ID,
        campaignId: CAMPAIGN_ID,
        derivationId: DERIVATION_ID,
        cohort: "baseline",
        generationMode: "art_variation",
        format: "1:1",
        corpusVersion: 1,
        status: "pending",
        qualitySnapshot: { qualityScore: 72, qualityVerdict: "pass" },
      } as never);
      mockFindCandidate.mockResolvedValue({ sourceLabel: "operator_imported" } as never);
      mockSubmitEval.mockResolvedValue({
        item: {
          id: ITEM_ID,
          workspaceId: WORKSPACE_ID,
          clientProfileId: CLIENT_PROFILE_ID,
          campaignId: CAMPAIGN_ID,
          derivationId: DERIVATION_ID,
          status: "evaluated",
          qualitySnapshot: { qualityScore: 72, qualityVerdict: "pass" },
        },
        evaluation: {
          id: EVAL_ID,
          visualScore: 80,
          intent: "approve",
          primaryFailureReason: "other",
          createdAt: new Date(REVIEWED_AT),
        },
      } as never);

      await submitHumanEvaluation({
        workspaceId: WORKSPACE_ID,
        corpusItemId: ITEM_ID,
        reviewerUserId: "reviewer-1",
        visualScore: 80,
        factualPass: true,
        intent: "approve",
        primaryFailureReason: "other",
      });

      expect(mockRecordOutputDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          clientProfileId: CLIENT_PROFILE_ID,
          campaignId: CAMPAIGN_ID,
          derivationId: DERIVATION_ID,
          userId: "reviewer-1",
          action: "approved",
          idempotencyKey: `human-quality-evaluation:${EVAL_ID}:output-decision`,
        })
      );
      expect(mockRecordCalibrationSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLabel: "operator_imported",
          reviewedAt: REVIEWED_AT,
          idempotencyKey: `human-quality-evaluation:${EVAL_ID}:calibration-signal`,
        })
      );
    });

    it("uses item workspace in global mode without browser workspace input", async () => {
      mockGetItemGlobal.mockResolvedValue({
        id: ITEM_ID,
        workspaceId: WORKSPACE_ID,
        clientProfileId: CLIENT_PROFILE_ID,
        campaignId: CAMPAIGN_ID,
        derivationId: DERIVATION_ID,
        cohort: "baseline",
        generationMode: "art_variation",
        format: "1:1",
        corpusVersion: 1,
        status: "pending",
        qualitySnapshot: {},
      } as never);
      mockSubmitEval.mockResolvedValue({
        item: {
          id: ITEM_ID,
          workspaceId: WORKSPACE_ID,
          clientProfileId: CLIENT_PROFILE_ID,
          campaignId: CAMPAIGN_ID,
          derivationId: DERIVATION_ID,
          status: "evaluated",
          qualitySnapshot: {},
        },
        evaluation: {
          id: EVAL_ID,
          intent: "approve",
          primaryFailureReason: "other",
          createdAt: new Date(REVIEWED_AT),
        },
      } as never);

      await submitHumanEvaluation({
        corpusItemId: ITEM_ID,
        reviewerUserId: "reviewer-1",
        visualScore: 80,
        factualPass: true,
        intent: "approve",
        primaryFailureReason: "other",
      });

      expect(mockGetItemGlobal).toHaveBeenCalledWith(ITEM_ID);
      expect(mockGetItem).not.toHaveBeenCalled();
      expect(mockRecordOutputDecision).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WORKSPACE_ID })
      );
    });

    it("preserves synthetic_fixture source label in calibration signal path", async () => {
      mockGetItem.mockResolvedValue({
        id: ITEM_ID,
        workspaceId: WORKSPACE_ID,
        clientProfileId: CLIENT_PROFILE_ID,
        campaignId: CAMPAIGN_ID,
        derivationId: DERIVATION_ID,
        status: "pending",
        qualitySnapshot: {},
      } as never);
      mockFindCandidate.mockResolvedValue({ sourceLabel: "synthetic_fixture" } as never);
      mockSubmitEval.mockResolvedValue({
        item: {
          id: ITEM_ID,
          workspaceId: WORKSPACE_ID,
          clientProfileId: CLIENT_PROFILE_ID,
          campaignId: CAMPAIGN_ID,
          derivationId: DERIVATION_ID,
          status: "evaluated",
          qualitySnapshot: {},
        },
        evaluation: {
          id: EVAL_ID,
          intent: "reject",
          primaryFailureReason: "weak_hierarchy",
          createdAt: new Date(REVIEWED_AT),
        },
      } as never);
      mockRecordOutputDecision.mockResolvedValue({
        id: "output-decision-2",
        workspaceId: WORKSPACE_ID,
        userId: "reviewer-1",
        clientProfileId: CLIENT_PROFILE_ID,
        campaignId: CAMPAIGN_ID,
        derivationId: DERIVATION_ID,
        action: "rejected",
        contextSnapshot: { reason: { code: "weak_hierarchy" } },
        createdAt: new Date(REVIEWED_AT),
      } as never);

      await submitHumanEvaluation({
        workspaceId: WORKSPACE_ID,
        corpusItemId: ITEM_ID,
        reviewerUserId: "reviewer-1",
        visualScore: 40,
        factualPass: true,
        intent: "reject",
        primaryFailureReason: "weak_hierarchy",
      });

      expect(mockRecordCalibrationSignal).toHaveBeenCalledWith(
        expect.objectContaining({ sourceLabel: "synthetic_fixture" })
      );
    });

    it("passes each item clientProfileId through without cross-contamination", async () => {
      const scenarios = [
        { clientProfileId: CLIENT_PROFILE_ID, evalId: EVAL_ID_A },
        { clientProfileId: CLIENT_PROFILE_ID_B, evalId: EVAL_ID_B },
      ] as const;

      for (const scenario of scenarios) {
        vi.clearAllMocks();
        mockFindExistingEval.mockResolvedValue(null);
        mockFindCandidate.mockResolvedValue({ sourceLabel: "operator_imported" } as never);
        mockInsertArtifact.mockResolvedValue({ id: `artifact-${scenario.evalId}` } as never);
        mockRecordOutputDecision.mockResolvedValue({
          id: `output-decision-${scenario.evalId}`,
          workspaceId: WORKSPACE_ID,
          userId: "reviewer-1",
          clientProfileId: scenario.clientProfileId,
          campaignId: CAMPAIGN_ID,
          derivationId: DERIVATION_ID,
          action: "approved",
          contextSnapshot: {},
          createdAt: new Date(REVIEWED_AT),
        } as never);
        mockRecordCalibrationSignal.mockResolvedValue({
          status: "recorded",
          signalId: `calibration-signal-${scenario.evalId}`,
        });

        mockGetItem.mockResolvedValue({
          id: ITEM_ID,
          workspaceId: WORKSPACE_ID,
          clientProfileId: scenario.clientProfileId,
          campaignId: CAMPAIGN_ID,
          derivationId: DERIVATION_ID,
          status: "pending",
          qualitySnapshot: {},
        } as never);
        mockSubmitEval.mockResolvedValue({
          item: {
            id: ITEM_ID,
            workspaceId: WORKSPACE_ID,
            clientProfileId: scenario.clientProfileId,
            campaignId: CAMPAIGN_ID,
            derivationId: DERIVATION_ID,
            status: "evaluated",
            qualitySnapshot: {},
          },
          evaluation: {
            id: scenario.evalId,
            intent: "approve",
            primaryFailureReason: "other",
            createdAt: new Date(REVIEWED_AT),
          },
        } as never);

        await submitHumanEvaluation({
          workspaceId: WORKSPACE_ID,
          corpusItemId: ITEM_ID,
          reviewerUserId: "reviewer-1",
          visualScore: 80,
          factualPass: true,
          intent: "approve",
          primaryFailureReason: "other",
        });

        expect(mockRecordOutputDecision).toHaveBeenCalledWith(
          expect.objectContaining({ clientProfileId: scenario.clientProfileId })
        );
      }
    });
  });
});
