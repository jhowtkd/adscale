import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { calibrationRules, clientProfiles, creativeWorkItems, creativeWorkOutputs, user, workspaces } from "@/server/db/schema";
import { equipeAgentLedger } from "@/server/db/equipe-schema";
import { hashGuidanceContent, hashGuidanceSet } from "@/server/brand-taste/learned-guidance";
import { createPostgresEquipeUnitOfWork } from "../data/postgres";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";
import { fixedClock } from "../domain";
import { LiveAdscaleGateway } from "./gateway";
import { DrizzleLedgerStore } from "./ledger";
import { createEquipeAgents } from "./runner";
import { FakeModelClient } from "./testing";
import { getEquipePromptVersion } from "./prompt-version";

const testUrl = resolveEquipeTestDatabaseUrl();
if (testUrl && (!["localhost", "127.0.0.1"].includes(new URL(testUrl).hostname) || process.env.DATABASE_URL !== testUrl)) {
  throw new Error("caption_guidance_requires_matching_local_test_database");
}

describe.skipIf(!testUrl)("Caption guidance on Postgres", () => {
  it("uses only confirmed own-brand voice, persists the frozen unit, and links ledger identity without text", async () => {
    const workspaceId = randomUUID(), reviewer = randomUUID();
    try {
      await db.insert(user).values({ id: reviewer, name: "Simulado", email: `${reviewer}@example.test` });
      await db.insert(workspaces).values({ id: workspaceId, name: "Simulado", slug: workspaceId });
      const [brand, other] = await db.insert(clientProfiles).values([{ workspaceId, name: "Marca" }, { workspaceId, name: "Outra" }]).returning();
      const [work] = await db.insert(creativeWorkItems).values({ workspaceId, clientProfileId: brand.id, createdByUserId: reviewer,
        title: "Simulado", request: "Pedido", toolKind: "single", format: "4:5", settings: {} }).returning();
      const [output] = await db.insert(creativeWorkOutputs).values({ workspaceId, workItemId: work.id,
        creativeLevel: "balanced", targetFormat: "9:16", operationKey: randomUUID() }).returning();
      const uow = createPostgresEquipeUnitOfWork(db);
      const account = await uow.repos.accounts.create(workspaceId, { clientProfileId: brand.id });
      const scope = { workspaceId, accountId: account.id };
      const front = await uow.repos.fronts.create(scope, { key: "social_instagram" });
      const item = await uow.repos.items.create(scope, { frontId: front.id, creativeWorkId: work.id, status: "adjusting" });
      const versionHash = randomUUID();
      await uow.repos.itemVersions.create(scope, { itemId: item.id, versionHash, creativeWorkOutputId: output.id, caption: "Original", authorRole: "agent" });
      await uow.repos.items.update(scope, item.id, { currentVersionHash: versionHash });
      const source = await uow.repos.events.create(scope, { actorType: "system", actorRole: "system", actorId: "test", eventType: "agent_work.requested",
        objectType: "item", objectId: item.id, payload: { kind: "adjustment", category: "brand", versionHash } });
      const text = "Use linguagem próxima e clara.";
      const metadata = (body: string) => ({ category: "voice" as const, nature: "text" as const, roles: ["caption_adjustment" as const],
        generationModes: ["single"], formats: ["9:16"], contentHash: hashGuidanceContent(body) });
      const [rule] = await db.insert(calibrationRules).values({ workspaceId, clientProfileId: brand.id, category: "voice", status: "approved", rationale: text,
        confirmedMetadata: metadata(text), metadataConfirmedBy: reviewer, metadataConfirmedAt: new Date() }).returning();
      await db.insert(calibrationRules).values([
        { workspaceId, clientProfileId: other.id, category: "voice", status: "approved", rationale: "Outra marca", confirmedMetadata: metadata("Outra marca"), metadataConfirmedBy: reviewer, metadataConfirmedAt: new Date() },
        { workspaceId, clientProfileId: brand.id, category: "voice", status: "approved", rationale: "Sem confirmação" },
        { workspaceId, clientProfileId: brand.id, category: "voice", status: "approved", rationale: "Voz do Trabalho 4:5",
          confirmedMetadata: { ...metadata("Voz do Trabalho 4:5"), formats: ["4:5"] }, metadataConfirmedBy: reviewer, metadataConfirmedAt: new Date() },
      ]);
      const gateway = new LiveAdscaleGateway(workspaceId);
      const deps = { uow, gateway, clock: fixedClock(new Date()) };
      const ledger = new DrizzleLedgerStore(db);
      const client = new FakeModelClient([{ content: '{"caption":"Ajustada"}' }, { content: '{"caption":"Ajustada"}' }]);
      const task = { ...scope, kind: "plan_adjustment", sourceEventId: source.id, input: { caption: "Original", facts: [], note: "Tom", now: new Date().toISOString(), scheduledFor: null } };
      expect((await createEquipeAgents({ moduleDeps: deps, ledger, client }).runTask(task)).ok).toBe(true);
      await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, rule.id));
      const resumedDeps = { ...deps, uow: createPostgresEquipeUnitOfWork(db) };
      expect((await createEquipeAgents({ moduleDeps: resumedDeps, ledger, client }).runTask(task)).ok).toBe(true);
      const refs = [{ ruleId: rule.id, revision: 1, contentHash: hashGuidanceContent(text) }];
      const setHash = hashGuidanceSet(refs);
      for (const request of client.requests) {
        expect(request.setHash).toBe(setHash);
        expect(request.messages[0]!.content).toContain(text);
        expect(request.messages[0]!.content).not.toContain("Outra marca");
        expect(request.messages[0]!.content).not.toContain("Sem confirmação");
        expect(request.messages[0]!.content).not.toContain("Voz do Trabalho 4:5");
      }
      const entries = await db.select().from(equipeAgentLedger).where(eq(equipeAgentLedger.accountId, account.id));
      expect(entries).toHaveLength(2);
      expect(JSON.stringify(entries)).not.toContain(text);
      const events = await uow.repos.events.list(scope);
      expect(events.filter(e => e.eventType === "agent.learned_guidance_frozen")).toHaveLength(1);
      const applications = events.filter(e => e.eventType === "agent.learned_guidance_applied");
      expect(applications).toHaveLength(2);
      for (const entry of entries) {
        expect(entry).toMatchObject({ setHash, promptVersion: getEquipePromptVersion("plan_adjustment").effective });
        expect(applications.find(e => (e.payload as { ledgerEntryId: string }).ledgerEntryId === entry.id)?.payload).toMatchObject({
          sourceEventId: source.id, versionHash, role: "caption_adjustment", appliedRefs: refs, setHash, fixedPromptVersion: entry.promptVersion,
        });
      }
      expect(await uow.repos.receipts.list(scope)).toEqual([]);
      expect((await uow.repos.items.get(scope, item.id))!.currentVersionHash).toBe(versionHash);
      expect((await uow.repos.items.get(scope, item.id))!.status).toBe("adjusting");
    } finally {
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(user).where(eq(user.id, reviewer));
    }
  });
});
