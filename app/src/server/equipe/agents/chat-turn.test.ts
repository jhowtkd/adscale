// Equipe chat turn (#551): approval intent answers with a card, everything
// else delegates to the #550 strategist through the Agents port.

import { describe, expect, it, vi } from "vitest";
import type { Agents, AgentTask, AgentTaskResult } from "../module/ports";
import { executeCommand } from "../module/commands";
import { ctx as itemCtx, setup as setupItems } from "../module/testing/items";
import { makeTestDeps, uuid, type TestDeps } from "../module/testing/deps";
import { DIAGNOSTIC_RECORDED_EVENT } from "./free-budget";
import { BUDGET_EXCEEDED_ERROR } from "./runner";
import {
  detectApprovalIntent,
  detectPlanRequest,
  runEquipeStrategistTurn,
  type ConversationPostInput,
  type EquipeChatTurnEvent,
  type EquipeConversationWriter,
} from "./chat-turn";
import { deliverTestBatch, setup } from "../module/testing/items";
import { FIXED_REPLIES, fixedReplyText, planLaterMessage, type FixedReply } from "@/lib/equipe/fixed-replies";

/** Matches EquipeConversationWriter["list"]'s inline return element shape. */
type ConversationHistoryEntry = { type: string; content: string; payload?: unknown };

class RecordingWriter implements EquipeConversationWriter {
  readonly posts: ConversationPostInput[] = [];
  private history: ConversationHistoryEntry[] = [];
  readonly listCalls: Array<{ threadId: string; options: { limit: number } }> = [];

  async post(input: ConversationPostInput): Promise<{ id: string }> {
    this.posts.push(input);
    return { id: `msg-${this.posts.length}` };
  }

  async list(threadId: string, options: { limit: number }): Promise<ConversationHistoryEntry[]> {
    this.listCalls.push({ threadId, options });
    return this.history;
  }

  /** Test-only seam: preloads what `list()` returns for the "reads before posting" contract. */
  seedHistory(rows: ConversationHistoryEntry[]) {
    this.history = rows;
  }
}

/**
 * Opens a free account (ticket 02): the plan-offer-on-budget-exhaustion path
 * only applies to free accounts, so these tests need open_free_account, not
 * the paid-account setup() helper from module/testing/items.
 */
async function freeAccount(t: TestDeps = makeTestDeps()) {
  const workspaceId = uuid();
  const userId = `user-${uuid()}`;
  t.store.workspaceMembers.rows.set(uuid(), {
    id: uuid(), workspaceId, userId, name: "Ana", email: "a@x.com", emailVerified: true,
    role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  const opened = await executeCommand(t.deps, { actor: { kind: "system", job: "free" }, workspaceId }, {
    type: "open_free_account", payload: { userId },
  });
  if (!opened.ok) throw new Error(opened.error.code);
  return { t, workspaceId, accountId: opened.value.accountId! };
}

/**
 * Ticket 04: open_free_account also opens a source-step brand handoff, and
 * the strategist never runs (no model, no plan-offer card) until it reaches
 * `done`. Tests of post-handoff chat behavior (budget exhaustion, plan
 * offers) mark it done directly rather than driving the full flow.
 */
async function completeHandoff(t: TestDeps, workspaceId: string, accountId: string) {
  const scope = { workspaceId, accountId };
  const [row] = await t.deps.uow.repos.handoffs.list(scope);
  if (row) await t.deps.uow.repos.handoffs.update(scope, row.id, { step: "done" });
}

class RecordingAgents implements Agents {
  readonly tasks: AgentTask[] = [];

  constructor(private readonly result: AgentTaskResult) {}

  async runTask(task: AgentTask): Promise<AgentTaskResult> {
    this.tasks.push(task);
    return this.result;
  }
}

async function collect(
  events: AsyncGenerator<EquipeChatTurnEvent>,
): Promise<EquipeChatTurnEvent[]> {
  const out: EquipeChatTurnEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

describe("detectApprovalIntent", () => {
  it.each([
    "ok, pode postar",
    "Ok pode postar!",
    "pode publicar",
    "tudo certo, pode mandar",
    "Aprovado",
    "aprovada, pode subir",
    "aprovo os dois",
    "pode colocar no ar",
    "pode enviar hoje",
  ])("detects %p", (text) => {
    expect(detectApprovalIntent(text)).toBe(true);
  });

  it.each([
    "posso postar?",
    "pode postar?",
    "não pode postar ainda",
    "nao pode publicar sem revisar",
    "oi, tudo bem?",
    "manda o link do item",
    "quando o lote fica pronto?",
    "não aprovei nada",
  ])("ignores %p", (text) => {
    expect(detectApprovalIntent(text)).toBe(false);
  });

  // Typed text keeps these conservative patterns: broader words ("aceito", "aval")
  // would pull ordinary sentences away from the strategist. They only matter for
  // suggestions, whose filter lists them (src/lib/equipe/suggestions).
  it.each([
    "aceito a sugestão",
    "Aceite o calendário",
    "Dê seu aval",
    "preciso de um aval do meu sócio",
    "o aceite do cliente chegou",
  ])("leaves the typed %p to the strategist", (text) => {
    expect(detectApprovalIntent(text)).toBe(false);
  });
});

describe("detectPlanRequest", () => {
  it.each([
    "quero assinar",
    "QUERO ASSINAR",
    "Quero assinar o plano!",
    "quero logo assinar",
    "quero contratar",
    "gostaria de assinar",
    "vamos assinar",
    "como faço para assinar?",
    "como faco pra contratar?",
    "como assino?",
    "quero o plano",
    "quero conhecer o plano",
    "quero saber mais sobre o plano",
    "assinar o plano",
    // A negation only vetoes the clause it is in: the request survives next to it.
    "Não quero continuar no grátis; quero assinar o plano",
    "não quero o grátis, quero assinar",
    "Não quero continuar no grátis e quero assinar o plano",
    "não quero continuar no grátis, mas quero assinar",
    "Agora não. Quero assinar",
    "Não quero continuar no grátis — quero assinar o plano",
    "não quero o grátis - quero assinar",
    "Não quero o grátis\nquero assinar o plano",
    "não, quero assinar o plano",
    "quero assinar o plano, não o grátis",
    "quero assinar, mas não agora",
    // A reader in English is told to say "I want to subscribe" (ticket 13, T7 of the screen review).
    "I want to subscribe",
    "I WANT TO SUBSCRIBE!",
    "I want to subscribe to the plan",
    "I'd like to subscribe",
    "I would like to sign up",
    "i wanna buy",
    "how do I subscribe?",
    "How can I sign up",
    "I want the plan",
    "I want to know more about the plan",
    "subscribe to the plan",
    "I don't want the free one, I want to subscribe",
    "I don't want to keep going for free and I want to subscribe",
    "Not now. I want to subscribe",
    "I want to subscribe, but not now",
    // A phone keyboard writes the apostrophe curved.
    "I’d like to subscribe",
    "I’d like to sign up",
  ])("detects %p", (text) => {
    expect(detectPlanRequest(text)).toBe(true);
  });

  it.each([
    "",
    "oi",
    "Continuar no grátis por enquanto",
    "agora não",
    "não quero assinar",
    "Não quero assinar o plano",
    "nao quero contratar agora",
    "nem quero assinar",
    "ainda não vou assinar",
    "talvez depois",
    "faz um post pra mim",
    "o plano grátis acabou?",
    "quero o plano grátis",
    "qual o limite do plano gratuito?",
    "não quero continuar no grátis",
    "Não quero assinar agora, só quero continuar no grátis",
    "quero continuar no grátis, não quero assinar o plano",
    "não quero assinar, quero o plano grátis",
    "Not now",
    "I don't want to subscribe",
    "I do not want to subscribe",
    "I won't subscribe",
    "I never want to subscribe",
    "I can't subscribe right now",
    "Continue on the free plan for now",
    "I want the free plan",
    "I want the plan for free",
    "I want to keep going on the free one, not subscribe",
    "what does the plan cost?",
  ])("ignores %p", (text) => {
    expect(detectPlanRequest(text)).toBe(false);
  });

  // A negation vetoes the clause it is in, whichever way it is written (the patterns need the words of the request side by side, so these are the cases left).
  it.each(["not", "never", "dont", "don't", "don’t", "wont", "won't", "won’t", "cannot", "can't", "can’t", "cant"])("a %p in the clause of the request vetoes it", (negation) => {
    expect(detectPlanRequest(`I want the plan ${negation} now`)).toBe(false);
    expect(detectPlanRequest(`I would like not to subscribe`)).toBe(false);
    expect(detectPlanRequest("I want the plan now")).toBe(true);
  });

  it.each(["I want to not subscribe", "I want to never subscribe", "I would like not to subscribe", "I want a plan I don’t need"])("%p is not a request", (text) => {
    expect(detectPlanRequest(text)).toBe(false);
  });

  // The fixed lines promise something: "é só dizer “quero assinar”" / "just say “I want to subscribe”". The promise is kept, in both languages, for every line.
  it.each(["pt-BR", "en"] as const)("%s: what each fixed line tells the person to say is understood as a request for the plan", (locale) => {
    for (const key of Object.keys(FIXED_REPLIES[locale]) as FixedReply[]) {
      const said = fixedReplyText(key, locale).match(/“([^”]+)”/)?.[1];
      expect(said, `${locale} ${key}`).toBeTruthy();
      expect(detectPlanRequest(said!), `${locale} ${key}: ${said}`).toBe(true);
    }
  });

  it.each(["pt-BR", "en"])("%s: the phrase of 'Agora não' is never taken for a request for the plan", (locale) => {
    expect(detectPlanRequest(planLaterMessage(locale))).toBe(false);
  });
});

describe("runEquipeStrategistTurn", () => {
  it.each([
    { command: "suspend_execution", actor: "operations", message: "ok, pode postar", notice: "O trabalho do ADScale está pausado no momento. Sua mensagem ficou registrada para uma pessoa do ADScale responder." },
    { command: "pause_delinquency", actor: "system", message: "oi, como está?", notice: "ADScale's work is paused at the moment. Your message has been saved so a person at ADScale can reply." },
  ])("stores a human message and returns the localized pause notice before reads or AI ($command)", async ({ command, actor, message, notice }) => {
    const { t, ids } = await setupItems();
    const pause = await executeCommand(t.deps, itemCtx(ids, ids.actors[actor as keyof typeof ids.actors]), {
      type: command as "suspend_execution" | "pause_delinquency", payload: {},
    });
    expect(pause.ok).toBe(true);
    const itemsRead = vi.spyOn(t.deps.uow.repos.items, "list");
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "must not run" } });
    const events = await collect(runEquipeStrategistTurn({
      deps: t.deps, agents, messages, workspaceId: ids.workspaceId, accountId: ids.accountId,
      threadId: "thread-1", userMessage: message, executionPausedMessage: notice,
    }));

    expect(messages.posts.map(({ type, content }) => ({ type, content }))).toEqual([
      { type: "user", content: message }, { type: "assistant", content: notice },
    ]);
    expect(events).toEqual([
      { type: "text_delta", text: notice }, { type: "done", assistantMessageId: "msg-2" },
    ]);
    expect(agents.tasks).toHaveLength(0);
    expect(itemsRead).not.toHaveBeenCalled();
  });

  it("answers approval intent with the pending batch card, never an approval", async () => {
    const { t, ids } = await setup();
    const delivered = await deliverTestBatch(t, ids, { title: "Calendário 23–27/11" });
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "unused" } });

    const events = await collect(
      runEquipeStrategistTurn({
        deps: t.deps,
        agents,
        messages,
        workspaceId: ids.workspaceId,
        accountId: ids.accountId,
        threadId: "thread-1",
        userMessage: "ok, pode postar",
        executionPausedMessage: "A execução desta conta está pausada.",
      }),
    );

    // The model is never consulted on this path…
    expect(agents.tasks).toHaveLength(0);
    // …and no approval is recorded: no receipts, no state change.
    const receipts = await t.deps.uow.repos.receipts.list({
      workspaceId: ids.workspaceId,
      accountId: ids.accountId,
    });
    expect(receipts).toHaveLength(0);
    const items = await t.deps.uow.repos.items.list({
      workspaceId: ids.workspaceId,
      accountId: ids.accountId,
    });
    expect(items.every((item) => item.status === "awaiting_approval")).toBe(true);

    // The answer is the card of the pending batch.
    const cardEvent = events.find((event) => event.type === "equipe_card");
    expect(cardEvent).toBeDefined();
    expect(cardEvent).toMatchObject({
      type: "equipe_card",
      card: {
        kind: "batch",
        accountId: ids.accountId,
        title: "Calendário 23–27/11",
        batchId: delivered.batchId,
      },
    });
    if (cardEvent?.type !== "equipe_card") return;
    expect(cardEvent.card.items).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ type: "done" });

    const posted = messages.posts.filter((post) => post.type === "equipe_card");
    expect(posted).toHaveLength(1);
    expect(messages.posts[0]).toMatchObject({ type: "user", content: "ok, pode postar" });
  });

  it("answers approval intent in plain text when nothing is pending", async () => {
    const { t, ids } = await setup();
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "unused" } });

    const events = await collect(
      runEquipeStrategistTurn({
        deps: t.deps,
        agents,
        messages,
        workspaceId: ids.workspaceId,
        accountId: ids.accountId,
        threadId: "thread-1",
        userMessage: "aprovado!",
        executionPausedMessage: "A execução desta conta está pausada.",
      }),
    );

    expect(agents.tasks).toHaveLength(0);
    expect(events.some((event) => event.type === "equipe_card")).toBe(false);
    const done = events.at(-1);
    expect(done?.type).toBe("done");
    const assistant = messages.posts.find((post) => post.type === "assistant");
    expect(assistant?.content).toContain("Não há nada aguardando sua aprovação");
  });

  it("delegates other messages to the strategist through the Agents port", async () => {
    const { t, ids } = await setup();
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "O lote chega amanhã." } });

    const events = await collect(
      runEquipeStrategistTurn({
        deps: t.deps,
        agents,
        messages,
        workspaceId: ids.workspaceId,
        accountId: ids.accountId,
        threadId: "thread-1",
        userMessage: "quando chega o lote?",
        executionPausedMessage: "A execução desta conta está pausada.",
      }),
    );

    expect(agents.tasks).toHaveLength(1);
    expect(agents.tasks[0]).toMatchObject({
      kind: "strategist_turn",
      workspaceId: ids.workspaceId,
      accountId: ids.accountId,
      input: { message: "quando chega o lote?" },
    });
    expect(events).toEqual([
      { type: "text_delta", text: "O lote chega amanhã." },
      { type: "done", assistantMessageId: "msg-2" },
    ]);
    expect(messages.posts.map((post) => post.type)).toEqual(["user", "assistant"]);
  });

  it("answers gracefully when the strategist refuses over budget", async () => {
    const { t, ids } = await setup();
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: false, error: BUDGET_EXCEEDED_ERROR });

    const events = await collect(
      runEquipeStrategistTurn({
        deps: t.deps,
        agents,
        messages,
        workspaceId: ids.workspaceId,
        accountId: ids.accountId,
        threadId: "thread-1",
        userMessage: "e aí?",
        executionPausedMessage: "A execução desta conta está pausada.",
      }),
    );

    expect(events[0]?.type).toBe("text_delta");
    expect(events.at(-1)?.type).toBe("done");
    const assistant = messages.posts.find((post) => post.type === "assistant");
    expect(assistant?.content).toContain("limite de IA");
  });

  it("answers gracefully when the strategist fails", async () => {
    const { t, ids } = await setup();
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: false, error: "model_down" });

    const events = await collect(
      runEquipeStrategistTurn({
        deps: t.deps,
        agents,
        messages,
        workspaceId: ids.workspaceId,
        accountId: ids.accountId,
        threadId: "thread-1",
        userMessage: "e aí?",
        executionPausedMessage: "A execução desta conta está pausada.",
      }),
    );

    expect(events.at(-1)?.type).toBe("done");
    const assistant = messages.posts.find((post) => post.type === "assistant");
    expect(assistant?.content).toContain("Não consegui processar");
  });
});

