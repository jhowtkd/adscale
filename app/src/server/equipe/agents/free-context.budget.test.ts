// The size of the free account's request (ticket 15, item 1b): the real pilot account made the second call of a turn weigh
// 65 009 bytes / 31 289 tokens (the whole handoff row came back as a tool result), reserve 39 cents, and the US$ 1 cap shut
// the conversation after a few answers. Now the model gets a few KB of context in ONE call.

import { describe, expect, it, vi } from "vitest";
vi.mock("@/server/validation/env", () => ({
  env: { EQUIPE_IG_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") },
}));
import { makeTestDeps, openTestAccount } from "../module/testing/deps";
import { freeStrategistMaxTokens } from "./free-budget";
import { MemoryLedgerStore, maximumCallCostUsdCents } from "./ledger";
import { BUDGET_EXCEEDED_ERROR, createEquipeAgents } from "./runner";
import { runStrategistTurn } from "./strategist";
import type { EquipeModelClient, ModelCallRequest } from "./model-client";
import { FakeModelClient, type FakeModelResponse } from "./testing";
import { RAW, pilotAccount } from "./testing-pilot";

const MODEL = "claude-opus-5-5";
const closing = (resposta = "Sua marca vende café especial."): FakeModelResponse => ({
  content: "Texto ao lado.",
  toolCalls: [{ id: "c1", name: "sugerir_proximos_passos", argumentsJson: JSON.stringify({ resposta, itens: ["Me explica a oportunidade 1", "Quero ver os canais"] }) }],
  usage: { inputTokens: 9000, outputTokens: 400 },
});
/** The loop keeps appending to the messages array it sent: the request is copied at the moment of the call. */
class Recorder extends FakeModelClient implements EquipeModelClient {
  readonly sent: ModelCallRequest[] = [];
  override chat(request: ModelCallRequest) { this.sent.push(JSON.parse(JSON.stringify(request)) as ModelCallRequest); return super.chat(request); }
}
const history = Array.from({ length: 10 }, (_, i) => ({
  role: i % 2 === 0 ? "user" as const : "assistant" as const,
  content: i % 2 === 0 ? `Pergunta ${i} sobre a marca, com um pouco de texto para pesar o histórico.` : `Resposta ${i} do Estrategista com algumas frases sobre o que foi lido no site e no Instagram.`,
}));

describe("the free account's strategist request", () => {
  it("is ONE request of at most 12 000 bytes, bound 16 000 tokens and a reserve of at most 13 cents, even with a huge handoff row", async () => {
    const f = await pilotAccount();
    const [row] = await f.t.deps.uow.repos.handoffs.list(f.scope);
    expect(JSON.stringify(row!.captured).length).toBeGreaterThan(60_000);
    const client = new Recorder([closing()]);
    const result = await runStrategistTurn({ client, ctx: f.ctx, message: "Como está minha marca?", history, maxTokens: freeStrategistMaxTokens() });
    expect(client.sent).toHaveLength(1);
    expect(result).toMatchObject({ text: "Sua marca vende café especial.", iterations: 1 });
    const request = client.sent[0]!;
    const bytes = Buffer.byteLength(JSON.stringify({ messages: request.messages, tools: request.tools }));
    expect(bytes).toBeLessThanOrEqual(12_000);
    expect(request.inputTokenBound).toBeLessThanOrEqual(16_000);
    expect(maximumCallCostUsdCents(MODEL, request.inputTokenBound!, freeStrategistMaxTokens())).toBeLessThanOrEqual(13);
  });

  it("carries none of the raw handoff content: no site text, image URL, Instagram caption or id", async () => {
    const f = await pilotAccount();
    const client = new Recorder([closing()]);
    await runStrategistTurn({ client, ctx: f.ctx, message: "Como está minha marca?", history });
    const wire = JSON.stringify(client.sent[0]);
    for (const raw of [RAW.site, RAW.imageUrl, RAW.caption, RAW.siteImage, "cdn.example", f.readingId, f.handoffId]) expect(wire).not.toContain(raw);
    expect(wire).toContain("Café Aurora");
  });

  it("has exactly the two closing tools, with `resposta` and `itens` required", async () => {
    const f = await pilotAccount();
    const client = new Recorder([closing()]);
    await runStrategistTurn({ client, ctx: f.ctx, message: "Oi" });
    const tools = client.sent[0]!.tools!;
    expect(tools.map(tool => tool.name)).toEqual(["sugerir_proximos_passos", "oferecer_plano"]);
    const suggest = tools[0]!.parameters as { required: string[]; properties: Record<string, { type: string }> };
    expect(suggest.required).toEqual(["resposta", "itens"]);
    expect(suggest.properties.resposta!.type).toBe("string");
    expect(tools[1]!.parameters).toMatchObject({ properties: {}, additionalProperties: false });
  });

  it("puts the context right after the system prompt as a user message with its own cache breakpoint", async () => {
    const f = await pilotAccount();
    const client = new Recorder([closing()]);
    await runStrategistTurn({ client, ctx: f.ctx, message: "Oi", history });
    const [system, context, firstHistory] = client.sent[0]!.messages;
    expect(system!.role).toBe("system");
    expect(context).toMatchObject({ role: "user", content: [{ type: "text", cacheBreakpoint: true, text: expect.stringContaining('Brand: "Café Aurora"') }] });
    expect((context!.content as unknown[])).toHaveLength(1);
    expect(firstHistory).toMatchObject({ role: "user", content: history[0]!.content });
  });

  it("keeps the cache prefix byte for byte between two turns, whatever the history and the question", async () => {
    const f = await pilotAccount();
    const client = new Recorder([closing(), closing("Outra resposta.")]);
    await runStrategistTurn({ client, ctx: f.ctx, message: "Primeira pergunta", history: history.slice(0, 4) });
    // The window of 20 messages slid: the history now starts elsewhere, the context in front of it did not move.
    await runStrategistTurn({ client, ctx: f.ctx, message: "Segunda pergunta bem diferente", history: [...history, ...history, ...history].slice(-20) });
    const [a, b] = client.sent;
    expect(JSON.stringify(b!.messages[1])).toBe(JSON.stringify(a!.messages[1]));
    expect(JSON.stringify(b!.messages[0])).toBe(JSON.stringify(a!.messages[0]));
    expect(JSON.stringify(b!.tools)).toBe(JSON.stringify(a!.tools));
    expect(JSON.stringify(b!.messages)).not.toBe(JSON.stringify(a!.messages));
  });

  it("the paid account gets no account context and keeps every tool", async () => {
    const t = makeTestDeps();
    const a = await openTestAccount(t);
    const client = new Recorder([closing()]);
    await runStrategistTurn({ client, ctx: { deps: t.deps, workspaceId: a.workspaceId, accountId: a.accountId }, message: "Oi" });
    const request = client.sent[0]!;
    expect(request.messages.map(message => message.role)).toEqual(["system", "user"]);
    expect(JSON.stringify(request.messages)).not.toContain("Account context");
    expect(request.tools!.map(tool => tool.name)).toContain("get_account_state");
  });
});

describe("the free credit with the context in place", () => {
  const strategist = (f: { workspaceId: string; accountId: string }) =>
    ({ kind: "strategist_turn" as const, workspaceId: f.workspaceId, accountId: f.accountId, input: { message: "Me explica a oportunidade 1", history } });
  const spent = (ledger: MemoryLedgerStore, f: { workspaceId: string; accountId: string }, costUsdCents: number) =>
    ledger.record({ workspaceId: f.workspaceId, accountId: f.accountId, role: "research", model: "m", promptVersion: "v", taskKind: "research", inputTokens: 0, outputTokens: 0, costUsdCents });

  it("an account that already spent 75 cents (the pilot's) is still answered, in one call", async () => {
    const f = await pilotAccount();
    const ledger = new MemoryLedgerStore();
    await spent(ledger, f, 75);
    const client = new Recorder([closing()]);
    const agents = createEquipeAgents({ moduleDeps: f.t.deps, client, ledger });
    const result = await agents.runTask(strategist(f));
    expect(result).toMatchObject({ ok: true, output: { text: "Sua marca vende café especial.", iterations: 1 } });
    expect(client.sent).toHaveLength(1);
    expect(await ledger.lifetimeTotalCostUsdCents(f.workspaceId, f.accountId)).toBeLessThanOrEqual(100);
  });

  it("at 95 cents the next call still would not fit, and the turn is refused before any model call", async () => {
    const f = await pilotAccount();
    const ledger = new MemoryLedgerStore();
    await spent(ledger, f, 95);
    const client = new Recorder([closing()]);
    expect(await createEquipeAgents({ moduleDeps: f.t.deps, client, ledger }).runTask(strategist(f))).toEqual({ ok: false, error: BUDGET_EXCEEDED_ERROR });
    expect(client.sent).toHaveLength(0);
  });
});
