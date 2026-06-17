/**
 * Canonical human-quality corpus contract.
 * Postgres corpus tables are the source of truth for live human evaluations.
 */

export const HUMAN_QUALITY_CORPUS_COHORTS = [
  "baseline",
  "pre_learning",
  "post_learning",
] as const;

export type HumanQualityCorpusCohort = (typeof HUMAN_QUALITY_CORPUS_COHORTS)[number];

export const HUMAN_QUALITY_CORPUS_STATUSES = [
  "pending",
  "evaluated",
  "removed",
] as const;

export type HumanQualityCorpusStatus = (typeof HUMAN_QUALITY_CORPUS_STATUSES)[number];

export const HUMAN_QUALITY_INTENTS = ["approve", "reject", "regenerate"] as const;

export type HumanQualityIntent = (typeof HUMAN_QUALITY_INTENTS)[number];

export const HUMAN_QUALITY_FAILURE_REASONS = [
  "visual_overload",
  "weak_hierarchy",
  "generic_template_feel",
  "illegible_cta",
  "unfocused_composition",
  "factual_issue",
  "format_or_crop_issue",
  "other",
] as const;

export type HumanQualityFailureReason = (typeof HUMAN_QUALITY_FAILURE_REASONS)[number];

export interface HumanQualityArtifactRef {
  derivationId: string;
  assetId?: string | null;
  styleAssetId?: string | null;
}

export type OutputLearningApplicationResolution =
  | "recorded"
  | "not_recorded"
  | "recommendation_only";

export interface OutputLearningApplicationSnapshot {
  schemaVersion: 1;
  applied: boolean;
  resolution: OutputLearningApplicationResolution;
  traceId?: string;
  recommendationId?: string;
  primaryVariableKey?: string;
  algorithmVersion?: string;
  safetyVersion?: string;
  learningsSource: "postgres";
}

export interface HumanQualityQualitySnapshot {
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
  outputLearningApplication?: OutputLearningApplicationSnapshot;
}

export interface HumanQualityEvaluationInput {
  visualScore: number;
  factualPass: boolean;
  intent: HumanQualityIntent;
  primaryFailureReason: HumanQualityFailureReason;
  otherReasonText?: string | null;
  notes?: string | null;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "prompt",
  "inputPrompt",
  "outputKey",
  "signedUrl",
  "signedURL",
  "imageUrl",
  "imageBytes",
  "imageData",
  "base64",
  "modelResponse",
  "rawResponse",
  "rawModelResponse",
  "generationLog",
  "promptProvenance",
  "creativeContract",
  "regenerationCorrectionBrief",
  "auth",
  "session",
  "sessionToken",
  "cookie",
  "authorization",
  "diagnostics",
  "debugPayload",
]);

const ALLOWED_ARTIFACT_KEYS = new Set(["derivationId", "assetId", "styleAssetId"]);

export function isHumanQualityCorpusCohort(value: string): value is HumanQualityCorpusCohort {
  return (HUMAN_QUALITY_CORPUS_COHORTS as readonly string[]).includes(value);
}

export function isHumanQualityCorpusStatus(value: string): value is HumanQualityCorpusStatus {
  return (HUMAN_QUALITY_CORPUS_STATUSES as readonly string[]).includes(value);
}

export function isHumanQualityIntent(value: string): value is HumanQualityIntent {
  return (HUMAN_QUALITY_INTENTS as readonly string[]).includes(value);
}

export function isHumanQualityFailureReason(
  value: string
): value is HumanQualityFailureReason {
  return (HUMAN_QUALITY_FAILURE_REASONS as readonly string[]).includes(value);
}

export function classifyCohort(value: string | null | undefined): HumanQualityCorpusCohort {
  if (value && isHumanQualityCorpusCohort(value)) {
    return value;
  }
  return "baseline";
}

export function validateVisualScore(value: unknown): ValidationResult<number> {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { ok: false, error: "visualScore must be an integer" };
  }
  if (value < 0 || value > 100) {
    return { ok: false, error: "visualScore must be between 0 and 100" };
  }
  return { ok: true, value };
}

export function validateFactualPass(value: unknown): ValidationResult<boolean> {
  if (typeof value !== "boolean") {
    return { ok: false, error: "factualPass must be a boolean" };
  }
  return { ok: true, value };
}

