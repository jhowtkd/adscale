import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ chat: vi.fn(), research: vi.fn(), controlled: false }));
vi.mock("@/server/ai/utils", () => ({
  getOpenAI: () => ({ chat: { completions: { create: sdk.chat } }, responses: { create: sdk.research } }),
  extractOutputText: (response: { output_text: string }) => response.output_text,
}));
vi.mock("@/server/ai/providers/e2e-controlled-provider", () => ({ isE2EControlledProviderEnabled: () => sdk.controlled }));

import { db } from "../db";
import { user, workspaces, clientProfiles, creativeWorkItems, creativeWorkOutputs, creativeWorkPreparationAttempts } from "../db/schema";
import { createSinglePieceArtDirection } from "../creative-work/art-direction";
import { planCarouselWork } from "../application/plan-carousel-work";
import { getCreativeWorkPromptVersion } from "../shared-skills";
import { logger } from "@/lib/logger";
import { listComposerGuidanceApplications, recordComposerGuidanceApplication } from "./composer-guidance-application";

const testUrl = process.env.TEST_DATABASE_URL ?? (process.env.CI ? process.env.DATABASE_URL : undefined);
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) {
    throw new Error("Composer application tests require matching local database URLs ending in _test");
  }
}

const REQUEST = "Grupo de terapia começa em agosto, vagas limitadas no consultório";
const hooks = [
  { id: "hook-1", headline: "Grupo de terapia em agosto", promise: "O grupo começa em agosto", narrative: "Abre com a data." },
  { id: "hook-2", headline: "Vagas limitadas no consultório", promise: "As vagas são limitadas", narrative: "Parte das vagas." },
  { id: "hook-3", headline: "Cuidado em grupo no consultório", promise: "O grupo acontece no consultório", narrative: "Começa pelo cuidado." },
];
const research = {
  status: "not_needed", question: "O grupo começa em agosto?", thesis: REQUEST,
  sources: [], claims: [], gaps: [],
};
const script = {
  kind: "deck", objective: "Divulgar o grupo de terapia", audience: null,
  tone: null, promise: "O grupo começa em agosto", changes: [], caption: "Inscreva-se",
  slides: [
    ["hook", "Grupo de terapia começa em agosto"],
    ["context", "O grupo acontece no consultório"],
    ["argument", "As vagas são limitadas"],
    ["evidence", "O consultório organiza o grupo de terapia"],
    ["closing", "Comece em agosto"],
  ].map(([role, primaryText]) => ({
    role, primaryText, purpose: "Avançar no argumento", secondaryText: null,
    sourceFactIds: [], slideId: null,
  })),
  storyboard: Array.from({ length: 5 }, () => ({
    learning: "O leitor entende a oferta", representation: "Tipografia com o fato principal",
    hierarchy: "Título, apoio, marca", transition: "Segue para o próximo argumento", claimIds: [],
  })),
};


afterEach(() => { vi.restoreAllMocks(); sdk.controlled = false; vi.resetAllMocks(); });

