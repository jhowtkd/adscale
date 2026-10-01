// The conversation of a free account whose credit ended before the diagnosis existed (ticket 13, D-12), over random sequences of messages: the model is never
// asked; the plan card is the first answer and comes back only when the person asks for the plan; every other message gets one fixed reply that does not say the
// diagnosis exists; a paused account is answered only by the pause notice; two tabs racing on the first message bring one card.
import { describe, expect, it } from "vitest";
import { executeCommand } from "../module/commands";
import { makeTestDeps } from "../module/testing/deps";
import { advancingClock, confirmedHandoff } from "../module/testing/diagnosis";
import type { Agents, AgentTask, AgentTaskResult } from "../module/ports";
import { detectPlanRequest, runEquipeStrategistTurn, type ConversationPostInput, type EquipeChatTurnEvent, type EquipeConversationWriter } from "./chat-turn";

type Entry = { type: string; content: string; payload?: unknown };
/** Like the live writer: one store for the thread, and looking for an offer and posting one are a single step. */
class ThreadWriter implements EquipeConversationWriter {
  readonly posts: ConversationPostInput[] = [];
  private readonly stored: Entry[] = [];
  async post(input: ConversationPostInput) { this.posts.push(input); this.stored.push({ type: input.type, content: input.content, payload: input.payload }); return { id: `msg-${this.posts.length}` }; }
  async list(_threadId: string, options: { limit: number }) { return this.stored.slice(-options.limit); }
  async postPlanOfferOnce(input: ConversationPostInput) {
    if (this.stored.some(row => row.type === "equipe_card" && (row.payload as { kind?: string } | undefined)?.kind === "plan_offer")) return { id: "existing-offer", created: false };
    return { id: (await this.post(input)).id, created: true };
  }
}
class RecordingAgents implements Agents {
  readonly tasks: AgentTask[] = [];
  async runTask(task: AgentTask): Promise<AgentTaskResult> { this.tasks.push(task); return { ok: true, output: { text: "o modelo respondeu" } }; }
}
const collect = async (events: AsyncGenerator<EquipeChatTurnEvent>) => { const out: EquipeChatTurnEvent[] = []; for await (const event of events) out.push(event); return out; };

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(r: () => number, items: readonly T[]): T => items[Math.floor(r() * items.length)]!;

// Answered by their own fixed handlers BEFORE the credit branch: the two diagnosis chips and any message with an attachment (see the notes at the end).
const CHIPS = ["Tentar de novo", "Corrigir ou acrescentar meu site ou @"] as const;
const GENERIC = ["oi", "Olá, tudo bem?", "quero assinar", "Quero assinar o plano", "gostaria de contratar", "não quero assinar", "agora não, obrigado", "ok, pode postar", "aprovado",
  "Continuar no grátis por enquanto", "quero um calendário completo", "", "   ", "não quero continuar no grátis; quero assinar o plano"] as const;
const MESSAGES = [...GENERIC, ...CHIPS] as const;
const ATTACHMENT = { assetId: "asset-1", key: "k/1.png", type: "image/png", name: "foto.png", size: 10 };
const WRONG = /O diagnóstico e a Biblioteca continuam disponíveis/;

async function blocked() {
  const f = await confirmedHandoff(makeTestDeps());
  advancingClock(f.t);
  const failed = await executeCommand(f.t.deps, { actor: { kind: "system", job: "equipe.handoff.diagnose" }, workspaceId: f.workspaceId, accountId: f.accountId }, { type: "diagnosis_fail", payload: { taskIntentId: f.taskIntentId, code: "budget_exceeded" } });
  if (!failed.ok) throw new Error(failed.error.code);
  const messages = new ThreadWriter(), agents = new RecordingAgents();
  const turn = (userMessage: string, extra: { fromSuggestion?: boolean; attachments?: typeof ATTACHMENT[] } = {}) => collect(runEquipeStrategistTurn({
    deps: f.t.deps, agents, messages, workspaceId: f.workspaceId, accountId: f.accountId, actor: f.approver, threadId: "thread-1", userMessage, executionPausedMessage: "pausa", ...extra }));
  return { f, turn, messages, agents };
}
const cardsOf = (messages: ThreadWriter) => messages.posts.filter(post => post.type === "equipe_card");
const replies = (messages: ThreadWriter) => messages.posts.filter(post => post.type === "assistant").map(post => post.content);

