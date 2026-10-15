import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
const create = vi.hoisted(() => vi.fn());
vi.mock("@/server/ai/utils", () => ({ getOpenAI: () => ({ chat: { completions: { create } } }) }));
vi.mock("@/server/ai/providers/e2e-controlled-provider", () => ({ isE2EControlledProviderEnabled: () => false }));
vi.mock("@/server/validation/env", () => ({ env: { DATABASE_URL: process.env.DATABASE_URL, OPENAI_TEXT_MODEL: "simulated-text" } }));
import { db } from "@/server/db";
import { user, workspaces, clientProfiles, creativeWorkItems, creativeWorkOutputs, calibrationRules } from "@/server/db/schema";
import * as calibration from "@/server/brand-taste/prompt-calibration-loader";
import { freezeSinglePieceOutputGuidance } from "@/server/repositories/single-piece-guidance";
import { listComposerGuidanceApplications } from "@/server/repositories/composer-guidance-application";
import { hashGuidanceContent } from "@/server/brand-taste/learned-guidance";
import { createSinglePieceArtDirection, type ArtDirectionInput } from "@/server/creative-work/art-direction";
import { getCreativeWorkPromptVersion } from "@/server/shared-skills";
const testUrl = process.env.TEST_DATABASE_URL ?? (process.env.CI === "true" ? process.env.DATABASE_URL : undefined);
if (testUrl) { const u = new URL(testUrl); if (!["localhost", "127.0.0.1"].includes(u.hostname) || !u.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) throw new Error("Requires matching local test database URLs ending in _test"); }

