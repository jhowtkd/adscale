import { previewCampaignList } from "../_fixtures/preview-data";

export default function CampaignsPreviewPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="rounded border border-[var(--border-default)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              v1
            </span>
            <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Campanhas</span>
          </div>
          <h1 className="product-page-title text-[var(--text-primary)]">12 campanhas</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Gerencie, duplique e arquive suas campanhas. Selecione várias para ações em lote.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)]"
          >
            Ordenar: Atualização
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-[var(--text-on-accent)]"
          >
            + Nova campanha
          </button>
        </div>
      </header>

      <section className="overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)]">
        <div
          className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] p-3"
          role="toolbar"
          aria-label="Filtros de campanha"
        >
          <div className="relative min-w-[220px] max-w-xs flex-1">
            <input
              type="search"
              placeholder="Buscar campanha, peça ou cliente…"
              aria-label="Buscar campanha"
              className="w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>
          <FilterChip label="Status: Todos" count="12" />
          <FilterChip label="Plataforma: Todas" />
          <div className="ml-auto inline-flex rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] p-0.5">
            <button type="button" aria-pressed="true" className="rounded bg-[var(--accent-primary)] px-2 py-1.5 text-[var(--text-on-accent)]">
              Lista
            </button>
            <button type="button" aria-pressed="false" className="rounded px-2 py-1.5 text-[var(--text-muted)]">
              Grade
            </button>
          </div>
        </div>

        <ul className="divide-y divide-[var(--border-subtle)]">
          {previewCampaignList.map((campaign) => (
            <li
              key={campaign.name}
              className="grid grid-cols-[auto_40px_minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-4 py-3 hover:bg-[var(--surface-raised)] sm:gap-3.5"
            >
              <input type="checkbox" aria-label={`Selecionar campanha ${campaign.name}`} className="size-4 accent-[var(--accent-primary)]" />
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--accent-primary-subtle)] text-[10px] font-bold text-[var(--accent-primary-text)]"
                aria-hidden="true"
              >
                {campaign.initials}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium text-[var(--text-primary)]">{campaign.name}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {campaign.variations} variações ·{" "}
                  <span className="text-[var(--accent-primary-text)]">{campaign.approved} aprovadas</span>
                </p>
              </div>
              <CampaignBadge variant={campaign.statusClass} label={campaign.status} />
              <span className="hidden text-xs text-[var(--text-secondary)] sm:inline">{campaign.updated}</span>
              <button type="button" aria-label={`Ações para ${campaign.name}`} className="grid h-8 w-8 place-items-center rounded-[var(--radius-control)] text-[var(--text-muted)] hover:bg-[var(--surface-inset)]">
                ⋮
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function FilterChip({ label, count }: { label: string; count?: string }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]"
    >
      {label}
      {count ? (
        <span className="rounded border border-[var(--border-subtle)] px-1.5 py-px font-mono text-[10px] text-[var(--text-muted)]">
          {count}
        </span>
      ) : null}
    </button>
  );
}

function CampaignBadge({
  variant,
  label,
}: {
  variant: "success" | "warning" | "info" | "neutral";
  label: string;
}) {
  const styles = {
    success: "bg-[var(--success-bg)] text-[var(--success-text)]",
    warning: "bg-[var(--warning-bg)] text-[var(--warning-text)]",
    info: "bg-[var(--info-bg)] text-[var(--info-text)]",
    neutral: "bg-[var(--neutral-bg)] text-[var(--neutral-text)]",
  };
  return (
    <span className={`hidden rounded-full px-2.5 py-1 text-xs font-medium md:inline ${styles[variant]}`}>
      {label}
    </span>
  );
}
