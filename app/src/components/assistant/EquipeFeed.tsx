"use client";

import { stripThinkBlocks } from "@/server/assistant/model/reasoning-sanitizer";
import { renderMarkdownLite } from "./markdown-lite";

/** Centered muted feed line: "Redação IA criou a v2", "Bruna entrou na conversa". */
export function EquipeEventLine({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div
      className="mx-auto max-w-[85%] text-center text-xs text-[var(--text-muted)]"
      data-testid="equipe-event"
    >
      {renderMarkdownLite(stripThinkBlocks(text))}
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
