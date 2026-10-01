"use client";

import { CircleCheck, LibraryBig } from "lucide-react";
import { stripThinkBlocks } from "@/server/assistant/model/reasoning-sanitizer";
import { renderMarkdownLite } from "./markdown-lite";
import { MessageTime } from "./conversation/ConversationRows";

/**
 * Centered muted feed line: "Redação IA criou a v2", "Bruna entrou na conversa". In the rail conversation it carries
 * the icon of what happened and the time: "✓ Você confirmou nome, logo, cores e fontes · 10:05".
 */
export function EquipeEventLine({ text, icon, at }: { text: string; icon?: "check" | "library"; at?: string | Date }) {
  if (!text.trim()) return null;
  const Icon = icon === "library" ? LibraryBig : icon === "check" ? CircleCheck : null;
  return (
    <div
      className="mx-auto flex max-w-[85%] items-center justify-center gap-1.5 text-center text-xs text-[var(--text-muted)]"
      data-testid="equipe-event"
    >
      {Icon ? <Icon size={13} aria-hidden="true" className="shrink-0 text-[var(--success-text)]" /> : null}
      <div>{renderMarkdownLite(stripThinkBlocks(text))}</div>
      {at ? <span className="shrink-0">· <MessageTime at={at} /></span> : null}
    </div>
  );
}

function staffInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/** Message from one of our people: name + photo, then the bubble. */
export function StaffMessageBubble({
  name,
  photoUrl,
  content,
}: {
  name: string;
  photoUrl?: string | null;
  content: string;
}) {
  return (
    <div
      className="max-w-[85%] rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3 text-sm leading-relaxed text-[var(--text-primary)]"
      data-testid="staff-message"
    >
      <div className="mb-1.5 flex items-center gap-2">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={name}
            className="size-6 rounded-full border border-[var(--border-subtle)] object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid size-6 shrink-0 place-items-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-inset)] text-[10px] font-semibold text-[var(--text-secondary)]"
          >
            {staffInitials(name)}
          </span>
        )}
        <span className="text-xs font-semibold text-[var(--text-secondary)]">{name}</span>
      </div>
      <div className="whitespace-pre-wrap">{renderMarkdownLite(stripThinkBlocks(content))}</div>
    </div>
  );
}
