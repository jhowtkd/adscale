import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { calibrationRules, campaigns, clientProfiles, derivations, workspaces } from "@/server/db/schema";
import { freezeLegacyGuidance, recordLegacyGuidanceApplication } from "./legacy-guidance";
import { hashGuidanceContent, hashGuidanceSet } from "./learned-guidance";

const testUrl = process.env.TEST_DATABASE_URL ?? (process.env.CI ? process.env.DATABASE_URL : undefined);
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) {
    throw new Error("Legacy guidance tests require matching local database URLs ending in _test");
  }
}

describe.skipIf(!testUrl)("Legacy guidance execution (Postgres)", () => {
  it("freezes once across concurrent starts and resumes, and records only delivered identity", async () => {
    const workspaceId = randomUUID();
    const clientProfileId = randomUUID();
    const campaignId = randomUUID();
    const derivationId = randomUUID();
    const ruleId = randomUUID();
    const scope = { workspaceId, clientProfileId, derivationId };
    try {
      await db.insert(workspaces).values({ id: workspaceId, name: "Legacy test", slug: workspaceId });
      await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Legacy test" });
      await db.insert(campaigns).values({ id: campaignId, workspaceId, clientProfileId, name: "Legacy test" });
      await db.insert(derivations).values({ id: derivationId, campaignId, workspaceId });
      await db.insert(calibrationRules).values({ id: ruleId, workspaceId, clientProfileId, category: "corpus_quality", status: "approved", rationale: "Keep CTA visible" });

      const [first, simultaneous] = await Promise.all([freezeLegacyGuidance(scope), freezeLegacyGuidance(scope)]);
      const refs = [{ ruleId, revision: "legacy" as const, contentHash: hashGuidanceContent("Keep CTA visible") }];
      expect(first.appliedRefs).toEqual(refs);
      expect(simultaneous).toEqual(first);
      const [before] = await db.select().from(derivations).where(eq(derivations.id, derivationId));
      expect(before.frozenLegacyGuidance).toEqual(first);
      expect(before.legacyGuidanceApplications).toBeNull();

      await db.update(calibrationRules).set({ status: "deprecated", rationale: "Changed after start" }).where(eq(calibrationRules.id, ruleId));
      await db.insert(calibrationRules).values({ workspaceId, clientProfileId, category: "corpus_quality", status: "approved", rationale: "New approval" });
      expect(await freezeLegacyGuidance(scope)).toEqual(first);
      const prompt = first.corpusQualitySection.join("\n");
      await Promise.all(["initial", "auto_retry"].map(callName => recordLegacyGuidanceApplication({ ...scope, selection: first, callName, prompt })));
      await recordLegacyGuidanceApplication({ ...scope, selection: first, callName: "omitted", prompt: "No learned lines delivered" });
      const [after] = await db.select().from(derivations).where(eq(derivations.id, derivationId));
      expect(after.legacyGuidanceApplications).toHaveLength(3);
      const applied = after.legacyGuidanceApplications!.filter(call => call.situation === "applied");
      expect(applied).toHaveLength(2);
      for (const call of applied) {
        expect(call.appliedRefs).toEqual(refs);
        expect(call.setHash).toBe(hashGuidanceSet(refs));
        expect(call.fixedPromptVersion).toBe("unknown");
        expect(call.role).toBe("legacy_derivation");
        expect(Object.keys(call).sort()).toEqual(["appliedRefs", "callId", "callName", "consumer", "fixedPromptVersion", "role", "setHash", "situation"].sort());
      }
      expect(after.legacyGuidanceApplications!.find(call => call.callName === "omitted")).toMatchObject({ situation: "no_guidance", appliedRefs: [], setHash: null });
      await expect(freezeLegacyGuidance({ ...scope, workspaceId: randomUUID() })).rejects.toThrow();
      const childId = randomUUID();
      await db.insert(derivations).values({ id: childId, campaignId, workspaceId, parentId: derivationId });
      expect((await freezeLegacyGuidance({ ...scope, derivationId: childId })).corpusQualitySection.join("\n")).toContain("New approval");
    } finally {
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    }
  });
});
