// Free diagnosis job (ticket 08): claim -> generate -> record, with the real
// runner admission on the memory ledger and a scripted model. No network.

import { describe, expect, it } from "vitest";
import type { FailureEventPayload } from "inngest";
import { makeTestDeps } from "../module/testing/deps";
import { executeCommand } from "../module/commands";
import { confirmedHandoff, INSTAGRAM_CAPTIONS, requestDiagnosis } from "../module/testing/diagnosis";
import { resolveAgentMonthlyBudgetUsdCents } from "../agents/roles";
import { diagnosisFailedForGood, diagnosisBlockedByBudget } from "../handoff/diagnosis-state";
import { MemoryLedgerStore } from "../agents/ledger";
import { createEquipeAgents } from "../agents/runner";
import { FakeModelClient, type FakeModelResponse } from "../agents/testing";
import { hasRecordedDiagnostic, planRequestAllowed } from "../agents/free-budget";
import { DIAGNOSIS_BUDGET_EXCEEDED_CODE } from "../handoff/diagnosis-contract";
import { BUDGET_EXCEEDED_ERROR } from "../agents/runner";
import { classifyDiagnosisFailure, createDiagnosisFailureHandler, createDiagnosisHandler, type DiagnosisRuntime } from "./diagnosis";
import type { JobStep } from "./shared";

const step: JobStep = { run: async (_id, fn) => fn() };
const SITE_QUOTE = "Torramos café especial de origem única";
const IG_QUOTE = "Receita de cold brew com o lote Fazenda Boa Vista";

const answer = (over: Record<string, unknown> = {}) => JSON.stringify({
  summary: { text: "Torrefação em Campinas.", evidence: [{ source: "site", quote: SITE_QUOTE }] },
  channels: [{ source: "site", message: "origem e assinatura", evidence: [{ source: "site", quote: "A assinatura entrega dois pacotes de 250 g na sua porta" }] }],
  opportunities: [{ title: "Mostrar a origem de cada lote", evidence: [{ source: "site", quote: SITE_QUOTE }] }],
  notFound: ["público-alvo"],
  ...over,
});
const igAnswer = answer({
  summary: { text: "Receitas e bastidores.", evidence: [{ source: "instagram", quote: IG_QUOTE }] },
  channels: [{ source: "instagram", message: "receitas e bastidores", evidence: [{ source: "instagram", quote: IG_QUOTE }] }],
  opportunities: [{ title: "Transformar a receita em série", evidence: [{ source: "instagram", quote: IG_QUOTE }] }],
});
const USAGE = { inputTokens: 3000, outputTokens: 400 };

type Fixture = Awaited<ReturnType<typeof confirmedHandoff>>;
function harness(f: Fixture, script: FakeModelResponse[]) {
  const client = new FakeModelClient(script);
  const ledger = new MemoryLedgerStore();
  const runtime: DiagnosisRuntime = {
    depsFor: () => f.t.deps,
    agentsFor: deps => createEquipeAgents({ moduleDeps: deps, client, ledger, now: () => deps.clock.now() }),
    isEnabled: () => true,
  };
  const eventData = { workspaceId: f.workspaceId, accountId: f.accountId, taskIntentId: f.taskIntentId, handoffId: f.handoffId, readingId: f.readingId };
  const handler = createDiagnosisHandler(runtime);
  return {
    client, ledger, runtime, eventData,
    run: (data: unknown = eventData) => handler({ event: { data }, step }),
    fail: (error: Error, data: unknown = eventData) =>
      createDiagnosisFailureHandler(runtime)({ event: { data: { event: { data } } } as unknown as FailureEventPayload, error }),
  };
}

const docs = async (f: Fixture) => (await f.t.deps.uow.repos.documents.list(f.scope)).filter(d => d.kind === "diagnosis");
const events = (f: Fixture, eventType: string) => f.t.deps.uow.repos.events.list(f.scope, { eventType });
const cards = (f: Fixture) => [...f.t.store.assistantMessages.rows.values()].filter(m => m.type === "equipe_card" && (m.payload as { kind?: string } | null)?.kind === "diagnosis");