describe.skipIf(!testUrl)("art direction frozen visual proof → provider → durable application (Postgres)", () => {
  it.each(["creative_revision", "format_adaptation"])("omits unproved visual on the root and keeps the child frozen on retry (%s)", async generationMode => {
    const workspaceId = randomUUID(), clientProfileId = randomUUID(), actor = randomUUID(), workItemId = randomUUID();
    const scope = { workspaceId, workItemId };
    let proofSpy: ReturnType<typeof vi.spyOn> | undefined;
    create.mockReset();
    const addRule = async (text: string) => (await db.insert(calibrationRules).values({ workspaceId, clientProfileId, category: "hierarchy", status: "approved", rationale: text,
        confirmedMetadata: { category: "hierarchy", nature: "visual", roles: ["art_direction"], generationModes: ["single", "creative_revision", "format_adaptation"], formats: ["4:5"], contentHash: hashGuidanceContent(text) }, metadataConfirmedBy: actor, metadataConfirmedAt: new Date() }).returning())[0];
    try {
      await db.insert(user).values({ id: actor, name: "Operador simulado", email: `${actor}@example.test` });
      await db.insert(workspaces).values({ id: workspaceId, slug: workspaceId, name: "Marca simulada" });
      await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Marca simulada" });
      await db.insert(creativeWorkItems).values({ id: workItemId, workspaceId, clientProfileId, toolKind: "single", title: "Peça simulada", request: "Divulgar o grupo", settings: { targetFormats: [] }, createdByUserId: actor });
      const [root] = await db.insert(creativeWorkOutputs).values({ ...scope, creativeLevel: "balanced", targetFormat: "4:5", operationKey: randomUUID(), status: "completed" }).returning();
      const oldRule = await addRule("Priorize um título dominante e grupos com respiro.");
      const withoutProof = await freezeSinglePieceOutputGuidance({ ...scope, outputId: root.id });
      expect(withoutProof!.roles.art_direction).toMatchObject({ lines: [], appliedRefs: [], setHash: null, omissions: [{ ruleId: oldRule.id, reason: "visual_proof_missing" }] });
      const input: ArtDirectionInput = { applicationScope: { ...scope, outputId: root.id }, format: "4:5", copy: { headline: "Grupo", body: "No consultório", cta: "Conheça" }, inputSnapshot: { request: "Divulgar o grupo", settings: {}, sources: [] }, identitySnapshot: { clientProfileId, confirmedAt: new Date().toISOString(), assets: [], brandKit: { colors: [], fonts: [] } }, creativeLevel: "balanced", factPack: null, references: [], directionInstruction: null, revisionInstruction: null };
      create.mockResolvedValueOnce({ choices: [{ message: { content: '{"brief":"Composição editorial."}' } }] });
      expect((await createSinglePieceArtDirection({ ...input, frozenGuidance: withoutProof })).source).toBe("model");
      expect(JSON.stringify(create.mock.calls[0][0].messages)).not.toContain(oldRule.rationale);
      expect((await listComposerGuidanceApplications({ ...scope, executionId: root.id }))[0]).toMatchObject({ situation: "omitted", appliedRefs: [], setHash: null, omissions: [{ ruleId: oldRule.id, reason: "visual_proof_missing" }] });
      // Simulate only the trusted proof lookup; authorization and selection still use Postgres.
      const realLoad = calibration.loadLocalLearningPromptCalibrationContext;
      proofSpy = vi.spyOn(calibration, "loadLocalLearningPromptCalibrationContext").mockImplementation(input => realLoad(input, undefined, async request => ({ ...request, status: "validated" })));
      const [child] = await db.insert(creativeWorkOutputs).values({ ...scope, creativeLevel: "balanced", targetFormat: "4:5", parentOutputId: root.id, versionNumber: 2, revisionContext: generationMode === "format_adaptation" ? { version: 1, reviewRevision: 1, sourceOutputId: root.id, sourceOutputVersion: 1, action: "format", targetFormat: "4:5", instruction: "Aumente o título", revisionAssetId: null, annotations: [] } : null, operationKey: randomUUID(), revisionInstruction: "Aumente o título" }).returning();
      const frozen = await freezeSinglePieceOutputGuidance({ ...scope, outputId: child.id });
      expect(frozen!.generationMode).toBe(generationMode);
      expect(frozen!.fixedPromptVersion).toBe(getCreativeWorkPromptVersion("refinement"));
      expect(frozen!.roles.art_direction.appliedRefs.map(ref => ref.ruleId)).toEqual([oldRule.id]);
      expect(frozen!.roles.art_direction.appliedRefs[0].revision).toBe(1);
      const before = JSON.stringify(frozen);
      const childInput = { ...input, generationMode, applicationScope: { ...scope, outputId: child.id }, revisionInstruction: child.revisionInstruction, frozenGuidance: frozen };
      let applicationsAtDispatch: Awaited<ReturnType<typeof listComposerGuidanceApplications>> = [];
      create.mockImplementationOnce(async () => {
        applicationsAtDispatch = await listComposerGuidanceApplications({ ...scope, executionId: child.id });
        throw new Error("simulated_transient_failure");
      });
      expect(await createSinglePieceArtDirection(childInput)).toMatchObject({ source: "fallback", reason: "unavailable" });
      expect(applicationsAtDispatch).toHaveLength(1);
      expect(applicationsAtDispatch[0]).toMatchObject({ appliedRefs: frozen!.roles.art_direction.appliedRefs, setHash: frozen!.roles.art_direction.setHash, fixedPromptVersion: getCreativeWorkPromptVersion("refinement"), promptFingerprint: createHash("sha256").update(JSON.stringify(create.mock.calls[1][0].messages), "utf8").digest("hex") });
      expect(create.mock.calls[1][0].messages[0].content).toContain(frozen!.roles.art_direction.lines.join("\n"));
      await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, oldRule.id));
      const newRule = await addRule("NEW_LIVE_RULE_MUST_NOT_ENTER_RETRY");
      const persisted = await freezeSinglePieceOutputGuidance({ ...scope, outputId: child.id });
      expect(persisted).toEqual(frozen);
      create.mockResolvedValueOnce({ choices: [{ message: { content: '{"brief":"Composição editorial."}' } }] });
      expect((await createSinglePieceArtDirection({ ...childInput, frozenGuidance: persisted })).source).toBe("model");
      const retry = create.mock.calls[2][0];
      expect(retry.messages).toEqual(create.mock.calls[1][0].messages);
      expect(JSON.stringify(retry)).not.toContain(newRule.rationale);
      const apps = await listComposerGuidanceApplications({ ...scope, executionId: child.id });
      expect(apps).toHaveLength(2);
      expect(apps[1]).toMatchObject({ situation: "applied", appliedRefs: apps[0].appliedRefs, setHash: apps[0].setHash, fixedPromptVersion: apps[0].fixedPromptVersion, promptFingerprint: apps[0].promptFingerprint });
      expect(JSON.stringify(frozen)).toBe(before);
      expect(await freezeSinglePieceOutputGuidance({ ...scope, outputId: root.id })).toEqual(withoutProof);
      await expect(freezeSinglePieceOutputGuidance({ ...scope, workspaceId: randomUUID(), outputId: child.id })).rejects.toThrow("Peça");
    } finally {
      proofSpy?.mockRestore();
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(user).where(eq(user.id, actor));
    }
  });
});
