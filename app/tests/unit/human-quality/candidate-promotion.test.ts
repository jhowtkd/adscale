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
    expect(mockMarkPromoted).toHaveBeenCalledWith(CANDIDATE_ID, ITEM_ID, undefined);
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

  it("preserves the candidate source label when none is supplied", async () => {
    await promoteCorpusCandidateToQueue({
      candidateId: CANDIDATE_ID,
      cohort: "baseline",
      selectedByUserId: "owner-1",
    });

    expect(mockMarkPromoted).toHaveBeenCalledWith(CANDIDATE_ID, ITEM_ID, undefined);
  });

  it("applies explicit operator_imported source label", async () => {
    await promoteCorpusCandidateToQueue({
      candidateId: CANDIDATE_ID,
      cohort: "baseline",
      selectedByUserId: "owner-1",
      sourceLabel: "operator_imported",
    });

    expect(mockMarkPromoted).toHaveBeenCalledWith(CANDIDATE_ID, ITEM_ID, {
      sourceLabel: "operator_imported",
    });
  });

  it("applies explicit real_customer source label", async () => {
    mockGetCandidate.mockResolvedValue({
      ...candidate,
      sourceLabel: "operator_imported",
    } as never);

    await promoteCorpusCandidateToQueue({
      candidateId: CANDIDATE_ID,
      cohort: "baseline",
      selectedByUserId: "owner-1",
      sourceLabel: "real_customer",
    });

    expect(mockMarkPromoted).toHaveBeenCalledWith(CANDIDATE_ID, ITEM_ID, {
      sourceLabel: "real_customer",
    });
  });

  it("rejects invalid explicit source labels", async () => {
    await expect(
      promoteCorpusCandidateToQueue({
        candidateId: CANDIDATE_ID,
        cohort: "baseline",
        sourceLabel: "not_a_label",
      })
    ).rejects.toMatchObject({ code: "invalid_source_label" });
  });

  it("rejects synthetic_fixture unless the candidate already has it", async () => {
    await expect(
      promoteCorpusCandidateToQueue({
        candidateId: CANDIDATE_ID,
        cohort: "baseline",
        sourceLabel: "synthetic_fixture",
      })
    ).rejects.toMatchObject({ code: "invalid_source_label" });
  });

  it("rejects candidates missing clientProfileId even with explicit source label", async () => {
    mockGetCandidate.mockResolvedValue({
      ...candidate,
      clientProfileId: null,
    } as never);

    await expect(
      promoteCorpusCandidateToQueue({
        candidateId: CANDIDATE_ID,
        cohort: "baseline",
        sourceLabel: "real_customer",
      })
    ).rejects.toMatchObject({ code: "missing_client_profile" });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("does not mutate workspace, campaign, derivation or clientProfileId when overriding source label", async () => {
    await promoteCorpusCandidateToQueue({
      candidateId: CANDIDATE_ID,
      cohort: "post_learning",
      selectedByUserId: "owner-1",
      sourceLabel: "operator_imported",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        clientProfileId: candidate.clientProfileId,
        campaignId: candidate.campaignId,
        derivationId: candidate.derivationId,
        cohort: "post_learning",
      })
    );
  });
});
