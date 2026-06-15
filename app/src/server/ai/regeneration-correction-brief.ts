import { resolveCtaSemantics, type CreativeContract } from "./creative-contract";
import { buildRegenerationSuggestion, ctaTextFromContract } from "./regeneration-suggestion";
import {
  normalizeHardFailureCode,
  type CreativeHardFailureCode,
} from "./creative-quality-gate";
import type { CreativeQaCheckStatus } from "./creative-qa";
import type { FeedbackCategory } from "../repositories/feedback";
import { QA_CRITERION_DISPLAY_ORDER } from "./creative-quality-taxonomy";

const MAX_PROMPT_FEEDBACK_CHARS = 1800;

export const FAILURE_CORRECTION_DIRECTIVES: Partial<
  Record<CreativeHardFailureCode, string>
> = {
  invented_factual_entity:
    "Remove any person, brand, team, or claim not in the allowed-entity registry; depict only contract-approved entities.",
  replaced_source_subject:
    "Restore the original hero person/photo from the factual base; do not substitute a different subject.",
  wrong_brand:
    "Restore the correct campaign brand/logo; remove unauthorized marks.",
  unauthorized_brand_or_ip:
    "Restore the correct campaign brand/logo; remove unauthorized marks.",
  campaign_identity_drift:
    "Restore the original campaign concept, offer narrative, and CTA; this is the same campaign in a new format, not a new ad.",
  style_reference_contamination:
    "Copy visual style only (palette, typography, mood) from the style reference; all facts, people, offers, and CTA text must come from the base image only.",
  visual_overload:
    "Reduce to at most three information zones; establish one dominant hook; demote or remove competing modules.",
  missing_dominant_idea:
    "Restore the campaign's dominant visual idea as the clear focal point.",
  decorative_only_variation:
    "Introduce a new visual mechanism or layout idea — not background/glow/color-only change.",
  cta_drift:
    "Restore the contract CTA exactly (or inherited CTA from base for restyling/format).",
  generic_template_aesthetic:
    "Remove generic neon/glass/template stacks unless required by brand; simplify to campaign-specific design.",
};

export function getFailureCorrectionDirectives(codes: string[]): string[] {
  const seen = new Set<string>();
  const directives: string[] = [];
  for (const rawCode of codes) {
    const code = normalizeHardFailureCode(rawCode);
    const directive = FAILURE_CORRECTION_DIRECTIVES[code];
    if (directive && !seen.has(directive)) {
      seen.add(directive);
      directives.push(directive);
    }
  }
  return directives;
}

export type RegenerationBriefSource =
  | "hard_failures"
  | "score_issues"
  | "qa_failed"
  | "qa_warning"
  | "feedback_category";

export type RegenerationCorrectionBrief = {
  primaryReason: string;
  promptFeedback: string;
  structured: {
    parentDerivationId?: string;
    sources: RegenerationBriefSource[];
    hardFailures: Array<{ code: string; message: string }>;
    scoreIssues: string[];
    qaFailed: Array<{ criterion: string; note: string }>;
    qaWarnings: Array<{ criterion: string; note: string }>;
    feedbackCategory?: FeedbackCategory;
    contractSnapshot: CreativeContract;
  };
};

export type RegenerationCorrectionBriefRecord = RegenerationCorrectionBrief["structured"] & {
  promptFeedback: string;
};

export type { RegenerationIssueBreakdown } from "@/lib/regeneration-preview-types";
import type { RegenerationIssueBreakdown } from "@/lib/regeneration-preview-types";

type QaChecklistInput = Record<string, { status?: CreativeQaCheckStatus | string; note?: string }> | null | undefined;

function formatCriterionLabel(key: string): string {
  if ((QA_CRITERION_DISPLAY_ORDER as readonly string[]).includes(key)) {
    return key;
  }
  return key;
}

function extractQaFromChecklist(checklist: QaChecklistInput): {
  qaFailed: Array<{ criterion: string; note: string }>;
  qaWarnings: Array<{ criterion: string; note: string }>;
} {
  const qaFailed: Array<{ criterion: string; note: string }> = [];
  const qaWarnings: Array<{ criterion: string; note: string }> = [];
  if (!checklist || typeof checklist !== "object") {
    return { qaFailed, qaWarnings };
  }

  for (const [key, entry] of Object.entries(checklist)) {
    if (!entry || typeof entry !== "object") continue;
    const status = entry.status;
    const note = typeof entry.note === "string" ? entry.note.trim() : "";
    const criterion = formatCriterionLabel(key);
    if (status === "failed") {
      qaFailed.push({ criterion, note });
    } else if (status === "warning") {
      qaWarnings.push({ criterion, note });
    }
  }

  return { qaFailed, qaWarnings };
}

