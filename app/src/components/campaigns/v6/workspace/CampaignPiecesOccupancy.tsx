"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import type { CreativeProductionItem, CreativeProductionPage } from "@/lib/creative-production";
import type { CanonicalWorkSummary } from "@/server/creative-work/canonical/types";
import { useCanonicalWorks } from "@/lib/hooks/use-canonical-works";
import { useCreativeProduction } from "@/lib/hooks/use-creative-production";
import { useCampaignAssets } from "@/lib/hooks/use-assets";
import { useCreativeInspirations } from "@/lib/hooks/use-creative-inspirations";
import { studioBentoClass, studioBentoItemClass } from "@/components/dashboard/studio-stage/StudioInstrument";

export type OccupancySource = "grouped" | "brand" | "layout";

export type OccupancyTile = {
  id: string;
  href: string | null;
  src: string;
  alt: string;
};

/** Keyset paging of one of the Campanha's own sources (#503). */
export type SourcePaging = {
  hasMore: boolean;
  loading: boolean;
  /** The last "Carregar mais" of this source failed; the loaded tiles stay. */
  failed?: boolean;
  load: () => void;
};

/**
 * What tells a Campanha that is empty in this visit from one whose source has not
 * answered yet, or answered only from an older cache (#786 review, F1 and F3).
 */
export type SourceCheck = {
  /** Items in all pages of the source, with or without an image; null until known. */
  total: number | null;
  /** The source answered after this visit started, not from an older cache. */
  answeredInVisit: boolean;
  /** A request of the source is running. */
  fetching: boolean;
  /** Asks the source again; absent when the source already does so on every visit. */
  revalidate?: () => void;
};

const NO_SOURCE: SourceCheck = { total: 0, answeredInVisit: true, fetching: false };

/** Every source of the Campanha has no item at all, by the data at hand. */
export function campaignLooksEmpty(checks: readonly SourceCheck[]) {
  return checks.every((check) => check.total === 0);
}

/** Empty, and every source said so in this visit with no request still running. */
export function campaignConfirmedEmpty(checks: readonly SourceCheck[]) {
  return (
    campaignLooksEmpty(checks) &&
    checks.every((check) => check.answeredInVisit && !check.fetching)
  );
}

/** At most this many pages of the production listing per "Carregar mais" click. */
export const MAX_WORK_PAGES_PER_CLICK = 3;

// The Campanha's own Peças (`derivation`) come from `/derivations`, so the
// production listing only adds the Peças of its grouped Trabalhos.
function isWorkPiece(item: CreativeProductionItem) {
  return item.kind === "output" || item.kind === "slide";
}

/**
 * One tile per result of a Trabalho (#786), in listing order, with the slides of
 * a carousel kept together by position. The link is the listing's `reviewHref`,
 * which the Campanha page redirects to the composer.
 */
export function workPieceTiles(items: readonly CreativeProductionItem[]): OccupancyTile[] {
  const groups = new Map<string, CreativeProductionItem[]>();
  for (const item of items) {
    if (!isWorkPiece(item)) continue;
    const key = item.deckId ? `deck:${item.deckId}` : item.id;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()]
    .flatMap((group) => group.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)))
    .map((item) => ({ id: item.id, href: item.reviewHref, src: item.previewUrl, alt: item.title }));
}

type WorkPiecesNextPage = {
  isError: boolean;
  hasNextPage: boolean;
  data?: { pages: readonly CreativeProductionPage[] };
};

/**
 * The listing pages `output`, `slide` and `derivation` together, and the grid
 * drops `derivation`, so a page can bring no new tile. One click then goes on in
 * the same source until a page brings a Peça of a Trabalho, the source ends, or
 * MAX_WORK_PAGES_PER_CLICK pages were fetched. It never moves to the next source.
 */
export async function loadNextWorkPieces(
  fetchNextPage: () => Promise<WorkPiecesNextPage>,
): Promise<void> {
  for (let fetched = 0; fetched < MAX_WORK_PAGES_PER_CLICK; fetched += 1) {
    const result = await fetchNextPage();
    if (result.isError || !result.hasNextPage) return;
    if (result.data?.pages.at(-1)?.production.some(isWorkPiece)) return;
  }
}

function productionItems(data: { pages: readonly CreativeProductionPage[] } | undefined) {
  return data?.pages.flatMap((page) => page.production) ?? [];
}

/**
 * The fill of a Campanha that is confirmed empty: the brand's Trabalhos with a
 * preview, one tile each, from the brand's feed (#786 review, F2).
 */
export function brandWorkTiles(works: readonly CanonicalWorkSummary[]): OccupancyTile[] {
  return works
    .filter((work) => work.originKind === "creative_work" && Boolean(work.previewHref))
    .map((work) => ({
      id: work.id,
      href: `/creative-work/${work.originId}`,
      src: work.previewHref!,
      alt: work.previewAlt ?? work.name,
    }));
}