describe("diagnosis job: paths", () => {
  it("site + Instagram: one model call, one document, diagnostic.recorded and the ready card", async () => {
    const f = await confirmedHandoff();
    const h = harness(f, [{ content: answer({
      opportunities: [{ title: "Mostrar a origem", evidence: [{ source: "site", quote: SITE_QUOTE }] },
        { title: "Repetir a receita", evidence: [{ source: "instagram", quote: IG_QUOTE }] }],
    }), usage: USAGE }]);
    const result = await h.run();
    expect(result).toMatchObject({ recorded: true, version: 1, status: "complete" });
    expect(h.client.requests).toHaveLength(1);
    expect(h.client.requests[0]).toMatchObject({ model: "muse-spark-1.3-contributor", output: { name: "equipe_diagnosis" } });
    const [doc] = await docs(f);
    expect(doc!.content).toMatchObject({
      status: "complete", meta: { readingId: f.readingId, taskIntentId: f.taskIntentId, model: "muse-spark-1.3-contributor", promptVersion: "equipe-diagnosis/v1", inputSources: ["site", "instagram"] },
      opportunities: [{ title: "Mostrar a origem", sources: ["site"] }, { title: "Repetir a receita", sources: ["instagram"] }],
    });
    expect(await events(f, "diagnosis.started")).toHaveLength(1);
    expect(await events(f, "diagnostic.recorded")).toHaveLength(1);
    expect(await hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope)).toBe(true);
    expect(cards(f)).toHaveLength(1);
    expect(h.ledger.entries).toHaveLength(1);
    expect(h.ledger.entries[0]).toMatchObject({ taskKind: "diagnosis", role: "research", inputTokens: 3000, outputTokens: 400 });
  });

  it("stores the source's wording when the model misspells case or markdown", async () => {
    const f = await confirmedHandoff(makeTestDeps(), { instagram: null });
    const h = harness(f, [{ content: answer({ opportunities: [{ title: "Mostrar a origem", evidence: [{ source: "site", quote: "torramos **café especial** de origem única" }] }] }), usage: USAGE }]);
    await h.run();
    const [doc] = await docs(f);
    expect((doc!.content as { sources: Array<{ quote: string; supports: string }> }).sources.find(item => item.supports === "opportunity:1")!.quote).toBe(SITE_QUOTE);
  });

  it("site only", async () => {
    const f = await confirmedHandoff(makeTestDeps(), { instagram: null });
    const h = harness(f, [{ content: answer(), usage: USAGE }]);
    expect(await h.run()).toMatchObject({ recorded: true, status: "complete" });
    const wire = JSON.stringify(h.client.requests[0]!.messages);
    expect(wire).toContain('Available sources: site');
    expect(wire).not.toContain('<source name=\\"instagram\\">');
    const [doc] = await docs(f);
    expect((doc!.content as { notFound: string[]; meta: { inputSources: string[] } }).notFound).toContain("Instagram (não confirmado)");
    expect((doc!.content as { meta: { inputSources: string[] } }).meta.inputSources).toEqual(["site"]);
  });

  it("Instagram only", async () => {
    const f = await confirmedHandoff(makeTestDeps(), { site: null });
    const h = harness(f, [{ content: igAnswer, usage: USAGE }]);
    expect(await h.run()).toMatchObject({ recorded: true, status: "complete" });
    const wire = JSON.stringify(h.client.requests[0]!.messages);
    expect(wire).toContain("Available sources: instagram");
    expect(wire).toContain(INSTAGRAM_CAPTIONS[1]!.slice(0, 25));
    const [doc] = await docs(f);
    expect(doc!.content).toMatchObject({ status: "complete", meta: { inputSources: ["instagram"] }, opportunities: [{ sources: ["instagram"] }] });
    expect((doc!.content as { notFound: string[] }).notFound).toContain("Site (não informado)");
  });

  it("too little public text: NO model call, an honest insufficient document, nothing paid", async () => {
    const f = await confirmedHandoff(makeTestDeps(), { site: "Café Aurora. Torra própria.", instagram: null });
    const h = harness(f, []); // any model call would throw fakeModelClientOutOfResponses
    expect(await h.run()).toMatchObject({ recorded: true, status: "insufficient" });
    expect(h.client.requests).toHaveLength(0);
    expect(h.ledger.entries).toHaveLength(0);
    const [doc] = await docs(f);
    expect(doc!.content).toMatchObject({ status: "insufficient", opportunities: [], meta: { model: null, promptVersion: null } });
    expect(await events(f, "diagnostic.recorded")).toHaveLength(1);
    expect(cards(f)[0]!.payload).toMatchObject({ status: "insufficient" });
  });

  it("model returns only invented excerpts → insufficient document, and the call is counted", async () => {
    const f = await confirmedHandoff();
    const h = harness(f, [{ usage: USAGE, content: answer({ opportunities: [{ title: "Inventada", evidence: [{ source: "site", quote: "Somos a maior torrefação da América Latina" }] }] }) }]);
    expect(await h.run()).toMatchObject({ recorded: true, status: "insufficient" });
    expect(h.ledger.entries).toHaveLength(1);
    const [doc] = await docs(f);
    expect(doc!.content).toMatchObject({ status: "insufficient", opportunities: [], sources: [] });
    expect(JSON.stringify(doc)).not.toContain("maior torrefação");
    expect(await hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope)).toBe(true);
  });

  it("an identity line offered as the only support grounds nothing: the document is insufficient", async () => {
    const f = await confirmedHandoff();
    const h = harness(f, [{ usage: USAGE, content: answer({
      summary: { text: "Marca de tom marrom.", evidence: [{ source: "site", quote: "colors read from the site: #6F4E37" }] },
      opportunities: [{ title: "Usar a cor da marca", evidence: [{ source: "site", quote: "Cores confirmadas: #6F4E37" }, { source: "site", quote: "fonts read from the site: Inter" }] }],
    }) }]);
    expect(await h.run()).toMatchObject({ recorded: true, status: "insufficient" });
    const [doc] = await docs(f);
    expect(doc!.content).toMatchObject({ status: "insufficient", opportunities: [], sources: [] });
    expect(JSON.stringify(doc)).not.toContain("#6F4E37");
    expect(h.ledger.entries).toHaveLength(1);
  });

  it("nothing of origin=user reaches the model", async () => {
    const f = await confirmedHandoff(makeTestDeps(), { hostileUserData: true, name: null });
    const h = harness(f, [{ content: answer(), usage: USAGE }]);
    expect(await h.run()).toMatchObject({ recorded: true });
    expect(h.client.requests).toHaveLength(1);
    const wire = JSON.stringify(h.client.requests);
    for (const secret of ["SEGREDO-DO-USUARIO", "#010203", "cafeaurora.example", "Marca da Ana", "upload.png", "@cafeaurora"]) expect(wire).not.toContain(secret);
    expect(JSON.stringify(await docs(f))).not.toContain("SEGREDO-DO-USUARIO");
  });
});

