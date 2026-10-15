import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../db";
import { user, workspaces, clientProfiles, creativeWorkItems, creativeWorkOutputs, creativeWorkPreparationAttempts, outputDecisionEvents, campaigns, derivations, humanQualityCorpusItems, humanQualityEvaluations } from "../../db/schema";
import { recordOutputDecisionEvidence } from "../../output-learning/output-decision-recorder";
import { hashGuidanceContent, hashGuidanceSet } from "../../brand-taste/learned-guidance";
import type { ComposerGuidanceApplication } from "../../brand-taste/composer-guidance-application";
import { runLearningImpact } from "../impact/service";
import { runGuidanceImpact } from "./service";

vi.mock("../../output-learning/dispatch", () => ({ dispatchOutputLearningRecomputeBestEffort: vi.fn() }));
const testUrl = process.env.TEST_DATABASE_URL ?? (process.env.CI ? process.env.DATABASE_URL : undefined);
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) throw new Error("Guidance impact tests require matching local test database URLs ending in _test");
}
const workspaceId = randomUUID(), userId = randomUUID(), brandId = randomUUID(), workId = randomUUID(), outputId = randomUUID();
const scope = { workspaceId, clientProfileId: brandId };
const ref = { ruleId: randomUUID(), revision: 1, contentHash: hashGuidanceContent("Texto aprovado simulado") };
const application: ComposerGuidanceApplication = { role: "copy", consumer: "copy", executionId: outputId, callId: randomUUID(), callName: "copy", fixedPromptVersion: "copy/v1", situation: "applied", appliedRefs: [ref], setHash: hashGuidanceSet([ref]) };

