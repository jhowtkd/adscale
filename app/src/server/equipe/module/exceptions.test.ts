import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { ctx, setup, type ItemIds, type TestDeps } from "./testing/items";

const SCOPE = (ids: ItemIds) => ({ workspaceId: ids.workspaceId, accountId: ids.accountId });

async function openCase(t: TestDeps, ids: ItemIds, trigger = "stuck_connection"): Promise<string> {
  const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.support), {
    type: "open_exception",
    payload: { trigger, reason: "conexão travada há 3 dias" },
  });
  if (!outcome.ok) throw new Error(`open failed: ${outcome.error.code}`);
  return outcome.value.data.exceptionId as string;
}

describe("open_exception / request_support", () => {
  it("opens from every flow-4 trigger with the matching first-response SLA", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const fast = new Set(["critical_incident", "cancel_request"]);
    const triggers = [
      "stalled_implantation",
      "stuck_connection",
      "unresolved_fact_conflict",
      "repeated_silence",
      "out_of_contract_request",
      "dissatisfaction_signal",
      "production_fix",
      "cancel_request",
      "critical_incident",
      "off_app_material",
    ];
    for (const trigger of triggers) {
      const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.support), {
        type: "open_exception",
        payload: { trigger },
      });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      const row = await t.deps.uow.repos.exceptions.get(
        scope,
        outcome.value.data.exceptionId as string,
      );
      expect(row?.dueAt).toEqual(
        fast.has(trigger) ? new Date("2026-10-05T16:00:00.000Z") : new Date("2026-10-06T14:00:00.000Z"),
      );
    }
  });

  it("reserves the client-requested trigger for the client button", async () => {
    const { t, ids } = await setup();
    const agent = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_exception",
      payload: { trigger: "client_requested_person" },
    });
    expect(agent.ok).toBe(false);
    const system = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "open_exception",
      payload: { trigger: "client_requested_person" },
    });
    expect(system.ok).toBe(false);
    // Support may open it for a client who called outside the app.
    const support = await executeCommand(t.deps, ctx(ids, ids.actors.support), {
      type: "open_exception",
      payload: { trigger: "client_requested_person", reason: "ligou pedindo uma pessoa" },
    });
    expect(support.ok).toBe(true);
    // The client button needs no justification.
    const client = await executeCommand(t.deps, ctx(ids, ids.actors.member), {
      type: "request_support",
      payload: {},
    });
    expect(client.ok).toBe(true);
    if (!client.ok) return;
    const row = await t.deps.uow.repos.exceptions.get(
      SCOPE(ids),
      client.value.data.exceptionId as string,
    );
    expect(row?.trigger).toBe("client_requested_person");
    const quality = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "open_exception",
      payload: { trigger: "stuck_connection" },
    });
    expect(quality.ok).toBe(false);
  });
});

describe("assume / post / register / close", () => {
  it("assumes with a named person and refuses double assume", async () => {
    const { t, ids } = await setup();
    const exceptionId = await openCase(t, ids);
    const assumed = await executeCommand(t.deps, ctx(ids, ids.actors.support), {
      type: "assume_exception",
      payload: { exceptionId },
    });
    expect(assumed.ok).toBe(true);
    if (!assumed.ok) return;
    expect(assumed.value.data.staffId).toBe((ids.actors.support as { staffId: string }).staffId);
    const row = await t.deps.uow.repos.exceptions.get(SCOPE(ids), exceptionId);
    expect(row).toMatchObject({ status: "claimed", assigneeId: assumed.value.data.staffId });
    const again = await executeCommand(t.deps, ctx(ids, ids.actors.support), {
      type: "assume_exception",
      payload: { exceptionId },
    });
    expect(again.ok).toBe(false);
    const quality = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "assume_exception",
      payload: { exceptionId },
    });
    expect(quality.ok).toBe(false);
    if (!quality.ok) expect(quality.error.code).toBe("forbidden_actor");
  });

  it("posts staff messages and registers off-app contact", async () => {
    const { t, ids } = await setup();
    const exceptionId = await openCase(t, ids);
    const posted = await executeCommand(t.deps, ctx(ids, ids.actors.support), {
      type: "post_staff_message",
      payload: { exceptionId, body: "Oi, sou a Bruna, vou acompanhar seu caso" },
    });
    expect(posted.ok).toBe(true);
    if (!posted.ok) return;
    const events = await t.deps.uow.repos.events.list(SCOPE(ids), {
      objectType: "exception",
      objectId: exceptionId,
    });
    expect(events.map((e) => e.eventType)).toContain("staff.message_posted");
    const member = await executeCommand(t.deps, ctx(ids, ids.actors.member), {
      type: "post_staff_message",
      payload: { exceptionId, body: "x" },
    });
    expect(member.ok).toBe(false);
    const contact = await executeCommand(t.deps, ctx(ids, ids.actors.support), {
      type: "register_contact",
      payload: { exceptionId, channel: "whatsapp", summary: "combinado novo horário" },
    });
    expect(contact.ok).toBe(true);
    if (!contact.ok) return;
    expect(contact.value.data.attempts).toBe(1);
  });

  it("closes from assumed cases and hands back to the AI", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const exceptionId = await openCase(t, ids);
    const tooEarly = await executeCommand(t.deps, ctx(ids, ids.actors.support), {
      type: "close_exception",
      payload: { exceptionId, reason: "resolved" },
    });
    expect(tooEarly.ok).toBe(false);
    await executeCommand(t.deps, ctx(ids, ids.actors.support), {
      type: "assume_exception",
      payload: { exceptionId },
    });
    const closed = await executeCommand(t.deps, ctx(ids, ids.actors.support), {
      type: "close_exception",
      payload: { exceptionId, reason: "resolved" },
    });
    expect(closed.ok).toBe(true);
    expect((await t.deps.uow.repos.exceptions.get(scope, exceptionId))?.status).toBe("closed");
    const events = await t.deps.uow.repos.events.list(scope, {
      objectType: "exception",
      objectId: exceptionId,
    });
    expect(events.find((e) => e.eventType === "support_exception.closed")?.payload).toMatchObject({
      reason: "resolved",
      handedBackTo: "strategist",
    });
    // Closed cases take no more messages or contacts.
    const posted = await executeCommand(t.deps, ctx(ids, ids.actors.support), {
      type: "post_staff_message",
      payload: { exceptionId, body: "x" },
    });
    expect(posted.ok).toBe(false);
    const contact = await executeCommand(t.deps, ctx(ids, ids.actors.support), {
      type: "register_contact",
      payload: { exceptionId, channel: "phone", summary: "x" },
    });
    expect(contact.ok).toBe(false);
  });
});
