// Free diagnosis commands (ticket 08), memory store: claim / record / fail run
// by the diagnosis task (system), retry / correct_source by the approver.

import { afterEach, describe, expect, it } from "vitest";
import { executeCommand, FREE_ACCOUNT_COMMANDS } from "./commands";
import { testActors, makeTestDeps, type TestDeps } from "./testing/deps";
import { advancingClock, confirmedHandoff, requestDiagnosis, SITE_TEXT } from "./testing/diagnosis";
import { hasRecordedDiagnostic } from "../agents/free-budget";
import { readingMaxAdmissionUsdCents, sourceCorrectionRequirementUsdCents } from "../agents/free-balance";
import { DIAGNOSIS_MAX_INTENTS, type DiagnosisModelOutput } from "../handoff/diagnosis-contract";
import { HANDOFF_DIAGNOSE_EVENT } from "../handoff/contract";

const JOB = { kind: "system", job: HANDOFF_DIAGNOSE_EVENT } as const;
type Fixture = Awaited<ReturnType<typeof confirmedHandoff>>;
type Actor = Parameters<typeof executeCommand>[1]["actor"];

const QUOTE = "Torramos café especial de origem única";
const GOOD: DiagnosisModelOutput = {
  summary: { text: "Torrefação em Campinas.", evidence: [{ source: "site", quote: QUOTE }] },
  channels: [{ source: "site", message: "origem e assinatura", evidence: [{ source: "site", quote: "A assinatura entrega dois pacotes de 250 g na sua porta" }] }],
  opportunities: [
    { title: "Mostrar a origem de cada lote", evidence: [{ source: "site", quote: QUOTE }] },
    { title: "Explicar a assinatura mensal", evidence: [{ source: "site", quote: "Vendemos café em grãos, moído e por assinatura mensal" }] },
  ],
  notFound: ["público-alvo"],
};
const INVENTED: DiagnosisModelOutput = { ...GOOD, opportunities: [{ title: "Inventada", evidence: [{ source: "site", quote: "Texto que o site nunca disse em parte alguma" }] }] };

const run = (f: Fixture, actor: Actor, type: string, payload: Record<string, unknown> = {}) =>
  executeCommand(f.t.deps, { actor, workspaceId: f.workspaceId, accountId: f.accountId }, { type, payload } as never);
const claim = (f: Fixture, taskIntentId = f.taskIntentId) => run(f, JOB, "diagnosis_claim", { taskIntentId });
const record = (f: Fixture, output: DiagnosisModelOutput | null = GOOD, taskIntentId = f.taskIntentId) =>
  run(f, JOB, "diagnosis_record", { taskIntentId, output, model: output ? "muse-spark-1.3-contributor" : null, promptVersion: output ? "equipe-diagnosis/v1" : null });
const fail = (f: Fixture, code: string, taskIntentId = f.taskIntentId) => run(f, JOB, "diagnosis_fail", { taskIntentId, code });
const data = (outcome: Awaited<ReturnType<typeof claim>>) => {
  if (!outcome.ok) throw new Error(`command failed: ${outcome.error.code} ${outcome.error.message}`);
  return outcome.value.data as Record<string, unknown>;
};

const docs = async (f: Fixture) => (await f.t.deps.uow.repos.documents.list(f.scope)).filter(d => d.kind === "diagnosis");
const events = (f: Fixture, eventType: string) => f.t.deps.uow.repos.events.list(f.scope, { eventType });
const messages = (f: Fixture) => [...f.t.store.assistantMessages.rows.values()];
const cards = (f: Fixture) => messages(f).filter(m => m.type === "equipe_card" && (m.payload as { kind?: string } | null)?.kind === "diagnosis");

/** A fixture whose clock moves on, so chained intents keep their order. */
async function retryFixture() {
  const f = await confirmedHandoff();
  advancingClock(f.t);
  return f;
}

async function insufficientFixture(options: Parameters<typeof confirmedHandoff>[1] = {}) {
  const f = await confirmedHandoff(makeTestDeps(), { site: "Café Aurora. Torra própria.", instagram: null, ...options });
  expect((await claim(f)).ok).toBe(true);
  expect(data(await record(f, null))).toMatchObject({ status: "insufficient" });
  return f;
}

describe("diagnosis_claim", () => {
  it("claims a fresh intent of the confirmed handoff, and says 'building' exactly once per intent", async () => {
    const f = await confirmedHandoff();
    expect(data(await claim(f))).toEqual({ claimed: true });
    expect(data(await claim(f))).toEqual({ claimed: true }); // a resumed step claims again
    const started = await events(f, "diagnosis.started");
    expect(started).toHaveLength(1);
    expect(started[0]!.payload).toEqual({ taskIntentId: f.taskIntentId });
    const lines = messages(f).filter(m => m.type === "equipe_event" && (m.payload as { kind?: string }).kind === "diagnosis.started");
    expect(lines).toHaveLength(1);
  });

  it("is stale for an intent of another reading, for an unknown intent and when the handoff left 'done'", async () => {
    const f = await confirmedHandoff();
    const foreign = await requestDiagnosis(f.t, f.scope, f.handoffId, crypto.randomUUID());
    expect(data(await claim(f, foreign))).toEqual({ claimed: false, reason: "stale" });
    expect(data(await claim(f, crypto.randomUUID()))).toEqual({ claimed: false, reason: "stale" });
    await f.t.deps.uow.repos.handoffs.update(f.scope, f.handoffId, { step: "summary" });
    expect(data(await claim(f))).toEqual({ claimed: false, reason: "stale" });
    expect(await events(f, "diagnosis.started")).toHaveLength(0);
  });

  it("does not claim an intent that is not a diagnose intent", async () => {
    const f = await confirmedHandoff();
    const other = await f.t.deps.uow.repos.events.create(f.scope, { actorType: "system", actorId: "t", actorRole: "system", eventType: "task.requested",
      payload: { eventName: "equipe.handoff.read", data: { handoffId: f.handoffId, readingId: f.readingId } }, occurredAt: new Date() });
    await f.t.deps.uow.repos.taskOutbox.create(f.scope, { id: other.id, eventName: "equipe.handoff.read", data: { handoffId: f.handoffId, readingId: f.readingId } });
    expect(data(await claim(f, other.id))).toEqual({ claimed: false, reason: "stale" });
  });

  it("does not claim once the reading has its document, nor after the intent failed", async () => {
    const f = await confirmedHandoff();
    expect((await fail(f, "provider_error")).ok).toBe(true);
    expect(data(await claim(f))).toEqual({ claimed: false, reason: "already_failed" });

    const g = await confirmedHandoff();
    expect((await record(g)).ok).toBe(true);
    expect(data(await claim(g))).toEqual({ claimed: false, reason: "already_recorded" });
  });

  it("a suspended account claims nothing and says why", async () => {
    const f = await confirmedHandoff();
    await f.t.deps.uow.repos.pauses.create(f.scope, { level: "execution", scope: "account", origin: "security", resumableBy: "operations", reason: "teste" });
    expect(data(await claim(f))).toEqual({ claimed: false, reason: "execution_suspended" });
    expect(await events(f, "diagnosis.started")).toHaveLength(0);
    // and it cannot record a document either
    const recorded = await record(f);
    expect(recorded.ok).toBe(false);
    expect(!recorded.ok && recorded.error.code).toBe("execution_suspended");
    expect(await docs(f)).toHaveLength(0);
  });
});

