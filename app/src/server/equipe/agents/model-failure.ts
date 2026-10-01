// Did a failed model call run? (ticket 13, D-2)
//
// A free call reserves its maximum cost before it is sent (budgeted-client.ts). When it fails, the reservation is given back ONLY if the
// failure proves nothing ran; anything else may have been billed and keeps its maximum (the strict US$ 1 cap never refunds a doubt).
// The proof is one of two things: the request never left this process, or the provider answered that it refused the request itself.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { ModelRequestNotSentError } from "./model-client";

/**
 * HTTP statuses with which a provider refuses a request before any model runs (invalid request, unauthorized, forbidden, unknown model,
 * request too large, unprocessable): nothing is generated and nothing is billed. Deliberately NOT here: 408/409/429, 5xx and no status at
 * all (timeouts, dropped connections, aborts). They say nothing about whether work had started.
 */
export const PROVIDER_REJECTION_STATUSES: readonly number[] = [400, 401, 403, 404, 413, 422];

export type ModelFailure = {
  /** `not_sent`: the request never left this process. `provider_rejected`: the provider refused it. `other`: unknown, may have run. */
  kind: "not_sent" | "provider_rejected" | "other";
  status?: number;
  /** The provider's error type (e.g. `invalid_request_error`). */
  type?: string;
  requestId?: string;
  /** Safe to store and to log: provider text without links, one line, at most 300 characters. */
  message: string;
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Links (a signed image URL may be echoed by a provider) and anything past 300 characters never reach a log or an event. */
function safeText(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, "[url]").replace(/\s+/g, " ").trim().slice(0, 300);
}

type ProviderApiError = InstanceType<typeof Anthropic.APIError> | InstanceType<typeof OpenAI.APIError>;

/** What the provider said, from the SDK's parsed body (`{ error: { type, message } }` on Anthropic, `{ message }` or the same nesting on OpenAI-shaped APIs). */
function providerMessage(error: ProviderApiError): string {
  const body: unknown = error.error;
  const detail = isObject(body) && isObject(body.error) ? body.error : body;
  return isObject(detail) && typeof detail.message === "string" ? detail.message : error.message;
}

/** Our own error codes (`budget_exceeded`, `free_call_unbounded`...) say what happened and carry no content; any other message stays out. */
const CODE_LIKE = /^[a-z0-9_.:-]{1,80}$/i;

export function classifyModelFailure(error: unknown): ModelFailure {
  if (error instanceof ModelRequestNotSentError) return { kind: "not_sent", message: safeText(error.message) };
  if (error instanceof Anthropic.APIError || error instanceof OpenAI.APIError) {
    const type = error.type ?? (error instanceof OpenAI.APIError ? error.code : undefined);
    const known = {
      ...(error.status !== undefined ? { status: error.status } : {}),
      ...(typeof type === "string" ? { type: safeText(type) } : {}),
      ...(error.requestID ? { requestId: safeText(error.requestID) } : {}),
      message: safeText(providerMessage(error)),
    };
    return { kind: error.status !== undefined && PROVIDER_REJECTION_STATUSES.includes(error.status) ? "provider_rejected" : "other", ...known };
  }
  return { kind: "other", message: error instanceof Error ? safeText(CODE_LIKE.test(error.message) ? `${error.name}: ${error.message}` : error.name) : "unknown" };
}

/** True only when the failure proves that no model ran, so nothing was billed. */
export function modelCallNeverRan(error: unknown): boolean {
  return classifyModelFailure(error).kind !== "other";
}