/** A validated attachment as the chat route normalizes it (name, type and thumbnail url included). */
const ATTACHMENT = {
  assetId: "00000000-0000-4000-8000-000000000001",
  key: "workspaces/ws-1/assets/foto.png",
  url: "https://cdn.example/workspaces/ws-1/assets/foto.png",
  type: "image/png",
  name: "foto.png",
  size: 1024,
};

/** Keeps what a turn posts so the next turn reads it back, like the live repository does. */
class ThreadWriter extends RecordingWriter {
  private readonly stored: ConversationHistoryEntry[] = [];

  seed(rows: ConversationHistoryEntry[]) {
    this.stored.push(...rows);
  }

  override async post(input: ConversationPostInput): Promise<{ id: string }> {
    const posted = await super.post(input);
    this.stored.push({ type: input.type, content: input.content, payload: input.payload });
    return posted;
  }

  override async list(threadId: string, options: { limit: number }): Promise<ConversationHistoryEntry[]> {
    this.listCalls.push({ threadId, options });
    return this.stored.slice(-options.limit);
  }

  /** Like the live writer: looking for an offer and posting one are a single step, so racing turns cannot both offer. */
  async postPlanOfferOnce(input: ConversationPostInput): Promise<{ id: string; created: boolean }> {
    const existing = this.stored.some((row) => row.type === "equipe_card" && (row.payload as { kind?: string } | undefined)?.kind === "plan_offer");
    if (existing) return { id: "existing-offer", created: false };
    this.posts.push(input);
    this.stored.push({ type: input.type, content: input.content, payload: input.payload });
    return { id: `msg-${this.posts.length}`, created: true };
  }
}