describe("diagnosis_record", () => {
  it("writes the document, diagnostic.recorded {documentId} and the ready notification", async () => {
    const f = await confirmedHandoff();
    expect(await hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope)).toBe(false);
    await claim(f);
    const result = data(await record(f));
    expect(result).toMatchObject({ version: 1, status: "complete" });

    const [doc, ...rest] = await docs(f);
    expect(rest).toEqual([]);
    expect(doc).toMatchObject({ id: result.documentId, kind: "diagnosis", version: 1, createdByRole: "research" });
    expect(doc!.content).toMatchObject({
      status: "complete", brand: "Café Aurora",
      meta: { readingId: f.readingId, taskIntentId: f.taskIntentId, model: "muse-spark-1.3-contributor", promptVersion: "equipe-diagnosis/v1", inputSources: ["site", "instagram"] },
    });
    const recorded = await events(f, "diagnostic.recorded");
    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.payload).toEqual({ documentId: doc!.id });
    expect(recorded[0]).toMatchObject({ objectType: "document", objectId: doc!.id });
    const notifications = (await events(f, "notification.requested")).filter(e => (e.payload as { templateKey?: string }).templateKey?.startsWith("diagnosis."));
    expect(notifications.map(e => e.payload)).toEqual([{ recipientRole: "approver", templateKey: "diagnosis.ready" }]);
    expect(await hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope)).toBe(true);
  });

  it("records an honest 'insufficient' document (and its notification) when nothing verifies", async () => {
    const f = await confirmedHandoff();
    await claim(f);
    expect(data(await record(f, INVENTED))).toMatchObject({ status: "insufficient" });
    const [doc] = await docs(f);
    expect(doc!.content).toMatchObject({ status: "insufficient", opportunities: [], sources: [] });
    expect(await events(f, "diagnostic.recorded")).toHaveLength(1);
    const templates = (await events(f, "notification.requested")).map(e => (e.payload as { templateKey?: string }).templateKey);
    expect(templates).toContain("diagnosis.insufficient");
    expect(templates).not.toContain("diagnosis.ready");
  });

  it("verifies against the stored handoff, not against what the caller claims: invented excerpts never reach the document", async () => {
    const f = await confirmedHandoff();
    await claim(f);
    await record(f, { ...GOOD, opportunities: [...GOOD.opportunities, { title: "Falsa", evidence: [{ source: "site", quote: "Somos a maior torrefação da América Latina" }] }] });
    const [doc] = await docs(f);
    const content = doc!.content as { opportunities: Array<{ title: string }>; sources: Array<{ quote: string }> };
    expect(content.opportunities.map(o => o.title)).toEqual(["Mostrar a origem de cada lote", "Explicar a assinatura mensal"]);
    expect(JSON.stringify(content)).not.toContain("maior torrefação");
  });

  it("projects the card into the conversation with the right iscas", async () => {
    const f = await confirmedHandoff();
    await claim(f);
    await record(f);
    const [card] = cards(f);
    expect(card).toBeDefined();
    expect(card!.payload).toMatchObject({
      kind: "diagnosis", status: "ready", accountId: f.accountId, documentId: (await docs(f))[0]!.id, brand: "Café Aurora",
      opportunities: [{ title: "Mostrar a origem de cada lote", sources: ["site"] }, { title: "Explicar a assinatura mensal", sources: ["site"] }],
      suggestions: ["Me explica a oportunidade 1", "O que não foi encontrado?", "Montar o calendário do mês"],
    });
    expect(card!.content).toBe("Diagnóstico da marca · 2 oportunidades");
  });

  it("projects the insufficient card with 'Corrigir…' while a reading is left", async () => {
    const f = await insufficientFixture();
    const [card] = cards(f);
    expect(card!.payload).toMatchObject({ status: "insufficient", suggestions: ["Corrigir ou acrescentar meu site ou @", "O que muda com o plano?"] });
    const second = await insufficientFixture({ readsUsed: 2 });
    expect(cards(second)[0]!.payload).toMatchObject({ status: "insufficient", suggestions: ["Corrigir ou acrescentar meu site ou @", "O que muda com o plano?"] });
    const spent = await insufficientFixture({ readsUsed: 3 });
    expect(cards(spent)[0]!.payload).toMatchObject({ status: "insufficient", suggestions: ["O que muda com o plano?"] });
  });

  it("is atomic: if the document cannot be created, no diagnostic.recorded and no notification survive", async () => {
    const f = await confirmedHandoff();
    await claim(f);
    const broken = withRepoOverride(f.t, repos => ({ ...repos, documents: { ...repos.documents, create: async () => { throw new Error("document_version_conflict"); } } }));
    const outcome = await executeCommand(broken, { actor: JOB, workspaceId: f.workspaceId, accountId: f.accountId },
      { type: "diagnosis_record", payload: { taskIntentId: f.taskIntentId, output: GOOD, model: null, promptVersion: null } } as never).catch((error: Error) => error);
    expect(outcome).toBeInstanceOf(Error);
    expect(await docs(f)).toHaveLength(0);
    expect(await events(f, "diagnostic.recorded")).toHaveLength(0);
    expect((await events(f, "notification.requested")).filter(e => (e.payload as { templateKey?: string }).templateKey?.startsWith("diagnosis."))).toHaveLength(0);
    expect(cards(f)).toHaveLength(0);
    expect(await hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope)).toBe(false);
  });

  it("is atomic the other way round: if diagnostic.recorded cannot be written, the document is not left behind", async () => {
    const f = await confirmedHandoff();
    await claim(f);
    const broken = withRepoOverride(f.t, repos => ({ ...repos, events: { ...repos.events, create: async (scope: never, input: { eventType: string }) => {
      if (input.eventType === "diagnostic.recorded") throw new Error("event_write_failed");
      return repos.events.create(scope, input as never);
    } } }));
    const outcome = await executeCommand(broken, { actor: JOB, workspaceId: f.workspaceId, accountId: f.accountId },
      { type: "diagnosis_record", payload: { taskIntentId: f.taskIntentId, output: GOOD, model: null, promptVersion: null } } as never).catch((error: Error) => error);
    expect(outcome).toBeInstanceOf(Error);
    expect(await docs(f)).toHaveLength(0);
    expect(await events(f, "diagnostic.recorded")).toHaveLength(0);
  });

  it("is idempotent per intent: a second record of the same intent is a duplicate, no second document or event", async () => {
    const f = await confirmedHandoff();
    await claim(f);
    const first = data(await record(f));
    const again = data(await record(f));
    expect(again).toEqual({ ignored: true, duplicate: true, documentId: first.documentId });
    expect(await docs(f)).toHaveLength(1);
    expect(await events(f, "diagnostic.recorded")).toHaveLength(1);
    expect(cards(f)).toHaveLength(1);
  });

  it("is idempotent per reading: two intents of the same reading produce one document and one event", async () => {
    const f = await confirmedHandoff();
    const second = await requestDiagnosis(f.t, f.scope, f.handoffId, f.readingId);
    const first = data(await record(f));
    const duplicate = data(await record(f, GOOD, second));
    expect(duplicate).toEqual({ ignored: true, duplicate: true, documentId: first.documentId });
    expect(await docs(f)).toHaveLength(1);
    expect(await events(f, "diagnostic.recorded")).toHaveLength(1);
  });

  it("ignores a stale intent (other reading, or handoff no longer done)", async () => {
    const f = await confirmedHandoff();
    const foreign = await requestDiagnosis(f.t, f.scope, f.handoffId, crypto.randomUUID());
    expect(data(await record(f, GOOD, foreign))).toEqual({ ignored: true, reason: "stale" });
    await f.t.deps.uow.repos.handoffs.update(f.scope, f.handoffId, { step: "images" });
    expect(data(await record(f))).toEqual({ ignored: true, reason: "stale" });
    expect(await docs(f)).toHaveLength(0);
    expect(await events(f, "diagnostic.recorded")).toHaveLength(0);
  });

  it("accepts output:null only when there really is too little public text", async () => {
    const enough = await confirmedHandoff();
    const refused = await record(enough, null);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error.code).toBe("invalid_command");
    expect(await docs(enough)).toHaveLength(0);
    expect(SITE_TEXT.length).toBeGreaterThan(200);

    const short = await confirmedHandoff(makeTestDeps(), { site: "Café Aurora. Torra própria.", instagram: null });
    expect(data(await record(short, null))).toMatchObject({ status: "insufficient" });
    const [doc] = await docs(short);
    expect(doc!.content).toMatchObject({ status: "insufficient", meta: { model: null, promptVersion: null } });
  });

  it("tells an informed Instagram that yielded no text apart from one never confirmed", async () => {
    const informed = await confirmedHandoff(makeTestDeps(), { instagram: { bio: "", captions: [] } });
    await record(informed);
    expect((await docs(informed))[0]!.content).toMatchObject({ notFound: ["Instagram (sem texto público)", "público-alvo"] });
    const notInformed = await confirmedHandoff(makeTestDeps(), { instagram: null });
    await record(notInformed);
    expect((await docs(notInformed))[0]!.content).toMatchObject({ notFound: ["Instagram (não confirmado)", "público-alvo"] });
  });

  it("does not record a run that already failed", async () => {
    const f = await confirmedHandoff();
    await fail(f, "provider_error");
    expect(data(await record(f))).toEqual({ ignored: true, reason: "already_failed" });
    expect(await docs(f)).toHaveLength(0);
  });

  it("rejects a malformed payload at the envelope", async () => {
    const f = await confirmedHandoff();
    for (const payload of [{ taskIntentId: "no-uuid", output: null, model: null, promptVersion: null },
      { taskIntentId: f.taskIntentId, output: { summary: "x" }, model: null, promptVersion: null },
      { taskIntentId: f.taskIntentId, output: null, model: null, promptVersion: null, extra: 1 }]) {
      const outcome = await run(f, JOB, "diagnosis_record", payload);
      expect(outcome.ok).toBe(false);
    }
    expect(await docs(f)).toHaveLength(0);
  });
});

