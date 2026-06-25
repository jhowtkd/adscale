import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/server/auth/platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/human-quality/candidate-promotion", () => ({
  CorpusCandidatePromotionError: class CorpusCandidatePromotionError extends Error {
    constructor(
      message: string,
      public code: string
    ) {
      super(message);
      this.name = "CorpusCandidatePromotionError";
    }
  },
  promoteCorpusCandidateToQueue: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/platform-owner";
import {
  CorpusCandidatePromotionError,
  promoteCorpusCandidateToQueue,
} from "@/server/human-quality/candidate-promotion";

const CANDIDATE_ID = "550e8400-e29b-41d4-a716-446655440001";
const ITEM_ID = "550e8400-e29b-41d4-a716-446655440099";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockPromote = vi.mocked(promoteCorpusCandidateToQueue);

describe("POST /api/feedback/human-quality-corpus/candidates/[id]/promote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
  });

  it("promotes candidate into pending corpus queue", async () => {
    mockPromote.mockResolvedValue({
      candidate: { id: CANDIDATE_ID },
      item: { id: ITEM_ID, status: "pending" },
      created: true,
    } as never);

    const res = await POST(
      new Request(
        `http://localhost/api/feedback/human-quality-corpus/candidates/${CANDIDATE_ID}/promote`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cohort: "baseline" }),
        }
      ),
      { params: Promise.resolve({ id: CANDIDATE_ID }) }
    );

    expect(res.status).toBe(201);
    expect(mockPromote).toHaveBeenCalledWith({
      candidateId: CANDIDATE_ID,
      cohort: "baseline",
      selectedByUserId: "owner-1",
      sourceLabel: undefined,
    });
  });

  it("passes explicit operator_imported source label", async () => {
    mockPromote.mockResolvedValue({
      candidate: { id: CANDIDATE_ID },
      item: { id: ITEM_ID, status: "pending" },
      created: true,
    } as never);

    const res = await POST(
      new Request(
        `http://localhost/api/feedback/human-quality-corpus/candidates/${CANDIDATE_ID}/promote`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cohort: "baseline", sourceLabel: "operator_imported" }),
        }
      ),
      { params: Promise.resolve({ id: CANDIDATE_ID }) }
    );

    expect(res.status).toBe(201);
    expect(mockPromote).toHaveBeenCalledWith({
      candidateId: CANDIDATE_ID,
      cohort: "baseline",
      selectedByUserId: "owner-1",
      sourceLabel: "operator_imported",
    });
  });

  it("passes explicit real_customer source label", async () => {
    mockPromote.mockResolvedValue({
      candidate: { id: CANDIDATE_ID },
      item: { id: ITEM_ID, status: "pending" },
      created: true,
    } as never);

    const res = await POST(
      new Request(
        `http://localhost/api/feedback/human-quality-corpus/candidates/${CANDIDATE_ID}/promote`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cohort: "post_learning", sourceLabel: "real_customer" }),
        }
      ),
      { params: Promise.resolve({ id: CANDIDATE_ID }) }
    );

    expect(res.status).toBe(201);
    expect(mockPromote).toHaveBeenCalledWith({
      candidateId: CANDIDATE_ID,
      cohort: "post_learning",
      selectedByUserId: "owner-1",
      sourceLabel: "real_customer",
    });
  });

  it("rejects invalid source labels with validation error", async () => {
    const res = await POST(
      new Request(
        `http://localhost/api/feedback/human-quality-corpus/candidates/${CANDIDATE_ID}/promote`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cohort: "baseline", sourceLabel: "not_a_label" }),
        }
      ),
      { params: Promise.resolve({ id: CANDIDATE_ID }) }
    );

    expect(res.status).toBe(400);
    expect(mockPromote).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });

  it("maps promotion invalid_source_label to 400", async () => {
    mockPromote.mockRejectedValue(
      new CorpusCandidatePromotionError(
        "sourceLabel must be one of: operator_imported, real_customer",
        "invalid_source_label"
      )
    );

    const res = await POST(
      new Request(
        `http://localhost/api/feedback/human-quality-corpus/candidates/${CANDIDATE_ID}/promote`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cohort: "baseline", sourceLabel: "synthetic_fixture" }),
        }
      ),
      { params: Promise.resolve({ id: CANDIDATE_ID }) }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_source_label");
  });
});
