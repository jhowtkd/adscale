import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
  getCampaignsPage: vi.fn(),
}));

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
  listCreativeWorksWithOutputs: vi.fn(),
}));

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationsByCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: vi.fn(),
  getClientProfiles: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getCampaignById, getCampaignsPage } from "@/server/repositories/campaign";
import {
  getCreativeWork,
  listCreativeWorksWithOutputs,
} from "@/server/repositories/creative-work";
import { getDerivationsByCampaign } from "@/server/repositories/derivation";
import {
  getClientProfile,
  getClientProfiles,
} from "@/server/repositories/client-reference";
import {
  listCanonicalWorks,
  listCanonicalWorksPage,
  openCanonicalWork,
  resumeCanonicalWork,
} from "@/server/creative-work/canonical/queries";
import { decodeCatalogCursor } from "@/lib/catalog-page";
import { logger } from "@/lib/logger";

const mockGetCampaignById = vi.mocked(getCampaignById);
const mockGetCampaignsPage = vi.mocked(getCampaignsPage);
const mockGetCreativeWork = vi.mocked(getCreativeWork);
const mockListWithOutputs = vi.mocked(listCreativeWorksWithOutputs);
const mockGetDerivations = vi.mocked(getDerivationsByCampaign);
const mockGetClientProfile = vi.mocked(getClientProfile);
const mockGetClientProfiles = vi.mocked(getClientProfiles);

const WS = "11111111-1111-4111-8111-111111111111";
const OTHER_WS = "99999999-9999-4999-8999-999999999999";
const CAMPAIGN_ID = "22222222-2222-4222-8222-222222222222";
const WORK_ID = "33333333-3333-4333-8333-333333333333";