describe("diagnosis_fail", () => {
  it("records diagnosis.failed, keeps the state retryable for transient codes and projects the error card", async () => {
    const f = await confirmedHandoff();
    expect(data(await fail(f, "model_truncated"))).toEqual({ failed: true, retryable: true });
    const failed = await events(f, "diagnosis.failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.payload).toEqual({ taskIntentId: f.taskIntentId, code: "model_truncated", retryable: true });
    const [card] = cards(f);
    expect(card!.payload).toMatchObject({ kind: "diagnosis", status: "failed", failureCode: "model_truncated", suggestions: ["Tentar de novo"] });
    expect(await docs(f)).toHaveLength(0);
    expect(await hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope)).toBe(false);
  });

  it.each([
    ["model_truncated", true], ["diagnosis_invalid", true], ["provider_error", true], ["execution_blocked", true],
    ["budget_exceeded", false], ["model_refused", false], ["diagnosis_unavailable", false], ["qualquer_outro", false],
  ])("code %s → retryable %s", async (code, retryable) => {
    const f = await confirmedHandoff();
    expect(data(await fail(f, code))).toEqual({ failed: true, retryable });
    expect((await events(f, "diagnosis.failed"))[0]!.payload).toMatchObject({ code, retryable });
    const [card] = cards(f);
    expect((card!.payload as { suggestions: string[] }).suggestions).toEqual(retryable ? ["Tentar de novo"] : []);
  });

  it("is idempotent per intent", async () => {
    const f = await confirmedHandoff();
    await fail(f, "provider_error");
    expect(data(await fail(f, "provider_error"))).toEqual({ ignored: true, duplicate: true });
    expect(await events(f, "diagnosis.failed")).toHaveLength(1);
    expect(cards(f)).toHaveLength(1);
  });

  it("is ignored when the reading already has its document, or the intent is stale", async () => {
    const f = await confirmedHandoff();
    const recorded = data(await record(f));
    expect(data(await fail(f, "provider_error"))).toEqual({ ignored: true, duplicate: true, documentId: recorded.documentId });
    expect(await events(f, "diagnosis.failed")).toHaveLength(0);
    const g = await confirmedHandoff();
    const foreign = await requestDiagnosis(g.t, g.scope, g.handoffId, crypto.randomUUID());
    expect(data(await fail(g, "provider_error", foreign))).toEqual({ ignored: true, reason: "stale" });
  });

  it("the last allowed intent is not offered a retry", async () => {
    const f = await retryFixture();
    let intent = f.taskIntentId;
    for (let n = 1; n < DIAGNOSIS_MAX_INTENTS; n++) {
      expect(data(await fail(f, "provider_error", intent))).toEqual({ failed: true, retryable: true });
      intent = data(await run(f, f.approver, "diagnosis_retry")).taskIntentId as string;
    }
    expect(data(await fail(f, "provider_error", intent))).toEqual({ failed: true, retryable: false });
  });
});