describe("a free account whose credit ended before the diagnosis: random conversations", () => {
  it("never asks the model; one card first, then one more per explicit request; one fixed reply otherwise (80 conversations of 12 messages)", async () => {
    const r = rng(612);
    let requestsSeen = 0, fixedSeen = 0;
    for (let c = 0; c < 80; c++) {
      const { turn, messages, agents } = await blocked();
      const sent: string[] = [];
      let expectedCards = 0, offered = false;
      for (let i = 0; i < 12; i++) {
        const text = pick(r, MESSAGES);
        const attached = r() < 0.15;
        const extra = { ...(r() < 0.2 ? { fromSuggestion: true } : {}), ...(attached ? { attachments: [ATTACHMENT] } : {}) };
        sent.push(attached ? `${text} +img` : text);
        const events = await turn(text, extra);
        expect(events.at(-1)?.type, `conversation ${c} turn ${i} "${text}"`).toBe("done");
        expect(agents.tasks).toHaveLength(0);
        // Every answer is a card or a text, never both, never nothing.
        const cards = events.filter(e => e.type === "equipe_card").length, texts = events.filter(e => e.type === "text_delta").length;
        expect(cards + texts, `turn ${i} "${text}"`).toBe(1);
        const ownHandler = attached || (CHIPS as readonly string[]).includes(text);
        if (ownHandler) { expect(cards).toBe(0); continue; }
        const wantsCard = !offered || detectPlanRequest(text);
        if (wantsCard) { expectedCards++; offered = true; expect(cards).toBe(1); } else expect(cards).toBe(0);
      }
      expect(cardsOf(messages), `conversation ${c}: ${JSON.stringify(sent)}`).toHaveLength(expectedCards);
      requestsSeen += Math.max(0, expectedCards - 1);
      for (const card of cardsOf(messages)) expect(card.payload).toMatchObject({ kind: "plan_offer", reason: "diagnosis_budget_exceeded" });
      const fixed = replies(messages).filter(reply => reply.startsWith("O crédito grátis de IA da sua conta acabou"));
      const others = replies(messages).filter(reply => !reply.startsWith("O crédito grátis de IA da sua conta acabou"));
      // The other answers are the two chips' and the attachment's own, and none of them claims the diagnosis is available.
      for (const reply of others) expect(reply).not.toMatch(WRONG);
      expect(new Set(fixed).size).toBeLessThanOrEqual(1); // One reply, always the same words.
      for (const reply of fixed) {
        expect(reply).not.toMatch(WRONG);
        expect(reply).toContain("não consegui montar o diagnóstico");
        expect(reply).toContain("quero assinar");
      }
      fixedSeen += fixed.length;
    }
    expect(requestsSeen).toBeGreaterThan(50);
    expect(fixedSeen).toBeGreaterThan(300);
  }, 120_000);

  it("a paused account (delinquent) is answered only by the pause notice: no card, no fixed reply, no model", async () => {
    const r = rng(7);
    for (let c = 0; c < 20; c++) {
      const { f, turn, messages, agents } = await blocked();
      await f.t.deps.uow.repos.accounts.update(f.workspaceId, f.accountId, { status: "suspended" });
      for (let i = 0; i < 5; i++) {
        const events = await turn(pick(r, MESSAGES));
        expect(events.filter(e => e.type === "equipe_card")).toHaveLength(0);
        const text = events.find(e => e.type === "text_delta");
        expect(text?.type === "text_delta" ? text.text : "").toBe("pausa");
      }
      expect(cardsOf(messages)).toHaveLength(0);
      expect(agents.tasks).toHaveLength(0);
      expect(replies(messages).every(reply => reply === "pausa")).toBe(true);
    }
  });

  it("two tabs racing on the first message bring one card, whatever the two messages are (60 races)", async () => {
    const r = rng(33);
    for (let c = 0; c < 60; c++) {
      const { turn, messages, agents } = await blocked();
      const first = pick(r, GENERIC.filter(text => !detectPlanRequest(text))), second = pick(r, GENERIC.filter(text => !detectPlanRequest(text)));
      const [a, b] = await Promise.all([turn(first), turn(second)]);
      expect(cardsOf(messages)).toHaveLength(1);
      expect([a, b].filter(events => events.some(e => e.type === "equipe_card"))).toHaveLength(1);
      expect([a, b].filter(events => events.some(e => e.type === "text_delta"))).toHaveLength(1);
      expect(agents.tasks).toHaveLength(0);
    }
  });

  it("a request that races the first message still brings its card, and the other tab never calls the model", async () => {
    const { turn, messages, agents } = await blocked();
    await Promise.all([turn("oi"), turn("quero assinar")]);
    expect(cardsOf(messages).length).toBeGreaterThanOrEqual(1);
    expect(cardsOf(messages).length).toBeLessThanOrEqual(2);
    expect(agents.tasks).toHaveLength(0);
  });

  it("an account that is no longer free is never answered by the credit branch, whatever it says (15 messages)", async () => {
    const r = rng(19);
    const { f, turn, messages, agents } = await blocked();
    await f.t.deps.uow.repos.accounts.update(f.workspaceId, f.accountId, { status: "active" });
    for (let i = 0; i < 15; i++) await turn(pick(r, GENERIC.filter(text => text.trim() && !/postar|aprovado/.test(text))));
    expect(agents.tasks.length).toBeGreaterThan(0);
    expect(cardsOf(messages).some(card => (card.payload as { reason?: string }).reason === "diagnosis_budget_exceeded")).toBe(false);
    expect(replies(messages).some(reply => reply.startsWith("O crédito grátis de IA da sua conta acabou"))).toBe(false);
  });

  it("a conversation that is not blocked is untouched: the model answers and no plan card appears", async () => {
    const f = await confirmedHandoff(makeTestDeps());
    const messages = new ThreadWriter(), agents = new RecordingAgents();
    const events = await collect(runEquipeStrategistTurn({ deps: f.t.deps, agents, messages, workspaceId: f.workspaceId, accountId: f.accountId, actor: f.approver, threadId: "thread-1", userMessage: "oi", executionPausedMessage: "pausa" }));
    expect(agents.tasks).toHaveLength(1); // The model is asked, as it always was.
    expect(cardsOf(messages).some(card => (card.payload as { reason?: string }).reason === "diagnosis_budget_exceeded")).toBe(false);
    expect(events.length).toBeGreaterThan(0);
  });
});
