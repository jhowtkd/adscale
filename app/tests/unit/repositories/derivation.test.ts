import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { db } from "@/server/db";
import { createDerivation, updateDerivationScore } from "@/server/repositories/derivation";

describe("derivation repository", () => {
  const workspaceId = "ws-123";
  const campaignId = "camp-1";

  it("createDerivation inserts with generationMode, variantIndex, ctaText", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-1" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const result = await createDerivation({
      campaignId,
      workspaceId,
      generationMode: "art_variation",
      variantIndex: 2,
      ctaText: "Compre agora",
      format: "1:1",
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId,
        workspaceId,
        generationMode: "art_variation",
        variantIndex: 2,
        ctaText: "Compre agora",
        format: "1:1",
      })
    );
    expect(result).toEqual({ id: "deriv-1" });
  });

  it("createDerivation defaults nullable fields to null", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-2" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    await createDerivation({
      campaignId,
      workspaceId,
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        generationMode: null,
        variantIndex: null,
        ctaText: null,
      })
    );
  });

  it("updateDerivationScore persists score data", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-1", qualityScore: 87 }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    const result = await updateDerivationScore("deriv-1", workspaceId, {
      qualityScore: 87,
      scoreStatus: "analyzed",
      scoreBreakdown: {
        ctaClarity: 90,
        textLegibility: 82,
        briefMatch: 88,
        visualQuality: 85,
        formatFit: 91,
      },
      scoreIssues: ["CTA could be more prominent"],
      regenerationSuggestion: "Make the CTA more prominent while preserving the exact CTA text.",
    });

    expect(result).toEqual({ id: "deriv-1", qualityScore: 87 });
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        qualityScore: 87,
        scoreStatus: "analyzed",
        regenerationSuggestion: "Make the CTA more prominent while preserving the exact CTA text.",
        updatedAt: expect.any(Date),
        scoredAt: expect.any(Date),
      })
    );
  });
});
