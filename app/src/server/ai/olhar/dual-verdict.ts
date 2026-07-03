import type { CreativeHardFailure } from "../creative-quality-gate";
import {
  resolveArtDirectionVerdictFromFailures,
  type ArtDirectionFailureInput,
} from "./art-direction-verdict";

export type OlharVerdictValue = "pronta" | "quase" | "sem_opiniao" | "confusa";
export type ExportStatusValue = "ok" | "ajuste_menor" | "bloqueado";
export type OlharAxisScore = 0 | 1 | 2 | 3;

export type OlharAxisScores = {
  figura: OlharAxisScore;
  gestalt: OlharAxisScore;
  voz: OlharAxisScore;
  convite: OlharAxisScore;
};

export type OlharVerdictSource = "quality_gate" | "manual" | "migration_fallback";

export interface OlharVerdictPayload {
  value: OlharVerdictValue;
  axes: OlharAxisScores;
  whatWorks: string[];
  whatBlocks: string[];
  directionNote: string;
  source: OlharVerdictSource;
  evaluatedAt: string;
}

export interface ExportValidationIssue {
  code: string;
  message: string;
  severity?: "blocker" | "warning";
}

export interface ExportStatusPayload {
  value: ExportStatusValue;
  issues: ExportValidationIssue[];
  setupIssues: ExportValidationIssue[];
  normalizedCta?: {
    expected: string | null;
    observed: string | null;
  };
  evaluatedAt: string;
}

const OLHAR_VERDICT_VALUES = new Set<OlharVerdictValue>([
  "pronta",
  "quase",
  "sem_opiniao",
  "confusa",
]);

const EXPORT_STATUS_VALUES = new Set<ExportStatusValue>([
  "ok",
  "ajuste_menor",
  "bloqueado",
]);

const OLHAR_AXIS_KEYS = ["figura", "gestalt", "voz", "convite"] as const;

const OLHAR_VERDICT_SOURCES = new Set<OlharVerdictSource>([
  "quality_gate",
  "manual",
  "migration_fallback",
]);

const BLOCKING_OLHAR_VERDICTS = new Set<OlharVerdictValue>([
  "sem_opiniao",
  "confusa",
]);

export type DualVerdictValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  );
}

function isValidAxisScore(value: unknown): value is OlharAxisScore {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 3
  );
}

export function validateOlharAxisScores(
  value: unknown
): DualVerdictValidationResult<OlharAxisScores> {
  if (!isRecord(value)) {
    return { ok: false, errors: ["axes must be an object"] };
  }

  const errors: string[] = [];
  const axes = {} as OlharAxisScores;

  for (const key of OLHAR_AXIS_KEYS) {
    const score = value[key];
    if (!isValidAxisScore(score)) {
      errors.push(`${key} must be an integer between 0 and 3`);
      continue;
    }
    axes[key] = score;
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: axes };
}

export function validateOlharVerdictPayload(
  value: unknown
): DualVerdictValidationResult<OlharVerdictPayload> {
  if (!isRecord(value)) {
    return { ok: false, errors: ["olharVerdict must be an object"] };
  }

  const errors: string[] = [];

  if (
    typeof value.value !== "string" ||
    !OLHAR_VERDICT_VALUES.has(value.value as OlharVerdictValue)
  ) {
    errors.push("value must be pronta, quase, sem_opiniao, or confusa");
  }

  const axesResult = validateOlharAxisScores(value.axes);
  if (!axesResult.ok) {
    errors.push(...axesResult.errors);
  }

  if (!isStringArray(value.whatWorks)) {
    errors.push("whatWorks must be a string array");
  }

  if (!isStringArray(value.whatBlocks)) {
    errors.push("whatBlocks must be a string array");
  }

  if (!isNonEmptyString(value.directionNote)) {
    errors.push("directionNote is required");
  }

  if (
    typeof value.source !== "string" ||
    !OLHAR_VERDICT_SOURCES.has(value.source as OlharVerdictSource)
  ) {
    errors.push("source must be quality_gate, manual, or migration_fallback");
  }

  if (!isNonEmptyString(value.evaluatedAt)) {
    errors.push("evaluatedAt is required");
  }

  if (errors.length > 0 || !axesResult.ok) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      value: value.value as OlharVerdictValue,
      axes: axesResult.value,
      whatWorks: value.whatWorks as string[],
      whatBlocks: value.whatBlocks as string[],
      directionNote: (value.directionNote as string).trim(),
      source: value.source as OlharVerdictSource,
      evaluatedAt: (value.evaluatedAt as string).trim(),
    },
  };
}

function validateExportValidationIssue(
  value: unknown,
  label: string
): DualVerdictValidationResult<ExportValidationIssue> {
  if (!isRecord(value)) {
    return { ok: false, errors: [`${label} entries must be objects`] };
  }

  const errors: string[] = [];
  if (!isNonEmptyString(value.code)) {
    errors.push(`${label}.code is required`);
  }
  if (!isNonEmptyString(value.message)) {
    errors.push(`${label}.message is required`);
  }
  if (
    value.severity !== undefined &&
    value.severity !== "blocker" &&
    value.severity !== "warning"
  ) {
    errors.push(`${label}.severity must be blocker or warning when present`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      code: (value.code as string).trim(),
      message: (value.message as string).trim(),
      ...(value.severity !== undefined
        ? { severity: value.severity as "blocker" | "warning" }
        : {}),
    },
  };
}

