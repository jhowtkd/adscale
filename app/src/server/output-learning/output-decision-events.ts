/**
 * Canonical output decision evidence contract.
 * Postgres `output_decision_events` is the source of truth for output learning;
 * beta analytics and brand/campaign memory remain projections.
 */

export const OUTPUT_DECISION_ACTIONS = [
  "approved",
  "rejected",
  "regenerated",
  "saved_reference",
  "selected_for_delivery",
] as const;

export type OutputDecisionAction = (typeof OUTPUT_DECISION_ACTIONS)[number];

export const OUTPUT_DECISION_DIRECTIONS = [
  "positive",
  "negative",
  "corrective",
] as const;

export type OutputDecisionDirection = (typeof OUTPUT_DECISION_DIRECTIONS)[number];

export const OUTPUT_DECISION_STRENGTHS = ["strong", "medium", "weak"] as const;

export type OutputDecisionStrength = (typeof OUTPUT_DECISION_STRENGTHS)[number];

export interface OutputDecisionReason {
  code?: string;
  text?: string;
  source?: string;
}

export interface OutputDecisionSnapshot {
  generationMode?: string | null;
  format?: string | null;
  variantIndex?: number | null;
  ctaText?: string | null;
  status?: string | null;
  qualityScore?: number | null;
  qualityVerdict?: string | null;
  scoreStatus?: string | null;
  hardFailures?: { code?: string; message?: string }[];
  scoreIssues?: string[];
  polishSuggestions?: string[];
  reason?: OutputDecisionReason;
  referenceKind?: string | null;
  referenceLabel?: string | null;
  parentDerivationId?: string | null;
  childDerivationId?: string | null;
}

const FORBIDDEN_SNAPSHOT_KEYS = new Set([
  "prompt",
  "inputPrompt",
  "outputKey",
  "signedUrl",
  "imageUrl",
  "modelResponse",
  "rawResponse",
  "generationLog",
  "promptProvenance",
  "creativeContract",
  "regenerationCorrectionBrief",
]);

export interface OutputDecisionSemantics {
  action: OutputDecisionAction;
  direction: OutputDecisionDirection;
  strength: OutputDecisionStrength;
}

export function mapActionToSemantics(
  action: OutputDecisionAction
): OutputDecisionSemantics {
  switch (action) {
    case "approved":
      return { action, direction: "positive", strength: "strong" };
    case "rejected":
      return { action, direction: "negative", strength: "strong" };
    case "regenerated":
      return { action, direction: "corrective", strength: "strong" };
    case "saved_reference":
      return { action, direction: "positive", strength: "strong" };
    case "selected_for_delivery":
      return { action, direction: "positive", strength: "medium" };
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

function parseHardFailures(
  value: unknown
): OutputDecisionSnapshot["hardFailures"] {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter(
      (item): item is { code?: string; message?: string } =>
        typeof item === "object" && item !== null
    )
    .map((item) => ({
      code: typeof item.code === "string" ? item.code : undefined,
      message: typeof item.message === "string" ? item.message : undefined,
    }))
    .filter((item) => item.code || item.message);
  return items.length > 0 ? items : undefined;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );
  return items.length > 0 ? items : undefined;
}

export interface DerivationSnapshotInput {
  generationMode?: string | null;
  format?: string | null;
  variantIndex?: number | null;
  ctaText?: string | null;
  status?: string | null;
  qualityScore?: number | null;
  qualityVerdict?: string | null;
  scoreStatus?: string | null;
  hardFailures?: unknown;
  scoreIssues?: unknown;
  polishSuggestions?: unknown;
  regenerationSuggestion?: string | null;
  parentId?: string | null;
  id?: string;
  prompt?: string | null;
  inputPrompt?: string | null;
  outputKey?: string | null;
}

export function buildOutputDecisionSnapshot(
  input: DerivationSnapshotInput,
  extras?: Partial<OutputDecisionSnapshot>
): OutputDecisionSnapshot {
  const snapshot: OutputDecisionSnapshot = {
    generationMode: input.generationMode ?? null,
    format: input.format ?? null,
    variantIndex: input.variantIndex ?? null,
    ctaText: input.ctaText ?? null,
    status: input.status ?? null,
    qualityScore: input.qualityScore ?? null,
    qualityVerdict: input.qualityVerdict ?? null,
    scoreStatus: input.scoreStatus ?? null,
    hardFailures: parseHardFailures(input.hardFailures),
    scoreIssues: parseStringArray(input.scoreIssues),
    polishSuggestions: parseStringArray(input.polishSuggestions),
    parentDerivationId: input.parentId ?? extras?.parentDerivationId ?? null,
    childDerivationId: extras?.childDerivationId ?? null,
    referenceKind: extras?.referenceKind ?? null,
    referenceLabel: extras?.referenceLabel ?? null,
    reason: extras?.reason,
  };

  return sanitizeOutputDecisionSnapshot(snapshot);
}

export function sanitizeOutputDecisionSnapshot(
  snapshot: OutputDecisionSnapshot
): OutputDecisionSnapshot {
  const cleaned = { ...snapshot };

  for (const key of Object.keys(cleaned) as (keyof OutputDecisionSnapshot)[]) {
    if (FORBIDDEN_SNAPSHOT_KEYS.has(key)) {
      delete cleaned[key];
    }
  }

  if (cleaned.hardFailures) {
    cleaned.hardFailures = cleaned.hardFailures
      .slice(0, 20)
      .map((f) => ({
        code: f.code?.slice(0, 120),
        message: f.message?.slice(0, 500),
      }));
  }

  if (cleaned.scoreIssues) {
    cleaned.scoreIssues = cleaned.scoreIssues.slice(0, 20).map((s) => s.slice(0, 500));
  }

  if (cleaned.polishSuggestions) {
    cleaned.polishSuggestions = cleaned.polishSuggestions
      .slice(0, 20)
      .map((s) => s.slice(0, 500));
  }

  if (cleaned.reason?.text) {
    cleaned.reason = {
      ...cleaned.reason,
      text: cleaned.reason.text.slice(0, 1000),
      code: cleaned.reason.code?.slice(0, 120),
    };
  }

  return cleaned;
}

export function isOutputDecisionAction(value: string): value is OutputDecisionAction {
  return (OUTPUT_DECISION_ACTIONS as readonly string[]).includes(value);
}
