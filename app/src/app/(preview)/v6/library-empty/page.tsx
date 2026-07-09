export default function LibraryEmptyPreviewPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            Workspace · Assets
          </p>
          <h1 className="product-page-title text-[var(--text-primary)]">Biblioteca</h1>
          <p className="text-sm text-[var(--text-secondary)]">Assets, referências e materiais do workspace</p>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-[var(--text-on-accent)]"
        >
          ↑ Upload
        </button>
      </header>

      <section className="overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)]">
        <button
          type="button"
          aria-label="Enviar primeiro asset"
          className="flex w-full flex-col items-center justify-center gap-3 px-6 py-16 text-center transition-colors hover:bg-[var(--surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          <span
            className="grid h-14 w-14 place-items-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-2xl text-[var(--text-muted)]"
            aria-hidden="true"
          >
            📁
          </span>
          <span className="text-lg font-semibold text-[var(--text-primary)]">Nenhum asset na biblioteca ainda</span>
          <span className="max-w-md text-sm text-[var(--text-secondary)]">
            Envie criativos base, logos e referências — eles alimentam seu briefing e fluxo de batch.
          </span>
          <span className="mt-2 rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-medium text-[var(--text-on-accent)]">
            Fazer primeiro upload
          </span>
          <span className="text-xs text-[var(--text-muted)]">PNG, JPG, WebP até 10 MB</span>
        </button>
      </section>
    </div>
  );
}
