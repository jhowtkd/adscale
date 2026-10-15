import { describe, expect, it, vi } from "vitest";
import { executeCommand } from "./commands";
import { ideaVersionHash } from "./ideas-decide";
import { makeTestDeps, openTestAccount } from "./testing/deps";
import { createAgentWorkOutboxHandler } from "../jobs/agent-work-outbox";
import { createIdeaRejectionEvidenceHandler } from "../jobs/idea-evidence";
import { consumeIdeaRejectionEvidence, listIdeaRejectionEvidenceForBrand, IDEA_REJECTION_EVIDENCE_EVENT, IDEA_REJECTION_EVIDENCE_TASK_EVENT } from "./idea-evidence";

async function fixture(kind: "content" | "plan_change" | "mandate_change" = "content", decision: "reject" | "approve" = "reject", reason = "Menos formal") {
  const t = makeTestDeps();
  const ids = await openTestAccount(t);
  const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
  const idea = await t.deps.uow.repos.ideas.create(scope, { kind, payload: { title: "Guia de presentes" } });
  const outcome = await executeCommand(t.deps, { ...scope, actor: ids.actors.approver }, {
    type: "decide_idea", payload: { ideaId: idea.id, decision, expectedVersionHash: ideaVersionHash(idea), reason },
  });
  if (!outcome.ok) throw new Error(outcome.error.code);
  const source = outcome.value.events.find(event => event.eventType === "idea.decided")!;
  const authorize = vi.fn(async () => ({ allowed: true as const }));
  return { t, ids, scope, idea, source, deps: { uow: t.deps.uow, authorize },
    brandScope: { workspaceId: ids.workspaceId, clientProfileId: ids.profileId } };
}

