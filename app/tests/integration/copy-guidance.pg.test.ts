import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const controlled = vi.hoisted(() => ({ provider: vi.fn(), spend: vi.fn() }));
vi.mock("@/server/ai/utils", () => ({ getOpenAI: () => ({ chat: { completions: { create: controlled.provider } } }) }));
vi.mock("@/server/billing/paywall", () => ({ spend: controlled.spend }));
import { db } from "@/server/db";
import { calibrationRules, clientProfiles, creativeWorkItems, creativeWorkPreparationAttempts, user, workspaces } from "@/server/db/schema";
import { hashGuidanceContent } from "@/server/brand-taste/learned-guidance";
import { runWriting } from "@/server/equipe/agents/writing";
import { createPlannedCreativeWorkOutputs, createCreativeWorkRevision, getCreativeWork, updateCreativeWorkDraft } from "@/server/repositories/creative-work";
import { freezeIndependentCopyGuidance } from "@/server/repositories/copy-guidance";
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
