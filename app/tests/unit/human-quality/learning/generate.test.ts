import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/human-quality-corpus", () => ({
  listEvaluatedCorpusWithEvaluations: vi.fn(),
}));

vi.mock("@/server/repositories/client-learning-proposal", () => ({
  findActiveProposalBySlice: vi.fn(),
  insertClientLearningProposal: vi.fn(),
}));

import {
  findActiveProposalBySlice,
  insertClientLearningProposal,
} from "@/server/repositories/client-learning-proposal";
import { listEvaluatedCorpusWithEvaluations } from "@/server/repositories/human-quality-corpus";
import { generateAndPersistClientLearningProposals } from "@/server/human-quality/learning/generate";
import type { EvaluatedCorpusRow } from "@/server/human-quality/calibration/types";
import type { HumanQualityCorpusItem, HumanQualityEvaluation } from "@/server/db/schema";

const mockListEvaluated = vi.mocked(listEvaluatedCorpusWithEvaluations);
const mockFindActive = vi.mocked(findActiveProposalBySlice);
const mockInsert = vi.mocked(insertClientLearningProposal);

function makeItem(overrides: Partial<HumanQualityCorpusItem> = {}): HumanQualityCorpusItem {
  return {
    id: "item-1",
    workspaceId: "ws-1",
    clientProfileId: "profile-1",
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
});
