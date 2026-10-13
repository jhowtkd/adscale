import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { calibrationRules, clientLearningProposals, clientProfiles, campaigns, derivations, humanQualityCorpusCandidates, user, workspaceMembers, workspaces } from "@/server/db/schema";
import { acceptClientLearningProposal, rejectClientLearningProposal } from "@/server/human-quality/learning/proposals";
import { generateAndPersistClientLearningProposals } from "@/server/human-quality/learning/generate";
import { getClientLearningProposalById, insertClientLearningProposal } from "./client-learning-proposal";
import { grantCorpusConsent, revokeCorpusConsent } from "./assistant-goal";
import * as consentRepository from "./assistant-goal";
import { insertCorpusItem, submitCorpusEvaluation } from "./human-quality-corpus";
import type { HumanQualityFailureReason } from "@/server/human-quality/corpus";
import {
  getApprovedCorpusQualityRuleForFailure,
  insertCalibrationRule,
  listCalibrationRulesForClientProfile,
} from "./calibration-rule";

const testUrl = process.env.TEST_DATABASE_URL
  ?? (process.env.CI === "true" ? process.env.DATABASE_URL : undefined);
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!(["localhost", "127.0.0.1"].includes(parsed.hostname) && parsed.pathname.endsWith("_test") && process.env.DATABASE_URL === testUrl)) {
    throw new Error("Calibration rule test requires matching local TEST_DATABASE_URL and DATABASE_URL ending in _test");
  }
}

const createdWorkspaces: string[] = [];
const createdUsers: string[] = [];

async function scope() {
  const id = randomUUID();
  const userId = `calibration-rule-${id}`;
  await db.insert(user).values({ id: userId, name: "Reviewer", email: `${id}@example.com`, emailVerified: true });
  createdUsers.push(userId);
  const [workspace] = await db.insert(workspaces).values({ name: id, slug: id }).returning();
  createdWorkspaces.push(workspace.id);
  await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId, role: "owner" });
  const [profile] = await db.insert(clientProfiles).values({ workspaceId: workspace.id, name: id }).returning();
  return { userId, workspaceId: workspace.id, clientProfileId: profile.id };
}

async function evidence(own: Awaited<ReturnType<typeof scope>>, reason: HumanQualityFailureReason, count = 3) {
  await grantCorpusConsent({ ...own, reviewedByUserId: own.userId });
  const [campaign] = await db.insert(campaigns).values({ ...own, name: "Corpus simulado" }).returning();
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const [derivation] = await db.insert(derivations).values({ workspaceId: own.workspaceId, campaignId: campaign.id, status: "completed" }).returning();
    const item = await insertCorpusItem({ ...own, campaignId: campaign.id, derivationId: derivation.id,
      generationMode: "art_variation", format: "1:1", cohort: "baseline", corpusVersion: 1,
      selectedByUserId: own.userId, artifactRef: { derivationId: derivation.id },
      qualitySnapshot: { qualityScore: 80, qualityVerdict: "pass" },
    });
    await db.insert(humanQualityCorpusCandidates).values({ ...own, campaignId: campaign.id, derivationId: derivation.id,
      generationMode: "art_variation", format: "1:1", sourceLabel: "synthetic_fixture",
      artifactRef: item.artifactRef, qualitySnapshot: item.qualitySnapshot });
    await submitCorpusEvaluation({ workspaceId: own.workspaceId, corpusItemId: item.id, reviewerUserId: own.userId,
      visualScore: 62, factualPass: true, intent: "reject", primaryFailureReason: reason });
    ids.push(item.id);
  }
  return ids;
}

