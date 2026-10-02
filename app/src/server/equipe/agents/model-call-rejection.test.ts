// A free call that PROVABLY never ran gives its reservation back (ticket 13, D-2; review of PR 614).
//
// In the real test of 01/10 every vision call was answered HTTP 400 by Anthropic, no model ran, and each attempt stayed on the account's
// US$ 1 cap at its maximum (12 or 17 cents): the orphan reconciler only closes such a row, at the maximum. The cap is strict, so a doubt
// is never refunded; but a refusal that proves nothing ran gives the reservation back at once. The review found that "any 400/422" was too wide
// (a content filter, an answer outside the schema: raised AFTER the model generated), so the proof is an allow-list (model-failure.ts) and the
// number of give-backs per account is capped. These tests pin both sides of the line.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { createBudgetedModelClient, MAX_GIVE_BACKS_PER_ACCOUNT, MODEL_CALL_REJECTED_EVENT } from "./budgeted-client";
import { modelInputTokenBound } from "./free-budget";
import { MemoryLedgerStore } from "./ledger";
import { ModelRequestNotSentError, type EquipeModelClient, type ModelCallRequest } from "./model-client";
import { classifyModelFailure, modelCallNeverRan } from "./model-failure";
import { defineModelOutput } from "./model-output";

const NOW = new Date("2026-10-15T15:00:00.000Z");
const MODEL = "claude-opus-5-5";
const SCHEMA_REFUSAL = "output_config.format.schema: For 'array' type, property 'maxItems' is not supported";

afterEach(() => vi.restoreAllMocks());

async function freeAccount(t = makeTestDeps({ now: NOW })) {
  const workspaceId = uuid();
  const userId = `user-${uuid()}`;
  t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "a@x.com", emailVerified: true, role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
  const opened = await executeCommand(t.deps, { actor: { kind: "system", job: "free" }, workspaceId }, { type: "open_free_account", payload: { userId } });
  if (!opened.ok) throw new Error(opened.error.code);
  return { t, scope: { workspaceId, accountId: opened.value.accountId! } };
}

const request = (extra: Partial<ModelCallRequest> = {}): ModelCallRequest => {
  const base: ModelCallRequest = { model: MODEL, messages: [{ role: "user", content: "descreva a marca SEGREDO-DO-PROMPT" }], maxTokens: 500, ...extra };
  return { ...base, inputTokenBound: modelInputTokenBound(base)! };
};

const bodyOf = (type: string, message: string) => ({ type: "error", error: { type, message }, request_id: "req_body" });
const anthropicError = (status: number, message = SCHEMA_REFUSAL, type = "invalid_request_error") =>
  Anthropic.APIError.generate(status, bodyOf(type, message), `${status} ${JSON.stringify(bodyOf(type, message))}`, new Headers({ "request-id": "req_011Cfc9G7WWwEUwQG75Munpv" }));
const openaiError = (status: number | undefined, body: Record<string, unknown> | undefined, message = `${status}`) => OpenAI.APIError.generate(status, body, message, new Headers());

type Setup = { free?: boolean; client?: () => EquipeModelClient; ledger?: MemoryLedgerStore; req?: ModelCallRequest; account?: Awaited<ReturnType<typeof freeAccount>> };
async function callWith(chat: EquipeModelClient["chat"], options: Setup = {}) {
  const a = options.account ?? await freeAccount();
  const ledger = options.ledger ?? new MemoryLedgerStore();
  const client = createBudgetedModelClient({ scope: a.scope, repos: a.t.deps.uow.repos, ledger, client: options.client ?? (() => ({ chat })),
    free: options.free ?? true, model: MODEL, role: "strategist", taskKind: "handoff_vision", now: () => NOW });
  const error = await client.chat(options.req ?? request()).then(() => null, (e) => e as unknown);
  const events = await a.t.deps.uow.repos.events.list(a.scope, { eventType: MODEL_CALL_REJECTED_EVENT });
  return { a, ledger, error, events, total: () => ledger.lifetimeTotalCostUsdCents(a.scope.workspaceId, a.scope.accountId) };
}

