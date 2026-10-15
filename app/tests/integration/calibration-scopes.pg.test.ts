import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ image: vi.fn(), spend: vi.fn(async () => ({ ok: true, creditsSpent: 2 })), send: vi.fn(async () => ({ ids: [] })) }));
vi.mock("@/server/billing/paywall", async original => ({ ...(await original<typeof import("@/server/billing/paywall")>()), spend: provider.spend }));
vi.mock("@/server/generation/pipeline/execute", () => ({ executeCanonicalGeneration: provider.image }));
vi.mock("@/server/generation/pipeline/post-generation", () => ({ runCreativeWorkQualityAssessment: async () => ({
  objectiveVerdict: "pass", quality: { objectiveVerdict: "pass", objectiveCodes: [], objectivePassed: true },
}) }));
vi.mock("@/server/storage", () => ({ objectStorage: { put: vi.fn() } }));
vi.mock("@/server/creative-work/text-composite", () => ({
  runCarouselTextComposition: async (input: { base: Buffer }) => ({ buffer: input.base }), TextCompositionError: class extends Error {},
}));
vi.mock("@/server/jobs/client", () => ({ inngest: { createFunction: (_config: unknown, fn: unknown) => ({ fn }), send: provider.send } }));
vi.mock("@/server/beta-analytics/record", () => ({ recordBetaAnalyticsEvent: vi.fn() }));
vi.mock("@/server/ai/providers/e2e-controlled-provider", () => ({ isE2EControlledProviderEnabled: () => false }));

import { db } from "@/server/db";
import { brandTrainingSessions, calibrationRules, clientProfiles, creativeWorkItems, creativeWorkOutputs, creativeWorkPreparationAttempts, user, workspaces } from "@/server/db/schema";
import { appendCalibrationRound, createTrainingSession, linkCalibrationRoundOutputs, mutateTrainingSession, type CalibrationWorkDraft } from "@/server/repositories/brand-training-sessions";
import { freezeCandidate } from "@/server/brand-training/calibration";
import { captureCalibrationGuidance } from "@/server/brand-training/visual-guidance";
import { hashGuidanceContent } from "@/server/brand-taste/learned-guidance";
import { loadLocalLearningPromptCalibrationContext } from "@/server/brand-taste/prompt-calibration-loader";
import { generateCalibrationCarouselExample, prepareCalibrationCarouselExample } from "@/server/application/calibrate-carousel-example";
import { materializeCarouselSlides, queueAuthorizedCarouselSlide } from "@/server/repositories/creative-work-carousel";
import { getCarouselGuidanceCycle } from "@/server/repositories/carousel-guidance-cycle";
import { freezeSinglePieceOutputGuidance, freezeSinglePiecePreparationGuidance } from "@/server/repositories/single-piece-guidance";
import { publishBrandKnowledgeVersion } from "@/server/repositories/brand-knowledge";
import { getCreativeWorkPromptVersion } from "@/server/shared-skills";
import { runCreativeWorkCarouselSlide } from "@/server/jobs/creative-work-carousel";
import { listComposerGuidanceApplications } from "@/server/repositories/composer-guidance-application";
import { generateCarouselWork } from "@/server/application/generate-carousel-work";
import { prepareCarouselWork } from "@/server/application/prepare-carousel-work";
import type { GenerationRequest } from "@/server/generation/canonical/types";
import type { ExecuteCanonicalGenerationOptions } from "@/server/generation/pipeline/execute";

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) {
    throw new Error("Calibration scope tests require matching local test database URLs ending in _test");
  }
}
const workspaceId = randomUUID(), clientProfileId = randomUUID(), userId = randomUUID();
afterEach(async () => {
  provider.image.mockReset();
  provider.spend.mockClear();
  provider.send.mockClear();
  if (!testUrl) return;
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(user).where(eq(user.id, userId));
});
async function fixture() {
  await db.insert(user).values({ id: userId, name: "Operador", email: `${userId}@example.test` });
  await db.insert(workspaces).values({ id: workspaceId, name: "Escopos", slug: workspaceId });
  await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Escopos" });
  const insertRule = async (text: string) => (await db.insert(calibrationRules).values({ workspaceId, clientProfileId,
    category: "hierarchy", status: "approved", rationale: text,
    confirmedMetadata: { category: "hierarchy", nature: "visual", roles: ["art_direction", "image_prompt"],
      generationModes: ["single", "carousel"], formats: ["4:5", "9:16", "1:1"], contentHash: hashGuidanceContent(text) },
    metadataConfirmedBy: userId, metadataConfirmedAt: new Date(),
  }).returning())[0];
  const rule = await insertRule("Preserve o respiro ao redor do foco.");
  const visualGuidance = await captureCalibrationGuidance({ workspaceId, clientProfileId });
  const candidate = freezeCandidate({ schemaVersion: 2, visualGuidance,
    knowledge: { schemaVersion: 1, profileId: clientProfileId, compiledAt: "2026-10-15T12:00:00.000Z", claims: [], excluded: [] },
    identity: { clientProfileId, confirmedAt: "2026-10-15T12:00:00.000Z", assets: [], brandKit: { colors: [], fonts: [], toneOfVoice: null, prohibitedElements: null, requiredElements: null } }, evidenceHashes: {},
  });
  const session = await createTrainingSession({ workspaceId, profileId: clientProfileId, userId, candidate, baseVersionId: null });
  const append = (number: number, revision: number) => appendCalibrationRound({ workspaceId, profileId: clientProfileId, sessionId: session.id,
    expectedRevision: revision, roundNumber: number, candidate, quoteCredits: 8, coverage: [], confirmedBy: userId,
    works: [0, 1, 2, 3].map(index => ({ id: randomUUID(), draftKey: `${session.id}:${number}:${index}`, title: "Calibração",
      request: "[Texto de teste de calibração] Teste visual da marca. Sem oferta, preço ou promessa." })) as [CalibrationWorkDraft, CalibrationWorkDraft, CalibrationWorkDraft, CalibrationWorkDraft],
  });
  return { session, candidate, rule, append, insertRule };
}

