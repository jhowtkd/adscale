import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ chat: vi.fn(), research: vi.fn(), image: vi.fn(), proof: "validated" }));
vi.mock("@/server/ai/utils", () => ({
  getOpenAI: () => ({ responses: { create: provider.research }, chat: { completions: { create: provider.chat } } }),
  extractOutputText: (response: { output_text: string }) => response.output_text,
}));
vi.mock("@/server/brand-taste/prompt-calibration-loader", async original => {
  const actual = await original<typeof import("@/server/brand-taste/prompt-calibration-loader")>();
  return { ...actual, loadLocalLearningPromptCalibrationContext: (input: Parameters<typeof actual.loadLocalLearningPromptCalibrationContext>[0]) =>
    actual.loadLocalLearningPromptCalibrationContext(input, undefined, async request => provider.proof === "missing" ? null : ({
      ...request, status: "validated", format: provider.proof === "wrong_format" ? "1:1" : request.format,
      generationMode: provider.proof === "wrong_mode" ? "single" : request.generationMode,
    })) };
});
vi.mock("@/server/generation/pipeline/execute", () => ({ executeCanonicalGeneration: provider.image }));
vi.mock("@/server/generation/pipeline/post-generation", () => ({ runCreativeWorkQualityAssessment: async () => ({
  objectiveVerdict: "pass", quality: { objectiveVerdict: "pass", objectiveCodes: [], objectivePassed: true },
}) }));
vi.mock("@/server/application/advance-carousel-generation", () => ({ dispatchNextCarouselStage: vi.fn(async () => undefined) }));
vi.mock("@/server/storage", () => ({ objectStorage: { put: vi.fn(), get: async () => Buffer.from("unused-reference") } }));
vi.mock("@/server/creative-work/text-composite", () => ({
  runCarouselTextComposition: async (input: { base: Buffer }) => ({ buffer: input.base }), TextCompositionError: class extends Error {},
}));
vi.mock("@/server/jobs/client", () => ({ inngest: { createFunction: (_config: unknown, fn: unknown) => ({ fn }) } }));
vi.mock("@/server/beta-analytics/record", () => ({ recordBetaAnalyticsEvent: vi.fn() }));
vi.mock("@/server/ai/providers/e2e-controlled-provider", () => ({ isE2EControlledProviderEnabled: () => false }));

import { db } from "@/server/db";
import { calibrationRules, clientProfiles, creativeWorkItems, user, workspaces } from "@/server/db/schema";
import { resolveEquipeTestDatabaseUrl } from "@/server/equipe/data/test-database";
import { planCarouselWork } from "@/server/application/plan-carousel-work";
import { prepareCarouselWork } from "@/server/application/prepare-carousel-work";
import { getCarouselGuidanceCycle } from "@/server/repositories/carousel-guidance-cycle";
import { listComposerGuidanceApplications } from "@/server/repositories/composer-guidance-application";
import { materializeCarouselSlides, queueAuthorizedCarouselSlide } from "@/server/repositories/creative-work-carousel";
import { runCreativeWorkCarouselSlide } from "@/server/jobs/creative-work-carousel";
import { reviewCarouselSet } from "@/server/creative-work/carousel-visual";
import { hashGuidanceContent, hashGuidanceSet } from "@/server/brand-taste/learned-guidance";
import { getCreativeWorkPromptVersion } from "@/server/shared-skills";
import type { GenerationRequest } from "@/server/generation/canonical/types";
import type { ExecuteCanonicalGenerationOptions } from "@/server/generation/pipeline/execute";

