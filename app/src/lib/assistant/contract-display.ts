export type ClientActionCardDisplay = {
  label: string;
  actionType?: string;
  riskLabel?: string;
  creditImpact?: unknown;
  riskCopyLines?: string[];
  confirmationPolicy?: string;
};

export type ActionCardStatus =
  | "pending"
  | "confirmed"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

const TERMINAL_STATUSES = new Set<ActionCardStatus>([
  "completed",
  "failed",
  "canceled",
]);

export function isTerminalActionStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status as ActionCardStatus);
}

export function parseActionCardDisplay(
  display: unknown
): ClientActionCardDisplay | null {
  if (!display || typeof display !== "object") {
    return null;
  }
  const record = display as Record<string, unknown>;
  if (typeof record.label !== "string") {
    return null;
  }
  return {
    label: record.label,
    actionType:
      typeof record.actionType === "string" ? record.actionType : undefined,
    riskLabel:
      typeof record.riskLabel === "string" ? record.riskLabel : undefined,
    creditImpact: record.creditImpact,
    riskCopyLines: Array.isArray(record.riskCopyLines)
      ? record.riskCopyLines.filter(
          (line): line is string => typeof line === "string"
        )
      : [],
    confirmationPolicy:
      typeof record.confirmationPolicy === "string"
        ? record.confirmationPolicy
        : undefined,
  };
}

export function formatCreditImpact(creditImpact: unknown): string {
  if (!creditImpact || typeof creditImpact !== "object") {
    return "—";
  }
  const record = creditImpact as Record<string, unknown>;
  if (typeof record.label === "string" && record.label.trim()) {
    return record.label;
  }
  if (record.kind === "fixed" && typeof record.credits === "number") {
    return `${record.credits} credits`;
  }
  if (record.kind === "creditAction" && typeof record.action === "string") {
    return record.action;
  }
  return "—";
}

export function getRiskLabelVariant(
  riskLabel: string | undefined
): "success" | "warning" | "danger" | "neutral" {
  switch (riskLabel) {
    case "low":
      return "success";
    case "medium":
      return "warning";
    case "high":
      return "danger";
    default:
      return "neutral";
  }
}
