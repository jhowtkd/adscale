import { REDACTED, redactTelemetry } from "../../lib/redact-telemetry";
import { DIAGNOSTIC_CONTENT_POLICY_VERSION } from "./content-policy";
import {
  DIAGNOSTIC_EXPORT_BUDGET,
  type ContentAvailabilityState,
  type DiagnosticContentMode,
  type DiagnosticContentRef,
} from "./contract";

/**
 * Diagnostic content sanitization (jhowtkd/adscale#391).
 *
 * Builds ON the shared `redactTelemetry` traversal (#385) — never forks or
 * duplicates it. The pipeline is:
 *
 *   1. shallow allowlist of top-level content attributes (unauthorized free
 *      text is dropped; banned chain-of-thought / image keys are denied);
 *   2. `redactTelemetry` — secrets, cookies, keys, tokens (but NOT the
 *      usage counters `inputTokens`/`outputTokens`), nested values, arrays,
 *      exception messages/`cause`, breadcrumbs, span attributes;
 *   3. post-pass over the redacted plain data: deep banned-key strip
 *      (reasoning, image/base64), binary drop, personal-data scrub, signed
 *      URL query strip, per-leaf and total size bounds.
 *
 * The result is labeled NOT a verbatim reproduction. Any failure drops the
 * content (returns null) so the caller keeps safe metadata only. The input
 * — including the model-bound object — is never mutated, and no network
 * I/O ever happens here (media URLs are never fetched).
 */

export const CONTENT_NOT_VERBATIM_NOTICE =
  "Masked diagnostic content — not a verbatim reproduction of the model input or output.";

/** Per-string-leaf cap before the truncation marker. */
export const DIAGNOSTIC_CONTENT_MAX_STRING_LENGTH = 4_000;

/** Total sanitized payload budget (frozen per-event budget). */
export const DIAGNOSTIC_CONTENT_MAX_BYTES =
  DIAGNOSTIC_EXPORT_BUDGET.maxEventBytes;

const TRUNCATION_SUFFIX = "…[truncated]";
const CIRCULAR = "[Circular]";
const OVERSIZE_MARKER = "payload-exceeds-budget";

