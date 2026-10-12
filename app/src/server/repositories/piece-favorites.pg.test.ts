import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import {
  user, workspaces, clientProfiles, creativeWorkItems, creativeWorkOutputs,
  pieceFavorites, outputDecisionEvents, calibrationSignals,
} from "@/server/db/schema";
import { resolveEquipeTestDatabaseUrl } from "@/server/equipe/data/test-database";
import { addPieceFavorite, removePieceFavorite, isPieceFavorited } from "./piece-favorites";

vi.mock("@/server/output-learning/dispatch", () => ({ dispatchOutputLearningRecomputeBestEffort: vi.fn() }));

const testUrl = resolveEquipeTestDatabaseUrl();
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) {
    throw new Error("Favorite tests require matching local database URLs ending in _test");
  }
}
const actorId = randomUUID();
const workspaceIds: string[] = [];

async function fixture() {
  const [workspace] = await db.insert(workspaces).values({ name: "Favorito simulado", slug: randomUUID() }).returning();
  workspaceIds.push(workspace.id);
  const [brand] = await db.insert(clientProfiles).values({ workspaceId: workspace.id, name: "Marca simulada" }).returning();
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
  return { workspace, work, output, input: { workspaceId: workspace.id, userId: actorId, outputId: output.id } };
}

async function events(workspaceId: string) {
  return db.select().from(outputDecisionEvents).where(eq(outputDecisionEvents.workspaceId, workspaceId));
}

describe.skipIf(!testUrl)("piece favorites with learning history (Postgres)", () => {
  beforeAll(async () => {
    await db.insert(user).values({ id: actorId, name: "Pessoa simulada", email: `${actorId}@example.com` });
  });
  afterAll(async () => {
    if (workspaceIds.length) await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
    await db.delete(user).where(inArray(user.id, [actorId]));
  });

  it("records favorited, removal and a new favorite as three attributed events", async () => {
    const { input } = await fixture();
    const first = await addPieceFavorite(input);
    expect(first.created).toBe(true);
    expect(await addPieceFavorite(input)).toEqual({ id: first.id, created: false });
    expect(await events(input.workspaceId)).toHaveLength(1);

    expect(await removePieceFavorite({ userId: actorId, outputId: input.outputId })).toBe(true);
    expect(await removePieceFavorite({ userId: actorId, outputId: input.outputId })).toBe(false);
    const afterRemoval = await events(input.workspaceId);
    expect(afterRemoval).toHaveLength(2);
    expect(afterRemoval.map((event) => event.action)).toEqual(["favorited", "favorite_removed"]);
    expect(afterRemoval[0]).toMatchObject({ direction: "positive", strength: "weak", userId: actorId, creativeWorkOutputId: input.outputId });
    expect(afterRemoval[1]).toMatchObject({ direction: "neutral", strength: "weak", userId: actorId });
    expect(await isPieceFavorited({ userId: actorId, outputId: input.outputId })).toBe(false);

    const again = await addPieceFavorite(input);
    expect(again.created).toBe(true);
    expect(again.id).not.toBe(first.id);
    expect(await events(input.workspaceId)).toHaveLength(3);
    expect(await db.select().from(calibrationSignals).where(eq(calibrationSignals.workspaceId, input.workspaceId))).toEqual([]);
    expect(await db.select().from(pieceFavorites).where(eq(pieceFavorites.workspaceId, input.workspaceId))).toHaveLength(1);
  });

  it("keeps the library working and records nothing when the port denies", async () => {
    const { input } = await fixture();
    const deny = vi.fn(async () => ({ allowed: false as const, reason: "local_learning_denied" as const }));
    const added = await addPieceFavorite(input, deny);
    expect(added.created).toBe(true);
    expect(await isPieceFavorited({ userId: actorId, outputId: input.outputId })).toBe(true);
    expect(await removePieceFavorite({ userId: actorId, outputId: input.outputId }, deny)).toBe(true);
    expect(await events(input.workspaceId)).toEqual([]);
  });

  it("rolls back the favorite change when the history insert fails", async () => {
    const { input, output } = await fixture();
    const trigger = `favorite_test_${randomUUID().replaceAll("-", "")}`;
    await db.execute(`CREATE FUNCTION adscale_app.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.creative_work_output_id = '${output.id}' THEN RAISE EXCEPTION 'simulated history failure'; END IF; RETURN NEW; END $$`);
    await db.execute(`CREATE TRIGGER ${trigger} BEFORE INSERT ON adscale_app.output_decision_events FOR EACH ROW EXECUTE FUNCTION adscale_app.${trigger}()`);
    try {
      await expect(addPieceFavorite(input)).rejects.toThrow();
      expect(await isPieceFavorited({ userId: actorId, outputId: input.outputId })).toBe(false);
      expect(await events(input.workspaceId)).toEqual([]);
    } finally {
      await db.execute(`DROP TRIGGER ${trigger} ON adscale_app.output_decision_events`);
      await db.execute(`DROP FUNCTION adscale_app.${trigger}()`);
    }
  });
});
