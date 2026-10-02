// The strategist's answer through the REAL Anthropic client over a fake SDK (ticket 15, item 1): Opus with thinking always on
// answers with a closing tool call and no text block, or spells the call out as text. Wire format, not the neutral one.

import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/server/validation/env", () => ({
  env: { EQUIPE_IG_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") },
}));
import { logger } from "@/lib/logger";
import { getGoalsView } from "../module/queries";
import { makeTestDeps, openTestAccount } from "../module/testing/deps";
import { runStrategistTurn } from "./strategist";
import { anthropicClient, redactedThinking, reply, textBlock, thinking, toolUse } from "./testing-anthropic";
import { pilotAccount } from "./testing-pilot";

const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
const info = vi.spyOn(logger, "info").mockImplementation(() => {});
afterEach(() => { warn.mockClear(); info.mockClear(); });

const SUGGEST = "sugerir_proximos_passos";
const ITEMS = ["Me explica a oportunidade 1", "Quero ver os canais", "O que falta ler?"];
const answer = (resposta: string, itens: unknown = ITEMS) => toolUse(SUGGEST, { resposta, itens });

async function freeCtx() { return (await pilotAccount()).ctx; }
async function paidCtx() {
  const t = makeTestDeps();
  const a = await openTestAccount(t);
  return { deps: t.deps, workspaceId: a.workspaceId, accountId: a.accountId };
}
const kinds = [["free", freeCtx], ["paid", paidCtx]] as const;
const run = (ctx: Awaited<ReturnType<typeof freeCtx>>, client: ReturnType<typeof anthropicClient>["client"], extra: { maxIterations?: number } = {}) =>
  runStrategistTurn({ client, ctx, message: "Como está minha marca?", ...extra });

