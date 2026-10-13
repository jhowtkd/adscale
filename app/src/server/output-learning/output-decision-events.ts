/**
 * Canonical output decision evidence contract.
 * Postgres `output_decision_events` is the source of truth for output learning;
 * beta analytics and brand/campaign memory remain projections.
 */
import {
  normalizeExportStatusPayload,
  normalizeOlharVerdictPayload,
} from "@/server/ai/olhar/dual-verdict";

export const OUTPUT_DECISION_ACTIONS = [
  "approved",
  "rejected",
  "regenerated",
  "saved_reference",
  "selected_for_delivery",
  "alternative_not_selected",
  "favorited",
  "favorite_removed",
  "selection_replaced",
  "variation_requested",
  "format_adapted",
  "layer_regenerated",
] as const;

export type OutputDecisionAction = (typeof OUTPUT_DECISION_ACTIONS)[number];

export const OUTPUT_DECISION_DIRECTIONS = [
  "positive",
  "negative",
  "corrective",
  "neutral",
] as const;

export type OutputDecisionDirection = (typeof OUTPUT_DECISION_DIRECTIONS)[number];

export const OUTPUT_DECISION_STRENGTHS = ["strong", "medium", "weak"] as const;

export type OutputDecisionStrength = (typeof OUTPUT_DECISION_STRENGTHS)[number];

export interface OutputDecisionReason {
  code?: string;
  text?: string;
  source?: string;
}

export interface OutputDecisionVerdictRef {
  value?: string | null;
}

export function buildVerdictSnapshotExtras(derivation: {
  olharVerdict?: unknown;
  exportStatus?: unknown;
}): Pick<OutputDecisionSnapshot, "olharVerdict" | "exportStatus"> {
  const olharVerdict = normalizeOlharVerdictPayload(derivation.olharVerdict);
  const exportStatus = normalizeExportStatusPayload(derivation.exportStatus);

  return {
    ...(olharVerdict !== null
      ? { olharVerdict: { value: olharVerdict.value } }
      : {}),
    ...(exportStatus !== null
      ? { exportStatus: { value: exportStatus.value } }
      : {}),
  };
}

