/**
 * Hard quality gate: classifies QA checklist + score issues into blocking hard failures
 * vs advisory polish, and derives qualityVerdict. Orchestration runs after derivation scoring.
 */
import { logger } from "@/lib/logger";
import type { CreativeContract, ObjectiveIntegrityFailureCode } from "./creative-contract";
import { OBJECTIVE_INTEGRITY_FAILURE_CODES } from "./creative-contract";
import { resolveContractPolicy } from "./canonical-creative-contract";
import {
  analyzeCreativeQa,
  CREATIVE_WORK_OBJECTIVE_FAILURE_CODES,
  type AnalyzeCreativeQaInput,
  type CreativeQaChecklist,
  type CreativeQaCriterion,
  type CreativeQaCriterionResult,
  type CreativeWorkObjectiveFailureCode,
  type CreativeWorkObjectiveVerdict,
  type CreativeWorkQaFinding,
} from "./creative-qa";
import {
  CAMPAIGN_IDENTITY_DRIFT_PATTERN,
  CAMPAIGN_IDENTITY_SAFE_PATTERN,
  CROPPED_CONTENT_PATTERN,
  INVENTED_ENTITY_PATTERN,
  INVALID_FORMAT_LAYOUT_PATTERN,
  REPLACED_SOURCE_SUBJECT_PATTERN,
  STYLE_REFERENCE_CONTAMINATION_PATTERN,
  UNAUTHORIZED_BRAND_PATTERN,
  UNSUPPORTED_OFFER_PATTERN,
  WRONG_BRAND_PATTERN,
} from "./creative-quality-taxonomy";
import {
  getDerivationById,
  updateDerivationDualVerdict,
  updateDerivationQualityGate,
  updateDerivationQa,
  updateDerivationScore,
  type CreativeScoreBreakdown,
} from "../repositories/derivation";
import { buildHardFailureRegenerationSuggestion } from "./creative-score";
import { applyScoreCeilings } from "./creative-score-ceilings";
import { validateExportReadiness } from "./export-validation";
import { buildPassagemOlharVerdict } from "./olhar/olhar-qa";
import {
  isBlockingExportStatus,
  isBlockingOlharVerdict,
  normalizeExportStatusPayload,
  normalizeOlharVerdictPayload,
  type ExportStatusPayload,
  type OlharVerdictPayload,
} from "./olhar/dual-verdict";

/**
 * Full historical code union. Only OBJECTIVE codes are still emitted by the
 * gate as hard failures; the advisory codes remain in the union for stored
 * rows, retry policy, and UI compatibility, but classification now routes
 * their findings to polishSuggestions.
 */
export type CreativeHardFailureCode =
  | "cta_drift"
  | "wrong_brand"
  | "unsupported_offer"
  | "invented_factual_entity"
  | "copied_style_reference_facts"
  | "replaced_source_subject"
  | "unauthorized_brand_or_ip"
  | "campaign_identity_drift"
  | "style_reference_contamination"
  | "generic_template_aesthetic"
  | "visual_overload"
  | "missing_dominant_idea"
  | "decorative_only_variation"
  | "cropped_critical_content"
  | "unreadable_required_text"
  | "invalid_format_layout";

const CREATIVE_HARD_FAILURE_CODES = new Set<CreativeHardFailureCode>([
  "cta_drift",
  "wrong_brand",
  "unsupported_offer",
  "invented_factual_entity",
  "copied_style_reference_facts",
  "replaced_source_subject",
  "unauthorized_brand_or_ip",
  "campaign_identity_drift",
  "style_reference_contamination",
  "generic_template_aesthetic",
  "visual_overload",
  "missing_dominant_idea",
  "decorative_only_variation",
  "cropped_critical_content",
  "unreadable_required_text",
  "invalid_format_layout",
]);

/** Objective integrity defects — the only codes the gate still blocks on. */
export const OBJECTIVE_HARD_FAILURE_CODES = new Set<ObjectiveIntegrityFailureCode>(
  OBJECTIVE_INTEGRITY_FAILURE_CODES
);

const HARD_FAILURE_CODE_ALIASES: Record<string, CreativeHardFailureCode> = {
  copied_style_reference_facts: "style_reference_contamination",
  format_campaign_drift: "campaign_identity_drift",
  restyling_factual_contamination: "style_reference_contamination",
};