describe("diagnosis job: idempotency", () => {
  it("the same event twice → one document, one model call, one ledger row", async () => {
    const f = await confirmedHandoff();
    const h = harness(f, [{ content: answer(), usage: USAGE }, { content: answer(), usage: USAGE }]);
    expect(await h.run()).toMatchObject({ recorded: true });
    expect(await h.run()).toEqual({ ignored: true, reason: "already_recorded" });
    expect(h.client.requests).toHaveLength(1);
    expect(h.ledger.entries).toHaveLength(1);
    expect(await docs(f)).toHaveLength(1);
    expect(await events(f, "diagnostic.recorded")).toHaveLength(1);
    expect(await events(f, "diagnosis.started")).toHaveLength(1);
  });

  it("a second intent for the same reading is ignored once the document exists", async () => {
    const f = await confirmedHandoff();
    const { requestDiagnosis } = await import("../module/testing/diagnosis");
    const second = await requestDiagnosis(f.t, f.scope, f.handoffId, f.readingId);
    const h = harness(f, [{ content: answer(), usage: USAGE }]);
    await h.run();
    expect(await h.run({ ...h.eventData, taskIntentId: second })).toEqual({ ignored: true, reason: "already_recorded" });
    expect(h.client.requests).toHaveLength(1);
    expect(await docs(f)).toHaveLength(1);
  });

  it("an event of another reading is stale: nothing runs", async () => {
    const f = await confirmedHandoff();
    const h = harness(f, []);
    const { requestDiagnosis } = await import("../module/testing/diagnosis");
    const foreign = await requestDiagnosis(f.t, f.scope, f.handoffId, crypto.randomUUID());
    expect(await h.run({ ...h.eventData, taskIntentId: foreign, readingId: crypto.randomUUID() })).toEqual({ ignored: true, reason: "stale" });
    expect(h.client.requests).toHaveLength(0);
  });
});

