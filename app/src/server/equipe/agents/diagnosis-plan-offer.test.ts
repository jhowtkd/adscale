// Ticket 08 x ticket 02: the plan offer unlocks only with the diagnostic
// recorded by the REAL diagnosis_record (complete or insufficient).

import { describe, expect, it, vi } from "vitest";
vi.mock("@/server/validation/env", () => ({
  env: { EQUIPE_IG_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") },
}));
import { executeCommand } from "../module/commands";
import type { Agents } from "../module/ports";
import { makeTestDeps } from "../module/testing/deps";
import { confirmedHandoff } from "../module/testing/diagnosis";
import { freeStrategistMaxTokens } from "./free-budget";
import { runEquipeStrategistTurn, type EquipeChatTurnEvent, type EquipeConversationWriter } from "./chat-turn";
import { BUDGET_EXCEEDED_ERROR } from "./runner";
import { runStrategistTurn } from "./strategist";
import { FakeModelClient } from "./testing";

const JOB = { kind: "system", job: "equipe.handoff.diagnose" } as const;
const QUOTE = "Torramos café especial de origem única";
const OUTPUT = {
  summary: { text: "Torrefação.", evidence: [{ source: "site", quote: QUOTE }] }, channels: [],
  opportunities: [{ title: "Mostrar a origem", evidence: [{ source: "site", quote: QUOTE }] }], notFound: [],
};

type Fixture = Awaited<ReturnType<typeof confirmedHandoff>>;
async function record(f: Fixture, output: unknown) {
  const scope = { workspaceId: f.workspaceId, accountId: f.accountId, actor: JOB };
  await executeCommand(f.t.deps, scope, { type: "diagnosis_claim", payload: { taskIntentId: f.taskIntentId } });
  const outcome = await executeCommand(f.t.deps, scope, { type: "diagnosis_record", payload: { taskIntentId: f.taskIntentId, output, model: null, promptVersion: null } } as never);
  expect(outcome.ok).toBe(true);
}
const offerCall = (id: string) => ({ content: "Aqui está o plano.", toolCalls: [{ id, name: "oferecer_plano", argumentsJson: "{}" }] });

describe("oferecer_plano with the real diagnosis command", () => {
  it("is unavailable before diagnosis_record, then works", async () => {
    const f = await confirmedHandoff();
    const ctx = { deps: f.t.deps, workspaceId: f.workspaceId, accountId: f.accountId };
    const before = new FakeModelClient([offerCall("c1"), { content: "Ainda não tenho o diagnóstico." }]);
    const blocked = await runStrategistTurn({ client: before, ctx, message: "Quero o plano", maxTokens: freeStrategistMaxTokens() });
    expect(blocked.planOffered).toBeFalsy();
    const toolResult = JSON.stringify(before.requests[1]!.messages);
    expect(toolResult).toContain("plan_offer_unavailable");

    await record(f, OUTPUT);
    const after = new FakeModelClient([offerCall("c2")]);
    const offered = await runStrategistTurn({ client: after, ctx, message: "Quero o plano", maxTokens: freeStrategistMaxTokens() });
    expect(offered.planOffered).toBe(true);
  });

  it("an insufficient diagnosis also unlocks the plan offer", async () => {
    const f = await confirmedHandoff(makeTestDeps(), { site: "Café Aurora. Torra própria.", instagram: null });
    const ctx = { deps: f.t.deps, workspaceId: f.workspaceId, accountId: f.accountId };
    await record(f, null);
    const offered = await runStrategistTurn({ client: new FakeModelClient([offerCall("c1")]), ctx, message: "Quero o plano", maxTokens: freeStrategistMaxTokens() });
    expect(offered.planOffered).toBe(true);
  });

  it("a failed diagnosis does not unlock it", async () => {
    const f = await confirmedHandoff();
    const ctx = { deps: f.t.deps, workspaceId: f.workspaceId, accountId: f.accountId };
    await executeCommand(f.t.deps, { actor: JOB, workspaceId: f.workspaceId, accountId: f.accountId },
      { type: "diagnosis_fail", payload: { taskIntentId: f.taskIntentId, code: "provider_error" } });
    const client = new FakeModelClient([offerCall("c1"), { content: "Sem diagnóstico ainda." }]);
    expect((await runStrategistTurn({ client, ctx, message: "Quero o plano", maxTokens: freeStrategistMaxTokens() })).planOffered).toBeFalsy();
  });
});

describe("plan card on a budget-refused turn", () => {
  class Writer implements EquipeConversationWriter {
    readonly posts: Array<{ type: string; payload?: unknown }> = [];
    async post(input: { type: string; payload?: unknown }) { this.posts.push(input); return { id: `m-${this.posts.length}` }; }
    async list() { return []; }
  }
  const refused: Agents = { runTask: async () => ({ ok: false, error: BUDGET_EXCEEDED_ERROR }) };
  async function turn(f: Fixture) {
    const out: EquipeChatTurnEvent[] = [];
    for await (const event of runEquipeStrategistTurn({
      deps: f.t.deps, agents: refused, messages: new Writer() as never, workspaceId: f.workspaceId, accountId: f.accountId,
      threadId: "t", userMessage: "quero um calendário completo", executionPausedMessage: "pausa",
    })) out.push(event);
    return out;
  }

  it("shows no plan card before the diagnosis is recorded", async () => {
    const f = await confirmedHandoff();
    expect((await turn(f)).some(event => event.type === "equipe_card")).toBe(false);
  });

  it("shows the plan card once the diagnosis is recorded", async () => {
    const f = await confirmedHandoff();
    await record(f, OUTPUT);
    expect((await turn(f)).find(event => event.type === "equipe_card")).toMatchObject({ card: { kind: "plan_offer" } });
  });

  it("an insufficient document also releases it", async () => {
    const f = await confirmedHandoff(makeTestDeps(), { site: "Café Aurora. Torra própria.", instagram: null });
    await record(f, null);
    expect((await turn(f)).find(event => event.type === "equipe_card")).toMatchObject({ card: { kind: "plan_offer" } });
  });
});

describe("plan offer while the reopened diagnosis (v2) is pending", () => {
  async function pending() {
    const t = makeTestDeps();
    const f = await confirmedHandoff(t, { site: "Café Aurora. Torra própria.", instagram: null });
    await record(f, null);
    const asApprover = { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId };
    expect((await executeCommand(t.deps, asApprover, { type: "diagnosis_correct_source", payload: {} })).ok).toBe(true);
    const [row] = await t.deps.uow.repos.handoffs.list(f.scope);
    expect((await executeCommand(t.deps, asApprover, { type: "handoff_set_source", payload: { expectedStep: "source", expectedVersion: row!.version, kind: "site", value: "https://cafenovo.com.br" } })).ok).toBe(true);
    const next = (await t.deps.uow.repos.handoffs.list(f.scope))[0]!;
    const { SITE_TEXT, requestDiagnosis } = await import("../module/testing/diagnosis");
    await t.deps.uow.repos.handoffs.update(f.scope, f.handoffId, { step: "done", captured: { publicContent: [{ id: "x", value: SITE_TEXT, origin: "site" }] } });
    const taskIntentId = await requestDiagnosis(t, f.scope, f.handoffId, next.readingId!);
    return { ...f, taskIntentId };
  }

  it("oferecer_plano is unavailable until the v2 record, then works", async () => {
    const f = await pending();
    const ctx = { deps: f.t.deps, workspaceId: f.workspaceId, accountId: f.accountId };
    const before = new FakeModelClient([offerCall("c1"), { content: "Ainda não." }]);
    expect((await runStrategistTurn({ client: before, ctx, message: "Quero o plano", maxTokens: freeStrategistMaxTokens() })).planOffered).toBeFalsy();
    expect(JSON.stringify(before.requests[1]!.messages)).toContain("plan_offer_unavailable");

    await record(f, OUTPUT);
    const after = new FakeModelClient([offerCall("c2")]);
    expect((await runStrategistTurn({ client: after, ctx, message: "Quero o plano", maxTokens: freeStrategistMaxTokens() })).planOffered).toBe(true);
  });

  it("a budget-refused turn shows no plan card while v2 is pending, and shows it after the v2 record", async () => {
    const f = await pending();
    const refused: Agents = { runTask: async () => ({ ok: false, error: BUDGET_EXCEEDED_ERROR }) };
    const turn = async () => {
      const out: EquipeChatTurnEvent[] = [];
      for await (const event of runEquipeStrategistTurn({
        deps: f.t.deps, agents: refused, messages: new (class implements EquipeConversationWriter {
          async post() { return { id: "m" }; }
          async list() { return []; }
        })(), workspaceId: f.workspaceId, accountId: f.accountId, threadId: "t", userMessage: "quero um calendário completo", executionPausedMessage: "pausa",
      })) out.push(event);
      return out;
    };
    expect((await turn()).some(event => event.type === "equipe_card")).toBe(false);
    await record(f, OUTPUT);
    expect((await turn()).find(event => event.type === "equipe_card")).toMatchObject({ card: { kind: "plan_offer" } });
  });
});
