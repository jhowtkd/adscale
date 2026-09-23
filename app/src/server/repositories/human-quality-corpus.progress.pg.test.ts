import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  campaigns,
  clientProfiles,
  derivations,
  humanQualityCorpusCandidates,
  humanQualityCorpusItems,
  workspaces,
} from "@/server/db/schema";
import { getCorpusOperationsProgress } from "./human-quality-corpus";

const url = process.env.DATABASE_URL;
const localTestDb = url && new URL(url).hostname === "localhost"
  && new URL(url).port === "5433" && new URL(url).pathname === "/adscale_test";
const testPg = localTestDb ? describe : describe.skip;

testPg("corpus progress aggregation against isolated PostgreSQL", () => {
  const workspaceId = crypto.randomUUID();
  const otherWorkspaceId = crypto.randomUUID();
  const profileId = crypto.randomUUID();
  const otherProfileId = crypto.randomUUID();
  const campaignId = crypto.randomUUID();
  const otherCampaignId = crypto.randomUUID();
  const derivationIds = Array.from({ length: 5 }, () => crypto.randomUUID());
  let created = false;

  beforeAll(async () => {
    await db.insert(workspaces).values([
      { id: workspaceId, name: "corpus-progress-test", slug: `corpus-progress-${workspaceId}` },
      { id: otherWorkspaceId, name: "corpus-progress-other", slug: `corpus-progress-${otherWorkspaceId}` },
    ]);
    created = true;
    await db.insert(clientProfiles).values([
      { id: profileId, workspaceId, name: "Test profile" },
      { id: otherProfileId, workspaceId: otherWorkspaceId, name: "Other profile" },
    ]);
    await db.insert(campaigns).values([
      { id: campaignId, workspaceId, name: "Test campaign", clientProfileId: profileId },
      { id: otherCampaignId, workspaceId: otherWorkspaceId, name: "Other campaign", clientProfileId: otherProfileId },
    ]);
    await db.insert(derivations).values(derivationIds.map((id, index) => ({
      id,
      workspaceId: index === 4 ? otherWorkspaceId : workspaceId,
      campaignId: index === 4 ? otherCampaignId : campaignId,
      status: "completed",
      outputKey: `test-${id}`,
    })));
    await db.insert(humanQualityCorpusItems).values([
      { workspaceId, clientProfileId: profileId, campaignId, derivationId: derivationIds[0], generationMode: "art_variation", format: "", cohort: "baseline", status: "pending", selectedAt: new Date("2026-07-01T00:00:00Z") },
      { workspaceId, clientProfileId: profileId, campaignId, derivationId: derivationIds[1], generationMode: "text", format: "square", cohort: "pre_learning", status: "evaluated", selectedAt: new Date("2026-07-02T00:00:00Z"), updatedAt: new Date("2026-07-04T00:00:00Z") },
      { workspaceId, clientProfileId: profileId, campaignId, derivationId: derivationIds[2], generationMode: "art_variation", format: "square", cohort: "post_learning", status: "pending", selectedAt: new Date("2026-07-03T00:00:00Z") },
      { workspaceId, clientProfileId: profileId, campaignId, derivationId: derivationIds[3], generationMode: "art_variation", format: "square", cohort: "baseline", status: "removed", selectedAt: new Date("2026-07-05T00:00:00Z") },
      { workspaceId: otherWorkspaceId, clientProfileId: otherProfileId, campaignId: otherCampaignId, derivationId: derivationIds[4], generationMode: "text", format: "square", cohort: "baseline", status: "pending" },
    ]);
    await db.insert(humanQualityCorpusCandidates).values([
      { workspaceId, clientProfileId: profileId, campaignId, derivationId: derivationIds[0], generationMode: "art_variation", format: "", sourceLabel: "real_customer" },
      { workspaceId, clientProfileId: profileId, campaignId, derivationId: derivationIds[2], generationMode: "art_variation", format: "square", sourceLabel: "synthetic_fixture" },
    ]);
  });

  afterAll(async () => {
    if (created) {
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(workspaces).where(eq(workspaces.id, otherWorkspaceId));
    }
  });

  it("matches totals, dimensions, dates, source filters, and workspace isolation", async () => {
    const progress = await getCorpusOperationsProgress(workspaceId);
    expect(progress.totalPending).toBe(2);
    expect(progress.totalEvaluated).toBe(1);
    expect(progress.byCohort).toEqual({
      baseline: { pending: 1, evaluated: 0 },
      pre_learning: { pending: 0, evaluated: 1 },
      post_learning: { pending: 1, evaluated: 0 },
    });
    expect(progress.byGenerationMode).toEqual({
      art_variation: { pending: 2, evaluated: 0 },
      text: { pending: 0, evaluated: 1 },
    });
    expect(progress.byFormat).toEqual({
      unknown: { pending: 1, evaluated: 0 },
      square: { pending: 1, evaluated: 1 },
    });
    expect(progress.byCampaign[campaignId]).toEqual({ pending: 2, evaluated: 1 });
    expect(progress.latestSelectedAt?.toISOString()).toBe("2026-07-03T00:00:00.000Z");
    expect(progress.latestEvaluatedAt?.toISOString()).toBe("2026-07-04T00:00:00.000Z");

    const imported = await getCorpusOperationsProgress(workspaceId, { sourceLabel: "operator_imported" });
    expect(imported.totalPending).toBe(0);
    expect(imported.totalEvaluated).toBe(1);
    expect(imported.byCohort).toEqual({ pre_learning: { pending: 0, evaluated: 1 } });

    const other = await getCorpusOperationsProgress(otherWorkspaceId);
    expect(other.totalPending).toBe(1);
    expect(other.totalEvaluated).toBe(0);

    const recent = await getCorpusOperationsProgress(workspaceId, {
      selectedAfter: new Date("2026-07-02T00:00:00Z"),
    });
    expect(recent.totalPending).toBe(1);
    expect(recent.totalEvaluated).toBe(1);
  });

  it("returns grouped rows rather than materializing the corpus", async () => {
    const extraIds = Array.from({ length: 200 }, () => crypto.randomUUID());
    await db.insert(derivations).values(extraIds.map((id) => ({
      id, workspaceId, campaignId, status: "completed", outputKey: `test-${id}`,
    })));
    await db.insert(humanQualityCorpusItems).values(extraIds.map((derivationId) => ({
      workspaceId,
      clientProfileId: profileId,
      campaignId,
      derivationId,
      generationMode: "art_variation",
      format: "square",
      cohort: "baseline",
      status: "pending",
    })));

    const oldRows = await db.select({
      status: humanQualityCorpusItems.status,
      cohort: humanQualityCorpusItems.cohort,
      generationMode: humanQualityCorpusItems.generationMode,
      format: humanQualityCorpusItems.format,
      campaignId: humanQualityCorpusItems.campaignId,
      selectedAt: humanQualityCorpusItems.selectedAt,
      updatedAt: humanQualityCorpusItems.updatedAt,
    }).from(humanQualityCorpusItems).where(and(
      eq(humanQualityCorpusItems.workspaceId, workspaceId),
      inArray(humanQualityCorpusItems.status, ["pending", "evaluated"]),
    ));

    const executeSpy = vi.spyOn(db, "execute");
    let progress;
    let groupedRows: unknown[];
    try {
      progress = await getCorpusOperationsProgress(workspaceId);
      groupedRows = (await executeSpy.mock.results[0].value as { rows: unknown[] }).rows;
      expect(executeSpy).toHaveBeenCalledTimes(1);
    } finally {
      executeSpy.mockRestore();
    }
    expect(progress.totalPending).toBe(202);
    expect(progress.totalEvaluated).toBe(1);
    expect(oldRows).toHaveLength(203);
    expect(groupedRows.length).toBe(9);
    expect(Buffer.byteLength(JSON.stringify(groupedRows)))
      .toBeLessThan(Buffer.byteLength(JSON.stringify(oldRows)) / 4);
  });
});