describe("diagnosis_retry", () => {
  it("lets the approver ask again after a retryable failure: a new intent of the same reading", async () => {
    const f = await retryFixture();
    await fail(f, "provider_error");
    const retried = data(await run(f, f.approver, "diagnosis_retry"));
    expect(retried.taskIntentId).toEqual(expect.any(String));
    expect(retried.taskIntentId).not.toBe(f.taskIntentId);
    const intent = await f.t.deps.uow.repos.taskOutbox.get(f.scope, retried.taskIntentId as string);
    expect(intent).toMatchObject({ eventName: HANDOFF_DIAGNOSE_EVENT, data: { handoffId: f.handoffId, readingId: f.readingId } });
    // the old intent stays failed, the new one can run and record
    expect(data(await claim(f))).toEqual({ claimed: false, reason: "already_failed" });
    expect(data(await claim(f, retried.taskIntentId as string))).toEqual({ claimed: true });
    expect(data(await record(f, GOOD, retried.taskIntentId as string))).toMatchObject({ status: "complete" });
  });

  it("needs a previous failure: nothing to retry while running, and nothing after the document exists", async () => {
    const f = await confirmedHandoff();
    const running = await run(f, f.approver, "diagnosis_retry");
    expect(!running.ok && running.error.code).toBe("invalid_transition");
    await record(f);
    const done = await run(f, f.approver, "diagnosis_retry");
    expect(!done.ok && done.error.code).toBe("invalid_transition");
  });

  it("refuses when the failure is not retryable", async () => {
    const f = await confirmedHandoff();
    await fail(f, "budget_exceeded");
    const outcome = await run(f, f.approver, "diagnosis_retry");
    expect(!outcome.ok && outcome.error.code).toBe("diagnosis_retry_limit");
    expect((await f.t.deps.uow.repos.events.list(f.scope, { eventType: "task.requested" })).filter(e => (e.payload as { eventName: string }).eventName === HANDOFF_DIAGNOSE_EVENT)).toHaveLength(1);
  });

  it("blocks at the third intent (1 automatic + 2 manual)", async () => {
    const f = await retryFixture();
    let intent = f.taskIntentId;
    for (let n = 1; n < DIAGNOSIS_MAX_INTENTS; n++) {
      await fail(f, "provider_error", intent);
      intent = data(await run(f, f.approver, "diagnosis_retry")).taskIntentId as string;
    }
    await fail(f, "provider_error", intent);
    const blocked = await run(f, f.approver, "diagnosis_retry");
    expect(!blocked.ok && blocked.error.code).toBe("diagnosis_retry_limit");
    const requested = (await f.t.deps.uow.repos.events.list(f.scope, { eventType: "task.requested" })).filter(e => (e.payload as { eventName: string }).eventName === HANDOFF_DIAGNOSE_EVENT);
    expect(requested).toHaveLength(DIAGNOSIS_MAX_INTENTS);
  });

  it("refuses while the brand is not confirmed", async () => {
    const f = await confirmedHandoff();
    await f.t.deps.uow.repos.handoffs.update(f.scope, f.handoffId, { step: "summary" });
    const outcome = await run(f, f.approver, "diagnosis_retry");
    expect(!outcome.ok && outcome.error.code).toBe("invalid_transition");
  });
});

describe("diagnosis_correct_source", () => {
  it("reopens the source step after an insufficient diagnosis and posts the source card", async () => {
    const f = await insufficientFixture();
    const before = (await f.t.deps.uow.repos.handoffs.list(f.scope))[0]!;
    const outcome = await run(f, f.approver, "diagnosis_correct_source");
    expect(data(outcome)).toMatchObject({ handoffId: f.handoffId, step: "source", version: before.version + 1 });
    const after = (await f.t.deps.uow.repos.handoffs.list(f.scope))[0]!;
    expect(after).toMatchObject({ step: "source", version: before.version + 1 });
    const handoffCards = messages(f).filter(m => m.type === "equipe_card" && (m.payload as { kind?: string }).kind === "handoff");
    expect(handoffCards.at(-1)!.payload).toMatchObject({ kind: "handoff", step: "source", handoffId: f.handoffId });
    expect(!outcome.ok || outcome.value.events.some(e => e.eventType === "handoff.card")).toBe(true);
  });

  it("then a new source, the new confirmation and a new record produce document v2", async () => {
    const f = await insufficientFixture();
    const reopened = data(await run(f, f.approver, "diagnosis_correct_source"));
    const set = await run(f, f.approver, "handoff_set_source", { expectedStep: "source", expectedVersion: reopened.version, kind: "site", value: "https://cafenovo.com.br" });
    expect(set.ok).toBe(true);
    const row = (await f.t.deps.uow.repos.handoffs.list(f.scope))[0]!;
    expect(row).toMatchObject({ step: "reading", readsUsed: 2 });
    expect(row.readingId).not.toBe(f.readingId);
    // the rest of the brand steps is covered by handoff.test.ts: land on the confirmed state of the NEW reading
    await f.t.deps.uow.repos.handoffs.update(f.scope, f.handoffId, {
      step: "done", captured: { publicContent: [{ id: "x", value: SITE_TEXT, origin: "site" }] },
    });
    const second = await requestDiagnosis(f.t, f.scope, f.handoffId, row.readingId!);
    expect(data(await claim(f, second))).toEqual({ claimed: true });
    expect(data(await record(f, GOOD, second))).toMatchObject({ version: 2, status: "complete" });
    const all = await docs(f);
    expect(all.map(d => d.version)).toEqual([1, 2]);
    expect((all[0]!.content as { status: string }).status).toBe("insufficient"); // immutable history
    expect(await events(f, "diagnostic.recorded")).toHaveLength(2);
  });

  it("only applies to an insufficient diagnosis", async () => {
    const complete = await confirmedHandoff();
    await record(complete);
    const a = await run(complete, complete.approver, "diagnosis_correct_source");
    expect(!a.ok && a.error.code).toBe("invalid_transition");
    const none = await confirmedHandoff();
    const b = await run(none, none.approver, "diagnosis_correct_source");
    expect(!b.ok && b.error.code).toBe("invalid_transition");
    expect((await complete.t.deps.uow.repos.handoffs.list(complete.scope))[0]!.step).toBe("done");
  });

  it("allows the correction while a reading is left (readsUsed 2) and stops at the limit (readsUsed 3 → reading_limit)", async () => {
    const allowed = await insufficientFixture({ readsUsed: 2 });
    expect((await run(allowed, allowed.approver, "diagnosis_correct_source")).ok).toBe(true);
    const f = await insufficientFixture({ readsUsed: 3 });
    const outcome = await run(f, f.approver, "diagnosis_correct_source");
    expect(!outcome.ok && outcome.error.code).toBe("reading_limit");
    expect((await f.t.deps.uow.repos.handoffs.list(f.scope))[0]!.step).toBe("done");
  });
});

