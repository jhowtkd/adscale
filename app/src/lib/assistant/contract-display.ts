export type ClientActionCardDisplay = {
  label: string;
  actionType?: string;
  riskLabel?: string;
  creditImpact?: unknown;
  riskCopyLines?: string[];
  confirmationPolicy?: string;
  summary?: string;
  sourceVersionLabel?: string;
  approvedVersionLabel?: string | null;
  workingDiffersFromApproved?: boolean;
  writes?: string[];
  proposalStatus?: "pending" | "stale";
  mismatchWarning?: string;
  intendedChanges?: string[];
  format?: string | null;
  referenceCount?: number;
  referenceItems?: {
    id: string;
    name: string;
    thumbnailUrl: string | null;
  }[];
  planVersionLabel?: string | null;
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
    summary: typeof record.summary === "string" ? record.summary : undefined,
    sourceVersionLabel:
      typeof record.sourceVersionLabel === "string"
        ? record.sourceVersionLabel
        : undefined,
    approvedVersionLabel:
      typeof record.approvedVersionLabel === "string"
        ? record.approvedVersionLabel
        : record.approvedVersionLabel === null
          ? null
          : undefined,
    workingDiffersFromApproved:
      typeof record.workingDiffersFromApproved === "boolean"
        ? record.workingDiffersFromApproved
        : undefined,
    writes: Array.isArray(record.writes)
      ? record.writes.filter((line): line is string => typeof line === "string")
      : undefined,
    proposalStatus:
      record.proposalStatus === "pending" || record.proposalStatus === "stale"
        ? record.proposalStatus
        : undefined,
    mismatchWarning:
      typeof record.mismatchWarning === "string"
        ? record.mismatchWarning
        : undefined,
    intendedChanges: Array.isArray(record.intendedChanges)
      ? record.intendedChanges.filter(
          (line): line is string => typeof line === "string"
        )
      : undefined,
    format:
      typeof record.format === "string"
        ? record.format
        : record.format === null
          ? null
          : undefined,
    referenceCount:
      typeof record.referenceCount === "number" ? record.referenceCount : undefined,
    referenceItems: Array.isArray(record.referenceItems)
      ? record.referenceItems
          .filter(
            (item): item is Record<string, unknown> =>
              typeof item === "object" && item !== null
          )
          .map((item) => ({
            id: typeof item.id === "string" ? item.id : "",
            name: typeof item.name === "string" ? item.name : "",
            thumbnailUrl:
              typeof item.thumbnailUrl === "string" ? item.thumbnailUrl : null,
          }))
      : undefined,
    planVersionLabel:
      typeof record.planVersionLabel === "string"
        ? record.planVersionLabel
        : record.planVersionLabel === null
          ? null
          : undefined,
  };
}

export function shouldShowCreditImpact(display: ClientActionCardDisplay): boolean {
  if (display.actionType === "revise_creative_plan") return false;
  if (display.actionType === "revise_creative") return true;
  const creditImpact = display.creditImpact;
  if (!creditImpact || typeof creditImpact !== "object") return true;
  const record = creditImpact as Record<string, unknown>;
  return !(record.kind === "fixed" && record.credits === 0);
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
