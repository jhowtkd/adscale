import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { editLearningProposal } from "@/server/human-quality/learning/proposal-approval";
import { learningProposalRevision } from "@/server/brand-taste/proposal-review";
import { calibrationRules, clientLearningProposals, clientProfiles, campaigns, derivations, humanQualityCorpusCandidates, humanQualityCorpusItems, humanQualityEvaluations, user, workspaceMembers, workspaces } from "@/server/db/schema";
import { acceptClientLearningProposal, rejectClientLearningProposal } from "@/server/human-quality/learning/proposals";
import { generateAndPersistClientLearningProposals } from "@/server/human-quality/learning/generate";
import { getClientLearningProposalById, insertClientLearningProposal } from "./client-learning-proposal";
import { grantCorpusConsent, revokeCorpusConsent } from "./assistant-goal";
import * as consentRepository from "./assistant-goal";
import { getCorpusItemById, insertCorpusItem, submitCorpusEvaluation } from "./human-quality-corpus";
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
  vi.stubEnv("PLATFORM_OWNER_EMAILS", `${process.env.PLATFORM_OWNER_EMAILS ?? ""},${id}@example.com`);
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

async function recapture(own: Awaited<ReturnType<typeof scope>>, ids: string[], corpusVersion: number) {
  for (const id of ids) {
    const original = (await getCorpusItemById(own.workspaceId, id))!;
    const item = await insertCorpusItem({ workspaceId: own.workspaceId, clientProfileId: own.clientProfileId,
      campaignId: original.campaignId, derivationId: original.derivationId, generationMode: original.generationMode,
      format: original.format, cohort: original.cohort, corpusVersion, selectedByUserId: own.userId,
      artifactRef: original.artifactRef, qualitySnapshot: original.qualitySnapshot });
    await submitCorpusEvaluation({ workspaceId: own.workspaceId, corpusItemId: item.id, reviewerUserId: own.userId,
      visualScore: 62, factualPass: true, intent: "reject", primaryFailureReason: "visual_overload" });
  }
}

async function saveForApproval(row: typeof clientLearningProposals.$inferSelect, reviewerUserId: string) {
  return editLearningProposal({ kind: "corpus_quality", proposalId: row.id, reviewerUserId,
    expectedRevision: learningProposalRevision("corpus_quality", row), text: row.rationale,
    metadata: { category: "corpus_quality", nature: "visual", roles: ["art_direction"], generationModes: ["art_variation"], formats: ["1:1"] } });
}

