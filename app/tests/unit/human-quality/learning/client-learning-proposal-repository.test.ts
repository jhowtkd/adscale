import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

import { db } from "@/server/db";
import { findSliceInCooldown } from "@/server/repositories/client-learning-proposal";
import { getApprovedCorpusQualityRuleForFailure } from "@/server/repositories/calibration-rule";

describe("client-learning-proposal repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("findSliceInCooldown returns rejected row when cooldownUntil is in the future", async () => {
    const futureCooldown = new Date("2026-07-01T00:00:00.000Z");
    const rejectedRow = {
      id: "proposal-rejected",
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      sliceKey: "ws-1:profile-1:visual_overload|art_variation|1:1",
      status: "rejected",
      cooldownUntil: futureCooldown,
    };

    const mockLimit = vi.fn().mockResolvedValue([rejectedRow]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await findSliceInCooldown(
      "ws-1",
      "profile-1",
      "ws-1:profile-1:visual_overload|art_variation|1:1"
    );

    expect(result).toEqual(rejectedRow);
    expect(mockLimit).toHaveBeenCalledWith(1);
  });

  it("findSliceInCooldown returns null when cooldown expired or no rejected row", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await findSliceInCooldown(
      "ws-1",
      "profile-1",
      "ws-1:profile-1:visual_overload|art_variation|1:1"
    );

    expect(result).toBeNull();
  });
});

describe("calibration-rule repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getApprovedCorpusQualityRuleForFailure returns rule when rationale prefix matches", async () => {
    const approvedRule = {
      id: "rule-1",
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      category: "corpus_quality",
      status: "approved",
      rationale: "visual_overload: Máx. 3 zonas de informação",
      approvedAt: new Date("2026-06-10"),
    };

    const mockLimit = vi.fn().mockResolvedValue([approvedRule]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await getApprovedCorpusQualityRuleForFailure({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      primaryFailureReason: "visual_overload",
    });

    expect(result).toEqual(approvedRule);
    expect(mockLimit).toHaveBeenCalledWith(1);
  });

  it("getApprovedCorpusQualityRuleForFailure returns null when no matching rule", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await getApprovedCorpusQualityRuleForFailure({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      primaryFailureReason: "visual_overload",
    });

    expect(result).toBeNull();
  });
});
