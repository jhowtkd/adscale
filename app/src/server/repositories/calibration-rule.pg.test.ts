import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { calibrationRules, clientProfiles, user, workspaces } from "@/server/db/schema";
import { editLearningProposal } from "@/server/human-quality/learning/proposal-approval";
import { learningProposalRevision } from "@/server/brand-taste/proposal-review";
import { acceptClientLearningProposal } from "@/server/human-quality/learning/proposals";
import { insertClientLearningProposal } from "./client-learning-proposal";
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
  const [profile] = await db.insert(clientProfiles).values({ workspaceId: workspace.id, name: id }).returning();
  return { userId, workspaceId: workspace.id, clientProfileId: profile.id };
}

describe.skipIf(!testUrl)("Corpus quality rule identity (Postgres)", () => {
  afterAll(async () => {
    if (createdWorkspaces.length) await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaces));
    if (createdUsers.length) await db.delete(user).where(inArray(user.id, createdUsers));
    vi.unstubAllEnvs();
  });

  it.each(["visual_overload", "illegible_cta"])("persists %s on acceptance and finds the same rule after removing the rationale prefix", async (primaryFailureReason) => {
    const own = await scope();
    const proposal = await insertClientLearningProposal({
      workspaceId: own.workspaceId,
      clientProfileId: own.clientProfileId,
      sliceKey: `${own.workspaceId}:${own.clientProfileId}:${primaryFailureReason}|art_variation|1:1`,
      primaryFailureReason,
      rationale: "Limite a composição a três zonas de informação.",
      evidenceRefs: {
        corpusItemIds: Array.from({ length: 3 }, () => randomUUID()),
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