describe.skipIf(!testUrl)("Corpus quality rule identity (Postgres)", () => {
  afterAll(async () => {
    if (createdWorkspaces.length) await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaces));
    if (createdUsers.length) await db.delete(user).where(inArray(user.id, createdUsers));
    vi.unstubAllEnvs();
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
    const edited = await editLearningProposal({ kind: "corpus_quality", proposalId: proposal.id, reviewerUserId: own.userId, expectedRevision: learningProposalRevision("corpus_quality", proposal), text: proposal.rationale, metadata: { category: "corpus_quality", nature: "visual", roles: ["art_direction"], generationModes: ["art_variation"], formats: ["1:1"] } });
    const accepted = await acceptClientLearningProposal({
      expectedRevision: edited.expectedRevision,
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
      rationale: "Limite a composição a três zonas de informação.",
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
    const edited = await saveForApproval(proposals[0], own.userId);
    await revokeCorpusConsent({ ...own, reviewedByUserId: own.userId });
    await expect(acceptClientLearningProposal({ proposalId: proposals[0].id, reviewerUserId: own.userId, expectedRevision: edited.expectedRevision, acknowledgeFixtureOnly: true }))
      .rejects.toMatchObject({ code: "client_consent_required" });
    expect(await listCalibrationRulesForClientProfile(own)).toEqual([]);
    expect((await getClientLearningProposalById(proposals[0].id))?.status).toBe("proposed");
  });

  it("does not count three corpus versions of one Peça as three independent supporters", async () => {
    const own = await scope();
    const ids = await evidence(own, "visual_overload", 1);
    await recapture(own, ids, 2);
    await recapture(own, ids, 3);
    expect((await generateAndPersistClientLearningProposals({ workspaceId: own.workspaceId })).generated).toBe(0);
  });

  it("excludes recaptured Peças from rejected support even in another corpus version", async () => {
    const own = await scope();
    const ids = await evidence(own, "visual_overload");
    const { proposals } = await generateAndPersistClientLearningProposals({ workspaceId: own.workspaceId });
    await rejectClientLearningProposal({ proposalId: proposals[0].id, reviewerUserId: own.userId, reason: "Precisa de novas Peças" });
    const boundary = new Date(Date.now() - 60 * 86_400_000);
    await db.update(clientLearningProposals).set({ rejectedAt: boundary, cooldownUntil: new Date(boundary.getTime() + 30 * 86_400_000) })
      .where(eq(clientLearningProposals.id, proposals[0].id));
    await recapture(own, ids, 2);
    expect((await generateAndPersistClientLearningProposals({ workspaceId: own.workspaceId })).generated).toBe(0);
    const freshIds = await evidence(own, "visual_overload");
    const fresh = await generateAndPersistClientLearningProposals({ workspaceId: own.workspaceId });
    expect(fresh.generated).toBe(1);
    expect(fresh.proposals[0].evidenceRefs.corpusItemIds.sort()).toEqual(freshIds.sort());
  });

  it.each([true, false])("keeps cumulative rejection history with coherent dates, replay=%s", async replayOld => {
    const own = await scope();
    const firstBoundary = new Date(Date.now() - 120 * 86_400_000);
    const secondBoundary = new Date(Date.now() - 60 * 86_400_000);
    const firstIds = await evidence(own, "visual_overload");
    await db.update(humanQualityCorpusItems).set({ selectedAt: new Date(firstBoundary.getTime() - 120_000),
      createdAt: new Date(firstBoundary.getTime() - 120_000), updatedAt: new Date(firstBoundary.getTime() - 60_000) })
      .where(inArray(humanQualityCorpusItems.id, firstIds));
    await db.update(humanQualityEvaluations).set({ createdAt: new Date(firstBoundary.getTime() - 60_000) })
      .where(inArray(humanQualityEvaluations.corpusItemId, firstIds));
    const first = (await generateAndPersistClientLearningProposals({ workspaceId: own.workspaceId })).proposals[0];
    await rejectClientLearningProposal({ proposalId: first.id, reviewerUserId: own.userId, reason: "Primeiro apoio rejeitado" });
    await db.update(clientLearningProposals).set({ proposedAt: new Date(firstBoundary.getTime() - 30_000),
      createdAt: new Date(firstBoundary.getTime() - 30_000), rejectedAt: firstBoundary,
      cooldownUntil: new Date(firstBoundary.getTime() + 30 * 86_400_000) }).where(eq(clientLearningProposals.id, first.id));
    const secondIds = await evidence(own, "visual_overload");
    await db.update(humanQualityCorpusItems).set({ selectedAt: new Date(secondBoundary.getTime() - 120_000),
      createdAt: new Date(secondBoundary.getTime() - 120_000), updatedAt: new Date(secondBoundary.getTime() - 60_000) })
      .where(inArray(humanQualityCorpusItems.id, secondIds));
    await db.update(humanQualityEvaluations).set({ createdAt: new Date(secondBoundary.getTime() - 60_000) })
      .where(inArray(humanQualityEvaluations.corpusItemId, secondIds));
    const secondResult = await generateAndPersistClientLearningProposals({ workspaceId: own.workspaceId });
    expect(secondResult.generated).toBe(1);
    expect(secondResult.proposals[0].evidenceRefs.corpusItemIds.sort()).toEqual(secondIds.sort());
    const second = secondResult.proposals[0];
    await rejectClientLearningProposal({ proposalId: second.id, reviewerUserId: own.userId, reason: "Segundo apoio rejeitado" });
    await db.update(clientLearningProposals).set({ proposedAt: new Date(secondBoundary.getTime() - 30_000),
      createdAt: new Date(secondBoundary.getTime() - 30_000), rejectedAt: secondBoundary,
      cooldownUntil: new Date(secondBoundary.getTime() + 30 * 86_400_000) }).where(eq(clientLearningProposals.id, second.id));
    const newIds = replayOld ? null : await evidence(own, "visual_overload");
    if (replayOld) await recapture(own, firstIds, 2);
    const result = await generateAndPersistClientLearningProposals({ workspaceId: own.workspaceId });
    expect(result.generated).toBe(replayOld ? 0 : 1);
    if (newIds) expect(result.proposals[0].evidenceRefs.corpusItemIds.sort()).toEqual(newIds.sort());
  });

  it("serializes competing acceptance/rejection without orphan rules or overwritten rejection", async () => {
    const own = await scope();
    await evidence(own, "visual_overload");
    const { proposals } = await generateAndPersistClientLearningProposals({ workspaceId: own.workspaceId });
    const edited = await saveForApproval(proposals[0], own.userId);
    const results = await Promise.allSettled([
      acceptClientLearningProposal({ proposalId: proposals[0].id, reviewerUserId: own.userId, expectedRevision: edited.expectedRevision, acknowledgeFixtureOnly: true }),
      rejectClientLearningProposal({ proposalId: proposals[0].id, reviewerUserId: own.userId, reason: "Apoio insuficiente" }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const decided = await getClientLearningProposalById(proposals[0].id);
    const rules = await listCalibrationRulesForClientProfile(own);
    expect(rules).toHaveLength(decided?.status === "accepted" ? 1 : 0);
    if (decided?.status === "rejected") expect(decided.rejectedBy).toBe(own.userId);
  });

  it("accepts available proposal support outside the latest 500 evaluated items", async () => {
    const own = await scope();
    const ids = await evidence(own, "visual_overload");
    const { proposals } = await generateAndPersistClientLearningProposals({ workspaceId: own.workspaceId });
    const edited = await saveForApproval(proposals[0], own.userId);
    await evidence(own, "illegible_cta", 500);
    const accepted = await acceptClientLearningProposal({ proposalId: proposals[0].id, reviewerUserId: own.userId, expectedRevision: edited.expectedRevision, acknowledgeFixtureOnly: true });
    expect(accepted.proposal.status).toBe("accepted");
    expect(accepted.rule.supportingEvidenceRefs).toHaveLength(3);
    expect(accepted.rule.supportingEvidenceRefs).toEqual(expect.arrayContaining(ids.map(id => ({ kind: "corpus_item", id }))));
  }, 60_000);

  it("rechecks consent at commit when it is revoked after the initial acceptance read", async () => {
    const own = await scope();
    await evidence(own, "visual_overload");
    const { proposals } = await generateAndPersistClientLearningProposals({ workspaceId: own.workspaceId });
    const edited = await saveForApproval(proposals[0], own.userId);
    const read = consentRepository.getCorpusConsent;
    const spy = vi.spyOn(consentRepository, "getCorpusConsent").mockImplementation(async (workspaceId, clientProfileId) => {
      const consent = await read(workspaceId, clientProfileId);
      await revokeCorpusConsent({ ...own, reviewedByUserId: own.userId });
      return consent;
    });
    try {
      await expect(acceptClientLearningProposal({ proposalId: proposals[0].id, reviewerUserId: own.userId, expectedRevision: edited.expectedRevision, acknowledgeFixtureOnly: true }))
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
