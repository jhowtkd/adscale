import { previewLibraryAssets } from "../_fixtures/preview-data";

export default function LibraryPreviewPage() {
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
        <div
          className="flex flex-col items-center justify-center gap-2 border-b border-dashed border-[var(--border-default)] bg-[var(--surface-raised)] px-6 py-10 text-center"
          role="button"
          tabIndex={0}
          aria-label="Arraste arquivos aqui ou clique para selecionar"
        >
          <span className="text-2xl text-[var(--text-muted)]" aria-hidden="true">
            ↑
          </span>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Arraste arquivos aqui ou clique para selecionar
          </p>
          <p className="text-xs text-[var(--text-muted)]">PNG, JPG, WebP até 10 MB</p>
        </div>

        <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="search"
            placeholder="Buscar asset por nome ou tag…"
            aria-label="Buscar asset"
            className="w-full max-w-md rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
          <p className="shrink-0 font-mono text-xs text-[var(--text-muted)]">
            <span className="text-[var(--text-primary)]">{previewLibraryAssets.length}</span> de{" "}
            <span className="text-[var(--text-primary)]">84</span> assets
          </p>
        </div>

        <ul className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {previewLibraryAssets.map((asset) => (
            <li
              key={asset.name}
              className="overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]"
            >
              <div
                className={`relative flex h-32 items-center justify-center bg-gradient-to-br ${asset.gradient}`}
                aria-hidden="true"
              >
                <span className="font-mono text-sm font-bold tracking-widest text-white/80">{asset.glyph}</span>
              </div>
              <div className="space-y-2 p-3">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">{asset.name}</p>
                <div className="flex flex-wrap gap-1">
                  {asset.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span className="font-mono">{asset.size}</span>
                  <span>{asset.weight}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
