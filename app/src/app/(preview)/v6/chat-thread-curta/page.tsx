import { previewChatMessagesShort } from "../_fixtures/preview-data";
import { V6ChatShell } from "../_components/V6ChatPreviewPanels";

export default function ChatThreadCurtaPreviewPage() {
  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Thread curta</p>
        <h1 className="product-page-title text-[var(--text-primary)]">Conversa inicial</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Mockup 10 — poucas mensagens antes da action card ou confirmação.
        </p>
      </header>
      <V6ChatShell messages={previewChatMessagesShort} showContext={false} compact />
    </div>
  );
}