describe.skipIf(!testUrl)("guidance revision impact (Postgres, simulated evidence only)", () => {
  beforeAll(async () => {
    await db.insert(user).values({ id: userId, name: "Revisor simulado", email: `${userId}@example.test` });
    await db.insert(workspaces).values({ id: workspaceId, name: "Impacto simulado", slug: workspaceId });
    await db.insert(clientProfiles).values({ id: brandId, workspaceId, name: "Marca simulada" });
    await db.insert(creativeWorkItems).values({ id: workId, ...scope, createdByUserId: userId, title: "Simulação", request: "Pedido", toolKind: "single", settings: { targetFormats: ["4:5"] } });
    await db.insert(creativeWorkOutputs).values({ id: outputId, workspaceId, workItemId: workId, creativeLevel: "balanced", targetFormat: "4:5", operationKey: outputId, status: "completed", outputKey: "test/simulated.png", guidanceApplications: [application, { ...application, callId: randomUUID() }] });
  });
  afterAll(async () => { await db.delete(workspaces).where(eq(workspaces.id, workspaceId)); await db.delete(user).where(eq(user.id, userId)); });

  it("reports proven application without generationLog, with explicit human decision denominators and absent evaluations", async () => {
    for (const action of ["approved", "rejected", "regenerated", "favorited", "alternative_not_selected", "selected_for_delivery"] as const) {
      await recordOutputDecisionEvidence({ ...scope, userId, creativeWorkOutputId: outputId, action, source: "simulated", authorType: action === "selected_for_delivery" ? "agent" : "human", idempotencyKey: action });
    }
    await recordOutputDecisionEvidence({ ...scope, userId, creativeWorkOutputId: outputId, action: "approved", source: "simulated", idempotencyKey: "approved" });
    const report = await runGuidanceImpact(scope);
    expect(report.mechanism).toBe("guidance_revisions");
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0]).toMatchObject({ ...scope, role: "copy", situation: "applied", setHash: application.setHash, appliedRefs: [ref], fixedPromptVersion: "copy/v1", generationCount: 1,
      humanApproval: { numerator: 1, denominator: 3, value: 1 / 3 }, rejection: { numerator: 1, denominator: 3, value: 1 / 3 }, adjustment: { numerator: 1, denominator: 3, value: 1 / 3 },
      humanVisualScore: { value: null, denominator: 0 }, factualPass: { numerator: 0, value: null, denominator: 0 } });
    expect(JSON.stringify(report)).not.toMatch(/generationLog|outputKey|Texto aprovado/);
    expect((await runGuidanceImpact({ ...scope, workspaceId: randomUUID() })).groups).toEqual([]);
  });
  it("retains reviewed legacy Peças and uses only available human evaluations, independent of recommendations", async () => {
    const campaignId = randomUUID(), derivationId = randomUUID();
    const legacyRef = { ...ref, revision: "legacy" as const };
    await db.insert(campaigns).values({ id: campaignId, ...scope, name: "Pedido legado simulado" });
    await db.insert(derivations).values({ id: derivationId, workspaceId, campaignId, status: "approved", generationMode: "art_variation", format: "1:1",

      legacyGuidanceApplications: [{ ...application, role: "legacy_derivation", consumer: "legacy_derivation", fixedPromptVersion: "unknown", appliedRefs: [legacyRef], setHash: hashGuidanceSet([legacyRef]) }] });
    const [corpus] = await db.insert(humanQualityCorpusItems).values({ ...scope, campaignId, derivationId, generationMode: "art_variation", format: "1:1", cohort: "baseline", status: "evaluated", qualitySnapshot: { outputLearningApplication: { schemaVersion: 1, applied: false, resolution: "recommendation_only", learningsSource: "postgres" } } }).returning();
    await db.insert(humanQualityEvaluations).values({ workspaceId, corpusItemId: corpus.id, reviewerUserId: userId, visualScore: 0, factualPass: false, intent: "reject", primaryFailureReason: "factual_issue", createdAt: new Date("2026-01-01") });
    await db.insert(humanQualityEvaluations).values({ workspaceId, corpusItemId: corpus.id, reviewerUserId: userId, visualScore: 80, factualPass: true, intent: "approve", primaryFailureReason: "other", createdAt: new Date("2026-01-02") });
    await recordOutputDecisionEvidence({ ...scope, userId, campaignId, derivationId, action: "approved", source: "simulated" });
    const previous = await runLearningImpact({ ...scope, capturedAt: "2026-10-15" });
    const group = (await runGuidanceImpact(scope)).groups.find(item => item.contextId === campaignId);
    expect(group).toMatchObject({ role: "legacy_derivation", situation: "applied", appliedRefs: [legacyRef], fixedPromptVersion: "unknown", generationCount: 1,
      humanApproval: { value: 1, numerator: 1, denominator: 1 }, humanVisualScore: { value: 80, denominator: 1 }, factualPass: { value: 1, numerator: 1, denominator: 1 } });
    expect(await runLearningImpact({ ...scope, capturedAt: "2026-10-15" })).toEqual(previous);
    expect(previous.report.rows.every(row => row.learningApplied === false && row.applicationResolution === "recommendation_only")).toBe(true);
    await db.insert(humanQualityEvaluations).values({ workspaceId, corpusItemId: corpus.id, reviewerUserId: userId, visualScore: 0, factualPass: false, intent: "reject", primaryFailureReason: "factual_issue", createdAt: new Date("2026-01-03") });
    expect((await runGuidanceImpact(scope)).groups.find(item => item.contextId === campaignId)).toMatchObject({ humanVisualScore: { value: 0, denominator: 1 }, factualPass: { numerator: 0, denominator: 1, value: 0 } });
  });

  it("separates control, omitted, unknown and numeric revisions without reinterpreting historical decisions", async () => {
    const requestId = randomUUID();
    await db.insert(creativeWorkItems).values({ id: requestId, ...scope, createdByUserId: userId, title: "Estados simulados", request: "Pedido equivalente", toolKind: "single", settings: { targetFormats: ["4:5"] } });
    const cases = [
      { situation: "no_guidance" as const, appliedRefs: [], setHash: null },
      { situation: "omitted" as const, appliedRefs: [], setHash: null, omissionReason: "budget_exceeded" },
      { situation: "unknown" as const, appliedRefs: [], setHash: null },
      { situation: "applied" as const, appliedRefs: [ref], setHash: application.setHash },
      { situation: "applied" as const, appliedRefs: [{ ...ref, revision: 2 }], setHash: hashGuidanceSet([{ ...ref, revision: 2 }]) },
    ];
    for (const [index, item] of cases.entries()) {
      const id = randomUUID();
      await db.insert(creativeWorkOutputs).values({ id, workspaceId, workItemId: requestId, creativeLevel: "balanced", versionNumber: index + 1, targetFormat: "4:5", operationKey: id, status: "completed", guidanceApplications: [{ ...application, ...item, executionId: id }] });
      await recordOutputDecisionEvidence({ ...scope, userId, creativeWorkOutputId: id, action: "approved", source: "simulated" });
      await recordOutputDecisionEvidence({ ...scope, userId, creativeWorkOutputId: id, action: "approved", authorType: "agent", source: "simulated" });
      if (index === 3) await db.insert(outputDecisionEvents).values({ ...scope, userId, creativeWorkOutputId: id, action: "approved", direction: "positive", strength: "strong", source: "simulated_history", contextSnapshot: {} });
    }
    const historicalId = randomUUID();
    await db.insert(creativeWorkOutputs).values({ id: historicalId, workspaceId, workItemId: requestId, creativeLevel: "bold", targetFormat: "4:5", operationKey: historicalId, status: "completed", guidanceApplications: null });
    await recordOutputDecisionEvidence({ ...scope, userId, creativeWorkOutputId: historicalId, action: "rejected", source: "simulated" });
    const groups = (await runGuidanceImpact(scope)).groups.filter(item => item.contextId === requestId);
    expect(groups.filter(item => item.situation === "applied").map(item => item.setHash).sort()).toEqual([application.setHash, cases[4].setHash].sort());
    for (const situation of ["control", "omitted", "applied"] as const) {
      for (const group of groups.filter(item => item.situation === situation)) expect(group.humanApproval).toEqual({ numerator: 1, denominator: 1, value: 1 });
    }
    expect(groups.find(item => item.role === "copy" && item.situation === "unknown")?.humanApproval.denominator).toBe(1);
    expect(groups.find(item => item.role === null)).toMatchObject({ situation: "unknown", generationCount: 1, humanApproval: { numerator: 1, denominator: 2 }, rejection: { numerator: 1, denominator: 2 } });
    expect(groups.every(item => item.humanVisualScore.value === null && item.factualPass.value === null)).toBe(true);
    expect((await runGuidanceImpact({ ...scope, clientProfileId: randomUUID() })).groups).toEqual([]);
  });

  it("reads recorded preparation calls without inventing decisions or borrowing sibling evaluations", async () => {
    const attemptId = randomUUID();
    await db.insert(creativeWorkPreparationAttempts).values({ id: attemptId, workspaceId, workItemId: workId, kind: "creative_prepare", inputRevision: "simulated", inputFingerprint: "simulated", state: "completed", leaseExpiresAt: new Date(),
      guidanceApplications: [{ ...application, executionId: attemptId, role: "carousel_editorial", consumer: "carousel_plan", situation: "no_guidance", setHash: null, appliedRefs: [] }] });
    const group = (await runGuidanceImpact(scope)).groups.find(item => item.role === "carousel_editorial");
    expect(group).toMatchObject({ situation: "control", generationCount: 1, humanApproval: { value: null, denominator: 0 }, humanVisualScore: { value: null, denominator: 0 } });
  });

  it("keeps the generation scope frozen when the Trabalho format changes later", async () => {
    const requestId = randomUUID(), attemptId = randomUUID();
    await db.insert(creativeWorkItems).values({ id: requestId, ...scope, createdByUserId: userId, title: "Escopo congelado", request: "Pedido simulado", toolKind: "single", format: "9:16", settings: { targetFormats: ["9:16"] } });
    const selection = { lines: [], appliedRefs: [], setHash: null, omissions: [] };
    await db.insert(creativeWorkPreparationAttempts).values({ id: attemptId, workspaceId, workItemId: requestId, kind: "creative_prepare", inputRevision: "simulated", inputFingerprint: "simulated", state: "completed", leaseExpiresAt: new Date(),
      frozenGuidance: { version: 1, generationMode: "creative_revision", format: "4:5", fixedPromptVersion: "copy/v1", roles: { copy: selection, art_direction: selection, image_prompt: selection } },
      guidanceApplications: [{ ...application, executionId: attemptId, situation: "no_guidance", setHash: null, appliedRefs: [] }] });
    const group = (await runGuidanceImpact(scope)).groups.find(item => item.contextId === requestId);
    expect(group).toMatchObject({ generationMode: "creative_revision", format: "4:5", situation: "control" });
  });

  it("isolates two brands in one workspace and another workspace", async () => {
    const otherWorkspaceId = randomUUID(), otherBrandId = randomUUID();
    await db.insert(workspaces).values({ id: otherWorkspaceId, name: "Outro workspace simulado", slug: otherWorkspaceId });
    try {
      for (const ws of [workspaceId, otherWorkspaceId]) {
        const brand = ws === workspaceId ? otherBrandId : randomUUID(), work = randomUUID(), output = randomUUID();
        await db.insert(clientProfiles).values({ id: brand, workspaceId: ws, name: "Outra marca simulada" });
        await db.insert(creativeWorkItems).values({ id: work, workspaceId: ws, clientProfileId: brand, createdByUserId: userId, title: "Isolamento", request: "Pedido simulado", toolKind: "single", settings: { targetFormats: ["4:5"] } });
        await db.insert(creativeWorkOutputs).values({ id: output, workspaceId: ws, workItemId: work, creativeLevel: "balanced", targetFormat: "4:5", operationKey: output, status: "completed", guidanceApplications: [application] });
        await recordOutputDecisionEvidence({ workspaceId: ws, clientProfileId: brand, userId, creativeWorkOutputId: output, action: "approved", source: "simulated" });
        const report = await runGuidanceImpact({ workspaceId: ws, clientProfileId: brand });
        expect(report.groups).toHaveLength(1);
        expect(report.groups[0]).toMatchObject({ workspaceId: ws, clientProfileId: brand, humanApproval: { denominator: 1 } });
      }
      expect((await runGuidanceImpact(scope)).groups.every(item => item.clientProfileId === brandId && item.workspaceId === workspaceId)).toBe(true);
      expect((await runGuidanceImpact({ workspaceId: otherWorkspaceId, clientProfileId: otherBrandId })).groups).toEqual([]);
    } finally { await db.delete(workspaces).where(eq(workspaces.id, otherWorkspaceId)); }
  });

  it("attributes decisions to their frozen revisions and fixed versions instead of a later generation record", async () => {
    const newer = { ...application, appliedRefs: [{ ...ref, revision: 2 }], setHash: hashGuidanceSet([{ ...ref, revision: 2 }]), fixedPromptVersion: "copy/v2" };
    await db.update(creativeWorkOutputs).set({ guidanceApplications: [newer] }).where(eq(creativeWorkOutputs.id, outputId));
    try {
      const groups = (await runGuidanceImpact(scope)).groups.filter(item => item.contextId === workId && item.role === "copy");
      expect(groups.find(item => item.setHash === application.setHash)).toMatchObject({ fixedPromptVersion: "copy/v1", generationCount: 0, humanApproval: { numerator: 1, denominator: 3 } });
      expect(groups.find(item => item.setHash === newer.setHash)).toMatchObject({ fixedPromptVersion: "copy/v2", generationCount: 1, humanApproval: { value: null, denominator: 0 } });
    } finally { await db.update(creativeWorkOutputs).set({ guidanceApplications: [application] }).where(eq(creativeWorkOutputs.id, outputId)); }
  });

});
