"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { CanonicalWorkSummary } from "@/server/creative-work/canonical/types";
import { useCanonicalWorks } from "@/lib/hooks/use-canonical-works";
import { useCampaignAssets } from "@/lib/hooks/use-assets";
import { useCreativeInspirations } from "@/lib/hooks/use-creative-inspirations";
import { studioBentoClass, studioBentoItemClass } from "@/components/dashboard/studio-stage/StudioInstrument";

export type OccupancySource = "grouped" | "brand" | "studio" | "layout";

export type OccupancyTile = {
  id: string;
  href: string | null;
  src: string;
  alt: string;
};

function isLinkedToCampaign(work: CanonicalWorkSummary, campaignId: string) {
  return work.originKind === "creative_work" && work.resumeHref.startsWith(`/campaigns/${campaignId}`);
}

export function piecesForCampaign(
  works: readonly CanonicalWorkSummary[],
  campaignId: string,
  clientProfileId: string | null,
) {
  const withPreview = works.filter(
    (work) => work.originKind === "creative_work" && Boolean(work.previewHref),
  );
  const linked = withPreview.filter((work) => isLinkedToCampaign(work, campaignId));
  if (linked.length > 0) return { tiles: linked, source: "grouped" as const };
  const brand = clientProfileId
    ? withPreview.filter((work) => work.clientProfileId === clientProfileId)
    : [];
  if (brand.length > 0) return { tiles: brand, source: "brand" as const };
  return { tiles: withPreview, source: "studio" as const };
}

function tileFromWork(work: CanonicalWorkSummary): OccupancyTile {
  return {
    id: work.id,
    href: `/creative-work/${work.originId}`,
    src: work.previewHref!,
    alt: work.previewAlt ?? work.name,
  };
}

function dedupeTiles(tiles: OccupancyTile[]) {
  const seen = new Set<string>();
  return tiles.filter((tile) => {
    if (!tile.src || seen.has(tile.src)) return false;
    seen.add(tile.src);
    return true;
  });
}

export function campaignOccupancy({
  works,
  campaignId,
  clientProfileId,
  derivationImages,
  assetImages,
  inspirationImages,
}: {
  works: readonly CanonicalWorkSummary[];
  campaignId: string;
  clientProfileId: string | null;
  derivationImages: OccupancyTile[];
  assetImages: OccupancyTile[];
  inspirationImages: OccupancyTile[];
}): { tiles: OccupancyTile[]; source: OccupancySource } {
  const pieces = piecesForCampaign(works, campaignId, clientProfileId);
  const pieceTiles = pieces.tiles.map(tileFromWork);
  const groupedPieces = pieces.source === "grouped" ? pieceTiles : [];
  const grouped = dedupeTiles([...groupedPieces, ...derivationImages, ...assetImages]);
  if (grouped.length > 0) return { tiles: grouped, source: "grouped" };
  if (pieces.source === "brand" && pieceTiles.length > 0) {
    return { tiles: pieceTiles, source: "brand" };
  }
  if (pieces.source === "studio" && pieceTiles.length > 0) {
    return { tiles: pieceTiles, source: "studio" };
  }
  const layout = dedupeTiles(inspirationImages).slice(0, 8);
  if (layout.length > 0) return { tiles: layout, source: "layout" };
  return { tiles: [], source: "grouped" };
}

export function CampaignPiecesOccupancy({
  campaignId,
  clientProfileId,
  derivationImages = [],
}: {
  campaignId: string;
  clientProfileId: string | null;
  derivationImages?: OccupancyTile[];
}) {
  const t = useTranslations("campaign.v6");
  const works = useCanonicalWorks();
  const assets = useCampaignAssets(campaignId);
  const inspirations = useCreativeInspirations(clientProfileId);
  const loading = works.isLoading || assets.isLoading || inspirations.isLoading;

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

  const { tiles, source } = useMemo(
    () =>
      campaignOccupancy({
        works: works.data ?? [],
        campaignId,
        clientProfileId,
        derivationImages,
        assetImages,
        inspirationImages,
      }),
    [works.data, campaignId, clientProfileId, derivationImages, assetImages, inspirationImages],
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

  if (tiles.length === 0) {
    return (
      <div data-testid="campaign-pieces-empty" className="pt-8">
        <p className="text-sm text-[var(--text-secondary)]">{t("emptyPieces")}</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{t("emptyPiecesHint")}</p>
      </div>
    );
  }

  const occupancy =
    source === "grouped"
      ? t("piecesGrouped")
      : source === "brand"
        ? t("piecesBrand")
        : source === "studio"
          ? t("piecesStudio")
          : t("piecesLayout");

  return (
    <section className="space-y-3">
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