describe.skipIf(!testUrl)("Corpus quality rule identity (Postgres)", () => {
  afterAll(async () => {
    if (createdWorkspaces.length) await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaces));
    if (createdUsers.length) await db.delete(user).where(inArray(user.id, createdUsers));
  });

  it.each(["visual_overload", "illegible_cta"] as const)("persists %s on acceptance and finds the same rule after removing the rationale prefix", async (primaryFailureReason) => {
    const own = await scope();
    const corpusItemIds = await evidence(own, primaryFailureReason);
    const proposal = await insertClientLearningProposal({
      workspaceId: own.workspaceId,
      clientProfileId: own.clientProfileId,
      sliceKey: `${own.workspaceId}:${own.clientProfileId}:${primaryFailureReason}|art_variation|1:1`,
      primaryFailureReason,
      rationale: "Limite a composição a três zonas de informação.",
      evidenceRefs: {
        corpusItemIds,
        stats: { count: 3, meanSignedDelta: 18, meanAbsError: 18, overScoreCount: 3, underScoreCount: 0 },
        fixtureOnly: true,
      },
    });
    const accepted = await acceptClientLearningProposal({
      proposalId: proposal.id,
      reviewerUserId: own.userId,
      acknowledgeFixtureOnly: true,
    });

    expect(accepted.proposal.status).toBe("accepted");
    expect(accepted.rule.primaryFailureReason).toBe(primaryFailureReason);
    const [persisted] = await listCalibrationRulesForClientProfile(own);
    expect(persisted).toMatchObject({
      id: accepted.rule.id,
      primaryFailureReason,
      rationale: `${primaryFailureReason}: Limite a composição a três zonas de informação.`,
    });

    await db.update(calibrationRules)
      .set({ rationale: "Use um foco visual dominante." })
      .where(eq(calibrationRules.id, accepted.rule.id));

    const found = await getApprovedCorpusQualityRuleForFailure({
      ...own,
      primaryFailureReason,
    });
    expect(found).toMatchObject({
      id: accepted.rule.id,
      primaryFailureReason,
      rationale: "Use um foco visual dominante.",
    });
  });

  it("persists rejection authorship and keeps the slice quarantined before requiring new independent evidence", async () => {
    const own = await scope();
    const oldIds = await evidence(own, "visual_overload");
    const generated = await generateAndPersistClientLearningProposals({ workspaceId: own.workspaceId });
    expect(generated.generated).toBe(1);
    const proposal = generated.proposals[0];
    // The fixture's evaluation dates precede the rejection without a real 30-day wait.
    const rejectedAt = new Date(Date.now() + 1_000);
    vi.useFakeTimers();
    vi.setSystemTime(rejectedAt);
    try {
      const rejected = await rejectClientLearningProposal({ proposalId: proposal.id, reviewerUserId: own.userId, reason: "  Precisa de novo apoio  " });
      expect(rejected).toMatchObject({ status: "rejected", rejectedBy: own.userId, rejectedAt, rejectedReason: "Precisa de novo apoio",
        cooldownUntil: new Date(rejectedAt.getTime() + 30 * 86_400_000) });
      expect(await getClientLearningProposalById(proposal.id)).toEqual(rejected);
      expect((await generateAndPersistClientLearningProposals({ workspaceId: own.workspaceId })).generated).toBe(0);
      await expect(rejectClientLearningProposal({ proposalId: proposal.id, reviewerUserId: own.userId, reason: "Sobrescrever" })).rejects.toMatchObject({ code: "not_proposed" });
      await expect(db.delete(user).where(eq(user.id, own.userId))).rejects.toThrow();
    } finally { vi.useRealTimers(); }
    const boundary = new Date(Date.now() - 60 * 86_400_000);
    await db.update(clientLearningProposals).set({ rejectedAt: boundary, cooldownUntil: new Date(boundary.getTime() + 30 * 86_400_000) }).where(eq(clientLearningProposals.id, proposal.id));
    expect((await generateAndPersistClientLearningProposals({ workspaceId: own.workspaceId })).generated).toBe(0);
    const newIds = await evidence(own, "visual_overload", 1);
    // Re-evaluating the same Peça is not three independent items.
    for (let i = 0; i < 2; i++) await submitCorpusEvaluation({ workspaceId: own.workspaceId, corpusItemId: newIds[0], reviewerUserId: own.userId,
      visualScore: 62, factualPass: true, intent: "reject", primaryFailureReason: "visual_overload" });
    expect((await generateAndPersistClientLearningProposals({ workspaceId: own.workspaceId })).generated).toBe(0);
    newIds.push(...await evidence(own, "visual_overload", 2));
    const fresh = await generateAndPersistClientLearningProposals({ workspaceId: own.workspaceId });
    expect(fresh.generated).toBe(1);
    expect(fresh.proposals[0].evidenceRefs.corpusItemIds.sort()).toEqual(newIds.sort());
    expect(fresh.proposals[0].evidenceRefs.corpusItemIds.some(id => oldIds.includes(id))).toBe(false);
  });

  it("cannot approve with synthetic confirmation after corpus consent is revoked", async () => {
    const own = await scope();
    await evidence(own, "visual_overload");
    const { proposals } = await generateAndPersistClientLearningProposals({ workspaceId: own.workspaceId });
    await revokeCorpusConsent({ ...own, reviewedByUserId: own.userId });
    await expect(acceptClientLearningProposal({ proposalId: proposals[0].id, reviewerUserId: own.userId, acknowledgeFixtureOnly: true }))
      .rejects.toMatchObject({ code: "client_consent_required" });
    expect(await listCalibrationRulesForClientProfile(own)).toEqual([]);
    expect((await getClientLearningProposalById(proposals[0].id))?.status).toBe("proposed");
  });

  it("serializes competing acceptance/rejection without orphan rules or overwritten rejection", async () => {
    const own = await scope();
    await evidence(own, "visual_overload");
    const { proposals } = await generateAndPersistClientLearningProposals({ workspaceId: own.workspaceId });
    const results = await Promise.allSettled([
      acceptClientLearningProposal({ proposalId: proposals[0].id, reviewerUserId: own.userId, acknowledgeFixtureOnly: true }),
      rejectClientLearningProposal({ proposalId: proposals[0].id, reviewerUserId: own.userId, reason: "Apoio insuficiente" }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const decided = await getClientLearningProposalById(proposals[0].id);
    const rules = await listCalibrationRulesForClientProfile(own);
    expect(rules).toHaveLength(decided?.status === "accepted" ? 1 : 0);
    if (decided?.status === "rejected") expect(decided.rejectedBy).toBe(own.userId);
  });

  it("rechecks consent at commit when it is revoked after the initial acceptance read", async () => {
    const own = await scope();
    await evidence(own, "visual_overload");
    const { proposals } = await generateAndPersistClientLearningProposals({ workspaceId: own.workspaceId });
    const read = consentRepository.getCorpusConsent;
    const spy = vi.spyOn(consentRepository, "getCorpusConsent").mockImplementation(async (workspaceId, clientProfileId) => {
      const consent = await read(workspaceId, clientProfileId);
      await revokeCorpusConsent({ ...own, reviewedByUserId: own.userId });
      return consent;
    });
    try {
      await expect(acceptClientLearningProposal({ proposalId: proposals[0].id, reviewerUserId: own.userId, acknowledgeFixtureOnly: true }))
        .rejects.toMatchObject({ code: "client_consent_required" });
      expect(await listCalibrationRulesForClientProfile(own)).toEqual([]);
      expect((await getClientLearningProposalById(proposals[0].id))?.status).toBe("proposed");
    } finally { spy.mockRestore(); }
  });

  it("uses prefixes only for legacy rules and preserves status, category and tenant filters", async () => {
    const own = await scope();
    const other = await scope();
    const input = {
      workspaceId: own.workspaceId,
      clientProfileId: own.clientProfileId,
      category: "corpus_quality",
      status: "approved",
      rationale: "illegible_cta: Dê destaque ao CTA.",
      approvedAt: new Date("2026-10-01T00:00:00Z"),
    };
    const legacy = await insertCalibrationRule(input);
    const structured = await insertCalibrationRule({
      ...input,
      primaryFailureReason: "visual_overload",
      approvedAt: new Date("2026-10-02T00:00:00Z"),
    });
    for (const overrides of [
      { category: "voice", status: "approved" },
      { status: "candidate" },
      { status: "deprecated" },
      { workspaceId: other.workspaceId, clientProfileId: other.clientProfileId },
    ]) {
      await insertCalibrationRule({
        ...input,
        primaryFailureReason: "visual_overload",
        approvedAt: new Date("2026-10-03T00:00:00Z"),
        ...overrides,
      });
    }

    expect(legacy.primaryFailureReason).toBeNull();
    expect(await getApprovedCorpusQualityRuleForFailure({
      ...own,
      primaryFailureReason: "illegible_cta",
    })).toMatchObject({ id: legacy.id });
    expect(await getApprovedCorpusQualityRuleForFailure({
      ...own,
      primaryFailureReason: "visual_overload",
    })).toMatchObject({ id: structured.id });
    expect(await getApprovedCorpusQualityRuleForFailure({
      ...own,
      workspaceId: other.workspaceId,
      primaryFailureReason: "visual_overload",
    })).toBeNull();
    expect(await getApprovedCorpusQualityRuleForFailure({
      ...own,
      clientProfileId: other.clientProfileId,
      primaryFailureReason: "visual_overload",
    })).toBeNull();
  });
});
