import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPieceReviewShare } from "./create-piece-review-share";

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
}));

vi.mock("@/server/repositories/share-link", () => ({
  upsertShareLinkForOutput: vi.fn(),
}));

import { getCreativeWork } from "@/server/repositories/creative-work";
import { upsertShareLinkForOutput } from "@/server/repositories/share-link";

const getWork = vi.mocked(getCreativeWork);
const upsert = vi.mocked(upsertShareLinkForOutput);

describe("createPieceReviewShare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
  });

  it("refuses to share a piece that is not a completed version", async () => {
    getWork.mockResolvedValue({
      work: { id: "work-1" },
      outputs: [{ id: "out-1", status: "processing", outputKey: null, versionNumber: 1 }],
      sources: [],
    } as never);

    const result = await createPieceReviewShare({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "out-1",
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "output_not_shareable", status: "processing" },
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("creates a share link frozen to the exact output version", async () => {
    getWork.mockResolvedValue({
      work: { id: "work-1" },
      outputs: [{ id: "out-1", status: "completed", outputKey: "out/a.png", versionNumber: 4 }],
      sources: [],
    } as never);
    upsert.mockResolvedValue({
      token: "share-token",
      expiresAt: new Date("2026-09-15T00:00:00.000Z"),
    } as never);

    const result = await createPieceReviewShare({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "out-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.shareUrl).toBe("https://app.example.com/share/share-token");
    expect(result.value.outputVersion).toBe(4);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      creativeWorkId: "work-1",
      outputId: "out-1",
      outputVersion: 4,
    }));
  });
});
