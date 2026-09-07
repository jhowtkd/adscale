"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ImageIcon } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCreativeInspirations } from "@/lib/hooks/use-creative-inspirations";
import type { CreativeInspiration } from "@/server/application/list-creative-inspirations";

type OriginFilter = "all" | "approved_work" | "template" | "curated";

const ORIGIN_FILTERS: Array<{ id: OriginFilter; labelKey: "filterAll" | "filterApproved" | "filterTemplates" | "filterCurated" }> = [
  { id: "all", labelKey: "filterAll" },
  { id: "approved_work", labelKey: "filterApproved" },
  { id: "template", labelKey: "filterTemplates" },
  { id: "curated", labelKey: "filterCurated" },
];

function inspirationKey(inspiration: CreativeInspiration) {
  return `${inspiration.source}:${inspiration.id}`;
}

export function BrandInspirations({
  clientProfileId,
  onAttach,
}: {
  clientProfileId: string | null;
  onAttach: (inspiration: CreativeInspiration) => boolean | Promise<boolean>;
}) {
  const t = useTranslations("dashboard.home.composer.inspirations");
  const [preview, setPreview] = useState<CreativeInspiration | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");
  const {
    data = [],
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useCreativeInspirations(clientProfileId);
  const featured = data.slice(0, 4);
  const mosaic = useMemo(
    () => originFilter === "all" ? data : data.filter((inspiration) => inspiration.source === originFilter),
    [data, originFilter],
  );

  const attach = async (inspiration: CreativeInspiration) => {
    setPendingId(inspiration.id);
    setAttachError(null);
    try {
      const attached = await onAttach({ ...inspiration, suggestedIntent: "restyle" });
      if (attached) {
        window.setTimeout(() => document.getElementById("creative-composer-original-source")?.focus(), 0);
      } else setAttachError(t("attachFailed"));
    } catch {
      setAttachError(t("attachFailed"));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="brand-inspirations">
      {isLoading ? <p role="status">{t("loading")}</p> : null}
      {isError ? (
        <div>
          <p role="alert">{t("loadFailed")}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 text-sm font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            {t("retry")}
          </button>
        </div>
      ) : null}
      {attachError ? <p role="alert">{attachError}</p> : null}
      {!isLoading && !isError && data.length === 0 ? <p role="status">{t("empty")}</p> : null}

      {!isLoading && !isError && featured.length > 0 ? (
        <section className="space-y-3" aria-labelledby="brand-inspirations-strip-title" data-testid="brand-inspirations-strip">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{t("stripEyebrow")}</p>
            <h2 id="brand-inspirations-strip-title" className="mt-1 text-base font-semibold text-[var(--text-primary)]">{t("stripTitle")}</h2>
          </div>
          <div
            className="flex gap-4 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label={t("stripTitle")}
          >
            {featured.map((inspiration) => (
              <InspirationTile
                key={`strip:${inspirationKey(inspiration)}`}
                inspiration={inspiration}
                variant="strip"
                pending={pendingId === inspiration.id}
                onPreview={setPreview}
                onAttach={attach}
                t={t}
              />
            ))}
          </div>
        </section>
      ) : null}

      {!isLoading && !isError && data.length > 0 ? (
        <section className="space-y-4" aria-labelledby="brand-inspirations-library-title" data-testid="brand-inspirations-mosaic">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{t("libraryEyebrow")}</p>
              <h2 id="brand-inspirations-library-title" className="mt-1 text-base font-semibold text-[var(--text-primary)]">{t("libraryTitle")}</h2>
            </div>
            <div className="flex flex-wrap gap-2" aria-label={t("filtersAria")}>
              {ORIGIN_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={originFilter === filter.id}
                  onClick={() => setOriginFilter(filter.id)}
                  className={cn(
                    "h-8 rounded-full border px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                    originFilter === filter.id
                      ? "border-[var(--border-default)] bg-[var(--selection-bg)] text-[var(--selection-text)]"
                      : "border-[var(--border-default)] text-[var(--text-secondary)]",
                  )}
                >
                  {t(filter.labelKey)}
                </button>
              ))}
            </div>
          </div>
          {mosaic.length === 0 ? <p role="status">{t("empty")}</p> : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {mosaic.map((inspiration) => (
                <InspirationTile
                  key={`mosaic:${inspirationKey(inspiration)}`}
                  inspiration={inspiration}
                  variant="mosaic"
                  pending={pendingId === inspiration.id}
                  onPreview={setPreview}
                  onAttach={attach}
                  t={t}
                />
              ))}
            </div>
          )}
          {hasNextPage ? (
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="text-sm font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              {isFetchingNextPage ? t("loadingMore") : t("loadMore")}
            </button>
          ) : null}
        </section>
      ) : null}

      <Dialog open={Boolean(preview)} onOpenChange={(next) => !next && setPreview(null)}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>{preview?.title}</DialogTitle></DialogHeader>
          <DialogBody>
            {preview?.previewUrl ? <img src={preview.previewUrl} alt={t("previewAlt", { title: preview.title })} className="h-auto w-full" /> : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InspirationTile({
  inspiration,
  variant,
  pending,
  onPreview,
  onAttach,
  t,
}: {
  inspiration: CreativeInspiration;
  variant: "strip" | "mosaic";
  pending: boolean;
  onPreview: (inspiration: CreativeInspiration) => void;
  onAttach: (inspiration: CreativeInspiration) => void | Promise<void>;
  t: ReturnType<typeof useTranslations<"dashboard.home.composer.inspirations">>;
}) {
  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-inset)]",
        variant === "strip" && "w-[min(17rem,70vw)] shrink-0",
      )}
    >
      <button
        type="button"
        aria-label={t("previewAria", { title: inspiration.title })}
        onClick={() => onPreview(inspiration)}
        className="block w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        {inspiration.previewUrl ? (
          <img src={inspiration.previewUrl} alt="" className="aspect-[4/5] w-full object-cover" />
        ) : (
          <span className="flex aspect-[4/5] items-center justify-center text-[var(--text-muted)]"><ImageIcon /></span>
        )}
      </button>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[var(--surface-inset)] via-[color-mix(in_oklch,var(--surface-inset)_70%,transparent)] to-transparent p-3 pt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--selection-text)]">{t(`origin.${inspiration.source}`)}</p>
        <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{inspiration.title}</p>
        <button
          type="button"
          disabled={pending}
          onClick={() => void onAttach(inspiration)}
          className="pointer-events-auto mt-2 text-xs font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          {t("useForStyle")}
        </button>
      </div>
    </article>
  );
}