describe("diagnosis job: failures", () => {
  it("a retryable failure THROWS (so the platform retries) and records nothing; the second execution records", async () => {
    const f = await confirmedHandoff();
    const h = harness(f, [{ content: answer(), stopReason: "max_tokens", usage: USAGE }, { content: answer(), usage: USAGE }]);
    await expect(h.run()).rejects.toThrow("model_truncated");
    expect(await docs(f)).toHaveLength(0);
    expect(await events(f, "diagnosis.failed")).toHaveLength(0);
    expect(await events(f, "diagnostic.recorded")).toHaveLength(0);
    // "building" line already shown; the retry does not repeat it
    expect(await events(f, "diagnosis.started")).toHaveLength(1);

    expect(await h.run()).toMatchObject({ recorded: true, status: "complete" });
    expect(h.client.requests).toHaveLength(2);
    expect(h.ledger.entries).toHaveLength(2); // each attempt is admitted and settled on its own
    expect(await docs(f)).toHaveLength(1);
    expect(await events(f, "diagnosis.started")).toHaveLength(1);
  });

  it("invalid JSON from the model is retryable and classified as diagnosis_invalid", async () => {
    const f = await confirmedHandoff();
    const h = harness(f, [{ content: "não é json", usage: USAGE }]);
    await expect(h.run()).rejects.toThrow("diagnosis_invalid");
  });

  it("a provider error is retryable", async () => {
    const f = await confirmedHandoff();
    const h = harness(f, []); // out of responses = the client throws
    await expect(h.run()).rejects.toThrow("provider_error");
  });

  it("the final failure (failure handler) records diagnosis.failed and the error card with 'Tentar de novo'", async () => {
    const f = await confirmedHandoff();
    const h = harness(f, [{ content: "x", stopReason: "max_tokens", usage: USAGE }]);
    await expect(h.run()).rejects.toThrow("model_truncated");
    await h.fail(new Error("model_truncated"));
    const failed = await events(f, "diagnosis.failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.payload).toEqual({ taskIntentId: f.taskIntentId, code: "model_truncated", retryable: true });
    const [card] = cards(f);
    expect(card!.payload).toMatchObject({ kind: "diagnosis", status: "failed", failureCode: "model_truncated", suggestions: ["Tentar de novo"] });
    // a duplicated delivery of the failure changes nothing, and a late re-run does nothing
    await h.fail(new Error("model_truncated"));
    expect(await events(f, "diagnosis.failed")).toHaveLength(1);
    expect(await h.run()).toEqual({ ignored: true, reason: "already_failed" });
    expect(await docs(f)).toHaveLength(0);
  });

  it("an unknown transport error reaching the failure handler becomes provider_error", async () => {
    const f = await confirmedHandoff();
    const h = harness(f, []);
    await h.fail(new Error("socket hang up"));
    expect((await events(f, "diagnosis.failed"))[0]!.payload).toMatchObject({ code: "provider_error", retryable: true });
  });

  it("the failure handler ignores an invalid envelope and keeps recording when the rollout is open", async () => {
    const f = await confirmedHandoff();
    const h = harness(f, []);
    await h.fail(new Error("provider_error"), { nonsense: true });
    expect(await events(f, "diagnosis.failed")).toHaveLength(0);
    await h.fail(new Error("provider_error"));
    expect(await events(f, "diagnosis.failed")).toHaveLength(1);
  });

  it("budget_exceeded is final: recorded without throwing, no retry offered", async () => {
    const f = await confirmedHandoff();
    const h = harness(f, []);
    await h.ledger.record({ workspaceId: f.workspaceId, accountId: f.accountId, role: "research", model: "muse-spark-1.3-contributor", promptVersion: "v", taskKind: "research",
      inputTokens: 0, outputTokens: 0, costUsdCents: 100 });
    expect(await h.run()).toEqual({ failed: true, code: "budget_exceeded" });
    expect(h.client.requests).toHaveLength(0);
    expect((await events(f, "diagnosis.failed"))[0]!.payload).toEqual({ taskIntentId: f.taskIntentId, code: "budget_exceeded", retryable: false });
    expect((cards(f)[0]!.payload as { suggestions: string[] }).suggestions).toEqual([]);
  });

  it("budget_exceeded is the person's way out (ticket 13, D-12): the card says why, the plan request is accepted, no model was asked", async () => {
    const f = await confirmedHandoff();
    const h = harness(f, []);
    await h.ledger.record({ workspaceId: f.workspaceId, accountId: f.accountId, role: "research", model: "muse-spark-1.3-contributor", promptVersion: "v", taskKind: "research",
      inputTokens: 0, outputTokens: 0, costUsdCents: 100 });
    expect(await planRequestAllowed(f.t.deps.uow.repos, f.scope)).toBe(false);
    await h.run();
    expect(await hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope)).toBe(false);
    expect(await planRequestAllowed(f.t.deps.uow.repos, f.scope)).toBe(true);
    expect(cards(f)[0]!.payload).toMatchObject({ status: "failed", failureCode: DIAGNOSIS_BUDGET_EXCEEDED_CODE });
    const requested = await executeCommand(f.t.deps, { workspaceId: f.workspaceId, accountId: f.accountId, actor: f.approver }, { type: "request_support", payload: { purpose: "plan" } });
    expect(requested.ok).toBe(true);
    expect(h.client.requests).toHaveLength(0);
  });

  it("monthly admission waits for the Sao Paulo reset without spending provider retries or duplicating work", async () => {
    const f = await confirmedHandoff(makeTestDeps({ now: new Date("2026-10-31T23:00:00Z") }));
    f.t.deps.hasClassicPaidAccess = async () => true;
    const h = harness(f, [{ content: answer(), usage: USAGE }]);
    let instant = new Date("2026-10-31T23:00:00Z");
    f.t.deps.clock = { now: () => instant };
    const spent = await h.ledger.record({ ...f.scope, role: "research", model: "muse-spark-1.3-contributor", promptVersion: "v", taskKind: "research",
      inputTokens: 0, outputTokens: 0, costUsdCents: resolveAgentMonthlyBudgetUsdCents() });
    spent.createdAt = instant;
    const retry = () => executeCommand(f.t.deps, { ...f.scope, actor: f.approver }, { type: "diagnosis_retry", payload: {} });
    expect(await h.run()).toEqual({ failed: true, code: "monthly_budget_exceeded" });
    expect((await events(f, "diagnosis.failed"))[0]!.payload).toMatchObject({ code: "monthly_budget_exceeded", retryable: true });
    expect(await diagnosisFailedForGood(f.t.deps.uow.repos, f.scope, f.readingId)).toBe(false);
    expect(await diagnosisBlockedByBudget(f.t.deps.uow.repos, f.scope)).toBe(false);
    expect(cards(f)[0]!.payload).toMatchObject({ suggestions: ["Tentar de novo"] });
    await h.fail(new Error("monthly_budget_exceeded"));
    expect(await h.run()).toMatchObject({ ignored: true, reason: "already_failed" });
    instant = new Date("2026-11-01T02:59:59Z");
    expect((await retry()).ok).toBe(false);
    expect(await events(f, "task.requested")).toHaveLength(1);
    expect(await events(f, "diagnosis.failed")).toHaveLength(1);
    expect(h.client.requests).toHaveLength(0);
    // Four pure monthly refusals cannot use up the two provider retries.
    let taskIntentId = f.taskIntentId;
    for (let month = 11; month <= 14; month++) {
      instant = new Date(Date.UTC(2026, month - 1, 1, 3));
      const next = await retry();
      expect(next.ok).toBe(true);
      if (!next.ok) throw new Error(next.error.code);
      taskIntentId = next.value.data.taskIntentId as string;
      if (month < 14) {
        spent.createdAt = instant;
        expect(await h.run({ ...h.eventData, taskIntentId })).toEqual({ failed: true, code: "monthly_budget_exceeded" });
      }
    }
    expect(await h.run({ ...h.eventData, taskIntentId })).toMatchObject({ recorded: true, status: "complete" });
    expect(h.client.requests).toHaveLength(1);
    expect(await docs(f)).toHaveLength(1);
    expect(await h.run({ ...h.eventData, taskIntentId })).toMatchObject({ ignored: true, reason: "already_recorded" });
  });

  it("monthly refusals do not erase the provider retry limit", async () => {
    const f = await confirmedHandoff();
    const h = harness(f, []);
    const retry = () => executeCommand(f.t.deps, { ...f.scope, actor: f.approver }, { type: "diagnosis_retry", payload: {} });
    let taskIntentId = f.taskIntentId;
    for (let attempt = 0; attempt < 3; attempt++) {
      await h.fail(new Error("provider_error"), { ...h.eventData, taskIntentId });
      const next = await retry();
      expect(next.ok).toBe(attempt < 2);
      if (next.ok) taskIntentId = next.value.data.taskIntentId as string;
    }
    expect(h.client.requests).toHaveLength(0);
  });

  it("a provider failure followed by monthly refusal in the same intent still spends a provider retry", async () => {
    const f = await confirmedHandoff(makeTestDeps({ now: new Date("2026-10-15T15:00:00Z") }));
    f.t.deps.hasClassicPaidAccess = async () => true;
    let instant = f.t.deps.clock.now();
    f.t.deps.clock = { now: () => instant };
    const h = harness(f, []);
    const retry = () => executeCommand(f.t.deps, { ...f.scope, actor: f.approver }, { type: "diagnosis_retry", payload: {} });
    let taskIntentId = f.taskIntentId;
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(h.run({ ...h.eventData, taskIntentId })).rejects.toThrow("provider_error");
      const spent = await h.ledger.record({ ...f.scope, role: "research", model: "muse-spark-1.3-contributor", promptVersion: "v", taskKind: "research",
        inputTokens: 0, outputTokens: 0, costUsdCents: resolveAgentMonthlyBudgetUsdCents() });
      spent.createdAt = instant;
      expect(await h.run({ ...h.eventData, taskIntentId })).toEqual({ failed: true, code: "monthly_budget_exceeded" });
      instant = new Date(Date.UTC(2026, 10 + attempt, 1, 3));
      const next = await retry();
      expect(next.ok).toBe(attempt < 2);
      if (next.ok) taskIntentId = next.value.data.taskIntentId as string;
    }
    expect(h.client.requests).toHaveLength(3);
    expect((await events(f, "diagnosis.failed")).at(-1)!.payload).toMatchObject({ retryable: false });
  });

  it.each(["admission_started", "monthly_budget_exceeded"])("a failed %s proof write never establishes a free retry", async brokenCode => {
    const f = await confirmedHandoff(makeTestDeps({ now: new Date("2026-10-15T15:00:00Z") }));
    f.t.deps.hasClassicPaidAccess = async () => true;
    let instant = f.t.deps.clock.now();
    f.t.deps.clock = { now: () => instant };
    const h = harness(f, []);
    const spent = await h.ledger.record({ ...f.scope, role: "research", model: "muse-spark-1.3-contributor", promptVersion: "v", taskKind: "research",
      inputTokens: 0, outputTokens: 0, costUsdCents: resolveAgentMonthlyBudgetUsdCents() });
    spent.createdAt = instant;
    const run = f.t.deps.uow.run;
    f.t.deps.uow.run = fn => run((repos, internal) => {
      const create = repos.events.create.bind(repos.events);
      repos.events.create = (scope, input) => input.eventType === "diagnosis.attempt" && (input.payload as { code: string }).code === brokenCode
        ? Promise.reject(new Error("proof_write_failed")) : create(scope, input);
      return fn(repos, internal);
    });
    await expect(h.run()).rejects.toThrow("proof_write_failed");
    expect(h.client.requests).toHaveLength(0);
    expect(await events(f, "diagnosis.attempt")).toHaveLength(brokenCode === "admission_started" ? 0 : 1);
    f.t.deps.uow.run = run;
    // Even a late monthly failure handler cannot invent missing proof: this intent remains charged to the retry limit.
    await h.fail(new Error("monthly_budget_exceeded"));
    instant = new Date("2026-11-01T03:00:00Z");
    const retry = () => executeCommand(f.t.deps, { ...f.scope, actor: f.approver }, { type: "diagnosis_retry", payload: {} });
    for (let attempt = 0; attempt < 2; attempt++) {
      const next = await retry();
      expect(next.ok).toBe(true);
      if (!next.ok) throw new Error(next.error.code);
      await h.fail(new Error("provider_error"), { ...h.eventData, taskIntentId: next.value.data.taskIntentId });
    }
    expect((await retry()).ok).toBe(false);
  });

  it("provider error text cannot forge monthly admission proof", async () => {
    const f = await confirmedHandoff();
    f.t.deps.hasClassicPaidAccess = async () => true;
    const h = harness(f, []);
    h.client.chat = async request => { h.client.requests.push(request); throw new Error("monthly_budget_exceeded"); };
    await expect(h.run()).rejects.toThrow("provider_error");
    expect(h.client.requests).toHaveLength(1);
    expect((await events(f, "diagnosis.attempt")).map(event => (event.payload as { code: string }).code)).toEqual(["admission_started"]);
  });

  it("a failure step resumed after reset uses the admission month, not the late failure write", async () => {
    const f = await confirmedHandoff(makeTestDeps({ now: new Date("2026-10-31T23:00:00Z") }));
    f.t.deps.hasClassicPaidAccess = async () => true;
    let instant = f.t.deps.clock.now();
    f.t.deps.clock = { now: () => instant };
    const h = harness(f, [{ content: answer(), usage: USAGE }]);
    const spent = await h.ledger.record({ ...f.scope, role: "research", model: "muse-spark-1.3-contributor", promptVersion: "v", taskKind: "research",
      inputTokens: 0, outputTokens: 0, costUsdCents: resolveAgentMonthlyBudgetUsdCents() });
    spent.createdAt = instant;
    await createDiagnosisHandler(h.runtime)({ event: { data: h.eventData }, step: { run: async (id, fn) => {
      if (id.startsWith("fail-")) instant = new Date("2026-11-01T03:00:00Z");
      return fn();
    } } });
    const next = await executeCommand(f.t.deps, { ...f.scope, actor: f.approver }, { type: "diagnosis_retry", payload: {} });
    expect(next.ok).toBe(true);
    if (!next.ok) throw new Error(next.error.code);
    expect(await h.run({ ...h.eventData, taskIntentId: next.value.data.taskIntentId })).toMatchObject({ recorded: true });
    expect(h.client.requests).toHaveLength(1);
  });

  it.each(["ledger", "event"])("retains the actual October admission instant when %s I/O crosses into November", async crossing => {
    const october = new Date("2026-11-01T02:59:59.999Z");
    const november = new Date("2026-11-01T03:00:00.000Z");
    const f = await confirmedHandoff(makeTestDeps({ now: october }));
    f.t.deps.hasClassicPaidAccess = async () => true;
    let instant = october;
    f.t.deps.clock = { now: () => instant };
    const h = harness(f, [{ content: answer(), usage: USAGE }]);
    const spent = await h.ledger.record({ ...f.scope, role: "research", model: "muse-spark-1.3-contributor", promptVersion: "v", taskKind: "research",
      inputTokens: 0, outputTokens: 0, costUsdCents: resolveAgentMonthlyBudgetUsdCents() });
    spent.createdAt = october;
    const consulted: Date[] = [];
    const total = h.ledger.monthlyTotalCostUsdCents.bind(h.ledger);
    h.ledger.monthlyTotalCostUsdCents = async (workspaceId, accountId, at) => {
      consulted.push(at);
      const cost = await total(workspaceId, accountId, at);
      if (crossing === "ledger") instant = november;
      return cost;
    };
    const run = f.t.deps.uow.run;
    f.t.deps.uow.run = fn => run((repos, internal) => {
      const create = repos.events.create.bind(repos.events);
      repos.events.create = (scope, input) => {
        if (crossing === "event" && input.eventType === "agent.budget_exceeded") instant = november;
        return create(scope, input);
      };
      return fn(repos, internal);
    });
    expect(await h.run()).toEqual({ failed: true, code: "monthly_budget_exceeded" });
    expect(consulted[0]).toEqual(october);
    expect(h.client.requests).toHaveLength(0);
    const proof = (await events(f, "diagnosis.attempt")).find(event => (event.payload as { code: string }).code === "monthly_budget_exceeded");
    expect(proof?.occurredAt).toEqual(consulted[0]);
    const next = await executeCommand(f.t.deps, { ...f.scope, actor: f.approver }, { type: "diagnosis_retry", payload: {} });
    expect(next.ok).toBe(true);
    if (!next.ok) throw new Error(next.error.code);
    expect(await h.run({ ...h.eventData, taskIntentId: next.value.data.taskIntentId })).toMatchObject({ recorded: true });
    expect(h.client.requests).toHaveLength(1);
  });

  it("an October start with admission already in November uses the November instant", async () => {
    const october = new Date("2026-11-01T02:59:59.999Z");
    const november = new Date("2026-11-01T03:00:00.000Z");
    const f = await confirmedHandoff(makeTestDeps({ now: october }));
    let instant = october;
    f.t.deps.clock = { now: () => instant };
    f.t.deps.hasClassicPaidAccess = async () => { instant = november; return true; };
    const h = harness(f, [{ content: answer(), usage: USAGE }]);
    const spent = await h.ledger.record({ ...f.scope, role: "research", model: "muse-spark-1.3-contributor", promptVersion: "v", taskKind: "research",
      inputTokens: 0, outputTokens: 0, costUsdCents: resolveAgentMonthlyBudgetUsdCents() });
    spent.createdAt = november;
    expect(await h.run()).toEqual({ failed: true, code: "monthly_budget_exceeded" });
    const attempts = await events(f, "diagnosis.attempt");
    expect(attempts.find(event => (event.payload as { code: string }).code === "admission_started")?.occurredAt).toEqual(october);
    expect(attempts.find(event => (event.payload as { code: string }).code === "monthly_budget_exceeded")?.occurredAt).toEqual(november);
    const retry = () => executeCommand(f.t.deps, { ...f.scope, actor: f.approver }, { type: "diagnosis_retry", payload: {} });
    expect((await retry()).ok).toBe(false);
    expect(h.client.requests).toHaveLength(0);
    f.t.deps.hasClassicPaidAccess = async () => true;
    instant = new Date("2026-12-01T03:00:00.000Z");
    const next = await retry();
    expect(next.ok).toBe(true);
    if (!next.ok) throw new Error(next.error.code);
    expect(await h.run({ ...h.eventData, taskIntentId: next.value.data.taskIntentId })).toMatchObject({ recorded: true });
  });

  it("persists the captured instant before generate results are serialized and replays the same proof", async () => {
    const october = new Date("2026-11-01T02:59:59.999Z");
    const f = await confirmedHandoff(makeTestDeps({ now: october }));
    f.t.deps.hasClassicPaidAccess = async () => true;
    let instant = october;
    f.t.deps.clock = { now: () => instant };
    const h = harness(f, [{ content: answer(), usage: USAGE }]);
    const spent = await h.ledger.record({ ...f.scope, role: "research", model: "muse-spark-1.3-contributor", promptVersion: "v", taskKind: "research",
      inputTokens: 0, outputTokens: 0, costUsdCents: resolveAgentMonthlyBudgetUsdCents() });
    spent.createdAt = october;
    const total = h.ledger.monthlyTotalCostUsdCents.bind(h.ledger);
    h.ledger.monthlyTotalCostUsdCents = async (workspaceId, accountId, at) => {
      const cost = await total(workspaceId, accountId, at);
      instant = new Date("2026-11-01T03:00:00.000Z");
      return cost;
    };
    const cached = new Map<string, unknown>();
    const memoizedStep: JobStep = { run: async <T>(id: string, fn: () => Promise<T>): Promise<T> => {
      if (cached.has(id)) return cached.get(id) as T;
      const value = JSON.parse(JSON.stringify(await fn())) as T;
      cached.set(id, value);
      return value;
    } };
    const handler = createDiagnosisHandler(h.runtime);
    for (let replay = 0; replay < 2; replay++) {
      expect(await handler({ event: { data: h.eventData }, step: memoizedStep })).toEqual({ failed: true, code: "monthly_budget_exceeded" });
    }
    const attempts = await events(f, "diagnosis.attempt");
    expect(attempts).toHaveLength(2);
    expect(attempts.find(event => (event.payload as { code: string }).code === "monthly_budget_exceeded")?.occurredAt).toEqual(october);
    expect(await events(f, "diagnosis.failed")).toHaveLength(1);
    expect(h.client.requests).toHaveLength(0);
    const next = await executeCommand(f.t.deps, { ...f.scope, actor: f.approver }, { type: "diagnosis_retry", payload: {} });
    expect(next.ok).toBe(true);
    if (!next.ok) throw new Error(next.error.code);
    expect(await handler({ event: { data: { ...h.eventData, taskIntentId: next.value.data.taskIntentId } }, step: memoizedStep })).toMatchObject({ recorded: true });
    expect(h.client.requests).toHaveLength(1);
  });

  it("an injected failure result cannot forge server admission metadata", async () => {
    const f = await confirmedHandoff();
    const h = harness(f, []);
    const runtime: DiagnosisRuntime = { ...h.runtime, agentsFor: () => ({ runTask: async () => ({ ok: false, error: "monthly_budget_exceeded",
      output: { monthlyAdmissionAt: "2026-10-01T03:00:00.000Z" } }) }) };
    expect(await createDiagnosisHandler(runtime)({ event: { data: h.eventData }, step })).toEqual({ failed: true, code: "monthly_budget_exceeded" });
    expect(await events(f, "diagnosis.attempt")).toHaveLength(1);
    expect(h.client.requests).toHaveLength(0);
  });

  it("a model refusal is final: recorded without throwing", async () => {
    const f = await confirmedHandoff();
    const h = harness(f, [{ content: null, stopReason: "refusal", usage: USAGE }]);
    expect(await h.run()).toEqual({ failed: true, code: "model_refused" });
    expect((await events(f, "diagnosis.failed"))[0]!.payload).toMatchObject({ code: "model_refused", retryable: false });
    expect(h.ledger.entries).toHaveLength(1); // the refused call was still paid
  });

  it("a paused account runs nothing and tells the person: diagnosis.failed execution_blocked", async () => {
    const f = await confirmedHandoff();
    await f.t.deps.uow.repos.pauses.create(f.scope, { level: "execution", scope: "account", origin: "security", resumableBy: "operations", reason: "teste" });
    const h = harness(f, []);
    expect(await h.run()).toEqual({ failed: true, code: "execution_blocked" });
    expect(h.client.requests).toHaveLength(0);
    expect((await events(f, "diagnosis.failed"))[0]!.payload).toMatchObject({ code: "execution_blocked", retryable: true });
    expect(await docs(f)).toHaveLength(0);
  });
});