// Free budget exhausted AFTER the diagnostic: the first message gets the plan
// offer, every later one gets a fixed reply — no new card, no strategist call —
// until the person asks for the plan. "Agora não" is just such a later message.
describe("runEquipeStrategistTurn — free budget exhausted offer", () => {
  const DISMISS = "Continuar no grátis por enquanto";

  async function exhaustedThread(result: AgentTaskResult = { ok: false, error: BUDGET_EXCEEDED_ERROR }) {
    const free = await freeAccount();
    const scope = { workspaceId: free.workspaceId, accountId: free.accountId };
    await completeHandoff(free.t, free.workspaceId, free.accountId); // the free conversation opens after the brand handoff (ticket 04)
    await free.t.deps.uow.repos.events.create(scope, {
      actorType: "system", actorId: "diag", actorRole: "system",
      eventType: DIAGNOSTIC_RECORDED_EVENT, payload: { documentId: uuid() }, occurredAt: new Date(),
    });
    const messages = new ThreadWriter();
    const agents = new RecordingAgents(result);
    const turn = (userMessage: string, extra: { fromSuggestion?: boolean; attachments?: typeof ATTACHMENT[]; locale?: string } = {}) => collect(runEquipeStrategistTurn({
      deps: free.t.deps, agents, messages, ...scope,
      threadId: "thread-1", userMessage, executionPausedMessage: "pausa", ...extra,
    }));
    return { turn, messages, agents };
  }

  const cards = (messages: RecordingWriter) => messages.posts.filter((post) => post.type === "equipe_card");
  const replyText = (events: EquipeChatTurnEvent[]) => {
    const delta = events.find((event) => event.type === "text_delta");
    return delta?.type === "text_delta" ? delta.text : undefined;
  };

  it("posts the exhaustion offer once, marked as the card that closes the free conversation", async () => {
    const { turn, messages } = await exhaustedThread();

    const events = await turn("quero um calendário completo");

    expect(events.filter((event) => event.type === "equipe_card")).toHaveLength(1);
    expect(cards(messages)).toHaveLength(1);
    expect(cards(messages)[0]?.payload).toMatchObject({ kind: "plan_offer", reason: "free_budget_exhausted" });
  });

  it("ends 'Agora não' with a fixed reply: no new card and no strategist call", async () => {
    const { turn, messages, agents } = await exhaustedThread();
    await turn("quero um calendário completo");
    expect(agents.tasks).toHaveLength(1);

    const events = await turn(DISMISS, { fromSuggestion: true });

    expect(events.some((event) => event.type === "equipe_card")).toBe(false);
    expect(cards(messages)).toHaveLength(1);
    expect(agents.tasks).toHaveLength(1);
    expect(messages.posts.at(-2)).toMatchObject({ type: "user", content: DISMISS, payload: { fromSuggestion: true } });
    const reply = messages.posts.at(-1);
    expect(reply).toMatchObject({ type: "assistant" });
    expect(reply?.content).toContain("Biblioteca");
    expect(reply?.content).toContain("quero assinar");
    expect(reply?.content).not.toMatch(/R\$|pri[cç]e|valor|mensal/i);
    expect(events).toEqual([
      { type: "text_delta", text: reply?.content },
      { type: "done", assistantMessageId: `msg-${messages.posts.length}` },
    ]);
  });

  it("answers every later message with the same fixed reply, even once the offer left the 20-message window", async () => {
    const { turn, messages, agents } = await exhaustedThread();
    await turn("quero um calendário completo");

    const replies: Array<string | undefined> = [];
    for (let index = 0; index < 15; index += 1) {
      const events = await turn(index === 0 ? DISMISS : `mensagem ${index}`, { fromSuggestion: index === 0 });
      expect(events.some((event) => event.type === "equipe_card")).toBe(false);
      replies.push(replyText(events));
    }

    expect(replies[0]).toBeTruthy();
    expect(new Set(replies).size).toBe(1);
    expect(cards(messages)).toHaveLength(1);
    // Only the first message reached the budget gate; the rest never touched it.
    expect(agents.tasks).toHaveLength(1);
    // The card really is older than the history window by now.
    expect(messages.posts.length).toBeGreaterThan(21);
  });

  it.each(["quero assinar", "Quero assinar o plano", "gostaria de contratar"])(
    "brings the card back only for an explicit request (%s) and 'Agora não' dismisses it again",
    async (request) => {
      const { turn, messages, agents } = await exhaustedThread();
      await turn("quero um calendário completo");
      await turn(DISMISS, { fromSuggestion: true });
      expect(cards(messages)).toHaveLength(1);

      const reoffer = await turn(request);
      expect(reoffer.filter((event) => event.type === "equipe_card")).toHaveLength(1);
      expect(cards(messages)).toHaveLength(2);
      expect(cards(messages)[1]?.payload).toMatchObject({ kind: "plan_offer", reason: "free_budget_exhausted" });

      const dismissed = await turn(DISMISS, { fromSuggestion: true });
      expect(dismissed.some((event) => event.type === "equipe_card")).toBe(false);
      expect(cards(messages)).toHaveLength(2);
      expect(agents.tasks).toHaveLength(1);
    },
  );

  it("brings the card back for an explicit request that sits next to a negation", async () => {
    const { turn, messages, agents } = await exhaustedThread();
    await turn("quero um calendário completo");
    await turn(DISMISS, { fromSuggestion: true });

    const events = await turn("Não quero continuar no grátis; quero assinar o plano");

    expect(events.filter((event) => event.type === "equipe_card")).toHaveLength(1);
    expect(cards(messages)).toHaveLength(2);
    expect(agents.tasks).toHaveLength(1);
  });

  it.each(["agora não", "não quero assinar", "talvez depois", "faz um post pra mim", "o plano grátis acabou?"])(
    "keeps the card away for %p",
    async (text) => {
      const { turn, messages } = await exhaustedThread();
      await turn("quero um calendário completo");

      const events = await turn(text);

      expect(events.some((event) => event.type === "equipe_card")).toBe(false);
      expect(cards(messages)).toHaveLength(1);
      expect(messages.posts.at(-1)).toMatchObject({ type: "assistant" });
    },
  );

  // T7 and T8 of the screen review: the fixed lines are stored once, in pt-BR, with their key; the stream carries the language of the request; and "Agora não" on
  // the plan card is answered by a line of its own, not by the invitation to carry on for free that the card sent before.
  describe("fixed lines: language and 'Agora não' (ticket 13, screen review T7 and T8)", () => {
    const LATER = "Agora não";
    const LATER_LINE = "Tudo bem. Quando quiser, é só dizer “quero assinar”.";
    const EXHAUSTED_LINE = "Sua conversa grátis com a IA chegou ao limite. O diagnóstico e a Biblioteca continuam disponíveis; para conhecer o plano, é só dizer “quero assinar”.";

    it("answers 'Agora não' with the line of its own: stored in pt-BR with its key, no new card, no strategist call", async () => {
      const { turn, messages, agents } = await exhaustedThread();
      await turn("quero um calendário completo");

      const events = await turn(LATER, { fromSuggestion: true });

      expect(events).toEqual([
        { type: "text_delta", text: LATER_LINE },
        { type: "done", assistantMessageId: `msg-${messages.posts.length}` },
      ]);
      expect(messages.posts.at(-1)).toEqual({ threadId: "thread-1", type: "assistant", content: LATER_LINE, payload: { fixedReply: "plan_later" } });
      expect(cards(messages)).toHaveLength(1);
      expect(agents.tasks).toHaveLength(1);
      // It is not the invitation to carry on for free that the card used to send.
      expect(LATER_LINE).not.toMatch(/gr[aá]tis/i);
    });

    it.each(["agora não", "Agora não.", "AGORA NAO!", "Not now", "not now."])("takes the button's phrase in any spelling (%s)", async (phrase) => {
      const { turn, messages } = await exhaustedThread();
      await turn("quero um calendário completo");

      await turn(phrase, { fromSuggestion: true });

      expect(messages.posts.at(-1)).toMatchObject({ type: "assistant", content: LATER_LINE, payload: { fixedReply: "plan_later" } });
      expect(cards(messages)).toHaveLength(1);
    });

    it("streams the line in the language of the request and stores it once, in pt-BR", async () => {
      const { turn, messages } = await exhaustedThread();
      await turn("quero um calendário completo", { locale: "en" });

      const later = await turn("Not now", { fromSuggestion: true, locale: "en" });
      const next = await turn("what now?", { locale: "en" });

      expect(replyText(later)).toBe("That's fine. Whenever you want, just say “I want to subscribe”.");
      expect(replyText(next)).toBe("Your free AI conversation has reached its limit. Your diagnosis and Library are still available; to learn about the plan, just say “I want to subscribe”.");
      const stored = messages.posts.filter((post) => post.type === "assistant");
      expect(stored.map((post) => post.content)).toEqual([LATER_LINE, EXHAUSTED_LINE]);
      expect(stored.map((post) => post.payload)).toEqual([{ fixedReply: "plan_later" }, { fixedReply: "free_budget_exhausted" }]);
    });

    it("keeps the conversation closed after it: the next message gets the exhausted reply, never the strategist or the card", async () => {
      const { turn, messages, agents } = await exhaustedThread();
      await turn("quero um calendário completo");
      await turn(LATER, { fromSuggestion: true });

      // Whatever is said next (even a short message the budget gate would let through) is answered by the same reply, and "Agora não" again by the line of its own.
      const replies = [replyText(await turn("oi")), replyText(await turn("faz um post pra mim")), replyText(await turn(LATER))];
      const events = await turn("e aí?");

      expect(replies).toEqual([EXHAUSTED_LINE, EXHAUSTED_LINE, LATER_LINE]);
      expect(replyText(events)).toBe(EXHAUSTED_LINE);
      expect(events.some((event) => event.type === "equipe_card")).toBe(false);
      expect(cards(messages)).toHaveLength(1);
      expect(agents.tasks).toHaveLength(1);
    });

    it("'quero assinar' after it brings the card back, and 'Agora não' on that card ends the same way", async () => {
      const { turn, messages, agents } = await exhaustedThread();
      await turn("quero um calendário completo");
      await turn(LATER, { fromSuggestion: true });

      const reoffer = await turn("quero assinar");
      const dismissed = await turn(LATER, { fromSuggestion: true });

      expect(reoffer.filter((event) => event.type === "equipe_card")).toHaveLength(1);
      expect(cards(messages)).toHaveLength(2);
      expect(cards(messages)[1]?.payload).toMatchObject({ kind: "plan_offer", reason: "free_budget_exhausted" });
      expect(replyText(dismissed)).toBe(LATER_LINE);
      expect(cards(messages)).toHaveLength(2);
      expect(agents.tasks).toHaveLength(1);
    });

    it("is answered the same when the card is older than the history window, and does not make a new one", async () => {
      const { turn, messages, agents } = await exhaustedThread();
      messages.seed([
        { type: "equipe_card", content: "ADScale para a sua marca", payload: { kind: "plan_offer", reason: "free_budget_exhausted", title: "ADScale para a sua marca", items: [] } },
        ...Array.from({ length: 25 }, (_, index) => ({ type: index % 2 ? "assistant" : "user", content: `conversa ${index}` })),
      ]);

      const events = await turn(LATER, { fromSuggestion: true });

      expect(replyText(events)).toBe(LATER_LINE);
      expect(events.some((event) => event.type === "equipe_card")).toBe(false);
      expect(cards(messages)).toHaveLength(0);
      expect(agents.tasks).toHaveLength(1);
    });

    it("takes the whole message: a request for the plan that starts with it still brings the card", async () => {
      const { turn, messages } = await exhaustedThread();
      await turn("quero um calendário completo");

      const events = await turn("Agora não. Quero assinar");

      expect(events.filter((event) => event.type === "equipe_card")).toHaveLength(1);
      expect(cards(messages)).toHaveLength(2);
    });

    it("still answers the old button's phrase with the exhausted reply, as before", async () => {
      const { turn, messages } = await exhaustedThread();
      await turn("quero um calendário completo");

      const events = await turn(DISMISS, { fromSuggestion: true });

      expect(replyText(events)).toBe(EXHAUSTED_LINE);
      expect(messages.posts.at(-1)?.payload).toEqual({ fixedReply: "free_budget_exhausted" });
    });

    it("a card from before this change and a reply stored without a key still close the conversation", async () => {
      const { turn, messages, agents } = await exhaustedThread();
      messages.seed([{ type: "assistant", content: EXHAUSTED_LINE }]);

      const events = await turn("oi");

      expect(replyText(events)).toBe(EXHAUSTED_LINE);
      expect(agents.tasks).toHaveLength(0);
    });
  });

  it("keeps the fixed reply after the plan request posts its feed line in the thread", async () => {
    const { turn, messages, agents } = await exhaustedThread();
    await turn("quero um calendário completo");
    messages.seed([{
      type: "equipe_event",
      content: "Recebemos seu pedido sobre o plano. Uma pessoa vai falar com você em até 1 dia útil.",
      payload: { kind: "support_exception.opened" },
    }]);

    const events = await turn("ok, obrigado");

    expect(events.some((event) => event.type === "equipe_card")).toBe(false);
    expect(agents.tasks).toHaveLength(1);
    expect(messages.posts.at(-1)).toMatchObject({ type: "assistant" });
    expect(messages.posts.at(-1)?.content).toContain("quero assinar");
  });

  it("answers an attachment sent after the offer with the fixed reply, not the attachment refusal, and keeps the conversation closed", async () => {
    const { turn, messages, agents } = await exhaustedThread();
    await turn("quero um calendário completo");
    const fixed = replyText(await turn("oi"));

    const withImage = await turn("olha essa imagem", { attachments: [ATTACHMENT] });
    const imageOnly = await turn("", { attachments: [ATTACHMENT] });

    expect(fixed).toContain("Biblioteca");
    expect(replyText(withImage)).toBe(fixed);
    expect(replyText(imageOnly)).toBe(fixed);
    expect(cards(messages)).toHaveLength(1);
    // The gate was not consulted again, and the next short message is still answered by the fixed reply.
    expect(agents.tasks).toHaveLength(1);
    expect(replyText(await turn("e aí?"))).toBe(fixed);
    expect(agents.tasks).toHaveLength(1);
    // The message with the image keeps its metadata in the history.
    expect(messages.posts.find((post) => post.content === "olha essa imagem")?.payload).toEqual({ attachments: [ATTACHMENT] });
  });

  it("answers typed approval wording after the offer with the fixed reply too", async () => {
    const { turn, agents } = await exhaustedThread();
    await turn("quero um calendário completo");
    const fixed = replyText(await turn("oi"));

    const events = await turn("aprovado!");

    expect(replyText(events)).toBe(fixed);
    expect(agents.tasks).toHaveLength(1);
  });

  it("still brings the card back for an explicit request that comes with an attachment", async () => {
    const { turn, messages } = await exhaustedThread();
    await turn("quero um calendário completo");
    await turn("oi");

    const events = await turn("quero assinar", { attachments: [ATTACHMENT] });

    expect(events.filter((event) => event.type === "equipe_card")).toHaveLength(1);
    expect(cards(messages)).toHaveLength(2);
  });

  it("offers once when two tabs are refused at the same time", async () => {
    const { turn, messages, agents } = await exhaustedThread();

    const [tabA, tabB] = await Promise.all([turn("quero um calendário completo"), turn("me ajuda com o mês")]);

    // Both reached the gate before either offer existed…
    expect(agents.tasks).toHaveLength(2);
    // …and only one card came out; the other tab got the fixed reply.
    expect(cards(messages)).toHaveLength(1);
    expect([...tabA, ...tabB].filter((event) => event.type === "equipe_card")).toHaveLength(1);
    expect([replyText(tabA), replyText(tabB)].filter(Boolean)).toHaveLength(1);
    expect(tabA.at(-1)?.type).toBe("done");
    expect(tabB.at(-1)?.type).toBe("done");
  });

  it("does not offer again when the earlier offer is older than the history window", async () => {
    const { turn, messages, agents } = await exhaustedThread();
    messages.seed([
      { type: "equipe_card", content: "ADScale para a sua marca", payload: { kind: "plan_offer", title: "ADScale para a sua marca", items: [] } },
      ...Array.from({ length: 25 }, (_, index) => ({ type: index % 2 ? "assistant" : "user", content: `conversa ${index}` })),
    ]);

    const events = await turn("e aí?");

    expect(agents.tasks).toHaveLength(1);
    expect(events.some((event) => event.type === "equipe_card")).toBe(false);
    expect(cards(messages)).toHaveLength(0);
    expect(replyText(events)).toContain("quero assinar");
  });

  it("does not stack a second card on an offer the strategist already made", async () => {
    const { turn, messages, agents } = await exhaustedThread();
    messages.seed([
      { type: "user", content: "quero um calendário completo" },
      { type: "equipe_card", content: "ADScale para a sua marca", payload: { kind: "plan_offer", title: "ADScale para a sua marca", items: [] } },
    ]);

    const events = await turn("e aí?");

    expect(events.some((event) => event.type === "equipe_card")).toBe(false);
    expect(cards(messages)).toHaveLength(0);
    expect(agents.tasks).toHaveLength(1);
    expect(messages.posts.at(-1)).toMatchObject({ type: "assistant" });
    expect(messages.posts.at(-1)?.content).toContain("quero assinar");
  });

  it("keeps using the strategist while the budget lasts, even with an offer from the strategist in the thread", async () => {
    const { turn, messages, agents } = await exhaustedThread({ ok: true, output: { text: "Claro, seguimos no grátis." } });
    messages.seed([
      { type: "user", content: "quero um calendário completo" },
      { type: "equipe_card", content: "ADScale para a sua marca", payload: { kind: "plan_offer", title: "ADScale para a sua marca", items: [] } },
    ]);

    const events = await turn(DISMISS, { fromSuggestion: true });

    expect(agents.tasks).toHaveLength(1);
    expect(events.some((event) => event.type === "equipe_card")).toBe(false);
    expect(messages.posts.at(-1)).toMatchObject({ type: "assistant", content: "Claro, seguimos no grátis." });
  });

  it("goes back to the strategist once the account is no longer free", async () => {
    const { t, ids } = await setup();
    const messages = new ThreadWriter();
    messages.seed([
      { type: "user", content: "quero um calendário completo" },
      { type: "equipe_card", content: "ADScale para a sua marca", payload: { kind: "plan_offer", reason: "free_budget_exhausted", title: "ADScale para a sua marca", items: [] } },
    ]);
    const agents = new RecordingAgents({ ok: true, output: { text: "Boas-vindas ao plano!" } });

    await collect(runEquipeStrategistTurn({
      deps: t.deps, agents, messages, workspaceId: ids.workspaceId, accountId: ids.accountId,
      threadId: "thread-1", userMessage: DISMISS, executionPausedMessage: "pausa",
    }));

    expect(agents.tasks).toHaveLength(1);
    expect(messages.posts.at(-1)).toMatchObject({ type: "assistant", content: "Boas-vindas ao plano!" });
  });
});