export function normalizeHardFailureCode(code: string): CreativeHardFailureCode {
  const alias = HARD_FAILURE_CODE_ALIASES[code];
  if (alias) {
    return alias;
  }
  if (CREATIVE_HARD_FAILURE_CODES.has(code as CreativeHardFailureCode)) {
    return code as CreativeHardFailureCode;
  }
  return code as CreativeHardFailureCode;
}

export interface CreativeHardFailure {
  code: CreativeHardFailureCode;
  message: string;
  criterion?: CreativeQaCriterion;
}

export type CreativeQualityVerdict = "invalid" | "improvable" | "acceptable";

export type CreativeQaChecklistWithStyle = CreativeQaChecklist & {
  styleFidelity?: CreativeQaCriterionResult;
};

export interface ClassifyCreativeQualityGateInput {
  checklist: CreativeQaChecklistWithStyle;
  contract: CreativeContract;
  scoreIssues?: string[];
}

export interface ClassifyCreativeQualityGateResult {
  hardFailures: CreativeHardFailure[];
  polishSuggestions: string[];
}

const IMPROVABLE_SCORE_THRESHOLD = 70;

function noteMatches(pattern: RegExp, note: string): boolean {
  return pattern.test(note);
}

function hasCampaignIdentityDrift(note: string): boolean {
  if (!noteMatches(CAMPAIGN_IDENTITY_DRIFT_PATTERN, note)) {
    return false;
  }
  if (/not a faithful/i.test(note)) {
    return true;
  }
  return !noteMatches(CAMPAIGN_IDENTITY_SAFE_PATTERN, note);
}

function pushUnique(list: string[], value: string): void {
  const trimmed = value.trim();
  if (trimmed.length > 0 && !list.includes(trimmed)) {
    list.push(trimmed);
  }
}

function pushHardFailure(
  hardFailures: CreativeHardFailure[],
  failure: CreativeHardFailure
): void {
  if (!hardFailures.some((f) => f.code === failure.code && f.criterion === failure.criterion)) {
    hardFailures.push(failure);
  }
}

function classifyBriefMatchFailed(
  hardFailures: CreativeHardFailure[],
  polishSuggestions: string[],
  note: string
): void {
  if (noteMatches(REPLACED_SOURCE_SUBJECT_PATTERN, note)) {
    pushHardFailure(hardFailures, {
      code: "replaced_source_subject",
      message: note,
      criterion: "briefMatch",
    });
    return;
  }
  if (noteMatches(WRONG_BRAND_PATTERN, note)) {
    pushHardFailure(hardFailures, {
      code: "wrong_brand",
      message: note,
      criterion: "briefMatch",
    });
    return;
  }
  if (noteMatches(UNAUTHORIZED_BRAND_PATTERN, note)) {
    pushHardFailure(hardFailures, {
      code: "unauthorized_brand_or_ip",
      message: note,
      criterion: "briefMatch",
    });
    return;
  }
  if (noteMatches(INVENTED_ENTITY_PATTERN, note)) {
    pushHardFailure(hardFailures, {
      code: "invented_factual_entity",
      message: note,
      criterion: "briefMatch",
    });
    return;
  }
  if (noteMatches(UNSUPPORTED_OFFER_PATTERN, note)) {
    pushHardFailure(hardFailures, {
      code: "unsupported_offer",
      message: note,
      criterion: "briefMatch",
    });
    return;
  }
  pushUnique(polishSuggestions, note);
}

function classifyCtaOfferFailed(
  hardFailures: CreativeHardFailure[],
  polishSuggestions: string[],
  note: string
): void {
  if (noteMatches(UNSUPPORTED_OFFER_PATTERN, note)) {
    pushHardFailure(hardFailures, {
      code: "unsupported_offer",
      message: note,
      criterion: "ctaOffer",
    });
    return;
  }
  if (noteMatches(INVENTED_ENTITY_PATTERN, note)) {
    pushHardFailure(hardFailures, {
      code: "invented_factual_entity",
      message: note,
      criterion: "ctaOffer",
    });
    return;
  }
  // CTA absence, paraphrase, and prominence issues are art-direction advice.
  pushUnique(polishSuggestions, note);
}

