import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { calibrationRules, clientProfiles, workspaces } from "@/server/db/schema";
import { loadPromptCalibrationContext } from "./prompt-calibration-loader";

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!(["localhost", "127.0.0.1"].includes(parsed.hostname) && parsed.pathname.endsWith("_test") && process.env.DATABASE_URL === testUrl)) {
    throw new Error("Prompt calibration test requires matching local TEST_DATABASE_URL and DATABASE_URL ending in _test");
  }
}

describe.skipIf(!testUrl)("Prompt calibration loading (Postgres)", () => {
  it("performs zero writes and preserves all 12 stored rules across repeated bounded reads", async () => {
    const workspaceId = randomUUID();
    const clientProfileId = randomUUID();
    const ruleIds = Array.from({ length: 12 }, () => randomUUID());
    const storedRules = () => db.select().from(calibrationRules).where(and(
      eq(calibrationRules.workspaceId, workspaceId),
      eq(calibrationRules.clientProfileId, clientProfileId),
    )).orderBy(calibrationRules.id);

    try {
      await db.insert(workspaces).values({ id: workspaceId, name: "Calibration read test", slug: workspaceId });
      await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Calibration read test" });
      await db.insert(calibrationRules).values(ruleIds.map((id, index) => ({
        id,
        workspaceId,
        clientProfileId,
        category: "corpus_quality",
        status: "approved",
        rationale: `Rule ${index}`,
        approvedAt: new Date(`2026-06-${String(index + 1).padStart(2, "0")}T12:00:00Z`),
        createdAt: new Date("2026-06-01T00:00:00Z"),
        updatedAt: new Date("2026-06-01T00:00:00Z"),
      })));
      const before = await storedRules();
      const insert = vi.spyOn(db, "insert");
      const update = vi.spyOn(db, "update");
      const remove = vi.spyOn(db, "delete");

      const first = await loadPromptCalibrationContext({ workspaceId, clientProfileId });
      const second = await loadPromptCalibrationContext({ workspaceId, clientProfileId });
      const after = await storedRules();

      expect(insert.mock.calls.length + update.mock.calls.length + remove.mock.calls.length).toBe(0);
      expect(after).toHaveLength(12);
      expect(after).toEqual(before);
      expect(first.appliedCorpusRuleIds).toEqual(ruleIds.slice(-10));
      expect(first.corpusQualitySection).toHaveLength(12);
      expect(second).toEqual(first);
    } finally {
      vi.restoreAllMocks();
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    }
  });
});
