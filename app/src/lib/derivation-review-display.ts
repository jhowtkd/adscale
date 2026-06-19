import type {
  ExportStatusPayload,
  ExportStatusValue,
  OlharVerdictPayload,
  OlharVerdictValue,
} from "@/server/ai/olhar/dual-verdict";
import {
  isBlockingExportStatus,
  isBlockingOlharVerdict,
} from "@/server/ai/olhar/dual-verdict";

export type ReviewDecision = "entra" | "quase_regenerar" | "nao_entra";

export const MIN_DIRECTION_REASON_LENGTH = 8;

export type VerdictBadgeTone = "ready" | "quase" | "blocked" | "neutral";

export type OlharDisplay = {
  labelKey: `olharVerdict.${OlharVerdictValue}`;
  tone: VerdictBadgeTone;
  blocking: boolean;
};

export type ExportDisplay = {
  labelKey: `exportStatus.${ExportStatusValue}`;
  tone: VerdictBadgeTone;
  blocking: boolean;
};

export function getOlharDisplay(
  olharVerdict?: OlharVerdictPayload | null
): OlharDisplay | null {
  if (!olharVerdict?.value) return null;

  const blocking = isBlockingOlharVerdict(olharVerdict.value);
  const tone: VerdictBadgeTone =
    olharVerdict.value === "pronta"
      ? "ready"
      : olharVerdict.value === "quase"
        ? "quase"
        : blocking
          ? "blocked"
          : "neutral";

  return {
    labelKey: `olharVerdict.${olharVerdict.value}`,
    tone,
    blocking,
  };
}

export function getExportDisplay(
  exportStatus?: ExportStatusPayload | null
): ExportDisplay | null {
  if (!exportStatus?.value) return null;

  const blocking = isBlockingExportStatus(exportStatus.value);
  const tone: VerdictBadgeTone =
    exportStatus.value === "ok"
      ? "ready"
      : exportStatus.value === "ajuste_menor"
        ? "quase"
        : "blocked";

  return {
    labelKey: `exportStatus.${exportStatus.value}`,
    tone,
    blocking,
  };
}

export function isDerivationPackageBlocked(input: {
  olharVerdict?: OlharVerdictPayload | null;
  exportStatus?: ExportStatusPayload | null;
  qualityVerdict?: "invalid" | "improvable" | "acceptable" | null;
}): boolean {
  if (input.qualityVerdict === "invalid") return true;
  if (input.olharVerdict && isBlockingOlharVerdict(input.olharVerdict.value)) {
    return true;
  }
  if (input.exportStatus && isBlockingExportStatus(input.exportStatus.value)) {
    return true;
  }
  return false;
}

export function getPackageEligibilityHintKey(input: {
  olharVerdict?: OlharVerdictPayload | null;
  exportStatus?: ExportStatusPayload | null;
  qualityVerdict?: "invalid" | "improvable" | "acceptable" | null;
}): "packageBlockedOlhar" | "packageBlockedExport" | "packageBlockedInvalid" | null {
  if (input.qualityVerdict === "invalid") return "packageBlockedInvalid";
  if (input.olharVerdict && isBlockingOlharVerdict(input.olharVerdict.value)) {
    return "packageBlockedOlhar";
  }
  if (input.exportStatus && isBlockingExportStatus(input.exportStatus.value)) {
    return "packageBlockedExport";
  }
  return null;
}

export function isNormalApprovalBlocked(input: {
  olharVerdict?: OlharVerdictPayload | null;
  exportStatus?: ExportStatusPayload | null;
  qualityVerdict?: "invalid" | "improvable" | "acceptable" | null;
}): boolean {
  return isDerivationPackageBlocked(input);
}

export function verdictBadgeClassName(tone: VerdictBadgeTone): string {
  switch (tone) {
    case "ready":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-400";
    case "quase":
      return "border-amber-500/40 bg-amber-500/10 text-amber-500";
    case "blocked":
      return "border-rose-500/40 bg-rose-500/10 text-rose-400";
    default:
      return "border-[var(--border-dim)] bg-[var(--surface-raised)] text-[var(--text-secondary)]";
  }
}

export function validateDirectionReason(reason?: string): boolean {
  return Boolean(reason?.trim() && reason.trim().length >= MIN_DIRECTION_REASON_LENGTH);
}

export function mapDecisionToStatus(
  decision: ReviewDecision
): "approved" | "rejected" {
  return decision === "entra" ? "approved" : "rejected";
}