function classifyCreativeRiskFailed(
  hardFailures: CreativeHardFailure[],
  polishSuggestions: string[],
  note: string
): void {
  if (noteMatches(UNSUPPORTED_OFFER_PATTERN, note)) {
    pushHardFailure(hardFailures, {
      code: "unsupported_offer",
      message: note,
      criterion: "creativeRisk",
    });
    return;
  }
  if (noteMatches(INVENTED_ENTITY_PATTERN, note)) {
    pushHardFailure(hardFailures, {
      code: "invented_factual_entity",
      message: note,
      criterion: "creativeRisk",
    });
    return;
  }
  if (noteMatches(STYLE_REFERENCE_CONTAMINATION_PATTERN, note)) {
    pushHardFailure(hardFailures, {
      code: "style_reference_contamination",
      message: note,
      criterion: "creativeRisk",
    });
    return;
  }
  // Overload, generic template feel, missing dominant idea, and
  // decorative-only variation are ranking advice, not validity failures.
  pushUnique(polishSuggestions, note);
}

function classifyScoreIssue(
  hardFailures: CreativeHardFailure[],
  contract: CreativeContract,
  issue: string
): boolean {
  if (noteMatches(WRONG_BRAND_PATTERN, issue)) {
    pushHardFailure(hardFailures, {
      code: "wrong_brand",
      message: issue,
      criterion: "briefMatch",
    });
    return true;
  }
  if (noteMatches(UNAUTHORIZED_BRAND_PATTERN, issue)) {
    pushHardFailure(hardFailures, {
      code: "unauthorized_brand_or_ip",
      message: issue,
      criterion: "briefMatch",
    });
    return true;
  }
  if (noteMatches(UNSUPPORTED_OFFER_PATTERN, issue)) {
    pushHardFailure(hardFailures, {
      code: "unsupported_offer",
      message: issue,
      criterion: "ctaOffer",
    });
    return true;
  }
  if (noteMatches(REPLACED_SOURCE_SUBJECT_PATTERN, issue)) {
    pushHardFailure(hardFailures, {
      code: "replaced_source_subject",
      message: issue,
      criterion: "informationPreservation",
    });
    return true;
  }
  if (noteMatches(CROPPED_CONTENT_PATTERN, issue)) {
    pushHardFailure(hardFailures, {
      code: "cropped_critical_content",
      message: issue,
      criterion: "informationPreservation",
    });
    return true;
  }
  if (
    contract.generationMode === "format_adaptation" &&
    !hasCampaignIdentityDrift(issue) &&
    noteMatches(INVALID_FORMAT_LAYOUT_PATTERN, issue)
  ) {
    pushHardFailure(hardFailures, {
      code: "invalid_format_layout",
      message: issue,
      criterion: "formatFit",
    });
    return true;
  }
  return false;
}

function promoteScoreIssuesToHardFailures(
  scoreIssues: string[],
  contract: CreativeContract,
  hardFailures: CreativeHardFailure[]
): string[] {
  const remainingPolish: string[] = [];
  for (const issue of scoreIssues) {
    const promoted = classifyScoreIssue(hardFailures, contract, issue);
    if (!promoted) {
      remainingPolish.push(issue);
    }
  }
  return remainingPolish;
}

function collectChecklistWarnings(
  checklist: CreativeQaChecklistWithStyle,
  polishSuggestions: string[]
): void {
  const criteria: (keyof CreativeQaChecklistWithStyle)[] = [
    "legibility",
    "ctaOffer",
    "informationPreservation",
    "briefMatch",
    "formatFit",
    "creativeRisk",
    "styleFidelity",
  ];

  for (const criterion of criteria) {
    const item = checklist[criterion];
    if (item?.status === "warning") {
      pushUnique(polishSuggestions, item.note);
    }
  }
}

export function extractPolishSuggestions(
  input: ClassifyCreativeQualityGateInput
): string[] {
  const polishSuggestions: string[] = [];
  collectChecklistWarnings(input.checklist, polishSuggestions);

  for (const issue of input.scoreIssues ?? []) {
    pushUnique(polishSuggestions, issue);
  }

  return polishSuggestions;
}