describe("content idea rejection evidence", () => {
  it("keeps the decided hash, reason and actor once, without creating a Peça or receipt", async () => {
    const f = await fixture();
    const before = await f.deps.uow.repos.ideas.get(f.scope, f.idea.id);
    const receipts = await f.deps.uow.repos.receipts.list(f.scope);
    const first = await consumeIdeaRejectionEvidence(f.deps, f.scope, f.source.id);
    expect(await consumeIdeaRejectionEvidence(f.deps, f.scope, f.source.id)).toEqual(first);
    const evidence = await listIdeaRejectionEvidenceForBrand(f.deps, f.brandScope);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ sourceEventId: f.source.id, ideaId: f.idea.id,
      versionHash: ideaVersionHash(f.idea), reason: "Menos formal", clientProfileId: f.ids.profileId,
      actorType: "client_person", actorId: f.source.actorId, actorRole: "approver",
      evidenceRef: { kind: "equipe_event", id: first!.id } });
    expect(await f.deps.uow.repos.ideas.get(f.scope, f.idea.id)).toEqual(before);
    expect(await f.deps.uow.repos.receipts.list(f.scope)).toEqual(receipts);
    expect(await f.deps.uow.repos.items.list(f.scope)).toEqual([]);
    expect(await f.deps.uow.repos.taskOutbox.list(f.scope)).toMatchObject([
      { eventName: IDEA_REJECTION_EVIDENCE_TASK_EVENT, data: { sourceEventId: f.source.id } },
    ]);
    expect(first?.eventType).toBe(IDEA_REJECTION_EVIDENCE_EVENT);
  });

  it("dispatches the committed intent on a closed account and retries evidence after failure", async () => {
    const f = await fixture();
    await f.deps.uow.repos.accounts.update(f.scope.workspaceId, f.scope.accountId, { status: "closed" });
    const step = { run: async <T>(_name: string, fn: () => Promise<T>) => fn(), sendEvent: vi.fn() };
    const dispatch = createAgentWorkOutboxHandler({ uow: f.deps.uow, clock: f.t.deps.clock, gatewayFor: () => f.t.gateway });
    step.sendEvent.mockRejectedValueOnce(new Error("transport unavailable"));
    expect(await dispatch({ step })).toEqual({ emitted: 0 });
    expect(await dispatch({ step })).toEqual({ emitted: 1 });
    const event = step.sendEvent.mock.calls[1][1];
    expect(event).toMatchObject({ name: IDEA_REJECTION_EVIDENCE_TASK_EVENT, data: { ...f.scope, sourceEventId: f.source.id } });
    const consume = createIdeaRejectionEvidenceHandler(f.deps);
    f.deps.authorize.mockRejectedValueOnce(new Error("temporary failure"));
    await expect(consume({ event, step })).rejects.toThrow("temporary failure");
    expect(await f.deps.uow.repos.events.list(f.scope, { eventType: IDEA_REJECTION_EVIDENCE_EVENT })).toEqual([]);
    expect(await consume({ event, step })).toMatchObject({ recorded: true });
    expect(await consume({ event, step })).toMatchObject({ recorded: true });
    expect(await listIdeaRejectionEvidenceForBrand(f.deps, f.brandScope)).toHaveLength(1);
    expect(await dispatch({ step })).toEqual({ emitted: 0 });
  });

  it.each(["plan_change", "mandate_change"] as const)("keeps %s decisions in governance", async kind => {
    for (const decision of ["reject", "approve"] as const) {
      const f = await fixture(kind, decision);
      expect(await consumeIdeaRejectionEvidence(f.deps, f.scope, f.source.id)).toBeNull();
      expect(await listIdeaRejectionEvidenceForBrand(f.deps, f.brandScope)).toEqual([]);
      expect(await f.deps.uow.repos.taskOutbox.list(f.scope)).toEqual([]);
    }
  });

  it("does not learn from approved content", async () => {
    const f = await fixture("content", "approve");
    expect(f.source.payload).toMatchObject({ versionHash: ideaVersionHash(f.idea) });
    expect(await consumeIdeaRejectionEvidence(f.deps, f.scope, f.source.id)).toBeNull();
    expect(await f.deps.uow.repos.taskOutbox.list(f.scope)).toEqual([]);
  });

  it("uses the event hash after the idea changes and serializes concurrent delivery", async () => {
    const f = await fixture();
    await f.deps.uow.repos.ideas.update(f.scope, f.idea.id, { payload: { title: "Conteúdo posterior" } });
    await Promise.all([consumeIdeaRejectionEvidence(f.deps, f.scope, f.source.id), consumeIdeaRejectionEvidence(f.deps, f.scope, f.source.id)]);
    expect(await listIdeaRejectionEvidenceForBrand(f.deps, f.brandScope)).toMatchObject([
      { versionHash: ideaVersionHash(f.idea), reason: "Menos formal" },
    ]);
    expect(await f.deps.uow.repos.events.list(f.scope, { eventType: IDEA_REJECTION_EVIDENCE_EVENT })).toHaveLength(1);
  });

  it("reads only human evidence even when agent evidence is already stored", async () => {
    const f = await fixture();
    const human = await consumeIdeaRejectionEvidence(f.deps, f.scope, f.source.id);
    expect(human).not.toBeNull();
    await f.deps.uow.repos.events.create(f.scope, {
      eventType: IDEA_REJECTION_EVIDENCE_EVENT, objectType: "learning_evidence", objectId: f.source.id,
      actorType: "agent", actorId: "estrategista", actorRole: "strategist", payload: human!.payload,
    });
    expect(await f.deps.uow.repos.events.list(f.scope, { eventType: IDEA_REJECTION_EVIDENCE_EVENT })).toHaveLength(2);
    const evidence = await listIdeaRejectionEvidenceForBrand(f.deps, f.brandScope);
    expect(evidence.map(event => event.id)).toEqual([human!.id]);
    expect(evidence[0]).toMatchObject({ actorType: "client_person", actorId: f.source.actorId, actorRole: "approver" });
  });

  it.each(["versionHash", "invalidHash", "actorId", "actorRole", "actorType"])("preserves the historical limitation for missing or invalid %s", async missing => {
    const f = await fixture();
    const source = { ...f.source };
    if (missing === "versionHash") source.payload = { decision: "reject", kind: "content", reason: "Menos formal" };
    if (missing === "invalidHash") source.payload = { decision: "reject", kind: "content", reason: "Menos formal", versionHash: "unknown" };
    if (missing === "actorId" || missing === "actorRole") source[missing] = null;
    if (missing === "actorType") source.actorType = "agent";
    f.t.store.events.rows.set(source.id, source);
    expect(await consumeIdeaRejectionEvidence(f.deps, f.scope, source.id)).toBeNull();
    expect(await listIdeaRejectionEvidenceForBrand(f.deps, f.brandScope)).toEqual([]);
  });

  it("sanitizes secrets and marks the changed reason", async () => {
    const f = await fixture("content", "reject", "DATABASE_URL=postgres://secret");
    await consumeIdeaRejectionEvidence(f.deps, f.scope, f.source.id);
    expect(await listIdeaRejectionEvidenceForBrand(f.deps, f.brandScope)).toMatchObject([
      { reason: null, evidenceSanitized: true, versionHash: ideaVersionHash(f.idea) },
    ]);
  });

  it("preserves an absent reason without inventing one", async () => {
    const f = await fixture();
    f.t.store.events.rows.set(f.source.id, { ...f.source, payload: { decision: "reject", kind: "content", reason: null, versionHash: ideaVersionHash(f.idea) } });
    await consumeIdeaRejectionEvidence(f.deps, f.scope, f.source.id);
    expect(await listIdeaRejectionEvidenceForBrand(f.deps, f.brandScope)).toMatchObject([{ reason: null, evidenceSanitized: false }]);
  });

  it("denies capture and reading and isolates workspace and brand", async () => {
    const f = await fixture();
    const denied = { ...f.deps, authorize: async () => ({ allowed: false as const, reason: "local_learning_denied" as const }) };
    await expect(consumeIdeaRejectionEvidence(denied, f.scope, f.source.id)).rejects.toMatchObject({ reason: "local_learning_denied" });
    expect(await f.deps.uow.repos.events.list(f.scope, { eventType: IDEA_REJECTION_EVIDENCE_EVENT })).toEqual([]);
    expect(await consumeIdeaRejectionEvidence(f.deps, { ...f.scope, workspaceId: crypto.randomUUID() }, f.source.id)).toBeNull();
    await consumeIdeaRejectionEvidence(f.deps, f.scope, f.source.id);
    expect(await listIdeaRejectionEvidenceForBrand(f.deps, { ...f.brandScope, clientProfileId: crypto.randomUUID() })).toEqual([]);
    await expect(listIdeaRejectionEvidenceForBrand(denied, f.brandScope)).rejects.toMatchObject({ reason: "local_learning_denied" });
  });

  it.each(["workspaceId", "accountId", "sourceEventId", "taskIntentId"])("ignores unrelated %s in task delivery", async field => {
    const f = await fixture();
    const [intent] = await f.deps.uow.repos.taskOutbox.list(f.scope);
    const step = { run: async <T>(_name: string, fn: () => Promise<T>) => fn() };
    expect(await createIdeaRejectionEvidenceHandler(f.deps)({ event: { data: {
      ...f.scope, sourceEventId: f.source.id, taskIntentId: intent.id, [field]: crypto.randomUUID(),
    } }, step })).toEqual({ recorded: false, evidenceId: null });
    expect(await listIdeaRejectionEvidenceForBrand(f.deps, f.brandScope)).toEqual([]);
  });

  it("rolls back the decision and source hash if storing the intent fails", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const idea = await t.deps.uow.repos.ideas.create(scope, { kind: "content", payload: { title: "Guia" } });
    const run = t.deps.uow.run.bind(t.deps.uow);
    vi.spyOn(t.deps.uow, "run").mockImplementation(fn => run(repos => fn({ ...repos,
      taskOutbox: { ...repos.taskOutbox, create: async () => { throw new Error("intent failed"); } },
    })));
    await expect(executeCommand(t.deps, { ...scope, actor: ids.actors.approver }, { type: "decide_idea",
      payload: { ideaId: idea.id, decision: "reject", expectedVersionHash: ideaVersionHash(idea) } })).rejects.toThrow("intent failed");
    expect((await t.deps.uow.repos.ideas.get(scope, idea.id))?.status).toBe("proposed");
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "idea.decided" })).toEqual([]);
  });
});