describe("a refusal that PROVES nothing ran gives the whole reservation back", () => {
  it.each([401, 403, 404, 413])("HTTP %i from Anthropic: settled at zero at once, the error still reaches the caller, nothing counts against the cap", async (status) => {
    const failure = anthropicError(status, "refused", "authentication_error");
    const { ledger, error, total } = await callWith(async () => { throw failure; });
    expect(error).toBe(failure);
    expect(ledger.entries).toHaveLength(1);
    const [entry] = ledger.entries;
    // The maximum WAS reserved before the call (admission is unchanged); it is only given back.
    expect(entry!.reservedCostUsdCents).toBeGreaterThan(0);
    expect(entry).toMatchObject({ costUsdCents: 0, inputTokens: 0, outputTokens: 0, settledAt: NOW });
    expect(await total()).toBe(0);
  });

  it.each([401, 403, 404, 413])("HTTP %i from an OpenAI-shaped provider (Meta) gives it back too: refused before any generation", async (status) => {
    const { ledger, total } = await callWith(async () => { throw openaiError(status, { error: { message: "refused", type: "invalid_request_error" } }); });
    expect(ledger.entries[0]).toMatchObject({ costUsdCents: 0, settledAt: NOW });
    expect(await total()).toBe(0);
  });

  it("a proxy's 403 with an HTML body is still a refusal before any generation", async () => {
    const { ledger, total } = await callWith(async () => { throw openaiError(403, undefined, "<html><body>Forbidden</body></html>"); });
    expect(ledger.entries[0]).toMatchObject({ costUsdCents: 0, settledAt: NOW });
    expect(await total()).toBe(0);
  });

  it.each([
    SCHEMA_REFUSAL,
    "messages.0.content.1.image.source.url: Unable to download the file. Please verify the URL and try again.",
    "max_tokens: 99999999 > 64000, which is the maximum allowed number of output tokens for claude-opus-5-5",
    "tools.0.input_schema: JSON schema is invalid",
  ])("Anthropic 400 invalid_request_error that opens with the path of a request parameter is the API validating the REQUEST: %s", async (message) => {
    const { ledger, total, events } = await callWith(async () => { throw anthropicError(400, message); });
    expect(ledger.entries[0]).toMatchObject({ costUsdCents: 0, settledAt: NOW });
    expect(await total()).toBe(0);
    expect(events).toHaveLength(1);
  });

  it("a request that never left this process (a missing key, a refused schema) gives it back too", async () => {
    const { ledger, total, events } = await callWith(async () => { throw new ModelRequestNotSentError("anthropic_api_key_missing"); });
    expect(ledger.entries[0]).toMatchObject({ costUsdCents: 0, settledAt: NOW });
    expect(await total()).toBe(0);
    expect(events[0]!.payload).toMatchObject({ kind: "not_sent", message: "anthropic_api_key_missing" });
  });

  it("a client that cannot even be chosen (an aborted reading) sent nothing: given back, with no model call and no event", async () => {
    const chat = vi.fn();
    const abort = new DOMException("The operation was aborted.", "AbortError");
    const { ledger, error, total, events } = await callWith(chat, { client: () => { throw abort; } });
    expect(error).toBe(abort);
    expect(chat).not.toHaveBeenCalled();
    expect(ledger.entries[0]).toMatchObject({ costUsdCents: 0, settledAt: NOW });
    expect(await total()).toBe(0);
    // An abort before the send is not a provider refusal: no event, no log line.
    expect(events).toHaveLength(0);
  });
});

