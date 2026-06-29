import { previewChatMessagesShort } from "../_fixtures/preview-data";
import { V6ChatInput, V6ChatMessageList } from "../_components/V6ChatPreviewPanels";

export default function ChatDrawerPreviewPage() {
  return (
    <div className="relative min-h-[520px]">
      <div className="space-y-6 opacity-40" aria-hidden="true">
        <header className="space-y-2">
          <h1 className="product-page-title text-[var(--text-primary)]">Bom dia, Jhonatan.</h1>
          <p className="text-sm text-[var(--text-secondary)]">Dashboard em segundo plano — mockup 07.</p>
        </header>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {["Campanhas ativas", "Variações", "Aprovação", "Créditos"].map((label) => (
            <div
              key={label}
              className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4"
            >
              <p className="text-xs text-[var(--text-muted)]">{label}</p>
              <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">—</p>
            </div>
          ))}
        </div>
      </div>

      <aside
        className="absolute inset-y-0 right-0 z-10 flex w-full max-w-md flex-col border-l border-[var(--border-default)] bg-[var(--surface-base)] shadow-2xl"
        aria-label="Chat drawer"
      >
        <header className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">Assistente ADScale</p>
            <p className="text-xs text-[var(--text-muted)]">Verão 2024 — Natura</p>
          </div>
          <button type="button" aria-label="Fechar drawer" className="text-[var(--text-muted)]">
            ✕
          </button>
        </header>
        <V6ChatMessageList messages={previewChatMessagesShort} />
        <V6ChatInput placeholder="Continue a conversa…" />
      </aside>
    </div>
  );
}