describe("actors and account", () => {
  it("claim / record / fail belong to the diagnosis task only", async () => {
    const f = await confirmedHandoff();
    const others: Actor[] = [f.approver, testActors.agent!, testActors.support!, testActors.operations!, { kind: "system", job: "equipe.handoff.read" }, { kind: "system", job: "free-open" }];
    for (const actor of others) {
      for (const [type, payload] of [
        ["diagnosis_claim", { taskIntentId: f.taskIntentId }],
        ["diagnosis_record", { taskIntentId: f.taskIntentId, output: GOOD, model: null, promptVersion: null }],
        ["diagnosis_fail", { taskIntentId: f.taskIntentId, code: "provider_error" }],
      ] as const) {
        const outcome = await run(f, actor, type, payload);
        expect(outcome.ok).toBe(false);
        expect(!outcome.ok && outcome.error.code).toBe("forbidden_actor");
      }
    }
    expect(await docs(f)).toHaveLength(0);
    expect(await events(f, "diagnosis.failed")).toHaveLength(0);
  });

  it("retry / correct_source belong to the approver only", async () => {
    const f = await insufficientFixture();
    for (const actor of [JOB, testActors.substitute!, testActors.member!, testActors.agent!, testActors.support!] as Actor[]) {
      for (const type of ["diagnosis_retry", "diagnosis_correct_source"]) {
        const outcome = await run(f, actor, type);
        expect(outcome.ok).toBe(false);
        expect(!outcome.ok && outcome.error.code).toBe("forbidden_actor");
      }
    }
    expect((await f.t.deps.uow.repos.handoffs.list(f.scope))[0]!.step).toBe("done");
  });

  it("a free account runs all five commands (none needs a plan)", async () => {
    for (const type of ["diagnosis_claim", "diagnosis_record", "diagnosis_fail", "diagnosis_retry", "diagnosis_correct_source"] as const) {
      expect(FREE_ACCOUNT_COMMANDS.has(type)).toBe(true);
    }
    const f = await confirmedHandoff();
    const account = await f.t.deps.uow.repos.accounts.get(f.workspaceId, f.accountId);
    expect(account!.status).toBe("free");
    const outcomes = [await claim(f), await fail(f, "provider_error"), await run(f, f.approver, "diagnosis_retry")];
    const g = await insufficientFixture();
    outcomes.push(await run(g, g.approver, "diagnosis_correct_source"));
    const h = await confirmedHandoff();
    outcomes.push(await record(h));
    for (const outcome of outcomes) {
      expect(outcome.ok).toBe(true);
      expect(!outcome.ok && outcome.error.code).not.toBe("requires_plan");
    }
  });
});

/** Runs the command against a unit of work whose repositories are patched inside the transaction. */
function withRepoOverride(t: TestDeps, patch: (repos: TestDeps["deps"]["uow"]["repos"]) => unknown) {
  const uow = t.deps.uow;
  return { ...t.deps, uow: { ...uow, run: ((fn: (repos: never, internal: never) => Promise<unknown>) => uow.run((repos, internal) => fn(patch(repos) as never, internal as never))) as typeof uow.run } };
}

describe("ordering of intents under a frozen clock", () => {
  it("two intents of the same instant keep their insertion order: retry works round after round", async () => {
    for (let round = 0; round < 10; round++) {
      const f = await confirmedHandoff(); // frozen clock: every intent shares one instant
      await fail(f, "provider_error");
      const second = data(await run(f, f.approver, "diagnosis_retry")).taskIntentId as string;
      // the newest intent is the one being judged: no failure yet, so nothing to retry
      const early = await run(f, f.approver, "diagnosis_retry");
      expect(!early.ok && early.error.code).toBe("invalid_transition");
      await fail(f, "provider_error", second);
      const third = data(await run(f, f.approver, "diagnosis_retry")).taskIntentId as string;
      await fail(f, "provider_error", third);
      const blocked = await run(f, f.approver, "diagnosis_retry");
      expect(!blocked.ok && blocked.error.code).toBe("diagnosis_retry_limit");
    }
  });
});

