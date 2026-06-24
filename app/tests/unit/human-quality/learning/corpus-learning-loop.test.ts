import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/human-quality-corpus", () => ({
  listEvaluatedCorpusWithEvaluations: vi.fn(),
}));

vi.mock("@/server/repositories/human-quality-feedback-artifact", () => ({
  listFeedbackArtifactIdsByCorpusItemIds: vi.fn(),
}));

vi.mock("@/server/repositories/calibration-rule", () => ({
  getApprovedCorpusQualityRuleForFailure: vi.fn(),
  insertCalibrationRule: vi.fn(),
}));

vi.mock("@/server/repositories/client-learning-proposal", () => ({
  findActiveProposalBySlice: vi.fn(),
  findSliceInCooldown: vi.fn(),
  insertClientLearningProposal: vi.fn(),
  getClientLearningProposalById: vi.fn(),
  markProposalAccepted: vi.fn(),
  markProposalRejected: vi.fn(),
}));

import { buildCompositeSliceKey } from "@/server/human-quality/calibration/aggregate";
import type { EvaluatedCorpusRow } from "@/server/human-quality/calibration/types";
import { buildClientLearningProposals } from "@/server/human-quality/learning/aggregate";
import { buildFactualIssueAlerts } from "@/server/human-quality/learning/factual-alerts";
import { generateAndPersistClientLearningProposals } from "@/server/human-quality/learning/generate";
import {
  acceptClientLearningProposal,
  rejectClientLearningProposal,
} from "@/server/human-quality/learning/proposals";
import type { ClientLearningProposal, HumanQualityCorpusItem, HumanQualityEvaluation } from "@/server/db/schema";
import {
  getApprovedCorpusQualityRuleForFailure,
  insertCalibrationRule,
} from "@/server/repositories/calibration-rule";
import {
  findActiveProposalBySlice,
  findSliceInCooldown,
  getClientLearningProposalById,
  insertClientLearningProposal,
  markProposalAccepted,
  markProposalRejected,
} from "@/server/repositories/client-learning-proposal";
import { listEvaluatedCorpusWithEvaluations } from "@/server/repositories/human-quality-corpus";
import { listFeedbackArtifactIdsByCorpusItemIds } from "@/server/repositories/human-quality-feedback-artifact";

const mockListEvaluated = vi.mocked(listEvaluatedCorpusWithEvaluations);
const mockListFeedbackArtifacts = vi.mocked(listFeedbackArtifactIdsByCorpusItemIds);
const mockGetApprovedRule = vi.mocked(getApprovedCorpusQualityRuleForFailure);
const mockFindActive = vi.mocked(findActiveProposalBySlice);
const mockFindCooldown = vi.mocked(findSliceInCooldown);
const mockInsert = vi.mocked(insertClientLearningProposal);
const mockGetProposal = vi.mocked(getClientLearningProposalById);
const mockInsertRule = vi.mocked(insertCalibrationRule);
const mockMarkAccepted = vi.mocked(markProposalAccepted);
const mockMarkRejected = vi.mocked(markProposalRejected);

const WORKSPACE_ID = "ws-1";
const CLIENT_PROFILE_ID = "profile-1";

function makeItem(overrides: Partial<HumanQualityCorpusItem> = {}): HumanQualityCorpusItem {
  return {
    id: "item-1",
    workspaceId: WORKSPACE_ID,
    clientProfileId: CLIENT_PROFILE_ID,
    campaignId: "camp-1",
    derivationId: "deriv-1",
    generationMode: "art_variation",
    format: "1:1",
    cohort: "baseline",
    corpusVersion: 1,
    artifactRef: { derivationId: "deriv-1" },
    qualitySnapshot: { qualityScore: 80, qualityVerdict: "pass" },
    selectedByUserId: "user-1",
    selectedAt: new Date("2026-06-01"),
    status: "evaluated",
    createdAt: new Date("2026-06-01"),
    updatedAt: new Date("2026-06-01"),
    ...overrides,
  };
}

function makeEvaluation(
  overrides: Partial<HumanQualityEvaluation> = {}
): HumanQualityEvaluation {
  return {
    id: "eval-1",
    workspaceId: WORKSPACE_ID,
    corpusItemId: "item-1",
    reviewerUserId: "reviewer-1",
    visualScore: 62,
    factualPass: true,
    intent: "reject",
    primaryFailureReason: "visual_overload",
    otherReasonText: null,
    notes: null,
    createdAt: new Date("2026-06-02"),
    ...overrides,
  };
}

function makeRow(
  itemOverrides: Partial<HumanQualityCorpusItem> = {},
  evaluationOverrides: Partial<HumanQualityEvaluation> = {},
  rowOverrides: Partial<Pick<EvaluatedCorpusRow, "sourceLabel" | "feedbackArtifactId">> = {}
): EvaluatedCorpusRow {
  const item = makeItem(itemOverrides);
  return {
    item,
    evaluation: makeEvaluation({
      corpusItemId: item.id,
      ...evaluationOverrides,
    }),
    ...rowOverrides,
  };
}

