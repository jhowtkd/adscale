import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { brandTrainingSessions, brandKnowledgeVersions, calibrationRules, clientProfiles, creativeWorkItems, creativeWorkOutputs, creativeWorkPreparationAttempts, guidanceSelections, user, workspaces } from "../db/schema";
import { hashGuidanceContent } from "../brand-taste/learned-guidance";
import { loadLocalLearningPromptCalibrationContext } from "../brand-taste/prompt-calibration-loader";
import { freezeSinglePieceOutputGuidance, freezeSinglePiecePreparationGuidance } from "../repositories/single-piece-guidance";
import { appendCalibrationRound, createTrainingSession, mutateTrainingSession, type CalibrationWorkDraft } from "../repositories/brand-training-sessions";
import { publishBrandKnowledgeVersion } from "../repositories/brand-knowledge";
import { resolveSinglePieceGuidance } from "../brand-taste/single-piece-guidance";
import { compileBrandKnowledgeVersionV2 } from "../brand-knowledge/version-compiler";
import { getCreativeWorkPromptVersion } from "../shared-skills";
import { freezeCandidate } from "./calibration";
import { captureCalibrationGuidance } from "./visual-guidance";

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) {
    throw new Error("Visual proof requires matching local test database URLs ending in _test");
  }
}
const workspaceId = randomUUID(), clientProfileId = randomUUID(), userId = randomUUID();
afterEach(async () => {
  if (!testUrl) return;
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(user).where(eq(user.id, userId));
});