// A message that arrives with attachments keeps their metadata in the history —
// refused or not — so it is not a blank bubble after a reload and staff can see
// what was sent. The files themselves never reach the model.
// The credit ended BEFORE the diagnosis could be built (ticket 13, D-12): no diagnosis, and a model call would be refused the same way. The person is not
// left with nothing: the first message gets the plan card (the way to a person), every later one a fixed reply that does not claim a diagnosis exists.
describe("runEquipeStrategistTurn — the credit ended before the diagnosis (ticket 13, D-12)", () => {
  const JOB = { kind: "system", job: "equipe.handoff.diagnose" } as const;
  const DISMISS = "Continuar no grátis por enquanto";

  async function blockedThread(code = "budget_exceeded") {
    const { advancingClock, confirmedHandoff } = await import("../module/testing/diagnosis");
    const f = await confirmedHandoff(makeTestDeps());
    advancingClock(f.t);
    const failed = await executeCommand(f.t.deps, { actor: JOB, workspaceId: f.workspaceId, accountId: f.accountId }, { type: "diagnosis_fail", payload: { taskIntentId: f.taskIntentId, code } });
    if (!failed.ok) throw new Error(failed.error.code);
    const messages = new ThreadWriter();
    // The model would answer if it were asked: any call of it shows in agents.tasks.
    const agents = new RecordingAgents({ ok: true, output: { text: "o modelo respondeu" } });
    const turn = (userMessage: string, extra: { fromSuggestion?: boolean; locale?: string } = {}) => collect(runEquipeStrategistTurn({
      deps: f.t.deps, agents, messages, workspaceId: f.workspaceId, accountId: f.accountId, actor: f.approver,
      threadId: "thread-1", userMessage, executionPausedMessage: "pausa", ...extra,
    }));
    return { f, turn, messages, agents };
  }
  const cards = (messages: RecordingWriter) => messages.posts.filter((post) => post.type === "equipe_card");
  const replyText = (events: EquipeChatTurnEvent[]) => {
    const delta = events.find((event) => event.type === "text_delta");
    return delta?.type === "text_delta" ? delta.text : undefined;
  };

  it("the first message gets the plan card, marked with its reason, and the model is never asked", async () => {
    const { turn, messages, agents } = await blockedThread();
    const events = await turn("quero um calendário completo");
    expect(events.filter((event) => event.type === "equipe_card")).toHaveLength(1);
    expect(cards(messages)).toHaveLength(1);
    expect(cards(messages)[0]?.payload).toMatchObject({ kind: "plan_offer", reason: "diagnosis_budget_exceeded" });
    expect(agents.tasks).toHaveLength(0);
  });

  it("every later message gets one fixed reply that says the diagnosis was not built, with no card and no model", async () => {
    const { turn, messages, agents } = await blockedThread();
    await turn("oi");
    const replies: Array<string | undefined> = [];
    for (let index = 0; index < 8; index += 1) {
      const events = await turn(index === 0 ? DISMISS : `mensagem ${index}`, { fromSuggestion: index === 0 });
      expect(events.some((event) => event.type === "equipe_card")).toBe(false);
      replies.push(replyText(events));
    }
    expect(new Set(replies).size).toBe(1);
    const reply = replies[0]!;
    expect(reply).toContain("O crédito grátis de IA da sua conta acabou");
    expect(reply).toContain("não consegui montar o diagnóstico");
    expect(reply).toContain("Biblioteca");
    expect(reply).toContain("quero assinar");
    // It must not say what is false here: the other exhausted conversation tells that the diagnosis is available.
    expect(reply).not.toMatch(/O diagnóstico e a Biblioteca/);
    expect(reply).not.toMatch(/R\$|pri[cç]e|valor|mensal/i);
    expect(cards(messages)).toHaveLength(1);
    expect(agents.tasks).toHaveLength(0);
  });

  it.each(["quero assinar", "Quero assinar o plano", "gostaria de contratar"])("an explicit request (%s) brings the card back, with the same reason", async (request) => {
    const { turn, messages, agents } = await blockedThread();
    await turn("oi");
    await turn("mensagem qualquer");
    expect(cards(messages)).toHaveLength(1);
    const events = await turn(request);
    expect(events.filter((event) => event.type === "equipe_card")).toHaveLength(1);
    expect(cards(messages)).toHaveLength(2);
    expect(cards(messages)[1]?.payload).toMatchObject({ kind: "plan_offer", reason: "diagnosis_budget_exceeded" });
    expect(agents.tasks).toHaveLength(0);
  });

  describe("fixed lines: language and 'Agora não' (ticket 13, screen review T7 and T8)", () => {
    const LATER = "Agora não";
    const LATER_LINE = "Tudo bem. Quando quiser, é só dizer “quero assinar”.";
    const BLOCKED_LINE = "O crédito grátis de IA da sua conta acabou, então não consegui montar o diagnóstico. Sua conta e sua Biblioteca continuam disponíveis; para falar sobre o plano, é só dizer “quero assinar”.";

    it("answers 'Agora não' on the card with the line of its own: no card, no model, stored in pt-BR with its key", async () => {
      const { turn, messages, agents } = await blockedThread();
      await turn("oi");

      const events = await turn(LATER, { fromSuggestion: true });

      expect(events).toEqual([
        { type: "text_delta", text: LATER_LINE },
        { type: "done", assistantMessageId: `msg-${messages.posts.length}` },
      ]);
      expect(messages.posts.at(-1)).toEqual({ threadId: "thread-1", type: "assistant", content: LATER_LINE, payload: { fixedReply: "plan_later" } });
      expect(cards(messages)).toHaveLength(1);
      expect(agents.tasks).toHaveLength(0);
    });

    it("answers it too when it is the first thing said, without making the card", async () => {
      const { turn, messages, agents } = await blockedThread();

      const events = await turn(LATER, { fromSuggestion: true });

      expect(replyText(events)).toBe(LATER_LINE);
      expect(cards(messages)).toHaveLength(0);
      expect(agents.tasks).toHaveLength(0);
    });

    it("keeps saying that the diagnosis was not built after it, and 'quero assinar' brings the card back with its reason", async () => {
      const { turn, messages, agents } = await blockedThread();
      await turn("oi");
      await turn(LATER, { fromSuggestion: true });

      const next = await turn("faz um post pra mim");
      const reoffer = await turn("quero assinar");

      expect(replyText(next)).toBe(BLOCKED_LINE);
      expect(messages.posts.find((post) => post.content === BLOCKED_LINE)?.payload).toEqual({ fixedReply: "diagnosis_budget_exceeded" });
      expect(reoffer.filter((event) => event.type === "equipe_card")).toHaveLength(1);
      expect(cards(messages)[1]?.payload).toMatchObject({ kind: "plan_offer", reason: "diagnosis_budget_exceeded" });
      expect(agents.tasks).toHaveLength(0);
    });

    it("streams both lines in the language of the request and stores them once, in pt-BR", async () => {
      const { turn, messages } = await blockedThread();
      await turn("oi", { locale: "en" });

      const later = await turn("Not now", { fromSuggestion: true, locale: "en" });
      const next = await turn("what now?", { locale: "en" });

      expect(replyText(later)).toBe("That's fine. Whenever you want, just say “I want to subscribe”.");
      expect(replyText(next)).toBe("The free AI credit on your account ran out, so I could not build the diagnosis. Your account and Library are still available; to talk about the plan, just say “I want to subscribe”.");
      expect(messages.posts.filter((post) => post.type === "assistant").map((post) => post.content)).toEqual([LATER_LINE, BLOCKED_LINE]);
    });

    it("an English request for the plan brings the card back", async () => {
      const { turn, messages } = await blockedThread();
      await turn("oi", { locale: "en" });
      await turn("what now?", { locale: "en" });

      const events = await turn("I want to subscribe", { locale: "en" });

      expect(events.filter((event) => event.type === "equipe_card")).toHaveLength(1);
      expect(cards(messages)).toHaveLength(2);
    });
  });

  it("two turns racing on the thread bring ONE card: the second ends on the fixed reply", async () => {
    const { turn, messages, agents } = await blockedThread();
    const [first, second] = await Promise.all([turn("oi"), turn("olá")]);
    expect(cards(messages)).toHaveLength(1);
    const texts = [first, second].map(replyText);
    expect(texts.filter(Boolean)).toHaveLength(1);
    expect(texts.find(Boolean)).toContain("não consegui montar o diagnóstico");
    expect(agents.tasks).toHaveLength(0);
  });

  it.each(["provider_error", "model_truncated", "diagnosis_invalid", "model_refused", "diagnosis_unavailable"])(
    "a final failure that is not about the credit (%s) leaves the chat as it was: the model is asked, no plan card", async (code) => {
      const { turn, messages, agents } = await blockedThread(code);
      const events = await turn("oi");
      expect(agents.tasks).toHaveLength(1);
      expect(events.some((event) => event.type === "equipe_card")).toBe(false);
      expect(cards(messages)).toHaveLength(0);
    });

  it("an account that is no longer free is not answered by this: the model path runs as it always did", async () => {
    const { f, turn, messages, agents } = await blockedThread();
    await f.t.deps.uow.repos.accounts.update(f.workspaceId, f.accountId, { status: "active" });
    await turn("oi");
    expect(agents.tasks).toHaveLength(1);
    expect(cards(messages)).toHaveLength(0);
  });

  it("a diagnosis that is already recorded keeps the other exhausted conversation, not this one", async () => {
    const { f, turn, messages, agents } = await blockedThread();
    await f.t.deps.uow.repos.events.create(f.scope, {
      actorType: "system", actorId: "diag", actorRole: "system", eventType: DIAGNOSTIC_RECORDED_EVENT, payload: { documentId: uuid() }, occurredAt: new Date(),
    });
    const events = await turn("oi");
    expect(cards(messages).some((post) => (post.payload as { reason?: string }).reason === "diagnosis_budget_exceeded")).toBe(false);
    expect(agents.tasks).toHaveLength(1); // the model is asked; its refusal is told by the strategist path, as before
    expect(events.length).toBeGreaterThan(0);
  });
});

describe("runEquipeStrategistTurn — attachments stay in the history", () => {
  async function run(input: { account: "free" | "paid"; userMessage: string; attachments?: typeof ATTACHMENT[]; fromSuggestion?: boolean }) {
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "Recebi." } });
    const scope = input.account === "free" ? await freeAccount() : await setup().then(({ t, ids }) => ({ t, ...ids }));
    await collect(runEquipeStrategistTurn({
      deps: scope.t.deps, agents, messages, workspaceId: scope.workspaceId, accountId: scope.accountId,
      threadId: "thread-1", executionPausedMessage: "pausa",
      userMessage: input.userMessage, attachments: input.attachments, fromSuggestion: input.fromSuggestion,
    }));
    return { messages, agents };
  }

  it("persists the metadata of a paid account's message and never sends it to the strategist", async () => {
    const { messages, agents } = await run({ account: "paid", userMessage: "veja a imagem", attachments: [ATTACHMENT] });

    expect(messages.posts[0]).toMatchObject({ type: "user", content: "veja a imagem", payload: { attachments: [ATTACHMENT] } });
    const sent = JSON.stringify(agents.tasks[0]?.input);
    for (const reference of [ATTACHMENT.assetId, ATTACHMENT.key, ATTACHMENT.url, ATTACHMENT.name]) {
      expect(sent).not.toContain(reference);
    }
  });

  it("keeps fromSuggestion next to the attachments", async () => {
    const { messages } = await run({ account: "free", userMessage: "me explica a imagem", attachments: [ATTACHMENT], fromSuggestion: true });

    expect(messages.posts[0]?.payload).toEqual({ attachments: [ATTACHMENT], fromSuggestion: true });
  });

  it("gives an attachment-only message a text, one per image count", async () => {
    const one = await run({ account: "free", userMessage: "", attachments: [ATTACHMENT] });
    const two = await run({ account: "free", userMessage: "", attachments: [ATTACHMENT, { ...ATTACHMENT, assetId: "00000000-0000-4000-8000-000000000002", name: "outra.png" }] });

    expect(one.messages.posts[0]).toMatchObject({ type: "user", content: "Imagem anexada" });
    expect(two.messages.posts[0]).toMatchObject({ type: "user", content: "Imagens anexadas" });
  });

  it("posts a plain message, with no payload, when there is nothing to keep", async () => {
    const { messages } = await run({ account: "paid", userMessage: "oi" });

    expect(messages.posts[0]).toEqual({ threadId: "thread-1", type: "user", content: "oi" });
  });
});

// A suggestion is a conversation starter. Whatever its wording, clicking it must
// never reach the approval turn: approval comes from typed text or from the card.
describe("runEquipeStrategistTurn — suggestion clicks never approve", () => {
  async function pendingBatch() {
    const { t, ids } = await setup();
    await deliverTestBatch(t, ids, { title: "Calendário 23–27/11" });
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "Posso explicar o calendário." } });
    const turn = (userMessage: string, extra: { fromSuggestion?: boolean } = {}) => collect(runEquipeStrategistTurn({
      deps: t.deps, agents, messages, workspaceId: ids.workspaceId, accountId: ids.accountId,
      threadId: "thread-1", userMessage, executionPausedMessage: "pausa", ...extra,
    }));
    return { turn, messages, agents };
  }

  it.each(["ok, pode postar", "Aprovado"])(
    "answers %p from a suggestion click like any message: no approval card, the strategist replies",
    async (text) => {
      const { turn, messages, agents } = await pendingBatch();

      const events = await turn(text, { fromSuggestion: true });

      expect(events.some((event) => event.type === "equipe_card")).toBe(false);
      expect(agents.tasks).toHaveLength(1);
      expect(messages.posts.map((post) => post.type)).toEqual(["user", "assistant"]);
      expect(messages.posts[0]).toMatchObject({ content: text, payload: { fromSuggestion: true } });
    },
  );

  it.each(["ok, pode postar", "Aprovado"])(
    "still answers the typed %p with the pending card",
    async (text) => {
      const { turn, agents } = await pendingBatch();

      const events = await turn(text);

      expect(events.find((event) => event.type === "equipe_card")).toMatchObject({ card: { kind: "batch" } });
      expect(agents.tasks).toHaveLength(0);
    },
  );

});

