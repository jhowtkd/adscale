// Equipe chat turn (#551): approval intent answers with a card, everything
// else delegates to the #550 strategist through the Agents port.

import { describe, expect, it } from "vitest";
import type { Agents, AgentTask, AgentTaskResult } from "../module/ports";
import { BUDGET_EXCEEDED_ERROR } from "./runner";
import {
  detectApprovalIntent,
  runEquipeStrategistTurn,
  type ConversationPostInput,
  type EquipeChatTurnEvent,
  type EquipeConversationWriter,
} from "./chat-turn";
import { deliverTestBatch, setup } from "../module/testing/items";

class RecordingWriter implements EquipeConversationWriter {
  readonly posts: ConversationPostInput[] = [];

  async post(input: ConversationPostInput): Promise<{ id: string }> {
    this.posts.push(input);
    return { id: `msg-${this.posts.length}` };
  }
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
      }),
    );

    expect(events.at(-1)?.type).toBe("done");
    const assistant = messages.posts.find((post) => post.type === "assistant");
    expect(assistant?.content).toContain("Não consegui processar");
  });
});
