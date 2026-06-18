import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/repositories/human-quality-corpus", () => ({
  listEvaluatedCorpusWithEvaluations: vi.fn(),
}));

import { listEvaluatedCorpusWithEvaluations } from "@/server/repositories/human-quality-corpus";
import { runQualityTrend, TREND_MAX_ROWS } from "@/server/human-quality/trend/service";

const mockList = vi.mocked(listEvaluatedCorpusWithEvaluations);

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const CLIENT_PROFILE_ID = "660e8400-e29b-41d4-a716-446655440003";
const CAPTURED_AT = "2026-06-18T12:00:00.000Z";

function makeRow(index: number) {
  return {
    item: {
      id: `item-${index}`,
      workspaceId: WORKSPACE_ID,
      status: "evaluated" as const,
      cohort: "baseline",
      generationMode: "art_variation",
      format: "1:1",
      clientProfileId: CLIENT_PROFILE_ID,
      selectedAt: new Date("2026-06-01"),
    },
    evaluation: {
      id: `eval-${index}`,
      corpusItemId: `item-${index}`,
      visualScore: 72,
      factualPass: true,
      primaryFailureReason: "visual_overload" as const,
      createdAt: new Date("2026-06-10T10:00:00.000Z"),
    },
  };
}

describe("runQualityTrend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([]);
  });

  it("passes dimensional filters and limit to repository", async () => {
    await runQualityTrend({
      workspaceId: WORKSPACE_ID,
      cohort: "baseline",
      generationMode: "art_variation",
      format: "1:1",
      clientProfileId: CLIENT_PROFILE_ID,
      primaryFailureReason: "visual_overload",
      capturedAt: CAPTURED_AT,
    });

    expect(mockList).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      cohort: "baseline",
      generationMode: "art_variation",
      format: "1:1",
      clientProfileId: CLIENT_PROFILE_ID,
      primaryFailureReason: "visual_overload",
      limit: TREND_MAX_ROWS,
    });
  });

  it("returns report with capturedAt and evidenceSource live_human", async () => {
    mockList.mockResolvedValue([makeRow(1)]);

    const { report } = await runQualityTrend({ capturedAt: CAPTURED_AT });

    expect(report.capturedAt).toBe(CAPTURED_AT);
    expect(report.evidenceSource).toBe("live_human");
    expect(report.evaluatedItemCount).toBe(1);
  });

  it("sets truncated when row count equals TREND_MAX_ROWS", async () => {
    mockList.mockResolvedValue(
      Array.from({ length: TREND_MAX_ROWS }, (_, index) => makeRow(index))
    );

    const { report } = await runQualityTrend({ capturedAt: CAPTURED_AT });

    expect(report.truncated).toBe(true);
  });

  it("does not set truncated when row count is below TREND_MAX_ROWS", async () => {
    mockList.mockResolvedValue([makeRow(1), makeRow(2)]);

    const { report } = await runQualityTrend({ capturedAt: CAPTURED_AT });

    expect(report.truncated).toBeUndefined();
  });
});
