import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { CreativeProductionItem, CreativeProductionPage } from "@/lib/creative-production";
import type { CanonicalWorkSummary } from "@/server/creative-work/canonical/types";
import {
  brandWorkTiles,
  campaignConfirmedEmpty,
  campaignLooksEmpty,
  campaignOccupancy,
  CampaignPiecesOccupancy,
  groupedTiles,
  loadNextWorkPieces,
  MAX_WORK_PAGES_PER_CLICK,
  nextCampaignSource,
  workPieceTiles,
  type OccupancyTile,
  type SourceCheck,
  type SourcePaging,
} from "./CampaignPiecesOccupancy";

type ProductionArgs = {
  workspaceId: string | null;
  clientProfileId: string | null;
  campaignId: string | null;
  enabled: boolean;
  isProducing: boolean;
};

const hoisted = vi.hoisted(() => ({
  productionCalls: [] as Array<{
    workspaceId: string | null;
    clientProfileId: string | null;
    campaignId: string | null;
    enabled: boolean;
    isProducing: boolean;
  }>,
  campaign: {} as Record<string, unknown>,
  canonicalCalls: [] as Array<{ clientProfileId?: string | null; enabled?: boolean }>,
  canonical: {} as { data: unknown[] | undefined; isLoading: boolean },
  assetsFetchNextPage: vi.fn(),
  assetsRefetch: vi.fn(),
  assets: {
    data: [] as Array<Record<string, unknown>> | undefined,
    total: 0 as number | null,
    isFetchedAfterMount: true,
    isSuccess: true,
    isFetching: false,
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
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { alt: string; src: string }) => <img alt={props.alt} src={props.src} />,
}));
vi.mock("@/lib/hooks/use-creative-production", () => ({
  useCreativeProduction: (args: ProductionArgs) => {
    hoisted.productionCalls.push(args);
    return hoisted.campaign;
  },
}));
vi.mock("@/lib/hooks/use-canonical-works", () => ({
  useCanonicalWorks: (args: { clientProfileId?: string | null; enabled?: boolean }) => {
    hoisted.canonicalCalls.push(args);
    return hoisted.canonical;
  },
}));
vi.mock("@/lib/hooks/use-assets", () => ({
  useCampaignAssets: () => ({
    ...hoisted.assets,
    fetchNextPage: hoisted.assetsFetchNextPage,
    refetch: hoisted.assetsRefetch,
  }),
}));
vi.mock("@/lib/hooks/use-creative-inspirations", () => ({
  useCreativeInspirations: () => ({ data: [], isLoading: false }),
}));

const item = (id: string, over: Partial<CreativeProductionItem> = {}): CreativeProductionItem => ({
  id,
  kind: "output",
  workId: `work-${id}`,
  campaignId: "camp-1",
  title: `Title ${id}`,
  format: "1:1",
  previewUrl: `https://s/${id}.jpg`,
  reviewHref: `/campaigns/camp-1?creativeWork=work-${id}`,
  createdAt: "2026-10-01T00:00:00.000Z",
  deckId: null,
  position: null,
  ...over,
});
const derivation = (id: string) => item(id, { kind: "derivation", reviewHref: "" });
const page = (production: CreativeProductionItem[], nextCursor: string | null = null): CreativeProductionPage => ({
  production,
  nextCursor,
});
const infinite = (...pages: CreativeProductionPage[]) => ({ pages, pageParams: pages.map(() => null) });
const nextResult = (pages: CreativeProductionPage[], hasNextPage: boolean, isError = false) => ({
  isError,
  hasNextPage,
  data: { pages },
});

const tile = (id: string, over: Partial<OccupancyTile> = {}): OccupancyTile => ({
  id,
  href: null,
  src: `/${id}.jpg`,
  alt: id,
  ...over,
});

