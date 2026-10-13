import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";
import { openPool, depsFor, seedWorkspace, cleanup } from "../module/testing/free-pg";
import { clientProfiles, calibrationRules } from "@/server/db/schema";
import { equipeAccounts, equipeAgentLedger, equipeEvents } from "@/server/db/equipe-schema";
import { hashGuidanceContent, hashGuidanceSet } from "@/server/brand-taste/learned-guidance";
import { LiveAdscaleGateway } from "./gateway";
import { DrizzleLedgerStore } from "./ledger";
import { createEquipeAgents } from "./runner";
import { FakeModelClient } from "./testing";
import { getEquipePromptVersion } from "./prompt-version";

const url = resolveEquipeTestDatabaseUrl();
describe.skipIf(!url)("strategist learned preferences (Postgres)", () => {
  const h = url ? openPool(url) : null!;
  const workspaceIds: string[] = [], userIds: string[] = [];
  afterAll(async () => { if (h) { await cleanup(h, workspaceIds, userIds); await h.pool.end(); } });

  it.each(["free", "deploying"] as const)("loads only scoped confirmed preferences once and persists matching references/hash for %s calls", async status => {
    const seed = await seedWorkspace(h);
    workspaceIds.push(seed.workspaceId); userIds.push(seed.userId);
    const brands = await h.db.insert(clientProfiles).values(["Own", "Other"].map(name => ({ workspaceId: seed.workspaceId, name }))).returning();
    const [account] = await h.db.insert(equipeAccounts).values({ workspaceId: seed.workspaceId, clientProfileId: brands[0].id, status }).returning();
    const text = "Use uma voz acolhedora e sem promessas genéricas.";
    const makeRule = (clientProfileId: string, rationale: string) => ({ workspaceId: seed.workspaceId, clientProfileId,
      category: "voice", status: "approved", rationale, metadataConfirmedBy: seed.userId, metadataConfirmedAt: new Date(),
      confirmedMetadata: { category: "voice" as const, nature: "text" as const, roles: ["strategist" as const],
        generationModes: ["strategist_turn"], formats: ["text"], contentHash: hashGuidanceContent(rationale) },
    });
    const [rule] = await h.db.insert(calibrationRules).values([
      makeRule(brands[0].id, text), makeRule(brands[1].id, "OTHER-BRAND-NEVER-DELIVER"),
      { ...makeRule(brands[0].id, "CANDIDATE-NEVER-DELIVER"), status: "candidate" },
      { ...makeRule(brands[0].id, "UNCONFIRMED-NEVER-DELIVER"), confirmedMetadata: null, metadataConfirmedBy: null, metadataConfirmedAt: null },
    ]).returning();
    const ref = { ruleId: rule.id, revision: "legacy" as const, contentHash: hashGuidanceContent(text) };
    const expectedHash = hashGuidanceSet([ref]);
    const deps = depsFor(h, new Date(), { gateway: new LiveAdscaleGateway(seed.workspaceId) });
    const client = new FakeModelClient([
      { toolCalls: [{ id: randomUUID(), name: "sugerir_proximos_passos", argumentsJson: '{"itens":[]}' }], stopReason: "tool_calls" },
      { content: "Resposta." }, { content: "Outro turno." },
    ]);
    const chat = client.chat.bind(client);
    client.chat = async request => {
      if (client.requests.length === 0) {
        const frozen = await h.db.select().from(equipeEvents).where(eq(equipeEvents.accountId, account.id));
        expect(frozen.some(event => event.eventType === "agent.learned_guidance_frozen")).toBe(true);
        if (status === "free") {
          const entries = await h.db.select().from(equipeAgentLedger).where(eq(equipeAgentLedger.accountId, account.id));
          expect(entries).toHaveLength(1);
          expect(entries[0].setHash).toBe(expectedHash);
          expect(frozen.find(event => event.eventType === "agent.learned_guidance_applied")?.payload).toMatchObject({ ledgerEntryId: entries[0].id, appliedRefs: [ref] });
        }
      }
      const response = await chat(request);
      await h.db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, rule.id));
      return response;
    };
    const ledger = new DrizzleLedgerStore(h.db, h.pool);
    const agents = createEquipeAgents({ moduleDeps: deps, client, ledger });
    const task = { kind: "strategist_turn", workspaceId: seed.workspaceId, accountId: account.id, input: { message: "Pedido" } };
    expect(await agents.runTask(task)).toMatchObject({ ok: true });
    for (const request of client.requests) {
      expect(request.setHash).toBe(expectedHash);
      expect(JSON.stringify(request.messages)).toContain(text);
      expect(JSON.stringify(request.messages)).not.toMatch(/OTHER-BRAND|CANDIDATE|UNCONFIRMED/);
    }
    const entries = await h.db.select().from(equipeAgentLedger).where(eq(equipeAgentLedger.accountId, account.id));
    expect(entries).toHaveLength(2);
    const events = await h.db.select().from(equipeEvents).where(eq(equipeEvents.accountId, account.id));
    const applications = events.filter(event => event.eventType === "agent.learned_guidance_applied");
    expect(applications).toHaveLength(2);
    for (const entry of entries) {
      expect(entry).toMatchObject({ setHash: expectedHash, promptVersion: getEquipePromptVersion("strategist_turn").effective });
      expect(applications.find(event => (event.payload as { ledgerEntryId: string }).ledgerEntryId === entry.id)?.payload)
        .toMatchObject({ appliedRefs: [ref], setHash: expectedHash, fixedPromptVersion: entry.promptVersion, role: "strategist" });
    }
    // A deliberate new turn sees the now-deprecated rule; the old calls retain their attribution.
    expect(await agents.runTask(task)).toMatchObject({ ok: true });
    expect(client.requests[2].setHash).toBeNull();
    expect(JSON.stringify(client.requests[2].messages)).not.toContain(text);
  });
});
