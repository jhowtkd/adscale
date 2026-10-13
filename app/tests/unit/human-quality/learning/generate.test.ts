import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/human-quality-corpus", () => ({
  listEvaluatedCorpusWithEvaluations: vi.fn(),
  listCorpusItemsByIds: vi.fn(),
}));

vi.mock("@/server/repositories/human-quality-feedback-artifact", () => ({
  listFeedbackArtifactIdsByCorpusItemIds: vi.fn(),
}));

vi.mock("@/server/repositories/calibration-rule", () => ({
  getApprovedCorpusQualityRuleForFailure: vi.fn(),
}));

vi.mock("@/server/repositories/client-learning-proposal", () => ({
  findActiveProposalBySlice: vi.fn(),
  findLatestRejectedProposalBySlice: vi.fn(),
  insertClientLearningProposal: vi.fn(),
}));

import {
  findActiveProposalBySlice,
  findLatestRejectedProposalBySlice,
  insertClientLearningProposal,
} from "@/server/repositories/client-learning-proposal";
import { getApprovedCorpusQualityRuleForFailure } from "@/server/repositories/calibration-rule";
import { listCorpusItemsByIds, listEvaluatedCorpusWithEvaluations } from "@/server/repositories/human-quality-corpus";
import { listFeedbackArtifactIdsByCorpusItemIds } from "@/server/repositories/human-quality-feedback-artifact";
import { generateAndPersistClientLearningProposals } from "@/server/human-quality/learning/generate";
import type { EvaluatedCorpusRow } from "@/server/human-quality/calibration/types";
import type { HumanQualityCorpusItem, HumanQualityEvaluation } from "@/server/db/schema";

const mockListEvaluated = vi.mocked(listEvaluatedCorpusWithEvaluations);
const mockListFeedbackArtifacts = vi.mocked(listFeedbackArtifactIdsByCorpusItemIds);
const mockGetApprovedRule = vi.mocked(getApprovedCorpusQualityRuleForFailure);
const mockFindActive = vi.mocked(findActiveProposalBySlice);
const mockFindCooldown = vi.mocked(findLatestRejectedProposalBySlice);
const mockInsert = vi.mocked(insertClientLearningProposal);

function makeItem(overrides: Partial<HumanQualityCorpusItem> = {}): HumanQualityCorpusItem {
  return {
    id: "item-1",
    workspaceId: "ws-1",
    clientProfileId: "profile-1",
    campaignId: "camp-1",
    derivationId: `deriv-${overrides.id ?? "item-1"}`,
    generationMode: "art_variation",
    format: "1:1",
    cohort: "baseline",
    corpusVersion: 1,
    artifactRef: { derivationId: `deriv-${overrides.id ?? "item-1"}` },
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
    workspaceId: "ws-1",
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
  evaluationOverrides: Partial<HumanQualityEvaluation> = {}
): EvaluatedCorpusRow {
  const item = makeItem(itemOverrides);
  return {
    item,
    evaluation: makeEvaluation({
      corpusItemId: item.id,
      ...evaluationOverrides,
    }),
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
      }
    )
  );
}

