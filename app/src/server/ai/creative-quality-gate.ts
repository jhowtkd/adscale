/**
 * Hard quality gate: classifies QA checklist + score issues into blocking hard failures
 * vs advisory polish, and derives qualityVerdict. Orchestration runs after derivation scoring.
 */
import { logger } from "@/lib/logger";
import type { CreativeContract } from "./creative-contract";
import {
  analyzeCreativeQa,
  type AnalyzeCreativeQaInput,
  type CreativeQaChecklist,
  type CreativeQaCriterion,
  type CreativeQaCriterionResult,
} from "./creative-qa";
import {
  CROPPED_CONTENT_PATTERN,
  CTA_DRIFT_NOTE_PATTERN,
  ILLEGIBILITY_PATTERN,
  INVALID_FORMAT_LAYOUT_PATTERN,
  UNSUPPORTED_OFFER_PATTERN,
  WRONG_BRAND_PATTERN,
} from "./creative-quality-taxonomy";
import {
  getDerivationById,
  updateDerivationQualityGate,
  updateDerivationQa,
  updateDerivationScore,
  type CreativeScoreBreakdown,
} from "../repositories/derivation";
import { buildHardFailureRegenerationSuggestion } from "./creative-score";

export type CreativeHardFailureCode =
  | "cta_drift"
  | "wrong_brand"
  | "unsupported_offer"
  | "copied_style_reference_facts"
  | "cropped_critical_content"
  | "unreadable_required_text"
  | "invalid_format_layout";

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

function hasExplicitCta(contract: CreativeContract): boolean {
  return contract.ctaSemantics.kind === "explicit";
}

function hasInheritedCta(contract: CreativeContract): boolean {
  return contract.ctaSemantics.kind === "inherited";
}

