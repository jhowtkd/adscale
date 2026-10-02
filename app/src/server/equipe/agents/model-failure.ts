// Did a failed model call run? (ticket 13, D-2; review of PR 614)
//
// A free call reserves its maximum cost before it is sent (budgeted-client.ts). When it fails, the reservation is given back ONLY if the failure PROVES
// nothing ran; anything else may have been billed and keeps its maximum (the strict US$ 1 cap never refunds a doubt). What proves it, by allow-list:
//   a. the request never left this process;
//   b. HTTP 401, 403, 404 or 413, from any provider: refused before any generation;
//   c. HTTP 400/422 from ANTHROPIC only, type `invalid_request_error`, whose message OPENS with the path of a request parameter
//      ("output_config.format.schema: …", "messages.0.content.1.image.source.url: …"): the API validating the REQUEST. That is the case measured in
//      ticket 12. A 400 without such a path ("Output blocked by content filtering policy", "prompt is too long", "credit balance…") is not proof.
// Everything else keeps the maximum: 408/409/429, 5xx, no status (dropped connection, timeout, abort), and any 400/422 from Meta/OpenAI (a
// `json_validate_failed` or an answer outside the schema is raised AFTER the model generated) until those are measured.
//
// What is kept of a failure is structured and never the provider's text (it can echo the prompt, a signed URL or a key fragment): the status, the
// error type and code, the request id, the PATH of the parameter, and a reason from a fixed vocabulary.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { ModelRequestNotSentError } from "./model-client";

/** HTTP statuses that refuse a request before any generation, whichever the provider: unauthorized, forbidden, unknown model or route, request too large. */
export const PROVIDER_REFUSAL_STATUSES: readonly number[] = [401, 403, 404, 413];

/** Messages API request parameters. A 400 whose message opens with one of their paths is the API validating the request itself. */
const ANTHROPIC_REQUEST_PARAMS = ["model", "messages", "system", "max_tokens", "output_config", "tools", "tool_choice", "thinking", "metadata",
  "stop_sequences", "temperature", "top_p", "top_k", "cache_control", "container", "mcp_servers", "service_tier", "stream"];
const REQUEST_PARAM_PATH = new RegExp(`^((?:${ANTHROPIC_REQUEST_PARAMS.join("|")})(?:\\.[A-Za-z0-9_-]{1,40}|\\[\\d{1,4}\\]){0,12}):\\s`);
/** A short identifier as providers write error types, codes and parameter paths. Anything else is dropped, never stored. */
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_.[\]-]{0,79}$/;
const REQUEST_ID = /^[A-Za-z0-9_-]{1,100}$/;
/** Our own error codes (`budget_exceeded`, `free_call_unbounded`…): they say what happened and carry no content. */
const OWN_CODE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+){0,5}$/;

export type ModelFailureReason =
  | "schema_unsupported" | "request_invalid" | "input_too_long" | "billing" | "content_blocked" | "output_invalid"
  | "auth" | "not_found" | "too_large" | "rate_limited" | "provider_error" | "give_back_limit";

export type ModelFailure = {
  /** `not_sent`: the request never left this process. `provider_rejected`: the provider refused it, provably before any generation. `other`: may have run. */
  kind: "not_sent" | "provider_rejected" | "other";
  status?: number;
  /** The provider's error type and code (`invalid_request_error`, `json_validate_failed`). */
  type?: string;
  code?: string;
  requestId?: string;
  /** Where the request is wrong: the PATH of a parameter (`output_config.format.schema`), never its value. */
  param?: string;
  /** What kind of failure this is, from a fixed vocabulary. Never what the provider wrote. */
  reason?: ModelFailureReason;
  /** Our own words only: a request that never left (our message) or an error code we threw. Never provider text. */
  message?: string;
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const identifier = (value: unknown): string | undefined => (typeof value === "string" && IDENTIFIER.test(value) ? value : undefined);

/** Our own message for a request that never left: links and anything past 300 characters are dropped. */
const ownText = (text: string) => text.replace(/https?:\/\/\S+/gi, "[url]").replace(/\s+/g, " ").trim().slice(0, 300);

type ProviderApiError = InstanceType<typeof Anthropic.APIError> | InstanceType<typeof OpenAI.APIError>;

/** What the provider wrote. Used only to MATCH known patterns; it is never stored. */
function providerText(error: ProviderApiError): string {
  const body: unknown = error.error;
  const detail = isObject(body) && isObject(body.error) ? body.error : body;
  return isObject(detail) && typeof detail.message === "string" ? detail.message : error.message;
}

function reasonOf(status: number | undefined, text: string, code: string | undefined, param: string | undefined): ModelFailureReason | undefined {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 413) return "too_large";
  if (code === "json_validate_failed" || /did not match|failed to generate json/i.test(text)) return "output_invalid";
  if (/content filter|output blocked|\bsafety\b|\bpolicy\b/i.test(text)) return "content_blocked";
  if (/credit balance|billing|\bquota\b|insufficient/i.test(text)) return "billing";
  if (/prompt is too long|too many tokens|context (?:length|window)/i.test(text)) return "input_too_long";
  if (param?.startsWith("output_config") && /not supported|unsupported|invalid/i.test(text)) return "schema_unsupported";
  if (param) return "request_invalid";
  if (status === 429) return "rate_limited";
  if (status !== undefined && status >= 500) return "provider_error";
  return undefined;
}

export function classifyModelFailure(error: unknown): ModelFailure {
  if (error instanceof ModelRequestNotSentError) return { kind: "not_sent", message: ownText(error.message) };
  const fromAnthropic = error instanceof Anthropic.APIError;
  if (fromAnthropic || error instanceof OpenAI.APIError) {
    const text = providerText(error);
    const { status } = error;
    const type = identifier(error.type), code = error instanceof OpenAI.APIError ? identifier(error.code) : undefined;
    // The path of the parameter: Anthropic writes it at the start of the message; OpenAI-shaped APIs carry it as `param`.
    const leading = fromAnthropic ? REQUEST_PARAM_PATH.exec(text)?.[1] : undefined;
    const param = leading ?? (error instanceof OpenAI.APIError ? identifier(error.param) : undefined);
    const proven = status !== undefined && (PROVIDER_REFUSAL_STATUSES.includes(status)
      || (fromAnthropic && (status === 400 || status === 422) && type === "invalid_request_error" && leading !== undefined));
    const reason = reasonOf(status, text, code, param);
    const requestId = typeof error.requestID === "string" && REQUEST_ID.test(error.requestID) ? error.requestID : undefined;
    return { kind: proven ? "provider_rejected" : "other",
      ...(status !== undefined ? { status } : {}), ...(type ? { type } : {}), ...(code ? { code } : {}), ...(requestId ? { requestId } : {}),
      ...(param ? { param } : {}), ...(reason ? { reason } : {}) };
  }
  return { kind: "other", message: error instanceof Error ? (OWN_CODE.test(error.message) ? `${error.name}: ${error.message}` : error.name) : "unknown" };
}

/** True only when the failure proves that no model ran, so nothing was billed. */
export function modelCallNeverRan(error: unknown): boolean {
  return classifyModelFailure(error).kind !== "other";
}
