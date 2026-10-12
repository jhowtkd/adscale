import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { campaigns, clientProfiles, derivations, user, workspaces } from "@/server/db/schema";
import { listOutputDecisionEvents } from "@/server/repositories/output-decision-event";
import { listCalibrationSignalsForClientProfile } from "@/server/repositories/calibration-signal";
import { selectDerivationForCorpus, submitHumanEvaluation } from "./service";
import type { OlharVerdictPayload, ExportStatusPayload } from "@/server/ai/olhar/dual-verdict";
import { POST as selectHttp } from "@/app/api/feedback/human-quality-corpus/route";
import { GET as evidenceHttp } from "@/app/api/admin/quality/brands/[clientProfileId]/evidence/route";
import { insertCorpusItem } from "@/server/repositories/human-quality-corpus";
import { submitCorpusEvaluation } from "@/server/repositories/human-quality-corpus";
import { POST as evaluationHttp } from "@/app/api/feedback/human-quality-corpus/[id]/evaluation/route";
import { recordHumanDecisionCalibrationEvidence } from "./human-decision-calibration";
import { captureCorpusCandidateFromDerivation } from "./candidate-capture";
import { recordOutputDecisionEvidence } from "@/server/output-learning/output-decision-recorder";
import { promoteCorpusCandidateToQueue } from "./candidate-promotion";
import { runCorpusBackfillBatch } from "./ingestion/backfill";
import { insertCorpusCandidate } from "@/server/repositories/human-quality-candidate";
import { regenerateDerivation } from "@/server/application/regenerate-derivation";
import { spend } from "@/server/billing/paywall";
import { inngest } from "@/server/jobs/client";

const auth = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/server/auth/require-platform-owner", () => ({
  requirePlatformOwner: vi.fn(async () => ({ user: { id: auth.userId } })),
}));

