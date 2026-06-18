import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
}));

import { db } from "@/server/db";
import { listEvaluatedCorpusWithEvaluations } from "@/server/repositories/human-quality-corpus";

function mockEvaluatedQuery(rows: unknown[]) {
  const mockLimit = vi.fn().mockResolvedValue(rows);
  const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
  const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
  const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

  return { mockWhere, mockLimit, mockInnerJoin };
}

describe("listEvaluatedCorpusWithEvaluations", () => {
  const workspaceA = "ws-a";
  const workspaceB = "ws-b";

  const evaluatedRow = {
    item: {
      id: "item-1",
      workspaceId: workspaceA,
      status: "evaluated",
      cohort: "baseline",
      generationMode: "art_variation",
      format: "1:1",
      selectedAt: new Date("2026-06-01"),
    },
    evaluation: {
      id: "eval-1",
      corpusItemId: "item-1",
      visualScore: 72,
      factualPass: true,
      primaryFailureReason: "other",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns evaluated corpus rows joined with evaluations", async () => {
    const { mockWhere } = mockEvaluatedQuery([evaluatedRow]);

    const rows = await listEvaluatedCorpusWithEvaluations();

    expect(rows).toHaveLength(1);
    expect(rows[0].item.status).toBe("evaluated");
    expect(rows[0].evaluation.corpusItemId).toBe("item-1");
    expect(mockWhere).toHaveBeenCalled();
  });

  it("aggregates across workspaces when workspaceId is omitted", async () => {
    const { mockWhere } = mockEvaluatedQuery([
      evaluatedRow,
      {
        ...evaluatedRow,
        item: { ...evaluatedRow.item, id: "item-2", workspaceId: workspaceB },
        evaluation: { ...evaluatedRow.evaluation, id: "eval-2", corpusItemId: "item-2" },
      },
    ]);

    const rows = await listEvaluatedCorpusWithEvaluations();

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.item.workspaceId).sort()).toEqual([workspaceA, workspaceB].sort());
    expect(mockWhere).toHaveBeenCalled();
  });

  it("scopes to a workspace when workspaceId filter is provided", async () => {
    const { mockWhere } = mockEvaluatedQuery([evaluatedRow]);

    const rows = await listEvaluatedCorpusWithEvaluations({ workspaceId: workspaceA });

    expect(rows).toHaveLength(1);
    expect(rows[0].item.workspaceId).toBe(workspaceA);
    expect(mockWhere).toHaveBeenCalled();
  });

  it("narrows results when cohort filter is provided", async () => {
    const { mockWhere } = mockEvaluatedQuery([
      {
        ...evaluatedRow,
        item: { ...evaluatedRow.item, cohort: "post_learning" },
      },
    ]);

    const rows = await listEvaluatedCorpusWithEvaluations({ cohort: "post_learning" });

    expect(rows[0].item.cohort).toBe("post_learning");
    expect(mockWhere).toHaveBeenCalled();
  });

  it("does not include pending items in evaluated query results", async () => {
    mockEvaluatedQuery([]);

    const rows = await listEvaluatedCorpusWithEvaluations({ workspaceId: workspaceA });

    expect(rows).toEqual([]);
  });

  it("caps default limit to prevent unbounded payloads", async () => {
    const { mockLimit } = mockEvaluatedQuery([]);

    await listEvaluatedCorpusWithEvaluations();

    expect(mockLimit).toHaveBeenCalledWith(500);
  });

  it("narrows results when generationMode filter is provided", async () => {
    const { mockWhere } = mockEvaluatedQuery([
      {
        ...evaluatedRow,
        item: { ...evaluatedRow.item, generationMode: "restyling" },
      },
    ]);

    const rows = await listEvaluatedCorpusWithEvaluations({
      generationMode: "restyling",
    });

    expect(rows[0].item.generationMode).toBe("restyling");
    expect(mockWhere).toHaveBeenCalled();
  });

  it("narrows results when format filter is provided", async () => {
    const { mockWhere } = mockEvaluatedQuery([
      {
        ...evaluatedRow,
        item: { ...evaluatedRow.item, format: "4:5" },
      },
    ]);

    const rows = await listEvaluatedCorpusWithEvaluations({ format: "4:5" });

    expect(rows[0].item.format).toBe("4:5");
    expect(mockWhere).toHaveBeenCalled();
  });

  it("narrows results when clientProfileId filter is provided", async () => {
    const profileId = "770e8400-e29b-41d4-a716-446655440004";
    const { mockWhere } = mockEvaluatedQuery([
      {
        ...evaluatedRow,
        item: { ...evaluatedRow.item, clientProfileId: profileId },
      },
    ]);

    const rows = await listEvaluatedCorpusWithEvaluations({
      clientProfileId: profileId,
    });

    expect(rows[0].item.clientProfileId).toBe(profileId);
    expect(mockWhere).toHaveBeenCalled();
  });

  it("narrows results when primaryFailureReason filter is provided", async () => {
    const { mockWhere } = mockEvaluatedQuery([
      {
        ...evaluatedRow,
        evaluation: {
          ...evaluatedRow.evaluation,
          primaryFailureReason: "weak_hierarchy",
        },
      },
    ]);

    const rows = await listEvaluatedCorpusWithEvaluations({
      primaryFailureReason: "weak_hierarchy",
    });

    expect(rows[0].evaluation.primaryFailureReason).toBe("weak_hierarchy");
    expect(mockWhere).toHaveBeenCalled();
  });
});
