import ChatPromoHero from "../_components/ChatPromoHero";
import { previewKpis, previewActivity } from "../_fixtures/preview-data";

export default function TopbarPromoPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="product-page-title text-[var(--text-primary)]">
          Bom dia, Jhonatan.
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Você tem <strong className="text-[var(--text-primary)]">3 campanhas em revisão</strong> e{" "}
          <strong className="text-[var(--accent-primary-text)]">2 derivações prontas pra aprovar</strong>.
        </p>
      </header>

      <section aria-label="KPIs">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {previewKpis.map((kpi) => (
            <li
              key={kpi.label}
              className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-5"
            >
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-primary)]" />
                {kpi.label}
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
                {kpi.value}
              </div>
              <div className="mt-1 text-xs text-[var(--text-secondary)]">
                {kpi.trendDir === "up" && <span aria-hidden="true">▲ </span>}
                {kpi.trend}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <ChatPromoHero />

      <section aria-label="Atividade recente">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="product-section-title text-[var(--text-primary)]">Atividade recente</h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Últimas campanhas e derivações aprovadas pelo time.
            </p>
          </div>
          <button
            type="button"
            className="text-xs font-medium text-[var(--accent-primary-text)] hover:text-[var(--accent-primary)]"
          >
            Ver todas →
          </button>
        </div>

        <div className="overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              <tr>
                <th scope="col" className="px-4 py-3">Campanha</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="hidden px-4 py-3 sm:table-cell">Plataforma</th>
                <th scope="col" className="px-4 py-3">Variações</th>
                <th scope="col" className="hidden px-4 py-3 md:table-cell">Atualizada</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Abrir</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {previewActivity.map((row) => (
                <tr key={row.name} className="transition-colors hover:bg-[var(--surface-raised)]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 place-items-center rounded-[var(--radius-control)] bg-[var(--surface-raised)] text-base" aria-hidden="true">
                        {row.thumb}
                      </span>
                      <div>
                        <div className="font-medium text-[var(--text-primary)]">{row.name}</div>
                        <div className="text-xs text-[var(--text-muted)]">{row.author} · {row.updated}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill variant={row.statusClass} label={row.status} />
                  </td>
                  <td className="hidden px-4 py-3 text-[var(--text-secondary)] sm:table-cell">{row.platforms}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">{row.variations}</td>
                  <td className="hidden px-4 py-3 text-xs text-[var(--text-secondary)] md:table-cell">{row.updated}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      aria-label={`Abrir ${row.name}`}
                      className="grid h-7 w-7 place-items-center rounded-[var(--radius-control)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-[var(--text-muted)]">
        {/* {{ pendência: métricas (KPIs, variações, créditos) são fixtures do mockup 08 — mapear pra queries reais na Fase 2 }} */}
        Métricas são fixtures do mockup 08. Mapeamento pra queries reais na Fase 2 (Wave 1 — Painel).
      </p>
    </div>
  );
}

function StatusPill({ variant, label }: { variant: string; label: string }) {
  const styles: Record<string, string> = {
    running: "bg-[var(--warning-bg)] text-[var(--warning-text)]",
    review: "bg-[var(--warning-bg)] text-[var(--warning-text)]",
    approved: "bg-[var(--success-bg)] text-[var(--success-text)]",
    draft: "bg-[var(--neutral-bg)] text-[var(--neutral-text)]",
  };
  const dotColor: Record<string, string> = {
    running: "bg-[var(--warning-dot)]",
    review: "bg-[var(--warning-dot)]",
    approved: "bg-[var(--success-dot)]",
    draft: "bg-[var(--neutral-dot)]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles[variant] ?? styles.draft}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor[variant] ?? dotColor.draft}`} />
      {label}
    </span>
  );
}