describe("diagnosis job: guards", () => {
  it("ignores an invalid event", async () => {
    const f = await confirmedHandoff();
    const h = harness(f, []);
    for (const bad of [null, {}, { ...h.eventData, taskIntentId: "no-uuid" }, { ...h.eventData, workspaceId: undefined }]) {
      expect(await h.run(bad)).toEqual({ ignored: true, reason: "invalid_event" });
    }
    expect(await events(f, "diagnosis.started")).toHaveLength(0);
  });

});

describe("diagnosis job: closed rollout", () => {
  const JOBACTOR = { kind: "system", job: "equipe.handoff.diagnose" } as const;
  function gated(f: Fixture, script: FakeModelResponse[] = []) {
    const h = harness(f, script);
    let enabled = false;
    const runtime = { ...h.runtime, isEnabled: () => enabled };
    const handler = createDiagnosisHandler(runtime);
    const failure = createDiagnosisFailureHandler(runtime);
    return {
      ...h, open: () => { enabled = true; },
      run: (data: unknown = h.eventData) => handler({ event: { data }, step }),
      fail: (error: Error, data: unknown = h.eventData) => failure({ event: { data: { event: { data } } } as unknown as FailureEventPayload, error }),
    };
  }
  const nothingWritten = async (f: Fixture, h: ReturnType<typeof gated>) => {
    expect(await events(f, "diagnosis.started")).toHaveLength(0);
    expect(await events(f, "diagnosis.failed")).toHaveLength(0);
    expect(await docs(f)).toHaveLength(0);
    expect(h.client.requests).toHaveLength(0);
    expect(h.ledger.entries).toHaveLength(0);
  };

  it("an event with work to do is NOT acknowledged: the handler throws diagnosis_gated and writes nothing", async () => {
    const f = await confirmedHandoff();
    const h = gated(f);
    await expect(h.run()).rejects.toThrow("diagnosis_gated");
    await nothingWritten(f, h);
  });

  it("once the rollout opens, the SAME event is replayed normally (claim, generate, record)", async () => {
    const f = await confirmedHandoff();
    const h = gated(f, [{ content: answer(), usage: USAGE }]);
    await expect(h.run()).rejects.toThrow("diagnosis_gated");
    h.open();
    expect(await h.run()).toMatchObject({ recorded: true, status: "complete" });
    expect(h.client.requests).toHaveLength(1);
    expect(await docs(f)).toHaveLength(1);
    expect(await events(f, "diagnostic.recorded")).toHaveLength(1);
  });

  it("an event without work is acknowledged as not_enabled, without throwing: another reading", async () => {
    const f = await confirmedHandoff();
    const h = gated(f);
    const foreign = await requestDiagnosis(f.t, f.scope, f.handoffId, crypto.randomUUID());
    expect(await h.run({ ...h.eventData, taskIntentId: foreign, readingId: crypto.randomUUID() })).toEqual({ ignored: true, reason: "not_enabled" });
    await nothingWritten(f, h);
  });

  it("... the handoff is not confirmed (done)", async () => {
    const f = await confirmedHandoff();
    await f.t.deps.uow.repos.handoffs.update(f.scope, f.handoffId, { step: "summary" });
    const h = gated(f);
    expect(await h.run()).toEqual({ ignored: true, reason: "not_enabled" });
    await nothingWritten(f, h);
  });

  it("... the diagnosis is already recorded", async () => {
    const f = await confirmedHandoff();
    const open = harness(f, [{ content: answer(), usage: USAGE }]);
    await open.run();
    const h = gated(f);
    expect(await h.run()).toEqual({ ignored: true, reason: "not_enabled" });
    expect(await docs(f)).toHaveLength(1);
  });

  it("... the intent already failed", async () => {
    const f = await confirmedHandoff();
    await executeCommand(f.t.deps, { workspaceId: f.workspaceId, accountId: f.accountId, actor: JOBACTOR }, { type: "diagnosis_fail", payload: { taskIntentId: f.taskIntentId, code: "provider_error" } });
    const h = gated(f);
    expect(await h.run()).toEqual({ ignored: true, reason: "not_enabled" });
    expect(await events(f, "diagnosis.failed")).toHaveLength(1);
  });

  it("... the intent is unknown", async () => {
    const f = await confirmedHandoff();
    const h = gated(f);
    expect(await h.run({ ...h.eventData, taskIntentId: crypto.randomUUID() })).toEqual({ ignored: true, reason: "not_enabled" });
    await nothingWritten(f, h);
  });

  it("an invalid event is still ignored (not gated)", async () => {
    const f = await confirmedHandoff();
    const h = gated(f);
    expect(await h.run({ nonsense: true })).toEqual({ ignored: true, reason: "invalid_event" });
  });

  it("the failure handler throws while the rollout is closed and the event has work: the failure is not swallowed", async () => {
    const f = await confirmedHandoff();
    const h = gated(f);
    await expect(h.fail(new Error("provider_error"))).rejects.toThrow("diagnosis_gated");
    expect(await events(f, "diagnosis.failed")).toHaveLength(0);
    h.open();
    await h.fail(new Error("provider_error"));
    expect(await events(f, "diagnosis.failed")).toHaveLength(1);
  });

  it("the failure handler returns quietly when the event has no work (recorded, failed, stale)", async () => {
    const f = await confirmedHandoff();
    const open = harness(f, [{ content: answer(), usage: USAGE }]);
    await open.run();
    const h = gated(f);
    await expect(h.fail(new Error("provider_error"))).resolves.toBeUndefined();
    const stale = await requestDiagnosis(f.t, f.scope, f.handoffId, crypto.randomUUID());
    await expect(h.fail(new Error("provider_error"), { ...h.eventData, taskIntentId: stale, readingId: crypto.randomUUID() })).resolves.toBeUndefined();
    expect(await events(f, "diagnosis.failed")).toHaveLength(0);
  });

  it("the failure handler ignores an invalid envelope while closed", async () => {
    const f = await confirmedHandoff();
    const h = gated(f);
    await expect(h.fail(new Error("provider_error"), { nonsense: true })).resolves.toBeUndefined();
  });
});

