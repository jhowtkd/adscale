"use client";

import { useState } from "react";
import { useCreativeInspirations } from "@/lib/hooks/use-creative-inspirations";
import type { CreativeInspiration } from "@/server/application/list-creative-inspirations";

export function BrandInspirations({ clientProfileId, onAttach }: {
  clientProfileId: string | null;
  onAttach: (inspiration: CreativeInspiration) => void | Promise<void>;
}) {
  const { data = [], isLoading, isError, refetch } = useCreativeInspirations(clientProfileId);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (!clientProfileId) return null;

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
                  {inspiration.source === "template"
                    ? "Template"
                    : inspiration.source === "curated"
                      ? "Seleção ADScale"
                      : "Trabalho aprovado"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
