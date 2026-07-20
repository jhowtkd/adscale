"use client";

import { useMemo, useState } from "react";
import { ImageIcon } from "lucide-react";
import CampaignMasonryGrid, {
  CampaignMasonryGridItem,
} from "@/components/dashboard/CampaignMasonryGrid";
import { useCreativeInspirations } from "@/lib/hooks/use-creative-inspirations";
import type { CreativeInspiration } from "@/server/application/list-creative-inspirations";

export function shuffleInspirations<T>(
  inspirations: readonly T[],
  random: () => number = Math.random,
): T[] {
  const shuffled = [...inspirations];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function BrandInspirations({ clientProfileId, onAttach }: {
  clientProfileId: string | null;
  onAttach: (inspiration: CreativeInspiration) => void | Promise<void>;
}) {
  const { data = [], isLoading, isError, refetch } = useCreativeInspirations(clientProfileId);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const randomizedInspirations = useMemo(() => shuffleInspirations(data), [data]);

  return (
    <section aria-labelledby="brand-inspirations-title">
      <h2 id="brand-inspirations-title" className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
        Inspirações
      </h2>
      {isLoading ? (
        <p role="status" className="h-32 animate-pulse rounded-[var(--radius-object)] bg-[var(--surface-raised)] p-4 text-sm text-[var(--text-muted)]">
          Carregando inspirações
        </p>
      ) : isError ? (
        <div className="rounded-[var(--radius-object)] border border-[var(--danger-border)] bg-[var(--surface-raised)] p-4">
          <p role="alert" className="text-sm text-[var(--danger-text)]">Não foi possível carregar as inspirações.</p>
          <button type="button" onClick={() => void refetch()} className="mt-3 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]">
            Tentar novamente
          </button>
        </div>
      ) : data.length === 0 ? (
        <p role="status" className="rounded-[var(--radius-object)] border border-dashed border-[var(--border-subtle)] p-4 text-sm text-[var(--text-muted)]">
          Nenhuma inspiração disponível ainda.
        </p>
      ) : (
        <CampaignMasonryGrid
          data-testid="brand-inspirations-grid"
          className="sm:columns-2 lg:columns-3 2xl:columns-3 [column-gap:0.75rem]"
        >
          {randomizedInspirations.map((inspiration) => (
            <CampaignMasonryGridItem
              key={`${inspiration.source}:${inspiration.id}`}
              className="mb-3"
            >
              <button
                type="button"
                aria-label={`Usar inspiração ${inspiration.title}`}
                disabled={pendingId === inspiration.id}
                onClick={() => {
                  setPendingId(inspiration.id);
                  void Promise.resolve(onAttach(inspiration)).finally(() => setPendingId(null));
                }}
                className="block w-full overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] transition-colors hover:border-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-60"
              >
                {inspiration.previewUrl ? (
                  // The browser's intrinsic image ratio is the masonry height.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt=""
                    src={inspiration.previewUrl}
                    loading="lazy"
                    className="block h-auto w-full"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex aspect-[4/3] items-center justify-center bg-[var(--surface-inset)] text-[var(--text-muted)]"
                  >
                    <ImageIcon size={22} />
                  </span>
                )}
              </button>
            </CampaignMasonryGridItem>
          ))}
        </CampaignMasonryGrid>
      )}
    </section>
  );
}
