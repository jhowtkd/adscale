import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { CanonicalWorkSummary } from "@/server/creative-work/canonical/types";
import {
  campaignOccupancy,
  CampaignPiecesOccupancy,
  nextCampaignSource,
  piecesForCampaign,
  type OccupancyTile,
  type SourcePaging,
} from "./CampaignPiecesOccupancy";

const hoisted = vi.hoisted(() => ({
  worksFetchNextPage: vi.fn(),
  assetsFetchNextPage: vi.fn(),
  assets: {
    data: [] as Array<Record<string, unknown>>,
    isLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("next/image", () => ({
  default: (props: { alt: string; src: string }) => <img alt={props.alt} src={props.src} />,
}));
vi.mock("@/lib/hooks/use-canonical-works", () => ({
  // The workspace-wide feed is NOT a source of the Campanha: its paging must never be touched.
  useCanonicalWorks: () => ({
    data: [],
    isLoading: false,
    hasNextPage: true,
    fetchNextPage: hoisted.worksFetchNextPage,
  }),
}));
vi.mock("@/lib/hooks/use-assets", () => ({
  useCampaignAssets: () => ({ ...hoisted.assets, fetchNextPage: hoisted.assetsFetchNextPage }),
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

describe("nextCampaignSource", () => {
  const src = (hasMore: boolean): SourcePaging => ({ hasMore, loading: false, load: vi.fn() });

  it("returns the first source with more, in order (Peças, then materiais)", () => {
    const derivations = src(true);
    const assets = src(true);
    expect(nextCampaignSource([derivations, assets])).toBe(derivations);
    expect(nextCampaignSource([src(false), assets])).toBe(assets);
    expect(nextCampaignSource([undefined, assets])).toBe(assets);
  });

  it("is null when nothing has more", () => {
    expect(nextCampaignSource([src(false), src(false)])).toBeNull();
    expect(nextCampaignSource([undefined, undefined])).toBeNull();
    expect(nextCampaignSource([])).toBeNull();
  });
});

describe("campaignOccupancy dedupe", () => {
  it("keeps one tile when the same stable id comes with different signed URLs", () => {
    const occupancy = campaignOccupancy({
      works: [],
      campaignId: "camp-1",
      clientProfileId: null,
      derivationImages: [
        { id: "derivation:1", href: null, src: "https://s/1?sig=a", alt: "Peça 1" },
        { id: "derivation:1", href: null, src: "https://s/1?sig=b", alt: "Peça 1" },
        { id: "derivation:2", href: null, src: "https://s/2?sig=a", alt: "Peça 2" },
      ],
      assetImages: [{ id: "asset:1", href: null, src: "https://s/1?sig=a", alt: "same src as a Peça" }],
      inspirationImages: [],
    });
    expect(occupancy.tiles.map((tile) => tile.id)).toEqual(["derivation:1", "derivation:2"]);
  });
});

describe("CampaignPiecesOccupancy: Carregar mais (#503)", () => {
  const derivationImages: OccupancyTile[] = [
    { id: "derivation:1", href: null, src: "https://s/d1", alt: "Peça 1" },
  ];
  const paging = (over: Partial<SourcePaging> = {}): SourcePaging => ({
    hasMore: true,
    loading: false,
    failed: false,
    load: vi.fn(),
    ...over,
  });
  const button = () => screen.queryByTestId("campaign-pieces-load-more");

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.assets = {
      data: [{ id: "a-1", url: "https://s/a1", role: "base", type: "image" }],
      isLoading: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
    };
  });

  it("advances the Peças first, then the materiais, and never the workspace-wide feed", () => {
    const derivationsPaging = paging();
    const { rerender } = render(
      <CampaignPiecesOccupancy campaignId="camp-1" clientProfileId={null} derivationImages={derivationImages} derivationsPaging={derivationsPaging} />,
    );
    fireEvent.click(button()!);
    expect(derivationsPaging.load).toHaveBeenCalledTimes(1);
    expect(hoisted.assetsFetchNextPage).not.toHaveBeenCalled();

    // Peças exhausted: the next click goes to the materiais.
    const exhausted = paging({ hasMore: false });
    rerender(
      <CampaignPiecesOccupancy campaignId="camp-1" clientProfileId={null} derivationImages={derivationImages} derivationsPaging={exhausted} />,
    );
    fireEvent.click(button()!);
    expect(hoisted.assetsFetchNextPage).toHaveBeenCalledTimes(1);
    expect(derivationsPaging.load).toHaveBeenCalledTimes(1);
    expect(exhausted.load).not.toHaveBeenCalled();
    expect(hoisted.worksFetchNextPage).not.toHaveBeenCalled();
  });

  it("goes straight to the materiais when no derivationsPaging is given", () => {
    render(<CampaignPiecesOccupancy campaignId="camp-1" clientProfileId={null} derivationImages={derivationImages} />);
    fireEvent.click(button()!);
    expect(hoisted.assetsFetchNextPage).toHaveBeenCalledTimes(1);
    expect(hoisted.worksFetchNextPage).not.toHaveBeenCalled();
  });

  it("hides the button when no Campanha source has a next page, even if the feed does", () => {
    hoisted.assets.hasNextPage = false;
    render(
      <CampaignPiecesOccupancy campaignId="camp-1" clientProfileId={null} derivationImages={derivationImages} derivationsPaging={paging({ hasMore: false })} />,
    );
    expect(button()).toBeNull();
  });

  it("shows the tiles of both sources without duplicates (stable id and src)", () => {
    hoisted.assets.data = [
      { id: "a-1", url: "https://s/a1", role: "base", type: "image" },
      { id: "a-1", url: "https://s/a1?sig=2", role: "base", type: "image" },
      { id: "a-2", url: "https://s/d1", role: "base", type: "image" },
    ];
    hoisted.assets.hasNextPage = false;
    render(
      <CampaignPiecesOccupancy
        campaignId="camp-1"
        clientProfileId={null}
        derivationImages={[...derivationImages, { id: "derivation:1", href: null, src: "https://s/d1?sig=2", alt: "Peça 1" }]}
        derivationsPaging={paging({ hasMore: false })}
      />,
    );
    const tiles = within(screen.getByTestId("campaign-pieces")).getAllByRole("img");
    // derivation:1 once, asset:a-1 once; asset:a-2 shares the src of derivation:1 and is dropped.
    expect(tiles).toHaveLength(2);
  });

  it("shows an error when the next source failed, keeping the loaded tiles and the button", () => {
    render(
      <CampaignPiecesOccupancy campaignId="camp-1" clientProfileId={null} derivationImages={derivationImages} derivationsPaging={paging({ failed: true })} />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(button()).not.toBeNull();
    expect(within(screen.getByTestId("campaign-pieces")).getAllByRole("img").length).toBeGreaterThan(0);
  });

  it("shows no error when only a source that is not next has failed", () => {
    hoisted.assets.isFetchNextPageError = true; // materiais failed, but the Peças still have more
    render(
      <CampaignPiecesOccupancy
        campaignId="camp-1"
        clientProfileId={null}
        derivationImages={derivationImages}
        derivationsPaging={paging({ failed: false })}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the materials' failure once the Peças are exhausted", () => {
    hoisted.assets.isFetchNextPageError = true;
    render(
      <CampaignPiecesOccupancy campaignId="camp-1" clientProfileId={null} derivationImages={derivationImages} derivationsPaging={paging({ hasMore: false })} />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("disables the button while a source is loading more", () => {
    render(
      <CampaignPiecesOccupancy campaignId="camp-1" clientProfileId={null} derivationImages={derivationImages} derivationsPaging={paging({ loading: true })} />,
    );
    expect(button()).toBeDisabled();
  });

  it("with no tile yet, the empty state still offers Carregar mais", () => {
    hoisted.assets.data = [];
    render(<CampaignPiecesOccupancy campaignId="camp-1" clientProfileId={null} derivationsPaging={paging()} />);
    expect(screen.getByTestId("campaign-pieces-empty")).toBeInTheDocument();
    fireEvent.click(button()!);
    expect(hoisted.worksFetchNextPage).not.toHaveBeenCalled();
  });
});
