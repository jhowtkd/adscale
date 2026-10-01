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
