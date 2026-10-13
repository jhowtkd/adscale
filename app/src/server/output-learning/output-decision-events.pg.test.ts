import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { campaigns, clientProfiles, derivations, user, workspaces } from "@/server/db/schema";
import { resolveEquipeTestDatabaseUrl } from "@/server/equipe/data/test-database";
import { insertOutputDecisionEvent, listOutputDecisionEvents } from "@/server/repositories/output-decision-event";
import { listCalibrationSignalsForClientProfile } from "@/server/repositories/calibration-signal";
import { recordCalibrationSignalFromOutputDecisionEvent } from "@/server/brand-taste/calibration-signal-recorder";
import { mapActionToSemantics } from "./output-decision-events";
import { recordOutputDecisionEvidence } from "./output-decision-recorder";
import { recomputeClientOutputLearnings } from "./service";

vi.mock("./dispatch", () => ({ dispatchOutputLearningRecomputeBestEffort: vi.fn() }));
vi.mock("@/server/memory/output-learning-projection", () => ({ projectOutputLearnings: vi.fn() }));

const testUrl = resolveEquipeTestDatabaseUrl();
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!(["localhost", "127.0.0.1"].includes(parsed.hostname) && parsed.pathname.endsWith("_test") && process.env.DATABASE_URL === testUrl)) {
    throw new Error("Output decisions require matching local database URLs ending in _test");
  }
}

const workspaceId = randomUUID();
const clientProfileId = randomUUID();
const campaignId = randomUUID();
const derivationId = randomUUID();
const userId = `output-decisions-${randomUUID()}`;
const scope = { workspaceId, clientProfileId, campaignId, derivationId, userId };

describe.skipIf(!testUrl)("output decision vocabulary (Postgres)", () => {
  beforeAll(async () => {
    const result = await db.execute(sql`select current_database() as name`);
    expect(result.rows[0].name).toBe(new URL(testUrl!).pathname.slice(1));
    await db.insert(user).values({ id: userId, name: "Operador simulado", email: `${userId}@example.com` });
    await db.insert(workspaces).values({ id: workspaceId, name: "Decisões simuladas", slug: workspaceId });
    await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Marca simulada" });
    await db.insert(campaigns).values({ id: campaignId, workspaceId, clientProfileId, name: "Campanha simulada" });
    await db.insert(derivations).values({ id: derivationId, workspaceId, campaignId, status: "completed" });
  });

  afterAll(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(user).where(eq(user.id, userId));
  });

  it("defaults existing direct decisions to human authorship", async () => {
    const event = await recordOutputDecisionEvidence({ ...scope, action: "approved", source: "synthetic_fixture" });
    expect(event).toMatchObject({ authorType: "human", actorId: null, actorRole: null, equipeEventId: null });
  });

  it.each([
    "alternative_not_selected", "favorited", "favorite_removed", "selection_replaced",
    "variation_requested", "format_adapted", "layer_regenerated",
  ] as const)("persists and replays %s without creating a human calibration signal", async (action) => {
    const input = {
      ...scope, action, source: "synthetic_fixture", idempotencyKey: `${workspaceId}:${action}`,
      snapshotInput: { generationMode: "art_variation", format: "1:1", ctaText: "Comprar agora" },
    };
    const event = await recordOutputDecisionEvidence(input);
    expect(event).toMatchObject(mapActionToSemantics(action));
    expect(await recordOutputDecisionEvidence(input)).toEqual(event);
    expect(await listOutputDecisionEvents({ workspaceId, action })).toEqual([event]);
    expect(await recordCalibrationSignalFromOutputDecisionEvent({ event, sourceLabel: "synthetic_fixture" }))
      .toEqual({ status: "skipped_unmappable" });
    expect(await listCalibrationSignalsForClientProfile({ workspaceId, clientProfileId })).toEqual([]);
  });

  it.each([
    { action: "unknown" }, { direction: "unknown" }, { strength: "unknown" },
  ])("rejects values outside the persisted vocabulary: %j", async (invalid) => {
    await expect(insertOutputDecisionEvent({
      ...scope, ...mapActionToSemantics("approved"), source: "synthetic_fixture", ...invalid,
    })).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  it("recomputes mixed persisted evidence without counting weak context as strong votes", async () => {
    const actions = ["approved", "approved", "favorited", "alternative_not_selected"] as const;
    for (const [i, action] of actions.entries()) {
      await recordOutputDecisionEvidence({
        ...scope, action, source: "synthetic_fixture", idempotencyKey: `mixed-${i}`,
        snapshotInput: { generationMode: "art_variation", format: "1:1", ctaText: "Confira a oferta" },
      });
    }
    const result = await recomputeClientOutputLearnings({ workspaceId, clientProfileId });
    const cta = result.learnings.find((item) => item.variableKey === "cta" && item.variableValue === "Confira a oferta");
    expect(cta).toMatchObject({ status: "approved", confidence: "high", confidenceScore: "0.7000", sampleEventCount: 4 });
    expect(cta?.supportingEvidence.filter((item) => item.strength === "strong")).toHaveLength(2);
    expect(cta?.supportingEvidence.filter((item) => item.strength === "weak")).toHaveLength(1);
    expect(cta?.contradictingEvidence).toHaveLength(1);
    const replay = await recomputeClientOutputLearnings({ workspaceId, clientProfileId });
    expect(replay.learnings.find((item) => item.id === cta?.id))
      .toMatchObject({ confidenceScore: "0.7000", sampleEventCount: 4 });
  });
});
