import { beforeEach, describe, expect, it, vi } from "vitest";

const saveDraft = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work-output-review", () => ({
  saveOutputReviewDraft: saveDraft,
}));

import { saveCreativeWorkOutputReview } from "./save-creative-work-output-review";
import { GENERATION_CREDIT_COSTS } from "@/server/generation/canonical/types";

const baseDraft = {
  action: "refine" as const,
  targetFormat: "4:5" as const,
  instruction: "Aumente o título",
  revisionAssetId: null,
  annotations: [],
};

describe("saveCreativeWorkOutputReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves a scoped draft and returns the canonical credit cost", async () => {
    const draft = {
      ...baseDraft,
      version: 1 as const,
      revision: 1,
      revisionKey: "00000000-0000-4000-8000-000000000001",
    };
    saveDraft.mockResolvedValue({ ok: true, draft });
    const result = await saveCreativeWorkOutputReview({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
      expectedReviewRevision: 0,
      draft: baseDraft,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        draft,
        revisionCreditCost: GENERATION_CREDIT_COSTS.creativeWorkOutput,
      },
    });
    expect(saveDraft).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
      expectedReviewRevision: 0,
      draft: baseDraft,
    });
  });

  it("rejects an invalid draft without touching the repository", async () => {
    const result = await saveCreativeWorkOutputReview({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
      expectedReviewRevision: 0,
      draft: { ...baseDraft, targetFormat: "16:9" as never },
    });
    expect(result).toEqual({ ok: false, error: { code: "invalid_input" } });
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("propagates repository CAS conflicts without a charge", async () => {
    saveDraft.mockResolvedValue({ ok: false, code: "review_conflict" });
    const result = await saveCreativeWorkOutputReview({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
      expectedReviewRevision: 0,
      draft: baseDraft,
    });
    expect(result).toEqual({ ok: false, error: { code: "review_conflict" } });
  });
});