describe("a doubt is never refunded", () => {
  const doubts: Array<[string, () => unknown]> = [
    ...[402, 408, 409, 429, 499, 500, 502, 503, 529].map((status): [string, () => unknown] => [`Anthropic HTTP ${status}`, () => anthropicError(status, "try later", "overloaded_error")]),
    ["a dropped connection", () => new Anthropic.APIConnectionError({ message: "socket hang up" })],
    ["a transport timeout", () => new Anthropic.APIConnectionTimeoutError()],
    ["an abort while the request was in flight", () => new Anthropic.APIUserAbortError()],
    ["an error with no status (an SSE error mid-stream)", () => Anthropic.APIError.generate(undefined, bodyOf("overloaded_error", "Overloaded"), "Overloaded", new Headers())],
    ["a plain error", () => new Error("provider_down")],
    ["a plain error carrying status 400", () => Object.assign(new Error("bad request"), { status: 400 })],
    ["a look-alike object", () => ({ name: "BadRequestError", status: 400, message: "x" })],
    ["a DOMException abort", () => new DOMException("aborted", "AbortError")],
    ["a non-error throw", () => "boom"],
    // The three the independent review found given back by mistake: a 4xx the provider raises AFTER the model generated.
    ["Anthropic 400 'Output blocked by content filtering policy' (the filter acts on the OUTPUT)", () => anthropicError(400, "Output blocked by content filtering policy")],
    ["OpenAI-shaped 400 json_validate_failed (structured output checked after generation)", () => openaiError(400, { error: { message: "Failed to generate JSON. Please adjust your prompt.", type: "invalid_request_error", code: "json_validate_failed", failed_generation: "{\"summary\":" } })],
    ["OpenAI-shaped 422 (the answer did not match the schema)", () => openaiError(422, { error: { message: "The model output did not match the response schema", type: "unprocessable_entity" } })],
    // And the neighbours of the allow-list: a 400 without a request parameter path is not proof either.
    ["Anthropic 400 'prompt is too long'", () => anthropicError(400, "prompt is too long: 250000 tokens > 200000 maximum")],
    ["Anthropic 400 'credit balance is too low'", () => anthropicError(400, "Your credit balance is too low to access the Anthropic API.")],
    ["Anthropic 422", () => anthropicError(422, "Output did not validate", "invalid_request_error")],
    ["a request-path message under a type that is not invalid_request_error", () => anthropicError(400, SCHEMA_REFUSAL, "api_error")],
    ["OpenAI-shaped 400 invalid_request_error whose message opens like Anthropic's (the allow-list is Anthropic's alone)", () => openaiError(400, { error: { message: "output_config.format.schema: not supported", type: "invalid_request_error" } })],
    ["OpenAI-shaped 400 invalid_request_error that carries a param (a Meta/OpenAI 400 is unmeasured)", () => openaiError(400, { error: { message: "Invalid schema", type: "invalid_request_error", param: "response_format" } })],
  ];
  it.each(doubts)("%s keeps the reservation at its maximum, unsettled", async (_name, make) => {
    const failure = make();
    const { ledger, error, total } = await callWith(async () => { throw failure; });
    expect(error).toBe(failure);
    const [entry] = ledger.entries;
    expect(entry!.settledAt).toBeUndefined();
    expect(entry!.costUsdCents).toBe(entry!.reservedCostUsdCents);
    expect(await total()).toBe(entry!.reservedCostUsdCents);
  });

  it("thirty refusals of the content filter in a row never touch the cap (before: every one was given back)", async () => {
    const a = await freeAccount();
    const ledger = new MemoryLedgerStore();
    const client = createBudgetedModelClient({ scope: a.scope, repos: a.t.deps.uow.repos, ledger, client: () => ({ chat: async () => { throw anthropicError(400, "Output blocked by content filtering policy"); } }),
      free: true, model: MODEL, role: "strategist", taskKind: "strategist_turn", now: () => NOW });
    let refused = 0;
    for (let attempt = 0; attempt < 30; attempt++) await client.chat(request()).catch((e) => { if (e instanceof Error && e.message === "budget_exceeded") refused++; });
    // Every one that reached the provider kept its maximum, so the strict cap closed the door: the total never passes US$ 1.
    expect(await ledger.lifetimeTotalCostUsdCents(a.scope.workspaceId, a.scope.accountId)).toBeLessThanOrEqual(100);
    expect(ledger.entries.every((entry) => entry.costUsdCents === entry.reservedCostUsdCents && !entry.settledAt)).toBe(true);
    expect(refused).toBeGreaterThan(0);
  });

  it("a refusal whose give-back cannot be written keeps the maximum, and the caller still gets the provider's error", async () => {
    const ledger = new MemoryLedgerStore();
    vi.spyOn(ledger, "settle").mockRejectedValue(new Error("db down"));
    const failure = anthropicError(400);
    const { error, total } = await callWith(async () => { throw failure; }, { ledger });
    expect(error).toBe(failure);
    expect(ledger.entries[0]!.settledAt).toBeUndefined();
    expect(await total()).toBe(ledger.entries[0]!.reservedCostUsdCents);
  });

  it("a give-back that cannot even be counted keeps the maximum", async () => {
    const ledger = new MemoryLedgerStore();
    vi.spyOn(ledger, "countGivenBackReservations").mockRejectedValue(new Error("db down"));
    const { total } = await callWith(async () => { throw anthropicError(400); }, { ledger });
    expect(await total()).toBe(ledger.entries[0]!.reservedCostUsdCents);
  });
});

