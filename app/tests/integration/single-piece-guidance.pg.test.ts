import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

const providers = vi.hoisted(() => ({ copy: vi.fn(), image: vi.fn(), direction: vi.fn() }));
vi.mock("@/server/creative-work/copy", async original => ({
  ...await original<typeof import("@/server/creative-work/copy")>(), generateSocialPostCopy: providers.copy,
}));
vi.mock("@/server/creative-work/art-direction", () => ({ createSinglePieceArtDirection: providers.direction }));
vi.mock("@/server/ai/image-generation", () => ({ isRetryableProviderError: () => false }));
vi.mock("@/server/generation/pipeline/execute", () => ({ executeCanonicalGeneration: providers.image }));
vi.mock("@/server/generation/pipeline/post-generation", () => ({
  runCreativeWorkQualityAssessment: async () => ({ objectiveVerdict: "pass", quality: {
    schemaVersion: 1, objectiveVerdict: "pass", objectiveCodes: [], attempt: 1, checks: { file: { ok: true } },
  } }),
}));
vi.mock("@/server/storage", () => ({ objectStorage: { get: async () => Buffer.from("controlled-image"), delete: vi.fn() } }));
vi.mock("@/server/application/ensure-creative-work-output-library", () => ({ ensureCreativeWorkOutputInLibrary: vi.fn() }));
vi.mock("@/server/beta-analytics/record", () => ({ recordBetaAnalyticsEvent: vi.fn() }));
vi.mock("@/server/jobs/client", () => ({ inngest: { createFunction: (_config: unknown, fn: unknown) => ({ fn }) } }));

import { db } from "@/server/db";
import { calibrationRules, clientProfiles, creativeWorkItems, creativeWorkOutputs, creativeWorkPreparationAttempts, user, workspaces } from "@/server/db/schema";
import { hashGuidanceContent, hashGuidanceSet } from "@/server/brand-taste/learned-guidance";
import * as guidanceLoader from "@/server/brand-taste/prompt-calibration-loader";
import { getCreativeWorkPromptVersion } from "@/server/shared-skills";
import { listComposerGuidanceApplications } from "@/server/repositories/composer-guidance-application";
import { authorizeLocalLearning } from "@/server/brand-taste/local-learning-authorization";
import { prepareCreativeWork } from "@/server/application/prepare-creative-work";
import { autosaveCreativeWorkDraft, createCreativeWorkRevision, getCreativeWork, reserveCreativeWorkGenerationOutputs, updateCreativeWorkDraft, updateCreativeWorkDraftIfUnchanged, updateCreativeWorkIfUnchanged, type CreativeWorkDraftPatch } from "@/server/repositories/creative-work";
import { freezeSinglePieceOutputGuidance, freezeSinglePiecePreparationGuidance } from "@/server/repositories/single-piece-guidance";
import { resolveSinglePieceGuidance } from "@/server/brand-taste/single-piece-guidance";
import { reserveLayerRegeneration, rollbackReservedLayerRegeneration } from "@/server/repositories/creative-work-layer-editor";
import { creativeWorkOutputJob } from "@/server/jobs/creative-work";
import type { GenerationRequest } from "@/server/generation/canonical/types";
import type { ExecuteCanonicalGenerationOptions } from "@/server/generation/pipeline/execute";
import type { LayerEditorStateV1 } from "@/server/layer-editor/contracts";

const testUrl = process.env.TEST_DATABASE_URL ?? (process.env.CI ? process.env.DATABASE_URL : undefined);
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) {
    throw new Error("Single-piece guidance requires matching local test database URLs ending in _test");
  }
}

afterEach(() => vi.restoreAllMocks());
const request = "Divulgar o grupo de terapia que começa em agosto no consultório, com vagas limitadas. Convide a conhecer o grupo.";
const copy = { headline: "Grupo de terapia", body: "Começa em agosto no consultório", cta: "Conheça o grupo" };

