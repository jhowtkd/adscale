"use client";

import { useTranslations } from "next-intl";

// Who made a version: clients appear as "você", agents by role with the IA
// seal, staff by team. The API stores coarse actor kinds, so unknown agent
// roles fall back to the generic team label.

const AGENT_ROLE_KEYS: Record<string, string> = {
  strategist: "strategist",
  research: "research",
  writer: "writer",
  reviewer_text: "reviewer",
  reviewer_visual: "reviewer",
  measurement: "measurement",
};

export function useAuthorLabel(authorRole: string): { label: string; isAI: boolean } {
  const t = useTranslations("equipe.authors");
  if (authorRole === "client_person") return { label: t("you"), isAI: false };
  if (authorRole === "staff") return { label: t("staff"), isAI: false };
  if (authorRole === "system") return { label: t("system"), isAI: false };
  if (authorRole === "agent") return { label: t("team"), isAI: true };
  const key = AGENT_ROLE_KEYS[authorRole];
  if (key && t.has(key)) return { label: t(key), isAI: true };
  return { label: authorRole, isAI: true };
}

export function IABadge() {
  return (
    <span
      className="rounded border border-[var(--border-strong)] px-1 font-mono text-[9px] font-bold uppercase text-[var(--text-muted)]"
      aria-label="IA"
    >
      IA
    </span>
  );
}

export default function EquipeAuthor({ authorRole }: { authorRole: string }) {
  const { label, isAI } = useAuthorLabel(authorRole);
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      {isAI ? <IABadge /> : null}
    </span>
  );
}
