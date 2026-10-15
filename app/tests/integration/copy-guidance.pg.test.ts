import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const controlled = vi.hoisted(() => ({ provider: vi.fn(), spend: vi.fn() }));
vi.mock("@/server/ai/utils", () => ({ getOpenAI: () => ({ chat: { completions: { create: controlled.provider } } }) }));
vi.mock("@/server/billing/paywall", () => ({ spend: controlled.spend }));
vi.mock("@/server/creative-work/identity", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/creative-work/identity")>(),
  createIdentitySnapshot: vi.fn(async () => ({ assets: [], brandKit: { colors: [], fonts: [], toneOfVoice: null, prohibitedElements: null, requiredElements: null } })),
}));
import { db } from "@/server/db";
import { calibrationRules, clientProfiles, creativeWorkItems, creativeWorkPreparationAttempts, user, workspaces } from "@/server/db/schema";
import { hashGuidanceContent } from "@/server/brand-taste/learned-guidance";
import { generateSocialPostCopy } from "@/server/application/generate-social-post-copy";
import { confirmSocialPostWork } from "@/server/application/confirm-social-post-work";
import { runWriting } from "@/server/equipe/agents/writing";
import { createPlannedCreativeWorkOutputs, createCreativeWorkRevision, getCreativeWork, updateCreativeWorkDraft } from "@/server/repositories/creative-work";
import { freezeIndependentCopyGuidance, independentCopyFingerprint, persistIndependentCopy } from "@/server/repositories/copy-guidance";
import { claimPreparationAttempt } from "@/server/repositories/creative-work-preparation";
import { independentCopyInputRevision } from "@/server/creative-work/copy-execution";
import { loadOutputGenerationIdentity } from "@/server/repositories/output-generation-identity";
import { getCreativeWorkPromptVersion } from "@/server/shared-skills";

const testUrl = process.env.TEST_DATABASE_URL ?? (process.env.CI ? process.env.DATABASE_URL : undefined);
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) {
    throw new Error("Copy guidance requires matching local test database URLs ending in _test");
  }
}
const copy = { headline: "Grupo de terapia", body: "Encontros em agosto", cta: "Conheça o grupo" };

