// What the chat writes when the strategist's turn comes back (ticket 15, item 1): the answer the model wrote, the plan card, or an honest
// line. The old fallback ("Atualizei a conta, mas não consegui escrever o resumo") appeared after turns that had changed nothing.

import { describe, expect, it, vi } from "vitest";
vi.mock("@/server/validation/env", () => ({
  env: { EQUIPE_IG_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") },
}));
import { logger } from "@/lib/logger";
import type { Agents } from "../module/ports";
import { runEquipeStrategistTurn, type EquipeChatTurnEvent, type EquipeConversationWriter } from "./chat-turn";
import { MemoryLedgerStore } from "./ledger";
import { createEquipeAgents } from "./runner";
import { anthropicClient, reply, textBlock, thinking, toolUse } from "./testing-anthropic";
import { pilotAccount } from "./testing-pilot";

vi.spyOn(logger, "warn").mockImplementation(() => {});
vi.spyOn(logger, "info").mockImplementation(() => {});

const NO_ANSWER = "Não consegui escrever a resposta agora. Nada mudou na sua conta. Pode perguntar de novo?";
const NO_SUMMARY_AFTER_COMMANDS = "Atualizei a conta, mas não consegui escrever o resumo. Pergunte de novo que eu detalho.";

type Posted = { type: string; content?: string; payload?: Record<string, unknown> };
class Writer implements EquipeConversationWriter {
  readonly posts: Posted[] = [];
  async post(input: Posted) { this.posts.push(input); return { id: `m-${this.posts.length}` }; }
  async list() { return []; }
}

async function turn(f: Awaited<ReturnType<typeof pilotAccount>>, agents: Agents) {
  const messages = new Writer();
  const events: EquipeChatTurnEvent[] = [];
  for await (const event of runEquipeStrategistTurn({
    deps: f.t.deps, agents, messages: messages as never, workspaceId: f.workspaceId, accountId: f.accountId,
    threadId: "t", userMessage: "Como está minha marca?", executionPausedMessage: "pausa",
  })) events.push(event);
  // The person's own message is posted first: what the strategist wrote is everything after it.
  const posts = messages.posts.filter(post => post.type !== "user");
  return { events, posts, last: posts.at(-1)! };
}
const realAgents = (f: Awaited<ReturnType<typeof pilotAccount>>, script: Parameters<typeof anthropicClient>[0]) => {
  const { sdk, client } = anthropicClient(script);
  return { sdk, agents: createEquipeAgents({ moduleDeps: f.t.deps, client, ledger: new MemoryLedgerStore() }) };
};
const output = (output: unknown): Agents => ({ runTask: async () => ({ ok: true, output }) });

describe("the stored answer of a free chat turn, through the real agents and the Anthropic wire format", () => {
  it("a tool-only response (the production case) is stored as `resposta`, with its suggestions and never the fallback line", async () => {
    const f = await pilotAccount();
    const { sdk, agents } = realAgents(f, [reply([thinking(), toolUse("sugerir_proximos_passos", {
      resposta: "Sua marca vende café especial em Campinas.", itens: ["Me explica a oportunidade 1", "Quero ver os canais"],
    })])]);
    const { events, posts, last } = await turn(f, agents);
    expect(sdk.params).toHaveLength(1);
    expect(posts).toHaveLength(1);
    expect(last).toMatchObject({ type: "assistant", content: "Sua marca vende café especial em Campinas.",
      payload: { suggestions: ["Me explica a oportunidade 1", "Quero ver os canais"] } });
    expect(events).toEqual([{ type: "text_delta", text: "Sua marca vende café especial em Campinas." }, { type: "done", assistantMessageId: expect.any(String) }]);
    expect(JSON.stringify(posts)).not.toMatch(/Atualizei a conta|Não consegui escrever/);
  });

  it("a call written as text is stored clean, with the suggestions it carried", async () => {
    const f = await pilotAccount();
    const text = 'Sua marca vende café.\n<invoke name="sugerir_proximos_passos"><parameter name="resposta">Sua marca vende café.</parameter><parameter name="itens">["a","b","c"]</parameter></invoke>';
    const { agents } = realAgents(f, [reply([thinking(), textBlock(text)], "tool_use")]);
    const { last } = await turn(f, agents);
    expect(last).toMatchObject({ type: "assistant", content: "Sua marca vende café.", payload: { suggestions: ["a", "b", "c"] } });
  });

  it("oferecer_plano alone posts the plan card and no fallback line", async () => {
    const f = await pilotAccount();
    const { agents } = realAgents(f, [reply([thinking(), toolUse("oferecer_plano", {})])]);
    const { events, posts } = await turn(f, agents);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ type: "equipe_card", payload: { kind: "plan_offer", accountId: f.accountId } });
    expect(events.find(event => event.type === "equipe_card")).toMatchObject({ card: { kind: "plan_offer" } });
    expect(events.some(event => event.type === "text_delta")).toBe(false);
    expect(JSON.stringify(posts)).not.toMatch(/Atualizei a conta|Não consegui escrever/);
  });

  it("oferecer_plano next to a sugerir that has no `resposta`: the person gets the plan card, from ONE call to the model", async () => {
    const f = await pilotAccount();
    const { sdk, agents } = realAgents(f, [
      reply([thinking(), toolUse("oferecer_plano", {}), toolUse("sugerir_proximos_passos", { itens: ["Quero ver os canais"] })]),
      reply([thinking(), toolUse("sugerir_proximos_passos", { resposta: "NUNCA-CHEGA", itens: ["a"] })]),
    ]);
    const { events, posts } = await turn(f, agents);
    expect(sdk.params).toHaveLength(1);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ type: "equipe_card", payload: { kind: "plan_offer", accountId: f.accountId } });
    expect(posts.some(post => post.type === "assistant")).toBe(false);
    expect(events.find(event => event.type === "equipe_card")).toMatchObject({ card: { kind: "plan_offer" } });
    expect(JSON.stringify(posts)).not.toMatch(/Atualizei a conta|Não consegui escrever|NUNCA-CHEGA/);
  });

  it("no text and no command (only thinking): the honest line, and it never claims the account changed", async () => {
    const f = await pilotAccount();
    const { agents } = realAgents(f, [reply([thinking("pensei e não escrevi")], "end_turn")]);
    const { events, last } = await turn(f, agents);
    expect(last).toMatchObject({ type: "assistant", content: NO_ANSWER, payload: { suggestions: [] } });
    expect(last.content).not.toContain("Atualizei a conta");
    expect(events[0]).toEqual({ type: "text_delta", text: NO_ANSWER });
  });
});