function feedbackCategoryLine(category: FeedbackCategory): string {
  const labels: Record<FeedbackCategory, string> = {
    ui: "user reported a UI issue",
    generation: "user reported a generation-quality issue",
    billing: "user reported a billing issue",
    performance: "user reported a performance issue",
    mission: "user reported mission-progression feedback",
    other: "user reported feedback",
  };
  return `Feedback context (${category}): ${labels[category]}`;
}

function buildPrimaryReason(input: {
  hardFailures: Array<{ code: string; message: string }>;
  scoreIssues: string[];
  qaFailed: Array<{ criterion: string; note: string }>;
  qaWarnings: Array<{ criterion: string; note: string }>;
}): string {
  const parts: string[] = [];
  if (input.hardFailures.length > 0) {
    parts.push(input.hardFailures.map((f) => f.code).join(", "));
  }
  if (input.qaFailed.length > 0) {
    parts.push(
      input.qaFailed
        .slice(0, 3)
        .map((q) => `${q.criterion} failed`)
        .join("; ")
    );
  }
  if (input.scoreIssues.length > 0) {
    parts.push(input.scoreIssues.slice(0, 2).join("; "));
  }
  if (parts.length === 0 && input.qaWarnings.length > 0) {
    parts.push(
      input.qaWarnings
        .slice(0, 2)
        .map((q) => `${q.criterion} warning`)
        .join("; ")
    );
  }
  return parts.join(" · ") || "Quality issues detected";
}

function formatIssueSections(input: {
  hardFailures: Array<{ code: string; message: string }>;
  scoreIssues: string[];
  qaFailed: Array<{ criterion: string; note: string }>;
  qaWarnings: Array<{ criterion: string; note: string }>;
  feedbackCategory?: FeedbackCategory;
  modelSuggestion?: string;
}): string {
  const sections: string[] = [];

  if (input.hardFailures.length > 0) {
    const directives = getFailureCorrectionDirectives(
      input.hardFailures.map((f) => f.code)
    );
    if (directives.length > 0) {
      const directiveLines = directives.map((d) => `- ${d}`);
      sections.push(`Correction directives:\n${directiveLines.join("\n")}`);
    }

    const lines = input.hardFailures.map((f) => `- ${f.code}: ${f.message}`);
    sections.push(`Hard failures:\n${lines.join("\n")}`);
  }

  if (input.scoreIssues.length > 0) {
    const lines = input.scoreIssues.map((issue) => `- ${issue}`);
    sections.push(`Score issues:\n${lines.join("\n")}`);
  }

  const qaLines: string[] = [];
  for (const item of input.qaFailed) {
    const detail = item.note ? `: ${item.note}` : "";
    qaLines.push(`- ${item.criterion}${detail}`);
  }
  for (const item of input.qaWarnings.slice(0, 3)) {
    const detail = item.note ? `: ${item.note}` : "";
    qaLines.push(`- ${item.criterion} (warning)${detail}`);
  }
  if (qaLines.length > 0) {
    sections.push(`QA issues:\n${qaLines.join("\n")}`);
  }

  if (input.feedbackCategory) {
    sections.push(feedbackCategoryLine(input.feedbackCategory));
  }

  if (input.modelSuggestion?.trim()) {
    sections.push(`Suggestion: ${input.modelSuggestion.trim()}`);
  }

  return sections.join("\n\n");
}

function applyBriefCharCap(issueBody: string, preservationTail: string): string {
  const tail = preservationTail.trim();
  if (!issueBody.trim()) {
    return tail.length <= MAX_PROMPT_FEEDBACK_CHARS
      ? tail
      : tail.slice(0, MAX_PROMPT_FEEDBACK_CHARS);
  }

  const separator = "\n\n";
  const maxIssueLen = MAX_PROMPT_FEEDBACK_CHARS - separator.length - tail.length;
  if (maxIssueLen <= 0) {
    return tail.slice(0, MAX_PROMPT_FEEDBACK_CHARS);
  }

  let body = issueBody;
  if (body.length > maxIssueLen) {
    body = `${body.slice(0, Math.max(0, maxIssueLen - 1)).trimEnd()}…`;
  }
  return `${body}${separator}${tail}`;
}

export function mergeUserRegenerationNotes(machineBrief: string, userText?: string): string {
  const machine = machineBrief.trim();
  const trimmedUser = userText?.trim() ?? "";
  if (!trimmedUser) {
    return machine;
  }
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  if (normalize(trimmedUser) === normalize(machine)) {
    return machine;
  }
  return `${machine}\n\nAdditional notes: ${trimmedUser}`;
}