function parseHardFailures(
  value: unknown
): HumanQualityQualitySnapshot["hardFailures"] {
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

export interface DerivationQualityInput {
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
  prompt?: string | null;
  inputPrompt?: string | null;
  outputKey?: string | null;
}

export function buildQualitySnapshot(
  input: DerivationQualityInput
): HumanQualityQualitySnapshot {
  const snapshot: HumanQualityQualitySnapshot = {
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
  };

  return sanitizeQualitySnapshot(snapshot);
}

export function stripForbiddenPayloadKeys<T extends Record<string, unknown>>(value: T): T {
  const cleaned = { ...value };
  for (const key of Object.keys(cleaned)) {
    if (FORBIDDEN_PAYLOAD_KEYS.has(key)) {
      delete cleaned[key];
    }
  }
  return cleaned;
}

export function sanitizeArtifactRef(
  input: Record<string, unknown>
): HumanQualityArtifactRef {
  const cleaned = stripForbiddenPayloadKeys(input);
  const ref: HumanQualityArtifactRef = {
    derivationId:
      typeof cleaned.derivationId === "string" ? cleaned.derivationId : "",
  };

  if (typeof cleaned.assetId === "string") {
    ref.assetId = cleaned.assetId.slice(0, 120);
  }
  if (typeof cleaned.styleAssetId === "string") {
    ref.styleAssetId = cleaned.styleAssetId.slice(0, 120);
  }

  for (const key of Object.keys(cleaned)) {
    if (!ALLOWED_ARTIFACT_KEYS.has(key)) {
      delete (cleaned as Record<string, unknown>)[key];
    }
  }

  return ref;
}

export function sanitizeQualitySnapshot(
  snapshot: HumanQualityQualitySnapshot | Record<string, unknown>
): HumanQualityQualitySnapshot {
  const cleaned = stripForbiddenPayloadKeys({ ...snapshot }) as HumanQualityQualitySnapshot;

  if (cleaned.hardFailures) {
    cleaned.hardFailures = cleaned.hardFailures
      .slice(0, 20)
      .map((failure) => ({
        code: failure.code?.slice(0, 120),
        message: failure.message?.slice(0, 500),
      }));
  }

  if (cleaned.scoreIssues) {
    cleaned.scoreIssues = cleaned.scoreIssues.slice(0, 20).map((issue) => issue.slice(0, 500));
  }

  if (cleaned.polishSuggestions) {
    cleaned.polishSuggestions = cleaned.polishSuggestions
      .slice(0, 20)
      .map((suggestion) => suggestion.slice(0, 500));
  }

  if (typeof cleaned.ctaText === "string") {
    cleaned.ctaText = cleaned.ctaText.slice(0, 200);
  }

  return cleaned;
}

export function containsForbiddenPayloadKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => FORBIDDEN_PAYLOAD_KEYS.has(key));
}

export function findForbiddenPayloadKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((key) => FORBIDDEN_PAYLOAD_KEYS.has(key));
}

export function validatePrivacySafePayload(
  value: Record<string, unknown>
): ValidationResult<Record<string, unknown>> {
  const forbidden = findForbiddenPayloadKeys(value);
  if (forbidden.length > 0) {
    return {
      ok: false,
      error: `forbidden corpus payload keys: ${forbidden.join(", ")}`,
    };
  }
  return { ok: true, value };
}

export function sanitizeCorpusPayloads(input: {
  artifactRef: Record<string, unknown>;
  qualitySnapshot: Record<string, unknown>;
}): {
  artifactRef: HumanQualityArtifactRef;
  qualitySnapshot: HumanQualityQualitySnapshot;
} {
  const artifactValidation = validatePrivacySafePayload(input.artifactRef);
  const snapshotValidation = validatePrivacySafePayload(input.qualitySnapshot);

  if (!artifactValidation.ok) {
    throw new Error(artifactValidation.error);
  }
  if (!snapshotValidation.ok) {
    throw new Error(snapshotValidation.error);
  }

  return {
    artifactRef: sanitizeArtifactRef(input.artifactRef),
    qualitySnapshot: sanitizeQualitySnapshot(input.qualitySnapshot),
  };
}