function makeVisualOverloadSliceRows(count: number): EvaluatedCorpusRow[] {
  return Array.from({ length: count }, (_, index) =>
    makeRow(
      {
        id: `item-${index + 1}`,
        qualitySnapshot: { qualityScore: 80, qualityVerdict: "pass" },
      },
      {
        id: `eval-${index + 1}`,
        corpusItemId: `item-${index + 1}`,
        visualScore: 62,
        intent: index < 2 ? "reject" : "regenerate",
      },
      {
        feedbackArtifactId: `artifact-${index + 1}`,
      }
    )
  );
}

function makeFactualIssueSliceRows(count: number): EvaluatedCorpusRow[] {
  return Array.from({ length: count }, (_, index) =>
    makeRow(
      {
        id: `fact-item-${index + 1}`,
        qualitySnapshot: { qualityScore: 80, qualityVerdict: "pass" },
      },
      {
        id: `fact-eval-${index + 1}`,
        corpusItemId: `fact-item-${index + 1}`,
        visualScore: 62,
        factualPass: false,
        primaryFailureReason: "factual_issue",
        intent: index < 2 ? "reject" : "regenerate",
      }
    )
  );
}

function buildExpectedSliceKey(reason: string): string {
  return `${WORKSPACE_ID}:${CLIENT_PROFILE_ID}:${buildCompositeSliceKey(
    reason,
    "art_variation",
    "1:1"
  )}`;
}

function buildPersistedProposal(
  built: ReturnType<typeof buildClientLearningProposals>[number]
): ClientLearningProposal {
  return {
    id: "proposal-loop-1",
    workspaceId: built.workspaceId,
    clientProfileId: built.clientProfileId,
    sliceKey: built.sliceKey,
    primaryFailureReason: built.primaryFailureReason,
    rationale: built.rationale,
    evidenceRefs: built.evidenceRefs,
    status: "proposed",
    proposedAt: new Date("2026-06-21"),
    acceptedAt: null,
    acceptedBy: null,
    rejectedReason: null,
    cooldownUntil: null,
    createdAt: new Date("2026-06-21"),
  };
}