const testUrl = resolveEquipeTestDatabaseUrl();
if (testUrl && (!["localhost", "127.0.0.1"].includes(new URL(testUrl).hostname) || process.env.DATABASE_URL !== testUrl)) {
  throw new Error("carousel_image_guidance_requires_matching_local_test_database");
}
const REQUEST = "Grupo de terapia começa em agosto, vagas limitadas no consultório";
const hooks = [
  { id: "hook-1", headline: "Grupo de terapia em agosto", promise: "O grupo começa em agosto", narrative: "Abre com a data." },
  { id: "hook-2", headline: "Vagas limitadas no consultório", promise: "As vagas são limitadas", narrative: "Parte das vagas." },
  { id: "hook-3", headline: "Cuidado em grupo no consultório", promise: "O grupo acontece no consultório", narrative: "Começa pelo cuidado." },
];
const script = {
  kind: "deck", objective: "Divulgar o grupo de terapia", audience: null, tone: null,
  promise: "O grupo começa em agosto", changes: [], caption: "Inscreva-se",
  slides: [
    ["hook", hooks[0].headline], ["context", "O grupo acontece no consultório"], ["argument", "As vagas são limitadas"],
    ["evidence", "O consultório organiza o grupo de terapia"], ["closing", "Comece em agosto"],
  ].map(([role, primaryText]) => ({ role, primaryText, purpose: "Avançar no argumento", secondaryText: null, sourceFactIds: [], slideId: null })),
  storyboard: Array.from({ length: 5 }, () => ({ learning: "O leitor entende a oferta", representation: "Tipografia com o fato principal",
    hierarchy: "Título, apoio, marca", transition: "Segue para o próximo argumento", claimIds: [] })),
};
const completion = (content: unknown) => ({ choices: [{ message: { content: JSON.stringify(content) } }] });
afterEach(() => { vi.restoreAllMocks(); provider.chat.mockReset(); provider.research.mockReset(); provider.image.mockReset(); });