function resetHoisted() {
  hoisted.productionCalls = [];
  hoisted.campaign = {
    data: infinite(page([])),
    isLoading: false,
    isError: false,
    isSuccess: true,
    isFetchedAfterMount: true,
    isFetching: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
  hoisted.canonicalCalls = [];
  hoisted.canonical = { data: undefined, isLoading: false };
  hoisted.assetsRefetch = vi.fn();
  hoisted.assets = {
    data: [],
    total: 0,
    isFetchedAfterMount: true,
    isSuccess: true,
    isFetching: false,
    isLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
  };
}

const lastBrandCall = () => hoisted.canonicalCalls.at(-1)!;
const lastCampaignCall = () => hoisted.productionCalls.at(-1)!;
const workSummary = (n: number, over: Partial<CanonicalWorkSummary> = {}): CanonicalWorkSummary => ({
  id: `creative_work:brand-${n}`,
  originKind: "creative_work",
  originId: `brand-${n}`,
  origin: "quick_tool",
  workspaceId: "ws-1",
  clientProfileId: "brand-a",
  name: `Marca ${n}`,
  state: "reviewing",
  updatedAt: "2026-09-03T00:00:00.000Z",
  resumable: true,
  resumeHref: `/creative-work/brand-${n}`,
  previewHref: `https://s/brand-${n}.jpg`,
  previewAlt: `Marca ${n}`,
  resultCount: 1,
  nextAction: "review",
  ...over,
});
const campaignFetchNext = () => hoisted.campaign.fetchNextPage as ReturnType<typeof vi.fn>;
const paging = (over: Partial<SourcePaging> = {}): SourcePaging => ({
  hasMore: true,
  loading: false,
  failed: false,
  load: vi.fn(),
  ...over,
});
const button = () => screen.queryByTestId("campaign-pieces-load-more");
const shown = () => within(screen.getByTestId("campaign-pieces")).getAllByRole("img");
const alts = () => shown().map((img) => img.getAttribute("alt"));

function ui(props: Partial<React.ComponentProps<typeof CampaignPiecesOccupancy>> = {}) {
  return (
    <CampaignPiecesOccupancy
      campaignId="camp-1"
      workspaceId="ws-1"
      clientProfileId="brand-a"
      {...props}
    />
  );
}

describe("workPieceTiles", () => {
  it("makes one tile per output and slide and leaves derivation rows out", () => {
    const tiles = workPieceTiles([item("o1"), derivation("derivation:d1"), item("s1", { kind: "slide" })]);
    expect(tiles).toEqual([
      {
        id: "o1",
        href: "/campaigns/camp-1?creativeWork=work-o1",
        src: "https://s/o1.jpg",
        alt: "Title o1",
      },
      {
        id: "s1",
        href: "/campaigns/camp-1?creativeWork=work-s1",
        src: "https://s/s1.jpg",
        alt: "Title s1",
      },
    ]);
  });

  it("keeps the slides of a deck together, ordered by position", () => {
    const tiles = workPieceTiles([
      item("s2", { kind: "slide", deckId: "deck-1", position: 2 }),
      item("o1"),
      item("s1", { kind: "slide", deckId: "deck-1", position: 1 }),
      item("s3", { kind: "slide", deckId: "deck-1", position: 3 }),
    ]);
    expect(tiles.map((t) => t.id)).toEqual(["s1", "s2", "s3", "o1"]);
  });

  it("is empty for an empty listing or one with only derivation rows", () => {
    expect(workPieceTiles([])).toEqual([]);
    expect(workPieceTiles([derivation("derivation:d1")])).toEqual([]);
  });
});

describe("groupedTiles / campaignOccupancy", () => {
  it("orders listing, Peças and materiais and drops repeated ids and srcs", () => {
    const tiles = groupedTiles({
      workPieces: [tile("o1")],
      derivationImages: [
        tile("derivation:1", { src: "https://s/1?sig=a" }),
        tile("derivation:1", { src: "https://s/1?sig=b" }),
      ],
      assetImages: [tile("asset:1", { src: "https://s/1?sig=a" }), tile("asset:2")],
    });
    expect(tiles.map((t) => t.id)).toEqual(["o1", "derivation:1", "asset:2"]);
  });

  it("returns the grouped tiles before brand Peças and layout", () => {
    const occupancy = campaignOccupancy({
      grouped: [tile("g1")],
      brandPieces: [tile("b1")],
      inspirationImages: [tile("i1")],
    });
    expect(occupancy.source).toBe("grouped");
    expect(occupancy.tiles.map((t) => t.id)).toEqual(["g1"]);
  });

  it("falls back to brand Peças, then to the layout preview (up to 8)", () => {
    expect(
      campaignOccupancy({ grouped: [], brandPieces: [tile("b1")], inspirationImages: [tile("i1")] }),
    ).toEqual({ source: "brand", tiles: [tile("b1")] });

    const inspirations = Array.from({ length: 10 }, (_, n) => tile(`i${n}`));
    const layout = campaignOccupancy({ grouped: [], brandPieces: [], inspirationImages: inspirations });
    expect(layout.source).toBe("layout");
    expect(layout.tiles).toHaveLength(8);
  });

  it("is empty (grouped) when nothing is available", () => {
    expect(campaignOccupancy({ grouped: [], brandPieces: [], inspirationImages: [] })).toEqual({
      source: "grouped",
      tiles: [],
    });
  });
});

describe("nextCampaignSource", () => {
  const src = (hasMore: boolean): SourcePaging => ({ hasMore, loading: false, load: vi.fn() });

  it("returns the first source with more, in order (listagem, Peças, materiais)", () => {
    const works = src(true);
    const derivations = src(true);
    const assets = src(true);
    expect(nextCampaignSource([works, derivations, assets])).toBe(works);
    expect(nextCampaignSource([src(false), derivations, assets])).toBe(derivations);
    expect(nextCampaignSource([src(false), undefined, assets])).toBe(assets);
  });

  it("is null when nothing has more", () => {
    expect(nextCampaignSource([src(false), src(false), src(false)])).toBeNull();
    expect(nextCampaignSource([undefined, undefined])).toBeNull();
    expect(nextCampaignSource([])).toBeNull();
  });
});

describe("loadNextWorkPieces", () => {
  const derivationPage = (prefix: string, count: number, cursor: string | null) =>
    page(Array.from({ length: count }, (_, n) => derivation(`${prefix}${n}`)), cursor);

  it("stops at the first page that brings an output", async () => {
    const fetchNextPage = vi
      .fn()
      .mockResolvedValueOnce(nextResult([page([]), derivationPage("a", 24, "c")], true))
      .mockResolvedValueOnce(nextResult([page([]), page([item("o1")], "c")], true));
    await loadNextWorkPieces(fetchNextPage);
    expect(fetchNextPage).toHaveBeenCalledTimes(2);
  });

  it("stops at a slide too", async () => {
    const fetchNextPage = vi
      .fn()
      .mockResolvedValue(nextResult([page([item("s1", { kind: "slide" })], "c")], true));
    await loadNextWorkPieces(fetchNextPage);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("stops on an error", async () => {
    const fetchNextPage = vi.fn().mockResolvedValue({ isError: true, hasNextPage: true });
    await loadNextWorkPieces(fetchNextPage);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("stops when the source ends", async () => {
    const fetchNextPage = vi.fn().mockResolvedValue(nextResult([derivationPage("a", 5, null)], false));
    await loadNextWorkPieces(fetchNextPage);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("fetches at most MAX_WORK_PAGES_PER_CLICK derivation-only pages per call", async () => {
    const fetchNextPage = vi.fn().mockResolvedValue(nextResult([derivationPage("a", 24, "c")], true));
    await loadNextWorkPieces(fetchNextPage);
    expect(MAX_WORK_PAGES_PER_CLICK).toBe(3);
    expect(fetchNextPage).toHaveBeenCalledTimes(3);
  });
});

describe("CampaignPiecesOccupancy: grouped Trabalhos (#786)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHoisted();
  });

  it("asks the Campanha's listing for its own Peças", () => {
    hoisted.campaign.data = infinite(page([item("o1")]));
    render(ui());
    expect(lastCampaignCall()).toEqual({
      workspaceId: "ws-1",
      clientProfileId: "brand-a",
      campaignId: "camp-1",
      enabled: true,
      isProducing: false,
    });
    expect(alts()).toEqual(["Title o1"]);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/campaigns/camp-1?creativeWork=work-o1");
  });

  it("never fills with brand Peças when the listing has grouped items", () => {
    hoisted.campaign.data = infinite(page([item("o1")]));
    hoisted.canonical = { data: [workSummary(1), workSummary(2)], isLoading: false };
    render(ui());
    expect(lastBrandCall().enabled).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent("piecesGrouped");
    expect(alts()).toEqual(["Title o1"]);
  });

  it("a derivation row of the listing does not repeat the same Peça from /derivations", () => {
    hoisted.campaign.data = infinite(page([derivation("derivation:d1")]));
    render(
      ui({
        derivationImages: [tile("derivation:d1", { src: "https://s/d1.jpg", alt: "Peça d1" })],
        derivationsPaging: paging({ hasMore: false }),
      }),
    );
    expect(alts()).toEqual(["Peça d1"]);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("a Campanha without a brand never shows Peças do Composer or brand Peças", () => {
    hoisted.canonical = { data: [workSummary(1)], isLoading: false };
    render(ui({ clientProfileId: null }));
    expect(lastBrandCall().enabled).toBe(false);
    expect(screen.queryByText("piecesStudio")).toBeNull();
    expect(screen.queryByText("piecesBrand")).toBeNull();
    expect(screen.getByTestId("campaign-pieces-empty")).toBeInTheDocument();
  });

  describe("brand fill", () => {
    beforeEach(() => {
      hoisted.canonical = { data: [workSummary(1)], isLoading: false };
    });

    it("fills a Campanha confirmed empty, from the brand's canonical feed", () => {
      render(ui());
      expect(lastBrandCall()).toEqual({ clientProfileId: "brand-a", enabled: true });
      expect(screen.getByRole("status")).toHaveTextContent("piecesBrand");
      expect(alts()).toEqual(["Marca 1"]);
      expect(screen.getByRole("link")).toHaveAttribute("href", "/creative-work/brand-1");
    });

    it("does not fill when the first page of the listing failed", () => {
      hoisted.campaign.data = undefined;
      hoisted.campaign.isError = true;
      hoisted.campaign.isSuccess = false;
      render(ui());
      expect(lastBrandCall().enabled).toBe(false);
      expect(screen.queryByText("piecesBrand")).toBeNull();
    });

    it("does not fill while the materials are unknown (total null)", () => {
      hoisted.assets.data = undefined;
      hoisted.assets.total = null;
      render(ui());
      expect(lastBrandCall().enabled).toBe(false);
    });

    it("does not fill before the listing's first page arrived", () => {
      hoisted.campaign.data = undefined;
      render(ui());
      expect(lastBrandCall().enabled).toBe(false);
    });
  });

  describe("failed first page of the listing", () => {
    beforeEach(() => {
      hoisted.campaign.data = undefined;
      hoisted.campaign.isError = true;
    });

    it("shows the error with a retry that refetches the listing", () => {
      render(ui());
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("errorLoadingWorks");
      expect(screen.queryByText("emptyPieces")).toBeNull();
      fireEvent.click(screen.getByTestId("campaign-pieces-works-retry"));
      expect(hoisted.campaign.refetch).toHaveBeenCalledTimes(1);
    });

    it("keeps the Peças of the other sources next to the error", () => {
      render(ui({ derivationImages: [tile("derivation:1")] }));
      expect(screen.getByRole("alert")).toHaveTextContent("errorLoadingWorks");
      expect(alts()).toEqual(["derivation:1"]);
    });

    it("shows no error once the listing has data, even if a refetch failed", () => {
      hoisted.campaign.data = infinite(page([item("o1")]));
      render(ui());
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });
});

describe("CampaignPiecesOccupancy: Carregar mais", () => {
  const derivationImages: OccupancyTile[] = [tile("derivation:1", { src: "https://s/d1", alt: "Peça 1" })];

  beforeEach(() => {
    vi.clearAllMocks();
    resetHoisted();
    hoisted.campaign.data = infinite(page([item("o1")], "cursor"));
    hoisted.campaign.hasNextPage = true;
    campaignFetchNext().mockResolvedValue(nextResult([page([item("o1")], "cursor"), page([item("o2")])], true));
    hoisted.assets = {
      data: [{ id: "a-1", url: "https://s/a1", role: "base", type: "image" }],
      total: 1,
      isFetchedAfterMount: true,
      isSuccess: true,
      isFetching: false,
      isLoading: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
    };
  });

  it("advances listagem, then Peças, then materiais, never skipping a source that has more", () => {
    const derivationsPaging = paging();
    const { rerender } = render(ui({ derivationImages, derivationsPaging }));

    fireEvent.click(button()!);
    expect(campaignFetchNext()).toHaveBeenCalledTimes(1);
    expect(derivationsPaging.load).not.toHaveBeenCalled();
    expect(hoisted.assetsFetchNextPage).not.toHaveBeenCalled();

    // Listing exhausted: the Peças come next.
    hoisted.campaign.hasNextPage = false;
    rerender(ui({ derivationImages, derivationsPaging }));
    fireEvent.click(button()!);
    expect(derivationsPaging.load).toHaveBeenCalledTimes(1);
    expect(hoisted.assetsFetchNextPage).not.toHaveBeenCalled();
    expect(campaignFetchNext()).toHaveBeenCalledTimes(1);

    // Peças exhausted: the materiais.
    const exhausted = paging({ hasMore: false });
    rerender(ui({ derivationImages, derivationsPaging: exhausted }));
    fireEvent.click(button()!);
    expect(hoisted.assetsFetchNextPage).toHaveBeenCalledTimes(1);
    expect(derivationsPaging.load).toHaveBeenCalledTimes(1);
    expect(campaignFetchNext()).toHaveBeenCalledTimes(1);
  });

  it("goes to the materiais when only they have more", () => {
    hoisted.campaign.hasNextPage = false;
    render(ui({ derivationImages }));
    fireEvent.click(button()!);
    expect(hoisted.assetsFetchNextPage).toHaveBeenCalledTimes(1);
    expect(campaignFetchNext()).not.toHaveBeenCalled();
  });

  it("hides the button when no source has a next page", () => {
    hoisted.campaign.hasNextPage = false;
    hoisted.assets.hasNextPage = false;
    render(ui({ derivationImages, derivationsPaging: paging({ hasMore: false }) }));
    expect(button()).toBeNull();
  });

  it("shows no tile twice across the three sources", () => {
    hoisted.campaign.data = infinite(page([item("o1")]), page([item("o1"), item("o2")]));
    hoisted.assets.data = [
      { id: "a-1", url: "https://s/a1", role: "base", type: "image" },
      { id: "a-1", url: "https://s/a1?sig=2", role: "base", type: "image" },
      { id: "a-2", url: "https://s/d1", role: "base", type: "image" },
    ];
    render(
      ui({
        derivationImages: [...derivationImages, tile("derivation:1", { src: "https://s/d1?sig=2" })],
        derivationsPaging: paging(),
      }),
    );
    // o1, o2 once each; derivation:1 once; asset:a-1 once; asset:a-2 shares derivation:1's src.
    expect(shown()).toHaveLength(4);
  });

  it("shows the error when the listing's next page failed", () => {
    hoisted.campaign.isFetchNextPageError = true;
    render(ui({ derivationImages, derivationsPaging: paging() }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(button()).not.toBeNull();
    expect(alts()).toContain("Title o1");
  });

  it("shows the Peças' failure only once the listing is exhausted", () => {
    const failed = paging({ failed: true });
    const { rerender } = render(ui({ derivationImages, derivationsPaging: failed }));
    expect(screen.queryByRole("alert")).toBeNull();
    hoisted.campaign.hasNextPage = false;
    rerender(ui({ derivationImages, derivationsPaging: failed }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows the materials' failure once the other sources are exhausted", () => {
    hoisted.campaign.hasNextPage = false;
    hoisted.assets.isFetchNextPageError = true;
    render(ui({ derivationImages, derivationsPaging: paging({ hasMore: false }) }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("disables the button while the listing loads its next page", () => {
    hoisted.campaign.isFetchingNextPage = true;
    render(ui({ derivationImages }));
    expect(button()).toBeDisabled();
  });

  describe("derivation-only pages of the listing", () => {
    const derivationPage = (prefix: string, count: number, cursor: string | null) =>
      page(Array.from({ length: count }, (_, n) => derivation(`${prefix}${n}`)), cursor);
    const eightOutputs = Array.from({ length: 8 }, (_, n) => item(`o${n}`));

    it("goes through the older derivations in one click, then moves on to the Peças", async () => {
      const page1 = page([...eightOutputs, ...derivationPage("p1-", 16, "c1").production], "c1");
      const page2 = derivationPage("p2-", 24, "c2");
      const page3 = derivationPage("p3-", 20, null);
      hoisted.campaign.data = infinite(page1);
      campaignFetchNext()
        .mockResolvedValueOnce(nextResult([page1, page2], true))
        .mockResolvedValueOnce(nextResult([page1, page2, page3], false));
      const derivationsPaging = paging();
      const { rerender } = render(ui({ derivationImages, derivationsPaging }));
      expect(shown()).toHaveLength(10);

      fireEvent.click(button()!);
      await waitFor(() => expect(campaignFetchNext()).toHaveBeenCalledTimes(2));
      expect(derivationsPaging.load).not.toHaveBeenCalled();

      // The source ended: the next click is the Peças'.
      hoisted.campaign.hasNextPage = false;
      hoisted.campaign.data = infinite(page1, page2, page3);
      rerender(ui({ derivationImages, derivationsPaging }));
      fireEvent.click(button()!);
      expect(derivationsPaging.load).toHaveBeenCalledTimes(1);
      expect(campaignFetchNext()).toHaveBeenCalledTimes(2);
      expect(shown()).toHaveLength(10);
    });

    it("stops at the cap, keeps the button and stays on the same source", async () => {
      const only = derivationPage("d", 24, "c");
      campaignFetchNext().mockResolvedValue(nextResult([page([item("o1")], "c"), only], true));
      const derivationsPaging = paging();
      render(ui({ derivationImages, derivationsPaging }));

      fireEvent.click(button()!);
      await waitFor(() => expect(campaignFetchNext()).toHaveBeenCalledTimes(3));
      await Promise.resolve();
      expect(campaignFetchNext()).toHaveBeenCalledTimes(3);
      expect(button()).not.toBeNull();

      fireEvent.click(button()!);
      await waitFor(() => expect(campaignFetchNext()).toHaveBeenCalledTimes(6));
      expect(derivationsPaging.load).not.toHaveBeenCalled();
      expect(hoisted.assetsFetchNextPage).not.toHaveBeenCalled();
    });

    it("stops on the first page that has an output", async () => {
      campaignFetchNext()
        .mockResolvedValueOnce(nextResult([derivationPage("a", 24, "c")], true))
        .mockResolvedValueOnce(nextResult([derivationPage("a", 24, "c"), page([item("o9")], "c")], true));
      render(ui({ derivationImages }));
      fireEvent.click(button()!);
      await waitFor(() => expect(campaignFetchNext()).toHaveBeenCalledTimes(2));
      await Promise.resolve();
      expect(campaignFetchNext()).toHaveBeenCalledTimes(2);
    });

    it("stops on an error", async () => {
      campaignFetchNext().mockResolvedValue({ isError: true, hasNextPage: true });
      render(ui({ derivationImages }));
      fireEvent.click(button()!);
      await waitFor(() => expect(campaignFetchNext()).toHaveBeenCalledTimes(1));
      await Promise.resolve();
      expect(campaignFetchNext()).toHaveBeenCalledTimes(1);
    });

    it("a listing that ends with only derivation rows brings no new tile (documented leftover)", async () => {
      campaignFetchNext().mockResolvedValue(nextResult([page([item("o1")], "c"), derivationPage("z", 3, null)], false));
      const { rerender } = render(ui({ derivationImages }));
      const before = alts();
      fireEvent.click(button()!);
      await waitFor(() => expect(campaignFetchNext()).toHaveBeenCalledTimes(1));
      hoisted.campaign.hasNextPage = false;
      hoisted.campaign.data = infinite(page([item("o1")], "c"), derivationPage("z", 3, null));
      rerender(ui({ derivationImages }));
      expect(alts()).toEqual(before);
    });
  });
});
