// A free call the provider refused before it ran gives its reservation back (ticket 13, D-2).
//
// In the real test of 01/10 every vision call was answered HTTP 400 by Anthropic, no model ran, and each attempt stayed on the account's
// US$ 1 cap at its maximum (12 or 17 cents): the orphan reconciler only closes such a row, at the maximum. The cap is strict, so a doubt
// is never refunded; but a refusal is proof, and only proof gives the reservation back, at once. These tests pin both sides of that line.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { createBudgetedModelClient, MODEL_CALL_REJECTED_EVENT } from "./budgeted-client";
import { modelInputTokenBound } from "./free-budget";
import { MemoryLedgerStore } from "./ledger";
import { ModelRequestNotSentError, type EquipeModelClient, type ModelCallRequest } from "./model-client";
import { classifyModelFailure, modelCallNeverRan } from "./model-failure";

const NOW = new Date("2026-10-15T15:00:00.000Z");
const MODEL = "claude-opus-5-5";

afterEach(() => vi.restoreAllMocks());

async function freeAccount() {
  const t = makeTestDeps({ now: NOW });
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
const anthropicError = (status: number, message = "output_config.format.schema: For 'array' type, property 'maxItems' is not supported", type = "invalid_request_error") =>
  Anthropic.APIError.generate(status, bodyOf(type, message), `${status} ${JSON.stringify(bodyOf(type, message))}`, new Headers({ "request-id": "req_011Cfc9G7WWwEUwQG75Munpv" }));

async function callWith(chat: EquipeModelClient["chat"], options: { free?: boolean; client?: () => EquipeModelClient; ledger?: MemoryLedgerStore; req?: ModelCallRequest } = {}) {
  const a = await freeAccount();
  const ledger = options.ledger ?? new MemoryLedgerStore();
  const client = createBudgetedModelClient({ scope: a.scope, repos: a.t.deps.uow.repos, ledger, client: options.client ?? (() => ({ chat })),
    free: options.free ?? true, model: MODEL, role: "strategist", taskKind: "handoff_vision", now: () => NOW });
  const error = await client.chat(options.req ?? request()).then(() => null, (e) => e as unknown);
  const events = await a.t.deps.uow.repos.events.list(a.scope, { eventType: MODEL_CALL_REJECTED_EVENT });
  return { a, ledger, error, events, total: () => ledger.lifetimeTotalCostUsdCents(a.scope.workspaceId, a.scope.accountId) };
}

describe("a refusal that proves nothing ran gives the whole reservation back", () => {
  it.each([400, 401, 403, 404, 413, 422])("provider HTTP %i: settled at zero at once, the error still reaches the caller, nothing counts against the cap", async (status) => {
    const failure = anthropicError(status);
    const { ledger, error, total } = await callWith(async () => { throw failure; });
    expect(error).toBe(failure);
    expect(ledger.entries).toHaveLength(1);
    const [entry] = ledger.entries;
    // The maximum WAS reserved before the call (admission is unchanged); it is only given back.
    expect(entry!.reservedCostUsdCents).toBeGreaterThan(0);
    expect(entry).toMatchObject({ costUsdCents: 0, inputTokens: 0, outputTokens: 0, settledAt: NOW });
    expect(await total()).toBe(0);
  });

  it("does the same for an OpenAI-shaped provider (Meta), by its SDK error", async () => {
    const { ledger, total } = await callWith(async () => { throw OpenAI.APIError.generate(400, { message: "bad request", type: "invalid_request_error" }, "400 bad request", new Headers()); });
    expect(ledger.entries[0]).toMatchObject({ costUsdCents: 0, settledAt: NOW });
    expect(await total()).toBe(0);
  });

  it("a request that never left this process (a missing key, a refused schema) gives it back too", async () => {
    const { ledger, total, events } = await callWith(async () => { throw new ModelRequestNotSentError("anthropic_api_key_missing"); });
    expect(ledger.entries[0]).toMatchObject({ costUsdCents: 0, settledAt: NOW });
    expect(await total()).toBe(0);
    expect(events[0]!.payload).toMatchObject({ kind: "not_sent", message: "anthropic_api_key_missing" });
  });

  it("a client that cannot even be chosen (an aborted reading) sent nothing: given back, with no model call", async () => {
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

  it("ten refused attempts in a row leave the cap untouched (before: each stayed at its maximum and ate it)", async () => {
    const a = await freeAccount();
    const ledger = new MemoryLedgerStore();
    const client = createBudgetedModelClient({ scope: a.scope, repos: a.t.deps.uow.repos, ledger, client: () => ({ chat: async () => { throw anthropicError(400); } }),
      free: true, model: MODEL, role: "strategist", taskKind: "handoff_vision", now: () => NOW });
    for (let attempt = 0; attempt < 10; attempt++) await expect(client.chat(request())).rejects.toBeTruthy();
    expect(ledger.entries).toHaveLength(10);
    expect(await ledger.lifetimeTotalCostUsdCents(a.scope.workspaceId, a.scope.accountId)).toBe(0);
  });
});

describe("a doubt is never refunded", () => {
  const failures: Array<[string, () => unknown]> = [
    ...[408, 409, 429, 500, 502, 503, 529].map((status): [string, () => unknown] => [`provider HTTP ${status}`, () => anthropicError(status, "try later", "overloaded_error")]),
    ["a dropped connection", () => new Anthropic.APIConnectionError({ message: "socket hang up" })],
    ["a transport timeout", () => new Anthropic.APIConnectionTimeoutError()],
    ["an abort while the request was in flight", () => new Anthropic.APIUserAbortError()],
    ["a plain error", () => new Error("provider_down")],
    ["a non-error throw", () => "boom"],
  ];
  it.each(failures)("%s keeps the reservation at its maximum, unsettled, and records no refusal", async (_name, make) => {
    const failure = make();
    const { ledger, error, total, events } = await callWith(async () => { throw failure; });
    expect(error).toBe(failure);
    const [entry] = ledger.entries;
    expect(entry!.settledAt).toBeUndefined();
    expect(entry!.costUsdCents).toBe(entry!.reservedCostUsdCents);
    expect(await total()).toBe(entry!.reservedCostUsdCents);
    expect(events).toHaveLength(0);
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
});

describe("the orphan reconciler", () => {
  it("leaves a given-back reservation at zero, and still closes a doubtful one at its maximum", async () => {
    const ledger = new MemoryLedgerStore();
    const refused = await callWith(async () => { throw anthropicError(400); }, { ledger });
    const doubtful = await callWith(async () => { throw anthropicError(503, "try later", "overloaded_error"); }, { ledger });
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

describe("the cause is kept, without content", () => {
  it("writes an account event and a log line with the status, the type, the request id and the call, never the prompt", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const { events } = await callWith(async () => { throw anthropicError(400); }, { req: request({ output: { name: "site_identity", schema: z.object({ a: z.string() }) } }) });
    expect(events).toHaveLength(1);
    const payload = events[0]!.payload as Record<string, unknown>;
    expect(payload).toEqual({
      role: "strategist", model: MODEL, taskKind: "handoff_vision", kind: "provider_rejected", status: 400, errorType: "invalid_request_error",
      requestId: "req_011Cfc9G7WWwEUwQG75Munpv", schema: "site_identity", message: "output_config.format.schema: For 'array' type, property 'maxItems' is not supported",
    });
    expect(events[0]).toMatchObject({ eventType: MODEL_CALL_REJECTED_EVENT, actorType: "system" });
    expect(JSON.stringify(payload)).not.toContain("SEGREDO-DO-PROMPT");
    expect(warn).toHaveBeenCalledWith("[equipe-model-call] request refused before it ran", payload);
  });

  it("never stores a link a provider echoed (a signed image URL), and caps the text at 300 characters", async () => {
    const echoed = `Could not fetch https://assets.example.com/a.jpg?X-Amz-Signature=abc123&X-Amz-Credential=key ${"x".repeat(500)}`;
    const { events } = await callWith(async () => { throw anthropicError(400, echoed); });
    const { message } = events[0]!.payload as { message: string };
    expect(message).toMatch(/^Could not fetch \[url\] x+$/);
    expect(message).not.toMatch(/Signature|Credential|assets\.example\.com/);
    expect(message.length).toBeLessThanOrEqual(300);
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
  it("separates a refusal, a request that never left, and a doubt", () => {
    expect(classifyModelFailure(anthropicError(400))).toMatchObject({ kind: "provider_rejected", status: 400, type: "invalid_request_error", requestId: "req_011Cfc9G7WWwEUwQG75Munpv" });
    expect(classifyModelFailure(new ModelRequestNotSentError("x"))).toEqual({ kind: "not_sent", message: "x" });
    expect(classifyModelFailure(anthropicError(529, "busy", "overloaded_error")).kind).toBe("other");
    expect(classifyModelFailure(new Error("socket hang up")).kind).toBe("other");
    expect(modelCallNeverRan(anthropicError(404, "model", "not_found_error"))).toBe(true);
    expect(modelCallNeverRan(anthropicError(429, "slow", "rate_limit_error"))).toBe(false);
    expect(modelCallNeverRan(undefined)).toBe(false);
  });

  it("takes the message from the provider's own body, not the SDK's wrapper that repeats the whole JSON", () => {
    expect(classifyModelFailure(anthropicError(400, "schema is bad")).message).toBe("schema is bad");
    // A shape it does not know falls back to the SDK message, still redacted.
    const odd = Anthropic.APIError.generate(400, "see https://x.example/y", undefined, new Headers());
    expect(classifyModelFailure(odd).message).toBe('400 "see [url]');
  });
});