export interface OutputDecisionSnapshot {
  evidenceSanitized?: boolean;
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
  automaticReason?: OutputDecisionReason;
  otherReasonText?: string | null;
  notes?: string | null;
  userFeedback?: string | null;
  olharVerdict?: OutputDecisionVerdictRef | null;
  exportStatus?: OutputDecisionVerdictRef | null;
  overrideApproved?: boolean;
  referenceKind?: string | null;
  referenceLabel?: string | null;
  parentDerivationId?: string | null;
  childDerivationId?: string | null;
  /**
   * Goal-agent creative level (conservative/balanced/bold). Selection is weak
   * client evidence; approval is strong client evidence. Captured as a learning
   * variable but never auto-promoted to the global corpus.
   */
  creativeLevel?: string | null;
  /** Layer-editor correction scope: the regenerated layer and its operation. */
  layerId?: string | null;
  operationId?: string | null;
  /** Immutable Item version observed by an Equipe adjustment request. */
  itemId?: string | null;
  itemVersionHash?: string | null;
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
    case "layer_regenerated":
      return { action, direction: "corrective", strength: "strong" };
    case "saved_reference":
      return { action, direction: "positive", strength: "strong" };
    case "selected_for_delivery":
      return { action, direction: "positive", strength: "medium" };
    case "alternative_not_selected":
      return { action, direction: "negative", strength: "weak" };
    case "favorited":
      return { action, direction: "positive", strength: "weak" };
    case "favorite_removed":
    case "selection_replaced":
    case "variation_requested":
    case "format_adapted":
      return { action, direction: "neutral", strength: "weak" };
    default: {
      const _exhaustive: never = action;
      throw new Error(`Invalid output decision action: ${_exhaustive}`);
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
  creativeLevel?: string | null;
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
    automaticReason: extras?.automaticReason,
    otherReasonText: extras?.otherReasonText,
    notes: extras?.notes,
    userFeedback: extras?.userFeedback,
    evidenceSanitized: extras?.evidenceSanitized,
    olharVerdict: extras?.olharVerdict ?? null,
    exportStatus: extras?.exportStatus ?? null,
    overrideApproved: extras?.overrideApproved,
    creativeLevel: input.creativeLevel ?? extras?.creativeLevel ?? null,
    layerId: extras?.layerId ?? null,
    operationId: extras?.operationId ?? null,
    ...(extras?.itemId !== undefined ? { itemId: extras.itemId } : {}),
    ...(extras?.itemVersionHash !== undefined ? { itemVersionHash: extras.itemVersionHash } : {}),
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
        code: sanitizeCalibrationNote(f.code, 120) ?? undefined,
        message: sanitizeCalibrationNote(f.message, 500) ?? undefined,
      }));
  }

  if (cleaned.scoreIssues) {
    cleaned.scoreIssues = cleaned.scoreIssues.slice(0, 20).map((s) => sanitizeCalibrationNote(s, 500)).filter((s): s is string => s !== null);
  }

  if (cleaned.polishSuggestions) {
    cleaned.polishSuggestions = cleaned.polishSuggestions.slice(0, 20).map((s) => sanitizeCalibrationNote(s, 500)).filter((s): s is string => s !== null);
  }

  for (const field of ["reason", "automaticReason"] as const) {
    const reason = cleaned[field];
    if (reason) {
      cleaned[field] = {
        code: sanitizeCalibrationNote(reason.code, 120) ?? undefined,
        text: sanitizeCalibrationNote(reason.text) ?? undefined,
        source: sanitizeCalibrationNote(reason.source, 120) ?? undefined,
      };
    }
  }

  for (const field of ["otherReasonText", "notes", "userFeedback"] as const) {
    if (cleaned[field] !== undefined) {
      cleaned[field] = sanitizeCalibrationNote(cleaned[field], field === "notes" ? 1000 : 500);
    }
  }

  if (cleaned.olharVerdict?.value) {
    cleaned.olharVerdict = {
      value: cleaned.olharVerdict.value.slice(0, 120),
    };
  }

  if (cleaned.exportStatus?.value) {
    cleaned.exportStatus = {
      value: cleaned.exportStatus.value.slice(0, 120),
    };
  }

  if (typeof cleaned.creativeLevel === "string") {
    cleaned.creativeLevel = sanitizeCalibrationNote(cleaned.creativeLevel, 120);
  }
  for (const field of ["layerId", "operationId", "itemId", "itemVersionHash"] as const) {
    if (typeof cleaned[field] === "string") {
      cleaned[field] = sanitizeCalibrationNote(cleaned[field], 120);
    }
  }
  if (typeof cleaned.ctaText === "string") {
    cleaned.ctaText = sanitizeCalibrationNote(cleaned.ctaText, 200);
  }

  if (typeof cleaned.evidenceSanitized !== "boolean") {
    delete cleaned.evidenceSanitized;
  }
  if (JSON.stringify(cleaned) !== JSON.stringify(snapshot)) {
    cleaned.evidenceSanitized = true;
  }

  return cleaned;
}

const FORBIDDEN_NOTE_PATTERNS = [
  /prompt/i,
  /signedurl/i,
  /x-amz-signature/i,
  /postgres:\/\//i,
  /database_url/i,
];

export function sanitizeCalibrationNote(note: string | null | undefined, maxLength = 1000): string | null {
  if (typeof note !== "string" || FORBIDDEN_NOTE_PATTERNS.some((pattern) => pattern.test(note))) return null;
  return note.trim().slice(0, maxLength) || null;
}

export function isOutputDecisionAction(value: string): value is OutputDecisionAction {
  return (OUTPUT_DECISION_ACTIONS as readonly string[]).includes(value);
}
