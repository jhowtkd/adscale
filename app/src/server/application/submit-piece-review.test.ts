import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitPieceReview } from "./submit-piece-review";

vi.mock("@/lib/share-token", () => ({
  resolveShareToken: vi.fn(),
}));

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
}));

vi.mock("@/server/repositories/piece-review", () => ({
  insertPieceReviewComment: vi.fn(),
  listPieceReviewComments: vi.fn(),
}));

import { resolveShareToken } from "@/lib/share-token";
import { getCreativeWork } from "@/server/repositories/creative-work";
import { insertPieceReviewComment, listPieceReviewComments } from "@/server/repositories/piece-review";

const resolve = vi.mocked(resolveShareToken);
const getWork = vi.mocked(getCreativeWork);
const insert = vi.mocked(insertPieceReviewComment);
const list = vi.mocked(listPieceReviewComments);

const validLink = {
  status: "valid" as const,
  link: {
    id: "link-1",
    campaignId: null,
    workspaceId: "ws-1",
    derivationIds: [],
    creativeWorkId: "work-1",
    outputId: "out-1",
    outputVersion: 2,
    expiresAt: new Date("2026-09-15T00:00:00.000Z"),
  },
};

describe("submitPieceReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWork.mockResolvedValue({
      work: { id: "work-1" },
      outputs: [{ id: "out-1", quality: { schemaVersion: 1, objectiveVerdict: "pass" } }],
      sources: [],
    } as never);
    insert.mockImplementation(async (row) => ({ id: "c-1", shareLinkId: "link-1", ...row } as never));
    list.mockResolvedValue([{ id: "c-1", outputVersion: 2 } as never]);
  });

  it("rejects expired links and pieces outside the authorized package", async () => {
    resolve.mockResolvedValue({ status: "expired" });
    expect((await submitPieceReview({
      token: "t",
      requestedOutputId: "out-1",
      authorLabel: "Ana",
      decision: "comment",
      body: "ok",
    })).error).toEqual({ code: "share_unavailable" });

    resolve.mockResolvedValue(validLink);
    expect((await submitPieceReview({
      token: "t",
      requestedOutputId: "out-other",
      authorLabel: "Ana",
      decision: "comment",
      body: "ok",
    })).error).toEqual({ code: "package_forbidden" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("blocks external approval when the objective check already failed", async () => {
    resolve.mockResolvedValue(validLink);
    getWork.mockResolvedValue({
      work: { id: "work-1" },
      outputs: [{ id: "out-1", quality: { schemaVersion: 1, objectiveVerdict: "fail" } }],
      sources: [],
    } as never);

    const result = await submitPieceReview({
      token: "t",
      requestedOutputId: "out-1",
      authorLabel: "Ana",
      decision: "approve",
    });

    expect(result).toEqual({ ok: false, error: { code: "objective_rejection" } });
    expect(insert).not.toHaveBeenCalled();
  });

  it("stores a comment on the frozen version", async () => {
    resolve.mockResolvedValue(validLink);
    const result = await submitPieceReview({
      token: "t",
      requestedOutputId: "out-1",
      authorLabel: "Ana",
      decision: "request_changes",
      body: "Headline cobriu o logo",
      area: { x: 0.1, y: 0.05, width: 0.8, height: 0.2 },
    });

    expect(result.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      shareLinkId: "link-1",
      outputId: "out-1",
      outputVersion: 2,
      decision: "request_changes",
      authorLabel: "Ana",
    }));
  });
});