describe("an account is given back at most MAX_GIVE_BACKS_PER_ACCOUNT reservations, ever", () => {
  it("the first five refusals are given back; from the sixth on the maximum stays, and the event says why", async () => {
    expect(MAX_GIVE_BACKS_PER_ACCOUNT).toBe(5);
    const account = await freeAccount();
    const ledger = new MemoryLedgerStore();
    const results = [];
    for (let attempt = 1; attempt <= 8; attempt++) results.push(await callWith(async () => { throw anthropicError(400); }, { ledger, account }));
    const rows = ledger.entries;
    expect(rows.map((row) => row.costUsdCents === 0)).toEqual([true, true, true, true, true, false, false, false]);
    expect(rows.slice(5).every((row) => !row.settledAt && row.costUsdCents === row.reservedCostUsdCents)).toBe(true);
    const events = await account.t.deps.uow.repos.events.list(account.scope, { eventType: MODEL_CALL_REJECTED_EVENT });
    expect(events.map((event) => (event.payload as { reason: string }).reason)).toEqual([...Array(5).fill("schema_unsupported"), ...Array(3).fill("give_back_limit")]);
    expect(await results[7]!.total()).toBe(rows.slice(5).reduce((sum, row) => sum + row.reservedCostUsdCents!, 0));
  });

  it("counts per account: another account still gets its give-backs, and a success never counts", async () => {
    const ledger = new MemoryLedgerStore();
    const first = await freeAccount();
    for (let attempt = 0; attempt < 5; attempt++) await callWith(async () => { throw anthropicError(400); }, { ledger, account: first });
    const second = await callWith(async () => { throw anthropicError(400); }, { ledger });
    expect(second.ledger.entries.at(-1)).toMatchObject({ costUsdCents: 0, settledAt: NOW });
    // A call that ran and settled at its real cost never counts as a give-back.
    const ok = await freeAccount();
    const done = createBudgetedModelClient({ scope: ok.scope, repos: ok.t.deps.uow.repos, ledger, client: () => ({ chat: async () => ({ content: "ok", toolCalls: [], stopReason: "stop", usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 } }) }),
      free: true, model: MODEL, role: "strategist", taskKind: "strategist_turn", now: () => NOW });
    await done.chat(request());
    expect(await ledger.countGivenBackReservations(ok.scope.workspaceId, ok.scope.accountId)).toBe(0);
  });

  it("the not-sent give-backs count too, and a client that cannot be chosen records the event only when the limit stops it", async () => {
    const account = await freeAccount();
    const ledger = new MemoryLedgerStore();
    const abort = new DOMException("The operation was aborted.", "AbortError");
    for (let attempt = 0; attempt < 6; attempt++) await callWith(vi.fn(), { ledger, account, client: () => { throw abort; } });
    expect(ledger.entries.map((row) => row.costUsdCents === 0)).toEqual([true, true, true, true, true, false]);
    const events = await account.t.deps.uow.repos.events.list(account.scope, { eventType: MODEL_CALL_REJECTED_EVENT });
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ kind: "not_sent", reason: "give_back_limit" });
  });
});

describe("the orphan reconciler", () => {
  it("leaves a given-back reservation at zero, and still closes a doubtful one at its maximum", async () => {
    const ledger = new MemoryLedgerStore();
    const refused = await callWith(async () => { throw anthropicError(400); }, { ledger });
    const doubtful = await callWith(async () => { throw anthropicError(400, "Output blocked by content filtering policy"); }, { ledger });
    const later = new Date(NOW.getTime() + 16 * 60_000);
    await ledger.settleExpiredReservations(later);
    const [first, second] = ledger.entries;
    expect(first).toMatchObject({ costUsdCents: 0, settledAt: NOW });
    expect(second).toMatchObject({ costUsdCents: second!.reservedCostUsdCents, settledAt: later });
    // Each call above is its own account: only the doubtful one still carries a cost.
    expect(await refused.total()).toBe(0);
    expect(await doubtful.total()).toBe(second!.reservedCostUsdCents);
  });
});