function validateExportValidationIssues(
  value: unknown,
  label: string
): DualVerdictValidationResult<ExportValidationIssue[]> {
  if (!Array.isArray(value)) {
    return { ok: false, errors: [`${label} must be an array`] };
  }

  const issues: ExportValidationIssue[] = [];
  const errors: string[] = [];

  for (const [index, item] of value.entries()) {
    const result = validateExportValidationIssue(item, `${label}[${index}]`);
    if (!result.ok) {
      errors.push(...result.errors);
      continue;
    }
    issues.push(result.value);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: issues };
}

export function validateExportStatusPayload(
  value: unknown
): DualVerdictValidationResult<ExportStatusPayload> {
  if (!isRecord(value)) {
    return { ok: false, errors: ["exportStatus must be an object"] };
  }

  const errors: string[] = [];

  if (
    typeof value.value !== "string" ||
    !EXPORT_STATUS_VALUES.has(value.value as ExportStatusValue)
  ) {
    errors.push("value must be ok, ajuste_menor, or bloqueado");
  }

  const issuesResult = validateExportValidationIssues(value.issues, "issues");
  if (!issuesResult.ok) {
    errors.push(...issuesResult.errors);
  }

  const setupIssuesResult = validateExportValidationIssues(
    value.setupIssues,
    "setupIssues"
  );
  if (!setupIssuesResult.ok) {
    errors.push(...setupIssuesResult.errors);
  }

  if (!isNonEmptyString(value.evaluatedAt)) {
    errors.push("evaluatedAt is required");
  }

  let normalizedCta: ExportStatusPayload["normalizedCta"];
  if (value.normalizedCta !== undefined) {
    if (!isRecord(value.normalizedCta)) {
      errors.push("normalizedCta must be an object when present");
    } else {
      const expected = value.normalizedCta.expected;
      const observed = value.normalizedCta.observed;
      if (expected !== null && typeof expected !== "string") {
        errors.push("normalizedCta.expected must be a string or null");
      }
      if (observed !== null && typeof observed !== "string") {
        errors.push("normalizedCta.observed must be a string or null");
      }
      if (
        (expected === null || typeof expected === "string") &&
        (observed === null || typeof observed === "string")
      ) {
        normalizedCta = {
          expected: expected ?? null,
          observed: observed ?? null,
        };
      }
    }
  }

  if (
    errors.length > 0 ||
    !issuesResult.ok ||
    !setupIssuesResult.ok
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      value: value.value as ExportStatusValue,
      issues: issuesResult.value,
      setupIssues: setupIssuesResult.value,
      ...(normalizedCta !== undefined ? { normalizedCta } : {}),
      evaluatedAt: (value.evaluatedAt as string).trim(),
    },
  };
}

export function normalizeOlharVerdictPayload(
  value: unknown
): OlharVerdictPayload | null {
  const result = validateOlharVerdictPayload(value);
  return result.ok ? result.value : null;
}

export function normalizeExportStatusPayload(
  value: unknown
): ExportStatusPayload | null {
  const result = validateExportStatusPayload(value);
  return result.ok ? result.value : null;
}

export function isBlockingOlharVerdict(value: OlharVerdictValue): boolean {
  return BLOCKING_OLHAR_VERDICTS.has(value);
}

export function isBlockingExportStatus(value: ExportStatusValue): boolean {
  return value === "bloqueado";
}

/** True when olhar or export verdict payloads block client-package eligibility. */
export function isDerivationBlockedByVerdictPayloads(input: {
  olharVerdict?: OlharVerdictPayload | null;
  exportStatus?: ExportStatusPayload | null;
}): boolean {
  if (
    input.olharVerdict?.value &&
    isBlockingOlharVerdict(input.olharVerdict.value)
  ) {
    return true;
  }
  if (
    input.exportStatus?.value &&
    isBlockingExportStatus(input.exportStatus.value)
  ) {
    return true;
  }
  return false;
}

export function buildOlharVerdictFromFailures(input: {
  failures: ArtDirectionFailureInput[] | CreativeHardFailure[];
  axes: OlharAxisScores;
  whatWorks?: string[];
  whatBlocks?: string[];
  directionNote: string;
  evaluatedAt: string;
  source?: OlharVerdictSource;
}): OlharVerdictPayload | null {
  const value = resolveArtDirectionVerdictFromFailures(input.failures);
  if (value === null) {
    return null;
  }

  const payload: OlharVerdictPayload = {
    value,
    axes: input.axes,
    whatWorks: input.whatWorks ?? [],
    whatBlocks: input.whatBlocks ?? [],
    directionNote: input.directionNote.trim(),
    source: input.source ?? "quality_gate",
    evaluatedAt: input.evaluatedAt.trim(),
  };

  const validated = validateOlharVerdictPayload(payload);
  return validated.ok ? validated.value : null;
}
