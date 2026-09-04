import { describe, expect, it, vi } from "vitest";
import type { CanonicalWorkSummary } from "@/server/creative-work/canonical/types";
import { campaignOccupancy, piecesForCampaign } from "./CampaignPiecesOccupancy";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/lib/hooks/use-canonical-works", () => ({
  useCanonicalWorks: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/lib/hooks/use-assets", () => ({
  useCampaignAssets: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/lib/hooks/use-creative-inspirations", () => ({
  useCreativeInspirations: () => ({ data: [], isLoading: false }),
}));

const work = (overrides: Partial<CanonicalWorkSummary>): CanonicalWorkSummary => ({
  id: "creative_work:11111111-1111-4111-8111-111111111111",
  originKind: "creative_work",
  originId: "11111111-1111-4111-8111-111111111111",
  origin: "quick_tool",
  workspaceId: "ws",
  clientProfileId: "brand-a",
  name: "Piece",
  state: "reviewing",
  updatedAt: "2026-09-03T00:00:00.000Z",
  resumable: true,
  resumeHref: "/creative-work/11111111-1111-4111-8111-111111111111",
  previewHref: "/api/creative-work/11111111-1111-4111-8111-111111111111/outputs/out/download",
  previewAlt: "Piece",
  resultCount: 1,
  nextAction: "review",
  ...overrides,
});

describe("piecesForCampaign", () => {
  it("prefers pieces already grouped in the campaign", () => {
    const grouped = work({
      resumeHref: "/campaigns/camp-1?creativeWork=11111111-1111-4111-8111-111111111111",
    });
    const other = work({
      id: "creative_work:22222222-2222-4222-8222-222222222222",
      originId: "22222222-2222-4222-8222-222222222222",
      previewHref: "/api/creative-work/22222222-2222-4222-8222-222222222222/outputs/out/download",
    });

    expect(piecesForCampaign([grouped, other], "camp-1", "brand-a")).toEqual({
      tiles: [grouped],
      source: "grouped",
    });
  });

  it("falls back to brand pieces so an empty grouping still shows art", () => {
    const brand = work({});
    const otherBrand = work({
      id: "creative_work:22222222-2222-4222-8222-222222222222",
      originId: "22222222-2222-4222-8222-222222222222",
      clientProfileId: "brand-b",
      previewHref: "/api/creative-work/22222222-2222-4222-8222-222222222222/outputs/out/download",
    });

    expect(piecesForCampaign([brand, otherBrand], "camp-1", "brand-a")).toEqual({
      tiles: [brand],
      source: "brand",
    });
  });
});

describe("campaignOccupancy", () => {
  it("shows campaign derivations and assets as grouped art", () => {
    const occupancy = campaignOccupancy({
      works: [],
      campaignId: "camp-1",
      clientProfileId: "brand-a",
      derivationImages: [{ id: "d1", href: null, src: "/d1.jpg", alt: "Variation" }],
      assetImages: [{ id: "a1", href: null, src: "/a1.jpg", alt: "Pilot" }],
      inspirationImages: [{ id: "i1", href: null, src: "/i1.jpg", alt: "Ref" }],
    });

    expect(occupancy.source).toBe("grouped");
    expect(occupancy.tiles.map((tile) => tile.id)).toEqual(["d1", "a1"]);
  });

  it("uses brand inspirations as a layout preview when the grouping has no art", () => {
    const occupancy = campaignOccupancy({
      works: [],
      campaignId: "camp-1",
      clientProfileId: "brand-a",
      derivationImages: [],
      assetImages: [],
      inspirationImages: [{ id: "i1", href: null, src: "/i1.jpg", alt: "Ref" }],
    });

    expect(occupancy).toEqual({
      source: "layout",
      tiles: [{ id: "i1", href: null, src: "/i1.jpg", alt: "Ref" }],
    });
  });
});