describe("diagnosis_correct_source — balance and re-reserve", () => {
  const saved = new Map<string, string | undefined>();
  const setEnv = (key: string, value: string | number) => {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    process.env[key] = String(value);
  };
  afterEach(() => {
    for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    saved.clear();
  });
  const balance = (f: Fixture, cents: number) => { f.t.deps.freeBudget = { remainingUsdCents: async () => cents }; };
  const snapshot = async (f: Fixture) => ({
    handoff: (await f.t.deps.uow.repos.handoffs.list(f.scope))[0]!,
    reopened: (await events(f, "diagnosis.reopened")).length,
    cards: (await events(f, "handoff.card")).length,
  });

  it("the requirement is the diagnosis reserve plus the largest reading", () => {
    expect(sourceCorrectionRequirementUsdCents()).toBe(10 + readingMaxAdmissionUsdCents());
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 30);
    expect(sourceCorrectionRequirementUsdCents()).toBe(30 + readingMaxAdmissionUsdCents());
  });

  it("a balance below the requirement changes nothing: insufficient_balance, step done, no reopened event, no source card", async () => {
    const f = await insufficientFixture();
    const before = await snapshot(f);
    balance(f, sourceCorrectionRequirementUsdCents() - 1);
    const outcome = await run(f, f.approver, "diagnosis_correct_source");
    expect(!outcome.ok && outcome.error.code).toBe("insufficient_balance");
    const after = await snapshot(f);
    expect(after.handoff).toMatchObject({ step: "done", version: before.handoff.version, readsUsed: before.handoff.readsUsed });
    expect(after.reopened).toBe(0);
    expect(after.cards).toBe(before.cards);
    expect(await hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope)).toBe(true);
  });

  it("a balance exactly equal to the requirement reopens", async () => {
    const f = await insufficientFixture();
    balance(f, sourceCorrectionRequirementUsdCents());
    expect((await run(f, f.approver, "diagnosis_correct_source")).ok).toBe(true);
    expect((await snapshot(f)).handoff.step).toBe("source");
  });

  it("does not ask a paying workspace's free brand for the free balance (spec 2026-10-07 §3)", async () => {
    const f = await insufficientFixture();
    f.t.deps.hasClassicPaidAccess = async () => true;
    balance(f, 0);
    expect((await run(f, f.approver, "diagnosis_correct_source")).ok).toBe(true);
    expect((await snapshot(f)).handoff.step).toBe("source");
  });

  it("follows the configured reserve and the reading admission maximum", async () => {
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 30);
    const f = await insufficientFixture();
    const need = 30 + readingMaxAdmissionUsdCents();
    balance(f, need - 1);
    const refused = await run(f, f.approver, "diagnosis_correct_source");
    expect(!refused.ok && refused.error.code).toBe("insufficient_balance");
    balance(f, need);
    expect((await run(f, f.approver, "diagnosis_correct_source")).ok).toBe(true);
  });

  it("fails closed without a free-budget reader", async () => {
    const f = await insufficientFixture();
    delete f.t.deps.freeBudget;
    const outcome = await run(f, f.approver, "diagnosis_correct_source");
    expect(!outcome.ok && outcome.error.code).toBe("insufficient_balance");
    expect((await snapshot(f)).handoff.step).toBe("done");
  });

  it("the balance check comes after the state rules (complete diagnosis, no readings left)", async () => {
    const complete = await confirmedHandoff();
    await record(complete);
    balance(complete, 0);
    const a = await run(complete, complete.approver, "diagnosis_correct_source");
    expect(!a.ok && a.error.code).toBe("invalid_transition");
    const spent = await insufficientFixture({ readsUsed: 3 });
    balance(spent, 0);
    const b = await run(spent, spent.approver, "diagnosis_correct_source");
    expect(!b.ok && b.error.code).toBe("reading_limit");
  });

  it("writes diagnosis.reopened {documentId} together with the step change and the source card", async () => {
    const f = await insufficientFixture();
    const [doc] = await docs(f);
    const outcome = await run(f, f.approver, "diagnosis_correct_source");
    expect(outcome.ok).toBe(true);
    const reopened = await events(f, "diagnosis.reopened");
    expect(reopened).toHaveLength(1);
    expect(reopened[0]!.payload).toEqual({ documentId: doc!.id });
    expect(reopened[0]).toMatchObject({ objectType: "document", objectId: doc!.id });
    expect(!outcome.ok || outcome.value.events.map(e => e.eventType)).toEqual(expect.arrayContaining(["diagnosis.reopened", "handoff.card"]));
  });

  it("while reopened the diagnosis does not count as recorded; the successor (v2) makes it count again", async () => {
    const f = await insufficientFixture();
    expect(await hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope)).toBe(true);
    const reopened = data(await run(f, f.approver, "diagnosis_correct_source"));
    expect(await hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope)).toBe(false);
    await run(f, f.approver, "handoff_set_source", { expectedStep: "source", expectedVersion: reopened.version, kind: "site", value: "https://cafenovo.com.br" });
    const row = (await f.t.deps.uow.repos.handoffs.list(f.scope))[0]!;
    await f.t.deps.uow.repos.handoffs.update(f.scope, f.handoffId, { step: "done", captured: { publicContent: [{ id: "x", value: SITE_TEXT, origin: "site" }] } });
    const second = await requestDiagnosis(f.t, f.scope, f.handoffId, row.readingId!);
    expect(await hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope)).toBe(false); // still pending
    expect(data(await record(f, GOOD, second))).toMatchObject({ version: 2 });
    expect(await hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope)).toBe(true);
  });
});

describe("diagnosis_record stores the source's wording", () => {
  it("sources[].quote is the text of the source, not the model's spelling", async () => {
    const f = await confirmedHandoff();
    await claim(f);
    await record(f, { ...GOOD, opportunities: [{ title: "Mostrar a origem", evidence: [{ source: "site", quote: "TORRAMOS CAFÉ ESPECIAL **de origem única**" }] }] });
    const [doc] = await docs(f);
    const quotes = (doc!.content as { sources: Array<{ quote: string; supports: string }> }).sources.filter(item => item.supports === "opportunity:1").map(item => item.quote);
    expect(quotes).toEqual(["Torramos café especial de origem única"]);
    expect(SITE_TEXT).toContain(quotes[0]!);
  });

  it("curly quotes and edge punctuation of the model are not part of the stored quote", async () => {
    const f = await confirmedHandoff();
    await claim(f);
    await record(f, { ...GOOD, opportunities: [{ title: "Explicar a assinatura", evidence: [{ source: "site", quote: "“VENDEMOS café em grãos, moído e por assinatura mensal”." }] }] });
    const [doc] = await docs(f);
    expect((doc!.content as { sources: Array<{ quote: string; supports: string }> }).sources.find(item => item.supports === "opportunity:1")!.quote)
      .toBe("Vendemos café em grãos, moído e por assinatura mensal");
  });
});

