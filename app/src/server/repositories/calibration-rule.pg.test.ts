import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { calibrationRules, clientProfiles, user, workspaces } from "@/server/db/schema";
import { acceptClientLearningProposal } from "@/server/human-quality/learning/proposals";
import { insertClientLearningProposal } from "./client-learning-proposal";
import {
  getApprovedCorpusQualityRuleForFailure,
  insertCalibrationRule,
  listCalibrationRulesForClientProfile,
} from "./calibration-rule";

const testUrl = process.env.TEST_DATABASE_URL;
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
  const [profile] = await db.insert(clientProfiles).values({ workspaceId: workspace.id, name: id }).returning();
  return { userId, workspaceId: workspace.id, clientProfileId: profile.id };
}

describe.skipIf(!testUrl)("Corpus quality rule identity (Postgres)", () => {
  afterAll(async () => {
    if (createdWorkspaces.length) await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaces));
    if (createdUsers.length) await db.delete(user).where(inArray(user.id, createdUsers));
  });

  it("persists the accepted reason and finds the same rule after removing the rationale prefix", async () => {
    const own = await scope();
    const proposal = await insertClientLearningProposal({
      workspaceId: own.workspaceId,
      clientProfileId: own.clientProfileId,
      sliceKey: `${own.workspaceId}:${own.clientProfileId}:visual_overload|art_variation|1:1`,
      primaryFailureReason: "visual_overload",
      rationale: "Limite a composição a três zonas de informação.",
      evidenceRefs: {
        corpusItemIds: Array.from({ length: 3 }, () => randomUUID()),
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
    expect(accepted.rule.primaryFailureReason).toBe("visual_overload");
    const [persisted] = await listCalibrationRulesForClientProfile(own);
    expect(persisted).toMatchObject({
      id: accepted.rule.id,
      primaryFailureReason: "visual_overload",
      rationale: "visual_overload: Limite a composição a três zonas de informação.",
    });

    await db.update(calibrationRules)
      .set({ rationale: "Use um foco visual dominante." })
      .where(eq(calibrationRules.id, accepted.rule.id));

    const found = await getApprovedCorpusQualityRuleForFailure({
      ...own,
      primaryFailureReason: "visual_overload",
    });
    expect(found).toMatchObject({
      id: accepted.rule.id,
      primaryFailureReason: "visual_overload",
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
