import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

import { db } from "@/server/db";
import { listRejectedProposalsBySlice } from "@/server/repositories/client-learning-proposal";
import { getApprovedCorpusQualityRuleForFailure } from "@/server/repositories/calibration-rule";

describe("client-learning-proposal repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listRejectedProposalsBySlice returns rejection history without a window limit", async () => {
    const futureCooldown = new Date("2026-07-01T00:00:00.000Z");
    const rejectedRow = {
      id: "proposal-rejected",
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      sliceKey: "ws-1:profile-1:visual_overload|art_variation|1:1",
      status: "rejected",
      cooldownUntil: futureCooldown,
    };

    const olderRow = { ...rejectedRow, id: "older-rejection", cooldownUntil: new Date("2026-06-01") };
    const mockOrderBy = vi.fn().mockResolvedValue([rejectedRow, olderRow]);
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await listRejectedProposalsBySlice(
      "ws-1",
      "profile-1",
      "ws-1:profile-1:visual_overload|art_variation|1:1"
    );

    expect(result).toEqual([rejectedRow, olderRow]);
  });

  it("listRejectedProposalsBySlice returns an empty history when no rejected row exists", async () => {
    const mockOrderBy = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await listRejectedProposalsBySlice(
      "ws-1",
      "profile-1",
      "ws-1:profile-1:visual_overload|art_variation|1:1"
    );

    expect(result).toEqual([]);
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
