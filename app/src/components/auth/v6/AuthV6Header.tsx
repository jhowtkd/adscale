type AuthV6HeaderProps = {
  sectionLabel: string;
  title: string;
  subtitle: string;
};

export default function AuthV6Header({ sectionLabel, title, subtitle }: AuthV6HeaderProps) {
  return (
    <header className="space-y-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
        {sectionLabel}
      </p>
      <h1 className="product-page-title text-[var(--text-primary)]">{title}</h1>
      {subtitle ? <p className="text-sm text-[var(--text-secondary)]">{subtitle}</p> : null}
    </header>
  );
}
