import Link from "next/link";
import { previewWorkspace } from "../_fixtures/preview-data";

export default function CampaignWorkspacePreviewPage() {
  const ws = previewWorkspace;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <Link
            href="/v6/campaigns"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <span aria-hidden="true">←</span>
            Voltar para campanhas
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="product-page-title text-[var(--text-primary)]">{ws.name}</h1>
            <WorkspaceBadge variant={ws.statusClass} label={ws.status} />
          </div>
          <p className="text-sm text-[var(--text-secondary)]">{ws.meta}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-sm font-medium text-[var(--text-primary)]"
          >
            Enviar feedback
          </button>
          <button
            type="button"
            aria-label="Excluir campanha"
            className="grid h-9 w-9 place-items-center rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]"
          >
            🗑
          </button>
        </div>
      </header>

      <section aria-label="Estágios da campanha">
        <ol className="flex flex-wrap items-center gap-2 sm:gap-0">
          {ws.stages.map((stage, index) => {
            const step = index + 1;
            const isActive = step === ws.currentStage;
            const isPast = step < ws.currentStage;
            return (
              <li key={stage} className="flex items-center">
                <div
                  className={`flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 ${
                    isActive ? "bg-[var(--accent-primary-subtle)]" : ""
                  }`}
                  aria-current={isActive ? "step" : undefined}
                >
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${
                      isActive || isPast
                        ? "bg-[var(--accent-primary)] text-[var(--text-on-accent)]"
                        : "border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-muted)]"
                    }`}
                  >
                    {step}
                  </span>
                  <span
                    className={`text-sm font-medium ${
                      isActive ? "text-[var(--accent-primary-text)]" : "text-[var(--text-secondary)]"
                    }`}
                  >
                    {stage}
                  </span>
                </div>
                {index < ws.stages.length - 1 ? (
                  <span className="mx-1 hidden h-px w-6 bg-[var(--border-default)] sm:block" aria-hidden="true" />
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-5 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="flex items-baseline gap-3">
              <h2 className="product-section-title text-[var(--text-primary)]">Briefing</h2>
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">v1</span>
            </div>

            <div className="space-y-4">
              {ws.briefingSliders.map((slider) => (
                <div key={slider.label}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">{slider.label}</span>
                    <span className="font-mono text-[var(--text-primary)]">{slider.value}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-inset)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent-primary)]"
                      style={{ width: `${slider.value}%` }}
                      role="progressbar"
                      aria-valuenow={slider.value}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={slider.label}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Regras</p>
              <ul className="space-y-2 rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 text-sm text-[var(--text-secondary)]">
                {ws.briefingRules.map((rule) => (
                  <li key={rule} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--accent-primary)]" aria-hidden="true" />
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-3">
                <h2 className="product-section-title text-[var(--text-primary)]">Derivações</h2>
                <span className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-muted)]">
                  {ws.derivations.length}
                </span>
              </div>
              <button type="button" className="text-sm font-medium text-[var(--accent-primary-text)]">
                Ver todas →
              </button>
            </div>

            <ul className="grid gap-3 sm:grid-cols-2">
              {ws.derivations.map((derivation) => (
                <li
                  key={derivation.title}
                  className="overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]"
                >
                  <div
                    className={`relative flex h-28 items-center justify-center bg-gradient-to-br ${derivation.gradient}`}
                  >
                    <span className="font-mono text-lg font-bold tracking-widest text-white/90">{derivation.art}</span>
                    <WorkspaceBadge
                      variant={derivation.statusClass}
                      label={derivation.status}
                      className="absolute left-2 top-2"
                    />
                    <span className="absolute right-2 top-2 rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs text-white">
                      {derivation.score}
                    </span>
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{derivation.title}</p>
                    <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                      <span>{derivation.variations}</span>
                      <span className="font-mono">{derivation.version}</span>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        className="flex-1 rounded-[var(--radius-control)] border border-[var(--border-default)] py-1.5 text-xs font-medium text-[var(--text-primary)]"
                      >
                        Abrir
                      </button>
                      <button
                        type="button"
                        aria-label={`Mais opções para ${derivation.title}`}
                        className="grid h-7 w-7 place-items-center rounded-[var(--radius-control)] text-[var(--text-muted)] hover:bg-[var(--surface-inset)]"
                      >
                        ⋮
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function WorkspaceBadge({
  variant,
  label,
  className,
}: {
  variant: "success" | "warning" | "info" | "neutral";
  label: string;
  className?: string;
}) {
  const styles = {
    success: "bg-[var(--success-bg)] text-[var(--success-text)]",
    warning: "bg-[var(--warning-bg)] text-[var(--warning-text)]",
    info: "bg-[var(--info-bg)] text-[var(--info-text)]",
    neutral: "bg-[var(--neutral-bg)] text-[var(--neutral-text)]",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${styles[variant]} ${className ?? ""}`}>
      {label}
    </span>
  );
}