describe.skipIf(!testUrl)("Copy guidance through Redação and reused Peça (Postgres, fake provider)", () => {
  beforeEach(() => { vi.clearAllMocks(); controlled.spend.mockResolvedValue({ ok: true, creditsSpent: 2 }); });
  it("freezes only eligible copy preferences, keeps them across failure/autosave/retry, and copies their original attribution to outputs", async () => {
    const workspaceId = randomUUID(), clientProfileId = randomUUID(), foreignProfileId = randomUUID(), userId = randomUUID(), workItemId = randomUUID();
    const scope = { workspaceId, workItemId };
    const request = "Divulgue o grupo de terapia em agosto e convide a conhecer o grupo.";
    const rule = async (text: string, category: "voice" | "invite" | "brand_nuance" = "voice", options: { status?: "approved" | "candidate"; profile?: string; roles?: ("copy" | "art_direction")[]; format?: string; nature?: "text" | "visual" } = {}) =>
      (await db.insert(calibrationRules).values({ workspaceId, clientProfileId: options.profile ?? clientProfileId,
        category, status: options.status ?? "approved", rationale: text,
        confirmedMetadata: { category, nature: options.nature ?? "text", roles: options.roles ?? ["copy"], generationModes: ["single"], formats: [options.format ?? "4:5"], contentHash: hashGuidanceContent(text) },
        metadataConfirmedBy: userId, metadataConfirmedAt: new Date(),
      }).returning())[0];
    try {
      await db.insert(user).values({ id: userId, name: "Operador simulado", email: `${userId}@example.test` });
      await db.insert(workspaces).values({ id: workspaceId, name: "Redação simulada", slug: workspaceId });
      await db.insert(clientProfiles).values([
        { id: clientProfileId, workspaceId, name: "Marca simulada" }, { id: foreignProfileId, workspaceId, name: "Outra marca simulada" },
      ]);
      await db.insert(creativeWorkItems).values({ id: workItemId, workspaceId, clientProfileId, createdByUserId: userId, title: "Peça simulada", request, toolKind: "single", format: "4:5", settings: { targetFormats: [] },
        brief: { theme: "Grupo de terapia", objective: "Divulgar", audience: "Público interessado", offer: "Encontros em agosto" } });
      const voice = await rule("Prefira linguagem acolhedora.");
      const invite = await rule("Convide a conhecer o grupo.", "invite");
      const nuance = await rule("Use frases curtas.", "brand_nuance");
      await rule("CANDIDATE", "voice", { status: "candidate" });
      await rule("FOREIGN BRAND", "voice", { profile: foreignProfileId });
      await rule("ART ONLY", "brand_nuance", { roles: ["art_direction"] });
      await rule("WRONG FORMAT", "invite", { format: "9:16" });
      await rule("VISUAL PENDING", "brand_nuance", { nature: "visual" });
      controlled.provider.mockRejectedValueOnce(new Error("controlled transient failure"));
      await expect(runWriting(scope)).rejects.toThrow("writing_failed:provider_unavailable");
      const [first] = await db.select().from(creativeWorkPreparationAttempts).where(eq(creativeWorkPreparationAttempts.workItemId, workItemId));
      expect(first.state).toBe("failed");
      const frozen = first.frozenGuidance!.roles.copy;
      expect(frozen.appliedRefs.map(ref => ref.ruleId).sort()).toEqual([voice.id, invite.id, nuance.id].sort());
      const firstPrompt = controlled.provider.mock.calls[0][0].messages;
      const system = firstPrompt[0].content;
      expect(system.indexOf("LEARNED BRAND PREFERENCES:")).toBeGreaterThan(system.indexOf("Constraints:"));
      expect(system).toContain(voice.rationale);
      expect(system).toContain(invite.rationale);
      expect(system).toContain(nuance.rationale);
      expect(system).not.toMatch(/CANDIDATE|FOREIGN BRAND|ART ONLY|WRONG FORMAT|VISUAL PENDING/);
      expect(first.guidanceApplications).toEqual([expect.objectContaining({ consumer: "copy", executionId: first.id, appliedRefs: frozen.appliedRefs, setHash: frozen.setHash, fixedPromptVersion: getCreativeWorkPromptVersion("copy") })]);
      await expect(freezeIndependentCopyGuidance({ ...scope, workspaceId: randomUUID(), attemptId: first.id })).rejects.toThrow("Execução de copy não encontrada");
      // A timestamp-only autosave and changed approvals must not change the paid copy unit.
      await updateCreativeWorkDraft(workspaceId, workItemId, { request });
      await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, voice.id));
      await rule("NEW AFTER FAILURE");
      controlled.provider.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(copy) } }] });
      expect(await runWriting(scope)).toEqual(copy);
      expect(controlled.provider.mock.calls[1][0].messages).toEqual(firstPrompt);
      const work = (await getCreativeWork(workspaceId, workItemId))!.work;
      expect(work.copyGuidanceExecutionId).toBe(first.id);
      expect(work.preparedGuidance).toBeNull(); // Independent copy does not freeze the later image unit.
      expect(await runWriting(scope)).toEqual(copy);
      expect(controlled.provider).toHaveBeenCalledTimes(2); // one failed call, one successful retry; no second writer
      expect(controlled.spend).toHaveBeenCalledTimes(2); // retries keep the existing idempotent billing key
      expect(new Set(controlled.spend.mock.calls.map(([input]) => input.idempotencyKey))).toEqual(new Set([`creative-work:${workItemId}:copy`]));
      const [origin] = await db.select().from(creativeWorkPreparationAttempts).where(eq(creativeWorkPreparationAttempts.id, first.id));
      const { outputs } = await createPlannedCreativeWorkOutputs(workspaceId, workItemId, [{ creativeLevel: "balanced", targetFormat: "4:5", versionNumber: 1 }]);
      expect(outputs[0].guidanceApplications).toEqual(origin.guidanceApplications);
      const identity = await loadOutputGenerationIdentity({ workspaceId, clientProfileId, creativeWorkOutputId: outputs[0].id });
      expect(identity).toEqual({ state: "recorded", applications: origin.guidanceApplications!.map(({ role, appliedRefs, setHash, fixedPromptVersion }) => ({ role, appliedRefs, setHash, fixedPromptVersion })) });
      // Saving unchanged bytes keeps provenance; manual copy changes remove it, never invent a new application.
      expect((await updateCreativeWorkDraft(workspaceId, workItemId, { copy }))!.copyGuidanceExecutionId).toBe(first.id);
      expect((await updateCreativeWorkDraft(workspaceId, workItemId, { copy: { ...copy, cta: "Saiba mais" } }))!.copyGuidanceExecutionId).toBeNull();
      const { outputs: manual } = await createPlannedCreativeWorkOutputs(workspaceId, workItemId, [{ creativeLevel: "bold", targetFormat: "4:5", versionNumber: 1 }]);
      expect(manual.find(output => output.creativeLevel === "bold")!.guidanceApplications).toBeNull();
      expect((await loadOutputGenerationIdentity({ workspaceId, creativeWorkOutputId: outputs[0].id }))).toEqual(identity);
      const revision = await createCreativeWorkRevision(workspaceId, workItemId, randomUUID(), outputs[0].id, "Ajuste o fundo", null);
      expect(revision!.output.guidanceApplications).toEqual(origin.guidanceApplications);
      expect(controlled.provider).toHaveBeenCalledTimes(2);

    } finally {
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(user).where(eq(user.id, userId));
    }
  });
});

