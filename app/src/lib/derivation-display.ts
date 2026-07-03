/**
 * Derivation display & review helpers.
 *
 * Consolidated from the prior five `derivation-*.ts` siblings:
 *   - derivation-auto-retry-badge.ts        (feature flag check)
 *   - derivation-formats.ts                 (DERIVATION_FORMATS constant + type)
 *   - derivation-quality.ts                 (scoreCappedForDisplay)
 *   - derivation-regeneration-feedback.ts   (buildRegenerationFeedback,
 *                                           derivationNeedsRegenerateDialog)
 *   - derivation-review-display.ts          (Olhar/export display mapping,
 *                                           verdict helpers, badge classes)
 *
 * All five siblings were pure UI helpers with no internal seams. Consolidating
 * into one module removes the cross-file imports (the small sibling used to
 * import `isDerivationAutoRetryBadgeEnabled` from its own cousin) and keeps
 * the previously-scattered 219 lines behind a single interface.
 */

import type { CreativeQualityVerdict } from "@/server/ai/creative-quality-gate";
import type { RegenerationIssueBreakdown } from "@/lib/regeneration-preview-types";
import type {
  ExportStatusPayload,
  ExportStatusValue,
  OlharVerdictPayload,
  OlharVerdictValue,
} from "@/server/ai/olhar/dual-verdict";
import {
  isBlockingExportStatus,
  isBlockingOlharVerdict,
  isDerivationBlockedByVerdictPayloads,
} from "@/server/ai/olhar/dual-verdict";

// ---------- Formats ---------------------------------------------------------

export const DERIVATION_FORMATS = ["1:1", "4:5", "9:16"] as const;
export type DerivationFormat = (typeof DERIVATION_FORMATS)[number];

// ---------- Auto-retry badge flag ------------------------------------------

export function isDerivationAutoRetryBadgeEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_DERIVATION_AUTO_RETRY_BADGE;
  return flag === "1" || flag === "true" || flag === "yes";
}

// ---------- Quality score display ------------------------------------------

export function scoreCappedForDisplay(
  qualityScore: number | null | undefined,
  qualityVerdict: CreativeQualityVerdict | null | undefined
): number | null {
  if (qualityScore == null) {
    return null;
  }
  if (qualityVerdict === "invalid") {
    return Math.min(qualityScore, 59);
  }
  return qualityScore;
}

// ---------- Regeneration feedback ------------------------------------------

export type RegenerationFeedbackBuildResult = {
  feedbackText: string;
  primaryReason?: string;
  issueBreakdown?: RegenerationIssueBreakdown;
};

export function buildRegenerationFeedback(input: {
  regenerationSuggestion?: string | null;
  hardFailures?: Array<{ code: string; message: string }> | null;
  regenerationPrimaryReason?: string | null;
  regenerationIssueBreakdown?: RegenerationIssueBreakdown | null;
}): RegenerationFeedbackBuildResult {
  const primaryReason = input.regenerationPrimaryReason?.trim() || undefined;
  const issueBreakdown = input.regenerationIssueBreakdown ?? undefined;

  const suggestion = input.regenerationSuggestion?.trim();
  if (suggestion) {
    return {
      feedbackText: suggestion,
      primaryReason,
      issueBreakdown,
    };
  }

  const failures = input.hardFailures ?? [];
  if (failures.length === 0) {
    return {
      feedbackText: "",
      primaryReason,
      issueBreakdown,
    };
  }

  return {
    feedbackText: failures.map((failure) => `${failure.code}: ${failure.message}`).join("\n"),
    primaryReason,
    issueBreakdown,
  };
}

export function derivationNeedsRegenerateDialog(input: {
  hardFailures?: Array<{ code: string; message: string }> | null;
  regenerationSuggestion?: string | null;
  regenerationPrimaryReason?: string | null;
  qualityVerdict?: string | null;
  qaChecklist?: Record<string, { status: string; note: string }> | null;
}): boolean {
  if ((input.hardFailures?.length ?? 0) > 0) return true;
  if (input.regenerationPrimaryReason?.trim()) return true;
  if (input.regenerationSuggestion?.trim()) return true;
  if (input.qualityVerdict === "invalid") return true;

  const checklist = input.qaChecklist ?? {};
  return Object.values(checklist).some(
    (entry) => entry?.status === "failed" || entry?.status === "warning"
  );
}

// ---------- Olhar / export verdict display ---------------------------------

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

export function shouldShowAutoRetryBadge(derivation: {
  autoRetryAttempted?: boolean;
}): boolean {
  return (
    isDerivationAutoRetryBadgeEnabled() && derivation.autoRetryAttempted === true
  );
}

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
  return isDerivationBlockedByVerdictPayloads(input);
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
