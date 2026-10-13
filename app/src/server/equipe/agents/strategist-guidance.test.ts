import { describe, expect, it, vi } from "vitest";
import { renderLearnedGuidance, hashGuidanceContent } from "@/server/brand-taste/learned-guidance";
import { makeTestDeps, openTestAccount } from "../module/testing/deps";
import { pilotAccount } from "./testing-pilot";
import { runStrategistTurn } from "./strategist";
import { anthropicClient, reply, textBlock } from "./testing-anthropic";
import { createEquipeAgents } from "./runner";
import { MemoryLedgerStore } from "./ledger";
import { FakeModelClient } from "./testing";
import { getEquipePromptVersion } from "./prompt-version";

function selection(text = "Use uma voz próxima e convites diretos.") {
  return { ...renderLearnedGuidance({ role: "strategist", language: "en", revisions: [{
    ruleId: "voice-rule", revision: "legacy", contentHash: hashGuidanceContent(text),
    category: "voice", roles: ["strategist"], text,
  }] }), omissions: [] };
}

describe("strategist approved voice delivery", () => {
  it("sends nothing and gives back the free reservation if application persistence fails", async () => {
    const t = makeTestDeps(), f = await pilotAccount({ t, big: false });
    Object.assign(t.deps.gateway, { loadLearnedGuidance: async () => selection() });
    const create = t.deps.uow.repos.events.create.bind(t.deps.uow.repos.events);
    vi.spyOn(t.deps.uow.repos.events, "create").mockImplementation(async (scope, event) => {
      if (event.eventType === "agent.learned_guidance_applied") throw new Error("application_persistence_failed");
      return create(scope, event);
    });
    const client = new FakeModelClient([{ content: "Never sent." }]), ledger = new MemoryLedgerStore();
    expect(await createEquipeAgents({ moduleDeps: t.deps, client, ledger }).runTask({ kind: "strategist_turn",
      workspaceId: f.workspaceId, accountId: f.accountId, input: { message: "Oi" } }))
      .toEqual({ ok: false, error: "application_persistence_failed" });
    expect(client.requests).toEqual([]);
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]).toMatchObject({ costUsdCents: 0 });
    expect(ledger.entries[0].settledAt).toBeInstanceOf(Date);
  });
  it.each([undefined, "local_learning_denied", "budget_exceeded"] as const)("preserves the baseline request and records omission separately when guidance is absent (%s)", async omissionReason => {
    const t = makeTestDeps(), f = await openTestAccount(t);
    Object.assign(t.deps.gateway, { loadLearnedGuidance: async () => ({ lines: [], appliedRefs: [], setHash: null,
      omissions: [], ...(omissionReason ? { omissionReason } : {}) }) });
    const client = new FakeModelClient([{ content: "Resposta." }]), ledger = new MemoryLedgerStore();
    expect(await createEquipeAgents({ moduleDeps: t.deps, client, ledger }).runTask({
      kind: "strategist_turn", workspaceId: f.workspaceId, accountId: f.accountId, input: { message: "Pedido" },
    })).toMatchObject({ ok: true });
    expect(client.requests[0].messages).toHaveLength(2);
    expect(client.requests[0].messages[1]).toEqual({ role: "user", content: "Pedido" });
    expect(client.requests[0].setHash).toBeNull();
    const application = [...t.store.events.rows.values()].find(event => event.eventType === "agent.learned_guidance_applied");
    expect(application?.payload).toMatchObject({ appliedRefs: [], setHash: null, situation: omissionReason ? "omitted" : "no_guidance",
      ...(omissionReason ? { omissionReason } : {}) });
  });
  it.each(["free", "talk", "paid"] as const)("keeps the %s prefix and tools stable, inserting only a server block before history/request", async mode => {
    const t = makeTestDeps();
    const f = mode === "paid" ? await openTestAccount(t) : await pilotAccount({ t, big: false });
    if (mode === "talk") t.deps.hasClassicPaidAccess = async () => true;
    const ctx = { deps: t.deps, workspaceId: f.workspaceId, accountId: f.accountId };
    const { sdk, client } = anthropicClient([reply([textBlock("Um." )], "end_turn"), reply([textBlock("Dois.")], "end_turn")]);
    const a = selection(), b = selection("Prefira frases curtas.");
    for (const guidance of [a, b]) await runStrategistTurn({ client, ctx, message: "Pedido explícito", guidance,
      history: [{ role: "assistant", content: "Histórico" }] });
    expect(sdk.params[0]!.system).toBe(sdk.params[1]!.system);
    expect(sdk.params[0]!.tools).toEqual(sdk.params[1]!.tools);
    const offset = mode === "paid" ? 0 : 1;
    if (offset) {
      expect(sdk.params[0]!.messages[0]).toEqual(sdk.params[1]!.messages[0]);
      expect(sdk.params[0]!.messages[0]).toMatchObject({ content: [{ cache_control: { type: "ephemeral" } }] });
    }
    for (const [index, guidance] of [a, b].entries()) {
      const block = sdk.params[index]!.messages[offset]!;
      expect(block).toEqual({ role: "user", content: [{ type: "text", text: guidance.lines.join("\n") }] });
      expect(JSON.stringify(sdk.params[index]!.messages[offset + 1])).toContain("Histórico");
      expect(JSON.stringify(sdk.params[index]!.messages.at(-1))).toContain("Pedido explícito");
    }
    // No message writer is involved: the server preference never becomes a person's stored speech.
  });

  it.each([false, true])("freezes one selection for all tool calls and correlates every ledger/application (%s free)", async free => {
    const t = makeTestDeps();
    const f = free ? await pilotAccount({ t, big: false }) : await openTestAccount(t);
    const original = selection();
    const load = vi.fn(async () => original);
    Object.assign(t.deps.gateway, { loadLearnedGuidance: load });
    const ledger = new MemoryLedgerStore();
    const first = free ? { id: "missing-answer", name: "sugerir_proximos_passos", argumentsJson: '{"itens":[]}' }
      : { id: "goals", name: "get_goals", argumentsJson: "{}" };
    const client = new FakeModelClient([{ toolCalls: [first], stopReason: "tool_calls" }, { content: "Resposta." }]);
    const chat = client.chat.bind(client);
    client.chat = async request => {
      expect(ledger.entries.every(entry => entry.setHash === request.setHash)).toBe(true);
      const response = await chat(request);
      original.lines[1] = "MUTATED-IN-FLIGHT";
      original.appliedRefs.splice(0);
      original.setHash = "b".repeat(64);
      return response;
    };
    const expected = selection();
    const agents = createEquipeAgents({ moduleDeps: t.deps, client, ledger });
    const result = await agents.runTask({ kind: "strategist_turn", workspaceId: f.workspaceId, accountId: f.accountId,
      input: { message: "Oi", setHash: "untrusted", guidance: selection("Never trusted") } });
    expect(result.ok).toBe(true);
    expect(client.requests).toHaveLength(2);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith({ workspaceId: f.workspaceId, clientProfileId: expect.any(String),
      role: "strategist", generationMode: "strategist_turn", format: "text", language: "en", fixedPromptVersion: getEquipePromptVersion("strategist_turn").effective });
    for (const request of client.requests) {
      expect(request.setHash).toBe(expected.setHash);
      expect(JSON.stringify(request.messages)).toContain(expected.lines[1]);
      expect(JSON.stringify(request.messages)).not.toMatch(/MUTATED-IN-FLIGHT|Never trusted/);
    }
    const records = [...t.store.events.rows.values()].filter(event => event.eventType === "agent.learned_guidance_applied");
    expect(records).toHaveLength(2);
    expect(new Set(records.map(event => (event.payload as { turnId: string }).turnId)).size).toBe(1);
    for (const [index, record] of records.entries()) expect(record.payload).toMatchObject({
      ledgerEntryId: ledger.entries[index]!.id, consumer: "strategist_turn", role: "strategist", situation: "applied",
      setHash: expected.setHash, appliedRefs: expected.appliedRefs, fixedPromptVersion: ledger.entries[index]!.promptVersion,
    });
    expect(JSON.stringify(records)).not.toContain(expected.lines[1]);
  });
});