const response = { choices: [{ message: { content: JSON.stringify(copy) } }] };
async function fixture(fn: (scope: { workspaceId: string; workItemId: string; userId: string }, request: string) => Promise<void>) {
 const workspaceId = randomUUID(), workItemId = randomUUID(), userId = randomUUID(), clientProfileId = randomUUID();
 const request = "Divulgue o grupo de terapia em agosto.";
 try {
  await db.insert(user).values({ id: userId, name: "Operador simulado", email: `${userId}@example.test` });
  await db.insert(workspaces).values({ id: workspaceId, name: "Regressão de copy", slug: workspaceId });
  await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Marca simulada" });
  await db.insert(creativeWorkItems).values({ id: workItemId, workspaceId, clientProfileId, createdByUserId: userId, title: "Regressão de copy", request, toolKind: "single", format: "4:5", settings: { targetFormats: [] }, brief: { theme: "Grupo de terapia", objective: "Divulgar", audience: "Público interessado", offer: "Encontros em agosto" } });
  const text = "Prefira linguagem acolhedora.";
  await db.insert(calibrationRules).values({ workspaceId, clientProfileId, category: "voice", status: "approved", rationale: text, confirmedMetadata: { category: "voice", nature: "text", roles: ["copy"], generationModes: ["single"], formats: ["4:5"], contentHash: hashGuidanceContent(text) }, metadataConfirmedBy: userId, metadataConfirmedAt: new Date() });
  await fn({ workspaceId, workItemId, userId }, request);
 } finally {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(user).where(eq(user.id, userId));
 }
}

