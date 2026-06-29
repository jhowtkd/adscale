import {
  previewActivity,
  previewBriefingRows,
  previewHeroMeta,
  previewKpis,
  previewRecipes,
} from "../_fixtures/preview-data";

export default function DashboardPreviewPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="product-page-title text-[var(--text-primary)]">Bom dia, Jhonatan.</h1>
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
              <div className="mt-2 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">{kpi.value}</div>
              <div className="mt-1 text-xs text-[var(--text-secondary)]">
                {kpi.trendDir === "up" && <span aria-hidden="true">▲ </span>}
                {kpi.trend}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="relative overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-6 sm:p-8"
        aria-label="Campanha em produção"
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 0% 50%, color-mix(in oklch, var(--accent-primary) 10%, transparent), transparent 50%), radial-gradient(circle at 100% 0%, color-mix(in oklch, var(--accent-primary) 8%, transparent), transparent 50%)",
          }}
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-8">
          <div className="flex-1 space-y-4">
            <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[var(--accent-primary-text)]">
              <span className="animate-pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-primary)]" />
              Campanha em produção · Piloto
            </span>
            <h2 className="product-page-title text-[var(--text-primary)]">Verão 2024 — Natura</h2>
            <p className="max-w-xl text-sm text-[var(--text-secondary)]">
              Briefing concluído · gerando 24 variações em 3 tamanhos · última execução em 47s.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-medium text-[var(--text-on-accent)]"
              >
                Abrir campanha
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-5 py-2.5 text-sm font-medium text-[var(--text-primary)]"
              >
                Ver briefing
              </button>
            </div>
          </div>
          <dl className="min-w-[220px] space-y-2 rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
            <MetaRow label="Briefing" value="● 100%" accent />
            <MetaRow label="Variações" value={`${previewHeroMeta.variationsDone} / ${previewHeroMeta.variationsTotal}`} />
            <MetaRow label="Aprovadas" value={String(previewHeroMeta.approved)} accent />
            <MetaRow label="Créditos" value={String(previewHeroMeta.credits)} />
          </dl>
        </div>
      </section>

      <ActivitySection />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-5 sm:p-6">
          <h2 className="product-section-title text-[var(--text-primary)]">Receitas salvas</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Briefings que viraram template. Reaproveite a próxima campanha com 1 clique.
          </p>
          <ul className="mt-4 space-y-2.5">
            {previewRecipes.map((recipe) => (
              <li
                key={recipe.name}
                className="flex items-center gap-3 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3"
              >
                <span className="grid h-8 w-8 place-items-center rounded-[var(--radius-control)] bg-[var(--accent-primary-subtle)] text-sm" aria-hidden="true">
                  {recipe.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">{recipe.name}</p>
                  <p className="truncate text-xs text-[var(--text-muted)]">{recipe.desc}</p>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-[var(--text-muted)]">{recipe.count}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-5 sm:p-6">
          <h2 className="product-section-title text-[var(--text-primary)]">Briefing ativo</h2>
          <dl className="mt-4 divide-y divide-[var(--border-subtle)]">
            {previewBriefingRows.map((row) => (
              <div key={row.key} className="flex items-start justify-between gap-3 py-2.5 first:pt-0">
                <dt className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{row.key}</dt>
                <dd className="max-w-[60%] text-right text-sm text-[var(--text-primary)]">{row.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex gap-2 border-t border-[var(--border-subtle)] pt-4">
            <button type="button" className="flex-1 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] py-2 text-sm font-medium text-[var(--text-primary)]">
              Editar
            </button>
            <button type="button" className="flex-1 rounded-[var(--radius-control)] bg-[var(--accent-primary)] py-2 text-sm font-medium text-[var(--text-on-accent)]">
              Ir para ações
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetaRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 last:border-0 last:pb-0">
      <dt className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</dt>
      <dd className={`text-sm font-medium ${accent ? "text-[var(--accent-primary-text)]" : "text-[var(--text-primary)]"}`}>{value}</dd>
    </div>
  );
}

function ActivitySection() {
  return (
    <section aria-label="Atividade recente">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="product-section-title text-[var(--text-primary)]">Atividade recente</h2>
          <p className="text-xs text-[var(--text-secondary)]">Últimas campanhas e derivações aprovadas pelo time.</p>
        </div>
        <button type="button" className="text-xs font-medium text-[var(--accent-primary-text)]">
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
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {previewActivity.map((row) => (
              <tr key={row.name} className="hover:bg-[var(--surface-raised)]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-[var(--radius-control)] bg-[var(--surface-raised)] text-base" aria-hidden="true">
                      {row.thumb}
                    </span>
                    <div>
                      <div className="font-medium text-[var(--text-primary)]">{row.name}</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {row.author} · {row.updated}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusPill variant={row.statusClass} label={row.status} />
                </td>
                <td className="hidden px-4 py-3 text-[var(--text-secondary)] sm:table-cell">{row.platforms}</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">{row.variations}</td>
                <td className="hidden px-4 py-3 text-xs text-[var(--text-secondary)] md:table-cell">{row.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles[variant] ?? styles.draft}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor[variant] ?? dotColor.draft}`} />
      {label}
    </span>
  );
}
