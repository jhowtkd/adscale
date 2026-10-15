import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../db";
import { calibrationRules, clientProfiles, user, workspaces } from "../db/schema";
import { resolveEquipeTestDatabaseUrl } from "../equipe/data/test-database";
import { hashGuidanceContent, hashGuidanceSet } from "./learned-guidance";
import { loadLocalLearningPromptCalibrationContext, loadPromptCalibrationContext } from "./prompt-calibration-loader";
import { confirmCalibrationRuleMetadata } from "./calibration-rules";

const testUrl = resolveEquipeTestDatabaseUrl();
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) {
    throw new Error("Guidance eligibility requires matching local test database URLs ending in _test");
  }
}
const target = { role: "copy", generationMode: "single", format: "4:5", language: "en", fixedPromptVersion: "copy/v1" } as const;

describe.skipIf(!testUrl)("Confirmed guidance eligibility (Postgres)", () => {
  it("makes an approved rule eligible only after scoped confirmation, preserving approved bytes and attribution", async () => {
    const reviewer = randomUUID(), workspaceId = randomUUID(), clientProfileId = randomUUID(), otherBrandId = randomUUID();
    const scope = { workspaceId, clientProfileId };
    try {
      await db.insert(user).values({ id: reviewer, name: "Dono simulado", email: `${reviewer}@example.test` });
      await db.insert(workspaces).values({ id: workspaceId, name: "Conferência simulada", slug: workspaceId });
      await db.insert(clientProfiles).values([clientProfileId, otherBrandId].map(id => ({ id, workspaceId, name: "Marca simulada" })));
      const [rule] = await db.insert(calibrationRules).values({ ...scope, category: "gestalt", status: "approved",
        rationale: "Voz acolhedora e direta", approvedBy: reviewer, approvedAt: new Date("2026-10-01T00:00:00Z") }).returning();
      const input = { ...scope, ...target };
      expect(await loadLocalLearningPromptCalibrationContext(input)).toMatchObject({ lines: [], appliedRefs: [],
        omissions: [{ ruleId: rule.id, reason: "metadata_unconfirmed" }] });
      const metadata = { category: "voice" as const, nature: "text" as const, roles: ["copy" as const],
        generationModes: ["single"], formats: ["4:5"], contentHash: hashGuidanceContent(rule.rationale) };
      const command = { ...scope, ruleId: rule.id, confirmedBy: reviewer, metadata };
      expect(await confirmCalibrationRuleMetadata({ ...command, clientProfileId: otherBrandId })).toEqual({ ok: false, reason: "not_found" });
      expect(await confirmCalibrationRuleMetadata({ ...command, workspaceId: randomUUID() })).toEqual({ ok: false, reason: "not_found" });
      const startedAt = Date.now();
      const result = await confirmCalibrationRuleMetadata(command);
      expect(result).toMatchObject({ ok: true, rule: { id: rule.id, rationale: rule.rationale, category: "gestalt",
        approvedBy: reviewer, approvedAt: rule.approvedAt, confirmedMetadata: metadata, metadataConfirmedBy: reviewer } });
      if (!result.ok) throw new Error("Confirmação deveria ser aceita");
      expect(result.rule.metadataConfirmedAt!.getTime()).toBeGreaterThanOrEqual(startedAt);
      expect(result.rule.metadataConfirmedAt!.getTime()).toBeLessThanOrEqual(Date.now());
      const loaded = await loadLocalLearningPromptCalibrationContext(input);
      expect(loaded.lines).toContain(rule.rationale);
      expect(loaded.appliedRefs).toEqual([{ ruleId: rule.id, revision: 2, contentHash: metadata.contentHash }]);
      expect(loaded.omissions).toEqual([]);
      expect(await loadLocalLearningPromptCalibrationContext({ ...input, clientProfileId: otherBrandId })).toMatchObject({ lines: [], appliedRefs: [] });
      const [stored] = await db.select().from(calibrationRules).where(eq(calibrationRules.id, rule.id));
      expect(stored).toEqual(result.rule);
    } finally {
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(user).where(eq(user.id, reviewer));
    }
  });
  it("isolates two brands in one workspace and a third outside it, without inferring metadata or writing", async () => {
    const reviewer = randomUUID();
    const workspaceIds = [randomUUID(), randomUUID()];
    const brands = [randomUUID(), randomUUID(), randomUUID()];
    try {
      await db.insert(user).values({ id: reviewer, name: "Revisor simulado", email: `${reviewer}@example.test` });
      await db.insert(workspaces).values(workspaceIds.map(id => ({ id, name: "Elegibilidade simulada", slug: id })));
      await db.insert(clientProfiles).values(brands.map((id, i) => ({ id, workspaceId: workspaceIds[i === 2 ? 1 : 0], name: "Marca simulada" })));
      const approved = await db.insert(calibrationRules).values(brands.map((clientProfileId, i) => {
        const text = `Orientação da marca ${i}`;
        return { workspaceId: workspaceIds[i === 2 ? 1 : 0], clientProfileId,
          category: "gestalt", mismatchBucket: "system_too_permissive", status: "approved", rationale: text,
          confirmedMetadata: { category: "voice" as const, nature: "text" as const, roles: ["copy" as const],
            generationModes: ["single"], formats: ["4:5"], contentHash: hashGuidanceContent(text) },
          metadataConfirmedBy: reviewer, metadataConfirmedAt: new Date("2026-10-01T00:00:00Z"),
        };
      })).returning();
      const scope = { workspaceId: workspaceIds[0], clientProfileId: brands[0] };
      const [legacy] = await db.insert(calibrationRules).values({ ...scope, category: "corpus_quality", status: "approved", rationale: "Legado não confirmado" }).returning();
      expect(legacy).toMatchObject({ confirmedMetadata: null, metadataConfirmedBy: null, metadataConfirmedAt: null });
      await db.insert(calibrationRules).values(["candidate", "rejected", "deprecated"].map(status => ({
        ...scope, category: "voice", status, rationale: "Nunca entregue", confirmedMetadata: {
          category: "voice" as const, nature: "text" as const, roles: ["copy" as const], generationModes: ["single"], formats: ["4:5"], contentHash: hashGuidanceContent("Nunca entregue"),
        }, metadataConfirmedBy: reviewer, metadataConfirmedAt: new Date(),
      })));
      const stored = () => db.select().from(calibrationRules).where(inArray(calibrationRules.workspaceId, workspaceIds)).orderBy(calibrationRules.id);
      const before = await stored();
      for (let i = 0; i < brands.length; i++) {
        const input = { workspaceId: workspaceIds[i === 2 ? 1 : 0], clientProfileId: brands[i], ...target };
        const selection = await loadLocalLearningPromptCalibrationContext(input);
        expect(selection.appliedRefs).toEqual([{ ruleId: approved[i].id, revision: 1, contentHash: hashGuidanceContent(approved[i].rationale) }]);
        expect(selection.lines).toContain(approved[i].rationale);
        expect(await loadLocalLearningPromptCalibrationContext(input)).toEqual(selection);
      }
      expect(await loadLocalLearningPromptCalibrationContext({ workspaceId: workspaceIds[0], clientProfileId: brands[2], ...target }))
        .toMatchObject({ lines: [], appliedRefs: [], setHash: null, omissionReason: "brand_out_of_scope" });
      expect(await loadLocalLearningPromptCalibrationContext({ ...scope, ...target }, async () => ({ allowed: false, reason: "local_learning_denied" })))
        .toMatchObject({ lines: [], appliedRefs: [], setHash: null, omissionReason: "local_learning_denied" });
      for (const changed of [{ role: "image_prompt" as const }, { generationMode: "carousel" }, { format: "1:1" }]) {
        expect(await loadLocalLearningPromptCalibrationContext({ ...scope, ...target, ...changed }))
          .toMatchObject({ lines: [], appliedRefs: [], setHash: null });
      }
      const old = await loadPromptCalibrationContext(scope);
      expect(old.appliedCorpusRuleIds).toEqual([legacy.id]);
      expect(old.corpusQualitySection.join("\n")).toContain(legacy.rationale);
      expect(await stored()).toEqual(before);
      await expect(db.insert(calibrationRules).values({ ...scope, category: "voice", rationale: "Confirmação incompleta", confirmedMetadata: approved[0].confirmedMetadata }))
        .rejects.toMatchObject({ cause: { code: "23514" } });
    } finally {
      await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
      await db.delete(user).where(eq(user.id, reviewer));
    }
  });
  it("requires exact visual proof even for a copy role and omits oversized legacy sets without slicing", async () => {
    const reviewer = randomUUID(), workspaceId = randomUUID(), clientProfileId = randomUUID();
    const scope = { workspaceId, clientProfileId };
    try {
      await db.insert(user).values({ id: reviewer, name: "Revisor simulado", email: `${reviewer}@example.test` });
      await db.insert(workspaces).values({ id: workspaceId, name: "Prova simulada", slug: workspaceId });
      await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Marca simulada" });
      const make = (text: string, nature: "text" | "visual") => ({ ...scope, status: "approved", category: "corpus_quality", rationale: text,
        confirmedMetadata: { category: "brand_nuance" as const, nature, roles: ["copy" as const], generationModes: ["single"], formats: ["4:5"], contentHash: hashGuidanceContent(text) },
        metadataConfirmedBy: reviewer, metadataConfirmedAt: new Date("2026-10-01T00:00:00Z"),
      });
      const [text, visual] = await db.insert(calibrationRules).values([make("Texto confirmado", "text"), make("Preferência visual confirmada", "visual")]).returning();
      const input = { ...scope, ...target };
      const refs = [text, visual].map(row => ({ ruleId: row.id, revision: 1, contentHash: hashGuidanceContent(row.rationale) }));
      const proof = { ...input, setHash: hashGuidanceSet(refs)!, status: "validated" as const };
      const stored = () => db.select().from(calibrationRules).where(eq(calibrationRules.workspaceId, workspaceId)).orderBy(calibrationRules.id);
      const before = await stored();
      const missing = await loadLocalLearningPromptCalibrationContext(input);
      expect(missing.appliedRefs.map(ref => ref.ruleId)).toEqual([text.id]);
      expect(missing.omissions).toEqual([{ ruleId: visual.id, reason: "visual_proof_missing" }]);
      const valid = await loadLocalLearningPromptCalibrationContext(input, undefined, async request => {
        expect(request.setHash).toBe(proof.setHash);
        return proof;
      });
      expect(new Set(valid.appliedRefs.map(ref => ref.ruleId))).toEqual(new Set([text.id, visual.id]));
      expect(valid.setHash).toBe(proof.setHash);
      const wrong = await loadLocalLearningPromptCalibrationContext(input, undefined, async () => ({ ...proof, format: "1:1" }));
      expect(wrong.appliedRefs.map(ref => ref.ruleId)).toEqual([text.id]);
      expect(wrong.omissions).toEqual([{ ruleId: visual.id, reason: "visual_proof_mismatch" }]);
      expect(await stored()).toEqual(before);
      await db.insert(calibrationRules).values(Array.from({ length: 5 }, (_, i) => make(`Texto extra ${i}`, "text")));
      const six = await stored();
      expect(await loadLocalLearningPromptCalibrationContext(input)).toMatchObject({ lines: [], appliedRefs: [], setHash: null, omissionReason: "budget_exceeded" });
      expect(await stored()).toEqual(six);
      await db.delete(calibrationRules).where(eq(calibrationRules.workspaceId, workspaceId));
      const long = "a".repeat(281);
      await db.insert(calibrationRules).values(make(long, "text"));
      expect(await loadLocalLearningPromptCalibrationContext(input)).toMatchObject({ lines: [], appliedRefs: [], setHash: null, omissionReason: "budget_exceeded" });
      expect((await stored())[0].rationale).toBe(long);
    } finally {
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(user).where(eq(user.id, reviewer));
    }
  });
});
