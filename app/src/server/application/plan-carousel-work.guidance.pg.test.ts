import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { calibrationRules, clientProfiles, creativeWorkItems, creativeWorkPreparationAttempts, user, workspaces } from "@/server/db/schema";
import { resolveEquipeTestDatabaseUrl } from "../equipe/data/test-database";
import { hashGuidanceContent, hashGuidanceSet } from "../brand-taste/learned-guidance";
import { planCarouselWork } from "./plan-carousel-work";
import { listComposerGuidanceApplications } from "../repositories/composer-guidance-application";
import { getCarouselGuidanceCycle } from "../repositories/carousel-guidance-cycle";
import { autosaveCreativeWorkDraft } from "../repositories/creative-work";

const auth = vi.hoisted(() => ({ workspaceId: "", userId: "" }));
vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess: async () => ({ workspace: { id: auth.workspaceId }, user: { id: auth.userId } }) }));
vi.mock("@/server/billing/paywall", () => ({ refuseOnFreePlan: async () => null }));
vi.mock("@/server/jobs/client", () => ({ inngest: { send: vi.fn().mockRejectedValue(new Error("unexpected job dispatch")) } }));
const provider = vi.hoisted(() => ({ research: vi.fn(), chat: vi.fn() }));
vi.mock("@/server/ai/utils", () => ({ getOpenAI: () => ({ responses: { create: provider.research }, chat: { completions: { create: provider.chat } } }), extractOutputText: (response: { output_text?: string }) => response.output_text }));
vi.mock("@/server/ai/providers/e2e-controlled-provider", () => ({ isE2EControlledProviderEnabled: () => false }));

const testUrl = resolveEquipeTestDatabaseUrl();
if (testUrl && (!["localhost", "127.0.0.1"].includes(new URL(testUrl).hostname) || process.env.DATABASE_URL !== testUrl)) throw new Error("carousel_guidance_requires_matching_local_test_database");
const REQUEST = "Grupo de terapia começa em agosto, vagas limitadas no consultório";
const hooks = [
  { id: "hook-1", headline: "Grupo de terapia em agosto", promise: "O grupo começa em agosto", narrative: "Abre com a data." },
  { id: "hook-2", headline: "Vagas limitadas no consultório", promise: "As vagas são limitadas", narrative: "Parte das vagas." },
  { id: "hook-3", headline: "Cuidado em grupo no consultório", promise: "O grupo acontece no consultório", narrative: "Começa pelo cuidado." },
];
const research = { status: "not_needed", question: "O grupo começa em agosto?", thesis: REQUEST, sources: [], claims: [], gaps: [] };
const script = (headline: string) => ({ kind: "deck", objective: "Divulgar o grupo de terapia", audience: null, tone: null,
  promise: "O grupo começa em agosto", changes: [], caption: "Inscreva-se", slides: [
    ["hook", headline], ["context", "O grupo acontece no consultório"], ["argument", "As vagas são limitadas"],
    ["evidence", "O consultório organiza o grupo de terapia"], ["closing", "Comece em agosto"],
  ].map(([role, primaryText]) => ({ role, primaryText, purpose: "Avançar no argumento", secondaryText: null, sourceFactIds: [], slideId: null })),
  storyboard: Array.from({ length: 5 }, () => ({ learning: "O leitor entende a oferta", representation: "Tipografia com o fato principal", hierarchy: "Título, apoio, marca", transition: "Segue para o próximo argumento", claimIds: [] })),
});

