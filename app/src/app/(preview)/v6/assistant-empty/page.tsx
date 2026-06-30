export default function AssistantEmptyPreviewPage() {
  return (
    <div className="flex min-h-[480px] flex-col items-center justify-center gap-6 p-8 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-2xl text-[var(--text-muted)]">
        💬
      </span>
      <div className="max-w-md space-y-2">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">No que devemos trabalhar?</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Comece a conversar com o assistente do ADScale. Seu trabalho fica salvo em projetos e conversas na
          barra lateral.
        </p>
      </div>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          className="flex flex-col items-start gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 text-left transition-colors hover:border-[var(--accent-primary)]"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent-primary-subtle)] text-[var(--accent-primary)]">
            🖼
          </span>
          <span className="text-sm font-medium text-[var(--text-primary)]">Já tenho peça</span>
          <span className="text-xs text-[var(--text-muted)]">
            Envie ou selecione um criativo existente para diagnóstico e melhoria
          </span>
        </button>
        <button
          type="button"
          className="flex flex-col items-start gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 text-left transition-colors hover:border-[var(--accent-primary)]"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent-primary-subtle)] text-[var(--accent-primary)]">
            ✨
          </span>
          <span className="text-sm font-medium text-[var(--text-primary)]">Produzir do zero</span>
          <span className="text-xs text-[var(--text-muted)]">
            Monte um brief estratégico e referências visuais antes de gerar
          </span>
        </button>
      </div>

      <div className="w-full max-w-xl">
        <div className="flex items-end gap-2 rounded-[var(--radius-panel)] border border-[var(--border-default)] bg-[var(--surface-raised)] p-2">
          <textarea
            rows={2}
            placeholder="Briefing inicial — cole um link, descreva o cliente ou peça uma sugestão"
            aria-label="Briefing inicial"
            className="min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-1 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
          <button
            type="button"
            aria-label="Enviar"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--accent-primary)] text-[var(--text-on-accent)]"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
