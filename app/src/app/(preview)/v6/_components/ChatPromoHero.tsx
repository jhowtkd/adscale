"use client";

import { previewHeroMeta } from "../_fixtures/preview-data";

export default function ChatPromoHero() {
  return (
    <section className="gradient-hero-surface relative overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] p-6 sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-8">
        <div className="flex-1.4 space-y-4 lg:flex-[1.4]">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--text-secondary)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--neutral-dot)]" />
            Novo · Modo Chat
          </span>

          <h2 className="product-page-title text-balance text-[var(--text-primary)]">
            Em vez de clicar em cards,
            <br />
            converse com o ADScale.
          </h2>

          <p className="max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
            Briefing guiado, action cards com custo explícito, action reversível.
            Você aprova cada decisão — o ADScale executa. Sem formulários de 8 campos.
          </p>

          <div className="flex flex-wrap gap-3">
            <a
              href="/assistant"
              className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-medium text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-primary-hover)]"
            >
              <span aria-hidden="true">💬</span> Abrir modo Chat
            </a>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-5 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-inset)]"
            >
              Ver como funciona
            </button>
          </div>
        </div>

        <dl className="flex-1 space-y-2 rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4 lg:flex-1">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
            <dt className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Briefing</dt>
            <dd className="text-sm font-medium text-[var(--accent-primary-text)]">● 100%</dd>
          </div>
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
            <dt className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Variações</dt>
            <dd className="text-sm text-[var(--text-primary)]">{previewHeroMeta.variationsDone} / {previewHeroMeta.variationsTotal}</dd>
          </div>
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
            <dt className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Aprovadas</dt>
            <dd className="text-sm font-medium text-[var(--accent-primary-text)]">{previewHeroMeta.approved}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Créditos</dt>
            <dd className="text-sm text-[var(--text-primary)]">{previewHeroMeta.credits}</dd>
          </div>
        </dl>
      </div>

      <p className="mt-4 text-xs text-[var(--text-muted)]">
        {/* {{ pendência: confirmar copy do hero com Jhonatan — texto do mockup 08 }} */}
        Preview do hero promo. Copy é do mockup 08.
      </p>
    </section>
  );
}