// A signed URL changes on every response, so the stable id (`derivation:<id>`,
// `asset:<id>`) also dedupes a tile that two pages or a refetch both bring.
function dedupeTiles(tiles: OccupancyTile[]) {
  const seenIds = new Set<string>();
  const seenSrcs = new Set<string>();
  return tiles.filter((tile) => {
    if (!tile.src || seenIds.has(tile.id) || seenSrcs.has(tile.src)) return false;
    seenIds.add(tile.id);
    seenSrcs.add(tile.src);
    return true;
  });
}

/**
 * "Carregar mais" advances the Campanha's own sources only, in display order:
 * the Peças of its grouped Trabalhos (#786), then its Peças, then its materials
 * (§7.2 as adjusted on 23/10/2026).
 */
export function nextCampaignSource(
  sources: readonly (SourcePaging | undefined)[],
): SourcePaging | null {
  return sources.find((source) => source?.hasMore) ?? null;
}

/** The Campanha's own tiles, in the order "Carregar mais" advances their sources. */
export function groupedTiles({
  workPieces,
  derivationImages,
  assetImages,
}: {
  workPieces: OccupancyTile[];
  derivationImages: OccupancyTile[];
  assetImages: OccupancyTile[];
}): OccupancyTile[] {
  return dedupeTiles([...workPieces, ...derivationImages, ...assetImages]);
}

/**
 * The Campanha's tiles, else the brand's Peças (only given for a Campanha with a
 * brand that is confirmed empty), else the brand's inspirations as a layout preview.
 */
export function campaignOccupancy({
  grouped,
  brandPieces,
  inspirationImages,
}: {
  grouped: OccupancyTile[];
  brandPieces: OccupancyTile[];
  inspirationImages: OccupancyTile[];
}): { tiles: OccupancyTile[]; source: OccupancySource } {
  if (grouped.length > 0) return { tiles: grouped, source: "grouped" };
  const brand = dedupeTiles(brandPieces);
  if (brand.length > 0) return { tiles: brand, source: "brand" };
  const layout = dedupeTiles(inspirationImages).slice(0, 8);
  if (layout.length > 0) return { tiles: layout, source: "layout" };
  return { tiles: [], source: "grouped" };
}