// Ticket 02: history read before posting, suggestion round-tripping, and the
// plan-offer card on budget exhaustion. See fluxo-0/tickets/02-estrategista.
describe("runEquipeStrategistTurn — history and iscas (ticket 02)", () => {
  it("reads history via writer.list(threadId, {limit: 20}) before posting the current message", async () => {
    const { t, ids } = await setup();
    const messages = new RecordingWriter();
    const order: string[] = [];
    const originalList = messages.list.bind(messages);
    vi.spyOn(messages, "list").mockImplementation(async (...args) => {
      order.push("list");
      return originalList(...args);
    });
    const originalPost = messages.post.bind(messages);
    vi.spyOn(messages, "post").mockImplementation(async (input) => {
      order.push(`post:${input.type}`);
      return originalPost(input);
    });
    const agents = new RecordingAgents({ ok: true, output: { text: "Oi!" } });

    await collect(runEquipeStrategistTurn({
      deps: t.deps, agents, messages, workspaceId: ids.workspaceId, accountId: ids.accountId,
      threadId: "thread-1", userMessage: "quando chega o lote?", executionPausedMessage: "pausa",
    }));

    expect(messages.listCalls).toEqual([{ threadId: "thread-1", options: { limit: 20 } }]);
    expect(order[0]).toBe("list");
    expect(order[1]).toBe("post:user");
  });

  it("forwards prior history to the strategist as {role, content}, mapping user vs. everything else", async () => {
    const { t, ids } = await setup();
    const messages = new RecordingWriter();
    messages.seedHistory([
      { type: "user", content: "oi", payload: {} },
      { type: "assistant", content: "Olá! Como posso ajudar?", payload: {} },
      {
        // Whitespace/newlines inside the source content must collapse to a
        // single safe line before it ever reaches the model.
        type: "equipe_card", content: "Lote pronto\n  com   duas entregas",
        payload: { kind: "batch", title: "Calendário 23–27/11", items: [{ itemId: "i1", versionHash: "h1" }] },
      },
    ]);
    const agents = new RecordingAgents({ ok: true, output: { text: "O lote chega amanhã." } });

    await collect(runEquipeStrategistTurn({
      deps: t.deps, agents, messages, workspaceId: ids.workspaceId, accountId: ids.accountId,
      threadId: "thread-1", userMessage: "quando chega o lote?", executionPausedMessage: "pausa",
    }));

    expect(agents.tasks[0]?.input).toMatchObject({ message: "quando chega o lote?" });
    const history = (agents.tasks[0]?.input as { history?: Array<{ role: string; content: string }> }).history;
    expect(history).toHaveLength(3);
    expect(history?.[0]).toEqual({ role: "user", content: "oi" });
    expect(history?.[1]).toEqual({ role: "assistant", content: "Olá! Como posso ajudar?" });
    // Non-text history (a card) never reaches the model as raw payload JSON —
    // it collapses to one safe line the strategist can read as context.
    const cardLine = history?.[2];
    expect(cardLine?.role).toBe("assistant");
    expect(cardLine?.content).not.toContain('"kind"');
    expect(cardLine?.content).not.toContain('"items"');
    expect(cardLine?.content.length).toBeLessThan(200);
    // Whitespace normalization: a single safe line, no raw newlines/runs of spaces.
    expect(cardLine?.content).not.toMatch(/\n/);
    expect(cardLine?.content).not.toMatch(/ {2,}/);
    expect(cardLine?.content).toContain("Lote pronto com duas entregas");
  });

  it("passes fromSuggestion through to the posted user message payload", async () => {
    const { t, ids } = await setup();
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "Claro, te explico." } });

    await collect(runEquipeStrategistTurn({
      deps: t.deps, agents, messages, workspaceId: ids.workspaceId, accountId: ids.accountId,
      threadId: "thread-1", userMessage: "Me explica a oportunidade 2", executionPausedMessage: "pausa",
      fromSuggestion: true,
    }));

    const userPost = messages.posts.find((post) => post.type === "user");
    expect(userPost?.payload).toMatchObject({ fromSuggestion: true });
  });

  it("persists only the valid suggestions (1–3, ≤60 chars, never approving) in payload.suggestions", async () => {
    const { t, ids } = await setup();
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({
      ok: true,
      output: {
        text: "Aqui está o resumo.",
        suggestions: [
          "ok pode postar",
          "Confirmado, está correto",
          "Autorizada a publicação",
          "Aprovação confirmada para o lote",
          "Confirmadas as mudanças",
          "Autorização para publicar",
          "Approved for publication",
          "Confirmed, that's correct",
          "Authorized to publish",
          "Aprove o calendário",
          "Publique agora",
          "Autorize a publicação",
          "Aprovem o calendário",
          "Publiquem agora",
          "Autorizem a publicação",
          "Confirme o calendário",
          "Confirmem o calendário",
          "Me explica a oportunidade 2",
          "x".repeat(70),
          "Quero aproveitar as oportunidades",
          "quarta ficaria de fora",
        ],
      },
    });

    await collect(runEquipeStrategistTurn({
      deps: t.deps, agents, messages, workspaceId: ids.workspaceId, accountId: ids.accountId,
      threadId: "thread-1", userMessage: "Como está minha marca?", executionPausedMessage: "pausa",
    }));

    const assistant = messages.posts.find((post) => post.type === "assistant");
    expect(assistant?.payload).toMatchObject({
      suggestions: ["Me explica a oportunidade 2", "Quero aproveitar as oportunidades", "quarta ficaria de fora"],
    });
  });

  it("posts a plain answer with no suggestions key when the model suggests none", async () => {
    const { t, ids } = await setup();
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "Tudo certo por aqui." } });

    await collect(runEquipeStrategistTurn({
      deps: t.deps, agents, messages, workspaceId: ids.workspaceId, accountId: ids.accountId,
      threadId: "thread-1", userMessage: "oi", executionPausedMessage: "pausa",
    }));

    const assistant = messages.posts.find((post) => post.type === "assistant");
    expect(assistant?.content).toBe("Tudo certo por aqui.");
    expect((assistant?.payload as { suggestions?: unknown[] } | undefined)?.suggestions ?? []).toEqual([]);
  });

  it("answers with the plan_offer card (never provider text) once budget is exhausted AFTER the diagnostic", async () => {
    const free = await freeAccount();
    const scope = { workspaceId: free.workspaceId, accountId: free.accountId };
    await completeHandoff(free.t, free.workspaceId, free.accountId);
    await free.t.deps.uow.repos.events.create(scope, {
      actorType: "system", actorId: "diag", actorRole: "system",
      eventType: DIAGNOSTIC_RECORDED_EVENT, payload: { documentId: uuid() }, occurredAt: new Date(),
    });
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: false, error: BUDGET_EXCEEDED_ERROR });

    const events = await collect(runEquipeStrategistTurn({
      deps: free.t.deps, agents, messages, ...scope,
      threadId: "thread-1", userMessage: "quero um calendário completo", executionPausedMessage: "pausa",
    }));

    const card = events.find((event) => event.type === "equipe_card");
    expect(card).toBeDefined();
    if (card?.type !== "equipe_card") return;
    expect(card.card).toMatchObject({ kind: "plan_offer", accountId: free.accountId });
    const posted = messages.posts.find((post) => post.type === "equipe_card");
    expect(posted?.payload).toMatchObject({ kind: "plan_offer" });
  });

  it("output.planOffered only posts the plan_offer card AFTER the diagnostic — never before, even if the strategist says so", async () => {
    const before = await freeAccount();
    await completeHandoff(before.t, before.workspaceId, before.accountId);
    const beforeMessages = new RecordingWriter();
    const beforeAgents = new RecordingAgents({ ok: true, output: { text: "Aqui está o plano!", planOffered: true } });
    const beforeEvents = await collect(runEquipeStrategistTurn({
      deps: before.t.deps, agents: beforeAgents, messages: beforeMessages,
      workspaceId: before.workspaceId, accountId: before.accountId,
      threadId: "thread-1", userMessage: "quero o plano", executionPausedMessage: "pausa",
    }));
    expect(beforeEvents.some((event) => event.type === "equipe_card")).toBe(false);
    expect(beforeMessages.posts.find((post) => post.type === "assistant")?.content).toBe("Aqui está o plano!");

    const after = await freeAccount();
    const afterScope = { workspaceId: after.workspaceId, accountId: after.accountId };
    await completeHandoff(after.t, after.workspaceId, after.accountId);
    await after.t.deps.uow.repos.events.create(afterScope, {
      actorType: "system", actorId: "diag", actorRole: "system",
      eventType: DIAGNOSTIC_RECORDED_EVENT, payload: { documentId: uuid() }, occurredAt: new Date(),
    });
    const afterMessages = new RecordingWriter();
    const afterAgents = new RecordingAgents({ ok: true, output: { text: "Aqui está o plano!", planOffered: true } });
    const afterEvents = await collect(runEquipeStrategistTurn({
      deps: after.t.deps, agents: afterAgents, messages: afterMessages, ...afterScope,
      threadId: "thread-1", userMessage: "quero o plano", executionPausedMessage: "pausa",
    }));
    const card = afterEvents.find((event) => event.type === "equipe_card");
    expect(card).toBeDefined();
    if (card?.type !== "equipe_card") return;
    expect(card.card).toMatchObject({ kind: "plan_offer" });
  });

  it("never offers the plan on budget exhaustion BEFORE the diagnostic is recorded", async () => {
    const free = await freeAccount();
    await completeHandoff(free.t, free.workspaceId, free.accountId);
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: false, error: BUDGET_EXCEEDED_ERROR });

    const events = await collect(runEquipeStrategistTurn({
      deps: free.t.deps, agents, messages, workspaceId: free.workspaceId, accountId: free.accountId,
      threadId: "thread-1", userMessage: "quero um calendário completo", executionPausedMessage: "pausa",
    }));

    expect(events.some((event) => event.type === "equipe_card")).toBe(false);
    const assistant = messages.posts.find((post) => post.type === "assistant");
    // Free-account copy, distinct from the paid "limite de IA" message —
    // never mentions a plan/price before the diagnostic exists.
    expect(assistant?.content).toContain("Biblioteca");
    expect(assistant?.content).not.toMatch(/mensal|deste mês|reset/i);
    expect(assistant?.content).not.toMatch(/pri[cç]e|valor|R\$/i);
  });

  it("keeps the plain budget-exceeded text for PAID accounts (no plan card)", async () => {
    const { t, ids } = await setup();
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: false, error: BUDGET_EXCEEDED_ERROR });

    const events = await collect(runEquipeStrategistTurn({
      deps: t.deps, agents, messages, workspaceId: ids.workspaceId, accountId: ids.accountId,
      threadId: "thread-1", userMessage: "e aí?", executionPausedMessage: "pausa",
    }));

    expect(events.some((event) => event.type === "equipe_card")).toBe(false);
    const assistant = messages.posts.find((post) => post.type === "assistant");
    expect(assistant?.content).toContain("limite de IA");
  });

  it.each(["Analise esta imagem", ""])("refuses free attachments with a clear persisted answer and no AI call: %s", async (userMessage) => {
    const free = await freeAccount();
    await completeHandoff(free.t, free.workspaceId, free.accountId); // post-handoff rule; during the handoff see the ticket 04 block
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "must not run" } });
    const events = await collect(runEquipeStrategistTurn({
      deps: free.t.deps, agents, messages, workspaceId: free.workspaceId, accountId: free.accountId,
      threadId: "thread-1", userMessage, attachments: [ATTACHMENT], executionPausedMessage: "pausa",
    }));
    expect(agents.tasks).toHaveLength(0);
    // The person's message stays in the history with the validated attachment, never blank.
    expect(messages.posts[0]).toMatchObject({
      type: "user", content: userMessage || "Imagem anexada", payload: { attachments: [ATTACHMENT] },
    });
    const assistant = messages.posts.find((post) => post.type === "assistant");
    expect(assistant?.content).toMatch(/conta grátis.*imagens anexadas/);
    expect(assistant?.content).toContain("texto");
    expect(events).toEqual([
      { type: "text_delta", text: assistant?.content },
      { type: "done", assistantMessageId: "msg-2" },
    ]);
  });
});

describe("runEquipeStrategistTurn — a free brand of a paying workspace (spec 2026-10-07 §3)", () => {
  async function payingFreeAccount() {
    const free = await freeAccount();
    await completeHandoff(free.t, free.workspaceId, free.accountId);
    free.t.deps.hasClassicPaidAccess = async () => true;
    return free;
  }

  it("takes attachments to the strategist instead of refusing them", async () => {
    const free = await payingFreeAccount();
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "Vi a imagem." } });
    await collect(runEquipeStrategistTurn({
      deps: free.t.deps, agents, messages, workspaceId: free.workspaceId, accountId: free.accountId,
      threadId: "thread-1", userMessage: "Analise esta imagem", attachments: [ATTACHMENT], executionPausedMessage: "pausa",
    }));
    expect(agents.tasks).toHaveLength(1);
    expect(messages.posts.some((post) => /conta grátis/.test(post.content))).toBe(false);
  });

  it("answers an exceeded budget with the monthly line, never the plan card", async () => {
    const free = await payingFreeAccount();
    await free.t.deps.uow.repos.events.create({ workspaceId: free.workspaceId, accountId: free.accountId }, {
      actorType: "system", actorId: "diag", actorRole: "system", eventType: DIAGNOSTIC_RECORDED_EVENT, payload: { documentId: uuid() }, occurredAt: new Date(),
    });
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: false, error: BUDGET_EXCEEDED_ERROR });
    const events = await collect(runEquipeStrategistTurn({
      deps: free.t.deps, agents, messages, workspaceId: free.workspaceId, accountId: free.accountId,
      threadId: "thread-1", userMessage: "e aí?", executionPausedMessage: "pausa",
    }));
    expect(events.some((event) => event.type === "equipe_card")).toBe(false);
    expect(messages.posts.find((post) => post.type === "assistant")?.content).toContain("limite de IA deste mês");
  });

  it("ignores a plan offer from the model", async () => {
    const free = await payingFreeAccount();
    await free.t.deps.uow.repos.events.create({ workspaceId: free.workspaceId, accountId: free.accountId }, {
      actorType: "system", actorId: "diag", actorRole: "system", eventType: DIAGNOSTIC_RECORDED_EVENT, payload: { documentId: uuid() }, occurredAt: new Date(),
    });
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "Posso ajudar com a marca.", planOffered: true } });
    const events = await collect(runEquipeStrategistTurn({
      deps: free.t.deps, agents, messages, workspaceId: free.workspaceId, accountId: free.accountId,
      threadId: "thread-1", userMessage: "quero mais", executionPausedMessage: "pausa",
    }));
    expect(events.some((event) => event.type === "equipe_card")).toBe(false);
    expect(messages.posts.find((post) => post.type === "assistant")?.content).toBe("Posso ajudar com a marca.");
  });
});

