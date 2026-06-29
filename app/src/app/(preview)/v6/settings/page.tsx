import { previewSettingsCards } from "../_fixtures/preview-data";

export default function SettingsPreviewPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2 border-b border-[var(--border-subtle)] pb-6">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">configurações</p>
        <h1 className="product-page-title text-[var(--text-primary)]">Configurações do workspace</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Gerencie perfil, equipe, marca, cobrança e integrações em um só lugar
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {previewSettingsCards.map((card) => (
          <li key={card.title}>
            <article
              className={`flex h-full flex-col gap-3 rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-5 transition-colors ${
                card.enabled ? "hover:border-[var(--border-default)]" : "opacity-55"
              }`}
            >
              <span className="grid h-10 w-10 place-items-center rounded-[var(--radius-control)] bg-[var(--accent-primary-subtle)] text-[var(--accent-primary)]">
                <SettingsIcon title={card.title} />
              </span>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">{card.title}</h2>
              <p className="flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">{card.description}</p>
              <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
                <SettingsBadge variant={card.badgeClass} label={card.badge} />
                <span className="text-sm text-[var(--text-muted)]">{card.enabled ? "Abrir →" : "—"}</span>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SettingsBadge({
  variant,
  label,
}: {
  variant: "success" | "warning" | "neutral";
  label: string;
}) {
  const styles = {
    success: "bg-[var(--success-bg)] text-[var(--success-text)]",
    warning: "bg-[var(--warning-bg)] text-[var(--warning-text)]",
    neutral: "bg-[var(--neutral-bg)] text-[var(--neutral-text)]",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[variant]}`}>{label}</span>
  );
}

function SettingsIcon({ title }: { title: string }) {
  const icons: Record<string, string> = {
    Equipe: "👥",
    "Brand Kit": "◇",
    Perfil: "👤",
    Workspace: "🖥",
    Faturamento: "💳",
    Planos: "📦",
  };
  return <span aria-hidden="true">{icons[title] ?? "⚙"}</span>;
}
