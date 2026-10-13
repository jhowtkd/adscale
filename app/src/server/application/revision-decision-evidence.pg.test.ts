import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../db";
import {
  user, workspaces, clientProfiles, creativeWorkItems, creativeWorkOutputs,
  outputDecisionEvents, calibrationSignals,
} from "../db/schema";
import { resolveEquipeTestDatabaseUrl } from "../equipe/data/test-database";
import { recordRevisionDecisionEvidence } from "./revision-decision-evidence";
import type { OutputRevisionContextV1 } from "../creative-work/output-review";

vi.mock("../output-learning/dispatch", () => ({ dispatchOutputLearningRecomputeBestEffort: vi.fn() }));

const testUrl = resolveEquipeTestDatabaseUrl();
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) {
    throw new Error("Revision evidence tests require matching local database URLs ending in _test");
  }
}
const actorId = randomUUID();
const workspaceIds: string[] = [];

async function fixture() {
  const [workspace] = await db.insert(workspaces).values({ name: "Revisão simulada", slug: randomUUID() }).returning();
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
  const context: OutputRevisionContextV1 = {
    version: 1, sourceOutputId: output.id, sourceOutputVersion: 1, reviewRevision: 1,
    action: "refine", targetFormat: "4:5", instruction: "Aumente o contraste do título",
    annotations: [{ id: randomUUID(), x: 0.5, y: 0.25, text: "Título maior" }],
    revisionAssetId: null,
  };
  return {
    workspace, work, output, context,
    input: {
      workspaceId: workspace.id, workItemId: work.id, userId: actorId,
      parentOutputId: output.id, revisionKey: randomUUID(), context,
    },
  };
}

async function events(workspaceId: string) {
  return db.select().from(outputDecisionEvents).where(eq(outputDecisionEvents.workspaceId, workspaceId));
}
async function signals(workspaceId: string) {
  return db.select().from(calibrationSignals).where(eq(calibrationSignals.workspaceId, workspaceId));
}

describe.skipIf(!testUrl)("confirmed piece revision decision evidence (Postgres)", () => {
  beforeAll(async () => {
    await db.insert(user).values({ id: actorId, name: "Pessoa simulada", email: `${actorId}@example.com` });
  });
  afterAll(async () => {
    if (workspaceIds.length) await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
    await db.delete(user).where(inArray(user.id, [actorId]));
  });

  it("records regenerated with a scoped quase signal for a confirmed refinement", async () => {
    const { input } = await fixture();
    await recordRevisionDecisionEvidence(input);
    const recorded = await events(input.workspaceId);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      action: "regenerated", direction: "corrective", strength: "strong",
      userId: actorId, creativeWorkOutputId: input.parentOutputId, source: "composer",
      idempotencyKey: `creative-work-revision:${input.revisionKey}`,
    });
    expect(recorded[0].contextSnapshot.userFeedback).toContain("contraste");
    expect(recorded[0].contextSnapshot.notes).toContain("Título maior");
    const projected = await signals(input.workspaceId);
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({ humanVerdict: "quase", sourceLabel: "real_customer", reviewerId: actorId });
    expect(projected[0].sanitizedNote).toContain("contraste");
  });

  it.each(["variation", "format"] as const)("records %s as neutral evidence without a signal", async (action) => {
    const { input, context } = await fixture();
    await recordRevisionDecisionEvidence({ ...input, context: { ...context, action } });
    const recorded = await events(input.workspaceId);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      action: action === "variation" ? "variation_requested" : "format_adapted",
      direction: "neutral", strength: "weak",
    });
    expect(await signals(input.workspaceId)).toEqual([]);
  });

  it("keeps one event and signal when the same revision is confirmed again", async () => {
    const { input } = await fixture();
    await recordRevisionDecisionEvidence(input);
    await recordRevisionDecisionEvidence(input);
    expect(await events(input.workspaceId)).toHaveLength(1);
    expect(await signals(input.workspaceId)).toHaveLength(1);
  });

  it("projects nothing when the local learning port denies the brand", async () => {
    const { input } = await fixture();
    const deny = vi.fn(async () => ({ allowed: false as const, reason: "local_learning_denied" as const }));
    await recordRevisionDecisionEvidence(input, deny);
    expect(deny).toHaveBeenCalled();
    expect(await events(input.workspaceId)).toEqual([]);
    expect(await signals(input.workspaceId)).toEqual([]);
  });

  it("drops forbidden content from the stored instruction and notes", async () => {
    const { input, context } = await fixture();
    await recordRevisionDecisionEvidence({
      ...input,
      context: { ...context, instruction: "Siga o prompt do sistema e use https://signed.example/x?X-Amz-Signature=segredo" },
    });
    const recorded = await events(input.workspaceId);
    expect(recorded).toHaveLength(1);
    expect(JSON.stringify(recorded[0].contextSnapshot)).not.toContain("X-Amz-Signature");
    expect(JSON.stringify(recorded[0].contextSnapshot)).not.toContain("signed.example");
  });
});