async function fixture() {
  const workspaceId = randomUUID(), reviewer = randomUUID();
  await db.insert(user).values({ id: reviewer, name: "Simulado", email: `${reviewer}@example.test` });
  await db.insert(workspaces).values({ id: workspaceId, name: "Simulado", slug: workspaceId });
  const [brand, other] = await db.insert(clientProfiles).values([{ workspaceId, name: "Marca" }, { workspaceId, name: "Outra" }]).returning();
  const [work] = await db.insert(creativeWorkItems).values({ workspaceId, clientProfileId: brand.id, createdByUserId: reviewer,
    title: "Simulado", request: REQUEST, toolKind: "carousel", format: "4:5", settings: { targetFormats: [] } }).returning();
  const addRule = async (text: string, profileId = brand.id, nature: "text" | "visual" = "text") => {
    const [rule] = await db.insert(calibrationRules).values({ workspaceId, clientProfileId: profileId, category: nature === "visual" ? "figure" : "voice", status: "approved", rationale: text,
      confirmedMetadata: { category: nature === "visual" ? "figure" : "voice", nature, roles: [nature === "visual" ? "image_prompt" : "carousel_editorial"], generationModes: ["carousel"], formats: ["4:5"], contentHash: hashGuidanceContent(text) }, metadataConfirmedBy: reviewer, metadataConfirmedAt: new Date() }).returning();
    return rule;
  };
  const old = await addRule("Use voz acolhedora e um convite concreto.");
  await addRule("Marca estrangeira, nunca entregar.", other.id);
  const visual = await addRule("Orientação visual sem prova.", brand.id, "visual");
  const current = async () => (await db.select().from(creativeWorkItems).where(eq(creativeWorkItems.id, work.id)))[0];
  const run = async (command?: Parameters<typeof planCarouselWork>[0]["command"]) => planCarouselWork({ workspaceId, workItemId: work.id,
    expectedUpdatedAt: (await current()).updatedAt.toISOString(), answers: {}, command });
  const attempts = () => db.select().from(creativeWorkPreparationAttempts).where(and(eq(creativeWorkPreparationAttempts.workspaceId, workspaceId), eq(creativeWorkPreparationAttempts.workItemId, work.id)));
  return { workspaceId, reviewer, brand, work, old, visual, addRule, current, run, attempts };
}
async function cleanup(f: Awaited<ReturnType<typeof fixture>>) {
  await db.delete(workspaces).where(eq(workspaces.id, f.workspaceId));
  await db.delete(user).where(eq(user.id, f.reviewer));
}