describe("classifyDiagnosisFailure", () => {
  it("a refused call is the code the plan gate reads (D-12), and it is never retried", () => {
    expect(classifyDiagnosisFailure(BUDGET_EXCEEDED_ERROR)).toEqual({ code: DIAGNOSIS_BUDGET_EXCEEDED_CODE, retry: false });
  });

  it.each([
    ["budget_exceeded", "budget_exceeded", false],
    ["monthly_budget_exceeded", "monthly_budget_exceeded", false],
    ["execution_blocked", "execution_blocked", false],
    ["execution_suspended", "execution_blocked", false],
    ["execution_delinquent", "execution_blocked", false],
    ["model_refused", "model_refused", false],
    ["model_refused: diagnosis_refused", "model_refused", false],
    ["equipe_model_refused", "model_refused", false],
    ["equipe_model_truncated", "model_truncated", true],
    ["model_truncated", "model_truncated", true],
    ["model_truncated: diagnosis_truncated", "model_truncated", true],
    ["diagnosis_invalid", "diagnosis_invalid", true],
    ["diagnosis_invalid_json", "diagnosis_invalid", true],
    ["diagnosis_schema_mismatch: Required", "diagnosis_invalid", true],
    ["requires_plan", "diagnosis_unavailable", false],
    ["invalid_agent_input: site", "diagnosis_unavailable", false],
    ["free_call_unbounded", "diagnosis_unavailable", false],
    ["diagnosis_unavailable", "diagnosis_unavailable", false],
    ["provider_error", "provider_error", true],
    ["ECONNRESET", "provider_error", true],
    [undefined, "provider_error", true],
  ])("%s → %s (retry %s)", (error, code, retry) => {
    expect(classifyDiagnosisFailure(error as string | undefined)).toEqual({ code, retry });
  });

  it("does not treat inherited object keys as job codes", () => {
    expect(classifyDiagnosisFailure("constructor")).toEqual({ code: "provider_error", retry: true });
    expect(classifyDiagnosisFailure("toString")).toEqual({ code: "provider_error", retry: true });
  });
});