export function classifyCreativeQualityGate(
  input: ClassifyCreativeQualityGateInput
): ClassifyCreativeQualityGateResult {
  const { checklist, contract, scoreIssues = [] } = input;
  const policy = resolveContractPolicy(contract);
  const hardFailures: CreativeHardFailure[] = [];
  const polishSuggestions: string[] = [];

  if (checklist.legibility.status === "failed") {
    // Legibility is contextual art-direction advice, not a validity failure.
    pushUnique(polishSuggestions, checklist.legibility.note);
  }

  if (checklist.informationPreservation.status === "failed") {
    const note = checklist.informationPreservation.note;
    if (noteMatches(REPLACED_SOURCE_SUBJECT_PATTERN, note)) {
      pushHardFailure(hardFailures, {
        code: "replaced_source_subject",
        message: note,
        criterion: "informationPreservation",
      });
    } else if (noteMatches(CROPPED_CONTENT_PATTERN, note)) {
      pushHardFailure(hardFailures, {
        code: "cropped_critical_content",
        message: note,
        criterion: "informationPreservation",
      });
    } else if (noteMatches(INVENTED_ENTITY_PATTERN, note)) {
      pushHardFailure(hardFailures, {
        code: "invented_factual_entity",
        message: note,
        criterion: "informationPreservation",
      });
    } else if (noteMatches(UNSUPPORTED_OFFER_PATTERN, note)) {
      pushHardFailure(hardFailures, {
        code: "unsupported_offer",
        message: note,
        criterion: "informationPreservation",
      });
    } else {
      pushUnique(polishSuggestions, note);
    }
  }

  if (checklist.styleFidelity?.status === "failed") {
    pushHardFailure(hardFailures, {
      code: "style_reference_contamination",
      message: checklist.styleFidelity.note,
      criterion: "styleFidelity",
    });
  }

  if (checklist.formatFit.status === "failed") {
    const note = checklist.formatFit.note;
    if (
      policy.generationMode === "format_adaptation" &&
      !hasCampaignIdentityDrift(note) &&
      noteMatches(INVALID_FORMAT_LAYOUT_PATTERN, note)
    ) {
      pushHardFailure(hardFailures, {
        code: "invalid_format_layout",
        message: note,
        criterion: "formatFit",
      });
    } else {
      // Campaign-identity drift and non-adaptation format issues are advisory.
      pushUnique(polishSuggestions, note);
    }
  }

  if (checklist.ctaOffer.status === "failed") {
    classifyCtaOfferFailed(hardFailures, polishSuggestions, checklist.ctaOffer.note);
  }

  if (checklist.briefMatch.status === "failed") {
    classifyBriefMatchFailed(hardFailures, polishSuggestions, checklist.briefMatch.note);
  }

  if (checklist.creativeRisk.status === "failed") {
    classifyCreativeRiskFailed(
      hardFailures,
      polishSuggestions,
      checklist.creativeRisk.note
    );
  }

  collectChecklistWarnings(checklist, polishSuggestions);

  const remainingScoreIssues = promoteScoreIssuesToHardFailures(
    scoreIssues,
    contract,
    hardFailures
  );

  for (const issue of remainingScoreIssues) {
    pushUnique(polishSuggestions, issue);
  }

  return { hardFailures, polishSuggestions };
}

function checklistHasAdvisorySignal(checklist: CreativeQaChecklistWithStyle): boolean {
  const criteria: (keyof CreativeQaChecklistWithStyle)[] = [
    "legibility",
    "ctaOffer",
    "informationPreservation",
    "briefMatch",
    "formatFit",
    "creativeRisk",
    "styleFidelity",
  ];
  // Failed criteria that did not map to an objective hard failure are
  // demoted to advice — they should still keep the verdict at "improvable".
  return criteria.some((criterion) => {
    const status = checklist[criterion]?.status;
    return status === "warning" || status === "failed";
  });
}

export type DerivationApprovableResult =
  | { ok: true }
  | {
      ok: false;
      qualityVerdict: CreativeQualityVerdict | null;
      hardFailures: CreativeHardFailure[];
      olharVerdict?: OlharVerdictPayload | null;
      exportStatus?: ExportStatusPayload | null;
    };

