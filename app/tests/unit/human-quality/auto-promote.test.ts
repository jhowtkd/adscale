import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/human-quality/candidate-promotion", () => ({
  promoteCorpusCandidateToQueue: vi.fn(),
}));

import { autoPromoteCandidate } from "@/server/human-quality/auto-promote";
import { promoteCorpusCandidateToQueue } from "@/server/human-quality/candidate-promotion";

const mockPromote = vi.mocked(promoteCorpusCandidateToQueue);

describe("autoPromoteCandidate", () => {
  it("promotes with baseline cohort and autoPromoted flag", async () => {
    mockPromote.mockResolvedValue({
      candidate: { id: "c1" } as never,
      item: { id: "i1", autoPromoted: true } as never,
      created: true,
    });

    const result = await autoPromoteCandidate({ candidateId: "c1" });

    expect(mockPromote).toHaveBeenCalledWith({
      candidateId: "c1",
      cohort: "baseline",
      autoPromoted: true,
      selectedByUserId: undefined,
    });
    expect(result.created).toBe(true);
  });

  it("returns existing item without error when already promoted", async () => {
    mockPromote.mockResolvedValue({
      candidate: { id: "c1" } as never,
      item: { id: "i1" } as never,
      created: false,
    });

    const result = await autoPromoteCandidate({ candidateId: "c1" });
    expect(result.created).toBe(false);
  });
});
