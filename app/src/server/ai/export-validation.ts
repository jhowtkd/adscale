import type { CreativeContract } from "./creative-contract";
import type { CreativeHardFailure, CreativeHardFailureCode } from "./creative-quality-gate";
import {
  type ExportStatusPayload,
  type ExportStatusValue,
  type ExportValidationIssue,
} from "./olhar/dual-verdict";
import { isExportOnlyFailureCode } from "./olhar/art-direction-verdict";

const ART_DIRECTION_FAILURE_CODES = new Set<CreativeHardFailureCode>([
  "generic_template_aesthetic",
  "decorative_only_variation",
  "missing_dominant_idea",
  "visual_overload",
]);

const SETUP_ISSUE_CODES = new Set<CreativeHardFailureCode>(["campaign_identity_drift"]);

const BLOCKING_EXPORT_CODES = new Set<CreativeHardFailureCode>([
  "wrong_brand",
  "cta_drift",
  "unsupported_offer",
  "unreadable_required_text",
  "invalid_format_layout",
  "replaced_source_subject",
  "cropped_critical_content",
  "invented_factual_entity",
  "unauthorized_brand_or_ip",
  "style_reference_contamination",
]);

const MINOR_EXPORT_CODES = new Set<CreativeHardFailureCode>([]);

function mapHardFailureToExportCode(
  code: CreativeHardFailureCode
): ExportValidationIssue["code"] {
  if (code === "invalid_format_layout") {
    return "invalid_format_ratio";
  }
  if (code === "campaign_identity_drift") {
    return "setup_mismatch";
  }
  if (isExportOnlyFailureCode(code)) {
    return code;
  }
  if (BLOCKING_EXPORT_CODES.has(code)) {
    return code;
  }
  return code;
}

/** Normalize CTA text for character-level comparison before drift decisions. */
export function normalizeExportCtaText(text: string): string {
  return text
    .replace(/\u00A0/g, " ")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,!?;:]+$/u, "")
    .toLowerCase();
}

export interface ValidateExportReadinessInput {
  contract: CreativeContract;
  observedCtaText?: string | null;
  hardFailures: CreativeHardFailure[];
  outputWidth?: number | null;
  outputHeight?: number | null;
}

function expectedCtaText(contract: CreativeContract): string | null {
  if (contract.ctaSemantics.kind === "explicit") {
    return contract.ctaSemantics.text;
  }
  return null;
}

function isCtaDriftNormalizationOnly(
  expected: string,
  observed: string,
  failures: CreativeHardFailure[]
): boolean {
  const hasCtaDrift = failures.some((failure) => failure.code === "cta_drift");
  if (!hasCtaDrift) {
    return false;
  }
  return normalizeExportCtaText(expected) === normalizeExportCtaText(observed);
}

function classifyFailure(
  failure: CreativeHardFailure,
  input: ValidateExportReadinessInput
): { issue: ExportValidationIssue; isSetup: boolean } | null {
  if (ART_DIRECTION_FAILURE_CODES.has(failure.code)) {
    return null;
  }

  const isSetup = SETUP_ISSUE_CODES.has(failure.code);
  const exportCode = mapHardFailureToExportCode(failure.code);

  if (failure.code === "cta_drift") {
    const expected = expectedCtaText(input.contract);
    const observed = input.observedCtaText;
    if (
      expected &&
      observed &&
      isCtaDriftNormalizationOnly(expected, observed, input.hardFailures)
    ) {
      return {
        issue: {
          code: "cta_drift",
          message: failure.message,
          severity: "warning",
        },
        isSetup: false,
      };
    }
  }

  const severity: ExportValidationIssue["severity"] =
    MINOR_EXPORT_CODES.has(failure.code) ? "warning" : "blocker";

  if (!BLOCKING_EXPORT_CODES.has(failure.code) && !SETUP_ISSUE_CODES.has(failure.code)) {
    return null;
  }

  return {
    issue: {
      code: exportCode,
      message: failure.message,
      severity: isSetup ? "blocker" : severity,
    },
    isSetup,
  };
}

function deriveExportStatusValue(
  issues: ExportValidationIssue[],
  setupIssues: ExportValidationIssue[]
): ExportStatusValue {
  const hasBlocking =
    issues.some((issue) => issue.severity === "blocker" || issue.severity === undefined) ||
    setupIssues.some((issue) => issue.severity === "blocker" || issue.severity === undefined);
  if (hasBlocking) {
    return "bloqueado";
  }
  const hasWarning = issues.some((issue) => issue.severity === "warning");
  if (hasWarning || setupIssues.length > 0) {
    return "ajuste_menor";
  }
  return "ok";
}

export function validateExportReadiness(
  input: ValidateExportReadinessInput
): ExportStatusPayload {
  const issues: ExportValidationIssue[] = [];
  const setupIssues: ExportValidationIssue[] = [];
  const evaluatedAt = new Date().toISOString();

  for (const failure of input.hardFailures) {
    const classified = classifyFailure(failure, input);
    if (!classified) {
      continue;
    }
    if (classified.isSetup) {
      setupIssues.push(classified.issue);
    } else {
      issues.push(classified.issue);
    }
  }

  const expected = expectedCtaText(input.contract);
  const observed = input.observedCtaText ?? null;
  const normalizedCta =
    expected !== null || observed !== null
      ? {
          expected: expected ? normalizeExportCtaText(expected) : null,
          observed: observed ? normalizeExportCtaText(observed) : null,
        }
      : undefined;

  return {
    value: deriveExportStatusValue(issues, setupIssues),
    issues,
    setupIssues,
    ...(normalizedCta && { normalizedCta }),
    evaluatedAt,
  };
}
