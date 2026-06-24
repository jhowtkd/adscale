import { describe, expect, it } from "vitest";

import { buildCompositeSliceKey } from "@/server/human-quality/calibration/aggregate";
import type { EvaluatedCorpusRow } from "@/server/human-quality/calibration/types";
import { buildClientLearningProposals } from "@/server/human-quality/learning/aggregate";
import { buildFactualIssueAlerts } from "@/server/human-quality/learning/factual-alerts";
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
    factualPass: false,
    intent: "reject",
    primaryFailureReason: "factual_issue",
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

function makeFactualIssueSliceRows(count: number): EvaluatedCorpusRow[] {
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
        factualPass: false,
        primaryFailureReason: "factual_issue",
        intent: index < 2 ? "reject" : "regenerate",
      }
    )
  );
}

describe("buildFactualIssueAlerts", () => {
  it("returns factual_issue slices meeting count and divergence thresholds", () => {
    const rows = makeFactualIssueSliceRows(3);
    const alerts = buildFactualIssueAlerts(rows);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      sliceKey: `ws-1:profile-1:${buildCompositeSliceKey(
        "factual_issue",
        "art_variation",
        "1:1"
      )}`,
      rationale: "factual_guard_review_required",
    });
    expect(alerts[0].evidenceRefs.corpusItemIds).toEqual([
      "item-1",
      "item-2",
      "item-3",
    ]);
    expect(alerts[0].evidenceRefs.stats.meanSignedDelta).toBe(18);
  });

  it("skips slices below MIN_SLICE_SAMPLE", () => {
    const alerts = buildFactualIssueAlerts(makeFactualIssueSliceRows(2));
    expect(alerts).toHaveLength(0);
  });

  it("skips slices below divergence threshold", () => {
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
          factualPass: false,
          primaryFailureReason: "factual_issue",
          intent: "reject",
        }
      )
    );

    const alerts = buildFactualIssueAlerts(rows);
    expect(alerts).toHaveLength(0);
  });

  it("never includes non-factual_issue slices", () => {
    const rows = Array.from({ length: 3 }, (_, index) =>
      makeRow(
        { id: `item-${index + 1}` },
        {
          id: `eval-${index + 1}`,
          corpusItemId: `item-${index + 1}`,
          primaryFailureReason: "visual_overload",
          factualPass: true,
          intent: "reject",
        }
      )
    );

    const alerts = buildFactualIssueAlerts(rows);
    expect(alerts).toHaveLength(0);
  });

  it("does not create client_learning_proposals for factual_issue slices", () => {
    const rows = makeFactualIssueSliceRows(3);
    const proposals = buildClientLearningProposals(rows);
    const alerts = buildFactualIssueAlerts(rows);

    expect(proposals).toHaveLength(0);
    expect(alerts).toHaveLength(1);
  });

  it("includes artifactIds when feedback artifacts are present", () => {
    const rows = makeFactualIssueSliceRows(3).map((row, index) => ({
      ...row,
      feedbackArtifactId: `artifact-${index + 1}`,
    }));

    const alerts = buildFactualIssueAlerts(rows);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].evidenceRefs.artifactIds).toEqual([
      "artifact-1",
      "artifact-2",
      "artifact-3",
    ]);
  });
});