/** Top-level attributes authorized to carry content or redacted context. */
const ALLOWED_CONTENT_KEYS = new Set([
  "text",
  "content",
  "prompt",
  "response",
  "input",
  "output",
  "messages",
  "parts",
  "role",
  "name",
  "type",
  "inputTokens",
  "outputTokens",
  "error",
  "message",
  "cause",
  "stack",
  "breadcrumbs",
  "attributes",
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Normalized keys denied at any depth: hidden reasoning / image media. */
const BANNED_CONTENT_KEYS = new Set([
  // Hidden chain-of-thought — never captured, even when the API exposes it.
  "reasoning",
  "reasoningcontent",
  "chainofthought",
  "thinking",
  "thought",
  "thoughts",
  "internalreasoning",
  "hiddenreasoning",
  "cot",
  // Image / binary media — never captured as content.
  "image",
  "images",
  "imageurl",
  "inlineimage",
  "inlinedata",
  "b64json",
  "base64",
  "base64image",
  "dataurl",
  "datauri",
]);

/** Normalized key fragments marking a phone-labeled field. */
const PHONE_KEY_HINTS = ["phone", "telefone", "celular", "fax", "mobile"];

const EMAIL_RE =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CPF_RE = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const FORMATTED_PHONE_RE =
  /(?:\+\d[\d\s().-]{6,}\d|\(\d{2,4}\)\s?\d[\d\s.-]{5,}\d)/g;
const URL_RE = /https?:\/\/[^\s"'<>]+/g;
const DATA_URL_RE = /^data:[^;,]*;base64,/i;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function stripUrlSecrets(match: string): string {
  try {
    const url = new URL(match);
    if (url.protocol !== "http:" && url.protocol !== "https:") return match;
    if (!url.search && !url.username && !url.password) return match;
    url.username = "";
    url.password = "";
    url.search = "";
    return url.toString();
  } catch {
    return match;
  }
}

function scrubContentString(value: string): string {
  let out = value;
  // Fast-path guards (#433): each pattern below needs a literal character
  // to match, so the pass is skipped when it is absent. This keeps long
  // secret-free strings linear instead of quadratic (notably EMAIL_RE
  // backtracking over a matchless run). No behavior change: a pattern
  // cannot match without its required character.
  if (out.includes("http")) {
    try {
      out = out.replace(URL_RE, stripUrlSecrets);
    } catch {
      // Keep the unscrubbed string; later passes still bound it.
    }
  }
  try {
    if (out.includes("@")) out = out.replace(EMAIL_RE, REDACTED);
    out = out.replace(CPF_RE, REDACTED);
    if (out.includes("+") || out.includes("(")) {
      out = out.replace(FORMATTED_PHONE_RE, REDACTED);
    }
  } catch {
    // Keep whatever survived the URL pass.
  }
  return out;
}

function isPhoneLabeledKey(normalizedKey: string): boolean {
  return PHONE_KEY_HINTS.some((hint) => normalizedKey.includes(hint));
}

function countDigits(value: string): number {
  const matches = value.match(/\d/g);
  return matches ? matches.length : 0;
}

interface SweepState {
  truncated: boolean;
  seen: WeakSet<object>;
}

function boundLeaf(value: string, state: SweepState): string {
  if (value.length <= DIAGNOSTIC_CONTENT_MAX_STRING_LENGTH) return value;
  state.truncated = true;
  return (
    value.slice(0, DIAGNOSTIC_CONTENT_MAX_STRING_LENGTH) + TRUNCATION_SUFFIX
  );
}

/**
 * Rebuild plain data from the redacted value: banned keys dropped,
 * strings scrubbed + leaf-bounded, binary/non-plain leaves replaced.
 * Never mutates its input; never throws (callers still guard).
 */
function sweepValue(value: unknown, state: SweepState): unknown {
  if (value === null) return null;
  if (typeof value === "string") {
    if (DATA_URL_RE.test(value)) {
      state.truncated = true;
      return REDACTED;
    }
    return boundLeaf(scrubContentString(value), state);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value !== "object") return undefined;
  if (value instanceof Date) {
    try {
      return value.toISOString();
    } catch {
      return REDACTED;
    }
  }
  if (
    value instanceof ArrayBuffer ||
    (typeof ArrayBuffer === "function" &&
      ArrayBuffer.isView &&
      ArrayBuffer.isView(value))
  ) {
    return REDACTED;
  }
  const container = value as object;
  if (state.seen.has(container)) return CIRCULAR;
  if (Array.isArray(value)) {
    state.seen.add(container);
    return value.map((item) => {
      const swept = sweepValue(item, state);
      return swept === undefined ? null : swept;
    });
  }
  if (!isPlainRecord(value)) return REDACTED;
  state.seen.add(container);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    const normalized = normalizeKey(key);
    if (BANNED_CONTENT_KEYS.has(normalized)) {
      state.truncated = true;
      continue;
    }
    let raw: unknown;
    try {
      raw = value[key];
    } catch {
      out[key] = "[Unreadable]";
      continue;
    }
    if (
      typeof raw === "string" &&
      isPhoneLabeledKey(normalized) &&
      countDigits(raw) >= 7
    ) {
      out[key] = REDACTED;
      continue;
    }
    const swept = sweepValue(raw, state);
    if (swept !== undefined) out[key] = swept;
  }
  return out;
}

/**
 * Shallow top-level allowlist: plain objects keep authorized keys only.
 * Arrays and primitives pass through untouched — the shared redaction
 * and the sweep handle their contents. Never mutates the input.
 */
function applyContentAllowlist(value: unknown): unknown {
  if (!isPlainRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (BANNED_CONTENT_KEYS.has(normalizeKey(key))) continue;
    if (!ALLOWED_CONTENT_KEYS.has(key)) continue;
    try {
      out[key] = value[key];
    } catch {
      out[key] = "[Unreadable]";
    }
  }
  return out;
}

function measureBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export interface SanitizedDiagnosticContent extends DiagnosticContentRef {
  verbatim: false;
  notice: typeof CONTENT_NOT_VERBATIM_NOTICE;
  truncated: boolean;
  payload: unknown;
}

/**
 * Sanitize candidate model content into a labeled, bounded, non-verbatim
 * payload — or null when sanitization fails (caller keeps safe metadata).
 * Never mutates the input; never throws; never performs I/O.
 */
export function sanitizeDiagnosticContent(
  value: unknown,
): SanitizedDiagnosticContent | null {
  try {
    const redacted = redactTelemetry(applyContentAllowlist(value));
    const state: SweepState = { truncated: false, seen: new WeakSet() };
    const swept = sweepValue(redacted, state);
    if (swept === undefined) return null;
    if (measureBytes(swept) > DIAGNOSTIC_CONTENT_MAX_BYTES) {
      return {
        availability: "truncated",
        policyVersion: DIAGNOSTIC_CONTENT_POLICY_VERSION,
        verbatim: false,
        notice: CONTENT_NOT_VERBATIM_NOTICE,
        truncated: true,
        payload: { truncated: true, reason: OVERSIZE_MARKER },
      };
    }
    return {
      availability: state.truncated ? "truncated" : "redacted",
      policyVersion: DIAGNOSTIC_CONTENT_POLICY_VERSION,
      verbatim: false,
      notice: CONTENT_NOT_VERBATIM_NOTICE,
      truncated: state.truncated,
      payload: swept,
    };
  } catch {
    return null;
  }
}

export interface ContentAvailabilityInput {
  mode: DiagnosticContentMode;
  collected: boolean;
  truncated: boolean;
  expired: boolean;
  remoteReachable: boolean;
}

/**
 * Label what the console may say about a call's content: always a frozen
 * availability state plus the applied policy version. Precedence: expired
 * (reported, never reconstructed) > not_collected > unavailable (outage) >
 * truncated (not verbatim) > redacted (not verbatim).
 */
export function resolveContentAvailability(
  input: ContentAvailabilityInput,
): DiagnosticContentRef {
  const policyVersion = DIAGNOSTIC_CONTENT_POLICY_VERSION;
  try {
    if (input?.expired === true) return { availability: "expired", policyVersion };
    if (input?.mode !== "redacted" || input?.collected !== true) {
      return { availability: "not_collected", policyVersion };
    }
    if (input?.remoteReachable !== true) {
      return { availability: "unavailable", policyVersion };
    }
    if (input?.truncated === true) {
      return { availability: "truncated", policyVersion };
    }
    return { availability: "redacted", policyVersion };
  } catch {
    return { availability: "unavailable", policyVersion };
  }
}

/** Availability-only ref for expired content — carries no payload, ever. */
export function buildExpiredContentRef(): DiagnosticContentRef {
  return {
    availability: "expired",
    policyVersion: DIAGNOSTIC_CONTENT_POLICY_VERSION,
  };
}

/**
 * True when `occurredAt` is older than `retentionDays` at `now`. Invalid
 * timestamps and non-positive windows fail closed (treated as expired) so
 * content of unknown age is never shown.
 */
export function isContentExpired(
  occurredAt: string,
  now: Date,
  retentionDays: number,
): boolean {
  try {
    if (
      typeof occurredAt !== "string" ||
      Number.isNaN(Date.parse(occurredAt)) ||
      !(now instanceof Date) ||
      Number.isNaN(now.getTime()) ||
      typeof retentionDays !== "number" ||
      !Number.isFinite(retentionDays) ||
      retentionDays <= 0
    ) {
      return true;
    }
    return (
      Date.parse(occurredAt) + retentionDays * 86_400_000 <= now.getTime()
    );
  } catch {
    return true;
  }
}

export type { ContentAvailabilityState };