// Ticket 04: while the brand handoff is in progress, the strategist never
// runs — the server answers with fixed copy and the current step's card. A
// source address/handle in the message is only ever applied by the approver,
// and only on the `source` step. See fluxo-0/handoff.
describe("runEquipeStrategistTurn — handoff (ticket 04)", () => {
  async function approverActor(t: TestDeps, workspaceId: string, accountId: string) {
    const [person] = await t.deps.uow.repos.people.list({ workspaceId, accountId });
    return { kind: "client_person", role: "approver", personId: person!.id } as const;
  }

  it("never calls the model while a source-step handoff is pending, even with an approving message", async () => {
    const { t, workspaceId, accountId } = await freeAccount();
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "must not run" } });

    const events = await collect(runEquipeStrategistTurn({
      deps: t.deps, agents, messages, workspaceId, accountId,
      threadId: "thread-1", userMessage: "ok, pode postar", executionPausedMessage: "pausa",
    }));

    expect(agents.tasks).toHaveLength(0);
    expect(events.some((e) => e.type === "equipe_card")).toBe(true);
    const assistant = messages.posts.find((post) => post.type === "assistant");
    expect(assistant?.content).toBe("Preciso de um site ou de um @ público para ler sua marca.");
  });

  it("answers attachments during the handoff with the fixed handoff copy and the step card, never the model nor the attachment refusal", async () => {
    const { t, workspaceId, accountId } = await freeAccount();
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "must not run" } });

    const events = await collect(runEquipeStrategistTurn({
      deps: t.deps, agents, messages, workspaceId, accountId,
      threadId: "thread-1", userMessage: "Analise esta imagem", attachments: [ATTACHMENT], executionPausedMessage: "pausa",
    }));

    expect(agents.tasks).toHaveLength(0);
    const assistant = messages.posts.find((post) => post.type === "assistant");
    expect(assistant?.content).toBe("Preciso de um site ou de um @ público para ler sua marca.");
    expect(events.find((e) => e.type === "equipe_card")).toMatchObject({ card: { kind: "handoff", step: "source" } });
  });

  it("never calls the model on any other handoff step, and ignores a URL in the message once past source", async () => {
    const { t, workspaceId, accountId } = await freeAccount();
    const approver = await approverActor(t, workspaceId, accountId);
    const scope = { workspaceId, accountId };
    const set = await executeCommand(t.deps, { actor: approver, workspaceId, accountId }, {
      type: "handoff_set_source", payload: { expectedStep: "source", expectedVersion: 1, kind: "site", value: "https://acme.com" },
    });
    if (!set.ok) throw new Error(set.error.code);

    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "must not run" } });
    const events = await collect(runEquipeStrategistTurn({
      deps: t.deps, agents, messages, workspaceId, accountId, actor: approver,
      threadId: "thread-1", userMessage: "tenta https://outro-site.com agora", executionPausedMessage: "pausa",
    }));

    expect(agents.tasks).toHaveLength(0);
    const [handoff] = await t.deps.uow.repos.handoffs.list(scope);
    // The message never reached handoff_set_source: still the same source and version.
    expect(handoff!.source).toMatchObject({ normalized: "https://acme.com/" });
    const assistant = messages.posts.find((post) => post.type === "assistant");
    expect(assistant?.content).toBe("Vamos terminar sua marca primeiro.");
    expect(events.find((e) => e.type === "equipe_card")).toMatchObject({ card: { kind: "handoff", step: "reading" } });
  });

  it("applies a source address from the message only for the approver; other actors fall back to the invalid-source copy", async () => {
    const { t, workspaceId, accountId } = await freeAccount();
    const operations = { kind: "staff", role: "operations", staffId: (await t.deps.uow.internal.staff.create({ role: "operations", displayName: "Ops", active: true })).id } as const;

    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "must not run" } });
    const events = await collect(runEquipeStrategistTurn({
      deps: t.deps, agents, messages, workspaceId, accountId, actor: operations,
      threadId: "thread-1", userMessage: "https://acme.com", executionPausedMessage: "pausa",
    }));

    expect(agents.tasks).toHaveLength(0);
    const [handoff] = await t.deps.uow.repos.handoffs.list({ workspaceId, accountId });
    expect(handoff!.step).toBe("source");
    expect(handoff!.source).toBeNull();
    const assistant = messages.posts.find((post) => post.type === "assistant");
    expect(assistant?.content).toBe("Confira o endereço ou @ público. Sua conta continua preservada.");
    expect(events.find((e) => e.type === "equipe_card")).toMatchObject({ card: { kind: "handoff", step: "source" } });
  });

  it("takes a copied Instagram profile link that carries share parameters as the source", async () => {
    const { t, workspaceId, accountId } = await freeAccount();
    const approver = await approverActor(t, workspaceId, accountId);
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "must not run" } });

    const events = await collect(runEquipeStrategistTurn({
      deps: t.deps, agents, messages, workspaceId, accountId, actor: approver,
      threadId: "thread-1", userMessage: "Meu perfil é https://www.instagram.com/acme.oficial/?igsh=MTIzNDU2 obrigado", executionPausedMessage: "pausa",
    }));

    expect(agents.tasks).toHaveLength(0);
    const [handoff] = await t.deps.uow.repos.handoffs.list({ workspaceId, accountId });
    expect(handoff!.source).toMatchObject({ kind: "instagram", normalized: "acme.oficial" });
    expect(handoff!.step).toBe("reading");
    expect(events.map((e) => e.type)).toEqual(["equipe_card", "done"]);
  });

  it("skips the source attempt entirely when no actor is given, even with a URL in the message", async () => {
    const { t, workspaceId, accountId } = await freeAccount();
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "must not run" } });
    await collect(runEquipeStrategistTurn({
      deps: t.deps, agents, messages, workspaceId, accountId,
      threadId: "thread-1", userMessage: "https://acme.com", executionPausedMessage: "pausa",
    }));

    expect(agents.tasks).toHaveLength(0);
    const [handoff] = await t.deps.uow.repos.handoffs.list({ workspaceId, accountId });
    expect(handoff!.step).toBe("source");
    expect(handoff!.source).toBeNull();
    const assistant = messages.posts.find((post) => post.type === "assistant");
    expect(assistant?.content).toBe("Preciso de um site ou de um @ público para ler sua marca.");
  });

  it("the approver setting a valid source answers with the reading card alone — no text_delta, no plain assistant post", async () => {
    const { t, workspaceId, accountId } = await freeAccount();
    const approver = await approverActor(t, workspaceId, accountId);
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "must not run" } });

    const events = await collect(runEquipeStrategistTurn({
      deps: t.deps, agents, messages, workspaceId, accountId, actor: approver,
      threadId: "thread-1", userMessage: "https://acme.com", executionPausedMessage: "pausa",
    }));

    expect(agents.tasks).toHaveLength(0);
    expect(events.map((e) => e.type)).toEqual(["equipe_card", "done"]);
    expect(events[0]).toMatchObject({ card: { kind: "handoff", step: "reading" } });
    // The card is projected straight from the command's own transaction
    // (conversation-events.ts), not posted through the chat writer: only the
    // user's own message goes through `messages`.
    expect(messages.posts.map((post) => post.type)).toEqual(["user"]);
    // The open_free_account command also projects its own source-step card;
    // the one from THIS turn is the one carrying the reading step.
    const projected = [...t.store.assistantMessages.rows.values()]
      .find((row) => row.type === "equipe_card" && (row.payload as { step?: string } | undefined)?.step === "reading");
    expect(projected?.payload).toMatchObject({ kind: "handoff", step: "reading" });
    const [handoff] = await t.deps.uow.repos.handoffs.list({ workspaceId, accountId });
    expect(handoff!.step).toBe("reading");
  });

  it("the approver with an unparsable address falls back to the invalid-source copy, and nothing changes", async () => {
    const { t, workspaceId, accountId } = await freeAccount();
    const approver = await approverActor(t, workspaceId, accountId);
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "must not run" } });

    const events = await collect(runEquipeStrategistTurn({
      deps: t.deps, agents, messages, workspaceId, accountId, actor: approver,
      threadId: "thread-1", userMessage: "http://127.0.0.1", executionPausedMessage: "pausa",
    }));

    expect(agents.tasks).toHaveLength(0);
    const assistant = messages.posts.find((post) => post.type === "assistant");
    expect(assistant?.content).toBe("Confira o endereço ou @ público. Sua conta continua preservada.");
    const [handoff] = await t.deps.uow.repos.handoffs.list({ workspaceId, accountId });
    expect(handoff!.step).toBe("source");
    expect(events.find((e) => e.type === "equipe_card")).toMatchObject({ card: { kind: "handoff", step: "source" } });
  });

  it("the approver hitting the reading limit while back on the source step sees the limit copy", async () => {
    const { t, workspaceId, accountId } = await freeAccount();
    const approver = await approverActor(t, workspaceId, accountId);
    const scope = { workspaceId, accountId };
    const [row] = await t.deps.uow.repos.handoffs.list(scope);
    await t.deps.uow.repos.handoffs.update(scope, row!.id, { readsUsed: 3 });

    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "must not run" } });
    await collect(runEquipeStrategistTurn({
      deps: t.deps, agents, messages, workspaceId, accountId, actor: approver,
      threadId: "thread-1", userMessage: "https://acme.com", executionPausedMessage: "pausa",
    }));

    expect(agents.tasks).toHaveLength(0);
    const assistant = messages.posts.find((post) => post.type === "assistant");
    expect(assistant?.content).toBe("Você usou as 3 leituras. Sua conta e o que já foi lido continuam disponíveis.");
    const [handoff] = await t.deps.uow.repos.handoffs.list(scope);
    expect(handoff!.step).toBe("source");
    expect(handoff!.readsUsed).toBe(3);
  });

  it("localizes the fixed copy to English via locale, still without any model call", async () => {
    const { t, workspaceId, accountId } = await freeAccount();
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "must not run" } });

    await collect(runEquipeStrategistTurn({
      deps: t.deps, agents, messages, workspaceId, accountId, locale: "en-US",
      threadId: "thread-1", userMessage: "hi there", executionPausedMessage: "pausa",
    }));

    expect(agents.tasks).toHaveLength(0);
    const assistant = messages.posts.find((post) => post.type === "assistant");
    expect(assistant?.content).toBe("I need a website or public Instagram handle to read your brand.");
  });

  it("resumes normal strategist behavior, model included, once the handoff is done", async () => {
    const { t, workspaceId, accountId } = await freeAccount();
    await t.deps.uow.repos.handoffs.update({ workspaceId, accountId }, (await t.deps.uow.repos.handoffs.list({ workspaceId, accountId }))[0]!.id, { step: "done" });

    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "Oi! Como posso ajudar?" } });
    const events = await collect(runEquipeStrategistTurn({
      deps: t.deps, agents, messages, workspaceId, accountId,
      threadId: "thread-1", userMessage: "oi", executionPausedMessage: "pausa",
    }));

    expect(agents.tasks).toHaveLength(1);
    expect(events).toEqual([
      { type: "text_delta", text: "Oi! Como posso ajudar?" },
      { type: "done", assistantMessageId: "msg-2" },
    ]);
  });
});