export function buildRegenerationCorrectionBrief(input: {
  contract: CreativeContract;
  hardFailures?: Array<{ code: CreativeHardFailureCode | string; message: string }>;
  scoreIssues?: string[];
  qaChecklist?: QaChecklistInput;
  feedbackCategory?: FeedbackCategory;
  modelSuggestion?: string;
  parentDerivationId?: string;
}): RegenerationCorrectionBrief {
  const hardFailures = (input.hardFailures ?? []).map((f) => ({
    code: String(f.code),
    message: f.message,
  }));
  const scoreIssues = (input.scoreIssues ?? []).filter((s) => s.trim().length > 0);
  const { qaFailed, qaWarnings } = extractQaFromChecklist(input.qaChecklist);

  const sources: RegenerationBriefSource[] = [];
  if (hardFailures.length > 0) sources.push("hard_failures");
  if (scoreIssues.length > 0) sources.push("score_issues");
  if (qaFailed.length > 0) sources.push("qa_failed");
  if (qaWarnings.length > 0) sources.push("qa_warning");
  if (input.feedbackCategory) sources.push("feedback_category");

  const modelSuggestion =
    input.modelSuggestion ??
    (hardFailures.length > 0
      ? "Address the hard failures above while preserving the creative contract."
      : "Refine the creative while preserving contract constraints.");

  const preservationTail = buildRegenerationSuggestion({
    ctaText: ctaTextFromContract(input.contract),
    format: input.contract.targetFormat,
    generationMode: input.contract.generationMode,
    scoreIssues: [],
    modelSuggestion,
    contract: input.contract,
  });

  const issueBody = formatIssueSections({
    hardFailures,
    scoreIssues,
    qaFailed,
    qaWarnings,
    feedbackCategory: input.feedbackCategory,
    modelSuggestion: undefined,
  });

  const promptFeedback = applyBriefCharCap(issueBody, preservationTail);

  return {
    primaryReason: buildPrimaryReason({ hardFailures, scoreIssues, qaFailed, qaWarnings }),
    promptFeedback,
    structured: {
      parentDerivationId: input.parentDerivationId,
      sources,
      hardFailures,
      scoreIssues,
      qaFailed,
      qaWarnings,
      feedbackCategory: input.feedbackCategory,
      contractSnapshot: input.contract,
    },
  };
}

export function resolveContractForDerivationRow(row: {
  creativeContract?: CreativeContract | null;
  ctaText?: string | null;
  format?: string | null;
  generationMode?: string | null;
  styleAssetId?: string | null;
}): CreativeContract {
  if (row.creativeContract) {
    return row.creativeContract;
  }
  const generationMode = (row.generationMode ?? "art_variation") as CreativeContract["generationMode"];
  return {
    generationMode,
    targetFormat: row.format ?? "1:1",
    ctaSemantics: resolveCtaSemantics(row.ctaText, generationMode),
    baseAssetId: null,
    styleAssetId: row.styleAssetId ?? null,
    client: null,
    product: null,
    offer: null,
    constraints: null,
  };
}

export function derivationHasRegenerationPreview(row: {
  hardFailures?: unknown;
  regenerationSuggestion?: string | null;
  scoreIssues?: unknown;
  qaChecklist?: unknown;
}): boolean {
  if (parseHardFailures(row.hardFailures).length > 0) return true;
  if (parseScoreIssues(row.scoreIssues).length > 0) return true;
  if (row.regenerationSuggestion?.trim()) return true;
  const { qaFailed, qaWarnings } = extractQaFromChecklist(
    row.qaChecklist as QaChecklistInput
  );
  return qaFailed.length > 0 || qaWarnings.length > 0;
}

export type DerivationBriefPreviewInput = {
  id?: string;
  hardFailures?: unknown;
  scoreIssues?: unknown;
  qaChecklist?: unknown;
  creativeContract?: CreativeContract | null;
  ctaText?: string | null;
  format?: string | null;
  generationMode?: string | null;
  styleAssetId?: string | null;
  regenerationSuggestion?: string | null;
};

function parseHardFailures(value: unknown): Array<{ code: string; message: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is { code: string; message: string } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { code?: unknown }).code === "string" &&
        typeof (item as { message?: unknown }).message === "string"
    )
    .map((item) => ({ code: item.code, message: item.message }));
}

function parseScoreIssues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function deriveRegenerationPreview(
  derivation: DerivationBriefPreviewInput,
  contract: CreativeContract
): { primaryReason: string; issueBreakdown: RegenerationIssueBreakdown } {
  const brief = buildRegenerationCorrectionBrief({
    contract,
    hardFailures: parseHardFailures(derivation.hardFailures),
    scoreIssues: parseScoreIssues(derivation.scoreIssues),
    qaChecklist: derivation.qaChecklist as QaChecklistInput,
    modelSuggestion: derivation.regenerationSuggestion?.trim() || undefined,
    parentDerivationId: derivation.id,
  });

  return {
    primaryReason: brief.primaryReason,
    issueBreakdown: {
      hardFailures: brief.structured.hardFailures,
      scoreIssues: brief.structured.scoreIssues,
      qaFailed: brief.structured.qaFailed,
      qaWarnings: brief.structured.qaWarnings,
    },
  };
}
