import { randomUUID } from "node:crypto";

import { redactTelemetry } from "../../lib/redact-telemetry";
import type {
  DiagnosticEventError,
  ModelResponseMetadata,
} from "./contract";

/**
 * Lightweight model-call metadata helpers (jhowtkd/adscale#389).
 *
 * Pure extraction only — no journal, no spans, no ambient context — so
 * product call sites (including the image observer's logger path) can use
 * these without pulling the event pipeline. Every reader degrades to nulls
 * on hostile input and never throws.
 */

/** Maximum stored length for a normalized provider-failure reason. */
export const MODEL_CALL_MAX_REASON_LENGTH = 256;

/** Maximum stored length for a normalized error class. */
export const MODEL_CALL_MAX_CLASS_LENGTH = 64;

/** Mint the identity of one real model attempt. Retries mint their own. */
export function newModelCallId(): string {
  return randomUUID();
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? value : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

/**
 * Read a provider-returned token counter. A returned zero stays a zero;
 * absent, non-numeric or impossible values stay absent — never invented.
 */
function readTokenCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}

function readUsageTokens(
  usage: unknown,
  inputKey: string,
  outputKey: string,
): Pick<ModelResponseMetadata, "inputTokens" | "outputTokens"> {
  const record = readRecord(usage);
  if (!record) return {};
  const inputTokens = readTokenCount(record[inputKey]);
  const outputTokens = readTokenCount(record[outputKey]);
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
  };
}

function summarizeUsage(
  value: unknown,
  inputKey: string,
  outputKey: string,
): ModelResponseMetadata {
  const record = readRecord(value);
  if (!record) return { returnedModel: null, providerRequestId: null };
  const returnedModel = readNonEmptyString(record["model"]);
  const providerRequestId =
    readNonEmptyString(record["_request_id"]) ?? readNonEmptyString(record["id"]);
  return {
    returnedModel,
    providerRequestId,
    ...readUsageTokens(record["usage"], inputKey, outputKey),
  };
}

/** Metadata for `chat.completions.create` responses. */
export function summarizeChatCompletion(value: unknown): ModelResponseMetadata {
  return summarizeUsage(value, "prompt_tokens", "completion_tokens");
}

/** Metadata for `responses.create` responses. */
export function summarizeResponsesApi(value: unknown): ModelResponseMetadata {
  return summarizeUsage(value, "input_tokens", "output_tokens");
}

/**
 * Metadata for `images.generate` / `images.edit` responses. The image API
 * echoes no model, so `returnedModel` stays null unless the provider adds
 * one — the requested model still travels on the call envelope.
 */
export function summarizeImageResult(value: unknown): ModelResponseMetadata {
  return summarizeUsage(value, "input_tokens", "output_tokens");
}

export interface NormalizedModelCallError {
  error: DiagnosticEventError;
  /** True for timeouts (including HTTP 408): the remote outcome is unknown. */
  timeout: boolean;
}

function readStatus(value: unknown): number | null {
  const record = readRecord(value);
  const raw = record?.["status"] ?? record?.["statusCode"];
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 100 || raw > 599) {
    return null;
  }
  return raw;
}

function readNameOrCode(value: unknown): { name: string | null; code: string | null } {
  const record = readRecord(value);
  if (!record) return { name: null, code: null };
  let name: string | null = null;
  let code: string | null = null;
  try {
    const rawName = record["name"];
    if (typeof rawName === "string" && rawName.trim().length > 0) name = rawName;
  } catch {
    name = null;
  }
  try {
    const rawCode = record["code"];
    if (typeof rawCode === "string" && rawCode.trim().length > 0) code = rawCode;
  } catch {
    code = null;
  }
  return { name, code };
}

function readMessage(value: unknown): string | null {
  const record = readRecord(value);
  if (!record) return null;
  try {
    const raw = record["message"];
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function boundText(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Normalize a provider failure into the journal error shape. Class, status
 * and reason are set only when actually known — otherwise null. The reason
 * is redacted (bearer material, secrets, signed URLs) and bounded; only
 * the name/code decide the timeout bit, never message text.
 */
export function normalizeModelCallError(error: unknown): NormalizedModelCallError {
  const blank: NormalizedModelCallError = {
    error: { errorClass: null, status: null, reason: null },
    timeout: false,
  };
  if (error === null || error === undefined) return blank;
  try {
    const status = readStatus(error);
    const { name, code } = readNameOrCode(error);
    const timeout =
      status === 408 ||
      (name !== null && /timeout/i.test(name)) ||
      (code !== null && /timeout|ETIMEDOUT|ECONNABORTED/i.test(code));
    const isError = error instanceof Error;
    const errorClass =
      name !== null
        ? boundText(name, MODEL_CALL_MAX_CLASS_LENGTH)
        : isError
          ? "Error"
          : null;
    const message = isError || typeof error === "object" ? readMessage(error) : null;
    const fallbackReason =
      !isError && (typeof error === "string" || typeof error === "number" || typeof error === "boolean")
        ? String(error)
        : null;
    const rawReason = message ?? fallbackReason;
    let reason: string | null = null;
    if (rawReason !== null) {
      const redacted = redactTelemetry(rawReason);
      if (typeof redacted === "string" && redacted.length > 0) {
        reason = boundText(redacted, MODEL_CALL_MAX_REASON_LENGTH);
      }
    }
    return { error: { errorClass, status, reason }, timeout };
  } catch {
    return blank;
  }
}
