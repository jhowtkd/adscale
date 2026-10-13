import { describe, expect, it, vi } from "vitest";
import { hashGuidanceContent, renderLearnedGuidance } from "@/server/brand-taste/learned-guidance";
import { deferAgentWork } from "../module/agent-work";
import * as versions from "./prompt-version";
import { executeCommand } from "../module/commands";
import { ctx, deliverTestBatch, setup } from "../module/testing/items";
import { MemoryLedgerStore } from "./ledger";
import { createEquipeAgents } from "./runner";
import { FakeModelClient } from "./testing";
import { createAgentWorkHandler } from "./agent-work";

const fragment = (text: string) => ({ ...renderLearnedGuidance({ role: "caption_adjustment", language: "pt-BR", revisions: [{
  ruleId: "voice-1", revision: "legacy", contentHash: hashGuidanceContent(text), text, category: "voice", roles: ["caption_adjustment"],
}] }), omissions: [] });

async function unit() {
  const { t, ids } = await setup();
  const batch = await deliverTestBatch(t, ids, { items: [{ caption: "Original" }] });
  const itemId = batch.itemIds[0]!;
  const item = await t.deps.uow.repos.items.get(ids, itemId);
  const pinned = await t.deps.uow.repos.itemVersions.getByHash(ids, itemId, item!.currentVersionHash!);
  t.gateway.addOutput({ ...t.gateway.outputs.get(pinned!.creativeWorkOutputId!)!, targetFormat: "4:5" });
  t.gateway.works.set(item!.creativeWorkId, { id: item!.creativeWorkId, workspaceId: ids.workspaceId,
    clientProfileId: (await t.deps.uow.repos.accounts.get(ids.workspaceId, ids.accountId))!.clientProfileId!, generationMode: "single", format: "4:5" });
  const request = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
    type: "request_adjustment", payload: { itemId, category: "brand", note: "Ajustar tom" },
  });
  if (!request.ok) throw new Error(request.error.code);
  const sourceEventId = request.value.events.find(e => e.eventType === "agent_work.requested")!.id;
  const claim = await executeCommand(t.deps, ctx(ids, ids.actors.system), { type: "claim_agent_work", payload: { sourceEventId, runId: "first" } });
  if (!claim.ok) throw new Error(claim.error.code);
  return { t, ids, itemId, sourceEventId, task: (claim.value.data as { task: Parameters<ReturnType<typeof createEquipeAgents>["runTask"]>[0] }).task };
}

