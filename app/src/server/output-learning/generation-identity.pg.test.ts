import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../db";
import { user, workspaces, clientProfiles, campaigns, derivations, creativeWorkItems, creativeWorkOutputs, creativeWorkPreparationAttempts, outputDecisionEvents, calibrationRules } from "../db/schema";
import { recordOutputDecisionEvidence } from "./output-decision-recorder";
import { loadOutputGenerationIdentity } from "../repositories/output-generation-identity";
import { selectCreativeWorkOutput } from "../repositories/creative-work";
import { addPieceFavorite, removePieceFavorite } from "../repositories/piece-favorites";
import { applyLearningSelectionEffect } from "../application/selection-learning-effect";
import { loadProposalEvidence } from "../brand-taste/proposal-evidence";
vi.mock("./dispatch", () => ({ dispatchOutputLearningRecomputeBestEffort: vi.fn() }));
const testUrl = process.env.TEST_DATABASE_URL ?? (process.env.CI ? process.env.DATABASE_URL : undefined);
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) throw new Error("Generation identity tests require matching local test database URLs ending in _test");
}
const workspaceId = randomUUID(), userId = randomUUID(), brandId = randomUUID(), workId = randomUUID(), outputId = randomUUID(), historicalId = randomUUID(), campaignId = randomUUID(), derivationId = randomUUID();
const scope = { workspaceId, clientProfileId: brandId };
const application = { role: "art_direction" as const, consumer: "art_direction" as const, executionId: outputId, callId: randomUUID(), callName: "art_direction", fixedPromptVersion: "creative-work-prompts/v2+" + "c".repeat(64), situation: "applied" as const, appliedRefs: [{ ruleId: randomUUID(), revision: "legacy" as const, contentHash: "a".repeat(64) }], setHash: "b".repeat(64) };
const expected = { state: "recorded", applications: [{ role: "art_direction", appliedRefs: application.appliedRefs, setHash: "b".repeat(64), fixedPromptVersion: "creative-work-prompts/v2+" + "c".repeat(64) }] };
describe.skipIf(!testUrl)("decision generation identity (Postgres, no providers)", () => {
  beforeAll(async () => {
    await db.insert(user).values({ id: userId, name: "Revisor simulado", email: `${userId}@example.test` });
    await db.insert(workspaces).values({ id: workspaceId, name: "Rastreio simulado", slug: workspaceId });
    await db.insert(clientProfiles).values({ id: brandId, workspaceId, name: "Marca simulada" });
    await db.insert(campaigns).values({ id: campaignId, ...scope, name: "Campanha simulada" });
    await db.insert(creativeWorkItems).values({ id: workId, ...scope, createdByUserId: userId, title: "Peça simulada", request: "Pedido", toolKind: "single", settings: { targetFormats: ["4:5"] } });
    for (const id of [outputId, historicalId]) await db.insert(creativeWorkOutputs).values({ id, workspaceId, workItemId: workId, creativeLevel: id === outputId ? "balanced" : "bold", targetFormat: "4:5", operationKey: id, status: "completed", outputKey: `test/${id}.png`, guidanceApplications: id === outputId ? [application] : null });
    await db.insert(creativeWorkPreparationAttempts).values({ workspaceId, workItemId: workId, kind: "creative_prepare", inputRevision: "unrelated", inputFingerprint: "unrelated", state: "completed", leaseExpiresAt: new Date(), guidanceApplications: [{ ...application, executionId: randomUUID(), fixedPromptVersion: "unrelated-v9" }] });
    await db.insert(derivations).values({ id: derivationId, workspaceId, campaignId, status: "completed", legacyGuidanceApplications: [{ ...application, consumer: "legacy_derivation", role: "legacy_derivation", fixedPromptVersion: "unknown" }] });
  });
  afterAll(async () => { await db.delete(workspaces).where(eq(workspaces.id, workspaceId)); await db.delete(user).where(eq(user.id, userId)); });

  it("copies the selected output only, leaving siblings and unrelated preparations out", async () => {
    expect(await loadOutputGenerationIdentity({ ...scope, creativeWorkOutputId: outputId })).toEqual(expected);
    expect(await loadOutputGenerationIdentity({ ...scope, creativeWorkOutputId: historicalId })).toEqual({ state: "unknown", applications: [] });
    expect(await loadOutputGenerationIdentity({ ...scope, workspaceId: randomUUID(), creativeWorkOutputId: outputId })).toEqual({ state: "unknown", applications: [] });
    expect(await loadOutputGenerationIdentity({ ...scope, clientProfileId: randomUUID(), creativeWorkOutputId: outputId })).toEqual({ state: "unknown", applications: [] });
    const event = await recordOutputDecisionEvidence({ ...scope, userId, creativeWorkOutputId: outputId, action: "regenerated", source: "test" });
    expect(event.contextSnapshot.generationIdentity).toEqual(expected);
  });
  it("copies the legacy derivation record and preserves the unknown fixed version", async () => {
    const event = await recordOutputDecisionEvidence({ ...scope, userId, campaignId, derivationId, action: "approved", source: "test" });
    expect(event.contextSnapshot.generationIdentity).toMatchObject({ state: "recorded", applications: [{ role: "legacy_derivation", fixedPromptVersion: "unknown", appliedRefs: application.appliedRefs, setHash: application.setHash }] });
    expect(await loadOutputGenerationIdentity({ ...scope, clientProfileId: randomUUID(), campaignId, derivationId })).toEqual({ state: "unknown", applications: [] });
  });
  it("freezes selection identity before asynchronous learning and preserves replay", async () => {
    const options = { confirmObjective: true, decision: { userId, requestKey: randomUUID(), choice: { saveToLibrary: false, saveAsRecipe: false, confirmObjective: true } }, effects: [] };
    const selection = await selectCreativeWorkOutput(workspaceId, workId, outputId, options);
    expect(selection?.decision?.contextSnapshot.generationIdentity).toEqual(expected);
    await db.update(creativeWorkOutputs).set({ guidanceApplications: [{ ...application, fixedPromptVersion: "later-v9" }] }).where(eq(creativeWorkOutputs.id, outputId));
    try {
      expect((await selectCreativeWorkOutput(workspaceId, workId, outputId, options))?.decision?.contextSnapshot.generationIdentity).toEqual(expected);
      await applyLearningSelectionEffect({ workspaceId, workItemId: workId, outputId, selectionDecisionId: selection!.decision!.id }, async () => ({ allowed: true }));
      const [event] = await db.select().from(outputDecisionEvents).where(eq(outputDecisionEvents.idempotencyKey, `selection-decision:${selection!.decision!.id}:approved`));
      expect(event.contextSnapshot.generationIdentity).toEqual(expected);
    } finally { await db.update(creativeWorkOutputs).set({ guidanceApplications: [application] }).where(eq(creativeWorkOutputs.id, outputId)); }
  });
  it("copies generation identity atomically for favorite addition and removal", async () => {
    await addPieceFavorite({ workspaceId, userId, outputId }, async () => ({ allowed: true }));
    await removePieceFavorite({ workspaceId, userId, outputId }, async () => ({ allowed: true }));
    const events = await db.select().from(outputDecisionEvents).where(eq(outputDecisionEvents.source, "composer"));
    for (const action of ["favorited", "favorite_removed"]) expect(events.find(event => event.workspaceId === workspaceId && event.action === action)?.contextSnapshot.generationIdentity).toEqual(expected);
  });
  it("reports frozen identity and historical unknown without reconstructing from current output", async () => {
    const event = await recordOutputDecisionEvidence({ ...scope, userId, creativeWorkOutputId: outputId, action: "approved", source: "test" });
    const [history] = await db.insert(outputDecisionEvents).values({ ...scope, userId, creativeWorkOutputId: outputId, action: "approved", direction: "positive", strength: "strong", source: "test", contextSnapshot: {} }).returning();
    const [rule] = await db.insert(calibrationRules).values({ ...scope, category: "gestalt", rationale: "Simulação", supportingEvidenceRefs: [{ kind: "output_decision", id: event.id }, { kind: "output_decision", id: history.id }] }).returning();
    const report = await loadProposalEvidence({ ...scope, proposalKind: "rule", proposalId: rule.id });
    expect(report?.support[0].generationIdentity).toEqual(expected);
    expect(report?.support[1].generationIdentity).toEqual({ state: "unknown", applications: [] });
    expect(await loadProposalEvidence({ ...scope, clientProfileId: randomUUID(), proposalKind: "rule", proposalId: rule.id })).toBeNull();
    expect(JSON.stringify(report)).not.toMatch(/prompt":|generationLog|signedUrl|outputKey/);
  });
});
