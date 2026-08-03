export type DashboardStatusTone = "warning" | "danger" | "success" | "info" | "neutral";

type CampaignStatusConfig = {
  tone: DashboardStatusTone;
  dot: string;
  label: string;
  bg: string;
  text: string;
  border: string;
};

export const statusConfig: Record<string, CampaignStatusConfig> = {
  active: {
    tone: "info",
    dot: "bg-[var(--info-dot)]",
    label: "ATIVA",
    bg: "bg-[var(--info-bg)]",
    text: "text-[var(--info-text)]",
    border: "border-[var(--info-border)]",
  },
  review: {
    tone: "info",
    dot: "bg-[var(--info-dot)]",
    label: "EM REVISÃO",
    bg: "bg-[var(--info-bg)]",
    text: "text-[var(--info-text)]",
    border: "border-[var(--info-border)]",
  },
  draft: {
    tone: "neutral",
    dot: "bg-[var(--neutral-dot)]",
    label: "RASCUNHO",
    bg: "bg-[var(--neutral-bg)]",
    text: "text-[var(--neutral-text)]",
    border: "border-[var(--neutral-border)]",
  },
  generating: {
    tone: "warning",
    dot: "bg-[var(--warning-dot)] animate-pulse",
    label: "GERANDO",
    bg: "bg-[var(--warning-bg)]",
    text: "text-[var(--warning-text)]",
    border: "border-[var(--warning-border)]",
  },
  processing: {
    tone: "warning",
    dot: "bg-[var(--warning-dot)] animate-pulse",
    label: "PROCESSANDO",
    bg: "bg-[var(--warning-bg)]",
    text: "text-[var(--warning-text)]",
    border: "border-[var(--warning-border)]",
  },
  queued: {
    tone: "warning",
    dot: "bg-[var(--warning-dot)]",
    label: "NA FILA",
    bg: "bg-[var(--warning-bg)]",
    text: "text-[var(--warning-text)]",
    border: "border-[var(--warning-border)]",
  },
  completed: {
    tone: "success",
    dot: "bg-[var(--success-dot)]",
    label: "CONCLUÍDA",
    bg: "bg-[var(--success-bg)]",
    text: "text-[var(--success-text)]",
    border: "border-[var(--success-border)]",
  },
  approved: {
    tone: "success",
    dot: "bg-[var(--success-dot)]",
    label: "APROVADA",
    bg: "bg-[var(--success-bg)]",
    text: "text-[var(--success-text)]",
    border: "border-[var(--success-border)]",
  },
  failed: {
    tone: "danger",
    dot: "bg-[var(--danger-dot)]",
    label: "FALHOU",
    bg: "bg-[var(--danger-bg)]",
    text: "text-[var(--danger-text)]",
    border: "border-[var(--danger-border)]",
  },
  archived: {
    tone: "neutral",
    dot: "bg-[var(--neutral-dot)]",
    label: "ARQUIVADA",
    bg: "bg-[var(--neutral-bg)]",
    text: "text-[var(--neutral-text)]",
    border: "border-[var(--neutral-border)]",
  },
  unknown: {
    tone: "neutral",
    dot: "bg-[var(--neutral-dot)]",
    label: "DESCONHECIDO",
    bg: "bg-[var(--neutral-bg)]",
    text: "text-[var(--neutral-text)]",
    border: "border-[var(--neutral-border)]",
  },
};

export function getCampaignStatusConfig(status: string): CampaignStatusConfig {
  return statusConfig[status] ?? statusConfig.unknown;
}

export function getCampaignStatusTone(status: string): DashboardStatusTone {
  return getCampaignStatusConfig(status).tone;
}

export interface DashboardCampaignItem {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  pieceCount: number;
  approvedCount: number;
  status: string;
  updatedAt: string;
}
