import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { user, workspaces, clientProfiles, creativeWorkItems, creativeWorkOutputs, calibrationSignals, calibrationRules } from "@/server/db/schema";
import { resolveEquipeTestDatabaseUrl } from "@/server/equipe/data/test-database";
import { generateLocalBrandTasteProposals } from "./local-brand-taste-proposals";

vi.mock("@/server/output-learning/dispatch", () => ({ dispatchOutputLearningRecomputeBestEffort: vi.fn() }));

const testUrl = resolveEquipeTestDatabaseUrl();
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) {
    throw new Error("Local taste proposal tests require matching local database URLs ending in _test");
  }
}
const actorId = randomUUID();
const workspaceIds: string[] = [];

describe.skipIf(!testUrl)("local brand taste proposals (Postgres)", () => {
  beforeAll(async () => {
    await db.insert(user).values({ id: actorId, name: "Pessoa simulada", email: `${actorId}@example.com` });
  });
  afterAll(async () => {
    if (workspaceIds.length) await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
    await db.delete(user).where(inArray(user.id, [actorId]));
  });

  it("persists candidates once per evidence set and never approves them", async () => {
    const [workspace] = await db.insert(workspaces).values({ name: "Gosto simulado", slug: randomUUID() }).returning();
    workspaceIds.push(workspace.id);
    const [brand] = await db.insert(clientProfiles).values({ workspaceId: workspace.id, name: "Marca simulada" }).returning();
    const scope = { workspaceId: workspace.id, clientProfileId: brand.id };
    const [work] = await db.insert(creativeWorkItems).values({
      workspaceId: workspace.id, clientProfileId: brand.id, createdByUserId: actorId,
      title: "Trabalho simulado", request: "Teste", toolKind: "single", settings: { targetFormats: ["4:5"] },
      brief: { theme: "Teste", objective: "Teste", audience: "Teste", offer: "Teste" },
    }).returning();
    const [output] = await db.insert(creativeWorkOutputs).values({
      workspaceId: workspace.id, workItemId: work.id, creativeLevel: "balanced", targetFormat: "4:5", versionNumber: 1,
      operationKey: randomUUID(), outputKey: `test/${randomUUID()}.png`, status: "completed" as const,
      quality: { schemaVersion: 1, objectiveVerdict: "pass" },
    }).returning();
    await db.insert(calibrationSignals).values({
      workspaceId: workspace.id, clientProfileId: brand.id, campaignId: null, derivationId: null,
      creativeWorkOutputId: output.id, outputDecisionEventId: null, humanVerdict: "nao_entra" as const,
      systemOlharVerdict: "pronta", systemExportStatus: "pronta", mismatchBucket: "system_too_permissive",
      sourceLabel: "real_customer", reviewerId: actorId, reviewedAt: new Date(),
    });

    const first = await generateLocalBrandTasteProposals(scope);
    expect(first.status).toBe("generated");
    if (first.status !== "generated") throw new Error("expected generated");
    expect(first.created).toHaveLength(1);
    expect(first.created[0]).toMatchObject({ status: "candidate", category: "gestalt", clientProfileId: brand.id });

    const second = await generateLocalBrandTasteProposals(scope);
    expect(second).toEqual({ status: "generated", created: [], skipped: 1 });
    const rules = await db.select().from(calibrationRules).where(eq(calibrationRules.workspaceId, workspace.id));
    expect(rules).toHaveLength(1);
    expect(rules[0].status).toBe("candidate");

    const deny = vi.fn(async () => ({ allowed: false as const, reason: "missing_brand" as const }));
    await expect(generateLocalBrandTasteProposals(scope, deny)).resolves.toEqual({ status: "denied", reason: "missing_brand" });
    expect(await db.select().from(calibrationRules).where(eq(calibrationRules.workspaceId, workspace.id))).toHaveLength(1);
  });
});
