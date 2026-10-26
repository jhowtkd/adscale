import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({ user: { id: "user-1" }, workspace: { id: "workspace-1" } })
  ),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));
vi.mock("@/server/repositories/campaign", () => ({ getCampaignById: vi.fn() }));
vi.mock("@/server/repositories/asset", () => ({
  getAssetsByCampaign: vi.fn(),
  getCampaignAssetPage: vi.fn(),
  getCampaignAssetsByIds: vi.fn(),
  getCampaignAssetOverview: vi.fn(),
}));
vi.mock("@/server/storage", () => ({
  objectStorage: { signedDownloadUrl: vi.fn(async (key: string) => `https://signed.test/${key}`) },
}));

import { getCampaignById } from "@/server/repositories/campaign";
import {
  getAssetsByCampaign,
  getCampaignAssetOverview,
  getCampaignAssetPage,
  getCampaignAssetsByIds,
} from "@/server/repositories/asset";
import { objectStorage } from "@/server/storage";
import { decodeKeysetCursor, encodeKeysetCursor } from "@/lib/keyset-page";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";
const CURSOR = encodeKeysetCursor({ at: "2026-10-01T12:00:00.123456Z", id: ID_B });

const mockCampaign = vi.mocked(getCampaignById);
const mockPage = vi.mocked(getCampaignAssetPage);
const mockByIds = vi.mocked(getCampaignAssetsByIds);
const mockOverview = vi.mocked(getCampaignAssetOverview);
const mockFullList = vi.mocked(getAssetsByCampaign);
const mockSign = vi.mocked(objectStorage.signedDownloadUrl);

const asset = (id: string, role = "base") => ({
  id,
  campaignId: "camp-1",
  workspaceId: "workspace-1",
  key: `assets/${id}`,
  type: "image",
  role,
});

const get = (query = "", campaignId = "camp-1") =>
  GET(new Request(`http://localhost/api/campaigns/${campaignId}/assets${query ? `?${query}` : ""}`), {
    params: Promise.resolve({ id: campaignId }),
  });