// Ticket 08: the diagnosis card's iscas ("Tentar de novo", "Corrigir ou
// acrescentar meu site ou @") come back as messages. The server answers them
// itself — a command, a fixed text or the source card — and never calls a model.
describe("runEquipeStrategistTurn — diagnosis iscas (ticket 08)", () => {
  const RETRY = "Tentar de novo";
  const CORRECT = "Corrigir ou acrescentar meu site ou @";
  const JOB = { kind: "system", job: "equipe.handoff.diagnose" } as const;

  async function confirmed(options: { site?: string | null; instagram?: null; readsUsed?: number } = {}) {
    const { advancingClock, confirmedHandoff } = await import("../module/testing/diagnosis");
    const f = await confirmedHandoff(makeTestDeps(), options);
    advancingClock(f.t); // chained intents must keep their order under the frozen test clock
    return f;
  }
  const command = (f: Awaited<ReturnType<typeof confirmed>>, actor: Parameters<typeof executeCommand>[1]["actor"], type: string, payload: Record<string, unknown>) =>
    executeCommand(f.t.deps, { actor, workspaceId: f.workspaceId, accountId: f.accountId }, { type, payload } as never);
  const failRun = (f: Awaited<ReturnType<typeof confirmed>>, taskIntentId = f.taskIntentId, code = "provider_error") =>
    command(f, JOB, "diagnosis_fail", { taskIntentId, code });
  const intents = async (f: Awaited<ReturnType<typeof confirmed>>) =>
    (await f.t.deps.uow.repos.events.list(f.scope, { eventType: "task.requested" })).filter(e => (e.payload as { eventName: string }).eventName === "equipe.handoff.diagnose");
  async function turn(f: Awaited<ReturnType<typeof confirmed>>, userMessage: string, actor: unknown = f.approver) {
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "não deveria rodar" } });
    const events = await collect(runEquipeStrategistTurn({
      deps: f.t.deps, agents, messages, workspaceId: f.workspaceId, accountId: f.accountId,
      ...(actor ? { actor: actor as never } : {}), threadId: "thread-1", userMessage, executionPausedMessage: "pausa",
    }));
    return { messages, agents, events };
  }
  const assistantText = (messages: RecordingWriter) => messages.posts.find(post => post.type === "assistant")?.content;

  it.each([RETRY, "tentar de novo.", "TENTAR DE NOVO!", "  Tentar de novo  ", "tentar de nôvo"])("%p after a retryable failure runs diagnosis_retry without the model", async (text) => {
    const f = await confirmed();
    await failRun(f);
    const { messages, agents, events } = await turn(f, text);
    expect(agents.tasks).toHaveLength(0);
    expect(await intents(f)).toHaveLength(2);
    const reply = "Vou montar o diagnóstico de novo. Aviso quando estiver pronto.";
    expect(assistantText(messages)).toBe(reply);
    expect(events).toEqual([{ type: "text_delta", text: reply }, { type: "done", assistantMessageId: "msg-2" }]);
  });

  it("the ISCA is a message like any other: fromSuggestion is kept on the user post", async () => {
    const f = await confirmed();
    await failRun(f);
    const messages = new RecordingWriter();
    await collect(runEquipeStrategistTurn({
      deps: f.t.deps, agents: new RecordingAgents({ ok: true, output: { text: "x" } }), messages, workspaceId: f.workspaceId, accountId: f.accountId,
      actor: f.approver, threadId: "thread-1", userMessage: RETRY, fromSuggestion: true, executionPausedMessage: "pausa",
    }));
    expect(messages.posts[0]).toMatchObject({ type: "user", content: RETRY, payload: { fromSuggestion: true } });
  });

  it("clicking the same isca twice does not spend a second retry", async () => {
    const f = await confirmed();
    await failRun(f);
    await turn(f, RETRY);
    const second = await turn(f, RETRY);
    expect(await intents(f)).toHaveLength(2);
    expect(second.agents.tasks).toHaveLength(0);
    expect(assistantText(second.messages)).toBe("O diagnóstico não está com falha agora, então não há o que tentar de novo.");
  });

  it("without a failure there is nothing to retry: fixed answer, no intent, no model", async () => {
    const f = await confirmed();
    const { messages, agents } = await turn(f, RETRY);
    expect(agents.tasks).toHaveLength(0);
    expect(await intents(f)).toHaveLength(1);
    expect(assistantText(messages)).toBe("O diagnóstico não está com falha agora, então não há o que tentar de novo.");
  });

  it("stops at the retry limit with the fixed 'cannot' copy", async () => {
    const f = await confirmed();
    let intent = f.taskIntentId;
    for (let n = 1; n < 3; n++) {
      await failRun(f, intent);
      const { messages } = await turn(f, RETRY);
      expect(assistantText(messages)).toContain("Vou montar");
      intent = (await intents(f)).at(-1)!.id;
    }
    await failRun(f, intent);
    const { messages, agents } = await turn(f, RETRY);
    expect(assistantText(messages)).toBe("Não consigo tentar de novo por aqui. Sua conta e sua Biblioteca continuam disponíveis.");
    expect(agents.tasks).toHaveLength(0);
    expect(await intents(f)).toHaveLength(3);
  });

  it("a non-retryable failure gets the fixed 'cannot' copy", async () => {
    const f = await confirmed();
    await failRun(f, f.taskIntentId, "budget_exceeded");
    const { messages } = await turn(f, RETRY);
    expect(assistantText(messages)).toBe("Não consigo tentar de novo por aqui. Sua conta e sua Biblioteca continuam disponíveis.");
    expect(await intents(f)).toHaveLength(1);
  });

  it("'Corrigir ou acrescentar…' after an insufficient diagnosis reopens the source and answers with the source card", async () => {
    const f = await confirmed({ site: "Café Aurora. Torra própria.", instagram: null });
    await command(f, JOB, "diagnosis_claim", { taskIntentId: f.taskIntentId });
    await command(f, JOB, "diagnosis_record", { taskIntentId: f.taskIntentId, output: null, model: null, promptVersion: null });
    const { messages, agents, events } = await turn(f, CORRECT);
    expect(agents.tasks).toHaveLength(0);
    expect(events.map(event => event.type)).toEqual(["equipe_card", "done"]);
    expect(events[0]).toMatchObject({ card: { kind: "handoff", step: "source", handoffId: f.handoffId } });
    expect(messages.posts.map(post => post.type)).toEqual(["user"]); // the card is projected by the command itself
    expect((await f.t.deps.uow.repos.handoffs.list(f.scope))[0]!.step).toBe("source");
  });

  it("'Corrigir…' outside an insufficient diagnosis gets the fixed copy and changes nothing", async () => {
    const f = await confirmed();
    const { messages, agents } = await turn(f, CORRECT);
    expect(agents.tasks).toHaveLength(0);
    expect(assistantText(messages)).toBe("A fonte só pode ser corrigida quando o diagnóstico pede mais conteúdo.");
    expect((await f.t.deps.uow.repos.handoffs.list(f.scope))[0]!.step).toBe("done");
  });

  it("'Corrigir…' without readings left gets the 'cannot' copy", async () => {
    const f = await confirmed({ site: "Café Aurora. Torra própria.", instagram: null, readsUsed: 3 });
    await command(f, JOB, "diagnosis_claim", { taskIntentId: f.taskIntentId });
    await command(f, JOB, "diagnosis_record", { taskIntentId: f.taskIntentId, output: null, model: null, promptVersion: null });
    const { messages } = await turn(f, CORRECT);
    expect(assistantText(messages)).toBe("Não consigo tentar de novo por aqui. Sua conta e sua Biblioteca continuam disponíveis.");
    expect((await f.t.deps.uow.repos.handoffs.list(f.scope))[0]!.step).toBe("done");
  });

  it("without an actor (not the approver) the phrase is just a message: it reaches the strategist and changes nothing", async () => {
    const f = await confirmed();
    await failRun(f);
    const { agents } = await turn(f, RETRY, null);
    expect(agents.tasks).toHaveLength(1);
    expect(await intents(f)).toHaveLength(1);
  });

  it("another person (not the approver) cannot trigger the retry", async () => {
    const f = await confirmed();
    await failRun(f);
    const { agents } = await turn(f, RETRY, { kind: "client_person", role: "member", personId: "person-rui" });
    expect(agents.tasks).toHaveLength(0);
    expect(await intents(f)).toHaveLength(1);
  });

  it("while the brand is not confirmed the phrase is not intercepted: the handoff copy answers", async () => {
    const f = await confirmed();
    await failRun(f);
    await f.t.deps.uow.repos.handoffs.update(f.scope, f.handoffId, { step: "summary" });
    const { messages, agents } = await turn(f, RETRY);
    expect(agents.tasks).toHaveLength(0);
    expect(await intents(f)).toHaveLength(1);
    expect(assistantText(messages)).not.toContain("Vou montar");
  });

  it("a longer sentence that merely contains the phrase is not an isca", async () => {
    const f = await confirmed();
    await failRun(f);
    const { agents } = await turn(f, "você pode tentar de novo amanhã?");
    expect(agents.tasks).toHaveLength(1);
    expect(await intents(f)).toHaveLength(1);
  });
});

// Ticket 08 (round 2): reopening the source needs free balance for a reading + a diagnosis.
describe("runEquipeStrategistTurn — 'Corrigir…' and the free balance (ticket 08)", () => {
  const CORRECT = "Corrigir ou acrescentar meu site ou @";
  const JOB = { kind: "system", job: "equipe.handoff.diagnose" } as const;
  const SHORT = "Café Aurora. Torra própria.";

  async function insufficient(readsUsed = 1) {
    const { confirmedHandoff } = await import("../module/testing/diagnosis");
    const f = await confirmedHandoff(makeTestDeps(), { site: SHORT, instagram: null, readsUsed });
    await executeCommand(f.t.deps, { actor: JOB, workspaceId: f.workspaceId, accountId: f.accountId }, { type: "diagnosis_claim", payload: { taskIntentId: f.taskIntentId } });
    await executeCommand(f.t.deps, { actor: JOB, workspaceId: f.workspaceId, accountId: f.accountId },
      { type: "diagnosis_record", payload: { taskIntentId: f.taskIntentId, output: null, model: null, promptVersion: null } });
    return f;
  }
  async function turn(f: Awaited<ReturnType<typeof insufficient>>) {
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "não deveria rodar" } });
    const events = await collect(runEquipeStrategistTurn({
      deps: f.t.deps, agents, messages, workspaceId: f.workspaceId, accountId: f.accountId, actor: f.approver,
      threadId: "thread-1", userMessage: CORRECT, executionPausedMessage: "pausa",
    }));
    return { messages, agents, events };
  }
  const NO_BALANCE = "Seu saldo grátis de IA não cobre uma nova leitura e um novo diagnóstico. Sua conta e sua Biblioteca continuam disponíveis.";

  it("without enough balance: fixed text, then the plan card; no model, the handoff stays done", async () => {
    const f = await insufficient();
    f.t.deps.freeBudget = { remainingUsdCents: async () => 0 };
    const { messages, agents, events } = await turn(f);
    expect(agents.tasks).toHaveLength(0);
    expect(messages.posts.find(post => post.type === "assistant")?.content).toBe(NO_BALANCE);
    expect(events[0]).toEqual({ type: "text_delta", text: NO_BALANCE });
    expect(events.find(event => event.type === "equipe_card")).toMatchObject({ card: { kind: "plan_offer" } });
    expect(messages.posts.find(post => post.type === "equipe_card")?.payload).toMatchObject({ kind: "plan_offer" });
    const [handoff] = await f.t.deps.uow.repos.handoffs.list(f.scope);
    expect(handoff!.step).toBe("done");
    expect(await f.t.deps.uow.repos.events.list(f.scope, { eventType: "diagnosis.reopened" })).toHaveLength(0);
  });

  it("a reopened document at 'done' is the RESTORED state: the diagnosis counts, so the low-balance answer comes with the plan card", async () => {
    const f = await insufficient();
    const [doc] = (await f.t.deps.uow.repos.documents.list(f.scope)).filter(d => d.kind === "diagnosis");
    await f.t.deps.uow.repos.events.create(f.scope, { actorType: "system", actorId: "t", actorRole: "system", eventType: "diagnosis.reopened",
      payload: { documentId: doc!.id }, occurredAt: new Date() });
    f.t.deps.freeBudget = { remainingUsdCents: async () => 0 };
    const { messages, events, agents } = await turn(f);
    expect(agents.tasks).toHaveLength(0);
    expect(events.find(event => event.type === "equipe_card")).toMatchObject({ card: { kind: "plan_offer" } });
    expect(messages.posts.find(post => post.type === "assistant")?.content).toBe(NO_BALANCE);
  });

  it("the plan card only goes out when a diagnostic is recorded: a document without its diagnostic.recorded event gets no card", async () => {
    const f = await insufficient();
    for (const [id, event] of [...f.t.store.events.rows.entries()]) if (event.eventType === "diagnostic.recorded") f.t.store.events.rows.delete(id);
    expect(await (await import("./free-budget")).hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope)).toBe(false);
    f.t.deps.freeBudget = { remainingUsdCents: async () => 0 };
    const { messages, events, agents } = await turn(f);
    expect(agents.tasks).toHaveLength(0);
    expect(events.some(event => event.type === "equipe_card")).toBe(false);
    expect(messages.posts.find(post => post.type === "assistant")?.content).toBe(NO_BALANCE);
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });

  it("with readsUsed 2 and enough balance it reopens the source and answers with the source card", async () => {
    const f = await insufficient(2);
    const { messages, agents, events } = await turn(f);
    expect(agents.tasks).toHaveLength(0);
    expect(events.map(event => event.type)).toEqual(["equipe_card", "done"]);
    expect(events[0]).toMatchObject({ card: { kind: "handoff", step: "source" } });
    expect(messages.posts.map(post => post.type)).toEqual(["user"]);
    expect((await f.t.deps.uow.repos.handoffs.list(f.scope))[0]!.step).toBe("source");
  });

  it("without a free-budget reader (fail closed) it answers like a low balance", async () => {
    const f = await insufficient();
    delete f.t.deps.freeBudget;
    const { messages } = await turn(f);
    expect(messages.posts.find(post => post.type === "assistant")?.content).toBe(NO_BALANCE);
    expect((await f.t.deps.uow.repos.handoffs.list(f.scope))[0]!.step).toBe("done");
  });
});

// Ticket 08 (round 4): an accepted retry leaves a marker so the open conversation keeps polling until the card arrives.
describe("runEquipeStrategistTurn — retry marker (ticket 08)", () => {
  const RETRY = "Tentar de novo";
  const JOB = { kind: "system", job: "equipe.handoff.diagnose" } as const;

  async function confirmed(options: { site?: string | null; instagram?: null; readsUsed?: number } = {}) {
    const { advancingClock, confirmedHandoff } = await import("../module/testing/diagnosis");
    const f = await confirmedHandoff(makeTestDeps(), options);
    advancingClock(f.t);
    return f;
  }
  type F = Awaited<ReturnType<typeof confirmed>>;
  const failRun = (f: F, taskIntentId = f.taskIntentId, code = "provider_error") =>
    executeCommand(f.t.deps, { actor: JOB, workspaceId: f.workspaceId, accountId: f.accountId }, { type: "diagnosis_fail", payload: { taskIntentId, code } });
  async function turn(f: F, userMessage = RETRY) {
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "não deveria rodar" } });
    await collect(runEquipeStrategistTurn({
      deps: f.t.deps, agents, messages, workspaceId: f.workspaceId, accountId: f.accountId, actor: f.approver,
      threadId: "thread-1", userMessage, executionPausedMessage: "pausa",
    }));
    return messages.posts.filter(post => post.type === "assistant");
  }

  it("an accepted retry is confirmed with payload {diagnosis:'pending'}", async () => {
    const f = await confirmed();
    await failRun(f);
    const posts = await turn(f);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ content: "Vou montar o diagnóstico de novo. Aviso quando estiver pronto.", payload: { diagnosis: "pending" } });
  });

  it("the 'no failure to retry' answer carries no marker", async () => {
    const f = await confirmed();
    const [post] = await turn(f);
    expect(post!.content).toContain("não há o que tentar de novo");
    expect(post!.payload).toBeUndefined();
  });

  it("the retry-limit and non-retryable answers carry no marker", async () => {
    const limited = await confirmed();
    await failRun(limited, limited.taskIntentId, "budget_exceeded");
    const [post] = await turn(limited);
    expect(post!.content).toContain("Não consigo tentar de novo");
    expect(post!.payload).toBeUndefined();
  });

  it("the source-correction answers carry no marker (balance, state rules and the 'Corrigir…' card)", async () => {
    const CORRECT = "Corrigir ou acrescentar meu site ou @";
    const complete = await confirmed();
    const [post] = await turn(complete, CORRECT);
    expect(post!.content).toContain("A fonte só pode ser corrigida");
    expect(post!.payload).toBeUndefined();

    const low = await confirmed({ site: "Café Aurora. Torra própria.", instagram: null });
    await executeCommand(low.t.deps, { actor: JOB, workspaceId: low.workspaceId, accountId: low.accountId }, { type: "diagnosis_claim", payload: { taskIntentId: low.taskIntentId } });
    await executeCommand(low.t.deps, { actor: JOB, workspaceId: low.workspaceId, accountId: low.accountId },
      { type: "diagnosis_record", payload: { taskIntentId: low.taskIntentId, output: null, model: null, promptVersion: null } });
    low.t.deps.freeBudget = { remainingUsdCents: async () => 0 };
    const [noBalance] = await turn(low, CORRECT);
    expect(noBalance!.content).toContain("saldo grátis");
    expect(noBalance!.payload).toBeUndefined();
  });

  it("the marker makes the thread poll: a persisted retry confirmation after a failed card is 'pending'", async () => {
    const { threadAwaitsDiagnosis } = await import("@/lib/equipe/diagnosis-pending");
    const f = await confirmed();
    await failRun(f);
    const [post] = await turn(f);
    const thread = [
      { type: "equipe_card", payload: { kind: "diagnosis", status: "failed" }, createdAt: new Date(Date.now() - 60_000) },
      { type: "assistant", payload: post!.payload as Record<string, unknown>, createdAt: new Date() },
    ];
    expect(threadAwaitsDiagnosis(thread)).toBe(true);
  });
});

