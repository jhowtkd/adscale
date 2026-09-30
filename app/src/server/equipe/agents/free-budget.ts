import { zodResponseFormat } from "openai/helpers/zod";
import { env } from "@/server/validation/env";
import type { EquipeEvent, EquipeRepositories, AccountScope } from "../data";
import type { ModelCallRequest, ModelImagePart } from "./model-client";

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

const normalizedImages = new WeakSet<ModelImagePart>();
/** Only trusted server callers that checked the stored JPEG dimensions use this constructor. */
export function normalizedImagePart(url: string, width: number, height: number): ModelImagePart {
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 1024) || !/^https:\/\//.test(url)) throw new Error("free_image_unbounded");
  const part: ModelImagePart = Object.freeze({ type: "image_url", image_url: Object.freeze({ url }) });
  normalizedImages.add(part);
  return part;
}
export function modelInputTokenBound(request: ModelCallRequest): number | null {
  let images = 0;
  const messages = request.messages.map(message => {
    if (message.role !== "user" || !Array.isArray(message.content)) return message;
    return { ...message, content: message.content.map(part => {
      if (part.type !== "image_url") return part;
      if (!normalizedImages.has(part)) images = Number.POSITIVE_INFINITY;
      else images++;
      return { type: "text" as const, text: part.image_url.url };
    }) };
  });
  if (!Number.isFinite(images) || images > 2) return null;
  const text = textInputTokenBound({ ...request, messages });
  // <=1024px JPEG: <=1369 visual patches (28px), with conservative framing margin.
  return text === null ? null : text + images * 4096;
}