describe("the cause is kept, structured, and never the provider's words", () => {
  const output = defineModelOutput("rejection_probe", z.object({ a: z.string() }));

  it("writes an account event and a log line with the status, the type, the request id, the parameter path, the reason and the call", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const { events } = await callWith(async () => { throw anthropicError(400); }, { req: request({ output }) });
    expect(events).toHaveLength(1);
    const payload = events[0]!.payload as Record<string, unknown>;
    expect(payload).toEqual({
      role: "strategist", model: MODEL, taskKind: "handoff_vision", kind: "provider_rejected", status: 400, errorType: "invalid_request_error",
      requestId: "req_011Cfc9G7WWwEUwQG75Munpv", param: "output_config.format.schema", reason: "schema_unsupported", schema: "rejection_probe",
    });
    expect(events[0]).toMatchObject({ eventType: MODEL_CALL_REJECTED_EVENT, actorType: "system" });
    expect(warn).toHaveBeenCalledWith("[equipe-model-call] request refused before it ran", payload);
  });

  it.each([
    ["an API key fragment", "Incorrect API key provided: sk-ant-api03-AbCd****************************wXyZ. You can find your API key at https://console.example.com/keys."],
    ["the prompt, echoed", "messages.0.content.0.text: invalid value 'descreva a marca SEGREDO-DO-PROMPT' near token 12"],
    ["a signed URL without a scheme", "Could not fetch image at s3.amazonaws.com/bucket/workspaces/123/secret-key.jpg?X-Amz-Signature=abc123&X-Amz-Credential=key"],
  ])("never stores what the provider echoed: %s", async (_name, echoed) => {
    const { events } = await callWith(async () => { throw anthropicError(401, echoed, "authentication_error"); });
    const payload = events[0]!.payload as Record<string, unknown>;
    expect(JSON.stringify(payload)).not.toMatch(/sk-ant|SEGREDO|X-Amz|Credential|amazonaws|console\.example|descreva/);
    // No free-text field at all for a provider's error: the structured ones say what happened.
    expect(payload).not.toHaveProperty("message");
    expect(payload).toMatchObject({ kind: "provider_rejected", status: 401, errorType: "authentication_error", reason: "auth" });
  });

  it("keeps a parameter path, never its value", async () => {
    const { events } = await callWith(async () => { throw anthropicError(400, "messages.0.content.0.text: invalid value 'SEGREDO-DO-PROMPT' near token 12"); });
    expect(events[0]!.payload).toMatchObject({ param: "messages.0.content.0.text", reason: "request_invalid" });
    expect(JSON.stringify(events[0]!.payload)).not.toContain("SEGREDO");
  });

  it("keeps what an OpenAI-shaped provider says in its structured fields (code, param), not its message or the failed generation", async () => {
    const failure = openaiError(404, { error: { message: "The model `muse-x` does not exist", type: "invalid_request_error", code: "model_not_found", param: "model", failed_generation: "{\"summary\":" } });
    const { events } = await callWith(async () => { throw failure; });
    expect(events[0]!.payload).toMatchObject({ kind: "provider_rejected", status: 404, errorType: "invalid_request_error", code: "model_not_found", param: "model", reason: "not_found" });
    expect(JSON.stringify(events[0]!.payload)).not.toMatch(/muse-x|summary|failed_generation/);
  });

  it("drops an identifier that does not look like one, and a request id that does not either", () => {
    const failure = openaiError(404, { error: { type: "weird type with spaces and 'quotes'", code: "x".repeat(200), param: "model; drop table" } });
    const parsed = classifyModelFailure(failure);
    expect(parsed).toEqual({ kind: "provider_rejected", status: 404, reason: "not_found" });
  });

  it("says a doubt in the same fixed words: a content filter, a billing refusal, a too-long prompt", () => {
    expect(classifyModelFailure(anthropicError(400, "Output blocked by content filtering policy"))).toMatchObject({ kind: "other", reason: "content_blocked" });
    expect(classifyModelFailure(anthropicError(400, "Your credit balance is too low to access the Anthropic API."))).toMatchObject({ kind: "other", reason: "billing" });
    expect(classifyModelFailure(anthropicError(400, "prompt is too long: 250000 tokens > 200000 maximum"))).toMatchObject({ kind: "other", reason: "input_too_long" });
    expect(classifyModelFailure(openaiError(400, { error: { code: "json_validate_failed", type: "invalid_request_error" } }))).toMatchObject({ kind: "other", reason: "output_invalid", code: "json_validate_failed" });
    expect(classifyModelFailure(anthropicError(429, "slow down", "rate_limit_error"))).toMatchObject({ kind: "other", reason: "rate_limited" });
    expect(classifyModelFailure(anthropicError(529, "busy", "overloaded_error"))).toMatchObject({ kind: "other", reason: "provider_error" });
  });

  it("a paid account's refusal is recorded too (no reservation to give back)", async () => {
    const { events, ledger, error } = await callWith(async () => { throw anthropicError(400); }, { free: false });
    expect(error).toBeTruthy();
    expect(ledger.entries).toHaveLength(0);
    expect(events).toHaveLength(1);
  });

  it("an event that cannot be written never hides the provider's error, and the reservation is already back", async () => {
    const a = await freeAccount();
    vi.spyOn(a.t.deps.uow.repos.events, "create").mockRejectedValue(new Error("events down"));
    const ledger = new MemoryLedgerStore();
    const failure = anthropicError(400);
    const client = createBudgetedModelClient({ scope: a.scope, repos: a.t.deps.uow.repos, ledger, client: () => ({ chat: async () => { throw failure; } }),
      free: true, model: MODEL, role: "strategist", taskKind: "handoff_vision", now: () => NOW });
    await expect(client.chat(request())).rejects.toBe(failure);
    expect(ledger.entries[0]).toMatchObject({ costUsdCents: 0, settledAt: NOW });
  });
});