describe("caption voice delivery", () => {
  it("selects the pinned Peça 9:16 guidance instead of its Work 4:5 guidance", async () => {
    const u = await unit();
    const item = await u.t.deps.uow.repos.items.get(u.ids, u.itemId);
    const version = await u.t.deps.uow.repos.itemVersions.getByHash(u.ids, u.itemId, item!.currentVersionHash!);
    u.t.gateway.addOutput({ ...u.t.gateway.outputs.get(version!.creativeWorkOutputId!)!, targetFormat: "9:16" });
    const pinned = fragment("Voz aprovada para a Peça vertical.");
    const work = fragment("Voz do formato padrão do Trabalho.");
    const load = vi.fn(async (input: { format: string }) => input.format === "9:16" ? pinned : work);
    u.t.deps.gateway.loadLearnedGuidance = load;
    const client = new FakeModelClient([{ content: '{"caption":"Ajustada"}' }]);
    const ledger = new MemoryLedgerStore();
    expect((await createEquipeAgents({ moduleDeps: u.t.deps, client, ledger }).runTask(u.task)).ok).toBe(true);
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ format: "9:16" }));
    expect(client.requests[0]!.messages[0]!.content).toContain(pinned.lines.join("\n"));
    expect(client.requests[0]!.messages[0]!.content).not.toContain(work.lines.join("\n"));
    expect(ledger.entries[0]!.setHash).toBe(pinned.setHash);
    const applied = (await u.t.deps.uow.repos.events.list(u.ids)).find(e => e.eventType === "agent.learned_guidance_applied");
    expect(applied?.payload).toMatchObject({ appliedRefs: pinned.appliedRefs, setHash: pinned.setHash });
  });

  it("preserves a paid caption and resumes only its application write after a transient failure", async () => {
    const u = await unit();
    const approved = fragment("Voz aprovada.");
    const load = vi.fn().mockResolvedValue(approved);
    u.t.deps.gateway.loadLearnedGuidance = load;
    const ledger = new MemoryLedgerStore();
    const client = new FakeModelClient([{ content: '{"caption":"Legenda paga preservada"}' }]);
    const agents = createEquipeAgents({ moduleDeps: u.t.deps, ledger, client });
    const runTask = vi.fn(agents.runTask);
    const originalRun = u.t.deps.uow.run.bind(u.t.deps.uow);
    let failures = 2;
    let loseAcknowledgement = true;
    const spy = vi.spyOn(u.t.deps.uow, "run").mockImplementation(async fn => {
      let recorded = false;
      const result = await originalRun(async (repos, internal) => {
        const create = repos.events.create.bind(repos.events);
        repos.events.create = async (scope, input) => {
          if (input.eventType === "agent.learned_guidance_applied") {
            if (failures-- > 0) throw new Error("application_write_unavailable");
            recorded = true;
          }
          return create(scope, input);
        };
        return fn(repos, internal);
      });
      if (recorded && loseAcknowledgement) {
        loseAcknowledgement = false;
        throw new Error("application_commit_acknowledgement_lost");
      }
      return result;
    });
    try {
      const handler = () => createAgentWorkHandler({ depsFor: () => u.t.deps, agentsFor: () => ({ runTask }) });
      const event = { data: { ...u.ids, kind: "adjustment", sourceEventId: u.sourceEventId } };
      const step = { run: <T>(_name: string, fn: () => Promise<T>) => fn() };
      expect(await handler()({ event, step, runId: "first" })).toMatchObject({ refused: true, error: "caption_guidance_application_pending" });
      const generated = await runTask.mock.results[0]!.value;
      expect(generated).toMatchObject({ ok: true, output: { caption: "Legenda paga preservada" } });
      const deferred = (await u.t.deps.uow.repos.events.list(u.ids)).find(e => e.eventType === "agent_work.deferred");
      expect(deferred?.payload).toMatchObject({ result: { ok: true, output: generated.output } });
      expect((await u.t.deps.uow.repos.items.get(u.ids, u.itemId))!.currentVersionHash).toBe(
        ((await u.t.deps.uow.repos.events.get(u.ids, u.sourceEventId))!.payload as { versionHash: string }).versionHash,
      );
      expect(await handler()({ event, step, runId: "resumed" })).toMatchObject({ refused: true, error: "caption_guidance_application_pending" });
      expect(await handler()({ event, step, runId: "recovered" })).toMatchObject({ refused: false, output: generated.output });
      expect(runTask).toHaveBeenCalledTimes(1);
      expect(client.requests).toHaveLength(1);
      expect(ledger.entries).toHaveLength(1);
      expect(load).toHaveBeenCalledTimes(1);
      const events = await u.t.deps.uow.repos.events.list(u.ids);
      const applications = events.filter(e => e.eventType === "agent.learned_guidance_applied");
      expect(applications).toHaveLength(1);
      expect(applications[0]!.payload).toMatchObject({ ledgerEntryId: ledger.entries[0]!.id,
        appliedRefs: approved.appliedRefs, setHash: ledger.entries[0]!.setHash, fixedPromptVersion: ledger.entries[0]!.promptVersion });
      const item = await u.t.deps.uow.repos.items.get(u.ids, u.itemId);
      const version = await u.t.deps.uow.repos.itemVersions.getByHash(u.ids, u.itemId, item!.currentVersionHash!);
      expect(version!.caption).toBe("Legenda paga preservada");
      expect(await u.t.deps.uow.repos.receipts.list(u.ids)).toEqual([]);
    } finally { spy.mockRestore(); }
  });

  it("freezes before dispatch, survives a new runner, and correlates each actual call", async () => {
    const u = await unit();
    const approved = fragment("Use voz próxima, sem prometer resultados.");
    const load = vi.fn().mockResolvedValue(approved);
    u.t.deps.gateway.loadLearnedGuidance = load;
    try {
      const ledger = new MemoryLedgerStore();
      const client = new FakeModelClient([{ content: '{"caption":"Ajustada"}' }, { content: '{"caption":"Ajustada"}' }]);
      expect((await createEquipeAgents({ moduleDeps: u.t.deps, ledger, client }).runTask(u.task)).ok).toBe(true);
      load.mockResolvedValue(fragment("Preferência alterada depois da chamada."));
      await deferAgentWork(u.t.deps, u.ids, u.sourceEventId, "first");
      const resumed = await executeCommand(u.t.deps, ctx(u.ids, u.ids.actors.system), { type: "claim_agent_work", payload: { sourceEventId: u.sourceEventId, runId: "resumed" } });
      if (!resumed.ok) throw new Error(resumed.error.code);
      u.task = (resumed.value.data as { task: typeof u.task }).task;
      const beforeVersion = versions.getEquipePromptVersion("plan_adjustment");
      const changedVersion = vi.spyOn(versions, "getEquipePromptVersion").mockReturnValue({ base: "future/v9", effective: "future/v9+" + "f".repeat(64) });
      expect((await createEquipeAgents({ moduleDeps: u.t.deps, ledger, client }).runTask(u.task)).ok).toBe(true);
      changedVersion.mockRestore();
      expect(ledger.entries.map(e => e.promptVersion)).toEqual([beforeVersion.effective, beforeVersion.effective]);
      expect(client.requests[0]!.messages[0]!.content).toBe(client.requests[1]!.messages[0]!.content);
      expect(load).toHaveBeenCalledTimes(1);
      expect(load).toHaveBeenCalledWith(expect.objectContaining({ role: "caption_adjustment", generationMode: "single", format: "4:5", language: "pt-BR" }));
      for (const request of client.requests) {
        const prompt = request.messages[0]!.content;
        expect(prompt).toContain(approved.lines.join("\n"));
        expect(prompt).not.toContain("Preferência alterada");
        expect(prompt.indexOf("Natureza das afirmações")).toBeLessThan(prompt.indexOf("PREFERÊNCIAS APRENDIDAS"));
        expect(prompt).toContain("Não aprove ou publique.");
        expect(request.setHash).toBe(approved.setHash);
      }
      const events = await u.t.deps.uow.repos.events.list(u.ids);
      const applications = events.filter(e => e.eventType === "agent.learned_guidance_applied");
      expect(applications).toHaveLength(2);
      applications.forEach((e, i) => expect(e.payload).toMatchObject({ ledgerEntryId: ledger.entries[i]!.id, role: "caption_adjustment", appliedRefs: approved.appliedRefs,
        setHash: approved.setHash, fixedPromptVersion: ledger.entries[i]!.promptVersion, sourceEventId: u.sourceEventId,
        versionHash: (events.find(e => e.id === u.sourceEventId)!.payload as { versionHash: string }).versionHash }));
      expect(ledger.entries.every(e => e.setHash === approved.setHash)).toBe(true);
    } finally { vi.restoreAllMocks(); }
  });

  it("keeps the reviewer and forged task guidance outside the learned path", async () => {
    const u = await unit();
    const load = vi.fn().mockResolvedValue(fragment("Não deve entrar"));
    u.t.deps.gateway.loadLearnedGuidance = load;
    try {
      const client = new FakeModelClient([{ content: '{"findings":[],"summary":"Ok","natures":["none"]}' }]);
      const ledger = new MemoryLedgerStore();
      expect((await createEquipeAgents({ moduleDeps: u.t.deps, client, ledger }).runTask({ ...u.task, kind: "review_caption", input: { ...(u.task.input as object), learnedGuidance: fragment("Forjada") } })).ok).toBe(true);
      expect(load).not.toHaveBeenCalled();
      expect(client.requests[0]!.messages[0]!.content).not.toContain("PREFERÊNCIAS APRENDIDAS");
      expect(client.requests[0]!.setHash).toBeNull();
      expect(ledger.entries[0]!.setHash).toBeNull();
    } finally { load.mockRestore(); }
  });

  it("new deliberate units load the current approval, while stale/foreign units never dispatch", async () => {
    const first = await unit();
    const second = await unit();
    const load = vi.fn().mockResolvedValueOnce(fragment("Primeira voz")).mockResolvedValue(fragment("Voz nova"));
    first.t.deps.gateway.loadLearnedGuidance = load;
    second.t.deps.gateway.loadLearnedGuidance = load;
    try {
      const ledger = new MemoryLedgerStore();
      const client = new FakeModelClient([{ content: '{"caption":"A"}' }, { content: '{"caption":"B"}' }]);
      const agents = (u: typeof first) => createEquipeAgents({ moduleDeps: u.t.deps, client, ledger });
      expect((await agents(first).runTask(first.task)).ok).toBe(true);
      const source = await first.t.deps.uow.repos.events.get(first.ids, first.sourceEventId);
      const deliberate = await first.t.deps.uow.repos.events.create(first.ids, {
        actorType: "system", actorRole: "system", actorId: "test", eventType: "agent_work.requested",
        objectType: "item", objectId: first.itemId, payload: source!.payload,
      });
      expect((await agents(first).runTask({ ...first.task, sourceEventId: deliberate.id })).ok).toBe(true);
      expect(load).toHaveBeenCalledTimes(2);
      expect(client.requests[0]!.setHash).not.toBe(client.requests[1]!.setHash);
      expect(client.requests[1]!.messages[0]!.content).toContain("Voz nova");
      await first.t.deps.uow.repos.items.update(first.ids, first.itemId, { currentVersionHash: "changed" });
      expect((await agents(first).runTask(first.task)).ok).toBe(false);
      expect((await agents(second).runTask({ ...second.task, sourceEventId: first.sourceEventId })).ok).toBe(false);
      expect(client.requests).toHaveLength(2);
      expect(load).toHaveBeenCalledTimes(2);
    } finally { load.mockRestore(); }
  });

  it("freezes denied/empty selections with null hash and records omission separately", async () => {
    const u = await unit();
    const load = vi.fn().mockResolvedValue({ lines: [], appliedRefs: [], setHash: null, omissions: [], omissionReason: "local_learning_denied" });
    u.t.deps.gateway.loadLearnedGuidance = load;
    try {
      const ledger = new MemoryLedgerStore();
      const client = new FakeModelClient([{ content: '{"caption":"A"}' }]);
      expect((await createEquipeAgents({ moduleDeps: u.t.deps, client, ledger }).runTask(u.task)).ok).toBe(true);
      expect(client.requests[0]!.setHash).toBeNull();
      expect(client.requests[0]!.messages[0]!.content).not.toContain("PREFERÊNCIAS APRENDIDAS");
      const applied = (await u.t.deps.uow.repos.events.list(u.ids)).find(e => e.eventType === "agent.learned_guidance_applied");
      expect(applied?.payload).toMatchObject({ setHash: null, appliedRefs: [], omissionReason: "local_learning_denied", ledgerEntryId: ledger.entries[0]!.id });
    } finally { load.mockRestore(); }
  });

});