describe.skipIf(!testUrl)("Copy execution regressions (Postgres, fake provider)", () => {
 beforeEach(() => { vi.clearAllMocks(); controlled.spend.mockResolvedValue({ ok: true, creditsSpent: 2 }); });
 it.each([false, true])("confirmation preserves unchanged origin and clears edited origin (edited=%s)", async edited => {
  await fixture(async scope => {
   controlled.provider.mockResolvedValue(response);
   expect((await generateSocialPostCopy(scope)).ok).toBe(true);
   const original = (await getCreativeWork(scope.workspaceId, scope.workItemId))!.work.copyGuidanceExecutionId!;
   const [origin] = await db.select().from(creativeWorkPreparationAttempts).where(eq(creativeWorkPreparationAttempts.id, original));
   expect(origin.guidanceApplications![0].appliedRefs).toHaveLength(1);
   expect((await confirmSocialPostWork({ ...scope, selectedReferenceIds: [], copy: edited ? { ...copy, cta: "Saiba mais" } : copy })).ok).toBe(true);
   const confirmed = (await getCreativeWork(scope.workspaceId, scope.workItemId))!.work;
   const { outputs } = await createPlannedCreativeWorkOutputs(scope.workspaceId, scope.workItemId, [{ creativeLevel: "balanced", targetFormat: "4:5", versionNumber: 1 }]);
   expect(confirmed.copyGuidanceExecutionId).toBe(edited ? null : original);
   expect(outputs[0].guidanceApplications).toEqual(edited ? null : origin.guidanceApplications);
   expect(controlled.provider).toHaveBeenCalledTimes(1);
  });
 });
 it.each([false, true])("successful response survives equivalent autosave with/without approved voice (voice=%s)", async voice => {
  await fixture(async (scope, request) => {
   if (!voice) await db.delete(calibrationRules).where(eq(calibrationRules.workspaceId, scope.workspaceId));
   controlled.provider.mockImplementationOnce(async () => {
    const before = (await getCreativeWork(scope.workspaceId, scope.workItemId))!.work;
    const saved = await updateCreativeWorkDraft(scope.workspaceId, scope.workItemId, { request });
    expect(saved!.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    return response;
   });
   expect((await generateSocialPostCopy(scope)).ok).toBe(true);
   expect((await getCreativeWork(scope.workspaceId, scope.workItemId))!.work.copy).toEqual(copy);
   expect((await generateSocialPostCopy(scope)).ok).toBe(true);
   expect(controlled.provider).toHaveBeenCalledTimes(1);
   expect(controlled.spend).toHaveBeenCalledTimes(1);
   const attempts = await db.select().from(creativeWorkPreparationAttempts).where(eq(creativeWorkPreparationAttempts.workItemId, scope.workItemId));
   expect(attempts).toHaveLength(1);
   expect(attempts[0].state).toBe("completed");
   expect(attempts[0].guidanceApplications![0].appliedRefs).toHaveLength(voice ? 1 : 0);
  });
 });
 it.each(["expired", "invalidated"])("does not persist without a valid lease (%s)", async reason => {
  await fixture(async scope => {
   controlled.provider.mockImplementationOnce(async () => {
    await db.update(creativeWorkPreparationAttempts).set(reason === "expired"
     ? { leaseExpiresAt: new Date(0) } : { state: "invalidated" })
     .where(eq(creativeWorkPreparationAttempts.workItemId, scope.workItemId));
    return response;
   });
   expect(await generateSocialPostCopy(scope)).toEqual({ ok: false, error: { code: "provider_unavailable" } });
   const work = (await getCreativeWork(scope.workspaceId, scope.workItemId))!.work;
   expect(work.copy).toBeNull();
   expect(work.copyGuidanceExecutionId).toBeNull();
   const [attempt] = await db.select().from(creativeWorkPreparationAttempts).where(eq(creativeWorkPreparationAttempts.workItemId, scope.workItemId));
   expect(attempt.state).not.toBe("completed");
  });
 });
 it.each([
  { request: "Outro pedido" },
  { brief: { theme: "Outro tema", objective: "Divulgar", audience: "Público interessado", offer: "Encontros em agosto" } },
  { copy: { ...copy, cta: "Texto manual" } },
  { format: "9:16" as const },
 ])("rejects an obsolete response after material edit %j", async patch => {
  await fixture(async scope => {
   controlled.provider.mockImplementationOnce(async () => {
    await updateCreativeWorkDraft(scope.workspaceId, scope.workItemId, patch);
    return response;
   });
   expect(await generateSocialPostCopy(scope)).toEqual({ ok: false, error: { code: "provider_unavailable" } });
   const work = (await getCreativeWork(scope.workspaceId, scope.workItemId))!.work;
   expect(work.copy).toEqual("copy" in patch ? patch.copy : null);
   expect(work.copyGuidanceExecutionId).toBeNull();
  });
 });
 it("does not persist when its lease expires while waiting for the work row", async () => {
  await fixture(async scope => {
   const work = (await getCreativeWork(scope.workspaceId, scope.workItemId))!.work;
   const inputRevision = independentCopyInputRevision(work);
   const claimed = await claimPreparationAttempt({ ...scope, kind: "creative_prepare", inputRevision, inputFingerprint: independentCopyFingerprint(scope.workItemId), leaseSeconds: 180 });
   expect(claimed.outcome).toBe("claimed");
   if (claimed.outcome !== "claimed") throw new Error("claim failed");
   await db.update(creativeWorkPreparationAttempts).set({ leaseExpiresAt: sql`clock_timestamp() + interval '600 milliseconds'` }).where(eq(creativeWorkPreparationAttempts.id, claimed.attempt.id));
   let locked!: () => void, release!: () => void;
   const held = new Promise<void>(resolve => { locked = resolve; });
   const free = new Promise<void>(resolve => { release = resolve; });
   const lock = db.transaction(async tx => {
    await tx.select().from(creativeWorkItems).where(eq(creativeWorkItems.id, scope.workItemId)).for("update"); locked(); await free;
   });
   await held;
   const pending = persistIndependentCopy({ ...scope, attemptId: claimed.attempt.id, inputRevision, executionId: claimed.attempt.id, copy });
   await new Promise(resolve => setTimeout(resolve, 1000));
   const expiry = await db.execute(sql`select clock_timestamp() > lease_expires_at as expired from adscale_app.creative_work_preparation_attempts where id = ${claimed.attempt.id}::uuid`);
   release(); await lock;
   const saved = await pending;
   expect(expiry.rows[0].expired).toBe(true);
   expect(saved).toBeNull();
   expect((await getCreativeWork(scope.workspaceId, scope.workItemId))!.work.copy).toBeNull();
  });
 });
 it("application command cannot accept a copy whose lease expired behind the work lock", async () => {
  await fixture(async scope => {
   let locked!: () => void, release!: () => void;
   const held = new Promise<void>(resolve => { locked = resolve; });
   const free = new Promise<void>(resolve => { release = resolve; });
   let lock!: Promise<unknown>;
   controlled.provider.mockImplementationOnce(async () => {
    await db.update(creativeWorkPreparationAttempts).set({ leaseExpiresAt: sql`clock_timestamp() + interval '600 milliseconds'` }).where(eq(creativeWorkPreparationAttempts.workItemId, scope.workItemId));
    lock = db.transaction(async tx => {
     await tx.select().from(creativeWorkItems).where(eq(creativeWorkItems.id, scope.workItemId)).for("update"); locked(); await free;
    });
    await held;
    return response;
   });
   const pending = generateSocialPostCopy(scope);
   await held;
   await new Promise(resolve => setTimeout(resolve, 1000));
   const expiry = await db.execute(sql`select clock_timestamp() > lease_expires_at as expired from adscale_app.creative_work_preparation_attempts where work_item_id = ${scope.workItemId}::uuid`);
   release(); await lock;
   const result = await pending;
   const saved = (await getCreativeWork(scope.workspaceId, scope.workItemId))!.work;
   const [attempt] = await db.select().from(creativeWorkPreparationAttempts).where(eq(creativeWorkPreparationAttempts.workItemId, scope.workItemId));
   expect(expiry.rows[0].expired).toBe(true);
   expect(result).toEqual({ ok: false, error: { code: "provider_unavailable" } });
   expect(saved.copy).toBeNull();
   expect(attempt.state).not.toBe("completed");
  });
 });
});