describe.skipIf(!testUrl)("Composer applied identity (Postgres and simulated providers)", () => {
  it("persists all four effective versions on their executions, retains reuse and isolates workspaces", async () => {
    const workspaceId = randomUUID();
    const userId = randomUUID();
    const clientProfileId = randomUUID();
    const singleId = randomUUID();
    const carouselId = randomUUID();
    const outputId = randomUUID();
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    try {
      await db.insert(user).values({ id: userId, name: "Composer test", email: `${userId}@example.test`, emailVerified: true });
      await db.insert(workspaces).values({ id: workspaceId, name: "Composer test", slug: workspaceId });
      await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Composer test" });
      for (const [id, toolKind] of [[singleId, "single"], [carouselId, "carousel"]] as const) {
        await db.insert(creativeWorkItems).values({ id, workspaceId, clientProfileId, createdByUserId: userId,
          title: "Composer test", toolKind, request: REQUEST, settings: { targetFormats: [] } });
      }
      await db.insert(creativeWorkOutputs).values({ id: outputId, workspaceId, workItemId: singleId,
        creativeLevel: "balanced", targetFormat: "4:5", operationKey: outputId });
      const artInput = {
        applicationScope: { workspaceId, workItemId: singleId, outputId }, format: "4:5" as const,
        copy: { headline: "Grupo de terapia", body: "Em agosto", cta: "Inscreva-se" },
        inputSnapshot: { request: REQUEST, settings: { targetFormats: [] }, sources: [] }, factPack: null,
        identitySnapshot: { clientProfileId, confirmedAt: "now", assets: [], brandKit: { colors: [], fonts: [] } },
        creativeLevel: "balanced" as const, revisionInstruction: null, directionInstruction: null, references: [],
      };
      let persistedCountAtDispatch = 0;
      sdk.chat.mockImplementationOnce(async () => {
        persistedCountAtDispatch = (await listComposerGuidanceApplications({ workspaceId, workItemId: singleId })).length;
        throw new Error("Simulated provider failure");
      });
      expect(await createSinglePieceArtDirection(artInput)).toMatchObject({ source: "fallback", reason: "unavailable" });
      expect(persistedCountAtDispatch).toBe(1);
      const originalArt = await listComposerGuidanceApplications({ workspaceId, workItemId: singleId });
      expect(originalArt[0]).toMatchObject({
        executionId: outputId, consumer: "art_direction", role: "art_direction", callName: "art_direction",
      });
      expect(originalArt[0].callId).toBe(info.mock.calls[0][0].callId);
      expect(await listComposerGuidanceApplications({ workspaceId, workItemId: singleId, executionId: outputId })).toEqual(originalArt);
      expect(await listComposerGuidanceApplications({ workspaceId, workItemId: singleId, executionId: randomUUID() })).toEqual([]);
      const foreignWorkspaceId = randomUUID();
      expect(await listComposerGuidanceApplications({ workspaceId: foreignWorkspaceId, workItemId: singleId })).toEqual([]);
      expect(await listComposerGuidanceApplications({ workspaceId: foreignWorkspaceId, workItemId: singleId, executionId: outputId })).toEqual([]);
      sdk.controlled = true;
      expect((await createSinglePieceArtDirection(artInput)).source).toBe("controlled");
      expect(await listComposerGuidanceApplications({ workspaceId, workItemId: singleId })).toEqual(originalArt);
      sdk.controlled = false;
      sdk.research.mockResolvedValue({ output_text: JSON.stringify(research), output: [] });
      sdk.chat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ hooks, recommendedHookId: "hook-1", recommendation: "Abre com a data." }) } }] });
      const run = async (command?: Parameters<typeof planCarouselWork>[0]["command"]) => {
        const [current] = await db.select().from(creativeWorkItems).where(eq(creativeWorkItems.id, carouselId));
        return planCarouselWork({ workspaceId, workItemId: carouselId, expectedUpdatedAt: current.updatedAt.toISOString(), answers: {}, command });
      };
      expect((await run()).ok).toBe(true);
      sdk.chat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(script) } }] });
      const planned = await run({ kind: "select_hook", hookId: "hook-1" });
      expect(planned.ok).toBe(true);
      if (!planned.ok) throw new Error("Expected a planned script");
      const original = await listComposerGuidanceApplications({ workspaceId, workItemId: carouselId });
      expect(original.map(call => call.consumer).sort()).toEqual(["carousel_hooks", "carousel_plan", "carousel_research"]);
      const attempts = await db.select().from(creativeWorkPreparationAttempts).where(eq(creativeWorkPreparationAttempts.workItemId, carouselId));
      expect(original.every(call => attempts.some(attempt => attempt.id === call.executionId))).toBe(true);
      const researchExecutionId = original.find(call => call.consumer === "carousel_research")!.executionId;
      const researchExecution = await listComposerGuidanceApplications({ workspaceId, workItemId: carouselId, executionId: researchExecutionId });
      expect(researchExecution.map(call => call.consumer).sort()).toEqual(["carousel_hooks", "carousel_research"]);
      for (const call of [...originalArt, ...original]) {
        expect(call).toMatchObject({ fixedPromptVersion: getCreativeWorkPromptVersion(), appliedRefs: [], setHash: null, situation: "no_guidance" });
        const log = info.mock.calls.find(([event]) => event.operation === call.consumer)?.[0];
        expect(call.fixedPromptVersion).toBe(log.promptVersion);
        expect(Object.keys(call).sort()).toEqual(["appliedRefs", "callId", "callName", "consumer", "executionId", "fixedPromptVersion", "role", "setHash", "situation"].sort());
      }
      const command = { kind: "approve_script" as const, scriptRevision: planned.value.editorial.revision };
      expect((await run(command)).ok).toBe(true);
      expect((await run(command)).ok).toBe(true);
      expect(await listComposerGuidanceApplications({ workspaceId, workItemId: carouselId })).toEqual(original);
      expect(await listComposerGuidanceApplications({ workspaceId: randomUUID(), workItemId: carouselId })).toEqual([]);
      await expect(recordComposerGuidanceApplication({ workspaceId: randomUUID(), workItemId: singleId, outputId, application: originalArt[0] })).rejects.toThrow("Execução");
      await expect(recordComposerGuidanceApplication({ workspaceId, workItemId: carouselId, outputId, application: originalArt[0] })).rejects.toThrow("Execução");
      expect(await listComposerGuidanceApplications({ workspaceId, workItemId: singleId })).toEqual(originalArt);
    } finally {
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(user).where(eq(user.id, userId));
    }
  });
});
