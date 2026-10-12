import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { campaigns, clientCorpusConsents, clientProfiles, derivations, user, workspaces } from "@/server/db/schema";
import { authorizeLocalLearning } from "./local-learning-authorization";
import { resolveEquipeTestDatabaseUrl } from "@/server/equipe/data/test-database";
import { recordLocalLearningDecisionEvidence } from "@/server/output-learning/output-decision-recorder";
import { listOutputDecisionEvents } from "@/server/repositories/output-decision-event";

const dispatch = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/server/output-learning/dispatch", () => ({ dispatchOutputLearningRecomputeBestEffort: dispatch }));

const testUrl = resolveEquipeTestDatabaseUrl();
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!(["localhost", "127.0.0.1"].includes(parsed.hostname) && parsed.pathname.endsWith("_test") && process.env.DATABASE_URL === testUrl)) {
    throw new Error("Local learning tests require matching local database URLs ending in _test");
  }
}

const workspaceIds: string[] = [];
const actorId = `learning-${randomUUID()}`;
const evidenceBrandId = randomUUID();
const campaignId = randomUUID();
const derivationId = randomUUID();
const unbrandedCampaignId = randomUUID();
const unbrandedDerivationId = randomUUID();
let own: { workspaceId: string; clientProfileId: string };
let other: { workspaceId: string; clientProfileId: string };

async function createScope() {
  const id = randomUUID();
  const [workspace] = await db.insert(workspaces).values({ name: id, slug: id }).returning();
  workspaceIds.push(workspace.id);
  const [brand] = await db.insert(clientProfiles).values({ workspaceId: workspace.id, name: id }).returning();
  return { workspaceId: workspace.id, clientProfileId: brand.id };
}

describe.skipIf(!testUrl)("local learning authorization (Postgres)", () => {
  beforeAll(async () => {
    own = await createScope();
    other = await createScope();
    await db.insert(user).values({ id: actorId, name: "Learning", email: `${actorId}@example.com` });
    await db.insert(clientProfiles).values({ id: evidenceBrandId, workspaceId: own.workspaceId, name: "Evidence brand" });
    await db.insert(campaigns).values([
      { id: campaignId, workspaceId: own.workspaceId, clientProfileId: evidenceBrandId, name: "Evidence campaign" },
      { id: unbrandedCampaignId, workspaceId: own.workspaceId, clientProfileId: null, name: "Unbranded campaign" },
    ]);
    await db.insert(derivations).values([
      { id: derivationId, workspaceId: own.workspaceId, campaignId, status: "completed" },
      { id: unbrandedDerivationId, workspaceId: own.workspaceId, campaignId: unbrandedCampaignId, status: "completed" },
    ]);
  });

  beforeEach(() => dispatch.mockClear());

  afterAll(async () => {
    if (workspaceIds.length) await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
    await db.delete(user).where(eq(user.id, actorId));
  });

  it("authorizes the own brand without a grant and after corpus consent is revoked", async () => {
    expect(await authorizeLocalLearning(own)).toEqual({ allowed: true });
    await db.insert(clientCorpusConsents).values({
      ...own, status: "revoked", reviewedByUserId: actorId, revokedAt: new Date(),
    });
    expect(await authorizeLocalLearning(own)).toEqual({ allowed: true });
  });

  it("refuses another workspace's brand and an unknown brand", async () => {
    expect(await authorizeLocalLearning({ ...own, clientProfileId: other.clientProfileId }))
      .toEqual({ allowed: false, reason: "brand_out_of_scope" });
    expect(await authorizeLocalLearning({ ...own, clientProfileId: randomUUID() }))
      .toEqual({ allowed: false, reason: "brand_out_of_scope" });
    expect(await authorizeLocalLearning(other)).toEqual({ allowed: true });
  });

  it("refuses absence and malformed scope with stable domain reasons", async () => {
    expect(await authorizeLocalLearning({ ...own, clientProfileId: null }))
      .toEqual({ allowed: false, reason: "missing_brand" });
    expect(await authorizeLocalLearning({ ...own, workspaceId: "invalid" }))
      .toEqual({ allowed: false, reason: "brand_out_of_scope" });
    expect(await authorizeLocalLearning({ ...own, clientProfileId: "invalid" }))
      .toEqual({ allowed: false, reason: "brand_out_of_scope" });
  });

  it("refuses relabeling another brand's evidence in the same workspace without insert or dispatch", async () => {
    await expect(recordLocalLearningDecisionEvidence({
      ...own, userId: actorId, campaignId, derivationId, action: "approved", source: "local-learning-test",
    })).rejects.toMatchObject({ reason: "brand_out_of_scope" });
    expect(await listOutputDecisionEvents({ workspaceId: own.workspaceId, derivationId })).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("captures only when the declared brand matches the owner of the campaign and derivation", async () => {
    const event = await recordLocalLearningDecisionEvidence({
      workspaceId: own.workspaceId, clientProfileId: evidenceBrandId, userId: actorId,
      campaignId, derivationId, action: "approved", source: "local-learning-test",
    });
    expect(event.clientProfileId).toBe(evidenceBrandId);
    expect(await listOutputDecisionEvents({ workspaceId: own.workspaceId, derivationId })).toMatchObject([{ id: event.id, clientProfileId: evidenceBrandId }]);
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("refuses an unbranded campaign even when the caller declares an authorized brand", async () => {
    await expect(recordLocalLearningDecisionEvidence({
      ...own, userId: actorId, campaignId: unbrandedCampaignId, derivationId: unbrandedDerivationId,
      action: "approved", source: "local-learning-test",
    })).rejects.toMatchObject({ reason: "missing_brand" });
    expect(await listOutputDecisionEvents({ workspaceId: own.workspaceId, derivationId: unbrandedDerivationId })).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("keeps the ownership check that binds the derivation to the authorized campaign", async () => {
    await expect(recordLocalLearningDecisionEvidence({
      workspaceId: own.workspaceId, clientProfileId: evidenceBrandId, userId: actorId,
      campaignId, derivationId: unbrandedDerivationId, action: "approved", source: "local-learning-test",
    })).rejects.toMatchObject({ code: "invalid_derivation_campaign" });
    expect(await listOutputDecisionEvents({ workspaceId: own.workspaceId, derivationId: unbrandedDerivationId })).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
