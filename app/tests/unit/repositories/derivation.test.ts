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
import { createDerivation } from "@/server/repositories/derivation";

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
});
