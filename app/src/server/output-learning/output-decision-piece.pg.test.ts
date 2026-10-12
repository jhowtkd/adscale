import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import {
  calibrationSignals, campaigns, clientProfiles, creativeWorkItems, creativeWorkOutputs,
  derivations, outputDecisionEvents, user, workspaces,
} from "@/server/db/schema";
import { resolveEquipeTestDatabaseUrl } from "@/server/equipe/data/test-database";
import { recordCalibrationSignal, recordCalibrationSignalFromOutputDecisionEvent } from "@/server/brand-taste/calibration-signal-recorder";
import { buildPerBrandEvidenceReport } from "@/server/brand-taste/calibration-evidence";
import { buildBrandTasteProfile } from "@/server/brand-taste/taste-profile";
import { listCalibrationSignalsForClientProfile } from "@/server/repositories/calibration-signal";
import { listOutputDecisionEvents, listOutputDecisionEventsForClient, listOutputDecisionEventsForDerivations } from "@/server/repositories/output-decision-event";
import { aggregateOutputLearningsFromEvents } from "./aggregate";
import { recordLocalLearningDecisionEvidence, recordOutputDecisionEvidence } from "./output-decision-recorder";

vi.mock("./dispatch", () => ({ dispatchOutputLearningRecomputeBestEffort: vi.fn() }));

const testUrl = resolveEquipeTestDatabaseUrl();
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!(["localhost", "127.0.0.1"].includes(parsed.hostname) && parsed.pathname.endsWith("_test") && process.env.DATABASE_URL === testUrl)) {
    throw new Error("Peça evidence tests require matching local database URLs ending in _test");
  }
}

const actorId = `piece-evidence-${randomUUID()}`;
const workspaceIds: string[] = [];
type Scope = { workspaceId: string; clientProfileId: string };
let own: Scope;
let foreign: Scope;
let siblingBrandId: string;
let campaignId: string;
let derivationId: string;
let outputId: string;
let siblingOutputId: string;
let foreignOutputId: string;
let invalidOutputId: string;
let invalidWorkOutputId: string;
let invalidBrandOutputId: string;

async function createScope(): Promise<Scope> {
  const [workspace] = await db.insert(workspaces).values({ name: "Marca simulada", slug: randomUUID() }).returning();
  workspaceIds.push(workspace.id);
  const [brand] = await db.insert(clientProfiles).values({ workspaceId: workspace.id, name: "Marca simulada" }).returning();
  return { workspaceId: workspace.id, clientProfileId: brand.id };
}

async function createOutput(scope: Scope & { campaignId?: string }, outputWorkspaceId = scope.workspaceId): Promise<string> {
  const [work] = await db.insert(creativeWorkItems).values({
    ...scope, createdByUserId: actorId, title: "Trabalho simulado", request: "Peça de teste",
    toolKind: "single", settings: { targetFormats: ["4:5"] },
  }).returning();
  const [output] = await db.insert(creativeWorkOutputs).values({
    workspaceId: outputWorkspaceId, workItemId: work.id, creativeLevel: "balanced",
    targetFormat: "4:5", operationKey: randomUUID(), status: "completed",
  }).returning();
  return output.id;
}

