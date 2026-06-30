import { previewErrorState } from "../_fixtures/preview-data";

export default function ErrorStatePreviewPage() {
  const error = previewErrorState;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Error state</p>
        <h1 className="product-page-title text-[var(--text-primary)]">Falha na geração</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Mockup 11 — feedback claro quando uma ação do assistente falha.
        </p>
      </header>

      <section
        role="alert"
        className="rounded-[var(--radius-object)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-6 sm:p-8"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--danger-bg)] text-xl"
            aria-hidden="true"
          >
            ⚠
          </span>
          <div className="flex-1 space-y-3">
            <h2 className="text-lg font-semibold text-[var(--danger-text)]">{error.title}</h2>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{error.message}</p>
            <p className="font-mono text-[11px] text-[var(--text-muted)]">Código: {error.code}</p>
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                className="rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-[var(--text-on-accent)]"
              >
                {error.retryLabel}
              </button>
              <button
                type="button"
                className="rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] px-4 py-2 text-sm font-medium text-[var(--text-primary)]"
              >
                {error.supportLabel}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4 opacity-60">
        <p className="text-xs text-[var(--text-muted)]">Contexto: workspace Verão 2024 — Natura · ação cancelada automaticamente</p>
      </div>
    </div>
  );
}
