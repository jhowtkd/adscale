import { beforeEach, describe, expect, it, vi } from "vitest";
import { promoteCorpusCandidateToQueue } from "./candidate-promotion";

vi.mock("@/server/repositories/human-quality-candidate", () => ({
  getCorpusCandidateById: vi.fn(), markCorpusCandidatePromoted: vi.fn(),
}));
vi.mock("@/server/repositories/human-quality-corpus", () => ({
  findCorpusItemByDerivationVersion: vi.fn(),
  getCorpusItemByIdAnyWorkspace: vi.fn(),
  insertCorpusItem: vi.fn(),
}));
vi.mock("@/server/repositories/assistant-goal", () => ({ getCorpusConsent: vi.fn() }));

import { getCorpusCandidateById, markCorpusCandidatePromoted } from "@/server/repositories/human-quality-candidate";
import { findCorpusItemByDerivationVersion, insertCorpusItem } from "@/server/repositories/human-quality-corpus";
import { getCorpusConsent } from "@/server/repositories/assistant-goal";

const mockCandidate = vi.mocked(getCorpusCandidateById);
const mockMark = vi.mocked(markCorpusCandidatePromoted);
const mockFindItem = vi.mocked(findCorpusItemByDerivationVersion);
const mockInsert = vi.mocked(insertCorpusItem);
const mockConsent = vi.mocked(getCorpusConsent);
const candidate = {
  id: "00000000-0000-4000-8000-000000000001",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  clientProfileId: "00000000-0000-4000-8000-000000000003",
  campaignId: "00000000-0000-4000-8000-000000000004",
  derivationId: "00000000-0000-4000-8000-000000000005",
  corpusVersion: 1,
  generationMode: "art_variation",
  format: "square",
  sourceLabel: "real_customer",
  artifactRef: {},
  qualitySnapshot: {},
  promotedCorpusItemId: null,
} as Awaited<ReturnType<typeof getCorpusCandidateById>>;

describe("corpus promotion consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCandidate.mockResolvedValue(candidate);
    mockFindItem.mockResolvedValue(null);
  });

  it("keeps the candidate unpromoted until consent is granted", async () => {
    mockConsent.mockResolvedValueOnce(null);
    await expect(promoteCorpusCandidateToQueue({ candidateId: candidate!.id, cohort: "baseline" }))
      .rejects.toMatchObject({ code: "client_consent_required" });
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockMark).not.toHaveBeenCalled();

    const item = { id: "00000000-0000-4000-8000-000000000006" } as Awaited<ReturnType<typeof insertCorpusItem>>;
    mockConsent.mockResolvedValueOnce({ status: "granted" } as Awaited<ReturnType<typeof getCorpusConsent>>);
    mockInsert.mockResolvedValue(item);
    const result = await promoteCorpusCandidateToQueue({ candidateId: candidate!.id, cohort: "baseline" });
    expect(result.created).toBe(true);
    expect(result.item).toBe(item);
    expect(mockMark).toHaveBeenCalledWith(candidate!.id, item.id, undefined);
  });
});
