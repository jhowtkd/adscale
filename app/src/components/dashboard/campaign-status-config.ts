export const statusConfig: Record<
  string,
  { dot: string; label: string; bg: string; text: string; border: string }
> = {
  active: {
    dot: "bg-[var(--accent-green)]",
    label: "ATIVA",
    bg: "bg-[var(--accent-green)]/15",
    text: "text-[var(--accent-green-text)]",
    border: "border-[var(--accent-green)]/30",
  },
  draft: {
    dot: "bg-[var(--accent-amber)]",
    label: "RASCUNHO",
    bg: "bg-[var(--accent-amber)]/15",
    text: "text-[var(--accent-amber)]",
    border: "border-[var(--accent-amber)]/30",
  },
  generating: {
    dot: "bg-[var(--accent-green)] animate-pulse",
    label: "GERANDO",
    bg: "bg-[var(--accent-green)]/15",
    text: "text-[var(--accent-green-text)]",
    border: "border-[var(--accent-green)]/30",
  },
  completed: {
    dot: "bg-[var(--accent-green)]",
    label: "CONCLUÍDA",
    bg: "bg-[var(--accent-green)]/10",
    text: "text-[var(--accent-green-text)]",
    border: "border-[var(--accent-green)]/20",
  },
  failed: {
    dot: "bg-[var(--accent-rose)]",
    label: "FALHOU",
    bg: "bg-[var(--accent-rose)]/15",
    text: "text-[var(--accent-rose)]",
    border: "border-[var(--accent-rose)]/30",
  },
  archived: {
    dot: "bg-[var(--text-muted)]",
    label: "ARQUIVADA",
    bg: "bg-[var(--surface-raised)]",
    text: "text-[var(--text-secondary)]",
    border: "border-[var(--border-medium)]",
  },
};

export interface DashboardCampaignItem {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  pieceCount: number;
  approvedCount: number;
  status: string;
  updatedAt: string;
}
