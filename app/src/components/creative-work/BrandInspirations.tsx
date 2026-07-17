"use client";

import { useState } from "react";
import { useCreativeInspirations } from "@/lib/hooks/use-creative-inspirations";
import type { CreativeInspiration } from "@/server/application/list-creative-inspirations";

export function BrandInspirations({ clientProfileId, onAttach }: {
  clientProfileId: string | null;
  onAttach: (inspiration: CreativeInspiration) => void | Promise<void>;
}) {
  const { data = [], isLoading, isError } = useCreativeInspirations(clientProfileId);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (!clientProfileId || isError || (!isLoading && data.length === 0)) return null;

  return (
    <section aria-labelledby="brand-inspirations-title">
      <h2 id="brand-inspirations-title" className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
        Inspirações da marca
      </h2>
      {isLoading ? (
        <div className="h-32 animate-pulse rounded-[var(--radius-object)] bg-[var(--surface-raised)]" aria-label="Carregando inspirações" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((inspiration) => (
            <button
              key={`${inspiration.source}:${inspiration.id}`}
              type="button"
              aria-label={`Usar inspiração ${inspiration.title}`}
              disabled={pendingId === inspiration.id}
              onClick={() => {
                setPendingId(inspiration.id);
                void Promise.resolve(onAttach(inspiration)).finally(() => setPendingId(null));
              }}
              className="overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-left hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-60"
            >
              <span
                aria-hidden="true"
                className="block aspect-[4/3] bg-[var(--surface-inset)] bg-cover bg-center"
                style={inspiration.previewUrl ? { backgroundImage: `url(${inspiration.previewUrl})` } : undefined}
              />
              <span className="block p-3">
                <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{inspiration.title}</span>
                <span className="mt-1 block text-xs text-[var(--text-muted)]">
                  {inspiration.source === "template" ? "Template" : "Trabalho aprovado"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
