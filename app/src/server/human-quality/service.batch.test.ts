import { beforeEach, describe, expect, it, vi } from "vitest";
import { batchSelectDerivationsForCorpus, selectDerivationForCorpus } from "./service";

vi.mock("@/server/repositories/derivation", () => ({ getDerivationById: vi.fn() }));
vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(), updateCampaign: vi.fn(),
}));
vi.mock("@/server/repositories/client-reference", () => ({
  resolveCampaignClientProfileId: vi.fn(),
}));
vi.mock("@/server/repositories/human-quality-corpus", () => ({
  findCorpusItemByDerivationVersion: vi.fn(), insertCorpusItem: vi.fn(),
}));

import { getDerivationById } from "@/server/repositories/derivation";
import { getCampaignById, updateCampaign } from "@/server/repositories/campaign";
import { resolveCampaignClientProfileId } from "@/server/repositories/client-reference";
import { findCorpusItemByDerivationVersion, insertCorpusItem } from "@/server/repositories/human-quality-corpus";

const mockDerivation = vi.mocked(getDerivationById);
const mockCampaign = vi.mocked(getCampaignById);
const mockUpdateCampaign = vi.mocked(updateCampaign);
const mockProfile = vi.mocked(resolveCampaignClientProfileId);
const mockFindItem = vi.mocked(findCorpusItemByDerivationVersion);
const mockInsertItem = vi.mocked(insertCorpusItem);
const workspaceId = "00000000-0000-4000-8000-000000000001";
const campaignId = "00000000-0000-4000-8000-000000000002";
const clientProfileId = "00000000-0000-4000-8000-000000000003";
const ids = [4, 5, 6, 7].map((n) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`);
const baseInput = { workspaceId, campaignId, selectedByUserId: "owner-1" };

describe("batchSelectDerivationsForCorpus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDerivation.mockImplementation(async (id) => ({
      id,
      workspaceId,
      campaignId: id === ids[1] ? ids[3] : campaignId,
      status: "completed",
      generationMode: "art_variation",
      format: "square",
    } as Awaited<ReturnType<typeof getDerivationById>>));
    mockCampaign.mockResolvedValue({ id: campaignId, workspaceId, clientProfileId } as Awaited<ReturnType<typeof getCampaignById>>);
    mockProfile.mockResolvedValue(clientProfileId);
    mockFindItem.mockResolvedValue(null);
    mockInsertItem.mockImplementation(async (input) => ({
      id: input.derivationId,
      ...input,
    } as Awaited<ReturnType<typeof insertCorpusItem>>));
  });

  it("shares campaign/profile resolution but validates each derivation", async () => {
    const result = await batchSelectDerivationsForCorpus({
      ...baseInput,
      derivationIds: ids.slice(0, 3),
    });
    expect(result.results.map((row) => row.outcome)).toEqual(["selected", "invalid", "selected"]);
    expect(result.results[1].errorCode).toBe("invalid_derivation_campaign");
    expect(result.summary).toMatchObject({ total: 3, selected: 2, invalid: 1 });
    expect(mockDerivation).toHaveBeenCalledTimes(3);
    expect(mockCampaign).toHaveBeenCalledTimes(1);
    expect(mockProfile).toHaveBeenCalledTimes(1);
    expect(mockInsertItem).toHaveBeenCalledTimes(2);

    await selectDerivationForCorpus({ ...baseInput, derivationId: ids[3] });
    expect(mockCampaign).toHaveBeenCalledTimes(2);
    expect(mockProfile).toHaveBeenCalledTimes(2);
  });

  it("keeps a missing profile as a per-item batch outcome", async () => {
    mockProfile.mockResolvedValue(null);
    const result = await batchSelectDerivationsForCorpus({
      ...baseInput,
      derivationIds: [ids[0], ids[2]],
    });
    expect(result.results.map((row) => row.outcome)).toEqual(["missing_profile", "missing_profile"]);
    expect(mockCampaign).toHaveBeenCalledTimes(1);
    expect(mockProfile).toHaveBeenCalledTimes(1);
    expect(mockUpdateCampaign).not.toHaveBeenCalled();
    expect(mockInsertItem).not.toHaveBeenCalled();
  });
});