describe.skipIf(!testUrl)("Calibration by visual scope (Postgres, simulated image provider)", () => {
  it("freezes all four scopes, generates real carousel prompts and activates only their matching proof", async () => {
    const { session: initial, candidate, rule, append, insertRule } = await fixture();
    const appended = await append(1, initial.revision);
    let session = appended.session;
    const works = await db.select().from(creativeWorkItems).where(eq(creativeWorkItems.trainingSessionId, session.id));
    expect(appended.workItemIds.map(id => { const work = works.find(work => work.id === id)!; return [work.toolKind, work.format]; }))
      .toEqual([["single", "4:5"], ["single", "9:16"], ["carousel", "4:5"], ["carousel", "1:1"]]);
    const outputIds: Partial<Record<0 | 1 | 2 | 3, string>> = {};
    const pending = { workspaceId, clientProfileId, generationMode: "carousel", format: "4:5", language: "en" as const,
      role: "image_prompt" as const, fixedPromptVersion: getCreativeWorkPromptVersion("image_prompt") };
    expect((await loadLocalLearningPromptCalibrationContext(pending)).lines).toEqual([]);
    // A later approval must not leak into any example of this candidate.
    const later = await insertRule("Orientação nova ainda sem prova.");
    for (const [index, workItemId] of appended.workItemIds.entries()) {
      const scope = { workspaceId, workItemId };
      const work = works.find(work => work.id === workItemId)!;
      if (work.toolKind === "single") {
        const [attempt] = await db.insert(creativeWorkPreparationAttempts).values({ ...scope, kind: "creative_prepare",
          inputRevision: work.updatedAt.toISOString(), inputFingerprint: randomUUID(), leaseExpiresAt: new Date() }).returning();
        await freezeSinglePiecePreparationGuidance({ ...scope, attemptId: attempt.id, format: work.format });
        const [output] = await db.insert(creativeWorkOutputs).values({ ...scope, creativeLevel: "balanced", targetFormat: work.format,
          operationKey: `${session.id}:${index}`, status: "completed", outputKey: "single.png", quality: { objectiveVerdict: "pass" } }).returning();
        const frozen = await freezeSinglePieceOutputGuidance({ ...scope, outputId: output.id });
        expect(frozen!.format).toBe(work.format);
        expect(frozen!.roles.image_prompt.appliedRefs.map(ref => ref.ruleId)).toEqual([rule.id]);
        outputIds[index as 0 | 1] = output.id;
      } else {
        const calibration = { sessionId: session.id, round: 1, slot: index };
        const snapshot = await prepareCalibrationCarouselExample({ ...scope, calibration });
        expect(await prepareCalibrationCarouselExample({ ...scope, calibration })).toEqual(snapshot);
        const [stored] = await db.select().from(creativeWorkItems).where(eq(creativeWorkItems.id, workItemId));
        const cycleId = stored.inputSnapshot!.settings.carouselEditorial!.guidanceCycleId!;
        const cycle = (await getCarouselGuidanceCycle({ ...scope, cycleId }))!;
        expect(cycle.imagePromptVersion).toBe(getCreativeWorkPromptVersion("image_prompt"));
        expect(cycle.selections.image_prompt.lines[0]).toContain("LEARNED BRAND PREFERENCES");
        const slides = await materializeCarouselSlides({ ...scope, deck: snapshot.deck, visualContractHash: snapshot.visualContract.contractHash });
        const cover = slides[0];
        expect((await queueAuthorizedCarouselSlide({ ...scope, slideId: slides[1].id, anchorKey: null, operationKey: slides[1].generationOperationKey })).outcome).toBe("unauthorized");
        expect((await prepareCarouselWork(scope))).toMatchObject({ ok: false, error: { details: { reason: "calibration_managed" } } });
        expect((await generateCarouselWork({ ...scope, userId, preparedRevision: snapshot.preparedRevision }))).toMatchObject({ ok: false });
        expect(await generateCalibrationCarouselExample({ ...scope, calibration, userId })).toMatchObject({ ok: true, value: { id: cover.id } });
        await expect(append(2, session.revision)).rejects.toMatchObject({ code: "round_running" });
        const buffer = await sharp({ create: { width: 1024, height: work.format === "4:5" ? 1280 : 1024, channels: 3, background: "#dddddd" } }).png().toBuffer();
        provider.image.mockImplementation(async (request: GenerationRequest, options: ExecuteCanonicalGenerationOptions) => {
          await options.onProviderRequest?.(request.prompt.text);
          return { outputKey: `simulated/${request.destination.id}.png`, buffer, candidates: [], providerCalls: 1 };
        });
        expect(await runCreativeWorkCarouselSlide({ event: { ...scope, slideId: cover.id } })).toMatchObject({ success: true });
        const request = provider.image.mock.lastCall![0] as GenerationRequest;
        expect(request.prompt.text).toContain("CAROUSEL SLIDE 1/5");
        expect(request.prompt.text).toContain(cycle.selections.image_prompt.lines.join("\n"));
        expect(request.prompt.text).not.toContain(later.rationale);
        expect(await listComposerGuidanceApplications({ ...scope, executionId: cover.id })).toMatchObject([
          { guidanceCycleId: cycleId, fixedPromptVersion: cycle.imagePromptVersion, appliedRefs: cycle.selections.image_prompt.appliedRefs, situation: "applied" },
        ]);
        expect(await runCreativeWorkCarouselSlide({ event: { ...scope, slideId: cover.id } })).toMatchObject({ skipped: true });
        expect(await generateCalibrationCarouselExample({ ...scope, calibration, userId })).toMatchObject({ ok: true, value: { id: cover.id } });
        outputIds[index as 2 | 3] = cover.id;
      }
      session = await mutateTrainingSession({ workspaceId, profileId: clientProfileId, sessionId: session.id, expectedRevision: session.revision,
        command: { type: "feedback", round: 1, slot: index, rating: "good", note: "", dimensions: [], actorId: userId } });
    }
    expect(provider.image).toHaveBeenCalledTimes(2);
    expect(provider.spend).toHaveBeenCalledTimes(2);
    expect(provider.send).toHaveBeenCalledTimes(2);
    session = await linkCalibrationRoundOutputs({ workspaceId, profileId: clientProfileId, sessionId: session.id, expectedRevision: session.revision, round: 1, outputIds });
    const publish = () => publishBrandKnowledgeVersion({ workspaceId, clientProfileId, userId, sessionId: session.id, expectedRevision: session.revision, candidateHash: candidate.hash });
    const [vertical] = await db.select().from(creativeWorkOutputs).where(and(eq(creativeWorkOutputs.workItemId, appended.workItemIds[1]), eq(creativeWorkOutputs.targetFormat, "9:16")));
    await db.update(creativeWorkOutputs).set({ frozenGuidance: { ...vertical.frozenGuidance!, format: "4:5" } }).where(eq(creativeWorkOutputs.id, vertical.id));
    await expect(publish()).rejects.toMatchObject({ code: "calibration_stale" });
    await db.update(creativeWorkOutputs).set({ frozenGuidance: vertical.frozenGuidance }).where(eq(creativeWorkOutputs.id, vertical.id));
    const [carouselAttempt] = await db.select().from(creativeWorkPreparationAttempts).where(eq(creativeWorkPreparationAttempts.workItemId, appended.workItemIds[2]));
    await db.update(creativeWorkPreparationAttempts).set({ frozenCarouselGuidance: { ...carouselAttempt.frozenCarouselGuidance!, imagePromptVersion: "changed/v1" } }).where(eq(creativeWorkPreparationAttempts.id, carouselAttempt.id));
    await expect(publish()).rejects.toMatchObject({ code: "calibration_stale" });
    await db.update(creativeWorkPreparationAttempts).set({ frozenCarouselGuidance: carouselAttempt.frozenCarouselGuidance }).where(eq(creativeWorkPreparationAttempts.id, carouselAttempt.id));
    const published = await publish();
    expect(published.snapshot).toMatchObject({ schemaVersion: 3, visualGuidance: candidate.visualGuidance });
    // A newer unproved selection keeps the last validated visual selection for EACH scope.
    for (const patch of [{}, { format: "1:1" }, { generationMode: "single", language: "pt-BR" as const }, { generationMode: "single", format: "9:16", language: "pt-BR" as const }]) {
      const loaded = await loadLocalLearningPromptCalibrationContext({ ...pending, ...patch });
      expect(loaded.appliedRefs.map(ref => ref.ruleId)).toEqual([rule.id]);
      expect(loaded.omissions).toContainEqual({ ruleId: later.id, reason: "visual_proof_missing" });
    }
    for (const patch of [{ language: "pt-BR" as const }, { format: "9:16" }, { fixedPromptVersion: "changed/v1" }, { generationMode: "creative_revision" }]) {
      expect((await loadLocalLearningPromptCalibrationContext({ ...pending, ...patch })).lines).toEqual([]);
    }
    await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, rule.id));
    expect((await loadLocalLearningPromptCalibrationContext(pending)).lines).toEqual([]);
  });

  it("shares the three-round ceiling across scopes and serializes concurrent attempts at the last round", async () => {
    const { session, append } = await fixture();
    const first = await append(1, session.revision);
    const second = await append(2, first.session.revision);
    const results = await Promise.allSettled([append(3, second.session.revision), append(3, second.session.revision)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "stale_session" } });
    const [stored] = await db.select().from(brandTrainingSessions).where(eq(brandTrainingSessions.id, session.id));
    await expect(append(4, stored.revision)).rejects.toMatchObject({ code: "round_limit" });
    expect(stored.extensionCount).toBe(0);
    expect(await db.select().from(creativeWorkItems).where(eq(creativeWorkItems.trainingSessionId, session.id))).toHaveLength(12);
  });
});
