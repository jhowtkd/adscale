import { describe, expect, it, vi } from "vitest";
import { executeCommand } from "./commands";
import { authorizeAccountExecution } from "./execution-authorization";
import { getItemDetail } from "./queries";
import { ctx, deliverTestBatch, frontIdOf, seedWork, setup } from "./testing/items";
import { openTestAccount } from "./testing/deps";
import { createAgentWorkOutboxHandler } from "../jobs/agent-work-outbox";
import { createAgentWorkHandler } from "../agents/agent-work";
import { createEquipeAgents } from "../agents/runner";
import { FakeModelClient } from "../agents/testing";
import { MemoryLedgerStore } from "../agents/ledger";
import { buildStrategistTools, executeStrategistTool, runStrategistTurn } from "../agents/strategist";
import { postProactiveMessage } from "../agents/proactive";
import { contextVersionHash } from "./context";

const step = { run: async <T>(_name: string, fn: () => Promise<T>) => fn() };

async function pause(t: Awaited<ReturnType<typeof setup>>["t"], ids: Awaited<ReturnType<typeof setup>>["ids"], level: "execution" | "billing" | "publishing") {
  const type = level === "execution" ? "suspend_execution" : level === "billing" ? "pause_delinquency" : "pause_publications";
  const actor = level === "execution" ? ids.actors.operations : level === "billing" ? ids.actors.system : ids.actors.approver;
  const result = await executeCommand(t.deps, ctx(ids, actor), { type, payload: {} });
  if (!result.ok) throw new Error(`pause failed: ${result.error.code}`);
  return result.value.data.pauseId as string;
}

async function resume(t: Awaited<ReturnType<typeof setup>>["t"], ids: Awaited<ReturnType<typeof setup>>["ids"], pauseId: string, level: "execution" | "billing" | "publishing") {
  const actor = level === "execution" ? ids.actors.operations : level === "billing" ? ids.actors.system : ids.actors.approver;
  return executeCommand(t.deps, ctx(ids, actor), { type: "resume_pause", payload: { pauseId } });
}