describe.skipIf(!testUrl)("canonical Peça evidence (Postgres)", () => {
  beforeAll(async () => {
    const result = await db.execute(sql`select current_database() as name`);
    expect(result.rows[0].name).toBe(new URL(testUrl!).pathname.slice(1));
    await db.insert(user).values({ id: actorId, name: "Revisor simulado", email: `${actorId}@example.com` });
    own = await createScope();
    foreign = await createScope();
    const [brand] = await db.insert(clientProfiles).values({ workspaceId: own.workspaceId, name: "Outra marca" }).returning();
    siblingBrandId = brand.id;
    const [campaign] = await db.insert(campaigns).values({ ...own, name: "Campanha legada simulada" }).returning();
    campaignId = campaign.id;
    const [derivation] = await db.insert(derivations).values({ workspaceId: own.workspaceId, campaignId, status: "completed" }).returning();
    derivationId = derivation.id;
    outputId = await createOutput(own);
    siblingOutputId = await createOutput({ ...own, clientProfileId: siblingBrandId });
    foreignOutputId = await createOutput(foreign);
    invalidOutputId = await createOutput(own, foreign.workspaceId);
    invalidWorkOutputId = await createOutput({ workspaceId: foreign.workspaceId, clientProfileId: own.clientProfileId }, own.workspaceId);
    invalidBrandOutputId = await createOutput({ ...own, clientProfileId: foreign.clientProfileId });
  });

  afterAll(async () => {
    if (workspaceIds.length) await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
    await db.delete(user).where(eq(user.id, actorId));
  });

  it("persists, replays and reads legacy and current evidence without fictitious records", async () => {
    const input = {
      workspaceId: own.workspaceId, userId: actorId, creativeWorkOutputId: outputId,
      action: "approved" as const, source: "synthetic_fixture", idempotencyKey: `piece:${outputId}`,
      snapshotInput: { generationMode: "single", format: "4:5", creativeLevel: "balanced" },
    };
    const event = await recordLocalLearningDecisionEvidence(input);
    expect(event).toMatchObject({ ...own, campaignId: null, derivationId: null, creativeWorkOutputId: outputId });
    expect(await recordLocalLearningDecisionEvidence(input)).toEqual(event);
    const projected = await recordCalibrationSignalFromOutputDecisionEvent({ event, sourceLabel: "synthetic_fixture" });
    expect(await recordCalibrationSignalFromOutputDecisionEvent({ event, sourceLabel: "synthetic_fixture" }))
      .toMatchObject({ status: "skipped_existing", signalId: projected.signalId });

    const legacy = await recordOutputDecisionEvidence({
      ...own, userId: actorId, campaignId, derivationId, action: "approved", source: "synthetic_fixture",
      snapshotInput: input.snapshotInput,
    });
    await recordCalibrationSignalFromOutputDecisionEvent({ event: legacy, sourceLabel: "synthetic_fixture" });
    const filtered = await listOutputDecisionEvents({ workspaceId: own.workspaceId, creativeWorkOutputId: outputId });
    expect(filtered).toEqual([event]);
    expect(await listOutputDecisionEventsForDerivations([derivationId], own.workspaceId)).toEqual([legacy]);
    const events = await listOutputDecisionEventsForClient(own.clientProfileId, own.workspaceId);
    expect(events).toHaveLength(2);
    const signals = await listCalibrationSignalsForClientProfile(own);
    expect(signals).toHaveLength(2);
    expect(signals.find((signal) => signal.id === projected.signalId)).toMatchObject({
      ...own, creativeWorkOutputId: outputId, campaignId: null, derivationId: null,
      outputDecisionEventId: event.id, humanVerdict: "entra", systemOlharVerdict: null, systemExportStatus: null,
    });
    const draft = aggregateOutputLearningsFromEvents(events).find((row) => row.variableKey === "format")!;
    expect(draft).toMatchObject({ sampleEventCount: 2, sampleCampaignCount: 1 });
    expect(draft.supportingEvidence.find((ref) => ref.eventId === event.id)).toMatchObject({ creativeWorkOutputId: outputId, campaignId: null, derivationId: null });
    expect(buildBrandTasteProfile({ ...own, signals }).positivePatterns[0]).toMatchObject({
      count: 2, sampleDerivationIds: [derivationId], sampleCreativeWorkOutputIds: [outputId],
    });
    expect(buildPerBrandEvidenceReport({ ...own, signals })).toMatchObject({ decisionCount: 2, comparableCount: 0, missingDualVerdictCount: 2 });
    expect(await listOutputDecisionEventsForClient(own.clientProfileId, foreign.workspaceId)).toEqual([]);
    expect(await listCalibrationSignalsForClientProfile({ ...own, workspaceId: foreign.workspaceId })).toEqual([]);
    expect(await db.select().from(campaigns).where(eq(campaigns.workspaceId, own.workspaceId))).toHaveLength(1);
    expect(await db.select().from(derivations).where(eq(derivations.workspaceId, own.workspaceId))).toHaveLength(1);
    expect(await db.select().from(creativeWorkItems).where(eq(creativeWorkItems.workspaceId, own.workspaceId))).toHaveLength(4);
    expect(await db.select().from(creativeWorkOutputs).where(eq(creativeWorkOutputs.workspaceId, own.workspaceId))).toHaveLength(4);
  });

  it.each([
    ["event", "Peça"],
    ["event", "Trabalho"],
    ["signal", "Peça"],
    ["signal", "Trabalho"],
  ] as const)("refuses independent workspace mismatch in %s for %s without persistence", async (kind, scope) => {
    const creativeWorkOutputId = scope === "Peça" ? invalidOutputId : invalidWorkOutputId;
    const command = kind === "event"
      ? recordOutputDecisionEvidence({
        ...own, userId: actorId, creativeWorkOutputId, action: "approved", source: "synthetic_fixture",
      })
      : recordCalibrationSignal({
        ...own, creativeWorkOutputId, campaignId: null, derivationId: null, outputDecisionEventId: null,
        humanVerdict: "entra", systemOlharVerdict: null, systemExportStatus: null,
        mismatchBucket: null, sourceLabel: "synthetic_fixture", reviewerId: actorId,
        reviewedAt: new Date().toISOString(), sanitizedNote: null, idempotencyKey: randomUUID(),
      });
    await expect(command).rejects.toMatchObject({ code: "invalid_creative_work_output" });
    expect(await listOutputDecisionEvents({ workspaceId: own.workspaceId, creativeWorkOutputId })).toEqual([]);
    expect(await db.select().from(calibrationSignals).where(eq(calibrationSignals.creativeWorkOutputId, creativeWorkOutputId))).toEqual([]);
  });

  it("preserves a linked campaign in current Peça events, signals and aggregation", async () => {
    const linked = await createScope();
    const [campaign] = await db.insert(campaigns).values({ ...linked, name: "Campanha do Trabalho simulado" }).returning();
    const creativeWorkOutputId = await createOutput({ ...linked, campaignId: campaign.id });
    const event = await recordOutputDecisionEvidence({
      workspaceId: linked.workspaceId, userId: actorId, creativeWorkOutputId,
      action: "approved", source: "synthetic_fixture", snapshotInput: { generationMode: "single", format: "4:5" },
    });
    expect(event).toMatchObject({ ...linked, campaignId: campaign.id, derivationId: null, creativeWorkOutputId });
    const projected = await recordCalibrationSignalFromOutputDecisionEvent({ event, sourceLabel: "synthetic_fixture" });
    expect(await listCalibrationSignalsForClientProfile(linked)).toMatchObject([{
      id: projected.signalId, ...linked, campaignId: campaign.id, derivationId: null,
      creativeWorkOutputId, outputDecisionEventId: event.id,
    }]);
    const events = await listOutputDecisionEventsForClient(linked.clientProfileId, linked.workspaceId);
    expect(events).toEqual([event]);
    const draft = aggregateOutputLearningsFromEvents(events).find((row) => row.variableKey === "format")!;
    expect(draft).toMatchObject({ sampleEventCount: 1, sampleCampaignCount: 1 });
    expect(draft.supportingEvidence).toMatchObject([{ eventId: event.id, creativeWorkOutputId, campaignId: campaign.id }]);
  });

  it.each(["event", "signal"] as const)("enforces exactly one Peça reference for %s rows", async (kind) => {
    for (const refs of [
      { derivationId: null, creativeWorkOutputId: null },
      { derivationId, creativeWorkOutputId: outputId },
    ]) {
      const insert = kind === "event"
        ? db.insert(outputDecisionEvents).values({
          ...own, userId: actorId, campaignId, ...refs, action: "approved", direction: "positive", strength: "strong", source: "test",
        })
        : db.insert(calibrationSignals).values({
          ...own, campaignId, ...refs, humanVerdict: "entra", reviewerId: actorId, reviewedAt: new Date(), sourceLabel: "synthetic_fixture",
        });
      await expect(insert).rejects.toMatchObject({ cause: { code: "23514", constraint: `${kind === "event" ? "output_decision_events" : "calibration_signals"}_piece_reference_check` } });
    }
  });

  it("requires a real current Peça FK", async () => {
    await expect(db.insert(outputDecisionEvents).values({
      ...own, userId: actorId, creativeWorkOutputId: randomUUID(), action: "approved", direction: "positive", strength: "strong", source: "test",
    })).rejects.toMatchObject({ cause: { code: "23503" } });
  });

  it("keeps campaign mandatory for the legacy command", async () => {
    await expect(recordOutputDecisionEvidence({
      ...own, userId: actorId, derivationId, campaignId: null, action: "approved", source: "test",
    })).rejects.toMatchObject({ code: "invalid_campaign" });
  });

  it("refuses a different brand, workspace, Trabalho or campaign before persistence", async () => {
    const cases = [
      { creativeWorkOutputId: siblingOutputId, code: "invalid_creative_work_output_brand" },
      { creativeWorkOutputId: foreignOutputId, code: "invalid_creative_work_output" },
      { creativeWorkOutputId: invalidWorkOutputId, code: "invalid_creative_work_output" },
      { creativeWorkOutputId: invalidBrandOutputId, code: "invalid_creative_work_output" },
      { creativeWorkOutputId: outputId, campaignId, code: "invalid_creative_work_output_campaign" },
    ];
    for (const { code, ...refs } of cases) {
      await expect(recordOutputDecisionEvidence({ ...own, userId: actorId, ...refs, action: "approved", source: "test" }))
        .rejects.toMatchObject({ code });
    }
    expect(await listOutputDecisionEvents({ workspaceId: own.workspaceId, creativeWorkOutputId: siblingOutputId })).toEqual([]);
  });

  it("validates the same scope when a calibration signal is written directly", async () => {
    const payload = {
      ...own, campaignId: null, derivationId: null, outputDecisionEventId: null,
      humanVerdict: "entra" as const, systemOlharVerdict: null, systemExportStatus: null,
      mismatchBucket: null, sourceLabel: "synthetic_fixture" as const, reviewerId: actorId,
      reviewedAt: new Date().toISOString(), sanitizedNote: null,
    };
    await expect(recordCalibrationSignal({ ...payload, creativeWorkOutputId: siblingOutputId, idempotencyKey: randomUUID() }))
      .rejects.toMatchObject({ code: "invalid_creative_work_output_brand" });
    await expect(recordCalibrationSignal({ ...payload, creativeWorkOutputId: foreignOutputId, idempotencyKey: randomUUID() }))
      .rejects.toMatchObject({ code: "invalid_creative_work_output" });
  });
});