vi.mock("@/server/output-learning/dispatch", () => ({
  dispatchOutputLearningRecomputeBestEffort: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock("@/server/repositories/assistant-goal", () => ({
  getCorpusConsent: vi.fn(async () => ({ status: "granted" })),
}));
vi.mock("@/server/billing/paywall", () => ({
  spend: vi.fn(async () => ({ ok: true, creditsSpent: 50 })),
}));
vi.mock("@/server/jobs/client", () => ({
  inngest: { send: vi.fn(async () => ({ ids: ["fixture-event"] })) },
}));
vi.mock("@/server/memory/campaign-memory-context", () => ({
  recordCampaignMemoryEntry: vi.fn(async () => ({ schemaVersion: 1, entries: [] })),
}));

const databaseUrl = process.env.DATABASE_URL && new URL(process.env.DATABASE_URL);
const testUrl = process.env.TEST_DATABASE_URL ?? (
  process.env.CI === "true" && databaseUrl?.pathname.endsWith("_test")
    && ["localhost", "127.0.0.1"].includes(databaseUrl.hostname)
    ? process.env.DATABASE_URL : undefined
);
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!(parsed.pathname.endsWith("_test") && ["localhost", "127.0.0.1"].includes(parsed.hostname) && process.env.DATABASE_URL === testUrl)) {
    throw new Error("Corpus evidence requires matching local TEST_DATABASE_URL and DATABASE_URL ending in _test");
  }
}

const actorId = `corpus-evidence-${crypto.randomUUID()}`;
const createdWorkspaces: string[] = [];
const olharVerdict: OlharVerdictPayload = {
  value: "pronta", axes: { figura: 3, gestalt: 3, voz: 3, convite: 3 },
  whatWorks: [], whatBlocks: [], directionNote: "Direção simulada", source: "manual", evaluatedAt: "2026-10-12T12:00:00Z",
};
const exportStatus: ExportStatusPayload = { value: "bloqueado", issues: [], setupIssues: [], evaluatedAt: "2026-10-12T12:00:00Z" };

async function scope(overrides: Partial<typeof derivations.$inferInsert> = {}) {
  const [workspace] = await db.insert(workspaces).values({ name: "Corpus fixture", slug: crypto.randomUUID() }).returning();
  createdWorkspaces.push(workspace.id);
  const [profile] = await db.insert(clientProfiles).values({ workspaceId: workspace.id, name: "Marca simulada" }).returning();
  const [campaign] = await db.insert(campaigns).values({ workspaceId: workspace.id, clientProfileId: profile.id, name: "Campanha simulada" }).returning();
  const [derivation] = await db.insert(derivations).values({
    workspaceId: workspace.id, campaignId: campaign.id, status: "completed", outputKey: "fixture.png",
    qualityScore: 84, creativeLevel: "bold",
    olharVerdict, exportStatus, ...overrides,
  }).returning();
  return { workspaceId: workspace.id, clientProfileId: profile.id, campaignId: campaign.id, derivationId: derivation.id };
}

describe.skipIf(!testUrl)("corpus decision evidence through public commands (Postgres)", () => {
  beforeAll(async () => {
    const result = await db.execute(sql`select current_database() as name`);
    expect(result.rows[0].name).toBe(new URL(testUrl!).pathname.slice(1));
    await db.insert(user).values({ id: actorId, name: "Revisor simulado", email: `${actorId}@example.com`, emailVerified: true });
    auth.userId = actorId;
  }, 60000);

  afterAll(async () => {
    if (createdWorkspaces.length) await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaces));
    await db.delete(user).where(eq(user.id, actorId));
  }, 60000);

  it("freezes the quality context at ingress and exposes it after the live Peça changes", async () => {
    const own = await scope();
    const item = await selectDerivationForCorpus({ ...own, selectedByUserId: actorId });
    expect(item.qualitySnapshot).toMatchObject({
      qualityScore: 84, creativeLevel: "bold", olharVerdict: { value: "pronta" }, exportStatus: { value: "bloqueado" },
    });

    await db.update(derivations).set({
      qualityScore: 1, creativeLevel: "conservative",
      olharVerdict: { ...olharVerdict, value: "confusa" }, exportStatus: { ...exportStatus, value: "ok" },
    }).where(eq(derivations.id, own.derivationId));
    const result = await submitHumanEvaluation({
      workspaceId: own.workspaceId, corpusItemId: item.id, reviewerUserId: actorId,
      visualScore: 1, factualPass: false, intent: "approve", primaryFailureReason: "other",
    });
    const [event] = await listOutputDecisionEvents({ workspaceId: own.workspaceId, derivationId: own.derivationId });
    const [signal] = await listCalibrationSignalsForClientProfile(own);
    expect(event.id).toBe(result.decisionEvidence.outputDecisionEventId);
    expect(event.contextSnapshot).toMatchObject({
      qualityScore: 84, creativeLevel: "bold", olharVerdict: { value: "pronta" }, exportStatus: { value: "bloqueado" },
    });
    expect(signal).toMatchObject({
      outputDecisionEventId: event.id, humanVerdict: "entra", systemOlharVerdict: "pronta", systemExportStatus: "bloqueado",
      mismatchBucket: "export_setup_issue",
    });
  });

  it.each(["individual", "batch"])("ignores body verdicts and creative level in %s HTTP selection", async (mode) => {
    const own = await scope();
    const response = await selectHttp(new Request("http://localhost/api/feedback/human-quality-corpus", {
      method: "POST", body: JSON.stringify({
        workspaceId: own.workspaceId, campaignId: own.campaignId,
        ...(mode === "batch" ? { derivationIds: [own.derivationId] } : { derivationId: own.derivationId }),
        qualitySnapshot: {
          qualityScore: 23, creativeLevel: "spoofed",
          olharVerdict: { value: "confusa" }, exportStatus: { value: "ok" },
        },
      }),
    }));
    expect(response.status).toBe(mode === "batch" ? 200 : 201);
    const result = await response.json();
    const item = mode === "batch" ? result.results[0].item : result.item;
    expect(item.qualitySnapshot).toMatchObject({
      qualityScore: 23, creativeLevel: "bold", olharVerdict: { value: "pronta" }, exportStatus: { value: "bloqueado" },
    });
  });

  it("reports missing_dual_verdict for historical evidence without consulting live columns", async () => {
    const own = await scope();
    const item = await insertCorpusItem({
      ...own, generationMode: "art_variation", format: "1:1", cohort: "baseline", corpusVersion: 1,
      artifactRef: { derivationId: own.derivationId }, qualitySnapshot: {}, selectedByUserId: actorId,
    });
    await submitHumanEvaluation({
      workspaceId: own.workspaceId, corpusItemId: item.id, reviewerUserId: actorId,
      visualScore: 90, factualPass: true, intent: "approve", primaryFailureReason: "other",
    });
    const [event] = await listOutputDecisionEvents({ workspaceId: own.workspaceId });
    const [signal] = await listCalibrationSignalsForClientProfile(own);
    expect(event.contextSnapshot).toMatchObject({ olharVerdict: null, exportStatus: null, creativeLevel: null, qualityScore: null });
    expect(signal).toMatchObject({ humanVerdict: "entra", systemOlharVerdict: null, systemExportStatus: null, mismatchBucket: null });
    const response = await evidenceHttp(new Request("http://localhost/api/admin/quality/brands/evidence"), {
      params: Promise.resolve({ clientProfileId: own.clientProfileId }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).report).toMatchObject({ decisionCount: 1, comparableCount: 0, agreementRate: null, missingDualVerdictCount: 1 });
  });

  it("keeps the automatic failure, human reason and notes distinct in the event", async () => {
    const own = await scope({ hardFailures: [{ code: "cta_drift", message: "CTA incorreto" }] });
    const item = await selectDerivationForCorpus({ ...own, selectedByUserId: actorId });
    await submitHumanEvaluation({
      workspaceId: own.workspaceId, corpusItemId: item.id, reviewerUserId: actorId,
      visualScore: 35, factualPass: false, intent: "regenerate", primaryFailureReason: "weak_hierarchy",
      otherReasonText: "A chamada ocupa espaço demais", notes: "Manter a fotografia",
    });
    const [event] = await listOutputDecisionEvents({ workspaceId: own.workspaceId });
    expect(event.contextSnapshot).toMatchObject({
      reason: { code: "weak_hierarchy", text: "A chamada ocupa espaço demais", source: "human_quality_evaluation" },
      automaticReason: { code: "cta_drift", text: "CTA incorreto", source: "hard_failures" },
      otherReasonText: "A chamada ocupa espaço demais", notes: "Manter a fotografia",
    });
  });

  it("filters secrets and reports bounded evidence without retaining discarded text", async () => {
    const secret = "DATABASE_URL=postgres://discarded-secret";
    const own = await scope({
      creativeLevel: "x".repeat(150), hardFailures: [{ code: "cta_drift", message: secret }],
    });
    const item = await selectDerivationForCorpus({ ...own, selectedByUserId: actorId });
    expect(item.qualitySnapshot).toMatchObject({ creativeLevel: "x".repeat(120), evidenceSanitized: true });
    expect(JSON.stringify(item.qualitySnapshot)).not.toContain("discarded-secret");
    const result = await submitHumanEvaluation({
      workspaceId: own.workspaceId, corpusItemId: item.id, reviewerUserId: actorId,
      visualScore: 35, factualPass: false, intent: "regenerate", primaryFailureReason: "other",
      otherReasonText: "Preservar o convite", notes: secret,
    });
    expect(result.evaluation.notes).toBeNull();
    const [event] = await listOutputDecisionEvents({ workspaceId: own.workspaceId });
    expect(event.contextSnapshot).toMatchObject({ otherReasonText: "Preservar o convite", notes: null, evidenceSanitized: true });
    expect(JSON.stringify(result) + JSON.stringify(event)).not.toContain("discarded-secret");
  });

  it.each([
    {
      label: "secret feedback with a hard failure",
      feedback: "DATABASE_URL=postgres://discarded-secret",
      automatic: { hardFailures: [{ code: "cta_drift", message: "CTA incorreto" }] },
      userFeedback: null,
      reason: { code: "cta_drift", text: "CTA incorreto", source: "hard_failures" },
    },
    {
      label: "overlong feedback with an automatic suggestion",
      feedback: "x".repeat(700),
      automatic: { regenerationSuggestion: "Diminuir a densidade visual" },
      userFeedback: "x".repeat(500),
      reason: { text: "Quality issues detected", source: "correction_brief" },
    },
  ])("persists sanitized regeneration evidence: $label", async ({ feedback, automatic, userFeedback, reason }) => {
    const own = await scope(automatic);
    vi.mocked(spend).mockClear();
    vi.mocked(inngest.send).mockClear();
    const result = await regenerateDerivation({
      workspaceId: own.workspaceId, derivationId: own.derivationId,
      userId: actorId, actorUserId: actorId, evidenceSource: "synthetic_fixture",
      billingIdempotencyKey: `regen:${own.derivationId}:sanitization`, feedback,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(vi.mocked(spend)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(inngest.send)).toHaveBeenCalledTimes(1);

    const event = await vi.waitFor(async () => {
      const events = await listOutputDecisionEvents({ workspaceId: own.workspaceId, derivationId: own.derivationId });
      expect(events).toHaveLength(1);
      return events[0];
    }, { timeout: 5000 });
    expect(event).toMatchObject({
      userId: actorId, clientProfileId: own.clientProfileId, action: "regenerated", source: "synthetic_fixture",
      contextSnapshot: {
        childDerivationId: result.value.derivation.id,
        userFeedback, reason, evidenceSanitized: true,
      },
    });
    expect(JSON.stringify(event)).not.toContain("discarded-secret");
  });

  it.each(["existing", "fresh"])("replays the %s projection concurrently with one event and signal; HTTP still refuses duplicates", async (mode) => {
    const own = await scope();
    const item = await selectDerivationForCorpus({ ...own, selectedByUserId: actorId });
    const evaluationInput = {
      workspaceId: own.workspaceId, corpusItemId: item.id, reviewerUserId: actorId,
      visualScore: 70, factualPass: true, intent: "approve" as const, primaryFailureReason: "other" as const,
    };
    const result = mode === "fresh" ? await submitCorpusEvaluation(evaluationInput) : await submitHumanEvaluation(evaluationInput);
    const replays = await Promise.all(Array.from({ length: 4 }, () => recordHumanDecisionCalibrationEvidence({
      item: result.item, evaluation: result.evaluation, reviewerUserId: actorId, sourceLabel: "operator_imported",
    })));
    const events = await listOutputDecisionEvents({ workspaceId: own.workspaceId });
    const signals = await listCalibrationSignalsForClientProfile(own);
    expect(events).toHaveLength(1);
    expect(signals).toHaveLength(1);
    for (const replay of replays) {
      expect(replay.outputDecisionEventId).toBe(events[0].id);
      expect(replay.calibrationSignal.signalId).toBe(signals[0].id);
    }
    const response = await evaluationHttp(new Request("http://localhost/api/feedback/human-quality-corpus/evaluation", {
      method: "POST", body: JSON.stringify(evaluationInput),
    }), { params: Promise.resolve({ id: item.id }) });
    expect(response.status).toBe(409);
    expect(await listOutputDecisionEvents({ workspaceId: own.workspaceId })).toHaveLength(1);
  });

  it("rejects a foreign brand in ingress, capture and canonical decision commands", async () => {
    const own = await scope();
    const other = await scope();
    await expect(recordOutputDecisionEvidence({
      ...own, clientProfileId: other.clientProfileId, userId: actorId, action: "approved", source: "test",
    })).rejects.toMatchObject({ code: "invalid_campaign" });
    await db.update(campaigns).set({ clientProfileId: other.clientProfileId }).where(eq(campaigns.id, own.campaignId));
    await expect(selectDerivationForCorpus({ ...own, selectedByUserId: actorId })).rejects.toMatchObject({ code: "missing_client_profile" });
    await expect(captureCorpusCandidateFromDerivation(own)).rejects.toMatchObject({ code: "missing_client_profile" });
    expect(await listOutputDecisionEvents({ workspaceId: own.workspaceId })).toHaveLength(0);
  });

  it.each([
    { mode: "manual", historical: false }, { mode: "backfill", historical: false },
    { mode: "manual", historical: true }, { mode: "backfill", historical: true },
  ])("promotes only the candidate snapshot: %j", async ({ mode, historical }) => {
    const own = await scope();
    vi.stubEnv("HUMAN_QUALITY_SYNTHETIC_WORKSPACE_IDS", own.workspaceId);
    try {
      const candidate = historical
        ? await insertCorpusCandidate({
            ...own, generationMode: "art_variation", format: "1:1", corpusVersion: 1, sourceLabel: "synthetic_fixture",
            artifactRef: { derivationId: own.derivationId }, qualitySnapshot: { qualityScore: 63 },
          })
        : (await captureCorpusCandidateFromDerivation(own))!;
      await db.update(derivations).set({
        qualityScore: 1, creativeLevel: "conservative",
        olharVerdict: { ...olharVerdict, value: "confusa" }, exportStatus: { ...exportStatus, value: "ok" },
      }).where(eq(derivations.id, own.derivationId));
      expect((await captureCorpusCandidateFromDerivation(own))!.qualitySnapshot).toEqual(candidate.qualitySnapshot);
      if (mode === "backfill") expect(await runCorpusBackfillBatch({ workspaceId: own.workspaceId })).toMatchObject({ promoted: 1 });
      const promoted = await promoteCorpusCandidateToQueue({ candidateId: candidate.id, cohort: "baseline", selectedByUserId: actorId });
      expect(promoted.item.qualitySnapshot).toEqual(candidate.qualitySnapshot);
      await submitHumanEvaluation({
        workspaceId: own.workspaceId, corpusItemId: promoted.item.id, reviewerUserId: actorId,
        visualScore: 80, factualPass: true, intent: "approve", primaryFailureReason: "other",
      });
      const [event] = await listOutputDecisionEvents({ workspaceId: own.workspaceId });
      const [signal] = await listCalibrationSignalsForClientProfile(own);
      expect(event.contextSnapshot).toMatchObject({
        qualityScore: historical ? 63 : 84, creativeLevel: historical ? null : "bold",
        olharVerdict: historical ? null : { value: "pronta" }, exportStatus: historical ? null : { value: "bloqueado" },
      });
      expect(signal).toMatchObject({
        systemOlharVerdict: historical ? null : "pronta", systemExportStatus: historical ? null : "bloqueado", sourceLabel: "synthetic_fixture",
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects projection with another evaluation scope or reviewer without reattributing authorship", async () => {
    const own = await scope();
    const item = await selectDerivationForCorpus({ ...own, selectedByUserId: actorId });
    const { evaluation } = await submitCorpusEvaluation({
      workspaceId: own.workspaceId, corpusItemId: item.id, reviewerUserId: actorId,
      visualScore: 70, factualPass: true, intent: "approve", primaryFailureReason: "other",
    });
    for (const changed of [
      { workspaceId: crypto.randomUUID() }, { corpusItemId: crypto.randomUUID() }, { reviewerUserId: "migrator" },
    ]) {
      await expect(recordHumanDecisionCalibrationEvidence({
        item, evaluation: { ...evaluation, ...changed }, reviewerUserId: actorId, sourceLabel: "operator_imported",
      })).rejects.toMatchObject({ code: "invalid_evaluation" });
    }
    expect(await listOutputDecisionEvents({ workspaceId: own.workspaceId })).toHaveLength(0);
  });

  it.each([
    { olhar: "pronta", export: "ok", intent: "approve", human: "entra", bucket: null, rate: 1 },
    { olhar: "confusa", export: "ok", intent: "approve", human: "entra", bucket: "system_too_permissive", rate: 0 },
    { olhar: "pronta", export: "ok", intent: "reject", human: "nao_entra", bucket: "system_too_harsh", rate: 0 },
    { olhar: "quase", export: "ajuste_menor", intent: "regenerate", human: "quase", bucket: null, rate: 1 },
    { olhar: "sem_opiniao", export: "ok", intent: "reject", human: "nao_entra", bucket: null, rate: 1 },
    { olhar: null, export: "ok", intent: "approve", human: "entra", bucket: null, rate: null },
  ] as const)("compares the frozen pair with the existing classifier: %j", async (sample) => {
    const own = await scope({
      olharVerdict: sample.olhar ? { ...olharVerdict, value: sample.olhar } : null,
      exportStatus: { ...exportStatus, value: sample.export },
    });
    const item = await selectDerivationForCorpus({ ...own, selectedByUserId: actorId });
    await submitHumanEvaluation({
      workspaceId: own.workspaceId, corpusItemId: item.id, reviewerUserId: actorId,
      visualScore: 1, factualPass: true, intent: sample.intent, primaryFailureReason: "weak_hierarchy",
      notes: "Preferência simulada",
    });
    const [signal] = await listCalibrationSignalsForClientProfile(own);
    expect(signal).toMatchObject({
      systemOlharVerdict: sample.olhar, systemExportStatus: sample.export, humanVerdict: sample.human, mismatchBucket: sample.bucket,
    });
    const response = await evidenceHttp(new Request("http://localhost/api/admin/quality/brands/evidence"), {
      params: Promise.resolve({ clientProfileId: own.clientProfileId }),
    });
    expect((await response.json()).report).toMatchObject({
      comparableCount: sample.olhar === null ? 0 : 1, missingDualVerdictCount: sample.olhar === null ? 1 : 0, agreementRate: sample.rate,
    });
  });

  it("rejects incompatible Peça/workspace references through HTTP and commands", async () => {
    const own = await scope();
    const other = await scope();
    const response = await selectHttp(new Request("http://localhost/api/feedback/human-quality-corpus", {
      method: "POST", body: JSON.stringify({ workspaceId: own.workspaceId, campaignId: own.campaignId, derivationId: other.derivationId }),
    }));
    expect(response.status).toBe(400);
    await expect(selectDerivationForCorpus({
      ...own, campaignId: other.campaignId, selectedByUserId: actorId,
    })).rejects.toMatchObject({ code: "invalid_derivation_campaign" });
    const item = await selectDerivationForCorpus({ ...own, selectedByUserId: actorId });
    const evaluationResponse = await evaluationHttp(new Request("http://localhost/api/feedback/human-quality-corpus/evaluation", {
      method: "POST", body: JSON.stringify({
        workspaceId: other.workspaceId, visualScore: 80, factualPass: true, intent: "approve", primaryFailureReason: "other",
      }),
    }), { params: Promise.resolve({ id: item.id }) });
    expect(evaluationResponse.status).toBe(404);
    expect(await listOutputDecisionEvents({ workspaceId: own.workspaceId })).toHaveLength(0);
  });
});