describe("execution authorization", () => {
  it("blocks all eleven agent task kinds before any model, gateway, writer, or measurement call", async () => {
    const { t, ids } = await setup();
    await pause(t, ids, "execution");
    const client = new FakeModelClient([]);
    const generateCopy = vi.fn();
    const measurementRead = vi.fn();
    const getCreativeWork = vi.spyOn(t.gateway, "getCreativeWork");
    const agents = createEquipeAgents({
      moduleDeps: t.deps, client, ledger: new MemoryLedgerStore(),
      writing: { generateCopy },
      measurement: { read: measurementRead } as never,
    });
    const itemInput = { caption: "c", facts: [], note: "n", now: "2026-10-05T14:00:00.000Z", scheduledFor: null };
    const tasks = [
      ["strategist_turn", { message: "oi" }],
      ["research", { materials: [{ assetId: "a", label: "site", excerpt: "texto" }] }],
      ["writing", { workItemId: "work-1" }],
      ["art_direction", { workId: "work-1" }],
      ["review_text", { copy: { headline: "h", body: "b", cta: "c" } }],
      ["review_visual", { imageUrl: "https://example.test/image.png", brief: "" }],
      ["review_caption", itemInput],
      ["plan_adjustment", itemInput],
      ["plan_replacement", itemInput],
      ["plan_reschedule", itemInput],
      ["measurement", { brandId: "brand-1" }],
    ] as const;
    for (const [kind, input] of tasks) {
      expect(await agents.runTask({ kind, workspaceId: ids.workspaceId, accountId: ids.accountId, input }))
        .toEqual({ ok: false, error: "execution_suspended" });
    }
    expect(client.requests).toHaveLength(0);
    expect(generateCopy).not.toHaveBeenCalled();
    expect(measurementRead).not.toHaveBeenCalled();
    expect(getCreativeWork).not.toHaveBeenCalled();
  });

  it("distinguishes stacked pauses and isolates execution by account", async () => {
    const { t, ids } = await setup();
    const other = await openTestAccount(t);
    const executionId = await pause(t, ids, "execution");
    const billingId = await pause(t, ids, "billing");
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    expect(await authorizeAccountExecution(t.deps.uow.repos, scope)).toMatchObject({ ok: false, error: { code: "execution_suspended" } });
    expect((await authorizeAccountExecution(t.deps.uow.repos, { workspaceId: other.workspaceId, accountId: other.accountId })).ok).toBe(true);
    expect((await resume(t, ids, billingId, "billing")).ok).toBe(true);
    expect(await authorizeAccountExecution(t.deps.uow.repos, scope)).toMatchObject({ ok: false, error: { code: "execution_suspended" } });
    expect((await resume(t, ids, executionId, "execution")).ok).toBe(true);
    expect((await authorizeAccountExecution(t.deps.uow.repos, scope)).ok).toBe(true);
  });

  it.each([
    ["suspended", "execution_delinquent"],
    ["closed", "execution_closed"],
  ] as const)("rejects account status %s", async (status, code) => {
    const { t, ids } = await setup();
    await t.deps.uow.repos.accounts.update(ids.workspaceId, ids.accountId, { status });
    expect(await authorizeAccountExecution(t.deps.uow.repos, { workspaceId: ids.workspaceId, accountId: ids.accountId }))
      .toMatchObject({ ok: false, error: { code } });
  });

  it("allows model work and batch delivery during a publication pause", async () => {
    const { t, ids } = await setup();
    const publicationId = await pause(t, ids, "publishing");
    const client = new FakeModelClient([{ content: "resposta" }]);
    const agents = createEquipeAgents({ moduleDeps: t.deps, client });
    const result = await agents.runTask({ kind: "strategist_turn", workspaceId: ids.workspaceId, accountId: ids.accountId, input: { message: "oi" } });
    expect(result.ok).toBe(true);
    expect(client.requests).toHaveLength(1);
    expect((await deliverTestBatch(t, ids)).itemIds).toHaveLength(2);
    expect((await resume(t, ids, publicationId, "publishing")).ok).toBe(true);
  });

  it.each(["execution", "billing"] as const)("blocks module and strategist-tool batch delivery for both agent and system actors during %s pause", async (level) => {
    const { t, ids } = await setup();
    const frontId = await frontIdOf(t, ids, "social_instagram");
    const work = seedWork(t, ids.workspaceId);
    const payload = { title: "Lote", frontId, approveByAt: new Date("2026-10-07T17:00:00.000Z"), items: [
      { creativeWorkId: work.workId, creativeWorkOutputId: work.outputId, caption: "c", destinationAccount: "instagram:@brand", scheduledFor: new Date("2026-10-09T12:00:00.000Z") },
    ] };
    const pauseId = await pause(t, ids, level);
    const code = level === "execution" ? "execution_suspended" : "execution_delinquent";
    const getWork = vi.spyOn(t.gateway, "getCreativeWork");
    for (const actor of [ids.actors.agent, ids.actors.system]) {
      const result = await executeCommand(t.deps, ctx(ids, actor), { type: "deliver_batch", payload });
      expect(result).toMatchObject({ ok: false, error: { code } });
    }
    const tools = buildStrategistTools({ deps: t.deps, workspaceId: ids.workspaceId, accountId: ids.accountId });
    const toolResult = await executeStrategistTool(tools, "deliver_batch", JSON.stringify({
      ...payload, approveByAt: payload.approveByAt.toISOString(), items: payload.items.map((item) => ({ ...item, scheduledFor: item.scheduledFor.toISOString() })),
    }));
    expect(toolResult).toMatchObject({ ok: false, error: expect.stringContaining(code) });
    expect(getWork).not.toHaveBeenCalled();
    expect(await t.deps.uow.repos.batches.list({ workspaceId: ids.workspaceId, accountId: ids.accountId })).toHaveLength(0);
    expect((await resume(t, ids, pauseId, level)).ok).toBe(true);
  });

  it.each(["execution", "billing"] as const)("rejects strategist reads/tools and model calls during %s pause", async (level) => {
    const { t, ids } = await setup();
    const pauseId = await pause(t, ids, level);
    const code = level === "execution" ? "execution_suspended" : "execution_delinquent";
    const client = new FakeModelClient([]);
    await expect(runStrategistTurn({ client, ctx: { deps: t.deps, workspaceId: ids.workspaceId, accountId: ids.accountId }, message: "oi" }))
      .rejects.toThrow(code);
    const listItems = vi.spyOn(t.deps.uow.repos.items, "list");
    const tool = await executeStrategistTool(buildStrategistTools({ deps: t.deps, workspaceId: ids.workspaceId, accountId: ids.accountId }), "get_pipeline", "{}");
    expect(tool).toMatchObject({ ok: false, error: expect.stringContaining(code) });
    expect(client.requests).toHaveLength(0);
    expect(listItems).not.toHaveBeenCalled();
    expect((await resume(t, ids, pauseId, level)).ok).toBe(true);
  });

  it("rechecks after a model response before executing a tool", async () => {
    const { t, ids } = await setup();
    const toolsRead = vi.spyOn(t.deps.uow.repos.items, "list");
    const client = new FakeModelClient([]);
    client.chat = async (request) => {
      client.requests.push(request);
      await pause(t, ids, "execution");
      return { content: null, toolCalls: [{ id: "call-1", name: "get_pipeline", argumentsJson: "{}" }], usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, stopReason: "tool_calls" };
    };
    await expect(runStrategistTurn({ client, ctx: { deps: t.deps, workspaceId: ids.workspaceId, accountId: ids.accountId }, message: "oi" }))
      .rejects.toThrow("execution_suspended");
    expect(client.requests).toHaveLength(1);
    expect(toolsRead).not.toHaveBeenCalled();
  });

  it.each(["execution", "billing"] as const)("keeps requested work pending during %s pause, then processes and redelivers idempotently", async (level) => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids, { items: [{ caption: "antes" }] });
    const edited = await executeCommand(t.deps, ctx(ids, ids.actors.approver), { type: "edit_caption", payload: { itemId: itemIds[0]!, caption: "depois" } });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const source = edited.value.events.find((event) => event.eventType === "agent_work.requested")!;
    const client = new FakeModelClient([{ content: JSON.stringify({ findings: [], summary: "ok", natures: ["none"] }) }]);
    const handler = createAgentWorkHandler({ depsFor: () => t.deps, agentsFor: () => createEquipeAgents({ moduleDeps: t.deps, client }), isEnabled: () => true });
    const contextsRead = vi.spyOn(t.deps.uow.repos.contexts, "list");
    const outbox = createAgentWorkOutboxHandler({ uow: t.deps.uow, clock: t.deps.clock, isEnabledForWorkspace: () => true, gatewayFor: () => t.gateway });
    const sent: Array<{ id: string; name: string; data: unknown }> = [];
    const outboxStep = { ...step, sendEvent: async (_name: string, event: { id: string; name: string; data: unknown }) => { sent.push(event); } };
    const pauseId = await pause(t, ids, level);
    expect(await outbox({ step: outboxStep })).toEqual({ emitted: 0 });
    const refused = await handler({ event: { data: { workspaceId: ids.workspaceId, accountId: ids.accountId, sourceEventId: source.id, kind: "caption_revalidation" } }, step, runId: "paused-run" });
    expect(refused).toMatchObject({ refused: true, error: level === "execution" ? "execution_suspended" : "execution_delinquent" });
    expect(client.requests).toHaveLength(0);
    expect(contextsRead).not.toHaveBeenCalled();
    const pending = await import("./agent-work").then(({ pendingAgentWork }) => pendingAgentWork(t.deps.uow.repos, { workspaceId: ids.workspaceId, accountId: ids.accountId }));
    expect(pending).toEqual([]);
    expect(sent).toHaveLength(0);
    expect((await resume(t, ids, pauseId, level)).ok).toBe(true);
    expect(await outbox({ step: outboxStep })).toEqual({ emitted: 1 });
    expect(sent[0]).toMatchObject({ data: { sourceEventId: source.id } });

    const event = sent[0] as { data: { workspaceId: string; accountId: string; kind: string; sourceEventId: string } };
    await handler({ event: { data: event.data }, step, runId: "run-593-a" });
    await handler({ event: { data: event.data }, step, runId: "run-593-redelivery" });
    expect(client.requests).toHaveLength(1);
    expect(await t.deps.uow.repos.events.list({ workspaceId: ids.workspaceId, accountId: ids.accountId }, { eventType: "agent.turn_failed" })).toHaveLength(0);
    expect(await outbox({ step: outboxStep })).toEqual({ emitted: 0 });
  });

  it("advances the transport generation when suspension refuses the claim itself", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids, { items: [{ caption: "antes" }] });
    const edited = await executeCommand(t.deps, ctx(ids, ids.actors.approver), { type: "edit_caption", payload: { itemId: itemIds[0]!, caption: "depois" } });
    if (!edited.ok) throw new Error("edit failed");
    const source = edited.value.events.find((event) => event.eventType === "agent_work.requested")!;
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const outbox = createAgentWorkOutboxHandler({ uow: t.deps.uow, clock: t.deps.clock, isEnabledForWorkspace: () => true, gatewayFor: () => t.gateway });
    const sent: Array<{ id: string; data: { workspaceId: string; accountId: string; kind: string; sourceEventId: string } }> = [];
    const outboxStep = { ...step, sendEvent: async (_name: string, event: (typeof sent)[number]) => { sent.push(event); } };
    await outbox({ step: outboxStep });
    expect(sent.map((event) => event.id)).toEqual([`${source.id}:0`]);
    const pauseId = await pause(t, ids, "execution");
    const client = new FakeModelClient([]);
    const handler = createAgentWorkHandler({ depsFor: () => t.deps, agentsFor: () => createEquipeAgents({ moduleDeps: t.deps, client }), isEnabled: () => true });
    const event = { id: sent[0]!.id, data: sent[0]!.data };
    expect(await handler({ event, step, runId: "refused-claim" })).toMatchObject({ refused: true, error: "execution_suspended" });
    // Replay of the same run adds no generation.
    await handler({ event, step, runId: "refused-claim" });
    expect(client.requests).toHaveLength(0);
    const deferred = await t.deps.uow.repos.events.list(scope, { eventType: "agent_work.deferred" });
    expect(deferred).toHaveLength(1);
    expect(deferred[0]!.payload).toMatchObject({ claimId: null, reason: "claim_refused", runId: "refused-claim" });
    expect((await resume(t, ids, pauseId, "execution")).ok).toBe(true);
    await outbox({ step: outboxStep });
    expect(sent.at(-1)!.id).toBe(`${source.id}:1`);
    const resumedClient = new FakeModelClient([{ content: JSON.stringify({ findings: [], summary: "ok", natures: ["none"] }) }]);
    const resumed = createAgentWorkHandler({ depsFor: () => t.deps, agentsFor: () => createEquipeAgents({ moduleDeps: t.deps, client: resumedClient }), isEnabled: () => true });
    const resumedEvent = { id: sent.at(-1)!.id, data: sent.at(-1)!.data };
    expect(await resumed({ event: resumedEvent, step, runId: "resumed-run" })).toMatchObject({ refused: false });
    await resumed({ event: resumedEvent, step, runId: "resumed-redelivery" });
    expect(resumedClient.requests).toHaveLength(1);
  });

  it("releases a claim when suspension lands between claim and model call", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids, { items: [{ caption: "antes" }] });
    const edited = await executeCommand(t.deps, ctx(ids, ids.actors.approver), { type: "edit_caption", payload: { itemId: itemIds[0]!, caption: "depois" } });
    if (!edited.ok) throw new Error("edit failed");
    const source = edited.value.events.find((event) => event.eventType === "agent_work.requested")!;
    const client = new FakeModelClient([]);
    const handler = createAgentWorkHandler({ depsFor: () => t.deps, agentsFor: () => createEquipeAgents({ moduleDeps: t.deps, client }), isEnabled: () => true });
    const outbox = createAgentWorkOutboxHandler({ uow: t.deps.uow, clock: t.deps.clock, isEnabledForWorkspace: () => true, gatewayFor: () => t.gateway });
    const transportIds: string[] = [];
    const outboxStep = { ...step, sendEvent: async (_name: string, sent: { id: string }) => { transportIds.push(sent.id); } };
    // Re-sweeps of the same generation reuse one transport id (Inngest dedupes).
    await outbox({ step: outboxStep });
    await outbox({ step: outboxStep });
    expect(transportIds).toEqual([`${source.id}:0`, `${source.id}:0`]);
    let didPause = false;
    let pauseId = "";
    const claimStep = { run: async <T>(name: string, fn: () => Promise<T>) => {
      const result = await fn();
      if (name === "claim-work" && !didPause) { didPause = true; pauseId = await pause(t, ids, "execution"); }
      return result;
    } };
    const event = { id: "transport-a", data: { workspaceId: ids.workspaceId, accountId: ids.accountId, sourceEventId: source.id, kind: "caption_revalidation" } };
    const result = await handler({ event, step: claimStep, runId: "claim-pause" });
    expect(result).toMatchObject({ refused: true, error: "execution_suspended" });
    expect(client.requests).toHaveLength(0);
    expect((await t.deps.uow.repos.events.list({ workspaceId: ids.workspaceId, accountId: ids.accountId }, { eventType: "agent_work.deferred" })).length).toBeGreaterThan(0);
    expect(await t.deps.uow.repos.events.list({ workspaceId: ids.workspaceId, accountId: ids.accountId }, { eventType: "agent.turn_failed" })).toHaveLength(0);
    expect((await resume(t, ids, pauseId, "execution")).ok).toBe(true);
    const resumedClient = new FakeModelClient([{ content: JSON.stringify({ findings: [], summary: "ok", natures: ["none"] }) }]);
    const resumedHandler = createAgentWorkHandler({ depsFor: () => t.deps, agentsFor: () => createEquipeAgents({ moduleDeps: t.deps, client: resumedClient }), isEnabled: () => true });
    const pending = await import("./agent-work").then(({ pendingAgentWork }) => pendingAgentWork(t.deps.uow.repos, { workspaceId: ids.workspaceId, accountId: ids.accountId }));
    expect(pending.map((item) => item.id)).toContain(source.id);
    // A deferral starts a new generation, so the resume is not swallowed.
    await outbox({ step: outboxStep });
    expect(transportIds.at(-1)).toBe(`${source.id}:1`);
    expect(await resumedHandler({ event, step, runId: "resumed-claim" })).toMatchObject({ refused: false });
    await resumedHandler({ event, step, runId: "resumed-redelivery" });
    expect(resumedClient.requests).toHaveLength(1);
  });

  it.each([false, true])("reuses deferred model output only if approved facts are unchanged (changed=%s)", async (changeFacts) => {
    const { t, ids } = await setup();
    const fields = { offer: { status: "sustained", value: "frete grátis", source: "catálogo" } };
    const proposed = await executeCommand(t.deps, ctx(ids, ids.actors.agent), { type: "propose_context_section", payload: { section: "oferta", fields } });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), { type: "approve_context_section", payload: { section: "oferta", expectedVersionHash: contextVersionHash(fields) } });
    expect(approved.ok).toBe(true);
    const { itemIds } = await deliverTestBatch(t, ids, { items: [{ caption: "antes" }] });
    const edited = await executeCommand(t.deps, ctx(ids, ids.actors.approver), { type: "edit_caption", payload: { itemId: itemIds[0]!, caption: "depois" } });
    if (!edited.ok) throw new Error("edit failed");
    const source = edited.value.events.find((event) => event.eventType === "agent_work.requested")!;
    const response = JSON.stringify({ findings: [], summary: "ok", natures: ["none"] });
    const client = new FakeModelClient([{ content: response }, { content: response }]);
    const handler = createAgentWorkHandler({ depsFor: () => t.deps, agentsFor: () => createEquipeAgents({ moduleDeps: t.deps, client }), isEnabled: () => true });
    let paused = false;
    const afterModelStep = { run: async <T>(name: string, fn: () => Promise<T>) => {
      const result = await fn();
      if (name === "run-agent-task" && !paused) { paused = true; await pause(t, ids, "execution"); }
      return result;
    } };
    const event = { id: "transport-a", data: { workspaceId: ids.workspaceId, accountId: ids.accountId, sourceEventId: source.id, kind: "caption_revalidation" } };
    expect(await handler({ event, step: afterModelStep, runId: "after-model" })).toMatchObject({ refused: true, error: "execution_suspended" });
    const deferred = await t.deps.uow.repos.events.list({ workspaceId: ids.workspaceId, accountId: ids.accountId }, { eventType: "agent_work.deferred" });
    expect(deferred).toHaveLength(1);
    const active = await t.deps.uow.repos.pauses.list({ workspaceId: ids.workspaceId, accountId: ids.accountId });
    const pauseId = active.find((row) => row.status === "active" && row.level === "execution")!.id;
    if (changeFacts) {
      const approvedContext = (await t.deps.uow.repos.contexts.list({ workspaceId: ids.workspaceId, accountId: ids.accountId })).find((row) => row.status === "approved")!;
      await t.deps.uow.repos.contexts.update({ workspaceId: ids.workspaceId, accountId: ids.accountId }, approvedContext.id, {
        fields: { offer: { status: "sustained", value: "frete grátis acima de R$200", source: "catálogo atualizado" } },
      });
    }
    expect((await resume(t, ids, pauseId, "execution")).ok).toBe(true);
    expect(await handler({ event, step, runId: "after-resume" })).toMatchObject({ refused: false });
    expect(client.requests).toHaveLength(changeFacts ? 2 : 1);
  });

  it("preserves Inngest step results across suspension replay and applies only in a new run", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids, { items: [{ caption: "antes" }] });
    const edited = await executeCommand(t.deps, ctx(ids, ids.actors.approver), { type: "edit_caption", payload: { itemId: itemIds[0]!, caption: "depois" } });
    if (!edited.ok) throw new Error("edit failed");
    const source = edited.value.events.find((event) => event.eventType === "agent_work.requested")!;
    const client = new FakeModelClient([{ content: JSON.stringify({ findings: [], summary: "ok", natures: ["none"] }) }]);
    const handler = createAgentWorkHandler({ depsFor: () => t.deps, agentsFor: () => createEquipeAgents({ moduleDeps: t.deps, client }), isEnabled: () => true });
    const cache = new Map<string, unknown>();
    const interrupted = new Error("interrupt after cached model result");
    let crashAfterModelStep = true;
    const replayableStep = { run: async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
      if (cache.has(name)) return cache.get(name) as T;
      const value = await fn();
      cache.set(name, value);
      if (name === "run-agent-task" && crashAfterModelStep) { crashAfterModelStep = false; throw interrupted; }
      return value;
    } };
    const event = { id: "transport-a", data: { workspaceId: ids.workspaceId, accountId: ids.accountId, sourceEventId: source.id, kind: "caption_revalidation" } };
    await expect(handler({ event, step: replayableStep, runId: "same-run" })).rejects.toBe(interrupted);
    expect(client.requests).toHaveLength(1);
    await pause(t, ids, "execution");
    expect(await handler({ event, step: replayableStep, runId: "same-run" })).toMatchObject({ refused: true, error: "execution_suspended" });
    expect(client.requests).toHaveLength(1);
    expect(await handler({ event, step: replayableStep, runId: "same-run" })).toMatchObject({ refused: true, error: "execution_suspended" });
    expect(await t.deps.uow.repos.events.list({ workspaceId: ids.workspaceId, accountId: ids.accountId }, { eventType: "agent_work.completed" })).toHaveLength(0);
    expect(client.requests).toHaveLength(1);
    const active = await t.deps.uow.repos.pauses.list({ workspaceId: ids.workspaceId, accountId: ids.accountId });
    const pauseId = active.find((row) => row.status === "active" && row.level === "execution")!.id;
    expect((await resume(t, ids, pauseId, "execution")).ok).toBe(true);
    expect(await handler({ event, step, runId: "new-run-after-resume" })).toMatchObject({ refused: false });
    expect(client.requests).toHaveLength(1);
    expect(await t.deps.uow.repos.events.list({ workspaceId: ids.workspaceId, accountId: ids.accountId }, { eventType: "agent_work.completed" })).toHaveLength(1);
  });

  it("keeps automated proactive projection blocked while preserving staff communication", async () => {
    const { t, ids } = await setup();
    expect((await executeCommand(t.deps, ctx(ids, ids.actors.approver), { type: "agree_manual_mode", payload: {} })).ok).toBe(true);
    const delivered = await deliverTestBatch(t, ids, { title: "Lote pronto" });
    const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item", payload: { itemId: delivered.itemIds[0]!, expectedVersionHash: delivered.versionHashes[0]! },
    });
    expect(approved.ok).toBe(true);
    expect((await t.deps.uow.repos.items.get({ workspaceId: ids.workspaceId, accountId: ids.accountId }, delivered.itemIds[0]!))?.status).toBe("available_for_download");
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const batchEvent = await t.deps.uow.repos.events.create(scope, {
      actorType: "agent", actorId: "estrategista", actorRole: "agent", eventType: "batch.delivered",
      objectType: "batch", objectId: delivered.batchId, payload: { itemCount: 2 }, occurredAt: t.deps.clock.now(),
    });
    const pauseId = await pause(t, ids, "execution");
    expect(await postProactiveMessage({ deps: t.deps, workspaceId: ids.workspaceId, accountId: ids.accountId, sourceEventId: batchEvent.id })).toBeNull();
    expect(t.store.assistantMessages.rows.has(batchEvent.id)).toBe(false);
    const supportRequest = await executeCommand(t.deps, ctx(ids, ids.actors.approver), { type: "request_support", payload: { note: "Preciso de ajuda" } });
    expect(supportRequest.ok).toBe(true);
    if (!supportRequest.ok) return;
    const staffMessage = await executeCommand(t.deps, ctx(ids, ids.actors.support), {
      type: "post_staff_message", payload: { exceptionId: supportRequest.value.data.exceptionId as string, body: "Estou acompanhando." },
    });
    expect(staffMessage.ok).toBe(true);
    expect(t.store.assistantMessages.rows.size).toBeGreaterThan(0);
    expect(await getItemDetail(t.deps.uow.repos, ids.workspaceId, ids.accountId, delivered.itemIds[0]!)).toMatchObject({ item: { id: delivered.itemIds[0]! } });

    const connection = await t.deps.uow.repos.connections.create({ workspaceId: ids.workspaceId, accountId: ids.accountId }, { provider: "instagram", encryptedToken: "token" });
    const escalation = await executeCommand(t.deps, ctx(ids, ids.actors.system), { type: "open_escalation", payload: {
      kind: "security", severity: "critical_cross_account", reason: "token suspeito", connectionIds: [connection.id],
    } });
    expect(escalation.ok).toBe(true);
    if (escalation.ok) {
      const revoked = await executeCommand(t.deps, ctx(ids, ids.actors.operations), { type: "revoke_connection", payload: {
        connectionId: connection.id, escalationId: escalation.value.data.escalationId as string, reason: "contenção durante suspensão",
      } });
      expect(revoked.ok).toBe(true);
      expect((await t.deps.uow.repos.connections.get({ workspaceId: ids.workspaceId, accountId: ids.accountId }, connection.id))?.status).toBe("revoked");
    }
    expect((await resume(t, ids, pauseId, "execution")).ok).toBe(true);
    expect(delivered.batchId).toBeTruthy();
  });
});