// Ticket 08 (round 5): the brand reading ran out of attempts after a correction (stuck) while the account
// already has a diagnosis: the chat says so honestly and offers the plan, still without a model call.
describe("runEquipeStrategistTurn — stuck brand reading with a restored diagnosis (ticket 08)", () => {
  const JOB = { kind: "system", job: "equipe.handoff.diagnose" } as const;
  const GROUPS = ["name", "logo", "colors", "fonts", "networks", "images"] as const;
  const run = (status: string) => ({ runId: uuid(), taskIntentId: uuid(), status });
  const terminal = Object.fromEntries(GROUPS.map(group => [group, run(group === "name" ? "failed" : "not_found")]));
  const LIMIT_PT = "Você usou as 3 leituras. Sua conta e o que já foi lido continuam disponíveis.";
  const LIMIT_EN = "You have used all 3 readings. Your account and captured brand remain available.";

  /** A free account with an insufficient diagnosis the approver sent back (diagnosis.reopened), then patched into `patch`. */
  async function reopened(patch: Record<string, unknown>, options: { diagnosis?: boolean } = {}) {
    const { advancingClock, confirmedHandoff } = await import("../module/testing/diagnosis");
    const f = await confirmedHandoff(makeTestDeps(), { site: "Café Aurora. Torra própria.", instagram: null });
    advancingClock(f.t);
    if (options.diagnosis !== false) {
      const system = { workspaceId: f.workspaceId, accountId: f.accountId, actor: JOB };
      await executeCommand(f.t.deps, system, { type: "diagnosis_claim", payload: { taskIntentId: f.taskIntentId } });
      await executeCommand(f.t.deps, system, { type: "diagnosis_record", payload: { taskIntentId: f.taskIntentId, output: null, model: null, promptVersion: null } });
      const out = await executeCommand(f.t.deps, { workspaceId: f.workspaceId, accountId: f.accountId, actor: f.approver }, { type: "diagnosis_correct_source", payload: {} });
      expect(out.ok).toBe(true);
    }
    await f.t.deps.uow.repos.handoffs.update(f.scope, f.handoffId, patch as never);
    return f;
  }
  type F = Awaited<ReturnType<typeof reopened>>;
  async function turn(f: F, userMessage = "oi, e agora?", extra: Record<string, unknown> = {}) {
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "não deveria rodar" } });
    const events = await collect(runEquipeStrategistTurn({
      deps: f.t.deps, agents, messages, workspaceId: f.workspaceId, accountId: f.accountId,
      threadId: "thread-1", userMessage, executionPausedMessage: "pausa", ...extra,
    } as never));
    return { messages, agents, events };
  }
  const stuck = { step: "reading", readsUsed: 3, reading: terminal };
  const kinds = (events: EquipeChatTurnEvent[]) => events.map(event => event.type === "equipe_card" ? `card:${(event.card as { kind: string }).kind}` : event.type);

  it("1. stuck + restored diagnosis: the 'limit' text, the step card and the plan card, in that order; no model", async () => {
    const f = await reopened(stuck);
    const { messages, agents, events } = await turn(f);
    expect(agents.tasks).toHaveLength(0);
    expect(kinds(events)).toEqual(["text_delta", "card:handoff", "card:plan_offer", "done"]);
    expect(events[0]).toEqual({ type: "text_delta", text: LIMIT_PT });
    expect(events[1]).toMatchObject({ card: { kind: "handoff", step: "reading" } });
    const plan = events[2] as Extract<EquipeChatTurnEvent, { type: "equipe_card" }>;
    expect(events.at(-1)).toEqual({ type: "done", assistantMessageId: plan.messageId });
    expect(messages.posts.map(post => post.type)).toEqual(["user", "assistant", "equipe_card", "equipe_card"]);
    expect(messages.posts[1]!.content).toBe(LIMIT_PT);
    expect(messages.posts[3]!.payload).toMatchObject({ kind: "plan_offer" });
  });

  it("2. the same in English", async () => {
    const f = await reopened(stuck);
    const { events, agents } = await turn(f, "hello", { locale: "en" });
    expect(agents.tasks).toHaveLength(0);
    expect(kinds(events)).toEqual(["text_delta", "card:handoff", "card:plan_offer", "done"]);
    expect(events[0]).toEqual({ type: "text_delta", text: LIMIT_EN });
  });

  it("3. stuck WITHOUT a recorded diagnosis (the first reading ran out): as before, no plan card", async () => {
    const f = await reopened(stuck, { diagnosis: false });
    const { messages, agents, events } = await turn(f);
    expect(agents.tasks).toHaveLength(0);
    expect(kinds(events)).toEqual(["text_delta", "card:handoff", "done"]);
    expect(events[0]).toEqual({ type: "text_delta", text: "Vamos terminar sua marca primeiro." });
    expect(messages.posts.some(post => (post.payload as { kind?: string } | undefined)?.kind === "plan_offer")).toBe(false);
  });

  it.each([
    ["a group still pending", { step: "reading", readsUsed: 3, reading: { ...terminal, logo: run("pending") } }],
    ["a group still running", { step: "reading", readsUsed: 3, reading: { ...terminal, logo: run("running") } }],
    ["a reading left (source, readsUsed 1)", { step: "source", readsUsed: 1 }],
    ["a reading left (reading, readsUsed 2)", { step: "reading", readsUsed: 2, reading: terminal }],
    ["the person can still go on (identity)", { step: "identity", readsUsed: 3, reading: terminal }],
  ])("4. a live correction (%s): as before, no plan card", async (_name, patch) => {
    const f = await reopened(patch);
    const { agents, events } = await turn(f);
    expect(agents.tasks).toHaveLength(0);
    expect(events.some(event => event.type === "equipe_card" && (event.card as { kind: string }).kind === "plan_offer")).toBe(false);
    expect(kinds(events)).toEqual(["text_delta", "card:handoff", "done"]);
    expect((events[0] as { text: string }).text).not.toBe(LIMIT_PT);
  });

  it("4b. the plan is offered only from a STUCK reading: a recorded diagnosis with the brand mid-steps (not stuck) gets the usual copy", async () => {
    const f = await reopened({ step: "summary", readsUsed: 3, reading: terminal });
    // a diagnosis that counts (the successor exists), yet the brand steps are not stuck
    await f.t.deps.uow.repos.events.create(f.scope, { actorType: "system", actorId: "t", actorRole: "system", eventType: "diagnostic.recorded",
      payload: { documentId: uuid() }, occurredAt: new Date() });
    expect(await (await import("./free-budget")).hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope)).toBe(true);
    const { agents, events } = await turn(f);
    expect(agents.tasks).toHaveLength(0);
    expect(kinds(events)).toEqual(["text_delta", "card:handoff", "done"]);
    expect((events[0] as { text: string }).text).toBe("Vamos terminar sua marca primeiro.");
  });

  it("5. stuck at the source step with a typed URL: the command is refused (reading_limit), the limit text and the plan card show, nothing changes", async () => {
    const f = await reopened({ step: "source", readsUsed: 3 });
    const before = (await f.t.deps.uow.repos.handoffs.list(f.scope))[0]!;
    const { agents, events } = await turn(f, "https://cafenovo.com.br", { actor: f.approver });
    expect(agents.tasks).toHaveLength(0);
    expect(kinds(events)).toEqual(["text_delta", "card:handoff", "card:plan_offer", "done"]);
    expect(events[0]).toEqual({ type: "text_delta", text: LIMIT_PT });
    const after = (await f.t.deps.uow.repos.handoffs.list(f.scope))[0]!;
    expect(after).toMatchObject({ step: "source", readsUsed: 3, version: before.version, source: before.source });
  });

  it("6. an account that is not free in the same state gets no plan card", async () => {
    const f = await reopened(stuck);
    const account = f.t.store.accounts.rows.get(f.accountId)!;
    f.t.store.accounts.rows.set(f.accountId, { ...account, status: "active" });
    const { agents, events } = await turn(f);
    expect(agents.tasks).toHaveLength(0);
    expect(events.some(event => event.type === "equipe_card" && (event.card as { kind: string }).kind === "plan_offer")).toBe(false);
    expect((events[0] as { text: string }).text).not.toBe(LIMIT_PT);
  });

  it("7. the plan card is offered once: 'Agora não' does not recreate it, the limit line still answers, a plan request brings it back", async () => {
    const f = await reopened(stuck);
    const messages = new ThreadWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "não deveria rodar" } });
    const say = (userMessage: string) => collect(runEquipeStrategistTurn({
      deps: f.t.deps, agents, messages, workspaceId: f.workspaceId, accountId: f.accountId,
      threadId: "thread-1", userMessage, executionPausedMessage: "pausa",
    } as never));
    const planCards = () => messages.posts.filter(post => post.type === "equipe_card" && (post.payload as { kind?: string } | undefined)?.kind === "plan_offer");

    expect(kinds(await say("oi, e agora?"))).toEqual(["text_delta", "card:handoff", "card:plan_offer", "done"]);
    expect(planCards()).toHaveLength(1);
    // "Agora não" sends this message: the honest line and the step card again, but no second plan card
    const dismissed = await say("Continuar no grátis por enquanto");
    expect(kinds(dismissed)).toEqual(["text_delta", "card:handoff", "done"]);
    expect(dismissed[0]).toEqual({ type: "text_delta", text: LIMIT_PT });
    expect(planCards()).toHaveLength(1);
    // an explicit request brings it back
    expect(kinds(await say("quero assinar o plano"))).toEqual(["text_delta", "card:handoff", "card:plan_offer", "done"]);
    expect(planCards()).toHaveLength(2);
    expect(agents.tasks).toHaveLength(0);
  });

  it("8. two tabs on the stuck reading bring one plan card: the turn that came second ends on the limit line it already posted", async () => {
    const f = await reopened(stuck);
    const messages = new ThreadWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "não deveria rodar" } });
    const say = (userMessage: string) => collect(runEquipeStrategistTurn({
      deps: f.t.deps, agents, messages, workspaceId: f.workspaceId, accountId: f.accountId,
      threadId: "thread-1", userMessage, executionPausedMessage: "pausa",
    } as never));
    const isPlan = (event: EquipeChatTurnEvent) => event.type === "equipe_card" && (event.card as { kind: string }).kind === "plan_offer";

    const [tabA, tabB] = await Promise.all([say("oi, e agora?"), say("tem alguém aí?")]);

    // Both read the thread before either offer existed, and only one card came out.
    expect(messages.posts.filter(post => post.type === "equipe_card" && (post.payload as { kind?: string } | undefined)?.kind === "plan_offer")).toHaveLength(1);
    expect([...tabA, ...tabB].filter(isPlan)).toHaveLength(1);
    for (const tab of [tabA, tabB]) {
      expect(tab[0]).toEqual({ type: "text_delta", text: LIMIT_PT });
      expect(tab.at(-1)?.type).toBe("done");
    }
    const second = [tabA, tabB].find(tab => !tab.some(isPlan))!;
    expect(kinds(second)).toEqual(["text_delta", "card:handoff", "done"]);
    // The turn that came second ends on its own limit line, not on the offer it never made.
    const lines = messages.posts.flatMap((post, index) => post.type === "assistant" ? [`msg-${index + 1}`] : []);
    expect(lines).toContain((second.at(-1) as { assistantMessageId: string }).assistantMessageId);
    expect(agents.tasks).toHaveLength(0);
  });

  it("9. a closed free conversation stays closed even with the brand reopened: the fixed reply answers, the handoff turn does not run", async () => {
    const f = await reopened({ step: "source", readsUsed: 1 });
    const before = (await f.t.deps.uow.repos.handoffs.list(f.scope))[0]!;
    const messages = new ThreadWriter();
    messages.seed([{ type: "equipe_card", content: "ADScale para a sua marca", payload: { kind: "plan_offer", reason: "free_budget_exhausted", title: "ADScale para a sua marca", items: [] } }]);
    const agents = new RecordingAgents({ ok: true, output: { text: "não deveria rodar" } });
    const say = (userMessage: string) => collect(runEquipeStrategistTurn({
      deps: f.t.deps, agents, messages, workspaceId: f.workspaceId, accountId: f.accountId, actor: f.approver,
      threadId: "thread-1", userMessage, executionPausedMessage: "pausa",
    } as never));

    for (const message of ["oi, e agora?", "https://cafenovo.com.br"]) {
      const events = await say(message);
      expect(kinds(events)).toEqual(["text_delta", "done"]);
      expect((events[0] as { text: string }).text).toContain("quero assinar");
    }
    // No source was set and no second offer was made.
    expect((await f.t.deps.uow.repos.handoffs.list(f.scope))[0]).toMatchObject({ step: "source", readsUsed: 1, version: before.version, source: before.source });
    expect(messages.posts.filter(post => post.type === "equipe_card")).toHaveLength(0);
    expect(agents.tasks).toHaveLength(0);
  });
});