function noteMatches(pattern: RegExp, note: string): boolean {
  return pattern.test(note);
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
  note: string
): void {
  if (noteMatches(WRONG_BRAND_PATTERN, note)) {
    pushHardFailure(hardFailures, {
      code: "wrong_brand",
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
  }
}

function classifyCtaOfferFailed(
  hardFailures: CreativeHardFailure[],
  contract: CreativeContract,
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
  if (hasExplicitCta(contract)) {
    pushHardFailure(hardFailures, {
      code: "cta_drift",
      message: note,
      criterion: "ctaOffer",
    });
    return;
  }
  if (hasInheritedCta(contract) && noteMatches(CTA_DRIFT_NOTE_PATTERN, note)) {
    pushHardFailure(hardFailures, {
      code: "cta_drift",
      message: note,
      criterion: "ctaOffer",
    });
  }
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
  if (noteMatches(UNSUPPORTED_OFFER_PATTERN, issue)) {
    pushHardFailure(hardFailures, {
      code: "unsupported_offer",
      message: issue,
      criterion: "ctaOffer",
    });
    return true;
  }
  if (noteMatches(CTA_DRIFT_NOTE_PATTERN, issue)) {
    pushHardFailure(hardFailures, {
      code: "cta_drift",
      message: issue,
      criterion: "ctaOffer",
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
  if (noteMatches(ILLEGIBILITY_PATTERN, issue)) {
    pushHardFailure(hardFailures, {
      code: "unreadable_required_text",
      message: issue,
      criterion: "legibility",
    });
    return true;
  }
  if (
    contract.generationMode === "format_adaptation" &&
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
  const hardFailures: CreativeHardFailure[] = [];
  const polishSuggestions: string[] = [];

  if (checklist.legibility.status === "failed") {
    pushHardFailure(hardFailures, {
      code: "unreadable_required_text",
      message: checklist.legibility.note,
      criterion: "legibility",
    });
  }

  if (checklist.informationPreservation.status === "failed") {
    pushHardFailure(hardFailures, {
      code: "cropped_critical_content",
      message: checklist.informationPreservation.note,
      criterion: "informationPreservation",
    });
  }

  if (checklist.styleFidelity?.status === "failed") {
    pushHardFailure(hardFailures, {
      code: "copied_style_reference_facts",
      message: checklist.styleFidelity.note,
      criterion: "styleFidelity",
    });
  }

  if (checklist.formatFit.status === "failed") {
    if (contract.generationMode === "format_adaptation") {
      pushHardFailure(hardFailures, {
        code: "invalid_format_layout",
        message: checklist.formatFit.note,
        criterion: "formatFit",
      });
    } else {
      pushUnique(polishSuggestions, checklist.formatFit.note);
    }
  }

  if (checklist.ctaOffer.status === "failed") {
    classifyCtaOfferFailed(hardFailures, contract, checklist.ctaOffer.note);
  }

  if (checklist.briefMatch.status === "failed") {
    classifyBriefMatchFailed(hardFailures, checklist.briefMatch.note);
  }

  if (checklist.creativeRisk.status === "failed") {
    classifyCreativeRiskFailed(hardFailures, polishSuggestions, checklist.creativeRisk.note);
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

function checklistHasWarning(checklist: CreativeQaChecklistWithStyle): boolean {
  const criteria: (keyof CreativeQaChecklistWithStyle)[] = [
    "legibility",
    "ctaOffer",
    "informationPreservation",
    "briefMatch",
    "formatFit",
    "creativeRisk",
    "styleFidelity",
  ];
  return criteria.some((criterion) => checklist[criterion]?.status === "warning");
}

export type DerivationApprovableResult =
  | { ok: true }
  | {
      ok: false;
      qualityVerdict: CreativeQualityVerdict | null;
      hardFailures: CreativeHardFailure[];
    };

export function assertDerivationApprovable(derivation: {
  qualityVerdict?: string | null;
  hardFailures?: unknown;
}): DerivationApprovableResult {
  const hardFailures = Array.isArray(derivation.hardFailures)
    ? (derivation.hardFailures as CreativeHardFailure[])
    : [];
  if (derivation.qualityVerdict === "invalid" || hardFailures.length > 0) {
    return {
      ok: false,
      qualityVerdict:
        (derivation.qualityVerdict as CreativeQualityVerdict | null) ?? "invalid",
      hardFailures,
    };
  }
  return { ok: true };
}

export function computeQualityGateFromAnalysis(input: {
  checklist: CreativeQaChecklistWithStyle;
  contract: CreativeContract;
  scoreIssues?: string[];
  qualityScore?: number | null;
}): {
  qualityVerdict: CreativeQualityVerdict;
  hardFailures: CreativeHardFailure[];
  polishSuggestions: string[];
} {
  const scoreIssues = input.scoreIssues ?? [];
  const { hardFailures, polishSuggestions } = classifyCreativeQualityGate({
    checklist: input.checklist,
    contract: input.contract,
    scoreIssues,
  });
  const qualityScore =
    typeof input.qualityScore === "number" && Number.isFinite(input.qualityScore)
      ? input.qualityScore
      : 0;
  const qualityVerdict = deriveQualityVerdict({
    hardFailures,
    qualityScore,
    checklist: input.checklist,
  });
  return { qualityVerdict, hardFailures, polishSuggestions };
}

export function deriveQualityVerdict(input: {
  hardFailures: CreativeHardFailure[];
  qualityScore: number;
  checklist: CreativeQaChecklistWithStyle;
}): CreativeQualityVerdict {
  if (input.hardFailures.length > 0) {
    return "invalid";
  }

  if (input.qualityScore < IMPROVABLE_SCORE_THRESHOLD || checklistHasWarning(input.checklist)) {
    return "improvable";
  }

  return "acceptable";
}

export interface RunCompletedDerivationQualityGateInput {
  derivationId: string;
  workspaceId: string;
  imageBuffer: Buffer;
  mimeType: string;
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

export async function runCompletedDerivationQualityGate(
  input: RunCompletedDerivationQualityGateInput
): Promise<void> {
  const gatedAt = new Date();

  try {
    const qa = await analyzeCreativeQa({
      imageBuffer: input.imageBuffer,
      mimeType: input.mimeType,
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

    const checklist = qa.checklist as CreativeQaChecklistWithStyle;
    const { qualityVerdict, hardFailures, polishSuggestions } =
      computeQualityGateFromAnalysis({
        checklist,
        contract: input.contract,
        scoreIssues,
        qualityScore,
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
      });
      await updateDerivationScore(input.derivationId, input.workspaceId, {
        qualityScore: row.qualityScore,
        scoreStatus:
          (row.scoreStatus as "heuristic" | "analyzed" | "failed" | "pending") ?? "analyzed",
        scoreBreakdown: (row.scoreBreakdown as CreativeScoreBreakdown | null) ?? null,
        scoreIssues,
        regenerationSuggestion,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.warn(
      `[quality-gate] failed derivationId=${input.derivationId}: ${message}`
    );
    await persistQualityGateFallback(input.derivationId, input.workspaceId, gatedAt);
  }
}
