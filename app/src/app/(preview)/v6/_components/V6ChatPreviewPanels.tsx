import {
  previewChatContext,
  previewChatMessagesFull,
  previewChatThreads,
  type PreviewChatRole,
} from "../_fixtures/preview-data";

type ChatMessage = (typeof previewChatMessagesFull)[number];

export function V6ChatTreePanel() {
  return (
    <aside className="flex h-full flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-base)]" aria-label="Conversas">
      <div className="border-b border-[var(--border-subtle)] p-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Projetos</p>
        <button
          type="button"
          className="mt-2 w-full rounded-[var(--radius-control)] bg-[var(--accent-primary)] py-2 text-xs font-medium text-[var(--text-on-accent)]"
        >
          + Novo chat
        </button>
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto p-2">
        {previewChatThreads.map((thread) => (
          <li key={thread.id}>
            <button
              type="button"
              className={`w-full rounded-[var(--radius-control)] px-2.5 py-2 text-left transition-colors ${
                thread.active
                  ? "bg-[var(--accent-primary-subtle)] text-[var(--accent-primary-text)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
              }`}
              aria-current={thread.active ? "true" : undefined}
            >
              <span className="block truncate text-[11px] text-[var(--text-muted)]">{thread.client}</span>
              <span className="block truncate text-sm font-medium">{thread.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function V6ChatContextPanel() {
  const ctx = previewChatContext;
  return (
    <aside className="flex h-full flex-col border-l border-[var(--border-subtle)] bg-[var(--surface-base)]" aria-label="Contexto da campanha">
      <div className="border-b border-[var(--border-subtle)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Contexto</p>
        <h2 className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{ctx.campaign}</h2>
      </div>
      <dl className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        <ContextRow label="Objetivo" value={ctx.objective} />
        <ContextRow label="Público" value={ctx.audience} />
        <ContextRow label="Tom" value={ctx.tone} />
        <ContextRow label="Plataformas" value={ctx.platforms} />
      </dl>
      <div className="border-t border-[var(--border-subtle)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Créditos</p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--text-primary)]">{ctx.credits}</p>
      </div>
    </aside>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-0.5 text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

export function V6ChatMessageList({
  messages,
  showError,
}: {
  messages: readonly ChatMessage[];
  showError?: boolean;
}) {
  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4" role="log" aria-label="Mensagens do chat">
      {messages.map((message) => (
        <ChatBubble key={message.id} message={message} />
      ))}
      {showError ? <ChatErrorBanner /> : null}
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.role === "action_card") {
    return <PreviewActionCard message={message} />;
  }

  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-[var(--radius-panel)] px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-[var(--accent-primary)] text-[var(--text-on-accent)]"
            : "border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
        }`}
      >
        <MessageContent content={message.content} role={message.role} />
      </div>
    </div>
  );
}

function MessageContent({ content, role }: { content: string; role: PreviewChatRole }) {
  if (role === "assistant") {
    const parts = content.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p>
        {parts.map((part, i) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={i}>{part.slice(2, -2)}</strong>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </p>
    );
  }
  return <p>{content}</p>;
}

function PreviewActionCard({ message }: { message: Extract<ChatMessage, { role: "action_card" }> }) {
  const payload = message.payload;

  return (
    <article className="rounded-[var(--radius-object)] border border-[var(--border-default)] bg-[var(--surface-base)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{payload.title}</h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{payload.description}</p>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--success-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--success-text)]">
          {payload.risk}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3">
        <span className="font-mono text-xs text-[var(--text-muted)]">{payload.credits} créditos</span>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-[var(--radius-control)] border border-[var(--border-default)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-medium text-[var(--text-on-accent)]"
          >
            Confirmar
          </button>
        </div>
      </div>
    </article>
  );
}

function ChatErrorBanner() {
  return (
    <div
      role="alert"
      className="rounded-[var(--radius-panel)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4 text-sm text-[var(--danger-text)]"
    >
      Falha ao enviar mensagem. Verifique sua conexão e tente novamente.
    </div>
  );
}

export function V6ChatInput({ placeholder = "Descreva o que precisa…" }: { placeholder?: string }) {
  return (
    <div className="border-t border-[var(--border-subtle)] bg-[var(--surface-base)] p-3">
      <div className="flex items-end gap-2 rounded-[var(--radius-panel)] border border-[var(--border-default)] bg-[var(--surface-raised)] p-2">
        <textarea
          rows={2}
          placeholder={placeholder}
          aria-label="Mensagem"
          className="min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-1 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          defaultValue=""
        />
        <button
          type="button"
          aria-label="Enviar mensagem"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--accent-primary)] text-[var(--text-on-accent)]"
        >
          ↑
        </button>
      </div>
    </div>
  );
}

export function V6ChatShell({
  messages,
  showContext = true,
  showError,
  compact,
}: {
  messages: readonly ChatMessage[];
  showContext?: boolean;
  showError?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`grid overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] ${
        showContext ? "lg:grid-cols-[200px_1fr_240px]" : "lg:grid-cols-[200px_1fr]"
      } ${compact ? "min-h-[420px]" : "min-h-[560px]"}`}
    >
      <V6ChatTreePanel />
      <section className="flex min-w-0 flex-col border-x border-[var(--border-subtle)]">
        <header className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">Verão 2024 — Natura</p>
            <p className="text-xs text-[var(--text-muted)]">Modo Chat · briefing em andamento</p>
          </div>
          <span className="rounded-full bg-[var(--warning-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--warning-text)]">
            Piloto
          </span>
        </header>
        <V6ChatMessageList messages={messages} showError={showError} />
        <V6ChatInput />
      </section>
      {showContext ? <V6ChatContextPanel /> : null}
    </div>
  );
}
