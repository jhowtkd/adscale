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
import { prepareCarouselWork } from "./prepare-carousel-work";
import { materializeCarouselSlides } from "../repositories/creative-work-carousel";
import { creativeWorkCarouselSlides } from "../db/schema";
import { generateCarouselWork } from "./generate-carousel-work";
import { reviseCarouselDeck, reviseCarouselSlide } from "./revise-carousel";

const auth = vi.hoisted(() => ({ workspaceId: "", userId: "" }));
vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess: async () => ({ workspace: { id: auth.workspaceId }, user: { id: auth.userId } }) }));
vi.mock("@/server/billing/paywall", () => ({ refuseOnFreePlan: async () => null, checkSpend: async () => ({ allowed: true }) }));
vi.mock("@/server/generation/settlement", () => ({ startGenerationSettlement: async () => ({ ok: false, error: { code: "dispatch_failed" } }) }));
vi.mock("@/server/application/advance-carousel-generation", () => ({ dispatchNextCarouselStage: async () => ({ ok: false, error: { code: "dispatch_failed" } }) }));
vi.mock("@/server/storage", () => ({ objectStorage: { get: async () => Buffer.from("simulated-base"), put: async () => undefined } }));
vi.mock("@/server/creative-work/text-composite", () => ({ runCarouselTextComposition: async () => ({ buffer: Buffer.from("simulated-composition") }), TextCompositionError: class extends Error {} }));
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
        expect(frozen.selections.carousel_editorial.appliedRefs).toEqual([{ ruleId: f.old.id, revision: 1, contentHash: hashGuidanceContent(f.old.rationale) }]);
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

  it("keeps a failed revise_script child through identical autosave and approval changes, but starts a new child after completion", async () => {
    const f = await fixture();
    try {
      provider.research.mockResolvedValue({ output_text: JSON.stringify(research), output: [] });
      provider.chat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ hooks, recommendedHookId: "hook-1", recommendation: "Abre com a data." }) } }] });
      expect((await f.run()).ok).toBe(true);
      provider.chat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(script(hooks[0].headline)) } }] });
      expect((await f.run({ kind: "select_hook", hookId: "hook-1" })).ok).toBe(true);
      const rootId = (await f.current()).settings.carouselEditorial!.guidanceCycleId!;
      const command = { kind: "revise_script" as const, instruction: "Melhorar o ritmo." };
      provider.chat.mockRejectedValueOnce(new Error("simulated revision failure"));
      expect((await f.run(command)).ok).toBe(false);
      const failed = await f.current();
      const childId = failed.settings.carouselEditorial!.guidanceCycleId!;
      expect(childId).not.toBe(rootId);
      const child = await getCarouselGuidanceCycle({ workspaceId: f.workspaceId, workItemId: failed.id, cycleId: childId });
      const saved = await autosaveCreativeWorkDraft({ workspaceId: f.workspaceId, workItemId: failed.id,
        expectedUpdatedAt: failed.updatedAt, request: failed.request, intent: "carousel", format: failed.format, settings: failed.settings });
      expect(saved.error).toBeNull();
      expect(saved.work!.updatedAt.toISOString()).not.toBe(failed.updatedAt.toISOString());
      await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, f.old.id));
      const next = await f.addRule("Voz nova depois da falha, não aplicar no retry.");
      const repeated = { ...script(hooks[0].headline), slides: script(hooks[0].headline).slides.map((slide, i) => ({
        ...slide, slideId: failed.settings.carouselDraft!.plan!.slides[i].slideId,
      })) };
      const repeatedResponse = { choices: [{ message: { content: JSON.stringify(repeated) } }] };
      provider.chat.mockResolvedValueOnce(repeatedResponse);
      expect((await f.run(command)).ok).toBe(true);
      expect((await f.current()).settings.carouselEditorial!.guidanceCycleId).toBe(childId);
      expect(JSON.stringify(provider.chat.mock.calls[3][0])).toBe(JSON.stringify(provider.chat.mock.calls[2][0]));
      const calls = await listComposerGuidanceApplications({ workspaceId: f.workspaceId, workItemId: failed.id });
      for (const call of calls.filter(c => c.guidanceCycleId === childId)) expect(call).toMatchObject({
        appliedRefs: child!.selections.carousel_editorial.appliedRefs, setHash: child!.selections.carousel_editorial.setHash,
        fixedPromptVersion: child!.editorial.fixedPromptVersion });
      provider.chat.mockResolvedValueOnce(repeatedResponse);
      expect((await f.run(command)).ok).toBe(true);
      const deliberateId = (await f.current()).settings.carouselEditorial!.guidanceCycleId!;
      expect(deliberateId).not.toBe(childId);
      const deliberate = await getCarouselGuidanceCycle({ workspaceId: f.workspaceId, workItemId: failed.id, cycleId: deliberateId });
      expect(deliberate?.parentCycleId).toBe(childId);
      expect(deliberate?.requestKey).toBe(child?.requestKey);
      expect(provider.chat.mock.calls[4][0].messages[0].content).toContain(next.rationale);
      provider.chat.mockRejectedValueOnce(new Error("second operation failure"));
      expect((await f.run(command)).ok).toBe(false);
      const secondFailed = await f.current();
      const secondId = secondFailed.settings.carouselEditorial!.guidanceCycleId!;
      expect(secondId).not.toBe(deliberateId);
      const second = await getCarouselGuidanceCycle({ workspaceId: f.workspaceId, workItemId: secondFailed.id, cycleId: secondId });
      expect(second?.requestKey).toBe(deliberate?.requestKey);
      expect((await autosaveCreativeWorkDraft({ workspaceId: f.workspaceId, workItemId: secondFailed.id,
        expectedUpdatedAt: secondFailed.updatedAt, request: secondFailed.request, intent: "carousel",
        format: secondFailed.format, settings: secondFailed.settings })).error).toBeNull();
      provider.chat.mockResolvedValueOnce(repeatedResponse);
      expect((await f.run(command)).ok).toBe(true);
      expect((await f.current()).settings.carouselEditorial!.guidanceCycleId).toBe(secondId);
      expect(JSON.stringify(provider.chat.mock.calls[6][0])).toBe(JSON.stringify(provider.chat.mock.calls[5][0]));
    } finally { provider.chat.mockReset(); provider.research.mockReset(); await cleanup(f); }
  });

  it.each(["propose_hooks", "select_hook", "revise_script"] as const)("keeps cycle, key, selection, version and bytes on %s retry after identical autosave", async (kind) => {
    const f = await fixture();
    try {
      provider.research.mockResolvedValue({ output_text: JSON.stringify(research), output: [] });
      const hookResponse = { choices: [{ message: { content: JSON.stringify({ hooks, recommendedHookId: "hook-1", recommendation: "Abre com a data." }) } }] };
      const scriptResponse = { choices: [{ message: { content: JSON.stringify(script(hooks[0].headline)) } }] };
      if (kind !== "propose_hooks") {
        provider.chat.mockResolvedValueOnce(hookResponse);
        expect((await f.run()).ok).toBe(true);
      }
      if (kind === "revise_script") {
        provider.chat.mockResolvedValueOnce(scriptResponse);
        expect((await f.run({ kind: "select_hook", hookId: "hook-1" })).ok).toBe(true);
      }
      const command = kind === "propose_hooks" ? { kind } : kind === "select_hook"
        ? { kind, hookId: "hook-1", headline: hooks[0].headline } : { kind, instruction: "Melhorar o ritmo." };
      const failedCallIndex = provider.chat.mock.calls.length;
      provider.chat.mockRejectedValueOnce(new Error("simulated provider failure"));
      expect((await f.run(command)).ok).toBe(false);
      const failed = await f.current();
      const cycleId = failed.settings.carouselEditorial!.guidanceCycleId!;
      const original = await getCarouselGuidanceCycle({ workspaceId: f.workspaceId, workItemId: failed.id, cycleId });
      const originalAttempt = (await f.attempts()).filter(a => a.state === "failed").at(-1)!;
      const saved = await autosaveCreativeWorkDraft({ workspaceId: f.workspaceId, workItemId: failed.id,
        expectedUpdatedAt: failed.updatedAt, request: failed.request, intent: "carousel", format: failed.format, settings: failed.settings });
      expect(saved.error).toBeNull();
      expect(saved.work!.updatedAt.toISOString()).not.toBe(failed.updatedAt.toISOString());
      await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, f.old.id));
      const next = await f.addRule("Nova aprovação, somente para a próxima operação deliberada.");
      provider.chat.mockResolvedValueOnce(kind === "propose_hooks" ? hookResponse : scriptResponse);
      expect((await f.run(command)).ok).toBe(true);
      expect((await f.current()).settings.carouselEditorial!.guidanceCycleId).toBe(cycleId);
      expect(await getCarouselGuidanceCycle({ workspaceId: f.workspaceId, workItemId: failed.id, cycleId })).toEqual(original);
      const completed = (await f.attempts()).find(a => a.state === "completed" && a.id !== originalAttempt.id && a.inputFingerprint === originalAttempt.inputFingerprint);
      expect(completed).toBeDefined();
      expect(JSON.stringify(provider.chat.mock.calls[failedCallIndex + 1][0])).toBe(JSON.stringify(provider.chat.mock.calls[failedCallIndex][0]));
      expect(provider.chat.mock.calls[failedCallIndex + 1][0].messages[0].content).not.toContain(next.rationale);
      const calls = await listComposerGuidanceApplications({ workspaceId: f.workspaceId, workItemId: failed.id });
      const consumer = kind === "propose_hooks" ? "carousel_hooks" : "carousel_plan";
      const actual = calls.filter(c => c.consumer === consumer && [originalAttempt.id, completed!.id].includes(c.executionId));
      expect(actual).toHaveLength(2);
      for (const call of actual) expect(call).toMatchObject({ guidanceCycleId: cycleId,
        appliedRefs: original!.selections.carousel_editorial.appliedRefs, setHash: original!.selections.carousel_editorial.setHash,
        fixedPromptVersion: original!.editorial.fixedPromptVersion });
    } finally { provider.chat.mockReset(); provider.research.mockReset(); await cleanup(f); }
  });

  it("approve_script, prepare and approve_cover preserve the frozen cycle without resolving or calling providers", async () => {
    const f = await fixture();
    try {
      provider.research.mockResolvedValueOnce({ output_text: JSON.stringify(research), output: [] });
      provider.chat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ hooks, recommendedHookId: "hook-1", recommendation: "Abre com a data." }) } }] });
      expect((await f.run()).ok).toBe(true);
      provider.chat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(script(hooks[0].headline)) } }] });
      expect((await f.run({ kind: "select_hook", hookId: "hook-1" })).ok).toBe(true);
      const work = await f.current();
      const cycleId = work.settings.carouselEditorial!.guidanceCycleId!;
      const frozen = await getCarouselGuidanceCycle({ workspaceId: f.workspaceId, workItemId: work.id, cycleId });
      provider.chat.mockRejectedValue(new Error("approval must not call provider"));
      provider.research.mockRejectedValue(new Error("approval must not call research"));
      await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, f.old.id));
      await f.addRule("Aprovação nova não altera aprovações nem preparação do ciclo.");
      expect((await f.run({ kind: "approve_script", scriptRevision: work.settings.carouselEditorial!.revision })).ok).toBe(true);
      const prepared = await prepareCarouselWork({ workspaceId: f.workspaceId, workItemId: work.id });
      expect(prepared.ok).toBe(true);
      if (!prepared.ok) throw new Error(JSON.stringify(prepared.error));
      expect(prepared.value.work.inputSnapshot!.settings.carouselEditorial?.guidanceCycleId).toBe(cycleId);
      const slides = await materializeCarouselSlides({ workspaceId: f.workspaceId, workItemId: work.id,
        deck: prepared.value.deck, visualContractHash: prepared.value.visualContract.contractHash });
      const cover = slides.find(s => s.position === 1)!;
      await db.update(creativeWorkCarouselSlides).set({ status: "completed", outputKey: "simulated-cover", quality: { objectivePassed: true } }).where(eq(creativeWorkCarouselSlides.id, cover.id));
      const command = { kind: "approve_cover" as const, slideId: cover.id, preparedRevision: prepared.value.preparedRevision };
      expect((await f.run(command)).ok).toBe(true);
      expect((await f.run(command)).ok).toBe(true);
      expect((await f.current()).settings.carouselEditorial!.guidanceCycleId).toBe(cycleId);
      expect(await getCarouselGuidanceCycle({ workspaceId: f.workspaceId, workItemId: work.id, cycleId })).toEqual(frozen);
      expect((await f.attempts()).filter(a => a.frozenCarouselGuidance)).toHaveLength(1);
      expect(provider.chat).toHaveBeenCalledTimes(2);
      expect(provider.research).toHaveBeenCalledTimes(1);
    } finally { provider.chat.mockReset(); provider.research.mockReset(); await cleanup(f); }
  });

  it.each(["propose_hooks", "select_hook", "revise_script"] as const)("starts an eligible child before providers on %s after format changes from 4:5 to 9:16", async (kind) => {
    const f = await fixture();
    try {
      provider.research.mockResolvedValueOnce({ output_text: JSON.stringify(research), output: [] });
      provider.chat.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ hooks, recommendedHookId: "hook-1", recommendation: "Abre com a data." }) } }] });
      expect((await f.run()).ok).toBe(true);
      if (kind === "revise_script") {
        provider.chat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(script(hooks[0].headline)) } }] });
        expect((await f.run({ kind: "select_hook", hookId: "hook-1" })).ok).toBe(true);
      }
      const original = await f.current();
      const rootId = original.settings.carouselEditorial!.guidanceCycleId!;
      const next = await f.addRule("Voz exclusiva do formato 9:16.");
      await db.update(calibrationRules).set({ confirmedMetadata: { ...next.confirmedMetadata!, formats: ["9:16"] } }).where(eq(calibrationRules.id, next.id));
      const saved = await autosaveCreativeWorkDraft({ workspaceId: f.workspaceId, workItemId: original.id,
        expectedUpdatedAt: original.updatedAt, request: original.request, intent: "carousel", format: "9:16", settings: original.settings });
      expect(saved.error).toBeNull();
      let beforeResearch: Awaited<ReturnType<typeof getCarouselGuidanceCycle>> = null;
      const captureCycle = async () => {
        const work = await f.current();
        beforeResearch = await getCarouselGuidanceCycle({ workspaceId: f.workspaceId, workItemId: work.id,
          cycleId: work.settings.carouselEditorial!.guidanceCycleId! });
      };
      if (kind === "propose_hooks") {
        provider.research.mockImplementationOnce(async () => { await captureCycle(); return { output_text: JSON.stringify(research), output: [] }; });
        provider.chat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ hooks, recommendedHookId: "hook-1", recommendation: "Abre com a data." }) } }] });
      } else {
        provider.chat.mockImplementationOnce(async () => { await captureCycle(); return { choices: [{ message: { content: JSON.stringify(script(hooks[0].headline)) } }] }; });
      }
      const command = kind === "propose_hooks" ? { kind } : kind === "select_hook" ? { kind, hookId: "hook-1" } : { kind, instruction: "Melhorar o ritmo." };
      const callIndex = provider.chat.mock.calls.length;
      expect((await f.run(command)).ok).toBe(true);
      const updated = await f.current();
      const childId = updated.settings.carouselEditorial!.guidanceCycleId!;
      const child = await getCarouselGuidanceCycle({ workspaceId: f.workspaceId, workItemId: updated.id, cycleId: childId });
      expect(updated.format).toBe("9:16");
      expect(childId).not.toBe(rootId);
      expect(child).toMatchObject({ format: "9:16", parentCycleId: rootId });
      expect(beforeResearch).toEqual(child);
      // Confirming the 9:16 scope recorded revision 2; the unpinned selection follows it.
      const refs = [{ ruleId: next.id, revision: 2, contentHash: hashGuidanceContent(next.rationale) }];
      expect(child?.selections.carousel_editorial.appliedRefs).toEqual(refs);
      expect(child?.selections.carousel_editorial.omissions).toContainEqual({ ruleId: f.old.id, reason: "scope_mismatch" });
      const sent = provider.chat.mock.calls[callIndex][0].messages[0].content;
      expect(sent).not.toContain(f.old.rationale);
      expect(sent).toContain(next.rationale);
      const calls = await listComposerGuidanceApplications({ workspaceId: f.workspaceId, workItemId: updated.id });
      expect(calls.find(c => c.guidanceCycleId === childId && c.consumer === (kind === "propose_hooks" ? "carousel_hooks" : "carousel_plan"))).toMatchObject({
        appliedRefs: refs, setHash: hashGuidanceSet(refs), fixedPromptVersion: child?.editorial.fixedPromptVersion });
    } finally { provider.chat.mockReset(); provider.research.mockReset(); await cleanup(f); }
  });

  it("generation cover/interiors, copy/visual/retry and deck revisions carry the cycle; completed work refuses autosave", async () => {
    const f = await fixture();
    try {
      provider.research.mockResolvedValueOnce({ output_text: JSON.stringify(research), output: [] });
      provider.chat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ hooks, recommendedHookId: "hook-1", recommendation: "Abre com a data." }) } }] });
      expect((await f.run()).ok).toBe(true);
      provider.chat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(script(hooks[0].headline)) } }] });
      expect((await f.run({ kind: "select_hook", hookId: "hook-1" })).ok).toBe(true);
      const work = await f.current(), cycleId = work.settings.carouselEditorial!.guidanceCycleId!;
      const frozen = await getCarouselGuidanceCycle({ workspaceId: f.workspaceId, workItemId: work.id, cycleId });
      expect((await f.run({ kind: "approve_script", scriptRevision: work.settings.carouselEditorial!.revision })).ok).toBe(true);
      const prepared = await prepareCarouselWork({ workspaceId: f.workspaceId, workItemId: work.id });
      if (!prepared.ok) throw new Error(JSON.stringify(prepared.error));
      const scope = { workspaceId: f.workspaceId, workItemId: work.id, userId: f.reviewer };
      expect(await generateCarouselWork({ ...scope, preparedRevision: prepared.value.preparedRevision })).toMatchObject({ ok: false, error: { code: "dispatch_failed" } });
      const slides = await materializeCarouselSlides({ ...scope, deck: prepared.value.deck, visualContractHash: prepared.value.visualContract.contractHash });
      const cover = slides.find(s => s.position === 1)!;
      await db.update(creativeWorkCarouselSlides).set({ status: "completed", providerBaseKey: "simulated-base", outputKey: "simulated-cover" }).where(eq(creativeWorkCarouselSlides.id, cover.id));
      expect((await f.run({ kind: "approve_cover", slideId: cover.id, preparedRevision: prepared.value.preparedRevision })).ok).toBe(true);
      const interiors = await prepareCarouselWork(scope);
      if (!interiors.ok) throw new Error(JSON.stringify(interiors.error));
      expect(await generateCarouselWork({ ...scope, preparedRevision: interiors.value.preparedRevision })).toMatchObject({ ok: false, error: { code: "dispatch_failed" } });
      await db.update(creativeWorkCarouselSlides).set({ status: "completed", providerBaseKey: "simulated-base", outputKey: "simulated-output" }).where(eq(creativeWorkCarouselSlides.workItemId, work.id));
      await db.update(creativeWorkItems).set({ status: "completed" }).where(eq(creativeWorkItems.id, work.id));
      const copy = await reviseCarouselSlide({ ...scope, slideId: cover.id, expectedVersion: 1, revisionKey: randomUUID(), kind: "copy", primaryText: cover.primaryText, secondaryText: null });
      expect(copy.ok).toBe(true);
      if (!copy.ok) throw new Error(JSON.stringify(copy.error));
      const visualKey = randomUUID();
      expect(await reviseCarouselSlide({ ...scope, slideId: copy.value.slide.id, expectedVersion: copy.value.slide.versionNumber, revisionKey: visualKey, kind: "visual", instruction: "Aumentar o contraste." })).toMatchObject({ ok: false, error: { code: "dispatch_failed" } });
      const [visual] = await db.select().from(creativeWorkCarouselSlides).where(eq(creativeWorkCarouselSlides.generationOperationKey, visualKey));
      await db.update(creativeWorkCarouselSlides).set({ status: "failed" }).where(eq(creativeWorkCarouselSlides.id, visual.id));
      const retryKey = randomUUID();
      expect(await reviseCarouselSlide({ ...scope, slideId: visual.id, expectedVersion: visual.versionNumber, revisionKey: retryKey, kind: "retry" })).toMatchObject({ ok: false, error: { code: "dispatch_failed" } });
      const [retry] = await db.select().from(creativeWorkCarouselSlides).where(eq(creativeWorkCarouselSlides.generationOperationKey, retryKey));
      expect((await reviseCarouselSlide({ ...scope, slideId: retry.id, expectedVersion: retry.versionNumber, revisionKey: retryKey, kind: "retry" })).ok).toBe(true);
      for (const direction of [null, "Aumentar o contraste."]) {
        const key = randomUUID();
        const deck = await reviseCarouselDeck({ ...scope, expectedRevision: interiors.value.deck.revision, revisionKey: key, plan: interiors.value.deck, globalVisualInstruction: direction });
        expect(deck.ok || deck.error.code === "dispatch_failed").toBe(true);
        if (deck.ok) interiors.value.deck = { ...interiors.value.deck, revision: deck.value.deckRevision };
      }
      const current = await f.current();
      expect((await autosaveCreativeWorkDraft({ workspaceId: f.workspaceId, workItemId: work.id, expectedUpdatedAt: current.updatedAt,
        request: current.request, intent: "carousel", format: current.format, settings: current.settings })).error).toBe("not_draft");
      expect(current.settings.carouselEditorial!.guidanceCycleId).toBe(cycleId);
      expect(current.inputSnapshot!.settings.carouselEditorial?.guidanceCycleId).toBe(cycleId);
      expect(await getCarouselGuidanceCycle({ workspaceId: f.workspaceId, workItemId: work.id, cycleId })).toEqual(frozen);
      expect((await f.attempts()).filter(a => a.frozenCarouselGuidance)).toHaveLength(1);
      expect(provider.chat).toHaveBeenCalledTimes(2);
      expect(provider.research).toHaveBeenCalledTimes(1);
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