export function assertDerivationApprovable(derivation: {
  qualityVerdict?: string | null;
  hardFailures?: unknown;
  olharVerdict?: unknown;
  exportStatus?: unknown;
}): DerivationApprovableResult {
  const hardFailures = Array.isArray(derivation.hardFailures)
    ? (derivation.hardFailures as CreativeHardFailure[])
    : [];
  const olharVerdict = normalizeOlharVerdictPayload(derivation.olharVerdict);
  const exportStatus = normalizeExportStatusPayload(derivation.exportStatus);

  if (derivation.qualityVerdict === "invalid" || hardFailures.length > 0) {
    return {
      ok: false,
      qualityVerdict:
        (derivation.qualityVerdict as CreativeQualityVerdict | null) ?? "invalid",
      hardFailures,
      ...(olharVerdict !== null ? { olharVerdict } : {}),
      ...(exportStatus !== null ? { exportStatus } : {}),
    };
  }

  if (olharVerdict !== null && isBlockingOlharVerdict(olharVerdict.value)) {
    return {
      ok: false,
      qualityVerdict:
        (derivation.qualityVerdict as CreativeQualityVerdict | null) ?? null,
      hardFailures,
      olharVerdict,
      ...(exportStatus !== null ? { exportStatus } : {}),
    };
  }

  if (exportStatus !== null && isBlockingExportStatus(exportStatus.value)) {
    return {
      ok: false,
      qualityVerdict:
        (derivation.qualityVerdict as CreativeQualityVerdict | null) ?? null,
      hardFailures,
      ...(olharVerdict !== null ? { olharVerdict } : {}),
      exportStatus,
    };
  }

  return { ok: true };
}

export function computeQualityGateFromAnalysis(input: {
  checklist: CreativeQaChecklistWithStyle;
  contract: CreativeContract;
  scoreIssues?: string[];
  qualityScore?: number | null;
  scoreBreakdown?: CreativeScoreBreakdown | null;
}): {
  qualityVerdict: CreativeQualityVerdict;
  hardFailures: CreativeHardFailure[];
  polishSuggestions: string[];
  qualityScore: number;
  scoreBreakdown: CreativeScoreBreakdown | null;
} {
  const scoreIssues = input.scoreIssues ?? [];
  const { hardFailures, polishSuggestions } = classifyCreativeQualityGate({
    checklist: input.checklist,
    contract: input.contract,
    scoreIssues,
  });
  const rawQualityScore =
    typeof input.qualityScore === "number" && Number.isFinite(input.qualityScore)
      ? input.qualityScore
      : 0;
  const capped = applyScoreCeilings(
    {
      qualityScore: rawQualityScore,
      scoreBreakdown: input.scoreBreakdown ?? null,
    },
    hardFailures
  );
  const qualityVerdict = deriveQualityVerdict({
    hardFailures,
    qualityScore: capped.qualityScore,
    checklist: input.checklist,
  });
  return {
    qualityVerdict,
    hardFailures,
    polishSuggestions,
    qualityScore: capped.qualityScore,
    scoreBreakdown: input.scoreBreakdown ? capped.scoreBreakdown : null,
  };
}

export function deriveQualityVerdict(input: {
  hardFailures: CreativeHardFailure[];
  qualityScore: number;
  checklist: CreativeQaChecklistWithStyle;
}): CreativeQualityVerdict {
  if (input.hardFailures.length > 0) {
    return "invalid";
  }

  if (
    input.qualityScore < IMPROVABLE_SCORE_THRESHOLD ||
    checklistHasAdvisorySignal(input.checklist)
  ) {
    return "improvable";
  }

  return "acceptable";
}

export interface RunCompletedDerivationQualityGateInput {
  derivationId: string;
  workspaceId: string;
  imageBuffer: Buffer;
  mimeType: string;
  baseImageBuffer?: Buffer;
  baseMimeType?: string;
  styleImageBuffer?: Buffer;
  styleMimeType?: string;
  locale: string;
  campaign: AnalyzeCreativeQaInput["campaign"];
  derivation: AnalyzeCreativeQaInput["derivation"];
  contract: CreativeContract;
}

