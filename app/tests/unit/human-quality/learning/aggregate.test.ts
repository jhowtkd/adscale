import { describe, expect, it } from "vitest";

import { buildCompositeSliceKey } from "@/server/human-quality/calibration/aggregate";
import type { EvaluatedCorpusRow } from "@/server/human-quality/calibration/types";
import { buildClientLearningProposals } from "@/server/human-quality/learning/aggregate";
import type { HumanQualityCorpusItem, HumanQualityEvaluation } from "@/server/db/schema";

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
      }
    )
  );
}

describe("buildClientLearningProposals", () => {
  it("proposes when slice has 3+ evaluations and |meanSignedDelta| >= 15", () => {
    const rows = makeVisualOverloadSliceRows(3);
    const proposals = buildClientLearningProposals(rows);

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      primaryFailureReason: "visual_overload",
      sliceKey: `ws-1:profile-1:${buildCompositeSliceKey(
        "visual_overload",
        "art_variation",
        "1:1"
      )}`,
    });
    expect(proposals[0].rationale).toMatch(/dominant hook|information zones/i);
    expect(proposals[0].evidenceRefs.corpusItemIds).toEqual([
      "item-1",
      "item-2",
      "item-3",
    ]);
    expect(proposals[0].evidenceRefs.stats.meanSignedDelta).toBe(18);
    expect(proposals[0].evidenceRefs.stats.count).toBe(3);
  });

  it("skips when fewer than 3 evaluations", () => {
    const proposals = buildClientLearningProposals(makeVisualOverloadSliceRows(2));
    expect(proposals).toHaveLength(0);
  });

  it("skips when meanSignedDelta is below divergence threshold", () => {
    const rows = Array.from({ length: 3 }, (_, index) =>
      makeRow(
        {
          id: `item-${index + 1}`,
          qualitySnapshot: { qualityScore: 72, qualityVerdict: "pass" },
        },
        {
          id: `eval-${index + 1}`,
          corpusItemId: `item-${index + 1}`,
          visualScore: 62,
          intent: "reject",
        }
      )
    );

    const proposals = buildClientLearningProposals(rows);
    expect(proposals).toHaveLength(0);
  });

  it("skips when fewer than 2 reject or regenerate intents", () => {
    const rows = Array.from({ length: 3 }, (_, index) =>
      makeRow(
        { id: `item-${index + 1}` },
        {
          id: `eval-${index + 1}`,
          corpusItemId: `item-${index + 1}`,
          intent: index === 0 ? "reject" : "approve",
        }
      )
    );

    const proposals = buildClientLearningProposals(rows);
    expect(proposals).toHaveLength(0);
  });

  it("skips factual_issue slices", () => {
    const rows = Array.from({ length: 3 }, (_, index) =>
      makeRow(
        { id: `item-${index + 1}` },
        {
          id: `eval-${index + 1}`,
          corpusItemId: `item-${index + 1}`,
          primaryFailureReason: "factual_issue",
          factualPass: false,
          intent: "reject",
        }
      )
    );

    const proposals = buildClientLearningProposals(rows);
    expect(proposals).toHaveLength(0);
  });

  it("skips other failure reason without directive text", () => {
    const rows = Array.from({ length: 3 }, (_, index) =>
      makeRow(
        { id: `item-${index + 1}` },
        {
          id: `eval-${index + 1}`,
          corpusItemId: `item-${index + 1}`,
          primaryFailureReason: "other",
          intent: "reject",
        }
      )
    );

    const proposals = buildClientLearningProposals(rows);
    expect(proposals).toHaveLength(0);
  });

  it("groups by workspaceId, clientProfileId, and composite slice key", () => {
    const sharedEval = {
      visualScore: 62,
      intent: "reject" as const,
      primaryFailureReason: "visual_overload" as const,
    };

    const rows: EvaluatedCorpusRow[] = [
      ...Array.from({ length: 3 }, (_, index) =>
        makeRow(
          {
            id: `ws1-${index + 1}`,
            workspaceId: "ws-1",
            clientProfileId: "profile-1",
          },
          {
            id: `eval-ws1-${index + 1}`,
            corpusItemId: `ws1-${index + 1}`,
            ...sharedEval,
          }
        )
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        makeRow(
          {
            id: `ws2-${index + 1}`,
            workspaceId: "ws-2",
            clientProfileId: "profile-2",
            generationMode: "restyling",
            format: "9:16",
          },
          {
            id: `eval-ws2-${index + 1}`,
            corpusItemId: `ws2-${index + 1}`,
            ...sharedEval,
          }
        )
      ),
    ];

    const proposals = buildClientLearningProposals(rows);

    expect(proposals).toHaveLength(2);
    expect(proposals.map((proposal) => proposal.sliceKey).sort()).toEqual(
      [
        `ws-1:profile-1:${buildCompositeSliceKey("visual_overload", "art_variation", "1:1")}`,
        `ws-2:profile-2:${buildCompositeSliceKey("visual_overload", "restyling", "9:16")}`,
      ].sort()
    );
  });

  it("sets fixtureOnly when every slice member is synthetic_fixture", () => {
    const rows = makeVisualOverloadSliceRows(3).map((row) => ({
      ...row,
      sourceLabel: "synthetic_fixture" as const,
    }));

    const proposals = buildClientLearningProposals(rows);

    expect(proposals).toHaveLength(1);
    expect(proposals[0].evidenceRefs.fixtureOnly).toBe(true);
  });

  it("includes artifactIds when feedback artifacts are present", () => {
    const rows = makeVisualOverloadSliceRows(3).map((row, index) => ({
      ...row,
      feedbackArtifactId: `artifact-${index + 1}`,
    }));

    const proposals = buildClientLearningProposals(rows);

    expect(proposals).toHaveLength(1);
    expect(proposals[0].evidenceRefs.artifactIds).toEqual([
      "artifact-1",
      "artifact-2",
      "artifact-3",
    ]);
  });
});