export function CampaignPiecesOccupancy({
  campaignId,
  workspaceId,
  clientProfileId,
  derivationImages = [],
  derivationsPaging,
  derivationsCheck = NO_SOURCE,
}: {
  campaignId: string;
  workspaceId: string | null;
  clientProfileId: string | null;
  derivationImages?: OccupancyTile[];
  derivationsPaging?: SourcePaging;
  derivationsCheck?: SourceCheck;
}) {
  const t = useTranslations("campaign.v6");
  const tc = useTranslations("common");
  // The listing requires a brand: a Campanha without one shows no Peças of
  // grouped Trabalhos and no fill from outside (#786, recommendation 2).
  const works = useCreativeProduction({
    workspaceId,
    clientProfileId,
    campaignId,
    enabled: true,
    isProducing: false,
  });
  const assets = useCampaignAssets(campaignId);
  const inspirations = useCreativeInspirations(clientProfileId);

  const workPieces = useMemo(() => workPieceTiles(productionItems(works.data)), [works.data]);

  const assetImages = useMemo<OccupancyTile[]>(
    () =>
      (assets.data ?? [])
        .filter((asset) => Boolean(asset.url))
        .map((asset) => ({
          id: `asset:${asset.id}`,
          href: null,
          src: asset.url,
          alt: asset.role ?? asset.type,
        })),
    [assets.data],
  );

  const inspirationImages = useMemo<OccupancyTile[]>(
    () =>
      (inspirations.data ?? [])
        .filter((item) => Boolean(item.previewUrl))
        .map((item) => ({
          id: `inspiration:${item.id}`,
          href: null,
          src: item.previewUrl!,
          alt: item.title,
        })),
    [inspirations.data],
  );

  const worksPaging: SourcePaging = {
    hasMore: Boolean(works.hasNextPage),
    loading: works.isFetchingNextPage,
    failed: works.isFetchNextPageError,
    load: () => void loadNextWorkPieces(works.fetchNextPage),
  };
  const assetsPaging: SourcePaging = {
    hasMore: Boolean(assets.hasNextPage),
    loading: assets.isFetchingNextPage,
    failed: assets.isFetchNextPageError,
    load: () => void assets.fetchNextPage(),
  };
  const sources = [worksPaging, derivationsPaging, assetsPaging];
  const nextSource = nextCampaignSource(sources);
  const loadingMore = sources.some((source) => source?.loading);
  // The first page of the listing failed: the Peças of the grouped Trabalhos are
  // unknown, so the grid says so instead of looking empty.
  const worksFailed = works.isError && works.data === undefined;

  const grouped = useMemo(
    () => groupedTiles({ workPieces, derivationImages, assetImages }),
    [workPieces, derivationImages, assetImages],
  );
  // "Peças da marca" fill only a Campanha with a brand that is confirmed empty:
  // each of its sources has no item at all, with or without an image, and said so
  // in this visit. An older cache never lets the fill show while the Campanha is
  // asked again (#786 review, F1 and F3).
  const checks: SourceCheck[] = [
    {
      total: works.data ? productionItems(works.data).length : null,
      // useCreativeProduction already asks again on every mount.
      answeredInVisit: works.isFetchedAfterMount && works.isSuccess,
      fetching: works.isFetching,
    },
    derivationsCheck,
    {
      total: assets.total,
      answeredInVisit: assets.isFetchedAfterMount && assets.isSuccess,
      fetching: assets.isFetching,
      revalidate: () => void assets.refetch(),
    },
  ];
  const looksEmpty = Boolean(clientProfileId) && campaignLooksEmpty(checks);
  const brandFill = Boolean(clientProfileId) && campaignConfirmedEmpty(checks);
  // A source whose data predates this visit is asked again once, and only when
  // that data says the Campanha is empty.
  const revalidated = useRef(new Set<string>());
  useEffect(() => {
    if (!looksEmpty) return;
    checks.forEach((check, index) => {
      const key = `${campaignId}:${index}`;
      if (!check.revalidate || check.answeredInVisit || check.fetching) return;
      if (revalidated.current.has(key)) return;
      revalidated.current.add(key);
      check.revalidate();
    });
  });
  const brand = useCanonicalWorks({ clientProfileId, enabled: brandFill });
  const brandPieces = useMemo(
    () => (brandFill ? brandWorkTiles(brand.data ?? []) : []),
    [brandFill, brand.data],
  );
  const loading = works.isLoading || assets.isLoading || inspirations.isLoading || brand.isLoading;

  const { tiles, source } = useMemo(
    () => campaignOccupancy({ grouped, brandPieces, inspirationImages }),
    [grouped, brandPieces, inspirationImages],
  );

  if (loading) {
    return (
      <ul className={studioBentoClass} aria-hidden="true" data-testid="campaign-pieces">
        {["h-52", "h-40", "h-64", "h-48", "h-56", "h-36"].map((height) => (
          <li key={height} className={studioBentoItemClass}>
            <div className={`animate-pulse rounded-2xl bg-white/6 ${height}`} />
          </li>
        ))}
      </ul>
    );
  }

  const loadMoreButton = nextSource ? (
    <div className="flex items-center gap-3">
      <button
        type="button"
        data-testid="campaign-pieces-load-more"
        className="rounded-full border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60"
        onClick={nextSource.load}
        disabled={loadingMore}
      >
        {loadingMore ? t("piecesLoadingMore") : t("piecesLoadMore")}
      </button>
      {nextSource.failed ? (
        <span role="alert" className="text-sm text-[var(--danger-text)]">
          {tc("error")}
        </span>
      ) : null}
    </div>
  ) : null;

  const worksError = worksFailed ? (
    <div role="alert" className="flex items-center gap-3 text-sm text-[var(--danger-text)]">
      <span>{tc("errorLoadingWorks")}</span>
      <button
        type="button"
        data-testid="campaign-pieces-works-retry"
        className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        onClick={() => void works.refetch()}
      >
        {tc("retry")}
      </button>
    </div>
  ) : null;

  if (tiles.length === 0) {
    return (
      <div data-testid="campaign-pieces-empty" className="pt-8">
        {worksError ?? (
          <>
            <p className="text-sm text-[var(--text-secondary)]">{t("emptyPieces")}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{t("emptyPiecesHint")}</p>
          </>
        )}
        {loadMoreButton ? <div className="mt-4">{loadMoreButton}</div> : null}
      </div>
    );
  }

  const occupancy =
    source === "grouped"
      ? t("piecesGrouped")
      : source === "brand"
        ? t("piecesBrand")
        : t("piecesLayout");

  return (
    <section className="space-y-3">
      {worksError}
      <div className="space-y-1">
        <p
          role="status"
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]"
        >
          {occupancy} · {tiles.length}
        </p>
        {source === "layout" ? (
          <p className="text-sm text-[var(--text-muted)]">{t("piecesLayoutHint")}</p>
        ) : null}
      </div>
      <ul className={studioBentoClass} data-testid="campaign-pieces">
        {tiles.map((tile) => (
          <li key={tile.id} className={studioBentoItemClass}>
            <PieceTile tile={tile} />
          </li>
        ))}
      </ul>
      {loadMoreButton ? <div className="flex justify-center pt-2">{loadMoreButton}</div> : null}
    </section>
  );
}

function PieceTile({ tile }: { tile: OccupancyTile }) {
  const image = (
    <>
      <Image
        src={tile.src}
        alt={tile.alt}
        width={1080}
        height={1350}
        unoptimized
        className="block h-auto w-full"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-2.5 pb-2.5 pt-10 opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        <p className="truncate text-xs font-medium text-white">{tile.alt}</p>
      </div>
    </>
  );

  const frameClass =
    "group relative block overflow-hidden rounded-2xl bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";

  if (tile.href) {
    return (
      <Link href={tile.href} className={frameClass}>
        {image}
      </Link>
    );
  }

  return <article className={frameClass}>{image}</article>;
}