describe("generateAndPersistClientLearningProposals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCorpusItemsByIds).mockImplementation(async (_scope, ids) => ids.map(id => makeItem({ id })));
    mockListFeedbackArtifacts.mockResolvedValue(new Map());
    mockGetApprovedRule.mockResolvedValue(null);
    mockFindCooldown.mockResolvedValue(null);
    mockFindActive.mockResolvedValue(null);
    mockInsert.mockImplementation(async (input) => ({
      id: `proposal-${input.sliceKey}`,
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
      rejectedBy: null,
      rejectedAt: null,
      cooldownUntil: null,
      createdAt: new Date("2026-06-21"),
    }));
  });

  it("loads global evaluated corpus and persists new proposals", async () => {
    mockListEvaluated.mockResolvedValue(makeVisualOverloadSliceRows(3));

    const result = await generateAndPersistClientLearningProposals();

    expect(mockListEvaluated).toHaveBeenCalledWith({});
    expect(mockFindActive).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(result.generated).toBe(1);
    expect(result.proposals).toHaveLength(1);
  });

  it("skips slices with an active proposal", async () => {
    mockListEvaluated.mockResolvedValue(makeVisualOverloadSliceRows(3));
    mockFindActive.mockResolvedValue({
      id: "existing-proposal",
      status: "proposed",
    } as never);

    const result = await generateAndPersistClientLearningProposals();

    expect(mockInsert).not.toHaveBeenCalled();
    expect(result.generated).toBe(0);
    expect(result.proposals).toHaveLength(0);
  });

  it("passes optional workspace and cohort filters", async () => {
    mockListEvaluated.mockResolvedValue([]);

    await generateAndPersistClientLearningProposals({
      workspaceId: "ws-filter",
      cohort: "post_learning",
    });

    expect(mockListEvaluated).toHaveBeenCalledWith({
      workspaceId: "ws-filter",
      cohort: "post_learning",
    });
  });

  it("skips slices in reject cooldown", async () => {
    mockListEvaluated.mockResolvedValue(makeVisualOverloadSliceRows(3));
    mockFindCooldown.mockResolvedValue({
      id: "rejected-proposal",
      status: "rejected",
      cooldownUntil: new Date("2099-07-01"),
    } as never);

    const result = await generateAndPersistClientLearningProposals();

    expect(mockInsert).not.toHaveBeenCalled();
    expect(result.generated).toBe(0);
  });

  it("does not repropose an expired rejection from old evaluations or replayed item ids", async () => {
    const rows = makeVisualOverloadSliceRows(3);
    mockListEvaluated.mockResolvedValue(rows);
    mockFindCooldown.mockResolvedValue({
      status: "rejected", rejectedAt: new Date("2026-06-10"),
      cooldownUntil: new Date("2026-07-10"),
      evidenceRefs: { corpusItemIds: rows.map(row => row.item.id) },
    } as never);
    expect((await generateAndPersistClientLearningProposals()).generated).toBe(0);
    mockListEvaluated.mockResolvedValue(rows.map(row => ({ ...row,
      evaluation: { ...row.evaluation, createdAt: new Date("2026-07-11") },
    })));
    expect((await generateAndPersistClientLearningProposals()).generated).toBe(0);
  });

  it("rebuilds the slice from independent evidence strictly after rejection", async () => {
    const rows = makeVisualOverloadSliceRows(3).map(row => ({ ...row,
      evaluation: { ...row.evaluation, createdAt: new Date("2026-07-11") },
    }));
    mockListEvaluated.mockResolvedValue(rows);
    mockFindCooldown.mockResolvedValue({
      status: "rejected", rejectedAt: new Date("2026-06-10"),
      cooldownUntil: new Date("2026-07-10"), evidenceRefs: { corpusItemIds: ["old-item"] },
    } as never);
    const result = await generateAndPersistClientLearningProposals();
    expect(result.generated).toBe(1);
    expect(result.proposals[0].evidenceRefs.corpusItemIds).toEqual(["item-1", "item-2", "item-3"]);
  });

  it("does not renew rejected support when the Peças return with new corpus ids and versions", async () => {
    const old = makeVisualOverloadSliceRows(3);
    mockFindCooldown.mockResolvedValue({ status: "rejected", rejectedAt: new Date("2026-06-10"),
      cooldownUntil: new Date("2026-07-10"), evidenceRefs: { corpusItemIds: old.map(row => row.item.id) } } as never);
    mockListEvaluated.mockResolvedValue(old.map(row => ({ ...row,
      item: { ...row.item, id: `recaptured-${row.item.id}`, corpusVersion: 2 },
      evaluation: { ...row.evaluation, createdAt: new Date("2026-07-11") },
    })));
    expect((await generateAndPersistClientLearningProposals()).generated).toBe(0);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("uses the post-rejection thresholds even when historical divergence cancels the new support", async () => {
    const old = makeVisualOverloadSliceRows(3).map(row => ({ ...row,
      item: { ...row.item, id: `old-${row.item.id}`, derivationId: `deriv-old-${row.item.id}`, qualitySnapshot: { qualityScore: 20, qualityVerdict: "pass" } },
    }));
    const fresh = makeVisualOverloadSliceRows(3).map(row => ({ ...row,
      evaluation: { ...row.evaluation, createdAt: new Date("2026-07-11") },
    }));
    mockListEvaluated.mockResolvedValue([...old, ...fresh]);
    mockFindCooldown.mockResolvedValue({
      status: "rejected", rejectedAt: new Date("2026-06-10"), cooldownUntil: new Date("2026-07-10"),
      evidenceRefs: { corpusItemIds: old.map(row => row.item.id) },
    } as never);
    const result = await generateAndPersistClientLearningProposals();
    expect(result.generated).toBe(1);
    expect(result.proposals[0].evidenceRefs.stats).toMatchObject({ count: 3, meanSignedDelta: 18 });
  });

  it.each([["2026-06-09", 0], ["2026-06-10", 0], ["2026-06-11", 1]] as const)("only counts new evidence strictly after the rejection: %s", async (date, generated) => {
    mockListEvaluated.mockResolvedValue(makeVisualOverloadSliceRows(3).map(row => ({ ...row,
      evaluation: { ...row.evaluation, createdAt: new Date(date) },
    })));
    mockFindCooldown.mockResolvedValue({ status: "rejected", rejectedAt: new Date("2026-06-10"),
      cooldownUntil: new Date("2026-07-10"), evidenceRefs: { corpusItemIds: ["old-item"] } } as never);
    expect((await generateAndPersistClientLearningProposals()).generated).toBe(generated);
  });

  it("skips when approved corpus_quality rule exists without post-approval evals", async () => {
    mockListEvaluated.mockResolvedValue(
      makeVisualOverloadSliceRows(3).map((row) => ({
        ...row,
        evaluation: {
          ...row.evaluation,
          createdAt: new Date("2026-06-01"),
        },
      }))
    );
    mockGetApprovedRule.mockResolvedValue({
      id: "rule-1",
      approvedAt: new Date("2026-06-15"),
    } as never);

    const result = await generateAndPersistClientLearningProposals();

    expect(mockInsert).not.toHaveBeenCalled();
    expect(result.generated).toBe(0);
  });

  it("allows proposal when 3+ evaluations exist after rule approval", async () => {
    mockListEvaluated.mockResolvedValue(makeVisualOverloadSliceRows(3));
    mockGetApprovedRule.mockResolvedValue({
      id: "rule-1",
      approvedAt: new Date("2026-06-01"),
    } as never);

    const result = await generateAndPersistClientLearningProposals();

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(result.generated).toBe(1);
  });
});
