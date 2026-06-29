import { previewChatMessagesFull } from "../_fixtures/preview-data";
import { V6ChatShell } from "../_components/V6ChatPreviewPanels";

export default function ChatFullPreviewPage() {
  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Modo Chat</p>
        <h1 className="product-page-title text-[var(--text-primary)]">Chat modo completo</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Árvore de conversas, thread ativa e painel de contexto — layout desktop do mockup 06.
        </p>
      </header>
      <V6ChatShell messages={previewChatMessagesFull} />
    </div>
  );
}
