import { previewOnboardingSteps } from "../_fixtures/preview-data";

export default function OnboardingPreviewPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 py-4">
      <header className="space-y-2 text-center">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Primeiro uso</p>
        <h1 className="product-page-title text-[var(--text-primary)]">Bem-vindo ao ADScale</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Três passos para sair do zero e gerar seu primeiro lote de variações.
        </p>
      </header>

      <ol className="space-y-4">
        {previewOnboardingSteps.map((item) => (
          <li
            key={item.step}
            className="flex gap-4 rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-5"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--accent-primary-subtle)] text-sm font-bold text-[var(--accent-primary-text)]">
              {item.step}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">{item.title}</h2>
              <p className="text-sm text-[var(--text-secondary)]">{item.description}</p>
              <button
                type="button"
                className="text-sm font-medium text-[var(--accent-primary-text)] hover:underline"
              >
                {item.cta} →
              </button>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex justify-center gap-3">
        <button
          type="button"
          className="rounded-[var(--radius-control)] border border-[var(--border-default)] px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)]"
        >
          Pular por agora
        </button>
        <button
          type="button"
          className="rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-medium text-[var(--text-on-accent)]"
        >
          Começar passo 1
        </button>
      </div>
    </div>
  );
}
