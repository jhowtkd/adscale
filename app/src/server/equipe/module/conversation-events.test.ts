import { beforeEach, describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { appendEvent, transact } from "./shared";
import { projectConversationEvent } from "./conversation-events";
import { makeTestDeps, seedStaff, uuid } from "./testing/deps";
import { FREE_INTRO_EVENT, LIBRARY_ASSEMBLED_EVENT } from "../handoff/contract";

const SYSTEM = { kind: "system", job: "free-open" } as const;
type T = ReturnType<typeof makeTestDeps>;

async function openFree(t: T) {
  const workspaceId = uuid();
  const userId = `user-${uuid()}`;
  t.store.workspaceMembers.rows.set(uuid(), {
    id: uuid(), workspaceId, userId, name: "Ana Souza", email: "ana@example.com", emailVerified: true,
    role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  const opened = await executeCommand(t.deps, { actor: SYSTEM, workspaceId }, { type: "open_free_account", payload: { userId } });
  if (!opened.ok) throw new Error(opened.error.code);
  return { workspaceId, accountId: opened.value.accountId! };
}

/** Appends one event in a real transaction (so it is projected as a command would) and returns its id. */
async function emit(
  t: T, ids: { workspaceId: string; accountId: string }, eventType: string, payload: unknown = {},
  actor: Parameters<typeof transact>[1]["actor"] = SYSTEM,
) {
  let eventId = "";
  const outcome = await transact(t.deps, { actor, workspaceId: ids.workspaceId, accountId: ids.accountId, now: new Date("2026-10-01T12:00:00.000Z") } as never, async (ctx) => {
    const event = await appendEvent(ctx, { eventType, objectType: "account", objectId: ids.accountId, payload });
    eventId = event.id;
    return { ok: true, value: {} } as never;
  });
  if (!outcome.ok) throw new Error(outcome.error.code);
  return eventId;
}

const messages = (t: T) => [...t.store.assistantMessages.rows.values()];
const byId = (t: T, id: string) => t.store.assistantMessages.rows.get(id);

describe("projectConversationEvent: the free account's conversation events", () => {
  let t: T;
  let ids: { workspaceId: string; accountId: string };
  beforeEach(async () => {
    t = makeTestDeps();
    ids = await openFree(t);
  });

  it("projects the opening line as the Strategist's message, keyed by its event id", async () => {
    const before = messages(t).length;
    const eventId = await emit(t, ids, FREE_INTRO_EVENT);
    expect(messages(t)).toHaveLength(before + 1);
    expect(byId(t, eventId)).toMatchObject({
      type: "assistant",
      content: "Oi! Sou o Estrategista do ADScale. Antes de criar qualquer coisa, vou conhecer a sua marca.",
      payload: { handoffStep: "intro" },
    });
  });

  it("posts one message per event id: projecting the same event again adds nothing", async () => {
    const eventId = await emit(t, ids, FREE_INTRO_EVENT);
    const count = messages(t).length;
    const [event] = (await t.deps.uow.repos.events.list(ids, { eventType: FREE_INTRO_EVENT })).filter((row) => row.id === eventId);
    await t.deps.uow.run(async (repos, internal) => {
      const ctx = { repos, internal, actor: SYSTEM, workspaceId: ids.workspaceId, accountId: ids.accountId, now: new Date(), events: [] } as never;
      await projectConversationEvent(ctx, event!);
      await projectConversationEvent(ctx, event!);
    });
    expect(messages(t)).toHaveLength(count);
    expect(messages(t).filter((m) => m.id === eventId)).toHaveLength(1);
  });

  it("gives two different events two messages", async () => {
    const first = await emit(t, ids, FREE_INTRO_EVENT);
    const second = await emit(t, ids, FREE_INTRO_EVENT);
    expect(first).not.toBe(second);
    expect(byId(t, first)).toBeDefined();
    expect(byId(t, second)).toBeDefined();
  });

  it.each([
    [0, "Biblioteca montada · 0 itens"],
    [1, "Biblioteca montada · 1 item"],
    [2, "Biblioteca montada · 2 itens"],
    [12, "Biblioteca montada · 12 itens"],
  ])("projects the library line for %i item(s) as fixed text, with no model involved", async (items, text) => {
    const eventId = await emit(t, ids, LIBRARY_ASSEMBLED_EVENT, { items });
    expect(byId(t, eventId)).toMatchObject({ type: "equipe_event", content: text, payload: { kind: LIBRARY_ASSEMBLED_EVENT, text, items } });
  });

  it.each([[-1], [1.5], ["3"], [null], [undefined]])("treats an invalid item count (%j) as zero", async (items) => {
    const eventId = await emit(t, ids, LIBRARY_ASSEMBLED_EVENT, { items });
    expect(byId(t, eventId)).toMatchObject({ content: "Biblioteca montada · 0 itens", payload: { items: 0 } });
  });

  it("does not project event types the conversation does not tell", async () => {
    const before = messages(t).length;
    await emit(t, ids, "account.something_internal");
    expect(messages(t)).toHaveLength(before);
  });

  it("refuses to project an event of another account into this conversation", async () => {
    const other = await openFree(t);
    const [foreign] = await t.deps.uow.repos.events.list(other, { eventType: FREE_INTRO_EVENT });
    await expect(t.deps.uow.run(async (repos, internal) => {
      const ctx = { repos, internal, actor: SYSTEM, workspaceId: ids.workspaceId, accountId: ids.accountId, now: new Date(), events: [] } as never;
      await projectConversationEvent(ctx, foreign!);
    })).rejects.toThrow("conversation_event_scope_mismatch");
  });
});

describe("projectConversationEvent: who speaks", () => {
  let t: T;
  let ids: { workspaceId: string; accountId: string };
  beforeEach(async () => {
    t = makeTestDeps();
    ids = await openFree(t);
  });

  it("names the person 'ADScale' when the event carries no staff name and no staff record is found", async () => {
    const assumed = await emit(t, ids, "support_exception.assumed", {});
    expect(byId(t, assumed)).toMatchObject({ type: "equipe_event", content: "ADScale entrou na conversa." });
    const closed = await emit(t, ids, "support_exception.closed", {});
    expect(byId(t, closed)).toMatchObject({ content: "ADScale devolveu a conversa ao Estrategista IA." });
  });

  it("uses the staff member's display name, and the name the event carries before it", async () => {
    const marina = await seedStaff(t, "operations", { displayName: "Marina" });
    const viaStaff = await emit(t, ids, "support_exception.assumed", {}, marina);
    expect(byId(t, viaStaff)).toMatchObject({ content: "Marina entrou na conversa.", payload: { actor: "staff", actorName: "Marina" } });
    const viaPayload = await emit(t, ids, "support_exception.assumed", { staffName: "Paulo" }, marina);
    expect(byId(t, viaPayload)).toMatchObject({ content: "Paulo entrou na conversa." });
  });

  it("says a person was called in plain words, without 'Equipe'", async () => {
    const opened = await emit(t, ids, "support_exception.opened", {});
    expect(byId(t, opened)?.content).toBe("Chamei uma pessoa do ADScale para ajudar aqui.");
    expect(messages(t).map((m) => m.content).join(" ")).not.toMatch(/\bEquipe\b/);
  });

  it("tells a plan request in plain words, with the one business day promise and no price", async () => {
    const opened = await emit(t, ids, "support_exception.opened", { purpose: "plan", trigger: "out_of_contract_request" });
    const content = byId(t, opened)?.content ?? "";
    expect(content).toBe("Recebemos seu pedido sobre o plano. Uma pessoa vai falar com você em até 1 dia útil.");
    expect(content).not.toMatch(/R\$|pre[çc]o/i);
  });
});