describe("corpus learning loop", () => {
  let visualRows: EvaluatedCorpusRow[];
  let persistedProposal: ClientLearningProposal;
  let cooldownRejected: ClientLearningProposal | null;

  beforeEach(() => {
    vi.clearAllMocks();
    visualRows = makeVisualOverloadSliceRows(3);
    cooldownRejected = null;

    mockListFeedbackArtifacts.mockResolvedValue(
      new Map([
        ["item-1", "artifact-1"],
        ["item-2", "artifact-2"],
        ["item-3", "artifact-3"],
      ])
    );
    mockGetApprovedRule.mockResolvedValue(null);
    mockFindActive.mockResolvedValue(null);
    mockFindCooldown.mockImplementation(async () => cooldownRejected);
    mockListEvaluated.mockResolvedValue(visualRows);

    mockInsert.mockImplementation(async (input) => {
      persistedProposal = {
        id: "proposal-loop-1",
        workspaceId: input.workspaceId,
        clientProfileId: input.clientProfileId,
        sliceKey: input.sliceKey,
        primaryFailureReason: input.primaryFailureReason,
        rationale: input.rationale,
        evidenceRefs: input.evidenceRefs,
        status: "proposed",
        proposedAt: new Date("2026-06-21"),
        acceptedAt: null,
        acceptedBy: null,
        rejectedReason: null,
        cooldownUntil: null,
        createdAt: new Date("2026-06-21"),
      };
      return persistedProposal;
    });

    mockGetProposal.mockImplementation(async () => persistedProposal);
    mockInsertRule.mockResolvedValue({
      id: "rule-loop-1",
      workspaceId: WORKSPACE_ID,
      clientProfileId: CLIENT_PROFILE_ID,
      category: "corpus_quality",
      status: "approved",
      rationale: `visual_overload: ${persistedProposal?.rationale ?? ""}`,
      supportingSignalIds: ["artifact-1", "artifact-2", "artifact-3"],
      confidence: "medium",
      caveats: [],
      mismatchBucket: null,
      version: 1,
      approvedAt: new Date("2026-06-21T12:00:00Z"),
      approvedBy: "owner-1",
      createdAt: new Date("2026-06-21"),
      updatedAt: new Date("2026-06-21"),
    } as never);
    mockMarkAccepted.mockImplementation(async () => ({
      ...persistedProposal,
      status: "accepted",
      acceptedAt: new Date("2026-06-21T12:00:00Z"),
      acceptedBy: "owner-1",
    }));
    mockMarkRejected.mockImplementation(async (_id, reason, cooldownUntil) => {
      cooldownRejected = {
        ...persistedProposal,
        status: "rejected",
        rejectedReason: reason,
        cooldownUntil,
      };
      return cooldownRejected;
    });
  });

  it("LEARN-01: aggregates 3 visual_overload evals into one client-scoped proposal", () => {
    const proposals = buildClientLearningProposals(visualRows);

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      workspaceId: WORKSPACE_ID,
      clientProfileId: CLIENT_PROFILE_ID,
      primaryFailureReason: "visual_overload",
      sliceKey: buildExpectedSliceKey("visual_overload"),
    });
    expect(proposals[0].evidenceRefs.stats.count).toBe(3);
    expect(proposals[0].evidenceRefs.stats.meanSignedDelta).toBe(18);
    expect(proposals[0].evidenceRefs.artifactIds).toEqual([
      "artifact-1",
      "artifact-2",
      "artifact-3",
    ]);
  });

  it("LEARN-01/02: generateAndPersistClientLearningProposals persists one proposed slice", async () => {
    const result = await generateAndPersistClientLearningProposals({
      workspaceId: WORKSPACE_ID,
    });

    expect(mockFindActive).toHaveBeenCalledWith(
      WORKSPACE_ID,
      CLIENT_PROFILE_ID,
      buildExpectedSliceKey("visual_overload")
    );
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(result.generated).toBe(1);
    expect(result.proposals[0].status).toBe("proposed");
    expect(result.proposals[0].evidenceRefs.stats).toEqual(
      expect.objectContaining({ count: 3, meanSignedDelta: 18 })
    );
  });

  it("LEARN-03: persisted proposal is listable by workspace and clientProfileId filters", async () => {
    const { proposals } = await generateAndPersistClientLearningProposals({
      workspaceId: WORKSPACE_ID,
    });

    const listed = proposals.filter(
      (proposal) =>
        proposal.workspaceId === WORKSPACE_ID &&
        proposal.clientProfileId === CLIENT_PROFILE_ID &&
        proposal.status === "proposed"
    );

    expect(listed).toHaveLength(1);
    expect(listed[0].evidenceRefs.stats).toBeDefined();
    expect(listed[0].sliceKey).toBe(buildExpectedSliceKey("visual_overload"));
  });

  it("LEARN-04: acceptClientLearningProposal creates corpus_quality rule with failure prefix", async () => {
    await generateAndPersistClientLearningProposals({ workspaceId: WORKSPACE_ID });

    const result = await acceptClientLearningProposal({
      proposalId: persistedProposal.id,
      reviewerUserId: "owner-1",
    });

    expect(mockInsertRule).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "corpus_quality",
        status: "approved",
        rationale: expect.stringMatching(/^visual_overload:/),
        supportingSignalIds: ["artifact-1", "artifact-2", "artifact-3"],
        approvedBy: "owner-1",
      })
    );
    expect(result.rule.category).toBe("corpus_quality");
    expect(result.rule.rationale).toMatch(/^visual_overload:/);
    expect(result.proposal.status).toBe("accepted");
  });

  it("LEARN-05: reject sets ~30-day cooldown and generate skips the slice", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T12:00:00Z"));

    await generateAndPersistClientLearningProposals({ workspaceId: WORKSPACE_ID });

    const rejected = await rejectClientLearningProposal({
      proposalId: persistedProposal.id,
      reviewerUserId: "owner-1",
      reason: "Not actionable yet",
    });

    expect(rejected.status).toBe("rejected");
    expect(rejected.cooldownUntil).toEqual(new Date("2026-07-21T12:00:00Z"));
    expect(mockMarkRejected).toHaveBeenCalledWith(
      persistedProposal.id,
      "Not actionable yet",
      new Date("2026-07-21T12:00:00Z")
    );

    mockInsert.mockClear();
    const afterReject = await generateAndPersistClientLearningProposals({
      workspaceId: WORKSPACE_ID,
    });

    expect(mockFindCooldown).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(afterReject.generated).toBe(0);

    vi.useRealTimers();
  });

  it("LEARN-06: factual_issue rows surface alerts and never become proposals", () => {
    const factualRows = makeFactualIssueSliceRows(3);
    const proposals = buildClientLearningProposals(factualRows);
    const alerts = buildFactualIssueAlerts(factualRows);

    expect(proposals).toHaveLength(0);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      workspaceId: WORKSPACE_ID,
      clientProfileId: CLIENT_PROFILE_ID,
      sliceKey: buildExpectedSliceKey("factual_issue"),
      rationale: "factual_guard_review_required",
    });
    expect(alerts[0].evidenceRefs.stats.count).toBe(3);
  });
});