function asScoreIssues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

async function persistQualityGateFallback(
  derivationId: string,
  workspaceId: string,
  gatedAt: Date
): Promise<void> {
  await updateDerivationQualityGate(derivationId, workspaceId, {
    qualityVerdict: "improvable",
    hardFailures: [],
    polishSuggestions: [],
    qualityGatedAt: gatedAt,
  });
}

async function persistDualVerdictFromQualityGate(input: {
  derivationId: string;
  workspaceId: string;
  contract: CreativeContract;
  derivation: RunCompletedDerivationQualityGateInput["derivation"];
  hardFailures: CreativeHardFailure[];
  qa: Awaited<ReturnType<typeof analyzeCreativeQa>>;
  gatedAt: Date;
}): Promise<void> {
  const exportStatus = validateExportReadiness({
    contract: input.contract,
    observedCtaText: input.derivation.ctaText,
    hardFailures: input.hardFailures,
  });

  const olharVerdict = buildPassagemOlharVerdict({
    hardFailures: input.hardFailures,
    qa: input.qa,
    evaluatedAt: input.gatedAt.toISOString(),
  });

  await updateDerivationDualVerdict(input.derivationId, input.workspaceId, {
    exportStatus,
    ...(olharVerdict !== null ? { olharVerdict } : {}),
  });
}