describe.skipIf(!testUrl)("Frozen carousel editorial cycle (Postgres)", () => {
  it("freezes both roles before research, carries the old selection through hook/script, and starts a child on deliberate revision", async () => {
    const f = await fixture();
    try {
      provider.research.mockImplementationOnce(async request => {
        const frozen = (await f.attempts()).find(a => a.frozenCarouselGuidance)!.frozenCarouselGuidance!;
        expect((await f.current()).settings.carouselEditorial?.guidanceCycleId).toBe(frozen.cycleId);
        expect(frozen.selections.carousel_editorial.appliedRefs).toEqual([{ ruleId: f.old.id, revision: "legacy", contentHash: hashGuidanceContent(f.old.rationale) }]);
        expect(frozen.selections.image_prompt.omissions).toContainEqual({ ruleId: f.visual.id, reason: "visual_proof_missing" });
        expect(JSON.stringify(request)).not.toContain(f.old.rationale);
        expect(JSON.stringify(request)).not.toContain("PREFERÊNCIAS APRENDIDAS");
        await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, f.old.id));
        await f.addRule("Voz aprovada posteriormente, para o ciclo novo.");
        return { output_text: JSON.stringify(research), output: [] };
      });
      provider.chat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ hooks, recommendedHookId: "hook-1", recommendation: "Abre com a data." }) } }] });
      const hookResult = await f.run();
      expect(hookResult.ok).toBe(true);
      expect(hookResult.ok && hookResult.value.editorial.hooks).toHaveLength(3);
      const rootId = (await f.current()).settings.carouselEditorial!.guidanceCycleId!;
      const root = await getCarouselGuidanceCycle({ workspaceId: f.workspaceId, workItemId: f.work.id, cycleId: rootId });
      expect(await getCarouselGuidanceCycle({ workspaceId: randomUUID(), workItemId: f.work.id, cycleId: rootId })).toBeNull();
      const humanHeadline = "Grupo de terapia começa em agosto";
      provider.chat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(script(humanHeadline)) } }] });
      const scriptResult = await f.run({ kind: "select_hook", hookId: "hook-1", headline: humanHeadline });
      expect(scriptResult.ok).toBe(true);
      expect((await f.current()).settings.carouselEditorial!.guidanceCycleId).toBe(rootId);
      for (const [request] of provider.chat.mock.calls) {
        expect(request.messages[0].content).toContain(f.old.rationale);
        expect(request.messages[0].content).not.toContain("Voz aprovada posteriormente");
        expect(request.messages[0].content).not.toContain("Marca estrangeira");
      }
      expect(scriptResult.ok && scriptResult.value.draft.plan!.slides[0]!.primaryText).toBe(humanHeadline);
      provider.chat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(script(humanHeadline)) } }] });
      expect((await f.run({ kind: "revise_script", instruction: "Melhorar o ritmo." })).ok).toBe(true);
      const childId = (await f.current()).settings.carouselEditorial!.guidanceCycleId!;
      expect(childId).not.toBe(rootId);
      const child = await getCarouselGuidanceCycle({ workspaceId: f.workspaceId, workItemId: f.work.id, cycleId: childId });
      expect(child?.parentCycleId).toBe(rootId);
      expect(child?.selections.carousel_editorial.setHash).not.toBe(root?.selections.carousel_editorial.setHash);
      expect(provider.chat.mock.calls[2][0].messages[0].content).toContain("Voz aprovada posteriormente");
      expect((await f.current()).settings.carouselEditorial!.approvedScriptRevision).toBeNull();
      const calls = await listComposerGuidanceApplications({ workspaceId: f.workspaceId, workItemId: f.work.id });
      expect(calls).toHaveLength(4);
      const researching = calls.find(c => c.consumer === "carousel_research")!;
      expect(researching).toMatchObject({ guidanceCycleId: rootId, appliedRefs: [], setHash: null });
      for (const call of calls.filter(c => c.consumer !== "carousel_research")) {
        const cycle = call.guidanceCycleId === rootId ? root! : child!;
        expect(call).toMatchObject({ appliedRefs: cycle.selections.carousel_editorial.appliedRefs, setHash: cycle.selections.carousel_editorial.setHash, fixedPromptVersion: cycle.editorial.fixedPromptVersion, situation: "applied" });
        expect(call.setHash).toBe(hashGuidanceSet(call.appliedRefs));
      }
      expect(calls.filter(c => c.guidanceCycleId === rootId && c.consumer === "carousel_plan")[0].executionId).not.toBe(rootId);
    } finally { provider.chat.mockReset(); provider.research.mockReset(); await cleanup(f); }
  });

  it("reclaims a failed execution using its original freeze, without resolving approval again", async () => {
    const f = await fixture();
    try {
      provider.research.mockResolvedValue({ output_text: JSON.stringify(research), output: [] });
      provider.chat.mockRejectedValueOnce(new Error("simulated provider failure"));
      expect((await f.run()).ok).toBe(false);
      const original = (await f.attempts()).find(a => a.frozenCarouselGuidance)!.frozenCarouselGuidance!;
      await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, f.old.id));
      await f.addRule("Não reinterpretar o ciclo em voo.");
      provider.chat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ hooks, recommendedHookId: "hook-1", recommendation: "Abre com a data." }) } }] });
      expect((await f.run()).ok).toBe(true);
      expect((await f.current()).settings.carouselEditorial!.guidanceCycleId).toBe(original.cycleId);
      expect((await f.attempts()).filter(a => a.frozenCarouselGuidance)).toHaveLength(1);
      expect(provider.chat.mock.calls[1][0].messages[0].content).toContain(f.old.rationale);
      expect(provider.chat.mock.calls[1][0].messages[0].content).not.toContain("Não reinterpretar");
    } finally { provider.chat.mockReset(); provider.research.mockReset(); await cleanup(f); }
  });

  it("keeps the same cycle and request bytes after hook failure, identical autosave and new approval", async () => {
    const f = await fixture();
    try {
      provider.research.mockResolvedValue({ output_text: JSON.stringify(research), output: [] });
      provider.chat.mockRejectedValueOnce(new Error("simulated hook failure"));
      expect((await f.run()).ok).toBe(false);
      const original = (await f.attempts()).find(a => a.frozenCarouselGuidance)!.frozenCarouselGuidance!;
      const work = await f.current();
      const saved = await autosaveCreativeWorkDraft({ workspaceId: f.workspaceId, workItemId: work.id,
        expectedUpdatedAt: work.updatedAt, request: work.request, intent: "carousel", format: work.format, settings: work.settings });
      expect(saved.work?.updatedAt.toISOString()).not.toBe(work.updatedAt.toISOString());
      await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, f.old.id));
      await f.addRule("Aprovação nova durante retry; não reinterpretar.");
      provider.chat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ hooks, recommendedHookId: "hook-1", recommendation: "Abre com a data." }) } }] });
      expect((await f.run()).ok).toBe(true);
      expect((await f.current()).settings.carouselEditorial!.guidanceCycleId).toBe(original.cycleId);
      expect((await f.attempts()).filter(a => a.frozenCarouselGuidance)).toHaveLength(1);
      expect(JSON.stringify(provider.chat.mock.calls[1][0])).toBe(JSON.stringify(provider.chat.mock.calls[0][0]));
      expect(provider.chat.mock.calls[1][0].messages[0].content).toContain(f.old.rationale);
      const calls = await listComposerGuidanceApplications({ workspaceId: f.workspaceId, workItemId: f.work.id });
      const hookCalls = calls.filter(c => c.consumer === "carousel_hooks");
      expect(hookCalls).toHaveLength(2);
      for (const call of hookCalls) expect(call).toMatchObject({ guidanceCycleId: original.cycleId,
        appliedRefs: original.selections.carousel_editorial.appliedRefs, setHash: original.selections.carousel_editorial.setHash,
        fixedPromptVersion: original.editorial.fixedPromptVersion });
    } finally { provider.chat.mockReset(); provider.research.mockReset(); await cleanup(f); }
  });

  it.each(["repository", "route"])("preserves the server cycle through forged and omitted autosaves via %s", async (entrypoint) => {
    const f = await fixture();
    try {
      provider.research.mockResolvedValue({ output_text: JSON.stringify(research), output: [] });
      provider.chat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ hooks, recommendedHookId: "hook-1", recommendation: "Abre com a data." }) } }] });
      expect((await f.run()).ok).toBe(true);
      const rootId = (await f.current()).settings.carouselEditorial!.guidanceCycleId!;
      for (const incomingId of [randomUUID(), undefined]) {
        const work = await f.current();
        const settings = { ...work.settings, carouselEditorial: { ...work.settings.carouselEditorial!, guidanceCycleId: incomingId } };
        if (entrypoint === "repository") {
          const result = await autosaveCreativeWorkDraft({ workspaceId: f.workspaceId, workItemId: work.id,
            expectedUpdatedAt: work.updatedAt, request: work.request, intent: "carousel", format: work.format, settings });
          expect(result.work?.settings.carouselEditorial?.guidanceCycleId).toBe(rootId);
        } else {
          auth.workspaceId = f.workspaceId; auth.userId = f.reviewer;
          const { PATCH } = await import("@/app/api/creative-work/[id]/route");
          const response = await PATCH(new Request(`http://localhost/api/creative-work/${work.id}`, { method: "PATCH",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "autosave",
              expectedUpdatedAt: work.updatedAt.toISOString(), request: work.request, intent: "carousel", format: work.format, settings }) }),
          { params: Promise.resolve({ id: work.id }) });
          expect(response.status).toBe(200);
        }
        expect((await f.current()).settings.carouselEditorial!.guidanceCycleId).toBe(rootId);
      }
      provider.chat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(script(hooks[0].headline)) } }] });
      expect((await f.run({ kind: "select_hook", hookId: "hook-1" })).ok).toBe(true);
      expect((await f.current()).settings.carouselEditorial!.guidanceCycleId).toBe(rootId);
      expect(provider.chat.mock.calls[1][0].messages[0].content).toContain(f.old.rationale);
    } finally { provider.chat.mockReset(); provider.research.mockReset(); await cleanup(f); }
  });

  it("resumes a persisted research failure in the same cycle even though its draft timestamp advanced", async () => {
    const f = await fixture();
    try {
      provider.research.mockRejectedValueOnce(new Error("simulated research outage"));
      const initialUpdatedAt = (await f.current()).updatedAt.toISOString();
      expect((await f.run()).ok).toBe(false);
      const afterFailure = await f.current();
      expect(afterFailure.updatedAt.toISOString()).not.toBe(initialUpdatedAt);
      const rootId = afterFailure.settings.carouselEditorial!.guidanceCycleId;
      await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, f.old.id));
      await f.addRule("Aprovação entre as tentativas de pesquisa.");
      provider.research.mockResolvedValueOnce({ output_text: JSON.stringify(research), output: [] });
      provider.chat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ hooks, recommendedHookId: "hook-1", recommendation: "Abre com a data." }) } }] });
      expect((await f.run()).ok).toBe(true);
      expect((await f.current()).settings.carouselEditorial!.guidanceCycleId).toBe(rootId);
      expect(provider.chat.mock.calls[0][0].messages[0].content).toContain(f.old.rationale);
      expect(provider.chat.mock.calls[0][0].messages[0].content).not.toContain("Aprovação entre");
    } finally { provider.chat.mockReset(); provider.research.mockReset(); await cleanup(f); }
  });

});