describe("the fallback line follows what the turn really did", () => {
  it.each([
    ["one command applied", { text: null, commandsApplied: 1 }, NO_SUMMARY_AFTER_COMMANDS],
    ["three commands applied, blank text", { text: "  ", commandsApplied: 3 }, NO_SUMMARY_AFTER_COMMANDS],
    ["zero commands", { text: null, commandsApplied: 0 }, NO_ANSWER],
    ["commandsApplied missing (an old job result)", { text: null }, NO_ANSWER],
    ["no output at all", undefined, NO_ANSWER],
  ])("%s", async (_name, out, expected) => {
    const f = await pilotAccount();
    const { last, events } = await turn(f, output(out));
    expect(last).toMatchObject({ type: "assistant", content: expected });
    expect(events[0]).toEqual({ type: "text_delta", text: expected });
    expect(last.content?.includes("Atualizei a conta")).toBe(expected === NO_SUMMARY_AFTER_COMMANDS);
  });

  it("an answer that exists is stored as is, whatever commands ran", async () => {
    const f = await pilotAccount();
    const { last } = await turn(f, output({ text: "  Feito, atualizei o plano.  ", commandsApplied: 2, suggestions: ["Me explica o plano"] }));
    expect(last).toMatchObject({ content: "Feito, atualizei o plano.", payload: { suggestions: ["Me explica o plano"] } });
  });
});