describe.each(kinds)("the answer of a %s account", (_kind, makeCtx) => {
  it("tool only, as the production Opus does: [thinking, tool_use] — the answer is `resposta`, in one call", async () => {
    const { sdk, client } = anthropicClient([reply([thinking(), answer("Sua marca vende café especial.")])]);
    const result = await run(await makeCtx(), client);
    expect(result).toMatchObject({ text: "Sua marca vende café especial.", suggestions: ITEMS, toolCallsExecuted: 1, commandsApplied: 0, iterations: 1 });
    expect(sdk.params).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it("text only: [thinking, text] with end_turn is the answer, without suggestions", async () => {
    const { sdk, client } = anthropicClient([reply([thinking(), textBlock("Sua marca vende café.")], "end_turn")]);
    const result = await run(await makeCtx(), client);
    expect(result).toMatchObject({ text: "Sua marca vende café.", toolCallsExecuted: 0, iterations: 1 });
    expect(result.suggestions).toBeUndefined();
    expect(sdk.params).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("[equipe.strategist] suggestions_missing", { accountId: expect.any(String), iterations: 1 });
  });

  it("text next to a call that has `resposta`: the call wins and the text is not repeated", async () => {
    const { client } = anthropicClient([reply([thinking(), textBlock("Texto ao lado da chamada."), answer("Resposta da chamada.")])]);
    const result = await run(await makeCtx(), client);
    expect(result.text).toBe("Resposta da chamada.");
    expect(result.suggestions).toEqual(ITEMS);
  });

  it("text next to a call WITHOUT `resposta` (the old format): the text becomes the answer, in one call", async () => {
    const { sdk, client } = anthropicClient([reply([thinking(), textBlock("Texto da resposta."), toolUse(SUGGEST, { itens: ITEMS })])]);
    const result = await run(await makeCtx(), client);
    expect(result).toMatchObject({ text: "Texto da resposta.", suggestions: ITEMS, toolCallsExecuted: 1, iterations: 1 });
    expect(sdk.params).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ["around the tool call", () => [redactedThinking(), thinking(), answer("Resposta."), redactedThinking()]],
    ["around the text", () => [redactedThinking(), thinking("a"), textBlock("Resposta só em texto."), thinking("b"), redactedThinking()]],
  ])("thinking and redacted_thinking blocks %s never become the answer", async (_name, blocks) => {
    const { client } = anthropicClient([reply(blocks())]);
    const result = await run(await makeCtx(), client);
    expect(result.text).toBe(blocks().some(block => block.type === "text") ? "Resposta só em texto." : "Resposta.");
  });

  it("a call without `resposta` and without text is an error for the model: the turn does not end, and the next call closes it", async () => {
    const { sdk, client } = anthropicClient([
      reply([thinking(), toolUse(SUGGEST, { itens: ITEMS })]),
      reply([thinking(), answer("Agora sim, a resposta.")]),
    ]);
    const result = await run(await makeCtx(), client);
    expect(sdk.params).toHaveLength(2);
    expect(result).toMatchObject({ text: "Agora sim, a resposta.", suggestions: ITEMS, iterations: 2, toolCallsExecuted: 2 });
    const feedback = sdk.params[1]!.messages.at(-1)!;
    expect(feedback.role).toBe("user");
    const [toolResult] = feedback.content as Array<{ type: string; tool_use_id: string; content: string }>;
    expect(toolResult).toMatchObject({ type: "tool_result", tool_use_id: `toolu-${SUGGEST}` });
    expect(toolResult!.content).toContain("`resposta` is required");
    expect(toolResult!.content).toContain('"error"');
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([["missing", undefined], ["not an array", "Me explica"], ["an object", { a: 1 }], ["null", null]])("`itens` %s does not block the answer: it is delivered with no suggestions", async (_name, itens) => {
    const input = itens === undefined ? { resposta: "Resposta sem sugestões." } : { resposta: "Resposta sem sugestões.", itens };
    const { sdk, client } = anthropicClient([reply([thinking(), toolUse(SUGGEST, input)])]);
    const result = await run(await makeCtx(), client);
    expect(result).toMatchObject({ text: "Resposta sem sugestões.", suggestions: [], toolCallsExecuted: 1, iterations: 1 });
    expect(sdk.params).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([["empty", ""], ["blank", "  \n"], ["not a string", 42]])("a `resposta` that is %s is still an error for the model", async (_name, resposta) => {
    const { sdk, client } = anthropicClient([reply([thinking(), toolUse(SUGGEST, { resposta, itens: ITEMS })]), reply([thinking(), answer("Agora sim.")])]);
    const result = await run(await makeCtx(), client);
    expect(sdk.params).toHaveLength(2);
    expect(result.text).toBe("Agora sim.");
  });

  it("only thinking: no text, no call — `text: null`, and the log carries the turn's facts but no message content", async () => {
    const ctx = await makeCtx();
    const { client } = anthropicClient([reply([thinking("PENSAMENTO-SECRETO")], "end_turn")]);
    const result = await run(ctx, client);
    expect(result).toMatchObject({ text: null, toolCallsExecuted: 0, commandsApplied: 0, iterations: 1 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("[equipe.strategist] answer_missing", {
      accountId: ctx.accountId, iterations: 1, stopReason: "stop", toolsCalled: [], toolCallsExecuted: 0, commandsApplied: 0,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/PENSAMENTO-SECRETO|Como está minha marca/);
  });

  it.each([" \n", "   ", "\n\t "])("a blank text %j is no answer", async (blank) => {
    const { client } = anthropicClient([reply([thinking(), textBlock(blank)], "end_turn")]);
    const result = await run(await makeCtx(), client);
    expect(result.text).toBeNull();
    expect(warn).toHaveBeenCalledWith("[equipe.strategist] answer_missing", expect.objectContaining({ iterations: 1, stopReason: "stop" }));
  });
});

describe("a paid turn across iterations", () => {
  it("text in an earlier iteration is not the answer; the last `resposta` is, and providerContent is replayed byte for byte", async () => {
    const ctx = await paidCtx();
    const first = [thinking("plano de leitura"), textBlock("Vou olhar suas metas."), toolUse("get_goals", {}, "toolu-goals")];
    const { sdk, client } = anthropicClient([reply(first), reply([thinking(), answer("Suas metas estão vazias.")])]);
    const result = await run(ctx, client);
    expect(result).toMatchObject({ text: "Suas metas estão vazias.", suggestions: ITEMS, iterations: 2, toolCallsExecuted: 2, commandsApplied: 0 });
    expect(result.text).not.toContain("Vou olhar");
    expect(sdk.params).toHaveLength(2);
    const replayed = sdk.params[1]!.messages.find(message => message.role === "assistant")!;
    expect(JSON.stringify(replayed.content)).toBe(JSON.stringify(first));
  });

  it("commandsApplied counts only accepted module commands: not reads, not the closing tool", async () => {
    const ctx = await paidCtx();
    const plan = toolUse("propose_plan", { content: { goals: ["launch instagram"] } }, "toolu-plan");
    const { client } = anthropicClient([
      reply([thinking(), toolUse("get_goals", {}, "toolu-goals"), plan, answer("Plano proposto.")]),
    ]);
    const result = await run(ctx, client);
    expect(result).toMatchObject({ text: "Plano proposto.", toolCallsExecuted: 3, commandsApplied: 1 });
    expect(await getGoalsView(ctx.deps.uow.repos, ctx.workspaceId, ctx.accountId)).toMatchObject({ plan: { status: "proposed" } });
  });

  it("a command the module refuses does not count, and the refusal goes back to the model", async () => {
    const ctx = await paidCtx();
    await ctx.deps.uow.repos.accounts.update(ctx.workspaceId, ctx.accountId, { status: "active" });
    const { sdk, client } = anthropicClient([
      reply([thinking(), toolUse("propose_plan", { content: { goals: ["x"] } }, "toolu-plan"), answer("Plano proposto.")]),
      reply([thinking(), answer("Não consegui propor o plano.")]),
    ]);
    const result = await run(ctx, client);
    expect(result).toMatchObject({ text: "Não consegui propor o plano.", commandsApplied: 0, iterations: 2 });
    expect(sdk.params).toHaveLength(2);
  });

  it("the iteration limit stands, and the closing tool is still accepted on the last iteration", async () => {
    const ctx = await paidCtx();
    const { sdk, client } = anthropicClient([
      reply([thinking(), toolUse("get_goals", {}, "toolu-goals")]),
      reply([thinking(), toolUse("get_goals", {}, "toolu-goals-2"), answer("Fechei no limite.")]),
    ]);
    const result = await run(ctx, client, { maxIterations: 2 });
    expect(result).toMatchObject({ text: "Fechei no limite.", suggestions: ITEMS, iterations: 2 });
    expect(sdk.params).toHaveLength(2);
    // The read of the last iteration was not run: only the first get_goals and the closing call.
    expect(result.toolCallsExecuted).toBe(2);
  });

  it("at the limit with no closing call the turn ends with what the model wrote, and logs when it wrote nothing", async () => {
    const ctx = await paidCtx();
    const { sdk, client } = anthropicClient([reply([thinking(), toolUse("get_goals", {}, "toolu-goals")])]);
    const result = await run(ctx, client, { maxIterations: 1 });
    expect(sdk.params).toHaveLength(1);
    expect(result).toMatchObject({ text: null, iterations: 1, toolCallsExecuted: 0 });
    expect(warn).toHaveBeenCalledWith("[equipe.strategist] answer_missing", expect.objectContaining({ iterations: 1, toolsCalled: [] }));
  });
});

describe("what goes back to the model when the loop continues after a successful closing tool", () => {
  type ToolResult = { type: string; tool_use_id: string; content: string };
  const resultsOf = (params: { messages: Array<{ role: string; content: unknown }> }) =>
    (params.messages.at(-1)!.content as ToolResult[]).filter(block => block.type === "tool_result");
  const NOT_DELIVERED = "not delivered: another call of this response failed, so the turn goes on. Write the final answer in `resposta` and call this tool again";
  const refusedPlan = async () => {
    const ctx = await paidCtx();
    await ctx.deps.uow.repos.accounts.update(ctx.workspaceId, ctx.accountId, { status: "active" });
    return ctx;
  };
  const failedFirst = () => reply([thinking(), answer("RESPOSTA-QUE-NAO-VOLTA"), toolUse("propose_plan", { content: { goals: ["x"] } }, "toolu-plan")]);

  it("sugerir_proximos_passos comes back as an explicit error: not delivered, never the suggestions nor the answer", async () => {
    const { sdk, client } = anthropicClient([failedFirst(), reply([thinking(), answer("Não consegui propor o plano.")])]);
    const result = await run(await refusedPlan(), client);
    expect(sdk.params).toHaveLength(2);
    expect(result.text).toBe("Não consegui propor o plano.");
    const results = resultsOf(sdk.params[1]!);
    expect(results).toHaveLength(2);
    expect(results.find(block => block.tool_use_id === `toolu-${SUGGEST}`)!.content).toBe(JSON.stringify({ error: NOT_DELIVERED }));
    expect(results.find(block => block.tool_use_id === "toolu-plan")!.content).toContain('"ok":false');
    expect(JSON.stringify(results)).not.toMatch(/RESPOSTA-QUE-NAO-VOLTA|suggestions/);
  });

  it("an accepted oferecer_plano next to a call that does not exist ends the turn with the card, in the same call", async () => {
    const f = await pilotAccount();
    const { sdk, client } = anthropicClient([reply([thinking(), toolUse("oferecer_plano", {}), toolUse("ferramenta_inexistente", {}, "toolu-x")])]);
    const result = await run(f.ctx, client);
    expect(sdk.params).toHaveLength(1);
    expect(result).toMatchObject({ planOffered: true, iterations: 1, toolCallsExecuted: 2, text: null });
    expect(warn).not.toHaveBeenCalled();
  });

  it("after `not delivered` the model closes with a new `resposta`", async () => {
    const { sdk, client } = anthropicClient([failedFirst(), reply([thinking(), answer("Final.")])]);
    const result = await run(await refusedPlan(), client);
    expect(sdk.params).toHaveLength(2);
    expect(result).toMatchObject({ text: "Final.", suggestions: ITEMS, iterations: 2 });
  });

  it("after `not delivered` a model that only thinks leaves no answer: text null and the log lists the calls in order", async () => {
    const ctx = await refusedPlan();
    const { sdk, client } = anthropicClient([failedFirst(), reply([thinking("só pensei")], "end_turn")]);
    const result = await run(ctx, client);
    expect(sdk.params).toHaveLength(2);
    expect(result).toMatchObject({ text: null, toolCallsExecuted: 2, commandsApplied: 0, iterations: 2 });
    expect(warn).toHaveBeenCalledWith("[equipe.strategist] answer_missing", {
      accountId: ctx.accountId, iterations: 2, stopReason: "stop", toolsCalled: [SUGGEST, "propose_plan"], toolCallsExecuted: 2, commandsApplied: 0,
    });
  });
});

describe("a model that closes without `resposta` is asked once more, not six times", () => {
  const noAnswer = (n: number) => Array.from({ length: n }, () => reply([thinking(), toolUse(SUGGEST, { itens: ITEMS })]));
  const missing = (ctx: { accountId: string }) => ({
    accountId: ctx.accountId, iterations: 2, stopReason: "tool_calls", toolsCalled: [SUGGEST, SUGGEST], toolCallsExecuted: 2, commandsApplied: 0,
  });

  it.each([["free", freeCtx, undefined], ["free, maxIterations 5", freeCtx, 5], ["paid", paidCtx, undefined], ["paid, maxIterations 5", paidCtx, 5]] as const)(
    "%s: exactly 2 requests, no answer, answer_missing logged", async (_name, makeCtx, maxIterations) => {
      const ctx = await makeCtx();
      const { sdk, client } = anthropicClient(noAnswer(10));
      const result = await run(ctx, client, maxIterations ? { maxIterations } : {});
      expect(sdk.params).toHaveLength(2);
      expect(result).toMatchObject({ text: null, iterations: 2, toolCallsExecuted: 2 });
      expect(warn).toHaveBeenCalledWith("[equipe.strategist] answer_missing", missing(ctx));
    });

  it.each([["an empty `resposta`", { resposta: "", itens: ITEMS }], ["a numeric `resposta`", { resposta: 42, itens: ITEMS }]])("%s counts the same", async (_name, input) => {
    const { sdk, client } = anthropicClient(Array.from({ length: 5 }, () => reply([thinking(), toolUse(SUGGEST, input)])));
    const result = await run(await freeCtx(), client);
    expect(sdk.params).toHaveLength(2);
    expect(result.text).toBeNull();
  });

  it("a first call without `resposta` and a second with it: 2 requests and the answer", async () => {
    const { sdk, client } = anthropicClient([...noAnswer(1), reply([thinking(), answer("Agora sim.")])]);
    const result = await run(await freeCtx(), client);
    expect(sdk.params).toHaveLength(2);
    expect(result).toMatchObject({ text: "Agora sim.", suggestions: ITEMS });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("the iteration limit by account, with scripts that are not about a missing answer", () => {
  const refusedOffer = (n: number) => Array.from({ length: n }, () => reply([thinking(), toolUse("oferecer_plano", {})]));
  const reads = (n: number) => Array.from({ length: n }, (_, i) => reply([thinking(), toolUse("get_goals", {}, `toolu-goals-${i}`)]));

  it("the free account stops after 3 requests by default (offer refused every time: no diagnosis)", async () => {
    const f = await pilotAccount({ diagnosis: "none" });
    const { sdk, client } = anthropicClient(refusedOffer(10));
    const result = await run(f.ctx, client);
    expect(sdk.params).toHaveLength(3);
    expect(result).toMatchObject({ text: null, iterations: 3 });
    expect(warn).toHaveBeenCalledWith("[equipe.strategist] answer_missing", expect.objectContaining({ iterations: 3 }));
  });

  it("an explicit maxIterations always wins on the free account", async () => {
    const f = await pilotAccount({ diagnosis: "none" });
    const { sdk, client } = anthropicClient(refusedOffer(10));
    expect((await run(f.ctx, client, { maxIterations: 5 })).iterations).toBe(5);
    expect(sdk.params).toHaveLength(5);
  });

  it("the paid account keeps 6 by default, and an explicit 2 wins", async () => {
    const first = anthropicClient(reads(10));
    expect(await run(await paidCtx(), first.client)).toMatchObject({ text: null, iterations: 6 });
    expect(first.sdk.params).toHaveLength(6);
    const second = anthropicClient(reads(10));
    expect((await run(await paidCtx(), second.client, { maxIterations: 2 })).iterations).toBe(2);
    expect(second.sdk.params).toHaveLength(2);
  });
});

describe("what the log and the result say about the calls of a turn", () => {
  it("a read and then only thinking: answer_missing lists the read", async () => {
    const ctx = await paidCtx();
    const { client } = anthropicClient([reply([thinking(), toolUse("get_goals", {}, "toolu-goals")]), reply([thinking()], "end_turn")]);
    const result = await run(ctx, client);
    expect(result).toMatchObject({ text: null, toolCallsExecuted: 1, iterations: 2 });
    expect(warn).toHaveBeenCalledWith("[equipe.strategist] answer_missing", expect.objectContaining({ toolsCalled: ["get_goals"], toolCallsExecuted: 1, iterations: 2 }));
  });

  it("oferecer_plano alone on a free account with a diagnosis is the whole turn: plan offered, no text, no warning", async () => {
    const { client } = anthropicClient([reply([thinking(), toolUse("oferecer_plano", {})])]);
    const result = await run(await freeCtx(), client);
    expect(result).toMatchObject({ text: null, planOffered: true, toolCallsExecuted: 1, iterations: 1 });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("the Anthropic wire format of the free account's context", () => {
  const EPHEMERAL = { type: "ephemeral" };
  const history = (n: number) => Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? "user" as const : "assistant" as const, content: `mensagem ${n}-${i}` }));

  it("sends the context as the first block of the first user message with cache_control, and top-level cache_control on the request", async () => {
    const f = await pilotAccount();
    const { sdk, client } = anthropicClient([reply([thinking(), answer("Resposta.")])]);
    await runStrategistTurn({ client, ctx: f.ctx, message: "Oi", history: history(4) });
    const sent = sdk.params[0]!;
    expect(sent.system).toEqual(expect.stringContaining("Estrategista"));
    expect(sent.messages[0]).toMatchObject({ role: "user", content: [{ type: "text", text: expect.stringContaining('Brand: "Café Aurora"'), cache_control: EPHEMERAL }] });
    expect((sent.messages[0]!.content as unknown[])).toHaveLength(1);
    expect(sent.messages[1]).toMatchObject({ role: "user" });
    expect(JSON.stringify(sent.messages[1])).toContain("mensagem 4-0");
    expect(sent).toMatchObject({ cache_control: EPHEMERAL });
  });

  it("the paid account sends no context block", async () => {
    const { sdk, client } = anthropicClient([reply([thinking(), answer("Resposta.")])]);
    await runStrategistTurn({ client, ctx: await paidCtx(), message: "Oi" });
    const sent = sdk.params[0]!;
    expect(sent.messages).toEqual([{ role: "user", content: [{ type: "text", text: "Oi" }] }]);
    expect(JSON.stringify(sent.messages)).not.toContain("Account context");
    expect(sent).toMatchObject({ cache_control: EPHEMERAL });
  });

  it("the context block is identical byte for byte in two turns with different histories", async () => {
    const f = await pilotAccount();
    const { sdk, client } = anthropicClient([reply([thinking(), answer("Um.")]), reply([thinking(), answer("Dois.")])]);
    await runStrategistTurn({ client, ctx: f.ctx, message: "Primeira", history: history(2) });
    await runStrategistTurn({ client, ctx: f.ctx, message: "Segunda, outra coisa", history: history(20) });
    expect(JSON.stringify(sdk.params[1]!.messages[0])).toBe(JSON.stringify(sdk.params[0]!.messages[0]));
    expect(JSON.stringify(sdk.params[1]!.messages)).not.toBe(JSON.stringify(sdk.params[0]!.messages));
    expect(JSON.stringify(sdk.params[1]!.tools)).toBe(JSON.stringify(sdk.params[0]!.tools));
    expect(sdk.params[1]!.system).toBe(sdk.params[0]!.system);
  });
});

describe("a closing tool that worked next to a refused closing tool", () => {
  const delivered = () => reply([thinking(), answer("Resposta do limite."), toolUse("oferecer_plano", {})]);

  it.each([["the last allowed iteration", 1], ["iterations to spare", undefined]] as const)(
    "%s: the answer is delivered in the first call with its suggestions, and the refused offer holds nothing", async (_name, maxIterations) => {
      const f = await pilotAccount({ diagnosis: "none" });
      const { sdk, client } = anthropicClient([delivered(), reply([thinking(), answer("NUNCA-CHEGA")])]);
      const result = await run(f.ctx, client, maxIterations ? { maxIterations } : {});
      expect(sdk.params).toHaveLength(1);
      expect(result).toMatchObject({ text: "Resposta do limite.", suggestions: ITEMS, iterations: 1, toolCallsExecuted: 2 });
      expect(result.planOffered).toBeUndefined();
      expect(warn).not.toHaveBeenCalledWith("[equipe.strategist] answer_missing", expect.anything());
    });
});

describe("an accepted plan offer is terminal", () => {
  it.each([
    ["sugerir without `resposta`", () => toolUse(SUGGEST, { itens: ITEMS })],
    ["sugerir with an empty `resposta`", () => toolUse(SUGGEST, { resposta: "", itens: ITEMS })],
    ["a tool that does not exist", () => toolUse("ferramenta_inexistente", {}, "toolu-x")],
  ])("oferecer_plano next to %s: the card, in one request", async (_name, other) => {
    const f = await pilotAccount();
    const { sdk, client } = anthropicClient([reply([thinking(), toolUse("oferecer_plano", {}), other()]), reply([thinking(), answer("NUNCA-CHEGA")])]);
    const result = await run(f.ctx, client);
    expect(sdk.params).toHaveLength(1);
    expect(result).toMatchObject({ planOffered: true, iterations: 1, toolCallsExecuted: 2 });
  });

  it("the order inside the response does not matter", async () => {
    const f = await pilotAccount();
    const { sdk, client } = anthropicClient([reply([thinking(), toolUse(SUGGEST, { itens: ITEMS }), toolUse("oferecer_plano", {})])]);
    const result = await run(f.ctx, client);
    expect(sdk.params).toHaveLength(1);
    expect(result.planOffered).toBe(true);
  });
});