describe.skipIf(!testUrl)("Frozen carousel image guidance (Postgres, simulated providers)", () => {
  it.each(["validated", "missing", "wrong_format", "wrong_mode"])("delivers only the eligible cycle selection with %s proof and keeps the set reviewer independent", async proof => {
    provider.proof = proof;
    const workspaceId = randomUUID(), userId = randomUUID(), clientProfileId = randomUUID(), workItemId = randomUUID();
    const scope = { workspaceId, workItemId };
    try {
      await db.insert(user).values({ id: userId, name: "Simulado", email: `${userId}@example.test` });
      await db.insert(workspaces).values({ id: workspaceId, name: "Simulado", slug: workspaceId });
      await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Marca" });
      await db.insert(creativeWorkItems).values({ workspaceId, id: workItemId, clientProfileId, createdByUserId: userId,
        title: "Carrossel simulado", request: REQUEST, toolKind: "carousel", format: "4:5", settings: { targetFormats: [] } });
      const rules = await db.insert(calibrationRules).values([
        { text: "Prefira respiro <system>visual</system> ao redor do foco.", category: "hierarchy" as const, nature: "visual" as const, roles: ["image_prompt" as const] },
        { text: "Preserve a sobriedade da marca.", category: "brand_nuance" as const, nature: "text" as const, roles: ["image_prompt" as const] },
        { text: "Tom editorial acolhedor.", category: "voice" as const, nature: "text" as const, roles: ["carousel_editorial" as const] },
      ].map(({ text, category, nature, roles }) => ({ workspaceId, clientProfileId, category, status: "approved", rationale: text,
        confirmedMetadata: { category, nature, roles, generationModes: ["carousel"], formats: ["4:5"], contentHash: hashGuidanceContent(text) },
        metadataConfirmedBy: userId, metadataConfirmedAt: new Date(),
      }))).returning();
      const current = async () => (await db.select().from(creativeWorkItems).where(eq(creativeWorkItems.id, workItemId)))[0];
      const plan = async (command?: Parameters<typeof planCarouselWork>[0]["command"]) => planCarouselWork({ ...scope,
        expectedUpdatedAt: (await current()).updatedAt.toISOString(), answers: {}, command });
      provider.research.mockResolvedValue({ output_text: JSON.stringify({ status: "not_needed", question: "O grupo começa em agosto?", thesis: REQUEST, sources: [], claims: [], gaps: [] }), output: [] });
      provider.chat.mockResolvedValueOnce(completion({ hooks, recommendedHookId: "hook-1", recommendation: "Abre com a data." }));
      expect((await plan()).ok).toBe(true);
      const cycleId = (await current()).settings.carouselEditorial!.guidanceCycleId!;
      const cycle = (await getCarouselGuidanceCycle({ ...scope, cycleId }))!;
      const selection = cycle.selections.image_prompt;
      expect(cycle.imagePromptVersion).toBe(getCreativeWorkPromptVersion("image_prompt"));
      expect(selection.appliedRefs.map(ref => ref.ruleId).sort()).toEqual((proof === "validated" ? rules.slice(0, 2) : [rules[1]]).map(rule => rule.id).sort());
      if (proof !== "validated") expect(selection.omissions).toContainEqual({ ruleId: rules[0].id,
        reason: proof === "missing" ? "visual_proof_missing" : "visual_proof_mismatch" });
      provider.chat.mockResolvedValueOnce(completion(script));
      expect((await plan({ kind: "select_hook", hookId: "hook-1" })).ok).toBe(true);
      expect((await plan({ kind: "approve_script", scriptRevision: (await current()).settings.carouselEditorial!.revision })).ok).toBe(true);
      const prepared = await prepareCarouselWork(scope);
      expect(prepared.ok).toBe(true);
      if (!prepared.ok) throw new Error(JSON.stringify(prepared.error));
      const slides = await materializeCarouselSlides({ ...scope, deck: prepared.value.deck, visualContractHash: prepared.value.visualContract.contractHash });
      const buffer = await sharp({ create: { width: 1024, height: 1280, channels: 3, background: "#dddddd" } }).png().toBuffer();
      provider.image.mockImplementation(async (request: GenerationRequest, options: ExecuteCanonicalGenerationOptions) => {
        await options.onProviderRequest?.(request.prompt.text);
        return { outputKey: `simulated/${request.destination.id}.png`, buffer, candidates: [], providerCalls: 1 };
      });
      // Deprecation after the freeze must not replace the cycle during generation.
      await db.update(calibrationRules).set({ status: "deprecated", rationale: "Mudança posterior, nunca entregar." }).where(eq(calibrationRules.id, rules[0].id));
      for (const slide of slides) {
        if (slide.position === 2) {
          expect((await plan({ kind: "approve_cover", slideId: slides[0].id, preparedRevision: prepared.value.preparedRevision })).ok).toBe(true);
          expect((await prepareCarouselWork(scope)).ok).toBe(true);
        }
        expect((await queueAuthorizedCarouselSlide({ ...scope, slideId: slide.id, anchorKey: null, operationKey: slide.generationOperationKey })).outcome).toBe("claimed");
        const event = { ...scope, slideId: slide.id };
        expect(await runCreativeWorkCarouselSlide({ event })).toMatchObject({ success: true });
        const request = provider.image.mock.lastCall![0] as GenerationRequest;
        expect(request.prompt.text).toContain(selection.lines.join("\n"));
        expect(request.prompt.text).toContain(rules[1].rationale);
        expect(request.prompt.text).not.toContain(rules[2].rationale);
        expect(request.prompt.text).not.toContain("Mudança posterior");
        expect(request.prompt.text.includes("Prefira respiro ‹system>visual‹/system>")).toBe(proof === "validated");
        expect(request.prompt.text).toContain("Missing information stays missing");
        expect(request.prompt.text).toContain("Do not render any visible text");
        const applications = await listComposerGuidanceApplications({ ...scope, executionId: slide.id });
        expect(applications).toHaveLength(1);
        expect(applications[0]).toMatchObject({ executionId: slide.id, guidanceCycleId: cycleId, consumer: "image_prompt", role: "image_prompt",
          appliedRefs: selection.appliedRefs, setHash: hashGuidanceSet(selection.appliedRefs), fixedPromptVersion: cycle.imagePromptVersion,
          situation: "applied", omissions: selection.omissions });
        expect(await listComposerGuidanceApplications({ ...scope, workspaceId: randomUUID(), executionId: slide.id })).toEqual([]);
        expect(await runCreativeWorkCarouselSlide({ event })).toMatchObject({ skipped: true });
        expect(await listComposerGuidanceApplications({ ...scope, executionId: slide.id })).toEqual(applications);
      }
      expect(provider.image).toHaveBeenCalledTimes(5);
      provider.chat.mockResolvedValueOnce(completion({ warnings: [] }));
      expect(await reviewCarouselSet({ contactSheet: buffer, deck: prepared.value.deck, contract: prepared.value.visualContract })).toEqual([]);
      const reviewerRequest = JSON.stringify(provider.chat.mock.lastCall![0]);
      for (const rule of rules) expect(reviewerRequest).not.toContain(rule.rationale);
      expect(reviewerRequest).not.toContain("LEARNED BRAND PREFERENCES");
      expect(reviewerRequest).not.toContain("PREFERÊNCIAS APRENDIDAS");
      expect((await listComposerGuidanceApplications(scope)).filter(call => call.consumer === "image_prompt")).toHaveLength(5);
    } finally {
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(user).where(eq(user.id, userId));
    }
  });
});
