import { zodResponseFormat } from "openai/helpers/zod";
import { env } from "@/server/validation/env";
import type { EquipeEvent, EquipeRepositories, AccountScope } from "../data";
import type { ModelCallRequest } from "./model-client";

export const DIAGNOSTIC_RECORDED_EVENT = "diagnostic.recorded";
export type DiagnosticRecordedPayload = { documentId: string };

/** Ticket 08 writes this event in the SAME transaction as its diagnostic document. */
export async function hasRecordedDiagnostic(repos: EquipeRepositories, scope: AccountScope) {
  return (await repos.events.list(scope, { eventType: DIAGNOSTIC_RECORDED_EVENT })).some(isRecordedDiagnostic);
}

function isRecordedDiagnostic(event: EquipeEvent) {
  const payload = event.payload as Partial<DiagnosticRecordedPayload> | null;
  return typeof payload?.documentId === "string" && payload.documentId.length > 0;
}

export function freeBudgetUsdCents() { return Number(env.EQUIPE_FREE_AI_BUDGET_USD_CENTS ?? 100); }
export function diagnosticReserveUsdCents() {
  return Math.min(freeBudgetUsdCents(), env.EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS ?? freeBudgetUsdCents());
}
export function freeStrategistMaxTokens() { return Number(env.EQUIPE_FREE_STRATEGIST_MAX_TOKENS ?? 2048); }

/** Conservative text bound: one token per UTF-8 byte of the complete payload,
 * including tools, output schema and preserved provider blocks, plus protocol
 * framing. Images have no bound here; 05/08 must normalize and bound them first.
 */
export function textInputTokenBound(request: ModelCallRequest): number | null {
  const messages = JSON.stringify(request.messages);
  if (request.messages.some((message) => message.role === "user" && Array.isArray(message.content)
    && message.content.some((part) => part.type === "image_url"))) return null;
  // Opaque image/document blocks are not admitted as text through history.
  if (/"type":"(?:image|document|image_url)"/.test(messages)) return null;
  const payload = JSON.stringify({ model: request.model, messages: request.messages, tools: request.tools,
    output: request.output ? zodResponseFormat(request.output.schema, request.output.name) : undefined,
    effort: request.effort, cache: request.cache, maxTokens: request.maxTokens });
  return Buffer.byteLength(payload, "utf8") + 4096;
}

export function withTextInputBound(request: ModelCallRequest): ModelCallRequest {
  const inputTokenBound = textInputTokenBound(request);
  return { ...request, ...(inputTokenBound !== null ? { inputTokenBound } : {}) };
}