describe("the plan gate after a correction that cannot finish", () => {
  const plan = (f: Fixture) => run(f, f.approver, "request_support", { purpose: "plan" });
  const exceptions = (f: Fixture) => f.t.deps.uow.repos.exceptions.list(f.scope);
  const READER = { kind: "system", job: "equipe.handoff.read" } as const;

  async function reopenedAndSourced(readsUsed: number) {
    const f = await insufficientFixture({ readsUsed });
    advancingClock(f.t);
    const reopened = data(await run(f, f.approver, "diagnosis_correct_source"));
    const set = await run(f, f.approver, "handoff_set_source", { expectedStep: "source", expectedVersion: reopened.version, kind: "site", value: "https://cafenovo.com.br" });
    expect(set.ok).toBe(true);
    return f;
  }
  /** The corrected reading finished and the brand is confirmed again (the rest of the steps is covered by handoff.test.ts). */
  async function confirmedAgain(f: Fixture) {
    const row = (await f.t.deps.uow.repos.handoffs.list(f.scope))[0]!;
    await f.t.deps.uow.repos.handoffs.update(f.scope, f.handoffId, { step: "done", captured: { publicContent: [{ id: "x", value: SITE_TEXT, origin: "site" }] } });
    return requestDiagnosis(f.t, f.scope, f.handoffId, row.readingId!);
  }

  it("(i) the last reading runs out without moving on: the plan request is refused before it ends and accepted after", async () => {
    const f = await reopenedAndSourced(2); // set_source spends the third reading
    const row = (await f.t.deps.uow.repos.handoffs.list(f.scope))[0]!;
    expect(row).toMatchObject({ step: "reading", readsUsed: 3 });
    expect(await hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope)).toBe(false);

    const refused = await plan(f);
    expect(!refused.ok && refused.error.code).toBe("invalid_transition");
    expect(await exceptions(f)).toHaveLength(0);

    // every group comes back; the name failed, so the brand cannot go on
    const entries = Object.entries(row.reading) as Array<[string, { runId: string; taskIntentId: string }]>;
    expect(entries.length).toBeGreaterThan(0);
    for (const [index, [group, runInfo]] of entries.entries()) {
      const result = await run(f, READER, "handoff_record_group", {
        readingId: row.readingId, runId: runInfo.runId, taskIntentId: runInfo.taskIntentId, group,
        result: group === "name" ? { status: "failed", items: [], error: "sem nome" } : { status: "not_found", items: [] },
      });
      expect(result.ok).toBe(true);
      if (index < entries.length - 1) {
        // while any group is still pending the earlier diagnosis keeps being replaced
        expect(await hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope)).toBe(false);
      }
    }
    expect((await f.t.deps.uow.repos.handoffs.list(f.scope))[0]).toMatchObject({ step: "reading", readsUsed: 3 });
    expect(await hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope)).toBe(true);

    const accepted = await plan(f);
    expect(accepted.ok).toBe(true);
    expect(await exceptions(f)).toHaveLength(1);
  });

  it("(ii) the v2 diagnosis failing for good opens the plan: refused after a retryable failure, accepted after a final one", async () => {
    const final = await reopenedAndSourced(1);
    const intent = await confirmedAgain(final);
    expect((await plan(final)).ok).toBe(false);
    expect(data(await fail(final, "budget_exceeded", intent))).toEqual({ failed: true, retryable: false });
    expect((await plan(final)).ok).toBe(true);
    expect(await exceptions(final)).toHaveLength(1);

    const transient = await reopenedAndSourced(1);
    const first = await confirmedAgain(transient);
    expect(data(await fail(transient, "provider_error", first))).toEqual({ failed: true, retryable: true });
    const stillRefused = await plan(transient);
    expect(!stillRefused.ok && stillRefused.error.code).toBe("invalid_transition");
    expect(await exceptions(transient)).toHaveLength(0);
  });

  it("(ii) after two manual retries the third failure is final and the plan request is accepted", async () => {
    const f = await reopenedAndSourced(1);
    let intent = await confirmedAgain(f);
    for (let n = 1; n < DIAGNOSIS_MAX_INTENTS; n++) {
      await fail(f, "provider_error", intent);
      expect((await plan(f)).ok).toBe(false);
      intent = data(await run(f, f.approver, "diagnosis_retry")).taskIntentId as string;
    }
    expect(data(await fail(f, "provider_error", intent))).toEqual({ failed: true, retryable: false });
    expect((await plan(f)).ok).toBe(true);
  });
});