describe("canonical queries isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCampaignsPage.mockResolvedValue({ campaigns: [], totalCount: 0 });
    mockListWithOutputs.mockResolvedValue([]);
    mockGetDerivations.mockResolvedValue([]);
    mockGetClientProfile.mockResolvedValue(null);
    mockGetClientProfiles.mockResolvedValue([]);
  });

  it("lists both origins scoped by workspaceId", async () => {
    mockGetCampaignsPage.mockResolvedValue({
      campaigns: [
      {
        id: CAMPAIGN_ID,
        workspaceId: WS,
        name: "Camp",
        client: "A",
        product: "P",
        objective: "O",
        audience: "Au",
        platforms: [],
        tone: null,
        offer: null,
        constraints: null,
        notes: null,
        clientProfileId: "66666666-6666-4666-8666-666666666666",
        status: "active",
        creativeDiagnosisStatus: "ready",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-03T00:00:00.000Z"),
        activeDerivations: 0,
        totalDerivations: 0,
        completedDerivations: 0,
        failedDerivations: 0,
        variations: 0,
        creditsUsed: 0,
        previewPendingBatch: false,
      } as never,
      ],
      totalCount: 1,
    });
    mockListWithOutputs.mockResolvedValue([
      {
        work: {
          id: WORK_ID,
          workspaceId: WS,
          clientProfileId: "66666666-6666-4666-8666-666666666666",
          createdByUserId: "u1",
          toolKind: "social_post",
          status: "draft",
          format: "1:1",
          brief: {
            theme: "T",
            objective: "O",
            audience: "A",
            offer: "Off",
          },
          copy: null,
          identitySnapshot: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-04T00:00:00.000Z"),
        },
        outputs: [],
      },
    ] as never);
    mockGetClientProfiles.mockResolvedValue([
      {
        id: "66666666-6666-4666-8666-666666666666",
        name: "Marca Aurora",
      },
    ] as never);

    const list = await listCanonicalWorks(WS);
    expect(mockGetCampaignsPage).toHaveBeenCalledWith(WS, { limit: 25, cursor: null });
    expect(mockListWithOutputs).toHaveBeenCalledWith(WS, 25, null);
    expect(list).toHaveLength(2);
    expect(list[0].originKind).toBe("creative_work");
    expect(list[0].brandName).toBe("Marca Aurora");
    expect(list[1].brandName).toBe("Marca Aurora");
    expect(list.map((i) => i.workspaceId)).toEqual([WS, WS]);
  });

  it("fetches limit + 1 from each origin with the shared cursor", async () => {
    const cursor = { at: new Date("2026-01-02T00:00:00.000Z"), id: CAMPAIGN_ID };
    await listCanonicalWorks(WS, { limit: 10, cursor });

    expect(mockGetCampaignsPage).toHaveBeenCalledWith(WS, { limit: 11, cursor });
    expect(mockListWithOutputs).toHaveBeenCalledWith(WS, 11, cursor);
  });

  it("caps the merged page and emits a keyset cursor for the last row", async () => {
    const baseWork = {
      workspaceId: WS,
      clientProfileId: "66666666-6666-4666-8666-666666666666",
      createdByUserId: "u1",
      toolKind: "social_post",
      status: "draft",
      format: "1:1",
      brief: { theme: "T", objective: "O", audience: "A", offer: "Off" },
      copy: null,
      identitySnapshot: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    mockListWithOutputs.mockResolvedValue([
      { work: { ...baseWork, id: "33333333-3333-4333-8333-333333333331", updatedAt: new Date("2026-01-05T00:00:00.000Z") }, outputs: [] },
      { work: { ...baseWork, id: "33333333-3333-4333-8333-333333333332", updatedAt: new Date("2026-01-04T00:00:00.000Z") }, outputs: [] },
      { work: { ...baseWork, id: "33333333-3333-4333-8333-333333333333", updatedAt: new Date("2026-01-03T00:00:00.000Z") }, outputs: [] },
    ] as never);

    const page = await listCanonicalWorksPage(WS, { limit: 2 });
    expect(page.items.map((i) => i.originId)).toEqual([
      "33333333-3333-4333-8333-333333333331",
      "33333333-3333-4333-8333-333333333332",
    ]);
    expect(page.nextCursor).not.toBeNull();
    expect(decodeCatalogCursor(page.nextCursor!)).toEqual({
      at: new Date("2026-01-04T00:00:00.000Z"),
      id: "33333333-3333-4333-8333-333333333332",
    });

    mockListWithOutputs.mockResolvedValue([
      { work: { ...baseWork, id: "33333333-3333-4333-8333-333333333333", updatedAt: new Date("2026-01-03T00:00:00.000Z") }, outputs: [] },
    ] as never);
    const last = await listCanonicalWorksPage(WS, { limit: 2, cursor: decodeCatalogCursor(page.nextCursor!) });
    expect(last.items).toHaveLength(1);
    expect(last.nextCursor).toBeNull();
  });

  it("list and open both reject generating Creative Work without outputs", async () => {
    const impossible = {
      id: WORK_ID,
      workspaceId: WS,
      clientProfileId: "66666666-6666-4666-8666-666666666666",
      createdByUserId: "u1",
      toolKind: "social_post",
      status: "generating",
      format: "1:1",
      brief: {
        theme: "T",
        objective: "O",
        audience: "A",
        offer: "Off",
      },
      copy: { headline: "H", body: "B", cta: "C" },
      identitySnapshot: {},
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-04T00:00:00.000Z"),
    };

    mockListWithOutputs.mockResolvedValue([
      { work: impossible, outputs: [] },
    ] as never);
    mockGetCreativeWork.mockResolvedValue({
      work: impossible,
      outputs: [],
    } as never);

    const list = await listCanonicalWorks(WS);
    expect(list).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalled();

    const opened = await openCanonicalWork(WS, `creative_work:${WORK_ID}`);
    expect(opened).toBeNull();
  });

  it("open returns null when campaign is outside workspace", async () => {
    mockGetCampaignById.mockResolvedValue(null);
    const result = await openCanonicalWork(
      OTHER_WS,
      `campaign:${CAMPAIGN_ID}`
    );
    expect(result).toBeNull();
    expect(mockGetCampaignById).toHaveBeenCalledWith(CAMPAIGN_ID, OTHER_WS);
  });

  it("resume returns null for failed non-resumable work", async () => {
    mockGetCreativeWork.mockResolvedValue({
      work: {
        id: WORK_ID,
        workspaceId: WS,
        clientProfileId: "66666666-6666-4666-8666-666666666666",
        createdByUserId: "u1",
        toolKind: "social_post",
        status: "failed",
        format: "1:1",
        brief: {
          theme: "T",
          objective: "O",
          audience: "A",
          offer: "Off",
        },
        copy: { headline: "H", body: "B", cta: "C" },
        identitySnapshot: {},
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      outputs: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          status: "failed",
          creativeLevel: "balanced",
          outputKey: null,
          isSelected: false,
        },
      ],
    } as never);

    const resumed = await resumeCanonicalWork(
      WS,
      `creative_work:${WORK_ID}`
    );
    expect(resumed).toBeNull();
  });
});
