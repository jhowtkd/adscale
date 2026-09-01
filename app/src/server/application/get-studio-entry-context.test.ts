import { beforeEach, describe, expect, it, vi } from "vitest";

const getClientProfileMock = vi.hoisted(() => vi.fn());
const getBrandKitMock = vi.hoisted(() => vi.fn());
const listWorksMock = vi.hoisted(() => vi.fn());
const listCampaignsMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: (...args: unknown[]) => getClientProfileMock(...args),
}));
vi.mock("@/server/repositories/brand-kit", () => ({
  getBrandKit: (...args: unknown[]) => getBrandKitMock(...args),
}));
vi.mock("@/server/repositories/creative-work", () => ({
  listCreativeWorksForEntryContext: (...args: unknown[]) => listWorksMock(...args),
  STUDIO_ENTRY_HISTORY_LIMIT: 8,
}));
vi.mock("@/server/repositories/campaign", () => ({
  listCampaignsForEntryContext: (...args: unknown[]) => listCampaignsMock(...args),
}));

import { getStudioEntryContext } from "./get-studio-entry-context";

describe("getStudioEntryContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listCampaignsMock.mockResolvedValue([]);
    getBrandKitMock.mockResolvedValue({ toneOfVoice: null, toneNotes: null, description: null });
  });

  it("returns profile_not_found when the brand is outside the workspace", async () => {
    getClientProfileMock.mockResolvedValue(null);
    const result = await getStudioEntryContext({
      workspaceId: "ws",
      clientProfileId: "other",
      carouselEnabled: false,
    });
    expect(result).toEqual({ ok: false, error: "profile_not_found" });
    expect(listWorksMock).not.toHaveBeenCalled();
  });

  it("merges at most 8 newest rows across both origins", async () => {
    getClientProfileMock.mockResolvedValue({ id: "brand" });
    getBrandKitMock.mockResolvedValue({ toneOfVoice: null, toneNotes: null, description: null });
    listWorksMock.mockResolvedValue(
      Array.from({ length: 8 }, (_, index) => ({
        id: `w${index}`,
        updatedAt: new Date(2026, 0, 8 - index),
        toolKind: "single",
        brief: null,
        inputSnapshot: null,
        settings: {},
      })),
    );
    listCampaignsMock.mockResolvedValue(
      Array.from({ length: 8 }, (_, index) => ({
        id: `c${index}`,
        updatedAt: new Date(2026, 0, 7 - index),
        product: null,
        offer: "Campanha",
        audience: null,
        tone: null,
      })),
    );
    const result = await getStudioEntryContext({
      workspaceId: "ws",
      clientProfileId: "brand",
      carouselEnabled: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.context.workCount).toBe(8);
  });
});
