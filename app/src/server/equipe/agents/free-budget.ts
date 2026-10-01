import { zodResponseFormat } from "openai/helpers/zod";
import { env } from "@/server/validation/env";
import type { EquipeEvent, EquipeRepositories, AccountScope } from "../data";
import type { ModelCallRequest, ModelImagePart } from "./model-client";
import { DIAGNOSIS_REOPENED_EVENT } from "../handoff/diagnosis-contract";
import { replacementCanStillSucceed } from "../handoff/diagnosis-state";

export const DIAGNOSTIC_RECORDED_EVENT = "diagnostic.recorded";
export type DiagnosticRecordedPayload = { documentId: string };

/**
 * Ticket 08 writes `diagnostic.recorded` in the SAME transaction as its diagnostic document.
 * A diagnosis the person sent back for a better source (`diagnosis.reopened`) stops counting while its
 * replacement can still be recorded: the reserve and the plan-card gate apply to the new attempt. A replacement
 * that can no longer succeed (no reading left, or its diagnosis failed for good) gives the earlier one back.
 */
export async function hasRecordedDiagnostic(repos: EquipeRepositories, scope: AccountScope) {
  const recorded = (await repos.events.list(scope, { eventType: DIAGNOSTIC_RECORDED_EVENT })).filter(isRecordedDiagnostic);
  if (!recorded.length) return false;
  const reopened = new Set((await repos.events.list(scope, { eventType: DIAGNOSIS_REOPENED_EVENT }))
    .map(event => (event.payload as { documentId?: unknown } | null)?.documentId));
  if (recorded.some(event => !reopened.has((event.payload as DiagnosticRecordedPayload).documentId))) return true;
  return !(await replacementCanStillSucceed(repos, scope));
}

function isRecordedDiagnostic(event: EquipeEvent) {
  const payload = event.payload as Partial<DiagnosticRecordedPayload> | null;
  return typeof payload?.documentId === "string" && payload.documentId.length > 0;
}

export function freeBudgetUsdCents() { return Number(env.EQUIPE_FREE_AI_BUDGET_USD_CENTS ?? 100); }
/**
 * The diagnosis reserve when `EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS` is not set: 10 cents, as measured in tickets 08 and 12 (a diagnosis settles at
 * 1 cent; up to 6 attempts per reading, 6 cents, plus 4 of slack). It used to be the whole cap here and 10 cents in free-balance.ts: one default now.
 */
export const DIAGNOSIS_MEASURED_RESERVE_USD_CENTS = 10;
/** The ONE place that says how much the free account keeps for its diagnosis: the configured reserve, or the measured one, never past the cap. */
export function diagnosticReserveUsdCents() {
  return Math.min(freeBudgetUsdCents(), env.EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS ?? DIAGNOSIS_MEASURED_RESERVE_USD_CENTS);
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
  if (!Number.isFinite(images) || images > 4) return null;
  const text = textInputTokenBound({ ...request, messages });
  // <=1024px JPEG: <=1369 visual patches (28px), with conservative framing margin.
  return text === null ? null : text + images * 4096;
}