export async function runCompletedDerivationQualityGate(
  input: RunCompletedDerivationQualityGateInput
): Promise<void> {
  const gatedAt = new Date();

  try {
    const qa = await analyzeCreativeQa({
      imageBuffer: input.imageBuffer,
      mimeType: input.mimeType,
      baseImageBuffer: input.baseImageBuffer,
      baseMimeType: input.baseMimeType,
      styleImageBuffer: input.styleImageBuffer,
      styleMimeType: input.styleMimeType,
      locale: input.locale,
      campaign: input.campaign,
      derivation: input.derivation,
      contract: input.contract,
    });

    const row = await getDerivationById(input.derivationId, input.workspaceId);
    const scoreIssues = asScoreIssues(row?.scoreIssues);
    const qualityScore =
      typeof row?.qualityScore === "number" && Number.isFinite(row.qualityScore)
        ? row.qualityScore
        : 0;

    const scoreBreakdown =
      (row?.scoreBreakdown as CreativeScoreBreakdown | null) ?? null;
    const checklist = qa.checklist as CreativeQaChecklistWithStyle;
    const { qualityVerdict, hardFailures, polishSuggestions, qualityScore: cappedQualityScore, scoreBreakdown: cappedScoreBreakdown } =
      computeQualityGateFromAnalysis({
        checklist,
        contract: input.contract,
        scoreIssues,
        qualityScore,
        scoreBreakdown,
      });

    await updateDerivationQa(input.derivationId, input.workspaceId, {
      qaStatus: qa.status,
      qaChecklist: qa.checklist,
      qaIssues: qa.issues,
      qaSuggestions: qa.suggestions,
    });

    await updateDerivationQualityGate(input.derivationId, input.workspaceId, {
      qualityVerdict,
      hardFailures,
      polishSuggestions,
      qualityGatedAt: gatedAt,
    });

    if (hardFailures.length > 0 && row) {
      const regenerationSuggestion = buildHardFailureRegenerationSuggestion({
        hardFailures,
        contract: input.contract,
        scoreIssues,
        qaChecklist: checklist,
      });
      await updateDerivationScore(input.derivationId, input.workspaceId, {
        qualityScore: cappedQualityScore,
        scoreStatus:
          (row.scoreStatus as "heuristic" | "analyzed" | "failed" | "pending") ?? "analyzed",
        scoreBreakdown: cappedScoreBreakdown ?? scoreBreakdown,
        scoreIssues,
        regenerationSuggestion,
      });
    }

    await persistDualVerdictFromQualityGate({
      derivationId: input.derivationId,
      workspaceId: input.workspaceId,
      contract: input.contract,
      derivation: input.derivation,
      hardFailures,
      qa,
      gatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.warn(
      `[quality-gate] failed derivationId=${input.derivationId}: ${message}`
    );
    await persistQualityGateFallback(input.derivationId, input.workspaceId, gatedAt);
  }
}

// ---------------------------------------------------------------------------
// Creative Work v1 objective verdict + persisted quality payload (R-005 /
// spec 9). Integrity is separated from taste: a confirmed objective code
// always forces `fail` regardless of any subjective score, and a technical
// failure or ambiguity of the objective evaluator persists `inconclusive` —
// the output stays available with a review signal, without retry and without
// counting as an objective approval in Gate 8.
// ---------------------------------------------------------------------------

/** Technical status of the objective visual evaluator. */
export type CreativeWorkQaEvaluatorStatus = "completed" | "failed" | "skipped";

export interface CreativeWorkObjectiveVerdictResult {
  verdict: CreativeWorkObjectiveVerdict;
  objectiveCodes: CreativeWorkObjectiveFailureCode[];
}

/**
 * Pure tri-state derivation (spec 9.1–9.2):
 * - any confirmed objective code (deterministic or visual) → `fail`, no
 *   matter what the subjective score says;
 * - evaluator failure/skip without confirmed codes, or genuinely ambiguous
 *   (`suspected`) findings → `inconclusive`;
 * - otherwise → `pass` (requires valid deterministic checks upstream and no
 *   confirmed objective failure).
 */
export function deriveCreativeWorkObjectiveVerdict(input: {
  deterministicCodes: readonly CreativeWorkObjectiveFailureCode[];
  findings: readonly CreativeWorkQaFinding[];
  evaluatorStatus: CreativeWorkQaEvaluatorStatus;
}): CreativeWorkObjectiveVerdictResult {
  const confirmed: CreativeWorkObjectiveFailureCode[] = [];
  const push = (code: CreativeWorkObjectiveFailureCode) => {
    if (!confirmed.includes(code)) confirmed.push(code);
  };
  for (const code of input.deterministicCodes) push(code);
  for (const finding of input.findings) {
    if (finding.status === "confirmed") push(finding.code);
  }
  if (confirmed.length > 0) {
    return { verdict: "fail", objectiveCodes: confirmed };
  }
  if (input.evaluatorStatus !== "completed") {
    return { verdict: "inconclusive", objectiveCodes: [] };
  }
  if (input.findings.some((finding) => finding.status === "suspected")) {
    return { verdict: "inconclusive", objectiveCodes: [] };
  }
  return { verdict: "pass", objectiveCodes: [] };
}

/** Version of the persisted `creative_work_outputs.quality` v1 payload. */
export const CREATIVE_WORK_QUALITY_SCHEMA_VERSION = 1 as const;

export interface CreativeWorkQualityFinding {
  code: CreativeWorkObjectiveFailureCode;
  status: "confirmed" | "suspected";
  note: string;
  /** Deterministic findings need no vision model; visual ones come from the evaluator. */
  origin: "deterministic" | "vision";
  confidence?: number;
}

export type CreativeWorkSubjectiveScoreStatus =
  | "analyzed"
  | "heuristic"
  | "failed"
  | "unavailable";

/**
 * Persisted shape of `creative_work_outputs.quality` for v1 direct outputs.
 * Legacy rows keep the historical ScoreResult shape (or null) — readers must
 * discriminate on `schemaVersion`/`objectiveVerdict` before consuming v1
 * fields (documented for the T9 projection).
 */
export interface CreativeWorkQualityPayload {
  schemaVersion: typeof CREATIVE_WORK_QUALITY_SCHEMA_VERSION;
  objectiveVerdict: CreativeWorkObjectiveVerdict;
  /** Confirmed objective failure codes — the input of the T8 surgical correction. */
  objectiveCodes: CreativeWorkObjectiveFailureCode[];
  findings: CreativeWorkQualityFinding[];
  /** Advisory subjective signals — never a reject/retry trigger. */
  subjective: {
    scoreStatus: CreativeWorkSubjectiveScoreStatus;
    qualityScore: number | null;
    issues: string[];
  };
  evaluator: {
    status: CreativeWorkQaEvaluatorStatus;
    error: string | null;
  };
  /**
   * One-sentence visual evaluator summary (T8): persisted for the T9 review
   * surface. Null when the evaluator failed or was skipped.
   */
  evaluatorSummary: string | null;
  checks: {
    file: {
      ok: boolean;
      width: number | null;
      height: number | null;
      format: string | null;
      bytes: number;
    };
    dimensions: {
      ok: boolean;
      expected: { width: number; height: number };
      actual: { width: number; height: number } | null;
    };
    references: { ok: boolean; missingRequired: string[] };
  };
  /** 1-based attempt of the provider call that produced the assessed image. */
  attempt: number;
  checkedAt: string;
}

// Lazy membership check (no module-scope Set construction): test doubles that
// partially mock creative-qa must not break this module at import time.
function isKnownObjectiveCode(code: string): boolean {
  return (CREATIVE_WORK_OBJECTIVE_FAILURE_CODES as readonly string[]).includes(code);
}

function asSubjectiveScoreStatus(value: unknown): CreativeWorkSubjectiveScoreStatus {
  return value === "analyzed" || value === "heuristic" || value === "failed"
    ? value
    : "unavailable";
}

/**
 * Assemble the versioned quality payload persisted on the output row. Pure:
 * verdict, codes, findings, subjective signals, evaluator status and attempt
 * are derived from the inputs only.
 */
export function buildCreativeWorkQualityPayload(input: {
  deterministicFindings: readonly CreativeWorkQualityFinding[];
  visionFindings: readonly CreativeWorkQaFinding[];
  evaluatorStatus: CreativeWorkQaEvaluatorStatus;
  evaluatorError?: string | null;
  /** One-sentence evaluator summary — persisted for the review surface. */
  evaluatorSummary?: string | null;
  subjective: {
    scoreStatus: string;
    qualityScore: number | null;
    issues: string[];
  } | null;
  checks: CreativeWorkQualityPayload["checks"];
  attempt: number;
  checkedAt?: Date;
}): CreativeWorkQualityPayload {
  // Defense in depth for persisted JSON: unknown codes (never emitted by the
  // normalizer or the deterministic checks) are dropped BEFORE the verdict
  // is derived, so a junk finding can neither force a fail nor reach the T8
  // correction contract.
  const deterministicFindings = input.deterministicFindings.filter((finding) =>
    isKnownObjectiveCode(finding.code),
  );
  const visionFindings = input.visionFindings.filter((finding) =>
    isKnownObjectiveCode(finding.code),
  );
  const { verdict, objectiveCodes } = deriveCreativeWorkObjectiveVerdict({
    deterministicCodes: deterministicFindings.map((finding) => finding.code),
    findings: visionFindings,
    evaluatorStatus: input.evaluatorStatus,
  });

  const findings: CreativeWorkQualityFinding[] = [
    ...deterministicFindings,
    ...visionFindings.map((finding) => ({
      code: finding.code,
      status: finding.status,
      note: finding.note,
      origin: "vision" as const,
      ...(finding.confidence === undefined ? {} : { confidence: finding.confidence }),
    })),
  ];

  const attempt =
    Number.isInteger(input.attempt) && input.attempt >= 1 ? input.attempt : 1;

  return {
    schemaVersion: CREATIVE_WORK_QUALITY_SCHEMA_VERSION,
    objectiveVerdict: verdict,
    objectiveCodes,
    findings,
    subjective: input.subjective
      ? {
          scoreStatus: asSubjectiveScoreStatus(input.subjective.scoreStatus),
          qualityScore:
            typeof input.subjective.qualityScore === "number" &&
            Number.isFinite(input.subjective.qualityScore)
              ? input.subjective.qualityScore
              : null,
          issues: input.subjective.issues
            .filter((issue) => typeof issue === "string" && issue.trim().length > 0)
            .slice(0, 6),
        }
      : { scoreStatus: "unavailable", qualityScore: null, issues: [] },
    evaluator: {
      status: input.evaluatorStatus,
      error: input.evaluatorError ?? null,
    },
    evaluatorSummary:
      typeof input.evaluatorSummary === "string" &&
      input.evaluatorSummary.trim().length > 0
        ? input.evaluatorSummary
        : null,
    checks: input.checks,
    attempt,
    checkedAt: (input.checkedAt ?? new Date()).toISOString(),
  };
}
