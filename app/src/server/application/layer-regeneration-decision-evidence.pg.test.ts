import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../db";
import {
  user, workspaces, clientProfiles, creativeWorkItems, creativeWorkOutputs,
  outputDecisionEvents, calibrationSignals,
} from "../db/schema";
import { resolveEquipeTestDatabaseUrl } from "../equipe/data/test-database";
import { recordLayerRegenerationDecisionEvidence } from "./layer-regeneration-decision-evidence";

vi.mock("../output-learning/dispatch", () => ({ dispatchOutputLearningRecomputeBestEffort: vi.fn() }));

const testUrl = resolveEquipeTestDatabaseUrl();
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) {
    throw new Error("Layer regeneration evidence tests require matching local database URLs ending in _test");
  }
}
const actorId = randomUUID();
const workspaceIds: string[] = [];

async function fixture() {
  const [workspace] = await db.insert(workspaces).values({ name: "Camada simulada", slug: randomUUID() }).returning();
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
  return {
    workspace, work, output,
    input: {
      workspaceId: workspace.id, userId: actorId, outputId: output.id,
      operationId: randomUUID(), layerId: "layer-title", instruction: "Refaça só o título, maior e com mais contraste",
    },
  };
}

async function events(workspaceId: string) {
  return db.select().from(outputDecisionEvents).where(eq(outputDecisionEvents.workspaceId, workspaceId));
}
async function signals(workspaceId: string) {
  return db.select().from(calibrationSignals).where(eq(calibrationSignals.workspaceId, workspaceId));
}

describe.skipIf(!testUrl)("confirmed layer regeneration decision evidence (Postgres)", () => {
  beforeAll(async () => {
    await db.insert(user).values({ id: actorId, name: "Pessoa simulada", email: `${actorId}@example.com` });
  });
  afterAll(async () => {
    if (workspaceIds.length) await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
    await db.delete(user).where(inArray(user.id, [actorId]));
  });

  it("records layer_regenerated linked to the layer and operation without a signal", async () => {
    const { input } = await fixture();
    await recordLayerRegenerationDecisionEvidence(input);
    const recorded = await events(input.workspaceId);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      action: "layer_regenerated", direction: "corrective", strength: "strong",
      userId: actorId, creativeWorkOutputId: input.outputId, source: "layer_editor",
      idempotencyKey: `creative-work-layer-regeneration:${input.operationId}`,
    });
    expect(recorded[0].contextSnapshot).toMatchObject({
      layerId: "layer-title", operationId: input.operationId,
    });
    expect(recorded[0].contextSnapshot.userFeedback).toContain("título");
    expect(await signals(input.workspaceId)).toEqual([]);
  });

  it("keeps one event when the same operation is confirmed again", async () => {
    const { input } = await fixture();
    await recordLayerRegenerationDecisionEvidence(input);
    await recordLayerRegenerationDecisionEvidence(input);
    expect(await events(input.workspaceId)).toHaveLength(1);
    expect(await signals(input.workspaceId)).toEqual([]);
  });

  it("records nothing when the local learning port denies the brand", async () => {
    const { input } = await fixture();
    const deny = vi.fn(async () => ({ allowed: false as const, reason: "local_learning_denied" as const }));
    await recordLayerRegenerationDecisionEvidence(input, deny);
    expect(deny).toHaveBeenCalled();
    expect(await events(input.workspaceId)).toEqual([]);
  });

  it("records nothing for an output outside the workspace scope", async () => {
    const own = await fixture();
    const foreign = await fixture();
    await recordLayerRegenerationDecisionEvidence({ ...own.input, outputId: foreign.output.id });
    expect(await events(own.input.workspaceId)).toEqual([]);
  });
});
