import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/repositories/human-quality-candidate", () => ({
  getCorpusCandidateById: vi.fn(),
  markCorpusCandidatePromoted: vi.fn(),
}));

vi.mock("@/server/repositories/human-quality-corpus", () => ({
  findCorpusItemByDerivationVersion: vi.fn(),
  getCorpusItemByIdAnyWorkspace: vi.fn(),
  insertCorpusItem: vi.fn(),
}));

import {
  getCorpusCandidateById,
  markCorpusCandidatePromoted,
} from "@/server/repositories/human-quality-candidate";
import {
  findCorpusItemByDerivationVersion,
  getCorpusItemByIdAnyWorkspace,
  insertCorpusItem,
} from "@/server/repositories/human-quality-corpus";
import { promoteCorpusCandidateToQueue } from "@/server/human-quality/candidate-promotion";

const CANDIDATE_ID = "550e8400-e29b-41d4-a716-446655440001";
const ITEM_ID = "550e8400-e29b-41d4-a716-446655440099";
const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";

const candidate = {
  id: CANDIDATE_ID,
  workspaceId: WORKSPACE_ID,
  clientProfileId: "550e8400-e29b-41d4-a716-446655440010",
  campaignId: "550e8400-e29b-41d4-a716-446655440003",
  derivationId: "550e8400-e29b-41d4-a716-446655440004",
  generationMode: "art_variation",
  format: "1:1",
  corpusVersion: 1,
  sourceLabel: "real_customer",
  artifactRef: { derivationId: "550e8400-e29b-41d4-a716-446655440004" },
  qualitySnapshot: { qualityScore: 72 },
  promotedCorpusItemId: null,
};

describe("promoteCorpusCandidateToQueue", () => {
  const mockGetCandidate = vi.mocked(getCorpusCandidateById);
  const mockMarkPromoted = vi.mocked(markCorpusCandidatePromoted);
  const mockFindItem = vi.mocked(findCorpusItemByDerivationVersion);
  const mockGetItem = vi.mocked(getCorpusItemByIdAnyWorkspace);
  const mockInsert = vi.mocked(insertCorpusItem);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCandidate.mockResolvedValue(candidate as never);
    mockFindItem.mockResolvedValue(null);
    mockInsert.mockResolvedValue({ id: ITEM_ID, status: "pending" } as never);
    mockMarkPromoted.mockImplementation(async (id, corpusItemId) => ({
      ...candidate,
      id,
      promotedCorpusItemId: corpusItemId,
    }));
  });

  it("creates pending corpus item in requested cohort", async () => {
    const result = await promoteCorpusCandidateToQueue({
      candidateId: CANDIDATE_ID,
      cohort: "post_learning",
      selectedByUserId: "owner-1",
    });

    expect(result.created).toBe(true);
    expect(result.item.id).toBe(ITEM_ID);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ cohort: "post_learning", selectedByUserId: "owner-1" })
    );
    expect(mockMarkPromoted).toHaveBeenCalledWith(CANDIDATE_ID, ITEM_ID);
  });

  it("returns existing corpus item without duplicating rows", async () => {
    mockFindItem.mockResolvedValue({ id: ITEM_ID, status: "pending" } as never);

    const result = await promoteCorpusCandidateToQueue({
      candidateId: CANDIDATE_ID,
      cohort: "baseline",
      selectedByUserId: "owner-1",
    });

    expect(result.created).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockMarkPromoted).toHaveBeenCalledWith(CANDIDATE_ID, ITEM_ID);
  });

  it("reuses linked corpus item when candidate already promoted", async () => {
    mockGetCandidate.mockResolvedValue({
      ...candidate,
      promotedCorpusItemId: ITEM_ID,
    } as never);
    mockGetItem.mockResolvedValue({ id: ITEM_ID, status: "pending" } as never);

    const result = await promoteCorpusCandidateToQueue({
      candidateId: CANDIDATE_ID,
      cohort: "baseline",
      selectedByUserId: "owner-1",
    });

    expect(result.created).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
