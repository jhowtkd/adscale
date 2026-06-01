import type { CreativeContract } from "./creative-contract";
import type {
  CreativeQaChecklist,
  CreativeQaCriterion,
  CreativeQaCriterionResult,
} from "./creative-qa";

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

const WRONG_BRAND_PATTERN =
  /brand mismatch|wrong brand|client mismatch|wrong client|contradicts.*(?:brand|client)|competitor logo|not\s+acme/i;
const UNSUPPORTED_OFFER_PATTERN =
  /unsupported claim|unsupported offer|not in contract|not in the contract|invented|fabricated|unsupported factual/i;

const IMPROVABLE_SCORE_THRESHOLD = 70;

function hasExplicitCta(contract: CreativeContract): boolean {
  return contract.ctaSemantics.kind === "explicit";
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

  for (const issue of scoreIssues) {
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
