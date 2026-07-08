"use client";

import type { CreativeWorkOutput } from "@/lib/hooks/use-creative-work";

type CreativeProposalGridProps = {
  outputs: CreativeWorkOutput[];
  onRetry: (outputId: string) => void;
  onSelect: (outputId: string) => void;
  onSave: (outputId: string) => void;
  onDownload: (outputId: string) => void;
  /** Optional download-URL resolver for completed outputs. Falls back to a no-op
   * when not supplied (callers must open the URL via `window.open`). */
  resolveDownloadUrl?: (outputId: string) => string | null;
  isRetrying?: (outputId: string) => boolean;
  isSelecting?: (outputId: string) => boolean;
  isSaving?: (outputId: string) => boolean;
};

const LEVEL_ORDER: CreativeWorkOutput["creativeLevel"][] = ["conservative", "balanced", "bold"];

const LEVEL_LABELS: Record<CreativeWorkOutput["creativeLevel"], string> = {
  conservative: "Nível 1",
  balanced: "Nível 2",
  bold: "Nível 3",
};

const STATUS_LABELS: Record<CreativeWorkOutput["status"], string> = {
  queued: "Na fila",
  processing: "Processando",
  completed: "Pronto",
  failed: "Falhou",
};

/**
 * Renders the three creative proposals (conservative / balanced / bold) in a
 * fixed neutral order. By design NO option is labelled "recommended" or
 * "best" — the user picks the winner explicitly.
 */
export default function CreativeProposalGrid({
  outputs,
  onRetry,
  onSelect,
  onSave,
  onDownload,
  resolveDownloadUrl,
  isRetrying,
  isSelecting,
  isSaving,
}: CreativeProposalGridProps) {
  const byLevel = new Map(outputs.map((o) => [o.creativeLevel, o]));

  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      role="list"
      aria-label="Propostas criativas"
    >
      {LEVEL_ORDER.map((level) => {
        const output = byLevel.get(level);
        if (!output) {
          return (
            <div
              key={level}
              data-testid="proposal-level"
              data-level={level}
              role="listitem"
              className="rounded-[var(--radius-object)] border border-dashed border-[var(--border-subtle)] bg-[var(--surface-base)] p-4 text-sm text-[var(--text-muted)]"
            >
              <span data-testid="proposal-level-name">{LEVEL_LABELS[level]}</span>
            </div>
          );
        }

        const status = output.status;
        const isCompleted = status === "completed";
        const isFailed = status === "failed";
        const isInFlight = status === "queued" || status === "processing";

        return (
          <article
            key={output.id}
            data-testid="proposal-level"
            data-level={level}
            data-status={status}
            role="listitem"
            className="flex flex-col gap-3 rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4"
          >
            <header className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-[var(--text-primary)]">
                <span data-testid="proposal-level-name">{output.creativeLevel}</span>
              </h3>
              <span
                className="rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]"
                aria-label={`Status ${STATUS_LABELS[status]}`}
              >
                {STATUS_LABELS[status]}
              </span>
            </header>

            <div className="aspect-square w-full overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
              {isCompleted && output.outputKey ? (
                // The download endpoint streams the binary; preview is best-effort
                // via the same URL when the asset is reachable.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/creative-work/${output.workItemId}/outputs/${output.id}/download`}
                  alt={`Proposta nível ${LEVEL_LABELS[level]}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center text-xs text-[var(--text-muted)]"
                  role="status"
                >
                  {isFailed
                    ? "Falha na geração"
                    : isInFlight
                      ? "Gerando..."
                      : "Sem imagem"}
                </div>
              )}
            </div>

            {isFailed ? (
              <button
                type="button"
                onClick={() => onRetry(output.id)}
                disabled={isRetrying?.(output.id) ?? false}
                className="inline-flex min-h-[var(--control-touch)] items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-inset)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Repetir esta proposta
              </button>
            ) : null}

            {isCompleted ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onSelect(output.id)}
                  disabled={isSelecting?.(output.id) ?? false}
                  className="inline-flex min-h-[var(--control-touch)] flex-1 items-center justify-center rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-3 py-2 text-sm font-medium text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Selecionar
                </button>
                <button
                  type="button"
                  onClick={() => onSave(output.id)}
                  disabled={isSaving?.(output.id) ?? false}
                  className="inline-flex min-h-[var(--control-touch)] flex-1 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-inset)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Salvar na biblioteca
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const url = resolveDownloadUrl?.(output.id) ?? null;
                    if (url) {
                      window.open(url, "_blank", "noopener,noreferrer");
                    } else {
                      onDownload(output.id);
                    }
                  }}
                  className="inline-flex min-h-[var(--control-touch)] flex-1 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-inset)]"
                >
                  Baixar
                </button>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}