describe("GET /api/campaigns/[id]/assets (#503)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCampaign.mockResolvedValue({ id: "camp-1" } as never);
    mockPage.mockResolvedValue({ items: [asset(ID_A)], nextCursor: CURSOR } as never);
    mockByIds.mockResolvedValue([asset(ID_A), asset(ID_B)] as never);
    mockOverview.mockResolvedValue({ total: 7, base: asset(ID_A) } as never);
  });

  it("first page: assets, nextCursor, featured and total", async () => {
    const res = await get("limit=1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["assets", "featured", "nextCursor", "total"]);
    expect(body.total).toBe(7);
    expect(body.nextCursor).toBe(CURSOR);
    expect(body.assets[0].url).toBe(`https://signed.test/assets/${ID_A}`);
    expect(body.featured).toEqual({ base: expect.objectContaining({ id: ID_A }) });
    expect(mockPage).toHaveBeenCalledWith("camp-1", "workspace-1", { limit: 1, cursor: null });
  });

  it("default limit is 24 and max is 48", async () => {
    await get();
    expect(mockPage).toHaveBeenLastCalledWith("camp-1", "workspace-1", { limit: 24, cursor: null });
    await get("limit=48");
    expect(mockPage).toHaveBeenLastCalledWith("camp-1", "workspace-1", { limit: 48, cursor: null });
  });

  it("signs the page items and the featured row only; a featured row already on the page reuses its URL", async () => {
    // base is on the page (ID_A): 1 signature, not 2.
    const body = await (await get()).json();
    expect(mockSign.mock.calls.map((c) => c[0])).toEqual([`assets/${ID_A}`]);
    expect(body.featured.base.url).toBe(body.assets[0].url);

    // base is not on the page (ID_C): the page and the featured row are signed.
    mockSign.mockClear();
    mockOverview.mockResolvedValueOnce({ total: 7, base: asset(ID_C) } as never);
    const outside = await (await get()).json();
    expect(mockSign.mock.calls.map((c) => c[0]).sort()).toEqual([`assets/${ID_A}`, `assets/${ID_C}`]);
    expect(outside.featured.base.url).toBe(`https://signed.test/assets/${ID_C}`);

    // No featured row: only the page is signed.
    mockSign.mockClear();
    mockOverview.mockResolvedValueOnce({ total: 1, base: null } as never);
    const none = await (await get()).json();
    expect(none.featured).toEqual({ base: null });
    expect(mockSign.mock.calls.map((c) => c[0])).toEqual([`assets/${ID_A}`]);
  });

  it("next page: only assets and nextCursor, no overview, only its items are signed, cursor arrives decoded", async () => {
    const res = await get(`cursor=${CURSOR}`);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["assets", "nextCursor"]);
    expect(mockOverview).not.toHaveBeenCalled();
    expect(mockSign.mock.calls.map((c) => c[0])).toEqual([`assets/${ID_A}`]);
    expect(mockPage).toHaveBeenCalledWith("camp-1", "workspace-1", {
      limit: 24,
      cursor: { at: "2026-10-01T12:00:00.123456Z", id: ID_B },
    });
  });

  it("ids=: only assets, de-duplicated ids, signs only those, no page or overview query", async () => {
    const res = await get(`ids=${ID_A},${ID_B},${ID_A}`);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["assets"]);
    expect(body.assets.map((a: { id: string }) => a.id)).toEqual([ID_A, ID_B]);
    expect(mockByIds).toHaveBeenCalledWith("camp-1", "workspace-1", [ID_A, ID_B]);
    expect(mockSign.mock.calls.map((c) => c[0]).sort()).toEqual([`assets/${ID_A}`, `assets/${ID_B}`]);
    expect(mockPage).not.toHaveBeenCalled();
    expect(mockOverview).not.toHaveBeenCalled();
  });

  it("the cursor it returns holds only a position: no key and no URL", async () => {
    const { nextCursor } = await (await get("limit=1")).json();
    const decoded = JSON.parse(Buffer.from(nextCursor, "base64url").toString("utf8"));
    expect(Object.keys(decoded).sort()).toEqual(["at", "id", "v"]);
    expect(JSON.stringify(decoded)).not.toMatch(/assets\/|signed\.test|https?:/);
    expect(decodeKeysetCursor(nextCursor)).toEqual({ at: "2026-10-01T12:00:00.123456Z", id: ID_B });
  });

  it("never loads the complete list", async () => {
    await get();
    await get(`cursor=${CURSOR}`);
    await get(`ids=${ID_A}`);
    expect(mockFullList).not.toHaveBeenCalled();
  });

  it("a Campanha outside the workspace stays 200 with no rows (R7), without reading rows", async () => {
    mockCampaign.mockResolvedValue(null as never);
    for (const q of ["", `cursor=${CURSOR}`]) {
      const res = await get(q);
      expect(res.status, q).toBe(200);
      expect(await res.json()).toEqual({ assets: [], nextCursor: null });
    }
    const byIds = await get(`ids=${ID_A}`);
    expect(byIds.status).toBe(200);
    expect(await byIds.json()).toEqual({ assets: [] });
    expect(mockPage).not.toHaveBeenCalled();
    expect(mockByIds).not.toHaveBeenCalled();
    expect(mockOverview).not.toHaveBeenCalled();
    expect(mockSign).not.toHaveBeenCalled();
  });

  it("invalid input is 400 before any read", async () => {
    const yearZero = encodeKeysetCursor({ at: "0000-01-01T00:00:00.000000Z", id: ID_A });
    const ids49 = Array.from({ length: 49 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`).join(",");
    for (const q of [
      "limit=0", "limit=49", "limit=abc", "cursor=%%corrupt", `cursor=${yearZero}`,
      `ids=${ID_A}&cursor=${CURSOR}`, `ids=${ids49}`, "ids=not-a-uuid", "ids=",
    ]) {
      expect((await get(q)).status, q).toBe(400);
    }
    expect(mockCampaign).not.toHaveBeenCalled();
    expect(mockPage).not.toHaveBeenCalled();
    expect(mockByIds).not.toHaveBeenCalled();
  });
});