describe.skipIf(!testUrl)("Exact learned visual calibration (Postgres)", () => {
  it("preserves historical hashes and knowledge without promoting old proof to learned visual proof", async () => {
    await db.insert(user).values({ id: userId, name: "Operador", email: `${userId}@example.test` });
    await db.insert(workspaces).values({ id: workspaceId, name: "Histórico", slug: workspaceId });
    await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Histórico" });
    const text = "Use hierarquia clara.";
    await db.insert(calibrationRules).values({ workspaceId, clientProfileId, category: "hierarchy", status: "approved", rationale: text,
      confirmedMetadata: { category: "hierarchy", nature: "visual", roles: ["image_prompt"], generationModes: ["single"], formats: ["4:5"], contentHash: hashGuidanceContent(text) },
      metadataConfirmedBy: userId, metadataConfirmedAt: new Date(),
    });
    const candidate = freezeCandidate({ knowledge: { schemaVersion: 1, profileId: clientProfileId, compiledAt: "2026-09-13T12:00:00.000Z", claims: [], excluded: [] },
      identity: { clientProfileId, confirmedAt: "2026-09-13T12:00:00.000Z", assets: [], brandKit: { colors: [], fonts: [], toneOfVoice: null, prohibitedElements: null, requiredElements: null } }, evidenceHashes: {},
    });
    const compiled = compileBrandKnowledgeVersionV2({ candidate, calibration: { sessionId: randomUUID(), round: 1 } });
    await db.insert(brandKnowledgeVersions).values({ workspaceId, clientProfileId, versionNumber: 1, hash: compiled.hash, snapshot: compiled.snapshot, status: "active", publishedByUserId: userId });
    const scope = { workspaceId, clientProfileId, generationMode: "single", format: "4:5" };
    const loaded = await loadLocalLearningPromptCalibrationContext({ ...scope, role: "image_prompt", language: "pt-BR", fixedPromptVersion: getCreativeWorkPromptVersion("image_prompt") });
    expect(loaded).toMatchObject({ lines: [], omissions: [{ reason: "visual_proof_missing" }] });
    expect((await resolveSinglePieceGuidance({ ...scope, calibrationCandidate: candidate })).roles.image_prompt.lines).toEqual([]);
    const [stored] = await db.select().from(brandKnowledgeVersions).where(eq(brandKnowledgeVersions.workspaceId, workspaceId));
    expect(stored.snapshot).toEqual(compiled.snapshot);
    expect(stored.hash).toBe(candidate.hash);
  });

  it("keeps a historical 4:5 learned proof valid only for single 4:5", async () => {
    await db.insert(user).values({ id: userId, name: "Operador", email: `${userId}@example.test` });
    await db.insert(workspaces).values({ id: workspaceId, name: "Prova 4:5", slug: workspaceId });
    await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Prova 4:5" });
    const text = "Use uma hierarquia visual clara.";
    const [rule] = await db.insert(calibrationRules).values({ workspaceId, clientProfileId, category: "hierarchy", status: "approved", rationale: text,
      confirmedMetadata: { category: "hierarchy", nature: "visual", roles: ["image_prompt"], generationModes: ["single", "carousel"], formats: ["4:5", "9:16", "1:1"], contentHash: hashGuidanceContent(text) },
      metadataConfirmedBy: userId, metadataConfirmedAt: new Date(),
    }).returning();
    const captured = await captureCalibrationGuidance({ workspaceId, clientProfileId });
    const visualGuidance = { ...captured, sets: captured.sets.filter(set => set.generationMode === "single" && set.format === "4:5") };
    const candidate = freezeCandidate({ schemaVersion: 2, visualGuidance,
      knowledge: { schemaVersion: 1, profileId: clientProfileId, compiledAt: "2026-10-15T12:00:00.000Z", claims: [], excluded: [] },
      identity: { clientProfileId, confirmedAt: "2026-10-15T12:00:00.000Z", assets: [], brandKit: { colors: [], fonts: [], toneOfVoice: null, prohibitedElements: null, requiredElements: null } }, evidenceHashes: {},
    });
    const compiled = compileBrandKnowledgeVersionV2({ candidate, calibration: { sessionId: randomUUID(), round: 1 } });
    await db.insert(brandKnowledgeVersions).values({ workspaceId, clientProfileId, versionNumber: 1, hash: compiled.hash, snapshot: compiled.snapshot, status: "active", publishedByUserId: userId });
    const scope = { workspaceId, clientProfileId, generationMode: "single", format: "4:5", role: "image_prompt" as const,
      language: "pt-BR" as const, fixedPromptVersion: getCreativeWorkPromptVersion("image_prompt") };
    expect((await loadLocalLearningPromptCalibrationContext(scope)).appliedRefs.map(ref => ref.ruleId)).toEqual([rule.id]);
    for (const patch of [{ format: "9:16" }, { generationMode: "carousel", language: "en" as const }, { generationMode: "carousel", format: "1:1", language: "en" as const }]) {
      expect((await loadLocalLearningPromptCalibrationContext({ ...scope, ...patch })).lines).toEqual([]);
    }
  });

  it("captures 9:16 and both carousel formats only when visual guidance needs them", async () => {
    await db.insert(user).values({ id: userId, name: "Operador", email: `${userId}@example.test` });
    await db.insert(workspaces).values({ id: workspaceId, name: "Escopos", slug: workspaceId });
    await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Escopos" });
    expect((await captureCalibrationGuidance({ workspaceId, clientProfileId })).sets).toHaveLength(3);
    const text = "Preserve respiro ao redor do foco.";
    await db.insert(calibrationRules).values({ workspaceId, clientProfileId, category: "hierarchy", status: "approved", rationale: text,
      confirmedMetadata: { category: "hierarchy", nature: "visual", roles: ["art_direction", "image_prompt"], generationModes: ["single", "carousel"], formats: ["4:5", "9:16", "1:1"], contentHash: hashGuidanceContent(text) },
      metadataConfirmedBy: userId, metadataConfirmedAt: new Date(),
    });
    const captured = await captureCalibrationGuidance({ workspaceId, clientProfileId });
    expect(captured.sets.map(set => [set.generationMode, set.format, set.role, set.language])).toEqual([
      ["single", "4:5", "copy", "pt-BR"], ["single", "4:5", "art_direction", "pt-BR"], ["single", "4:5", "image_prompt", "pt-BR"],
      ["single", "9:16", "copy", "pt-BR"], ["single", "9:16", "art_direction", "pt-BR"], ["single", "9:16", "image_prompt", "pt-BR"],
      ["carousel", "4:5", "image_prompt", "en"], ["carousel", "1:1", "image_prompt", "en"],
    ]);
    for (const set of captured.sets.filter(set => set.generationMode === "carousel")) {
      expect(set.fixedPromptVersion).toBe(getCreativeWorkPromptVersion("image_prompt"));
    }
  });

  it("freezes pending guidance in examples, activates its proof and preserves the validated set while newer revisions await proof", async () => {
    await db.insert(user).values({ id: userId, name: "Operador", email: `${userId}@example.test` });
    await db.insert(workspaces).values({ id: workspaceId, name: "Visual", slug: workspaceId });
    await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Visual" });
    const insertRule = async (text: string) => (await db.insert(calibrationRules).values({
      workspaceId, clientProfileId, category: "hierarchy", status: "approved", rationale: text,
      confirmedMetadata: { category: "hierarchy", nature: "visual", roles: ["art_direction", "image_prompt"], generationModes: ["single"], formats: ["4:5", "9:16"], contentHash: hashGuidanceContent(text) },
      metadataConfirmedBy: userId, metadataConfirmedAt: new Date(),
    }).returning())[0];
    const rule = await insertRule("Prefira uma hierarquia visual simples.");
    const input = { workspaceId, clientProfileId, role: "image_prompt" as const, generationMode: "single", format: "4:5", language: "pt-BR" as const, fixedPromptVersion: getCreativeWorkPromptVersion("image_prompt") };
    expect((await loadLocalLearningPromptCalibrationContext(input)).lines).toEqual([]);
    const visualGuidance = await captureCalibrationGuidance({ workspaceId, clientProfileId });
    const candidate = freezeCandidate({ schemaVersion: 2, visualGuidance,
      knowledge: { schemaVersion: 1, profileId: clientProfileId, compiledAt: "2026-10-15T12:00:00.000Z", claims: [], excluded: [] },
      identity: { clientProfileId, confirmedAt: "2026-10-15T12:00:00.000Z", assets: [], brandKit: { colors: [], fonts: [], toneOfVoice: null, prohibitedElements: null, requiredElements: null } }, evidenceHashes: {},
    });
    let session = await createTrainingSession({ workspaceId, profileId: clientProfileId, userId, candidate, baseVersionId: null });
    const works = [0, 1, 2, 3].map(index => ({ id: randomUUID(), draftKey: `${session.id}-${index}`, title: "Calibração", request: "Texto de teste" })) as [CalibrationWorkDraft, CalibrationWorkDraft, CalibrationWorkDraft, CalibrationWorkDraft];
    const appended = await appendCalibrationRound({ workspaceId, profileId: clientProfileId, sessionId: session.id,
      expectedRevision: session.revision, roundNumber: 1, candidate, quoteCredits: 8, coverage: [], confirmedBy: userId, works,
    });
    session = appended.session;
    const later = await insertRule("Use margens generosas.");
    for (const [index, workItemId] of appended.workItemIds.entries()) {
      const [work] = await db.select().from(creativeWorkItems).where(eq(creativeWorkItems.id, workItemId));
      const [attempt] = await db.insert(creativeWorkPreparationAttempts).values({ workspaceId, workItemId, kind: "creative_prepare", inputRevision: work.updatedAt.toISOString(), inputFingerprint: randomUUID(), leaseExpiresAt: new Date() }).returning();
      const prepared = await freezeSinglePiecePreparationGuidance({ workspaceId, workItemId, attemptId: attempt.id, format: work.format });
      expect(prepared!.roles.art_direction.appliedRefs.map(ref => ref.ruleId)).toEqual([rule.id]);
      const [output] = await db.insert(creativeWorkOutputs).values({ workspaceId, workItemId, creativeLevel: "balanced", targetFormat: work.format, operationKey: `${session.id}-${index}`, status: "completed", outputKey: "visual.png", quality: { objectiveVerdict: "pass" } }).returning();
      const frozen = await freezeSinglePieceOutputGuidance({ workspaceId, workItemId, outputId: output.id });
      expect(frozen!.roles.image_prompt.appliedRefs.map(ref => ref.ruleId)).toEqual([rule.id]);
      session = await mutateTrainingSession({ workspaceId, profileId: clientProfileId, sessionId: session.id, expectedRevision: session.revision,
        command: { type: "feedback", round: 1, slot: index, rating: "good", note: "", dimensions: [], actorId: userId } });
    }
    const [example] = await db.select().from(creativeWorkOutputs).where(eq(creativeWorkOutputs.workItemId, appended.workItemIds[0]));
    await db.update(creativeWorkOutputs).set({ frozenGuidance: null }).where(eq(creativeWorkOutputs.id, example.id));
    await expect(publishBrandKnowledgeVersion({ workspaceId, clientProfileId, userId, sessionId: session.id, expectedRevision: session.revision, candidateHash: candidate.hash }))
      .rejects.toMatchObject({ code: "calibration_stale" });
    await db.update(creativeWorkOutputs).set({ frozenGuidance: example.frozenGuidance }).where(eq(creativeWorkOutputs.id, example.id));
    const [published, replay] = await Promise.all([0, 1].map(() => publishBrandKnowledgeVersion({ workspaceId, clientProfileId, userId, sessionId: session.id, expectedRevision: session.revision, candidateHash: candidate.hash })));
    expect(replay.id).toBe(published.id);
    expect(published.snapshot).toMatchObject({ schemaVersion: 3, visualGuidance });
    expect((await loadLocalLearningPromptCalibrationContext(input)).appliedRefs.map(ref => ref.ruleId)).toEqual([rule.id]);
    await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, later.id));
    const applied = await loadLocalLearningPromptCalibrationContext(input);
    expect(applied.appliedRefs.map(ref => ref.ruleId)).toEqual([rule.id]);
    for (const patch of [{ format: "1:1" }, { generationMode: "carousel" }, { fixedPromptVersion: "other/v1" }, { language: "en" as const }, { workspaceId: randomUUID() }, { clientProfileId: randomUUID() }]) {
      expect((await loadLocalLearningPromptCalibrationContext({ ...input, ...patch })).lines).toEqual([]);
    }
    const changedText = "Destaque apenas um elemento visual.";
    await db.update(calibrationRules).set({ rationale: changedText,
      confirmedMetadata: { category: "hierarchy", nature: "visual", roles: ["art_direction", "image_prompt"], generationModes: ["single"], formats: ["4:5", "9:16"], contentHash: hashGuidanceContent(changedText) },
      metadataConfirmedBy: userId, metadataConfirmedAt: new Date(),
    }).where(eq(calibrationRules.id, rule.id));
    expect((await loadLocalLearningPromptCalibrationContext(input)).appliedRefs).toEqual(applied.appliedRefs);
    // A pin that keeps another, unproved visual rule but drops the validated one never brings the validated revision back.
    const other = await insertRule("Agrupe os elementos por proximidade.");
    const [followed] = await db.select().from(guidanceSelections).where(eq(guidanceSelections.clientProfileId, clientProfileId));
    const otherRef = followed.refs.find(ref => ref.ruleId === other.id)!;
    expect(otherRef).toBeDefined();
    await db.update(guidanceSelections).set({ refs: [otherRef], version: sql`${guidanceSelections.version} + 1`, pinnedBy: userId, pinnedAt: new Date() })
      .where(eq(guidanceSelections.clientProfileId, clientProfileId));
    const pinned = await loadLocalLearningPromptCalibrationContext(input);
    expect(pinned).toMatchObject({ lines: [], appliedRefs: [], setHash: null });
    expect(pinned.omissions).toContainEqual({ ruleId: other.id, reason: "visual_proof_missing" });
    const [stored] = await db.select().from(brandTrainingSessions).where(eq(brandTrainingSessions.id, session.id));
    expect(stored.candidate).toEqual(candidate);
  });
});
