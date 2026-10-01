// Free diagnosis job (ticket 08): claim -> generate -> record, with the real
// runner admission on the memory ledger and a scripted model. No network.

import { describe, expect, it } from "vitest";
import type { FailureEventPayload } from "inngest";
import { makeTestDeps } from "../module/testing/deps";
import { executeCommand } from "../module/commands";
import { confirmedHandoff, INSTAGRAM_CAPTIONS, requestDiagnosis } from "../module/testing/diagnosis";
import { MemoryLedgerStore } from "../agents/ledger";
import { createEquipeAgents } from "../agents/runner";
import { FakeModelClient, type FakeModelResponse } from "../agents/testing";
import { hasRecordedDiagnostic } from "../agents/free-budget";
import { classifyDiagnosisFailure, createDiagnosisFailureHandler, createDiagnosisHandler, type DiagnosisRuntime } from "./diagnosis";
import type { JobStep } from "./shared";

const NOW = new Date("2026-10-15T15:00:00.000Z");
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
    agentsFor: deps => createEquipeAgents({ moduleDeps: deps, client, ledger, now: () => NOW }),
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
  it.each([
    ["budget_exceeded", "budget_exceeded", false],
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