describe("diagnosis_restore_previous — give up the correction (review of PR 612)", () => {
  const restore = (f: Fixture, payload: Record<string, unknown> = {}, actor: Actor = f.approver) => run(f, actor, "diagnosis_restore_previous", payload);
  const handoffRow = async (f: Fixture) => (await f.t.deps.uow.repos.handoffs.list(f.scope))[0]!;
  const reopen = async (f: Fixture) => data(await run(f, f.approver, "diagnosis_correct_source"));
  const counts = async (f: Fixture) => ({
    documents: (await docs(f)).length,
    recorded: (await events(f, "diagnostic.recorded")).length,
    intents: (await f.t.deps.uow.repos.events.list(f.scope, { eventType: "task.requested" })).length,
    doneMessages: messages(f).filter(m => m.type === "assistant" && (m.payload as { handoffStep?: string } | null)?.handoffStep === "done").length,
  });

  it("happy path: back to done, no reading spent, the earlier diagnosis counts again and its card reappears", async () => {
    const f = await insufficientFixture();
    advancingClock(f.t);
    const before = await handoffRow(f);
    const [doc] = await docs(f);
    await reopen(f);
    expect(await hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope)).toBe(false);
    const reopenedCounts = await counts(f);
    const cardsBefore = cards(f).length;

    const restored = data(await restore(f));
    expect(restored).toMatchObject({ handoffId: f.handoffId, step: "done", version: before.version + 2, documentId: doc!.id });
    expect(await handoffRow(f)).toMatchObject({ step: "done", version: before.version + 2, readsUsed: before.readsUsed, readingId: f.readingId });

    const restoredEvents = await events(f, "diagnosis.restored");
    expect(restoredEvents).toHaveLength(1);
    expect(restoredEvents[0]!.payload).toEqual({ documentId: doc!.id });
    expect(restoredEvents[0]).toMatchObject({ objectType: "document", objectId: doc!.id });
    expect(await hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope)).toBe(true);

    // nothing new was written besides the event and the card
    expect(await counts(f)).toEqual(reopenedCounts);
    // the earlier diagnosis card is shown again (an immutable copy of the same document), not the "marca confirmada" line
    const shown = cards(f);
    expect(shown).toHaveLength(cardsBefore + 1);
    expect(shown.at(-1)!.payload).toMatchObject({ kind: "diagnosis", status: "insufficient", documentId: doc!.id, suggestions: ["Corrigir ou acrescentar meu site ou @", "O que muda com o plano?"] });

    // the plan request is accepted again
    expect((await run(f, f.approver, "request_support", { purpose: "plan" })).ok).toBe(true);
  });

  it("the card keeps 'Corrigir…' only while readings are left (readsUsed 3: only the plan question)", async () => {
    const f = await insufficientFixture({ readsUsed: 2 });
    await reopen(f);
    await f.t.deps.uow.repos.handoffs.update(f.scope, f.handoffId, { readsUsed: 3 });
    data(await restore(f));
    expect(cards(f).at(-1)!.payload).toMatchObject({ suggestions: ["O que muda com o plano?"] });
  });

  it("projects the card even while execution is suspended", async () => {
    const f = await insufficientFixture();
    await reopen(f);
    await f.t.deps.uow.repos.pauses.create(f.scope, { level: "execution", scope: "account", origin: "security", resumableBy: "operations", reason: "teste" });
    const before = cards(f).length;
    data(await restore(f));
    expect(cards(f)).toHaveLength(before + 1);
  });

  it("a stale version is refused; the current version (and expectedStep) are accepted", async () => {
    const f = await insufficientFixture();
    const reopened = await reopen(f);
    const stale = await restore(f, { expectedStep: "source", expectedVersion: (reopened.version as number) - 1 });
    expect(!stale.ok && stale.error.code).toBe("stale_version");
    expect((await handoffRow(f)).step).toBe("source");
    expect(data(await restore(f, { expectedStep: "source", expectedVersion: reopened.version as number }))).toMatchObject({ step: "done" });
  });

  it("refuses a payload with an extra key or a wrong type", async () => {
    const f = await insufficientFixture();
    await reopen(f);
    for (const payload of [{ documentId: "x" }, { expectedVersion: "2" }, { expectedStep: 3 }]) {
      const outcome = await restore(f, payload);
      expect(outcome.ok).toBe(false);
    }
    expect((await handoffRow(f)).step).toBe("source");
  });

  it("only the approver: the job, a member, a substitute, the agent and staff get forbidden_actor", async () => {
    const f = await insufficientFixture();
    await reopen(f);
    for (const actor of [JOB, testActors.member!, testActors.substitute!, testActors.agent!, testActors.support!] as Actor[]) {
      const outcome = await restore(f, {}, actor);
      expect(!outcome.ok && outcome.error.code).toBe("forbidden_actor");
    }
    expect((await handoffRow(f)).step).toBe("source");
    expect(await events(f, "diagnosis.restored")).toHaveLength(0);
  });

  it("refused once a new reading started (after handoff_set_source): the earlier diagnosis cannot come back", async () => {
    const f = await insufficientFixture();
    const reopened = await reopen(f);
    expect((await run(f, f.approver, "handoff_set_source", { expectedStep: "source", expectedVersion: reopened.version, kind: "site", value: "https://cafenovo.com.br" })).ok).toBe(true);
    const outcome = await restore(f);
    expect(!outcome.ok && outcome.error.code).toBe("invalid_transition");
    expect((await handoffRow(f)).step).toBe("reading");
    expect(await events(f, "diagnosis.restored")).toHaveLength(0);
  });

  it("refused when the diagnosis was never reopened (the brand is simply done)", async () => {
    const f = await insufficientFixture();
    const outcome = await restore(f);
    expect(!outcome.ok && outcome.error.code).toBe("invalid_transition");
    expect((await handoffRow(f)).step).toBe("done");
  });

  it("refused when the source step has the reading's diagnosis but it was never REOPENED (nothing to give up)", async () => {
    const f = await insufficientFixture();
    await f.t.deps.uow.repos.handoffs.update(f.scope, f.handoffId, { step: "source" }); // e.g. a brand step moved by another path, no diagnosis.reopened
    const outcome = await restore(f);
    expect(!outcome.ok && outcome.error.code).toBe("invalid_transition");
    expect((await handoffRow(f)).step).toBe("source");
    expect(await events(f, "diagnosis.restored")).toHaveLength(0);
  });

  it("refused when the source step has no diagnosis document (a first handoff back at the source step)", async () => {
    const f = await confirmedHandoff();
    await f.t.deps.uow.repos.handoffs.update(f.scope, f.handoffId, { step: "source" });
    const outcome = await restore(f);
    expect(!outcome.ok && outcome.error.code).toBe("invalid_transition");
    const first = await confirmedHandoff();
    await first.t.deps.uow.repos.handoffs.update(first.scope, first.handoffId, { step: "source", readingId: null, readsUsed: 0 });
    const noReading = await restore(first);
    expect(!noReading.ok && noReading.error.code).toBe("invalid_transition");
  });

  it("a second restore is refused (the step is already done)", async () => {
    const f = await insufficientFixture();
    await reopen(f);
    data(await restore(f));
    const again = await restore(f);
    expect(!again.ok && again.error.code).toBe("invalid_transition");
    expect(await events(f, "diagnosis.restored")).toHaveLength(1);
  });

  it("after restoring, the person can correct again and restore again while readings are left", async () => {
    const f = await insufficientFixture();
    advancingClock(f.t);
    await reopen(f);
    data(await restore(f));
    const second = await reopen(f);
    expect(second).toMatchObject({ step: "source" });
    data(await restore(f));
    expect(await events(f, "diagnosis.reopened")).toHaveLength(2);
    expect(await events(f, "diagnosis.restored")).toHaveLength(2);
    expect(await hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope)).toBe(true);
    expect((await handoffRow(f)).readsUsed).toBe(1);
  });

  it("works for a free account (no plan needed)", async () => {
    const f = await insufficientFixture();
    await reopen(f);
    const outcome = await restore(f);
    expect(outcome.ok).toBe(true);
    expect(!outcome.ok && outcome.error.code).not.toBe("requires_plan");
  });
});

describe("the brand step only moves through the state machine (review of PR 612)", () => {
  it("diagnosis_correct_source takes its step and version from transitionHandoff: it only reopens from done and bumps once", async () => {
    const f = await insufficientFixture();
    const before = (await f.t.deps.uow.repos.handoffs.list(f.scope))[0]!;
    const out = data(await run(f, f.approver, "diagnosis_correct_source"));
    expect(out).toMatchObject({ step: "source", version: before.version + 1 });
    // not from any other step
    const g = await insufficientFixture();
    await g.t.deps.uow.repos.handoffs.update(g.scope, g.handoffId, { step: "summary" });
    const refused = await run(g, g.approver, "diagnosis_correct_source");
    expect(!refused.ok && refused.error.code).toBe("invalid_transition");
  });
});
