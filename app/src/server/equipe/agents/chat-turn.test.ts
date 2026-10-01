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
  });
  const opened = await executeCommand(t.deps, { actor: { kind: "system", job: "free" }, workspaceId }, {
    type: "open_free_account", payload: { userId },
  });
  if (!opened.ok) throw new Error(opened.error.code);
  return { t, workspaceId, accountId: opened.value.accountId! };
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
    "Aceite o calendário",
    "aceitem o plano",
    "Aceito o calendário",
    "aceitamos a proposta",
    "Dê seu aval",
    "dê o aval",
    "dou meu aval",
    "damos o nosso aval",
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
    "o aceite do cliente chegou",
    "como funciona o aceite dos termos",
    "ela aceita o plano",
    "posso aceitar o calendário?",
    "não aceite o calendário",
    "vou avaliar o calendário",
    "pedido de aval",
  ])("ignores %p", (text) => {
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
    "não, quero assinar o plano",
    "quero assinar o plano, não o grátis",
    "quero assinar, mas não agora",
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
  ])("ignores %p", (text) => {
    expect(detectPlanRequest(text)).toBe(false);
  });
});

describe("runEquipeStrategistTurn", () => {
  it.each([
    { command: "suspend_execution", actor: "operations", message: "ok, pode postar", notice: "O trabalho da equipe está pausado no momento. Sua mensagem ficou registrada para uma pessoa da equipe responder." },
    { command: "pause_delinquency", actor: "system", message: "oi, como está?", notice: "The team's work is paused at the moment. Your message has been saved so a team member can reply." },
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
}

// Free budget exhausted AFTER the diagnostic: the first message gets the plan
// offer, every later one gets a fixed reply — no new card, no strategist call —
// until the person asks for the plan. "Agora não" is just such a later message.
describe("runEquipeStrategistTurn — free budget exhausted offer", () => {
  const DISMISS = "Continuar no grátis por enquanto";

  async function exhaustedThread(result: AgentTaskResult = { ok: false, error: BUDGET_EXCEEDED_ERROR }) {
    const free = await freeAccount();
    const scope = { workspaceId: free.workspaceId, accountId: free.accountId };
    await free.t.deps.uow.repos.events.create(scope, {
      actorType: "system", actorId: "diag", actorRole: "system",
      eventType: DIAGNOSTIC_RECORDED_EVENT, payload: { documentId: uuid() }, occurredAt: new Date(),
    });
    const messages = new ThreadWriter();
    const agents = new RecordingAgents(result);
    const turn = (userMessage: string, extra: { fromSuggestion?: boolean } = {}) => collect(runEquipeStrategistTurn({
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

  it.each(["ok, pode postar", "Aprovado", "Aceite o calendário", "Dê seu aval"])(
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

  it.each(["ok, pode postar", "Aceite o calendário", "Dê seu aval"])(
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
    const messages = new RecordingWriter();
    const agents = new RecordingAgents({ ok: true, output: { text: "must not run" } });
    const events = await collect(runEquipeStrategistTurn({
      deps: free.t.deps, agents, messages, workspaceId: free.workspaceId, accountId: free.accountId,
      threadId: "thread-1", userMessage, hasAttachments: true, executionPausedMessage: "pausa",
    }));
    expect(agents.tasks).toHaveLength(0);
    expect(messages.posts[0]).toMatchObject({ type: "user", content: userMessage });
    const assistant = messages.posts.find((post) => post.type === "assistant");
    expect(assistant?.content).toMatch(/conta grátis.*imagens anexadas/);
    expect(assistant?.content).toContain("texto");
    expect(events).toEqual([
      { type: "text_delta", text: assistant?.content },
      { type: "done", assistantMessageId: "msg-2" },
    ]);
  });
});