describe("classifyModelFailure", () => {
  it("separates a proof, a request that never left, and a doubt", () => {
    expect(classifyModelFailure(anthropicError(400))).toMatchObject({ kind: "provider_rejected", status: 400, type: "invalid_request_error", requestId: "req_011Cfc9G7WWwEUwQG75Munpv", param: "output_config.format.schema" });
    expect(classifyModelFailure(new ModelRequestNotSentError("x"))).toEqual({ kind: "not_sent", message: "x" });
    expect(classifyModelFailure(anthropicError(529, "busy", "overloaded_error")).kind).toBe("other");
    expect(classifyModelFailure(new Error("socket hang up")).kind).toBe("other");
    expect(modelCallNeverRan(anthropicError(404, "model: claude-x", "not_found_error"))).toBe(true);
    expect(modelCallNeverRan(anthropicError(429, "slow", "rate_limit_error"))).toBe(false);
    expect(modelCallNeverRan(openaiError(400, { error: { type: "invalid_request_error" } }))).toBe(false);
    expect(modelCallNeverRan(undefined)).toBe(false);
  });

  it("recognizes every Messages API request parameter as the start of a request-validation message, and nothing else", () => {
    for (const param of ["model", "messages.12.content.3.text", "system", "max_tokens", "output_config.format.schema", "tools.0.input_schema", "tool_choice", "thinking.budget_tokens", "metadata.user_id"]) {
      expect(classifyModelFailure(anthropicError(400, `${param}: is invalid`)).kind, param).toBe("provider_rejected");
    }
    for (const text of ["Output blocked by content filtering policy", "output_config is bad", "outputs: nope", "messages missing: x", "something.else: invalid", "Error in messages.0: x"]) {
      expect(classifyModelFailure(anthropicError(400, text)).kind, text).toBe("other");
    }
  });

  it("our own error codes stay readable in a log, and any other message is reduced to the error's name", () => {
    expect(classifyModelFailure(new Error("budget_exceeded"))).toEqual({ kind: "other", message: "Error: budget_exceeded" });
    expect(classifyModelFailure(new Error("free_call_unbounded"))).toEqual({ kind: "other", message: "Error: free_call_unbounded" });
    expect(classifyModelFailure(new Error("sk-ant-api03-AbCd1234"))).toEqual({ kind: "other", message: "Error" });
    expect(classifyModelFailure(new Error("Could not fetch https://x.example/a?sig=1"))).toEqual({ kind: "other", message: "Error" });
    expect(classifyModelFailure("boom")).toEqual({ kind: "other", message: "unknown" });
  });
});
