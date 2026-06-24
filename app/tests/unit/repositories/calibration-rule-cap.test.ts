import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CalibrationRule } from "@/server/db/schema";

vi.mock("@/server/brand-taste/calibration-rules", () => ({
  deprecateCalibrationRule: vi.fn(),
}));

import { deprecateCalibrationRule } from "@/server/brand-taste/calibration-rules";
import { enforceCorpusQualityRuleCap } from "@/server/human-quality/learning/corpus-quality-cap";

const mockDeprecate = vi.mocked(deprecateCalibrationRule);

function corpusRule(
  id: string,
  approvedAt: string,
  createdAt = approvedAt
): CalibrationRule {
  return {
    id,
    workspaceId: "ws-1",
    clientProfileId: "profile-1",
    category: "corpus_quality",
    status: "approved",
    rationale: `Rule ${id}`,
    supportingSignalIds: [],
    confidence: "medium",
    caveats: [],
    mismatchBucket: null,
    version: 1,
    approvedAt: new Date(approvedAt),
    approvedBy: "user-1",
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
  };
}

describe("enforceCorpusQualityRuleCap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeprecate.mockImplementation(async (input) =>
      corpusRule(input.ruleId, "2026-06-20T12:00:00Z")
    );
  });

  it("returns all rules as active when count is at or below maxActive", async () => {
    const rules = Array.from({ length: 10 }, (_, i) =>
      corpusRule(`rule-${i}`, `2026-06-${String(i + 1).padStart(2, "0")}T12:00:00Z`)
    );

    const result = await enforceCorpusQualityRuleCap({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      rules,
    });

    expect(result.active).toHaveLength(10);
    expect(result.deprecatedIds).toEqual([]);
    expect(mockDeprecate).not.toHaveBeenCalled();
  });

  it("deprecates oldest rules when count exceeds maxActive", async () => {
    const rules = Array.from({ length: 11 }, (_, i) =>
      corpusRule(`rule-${i}`, `2026-06-${String(i + 1).padStart(2, "0")}T12:00:00Z`)
    );

    const result = await enforceCorpusQualityRuleCap({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      rules,
    });

    expect(result.deprecatedIds).toEqual(["rule-0"]);
    expect(result.active).toHaveLength(10);
    expect(result.active.map((r) => r.id)).toEqual([
      "rule-1",
      "rule-2",
      "rule-3",
      "rule-4",
      "rule-5",
      "rule-6",
      "rule-7",
      "rule-8",
      "rule-9",
      "rule-10",
    ]);
    expect(mockDeprecate).toHaveBeenCalledTimes(1);
    expect(mockDeprecate).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ruleId: "rule-0",
    });
  });

  it("sorts by approvedAt with createdAt fallback", async () => {
    const rules = [
      corpusRule("newest", "2026-06-20T12:00:00Z"),
      corpusRule("oldest-no-approved", "2026-06-01T12:00:00Z", "2026-06-01T08:00:00Z"),
      ...Array.from({ length: 9 }, (_, i) =>
        corpusRule(`mid-${i}`, `2026-06-${String(i + 10).padStart(2, "0")}T12:00:00Z`)
      ),
    ];

    const result = await enforceCorpusQualityRuleCap({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      rules,
    });

    expect(result.deprecatedIds).toContain("oldest-no-approved");
    expect(result.active.map((r) => r.id)).not.toContain("oldest-no-approved");
  });

  it("deprecates multiple overflow rules when far over cap", async () => {
    const rules = Array.from({ length: 13 }, (_, i) =>
      corpusRule(`rule-${i}`, `2026-06-${String(i + 1).padStart(2, "0")}T12:00:00Z`)
    );

    const result = await enforceCorpusQualityRuleCap({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      rules,
    });

    expect(result.deprecatedIds).toEqual(["rule-0", "rule-1", "rule-2"]);
    expect(result.active).toHaveLength(10);
    expect(mockDeprecate).toHaveBeenCalledTimes(3);
    for (const id of ["rule-0", "rule-1", "rule-2"]) {
      expect(mockDeprecate).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        ruleId: id,
      });
    }
  });
});