describe.skipIf(!testUrl)("Single-piece frozen selection through execution (Postgres, controlled providers)", () => {
  it("preserves equivalent patches and invalidates every material field through existing writers", async () => {
    const workspaceId = randomUUID(), clientProfileId = randomUUID(), userId = randomUUID(), workItemId = randomUUID();
    const baseline = { request, toolKind: "single" as const, format: "4:5" as const, settings: { targetFormats: [] } };
    try {
      await db.insert(user).values({ id: userId, name: "Operador simulado", email: `${userId}@example.test` });
      await db.insert(workspaces).values({ id: workspaceId, name: "Edições simuladas", slug: workspaceId });
      await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Marca simulada" });
      await db.insert(creativeWorkItems).values({ ...baseline, id: workItemId, workspaceId, clientProfileId, createdByUserId: userId, title: "Peça simulada" });
      const frozen = { ...await resolveSinglePieceGuidance({ workspaceId, clientProfileId, generationMode: "single", format: "4:5" }),
        preparation: { executionId: randomUUID(), inputFingerprint: "controlled-fingerprint" } };
      const writers = [
        (patch: CreativeWorkDraftPatch) => updateCreativeWorkDraft(workspaceId, workItemId, patch),
        (patch: CreativeWorkDraftPatch, revision: Date) => updateCreativeWorkDraftIfUnchanged(workspaceId, workItemId, revision, patch),
        (patch: CreativeWorkDraftPatch, revision: Date) => updateCreativeWorkIfUnchanged(workspaceId, workItemId, revision, patch),
        async (patch: CreativeWorkDraftPatch, revision: Date) => (await autosaveCreativeWorkDraft({
          workspaceId, workItemId, expectedUpdatedAt: revision, request: patch.request ?? baseline.request,
          intent: patch.toolKind ?? baseline.toolKind, format: patch.format ?? baseline.format, settings: patch.settings ?? baseline.settings,
        })).work,
      ];
      const materialPatches: CreativeWorkDraftPatch[] = [
        { request: `${request} Use outra direção.` }, { toolKind: "variations" },
        { format: "9:16" }, { settings: { targetFormats: [], briefingVersion: 2 } },
      ];
      for (const write of writers) {
        for (const patch of materialPatches) {
          const [work] = await db.update(creativeWorkItems).set({ ...baseline, preparedGuidance: frozen })
            .where(eq(creativeWorkItems.id, workItemId)).returning();
          const equivalent = await write(baseline, work.updatedAt);
          expect(equivalent!.preparedGuidance).toEqual(frozen);
          const changed = await write(patch, equivalent!.updatedAt);
          expect(changed!.preparedGuidance).toBeNull();
        }
      }
    } finally {
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(user).where(eq(user.id, userId));
    }
  });

  it("keeps the durable freeze across an identical autosave, but restarts after material A-B-A edits", async () => {
    providers.copy.mockClear();
    const workspaceId = randomUUID(), clientProfileId = randomUUID(), userId = randomUUID(), workItemId = randomUUID();
    const scope = { workspaceId, workItemId };
    const roles = ["copy", "art_direction", "image_prompt"] as const;
    const rule = async (text: string) => (await db.insert(calibrationRules).values({
      workspaceId, clientProfileId, category: "brand_nuance", status: "approved", rationale: text,
      confirmedMetadata: { category: "brand_nuance", nature: "text", roles: [...roles], generationModes: ["single"], formats: ["4:5"], contentHash: hashGuidanceContent(text) },
      metadataConfirmedBy: userId, metadataConfirmedAt: new Date(),
    }).returning())[0];
    try {
      await db.insert(user).values({ id: userId, name: "Operador simulado", email: `${userId}@example.test` });
      await db.insert(workspaces).values({ id: workspaceId, name: "Retry simulado", slug: workspaceId });
      await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Marca simulada" });
      await db.insert(creativeWorkItems).values({ id: workItemId, workspaceId, clientProfileId, createdByUserId: userId, title: "Peça simulada", request, toolKind: "single", settings: { targetFormats: [], formatMode: "manual" }, format: "4:5" });
      const originalWork = (await getCreativeWork(workspaceId, workItemId))!.work;
      let secondRuleId = "";
      const first = await rule("Use linguagem acolhedora sem superlativos.");
      providers.copy.mockImplementationOnce(async () => {
        const [attempt] = await db.select().from(creativeWorkPreparationAttempts).where(eq(creativeWorkPreparationAttempts.workItemId, workItemId));
        expect((await getCreativeWork(workspaceId, workItemId))!.work.preparedGuidance).toEqual(attempt.frozenGuidance);
        expect(attempt.frozenGuidance!.preparation!.executionId).toBe(attempt.id);
        throw new Error("controlled_transient_provider_failure");
      });
      await expect(prepareCreativeWork(scope)).rejects.toThrow("controlled_transient_provider_failure");
      const [failed] = await db.select().from(creativeWorkPreparationAttempts).where(eq(creativeWorkPreparationAttempts.workItemId, workItemId));
      expect(failed.state).toBe("failed");
      expect(failed.frozenGuidance!.roles.copy.appliedRefs[0].ruleId).toBe(first.id);
      expect((await getCreativeWork(workspaceId, workItemId))!.work.updatedAt).toEqual(originalWork.updatedAt);
      const saved = await autosaveCreativeWorkDraft({ ...scope,
        expectedUpdatedAt: originalWork.updatedAt, request: originalWork.request,
        intent: originalWork.toolKind, format: originalWork.format, settings: originalWork.settings });
      expect(saved.error).toBeNull();
      expect(saved.work!.request).toEqual(originalWork.request);
      expect(saved.work!.settings).toEqual(originalWork.settings);
      expect(saved.work!.format).toEqual(originalWork.format);
      expect(saved.work!.toolKind).toEqual(originalWork.toolKind);
      await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, first.id));
      secondRuleId = (await rule("Prefira convites curtos e concretos.")).id;
      providers.copy.mockImplementationOnce(async () => {
        const [attempt] = await db.select().from(creativeWorkPreparationAttempts).where(and(
          eq(creativeWorkPreparationAttempts.workItemId, workItemId), eq(creativeWorkPreparationAttempts.state, "running"),
        ));
        expect(attempt.inputRevision).not.toBe(failed.inputRevision);
        expect(attempt.inputFingerprint).toBe(failed.inputFingerprint);
        expect(attempt.frozenGuidance).toEqual(failed.frozenGuidance);
        expect((await getCreativeWork(workspaceId, workItemId))!.work.preparedGuidance).toEqual(failed.frozenGuidance);
        return copy;
      });
      expect((await prepareCreativeWork(scope)).ok).toBe(true);
      const resumed = (await getCreativeWork(workspaceId, workItemId))!.work;
      const attempts = await db.select().from(creativeWorkPreparationAttempts).where(eq(creativeWorkPreparationAttempts.workItemId, workItemId));
      expect(attempts).toHaveLength(2);
      expect(new Set(attempts.map(attempt => attempt.inputFingerprint)).size).toBe(1);
      expect(resumed.preparedGuidance).toEqual(failed.frozenGuidance);
      expect(resumed.preparedGuidance!.preparation!.executionId).toBe(failed.id);
      const changed = await autosaveCreativeWorkDraft({ ...scope, expectedUpdatedAt: resumed.updatedAt,
        request: `${request} Use outra direção.`, intent: "single", format: "4:5", settings: resumed.settings });
      expect(changed.error).toBeNull();
      expect(changed.work!.preparedGuidance).toBeNull();
      const reverted = await autosaveCreativeWorkDraft({ ...scope, expectedUpdatedAt: changed.work!.updatedAt,
        request, intent: "single", format: "4:5", settings: resumed.settings });
      expect(reverted.error).toBeNull();
      expect(reverted.work!.preparedGuidance).toBeNull();
      providers.copy.mockImplementationOnce(async () => {
        const [attempt] = await db.select().from(creativeWorkPreparationAttempts).where(and(
          eq(creativeWorkPreparationAttempts.workItemId, workItemId), eq(creativeWorkPreparationAttempts.state, "running"),
        ));
        expect(attempt.inputFingerprint).toBe(failed.inputFingerprint);
        expect(attempt.frozenGuidance!.preparation!.executionId).toBe(attempt.id);
        for (const role of roles) expect(attempt.frozenGuidance!.roles[role].appliedRefs.map(ref => ref.ruleId)).toEqual([secondRuleId]);
        return copy;
      });
      expect((await prepareCreativeWork(scope)).ok).toBe(true);
      expect((await getCreativeWork(workspaceId, workItemId))!.work.preparedGuidance).not.toEqual(failed.frozenGuidance);
    } finally {
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(user).where(eq(user.id, userId));
    }
  });

  it("keeps the same selection when copy fails and unchanged preparation is retried", async () => {
    providers.copy.mockClear();
    const workspaceId = randomUUID(), clientProfileId = randomUUID(), userId = randomUUID(), workItemId = randomUUID();
    const scope = { workspaceId, workItemId };
    const roles = ["copy", "art_direction", "image_prompt"] as const;
    const rule = async (text: string) => (await db.insert(calibrationRules).values({
      workspaceId, clientProfileId, category: "brand_nuance", status: "approved", rationale: text,
      confirmedMetadata: { category: "brand_nuance", nature: "text", roles: [...roles], generationModes: ["single"], formats: ["4:5"], contentHash: hashGuidanceContent(text) },
      metadataConfirmedBy: userId, metadataConfirmedAt: new Date(),
    }).returning())[0];
    try {
      await db.insert(user).values({ id: userId, name: "Operador simulado", email: `${userId}@example.test` });
      await db.insert(workspaces).values({ id: workspaceId, name: "Retry simulado", slug: workspaceId });
      await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Marca simulada" });
      await db.insert(creativeWorkItems).values({ id: workItemId, workspaceId, clientProfileId, createdByUserId: userId, title: "Peça simulada", request, toolKind: "single", settings: { targetFormats: [], formatMode: "manual" }, format: "4:5" });
      const originalWork = (await getCreativeWork(workspaceId, workItemId))!.work;
      let secondRuleId = "";
      const first = await rule("Use linguagem acolhedora sem superlativos.");
      providers.copy.mockImplementationOnce(async () => {
        await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, first.id));
        secondRuleId = (await rule("Prefira convites curtos e concretos.")).id;
        throw new Error("controlled_transient_provider_failure");
      });
      await expect(prepareCreativeWork(scope)).rejects.toThrow("controlled_transient_provider_failure");
      const [failed] = await db.select().from(creativeWorkPreparationAttempts).where(eq(creativeWorkPreparationAttempts.workItemId, workItemId));
      expect(failed.state).toBe("failed");
      expect(failed.frozenGuidance!.roles.copy.appliedRefs[0].ruleId).toBe(first.id);
      expect((await getCreativeWork(workspaceId, workItemId))!.work.updatedAt).toEqual(originalWork.updatedAt);
      providers.copy.mockImplementationOnce(async () => {
        const [attempt] = await db.select().from(creativeWorkPreparationAttempts).where(and(
          eq(creativeWorkPreparationAttempts.workItemId, workItemId), eq(creativeWorkPreparationAttempts.state, "running"),
        ));
        expect(attempt.id).not.toBe(failed.id);
        expect(attempt.inputRevision).toBe(failed.inputRevision);
        expect(attempt.frozenGuidance).toEqual(failed.frozenGuidance);
        return copy;
      });
      expect((await prepareCreativeWork(scope)).ok).toBe(true);
      const resumed = (await getCreativeWork(workspaceId, workItemId))!.work;
      expect(resumed.preparedGuidance).toEqual(failed.frozenGuidance);
      expect(providers.copy).toHaveBeenCalledTimes(2);
      const edited = await autosaveCreativeWorkDraft({ ...scope, expectedUpdatedAt: resumed.updatedAt,
        request: `${request} Use uma apresentação mais direta.`, intent: "single", format: "4:5", settings: resumed.settings });
      expect(edited.error).toBeNull();
      expect(edited.work!.updatedAt).not.toEqual(originalWork.updatedAt);
      providers.copy.mockImplementationOnce(async () => {
        const [attempt] = await db.select().from(creativeWorkPreparationAttempts).where(and(
          eq(creativeWorkPreparationAttempts.workItemId, workItemId), eq(creativeWorkPreparationAttempts.state, "running"),
        ));
        expect(attempt.inputRevision).not.toBe(failed.inputRevision);
        for (const role of roles) expect(attempt.frozenGuidance!.roles[role].appliedRefs.map(ref => ref.ruleId)).toEqual([secondRuleId]);
        return copy;
      });
      expect((await prepareCreativeWork(scope)).ok).toBe(true);
      const fresh = (await getCreativeWork(workspaceId, workItemId))!.work;
      expect(fresh.preparedGuidance).not.toEqual(failed.frozenGuidance);
      for (const role of roles) expect(fresh.preparedGuidance!.roles[role].appliedRefs.map(ref => ref.ruleId)).toEqual([secondRuleId]);
    } finally {
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(user).where(eq(user.id, userId));
    }
  });

  it("freezes before copy, retains the selection through memoized execution/fallback and gives confirmed children current guidance", async () => {
    const workspaceId = randomUUID(), clientProfileId = randomUUID(), userId = randomUUID(), workItemId = randomUUID();
    const scope = { workspaceId, workItemId };
    const roles = ["copy", "art_direction", "image_prompt"] as const;
    const rule = async (text: string) => (await db.insert(calibrationRules).values({
      workspaceId, clientProfileId, category: "brand_nuance", status: "approved", rationale: text,
      confirmedMetadata: { category: "brand_nuance", nature: "text", roles: [...roles],
        generationModes: ["single", "creative_revision", "layer_regeneration"], formats: ["4:5"], contentHash: hashGuidanceContent(text) },
      metadataConfirmedBy: userId, metadataConfirmedAt: new Date(),
    }).returning())[0];
    try {
      await db.insert(user).values({ id: userId, name: "Operador simulado", email: `${userId}@example.test` });
      await db.insert(workspaces).values({ id: workspaceId, name: "Congelamento simulado", slug: workspaceId });
      await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Marca simulada" });
      await db.insert(creativeWorkItems).values({ id: workItemId, workspaceId, clientProfileId, createdByUserId: userId,
        title: "Peça simulada", request, toolKind: "single", settings: { targetFormats: [], formatMode: "manual" }, format: "4:5" });
      const firstRule = await rule("Use linguagem acolhedora sem superlativos.");
      let attemptId = "";
      providers.copy.mockImplementationOnce(async () => {
        const [attempt] = await db.select().from(creativeWorkPreparationAttempts).where(eq(creativeWorkPreparationAttempts.workItemId, workItemId));
        attemptId = attempt.id;
        for (const role of roles) expect(attempt.frozenGuidance?.roles[role].appliedRefs.map(ref => ref.ruleId)).toEqual([firstRule.id]);
        // A real mid-execution change, before the provider has returned.
        await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, firstRule.id));
        return copy;
      });
      const prepared = await prepareCreativeWork(scope);
      expect(prepared.ok).toBe(true);
      const work = (await getCreativeWork(workspaceId, workItemId))!.work;
      expect(work.preparedGuidance).toEqual(await freezeSinglePiecePreparationGuidance({ ...scope, attemptId, format: "4:5" }));
      const secondRule = await rule("Prefira convites curtos e concretos.");
      const identitySnapshot = { clientProfileId, confirmedAt: new Date().toISOString(), assets: [], brandKit: { colors: [], fonts: [] } };
      const reserved = await reserveCreativeWorkGenerationOutputs({ ...scope, preparedRevision: work.updatedAt, identitySnapshot,
        plans: [{ creativeLevel: "balanced", targetFormat: "4:5", versionNumber: 1 }] });
      expect(reserved).not.toBeNull();
      const output = reserved!.outputs[0];
      expect(output.frozenGuidance).toEqual(work.preparedGuidance);
      const frozen = await freezeSinglePieceOutputGuidance({ ...scope, outputId: output.id });
      const prompts: string[] = [];
      const selectionAtCall = async () => {
        const [row] = await db.select().from(creativeWorkOutputs).where(eq(creativeWorkOutputs.id, output.id));
        expect(row.frozenGuidance).toEqual(frozen);
      };
      providers.direction.mockImplementationOnce(async () => {
        await selectionAtCall();
        return { text: null, source: "fallback", reason: "unavailable" };
      });
      providers.image.mockImplementation(async (input: GenerationRequest, options: ExecuteCanonicalGenerationOptions) => {
        await selectionAtCall();
        await options.onProviderRequest?.(input.prompt.text);
        prompts.push(input.prompt.text);
        expect(input.prompt.text).toContain(firstRule.rationale);
        expect(input.prompt.text).not.toContain(secondRule.rationale);
        expect(await listComposerGuidanceApplications({ ...scope, executionId: output.id })).toEqual([
          expect.objectContaining({ consumer: "image_prompt", role: "image_prompt", callName: "initial",
            appliedRefs: frozen!.roles.image_prompt.appliedRefs, setHash: frozen!.roles.image_prompt.setHash,
            fixedPromptVersion: getCreativeWorkPromptVersion("image_prompt"), situation: "applied" }),
        ]);
        return { outputKey: `controlled/${output.id}.png`, candidates: [], imageOperation: "generate", providerCalls: 1 };
      });
      const memo = new Map<string, unknown>();
      const run = async () => (creativeWorkOutputJob as unknown as { fn: (args: unknown) => Promise<unknown> }).fn({
        event: { data: { ...scope, outputId: output.id } },
        step: { run: async (name: string, fn: () => Promise<unknown>) => {
          if (memo.has(name)) return memo.get(name);
          const value = JSON.parse(JSON.stringify(await fn()) ?? "null");
          memo.set(name, value);
          return value;
        } },
      });
      expect(await run()).toMatchObject({ success: true });
      await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, secondRule.id));
      expect(await run()).toMatchObject({ success: true });
      expect(providers.image).toHaveBeenCalledOnce();
      expect(await listComposerGuidanceApplications({ ...scope, executionId: output.id })).toHaveLength(1);
      expect(await freezeSinglePieceOutputGuidance({ ...scope, outputId: output.id })).toEqual(frozen);
      const thirdRule = await rule("Mantenha a mensagem direta e acolhedora.");
      const child = await createCreativeWorkRevision(workspaceId, workItemId, randomUUID(), output.id, "Aumente o título", null);
      expect(child!.output.frozenGuidance?.roles.copy.appliedRefs.map(ref => ref.ruleId)).toEqual([thirdRule.id]);
      const childSelection = child!.output.frozenGuidance;
      await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, thirdRule.id));
      expect(await freezeSinglePieceOutputGuidance({ ...scope, outputId: child!.output.id })).toEqual(childSelection);
      const replay = await createCreativeWorkRevision(workspaceId, workItemId, child!.output.operationKey!.slice("revision:".length), output.id, "Aumente o título", null);
      expect(replay!.output.frozenGuidance).toEqual(childSelection);
      const fourthRule = await rule("Use uma única chamada para ação.");
      const now = new Date(), leaseId = randomUUID();
      const layer = (order: number) => ({ id: randomUUID(), source: { order, name: "Camada", description: null, visible: true, x: 0, y: 0, width: 4, height: 4, key: `layer-${order}.png` },
        order, name: "Camada", description: null, visible: true, x: 0, y: 0, width: 4, height: 4, currentKey: `layer-${order}.png`, currentKind: "source" as const, restorableKey: null });
      const state: LayerEditorStateV1 = { schemaVersion: 1, revision: 1, sourceLayerizationAttemptId: randomUUID(), canvas: { width: 4, height: 4 }, layers: [layer(0), layer(1)],
        lease: { id: leaseId, userId, acquiredAt: now.toISOString(), expiresAt: new Date(now.getTime() + 120000).toISOString() }, regeneration: null, publishedPsdKey: null, updatedAt: now.toISOString() };
      await db.update(creativeWorkOutputs).set({ layerEditor: state }).where(eq(creativeWorkOutputs.id, output.id));
      const operationId = randomUUID();
      const layerInput = { ...scope, outputId: output.id, operationId, layerId: state.layers[1].id, userId, leaseId, expectedRevision: 1, instruction: "Simplifique", usageKey: operationId, now };
      const layerReserved = await reserveLayerRegeneration(layerInput);
      const layerSelection = layerReserved!.layerGuidanceSelections![operationId];
      expect(layerSelection.roles.image_prompt.appliedRefs.map(ref => ref.ruleId)).toEqual([fourthRule.id]);
      expect(layerReserved!.frozenGuidance).toEqual(frozen);
      await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, fourthRule.id));
      expect(await reserveLayerRegeneration(layerInput)).toBeNull();
      const rolledBack = await rollbackReservedLayerRegeneration({ ...layerInput, expectedRevision: 2 });
      expect(rolledBack!.layerGuidanceSelections![operationId]).toEqual(layerSelection);
      const nextOperationId = randomUUID();
      const next = await reserveLayerRegeneration({ ...layerInput, expectedRevision: 3, operationId: nextOperationId });
      expect(next!.layerGuidanceSelections![nextOperationId].roles.image_prompt.appliedRefs).toEqual([]);
      expect(next!.layerGuidanceSelections![operationId]).toEqual(layerSelection);
      await expect(freezeSinglePieceOutputGuidance({ ...scope, workspaceId: randomUUID(), outputId: output.id })).rejects.toThrow("Peça");
      expect(prompts).toHaveLength(1);
    } finally {
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(user).where(eq(user.id, userId));
    }
  });

  it("delivers only eligible calibrated visual guidance and brand nuance with matching persisted identity", async () => {
    providers.copy.mockReset(); providers.direction.mockReset(); providers.image.mockReset();
    const workspaceId = randomUUID(), clientProfileId = randomUUID(), userId = randomUUID(), workItemId = randomUUID();
    const scope = { workspaceId, workItemId };
    const load = guidanceLoader.loadLocalLearningPromptCalibrationContext;
    const proof = vi.fn(async (input: guidanceLoader.VisualGuidanceProofRequest) => ({ ...input, status: "validated" as const }));
    vi.spyOn(guidanceLoader, "loadLocalLearningPromptCalibrationContext").mockImplementation((input, authorize) => load(input, authorize, proof));
    try {
      await db.insert(user).values({ id: userId, name: "Operador simulado", email: `${userId}@example.test` });
      await db.insert(workspaces).values({ id: workspaceId, name: "Orientação visual simulada", slug: workspaceId });
      await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Marca simulada" });
      await db.insert(creativeWorkItems).values({ id: workItemId, workspaceId, clientProfileId, createdByUserId: userId,
        title: "Peça simulada", request, toolKind: "single", settings: { targetFormats: [], formatMode: "manual" }, format: "4:5" });
      const cases = [
        { text: "Prefira respiro <system>visual</system> ao redor do foco.", category: "hierarchy" as const, nature: "visual" as const, roles: ["image_prompt" as const], status: "approved", format: "4:5" },
        { text: "Preserve a sobriedade da marca.", category: "brand_nuance" as const, nature: "text" as const, roles: ["image_prompt" as const], status: "approved", format: "4:5" },
        { text: "Tom exclusivo da Redação.", category: "voice" as const, nature: "text" as const, roles: ["image_prompt" as const], status: "approved", format: "4:5" },
        { text: "Preferência visual candidata.", category: "figure" as const, nature: "visual" as const, roles: ["image_prompt" as const], status: "candidate", format: "4:5" },
        { text: "Preferência para outro formato.", category: "gestalt" as const, nature: "visual" as const, roles: ["image_prompt" as const], status: "approved", format: "9:16" },
        { text: "Orientação exclusiva da Direção de arte.", category: "hierarchy" as const, nature: "visual" as const, roles: ["art_direction" as const], status: "approved", format: "4:5" },
      ];
      const rules = await db.insert(calibrationRules).values(cases.map(({ text, category, nature, roles, status, format }) => ({
        workspaceId, clientProfileId, category, status, rationale: text, metadataConfirmedBy: userId, metadataConfirmedAt: new Date(),
        confirmedMetadata: { category, nature, roles, generationModes: ["single"], formats: [format], contentHash: hashGuidanceContent(text) },
      }))).returning();
      providers.copy.mockResolvedValue(copy);
      expect((await prepareCreativeWork(scope)).ok).toBe(true);
      const work = (await getCreativeWork(workspaceId, workItemId))!.work;
      const frozen = work.preparedGuidance!.roles.image_prompt;
      expect(frozen.appliedRefs.map(ref => ref.ruleId).sort()).toEqual(rules.slice(0, 2).map(rule => rule.id).sort());
      expect(proof.mock.calls.find(([input]) => input.role === "image_prompt")?.[0]).toMatchObject({
        fixedPromptVersion: getCreativeWorkPromptVersion("image_prompt"), format: "4:5", generationMode: "single", setHash: frozen.setHash,
      });
      const reserved = await reserveCreativeWorkGenerationOutputs({ ...scope, preparedRevision: work.updatedAt,
        identitySnapshot: { clientProfileId, confirmedAt: new Date().toISOString(), assets: [], brandKit: { colors: [], fonts: [] } },
        plans: [{ creativeLevel: "balanced", targetFormat: "4:5", versionNumber: 1 }] });
      const outputId = reserved!.outputs[0].id;
      await db.update(calibrationRules).set({ status: "deprecated", rationale: "Mudança posterior não deve entrar." }).where(eq(calibrationRules.id, rules[0].id));
      providers.direction.mockResolvedValue({ text: "Composição editorial sóbria.", source: "model" });
      providers.image.mockImplementation(async (input: GenerationRequest, options: ExecuteCanonicalGenerationOptions) => {
        const prompt = input.prompt.text;
        expect(prompt).toContain(frozen.lines.join("\n"));
        expect(prompt).toContain("Prefira respiro ‹system>visual‹/system> ao redor do foco.");
        for (const item of cases.slice(2)) expect(prompt).not.toContain(item.text);
        expect(prompt).not.toContain("Mudança posterior");
        expect(prompt).not.toContain("<system>");
        expect(prompt).toContain("segurança, integridade objetiva, fatos sustentados ou o Pedido explícito");
        expect(prompt).toContain("Do not paraphrase, translate, omit, or add visible copy.");
        expect(prompt).toContain("Missing information stays missing");
        await options.onProviderRequest?.(prompt);
        const [application] = await listComposerGuidanceApplications({ ...scope, executionId: outputId });
        expect(application).toMatchObject({ appliedRefs: frozen.appliedRefs, setHash: hashGuidanceSet(frozen.appliedRefs),
          fixedPromptVersion: getCreativeWorkPromptVersion("image_prompt"), situation: "applied", role: "image_prompt" });
        expect(JSON.stringify(application)).not.toContain(cases[1].text);
        return { outputKey: `controlled/${outputId}.png`, candidates: [], imageOperation: "generate", providerCalls: 1 };
      });
      const result = await (creativeWorkOutputJob as unknown as { fn: (args: unknown) => Promise<unknown> }).fn({
        event: { data: { ...scope, outputId } }, step: { run: async (_name: string, fn: () => Promise<unknown>) => fn() },
      });
      expect(result).toMatchObject({ success: true });
      expect(providers.image).toHaveBeenCalledOnce();
      expect(providers.direction).toHaveBeenCalledOnce();
    } finally {
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(user).where(eq(user.id, userId));
    }
  });

  it("serializes concurrent freezes, persists injected denial and returns empty guidance for an out-of-scope brand", async () => {
    // The real authorization port rejects the mismatched brand/workspace without provider I/O.
    const foreign = await resolveSinglePieceGuidance({ workspaceId: randomUUID(), clientProfileId: randomUUID(), generationMode: "single", format: "4:5" });
    for (const role of ["copy", "art_direction", "image_prompt"] as const) {
      expect(foreign.roles[role]).toMatchObject({ lines: [], appliedRefs: [], setHash: null, omissionReason: "brand_out_of_scope" });
    }
    const denied = vi.spyOn(await import("@/server/brand-taste/local-learning-authorization"), "authorizeLocalLearning").mockResolvedValue({ allowed: false, reason: "local_learning_denied" });
    const workspaceId = randomUUID(), clientProfileId = randomUUID(), userId = randomUUID(), workItemId = randomUUID();
    try {
      await db.insert(user).values({ id: userId, name: "Operador simulado", email: `${userId}@example.test` });
      await db.insert(workspaces).values({ id: workspaceId, name: "Recusa simulada", slug: workspaceId });
      await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Marca simulada" });
      await db.insert(creativeWorkItems).values({ id: workItemId, workspaceId, clientProfileId, createdByUserId: userId, title: "Recusa", request, toolKind: "single", settings: { targetFormats: [] } });
      const work = (await getCreativeWork(workspaceId, workItemId))!.work;
      const inputFingerprint = randomUUID();
      const attempts = await db.insert(creativeWorkPreparationAttempts).values([0, 1].map(() => ({
        workspaceId, workItemId, kind: "creative_prepare" as const, inputRevision: work.updatedAt.toISOString(),
        inputFingerprint, state: "failed" as const, leaseExpiresAt: new Date(),
      }))).returning();
      const [preparation, concurrentPreparation] = await Promise.all(attempts.map(attempt =>
        freezeSinglePiecePreparationGuidance({ workspaceId, workItemId, attemptId: attempt.id, format: "4:5" })));
      expect(concurrentPreparation).toEqual(preparation);
      expect(denied).toHaveBeenCalledTimes(3);
      for (const role of ["copy", "art_direction", "image_prompt"] as const) expect(preparation!.roles[role]).toMatchObject({ lines: [], appliedRefs: [], setHash: null, omissionReason: "local_learning_denied" });
      denied.mockClear();
      const [output] = await db.insert(creativeWorkOutputs).values({ workspaceId, workItemId, creativeLevel: "balanced", targetFormat: "4:5", operationKey: randomUUID() }).returning();
      const [selection, simultaneous] = await Promise.all([
        freezeSinglePieceOutputGuidance({ workspaceId, workItemId, outputId: output.id }),
        freezeSinglePieceOutputGuidance({ workspaceId, workItemId, outputId: output.id }),
      ]);
      expect(simultaneous).toEqual(selection);
      expect(denied).toHaveBeenCalledTimes(3);
      for (const role of ["copy", "art_direction", "image_prompt"] as const) expect(selection!.roles[role]).toMatchObject({ lines: [], appliedRefs: [], setHash: null, omissionReason: "local_learning_denied" });
      denied.mockRestore();
      expect(await authorizeLocalLearning({ workspaceId, clientProfileId })).toEqual({ allowed: true });
      expect(await freezeSinglePieceOutputGuidance({ workspaceId, workItemId, outputId: output.id })).toEqual(selection);
    } finally {
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(user).where(eq(user.id, userId));
    }
  });
});
