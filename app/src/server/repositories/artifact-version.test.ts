import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  ArtifactVersionValidationError,
  assertArtifactScope,
  assertSafeArtifactJson,
  isValidProposalTransition,
  promoteArtifactVersion,
} from "./artifact-version";
import {
  artifactPromotionCommandSchema,
  comparisonAcknowledgementCommandSchema,
} from "../../lib/assistant/artifact-version";
import { db } from "../db";
import {
  assistantArtifactApprovalEvents,
  assistantArtifactComparisonAcknowledgements,
  assistantArtifactLineageHeads,
  assistantArtifactLineages,
  assistantArtifactProposals,
  assistantArtifactVersions,
  assistantThreads,
  campaigns,
  clientProfiles,
  creativePlans,
  derivations,
  workspaces,
} from "../db/schema";

const scope = {
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  campaignId: "campaign-1",
  threadId: "thread-1",
};

describe("artifact version repository invariants", () => {
  it.each([
    ["workspaceId", "Cross-workspace"],
    ["clientProfileId", "Cross-client"],
    ["campaignId", "Cross-campaign"],
    ["threadId", "Cross-thread"],
  ] as const)("rejects mismatched %s", (key, message) => {
    expect(() => assertArtifactScope(scope, { ...scope, [key]: "other" })).toThrow(
      message
    );
  });

  it("accepts an exact four-dimensional scope", () => {
    expect(() => assertArtifactScope(scope, scope)).not.toThrow();
  });

  it("rejects nested denied proposal payloads", () => {
    expect(() =>
      assertSafeArtifactJson({ change: { signedUrl: "secret" } }, "payload")
    ).toThrow(ArtifactVersionValidationError);
  });

  it("rejects prompt and provider payload fields outside the shared denylist", () => {
    expect(() =>
      assertSafeArtifactJson(
        { intendedChange: { inputPrompt: "hidden", providerPayload: {} } },
        "payload"
      )
    ).toThrow(ArtifactVersionValidationError);
  });

  it("allows pending proposals to become stale, confirmed, or canceled", () => {
    expect(isValidProposalTransition("pending", "stale")).toBe(true);
    expect(isValidProposalTransition("pending", "confirmed")).toBe(true);
    expect(isValidProposalTransition("pending", "canceled")).toBe(true);
  });

  it("does not revive stale or terminal proposals", () => {
    expect(isValidProposalTransition("stale", "confirmed")).toBe(false);
    expect(isValidProposalTransition("confirmed", "pending")).toBe(false);
    expect(isValidProposalTransition("canceled", "pending")).toBe(false);
  });

  it("requires every promotion head revision and rejects mixed or unknown targets", () => {
    const plan = {
      type: "plan",
      operationId: "00000000-0000-4000-8000-000000000001",
      lineageId: "00000000-0000-4000-8000-000000000002",
      targetVersionId: "00000000-0000-4000-8000-000000000003",
      expectedOfficialVersionId: "00000000-0000-4000-8000-000000000004",
      expectedRevision: 2,
    };

    expect(artifactPromotionCommandSchema.safeParse(plan).success).toBe(true);
    expect(
      artifactPromotionCommandSchema.safeParse({
        ...plan,
        expectedOfficialVersionId: null,
      }).success
    ).toBe(true);
    expect(
      artifactPromotionCommandSchema.safeParse({
        ...plan,
        expectedRevision: undefined,
      }).success
    ).toBe(false);
    expect(
      artifactPromotionCommandSchema.safeParse({
        ...plan,
        planTransition: null,
      }).success
    ).toBe(false);
    expect(
      artifactPromotionCommandSchema.safeParse({
        ...plan,
        unknown: true,
      }).success
    ).toBe(false);
  });

  it("binds comparison acknowledgement to both versions, lineage, and revision", () => {
    const command = {
      creativeTargetVersionId: "00000000-0000-4000-8000-000000000001",
      planLineageId: "00000000-0000-4000-8000-000000000002",
      linkedPlanVersionId: "00000000-0000-4000-8000-000000000003",
      comparedOfficialPlanVersionId: "00000000-0000-4000-8000-000000000004",
      expectedPlanRevision: 3,
    };

    expect(comparisonAcknowledgementCommandSchema.safeParse(command).success).toBe(
      true
    );
    expect(
      comparisonAcknowledgementCommandSchema.safeParse({
        ...command,
        expectedPlanRevision: undefined,
      }).success
    ).toBe(false);
    expect(
      comparisonAcknowledgementCommandSchema.safeParse({
        ...command,
        clientApproved: true,
      }).success
    ).toBe(false);
  });
});

const describeDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const cleanupWorkspaceIds: string[] = [];

describeDb("artifact promotion transaction", () => {
  afterEach(async () => {
    for (const workspaceId of cleanupWorkspaceIds.splice(0)) {
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    }
  });

  async function seedPromotionFixture() {
    const ids = Object.fromEntries(
      [
        "workspace",
        "client",
        "campaign",
        "thread",
        "plan",
        "planLineage",
        "planV1",
        "planV2",
        "creativeLineage",
        "creativeV1",
        "creativeV2",
        "derivation1",
        "derivation2",
      ].map((key) => [key, crypto.randomUUID()])
    ) as Record<string, string>;
    cleanupWorkspaceIds.push(ids.workspace);
    await db.insert(workspaces).values({
      id: ids.workspace,
      name: "Promotion test",
      slug: `promotion-${ids.workspace}`,
    });
    await db.insert(clientProfiles).values({
      id: ids.client,
      workspaceId: ids.workspace,
      name: "Client",
    });
    await db.insert(campaigns).values({
      id: ids.campaign,
      workspaceId: ids.workspace,
      clientProfileId: ids.client,
      name: "Campaign",
      constraints: "old constraints",
    });
    await db.insert(creativePlans).values({
      id: ids.plan,
      workspaceId: ids.workspace,
      campaignId: ids.campaign,
      strategy: "old strategy",
      angles: ["old angle"],
      hooks: ["old hook"],
      ctas: ["old cta"],
      status: "approved",
    });
    await db.insert(assistantThreads).values({
      id: ids.thread,
      workspaceId: ids.workspace,
      clientProfileId: ids.client,
      campaignId: ids.campaign,
      name: "Thread",
    });
    await db.insert(derivations).values([
      { id: ids.derivation1, workspaceId: ids.workspace, campaignId: ids.campaign, planId: ids.plan, status: "approved" },
      { id: ids.derivation2, workspaceId: ids.workspace, campaignId: ids.campaign, planId: ids.plan, status: "completed" },
    ]);
    const scope = {
      workspaceId: ids.workspace,
      clientProfileId: ids.client,
      campaignId: ids.campaign,
      threadId: ids.thread,
    };
    const provenance = (originalArtifactId: string, planVersionId: string | null = null) => ({
      origin: "native" as const,
      originalArtifactId,
      sourceVersionId: null,
      messageId: null,
      actionId: null,
      planVersionId,
      format: null,
      generationMode: null,
    });
    await db.insert(assistantArtifactLineages).values([
      { id: ids.planLineage, artifactType: "plan", ...scope, originalArtifactId: ids.plan, origin: "native" },
      { id: ids.creativeLineage, artifactType: "creative", ...scope, originalArtifactId: ids.derivation1, origin: "native" },
    ]);
    await db.insert(assistantArtifactVersions).values([
      {
        id: ids.planV1,
        lineageId: ids.planLineage,
        ...scope,
        versionNumber: 1,
        status: "approved",
        snapshot: { type: "plan", strategy: "old strategy", angles: ["old angle"], hooks: ["old hook"], ctas: ["old cta"], constraints: "old constraints" },
        provenance: provenance(ids.plan),
      },
      {
        id: ids.planV2,
        lineageId: ids.planLineage,
        ...scope,
        versionNumber: 2,
        sourceVersionId: ids.planV1,
        status: "ready",
        snapshot: { type: "plan", strategy: "new strategy", angles: ["new angle"], hooks: ["new hook"], ctas: ["new cta"], constraints: "new constraints" },
        provenance: { ...provenance(ids.plan), sourceVersionId: ids.planV1 },
      },
      {
        id: ids.creativeV1,
        lineageId: ids.creativeLineage,
        ...scope,
        versionNumber: 1,
        status: "approved",
        snapshot: { type: "creative", derivationId: ids.derivation1, outputKey: null, format: "1:1", generationMode: "art_variation", ctaText: null, planVersionId: ids.planV1 },
        provenance: provenance(ids.derivation1, ids.planV1),
      },
      {
        id: ids.creativeV2,
        lineageId: ids.creativeLineage,
        ...scope,
        versionNumber: 2,
        sourceVersionId: ids.creativeV1,
        status: "ready",
        snapshot: { type: "creative", derivationId: ids.derivation2, outputKey: null, format: "1:1", generationMode: "creative_revision", ctaText: null, planVersionId: ids.planV2 },
        provenance: { ...provenance(ids.derivation2, ids.planV2), sourceVersionId: ids.creativeV1 },
      },
    ]);
    await db.insert(assistantArtifactLineageHeads).values([
      { lineageId: ids.planLineage, approvedCurrentVersionId: ids.planV1, workingVersionId: ids.planV2, revision: 0 },
      { lineageId: ids.creativeLineage, approvedCurrentVersionId: ids.creativeV1, workingVersionId: ids.creativeV2, revision: 0 },
    ]);
    return { ids, scope };
  }

  it("rolls back a head CAS when the canonical plan write fails", async () => {
    const { ids, scope } = await seedPromotionFixture();
    await db.update(assistantArtifactLineages).set({ originalArtifactId: crypto.randomUUID() }).where(eq(assistantArtifactLineages.id, ids.planLineage));

    await expect(promoteArtifactVersion({
      scope,
      command: {
        type: "plan",
        operationId: crypto.randomUUID(),
        lineageId: ids.planLineage,
        targetVersionId: ids.planV2,
        expectedOfficialVersionId: ids.planV1,
        expectedRevision: 0,
      },
    })).rejects.toThrow("Canonical plan write failed");

    const [head] = await db.select().from(assistantArtifactLineageHeads).where(eq(assistantArtifactLineageHeads.lineageId, ids.planLineage));
    const events = await db.select().from(assistantArtifactApprovalEvents).where(eq(assistantArtifactApprovalEvents.workspaceId, ids.workspace));
    expect(head).toMatchObject({ approvedCurrentVersionId: ids.planV1, revision: 0 });
    expect(events).toHaveLength(0);
  });

  it("promotes the first official version from a null head", async () => {
    const { ids, scope } = await seedPromotionFixture();
    await db
      .update(assistantArtifactLineageHeads)
      .set({ approvedCurrentVersionId: null })
      .where(eq(assistantArtifactLineageHeads.lineageId, ids.planLineage));

    const result = await promoteArtifactVersion({
      scope,
      command: {
        type: "plan",
        operationId: crypto.randomUUID(),
        lineageId: ids.planLineage,
        targetVersionId: ids.planV2,
        expectedOfficialVersionId: null,
        expectedRevision: 0,
      },
    });

    const [head] = await db
      .select()
      .from(assistantArtifactLineageHeads)
      .where(eq(assistantArtifactLineageHeads.lineageId, ids.planLineage));
    expect(result.promotions).toEqual([
      expect.objectContaining({ previousVersionNumber: null, targetVersionNumber: 2 }),
    ]);
    expect(head).toMatchObject({
      approvedCurrentVersionId: ids.planV2,
      workingVersionId: ids.planV2,
      revision: 1,
    });
  });

  it("rolls back plan CAS, canonical writes, proposal staling, and history when creative CAS conflicts", async () => {
    const { ids, scope } = await seedPromotionFixture();
    const acknowledgementId = crypto.randomUUID();
    await db.insert(assistantArtifactComparisonAcknowledgements).values({
      id: acknowledgementId,
      creativeTargetVersionId: ids.creativeV2,
      planLineageId: ids.planLineage,
      linkedPlanVersionId: ids.planV2,
      comparedOfficialPlanVersionId: ids.planV1,
      comparedPlanHeadRevision: 0,
      ...scope,
    });
    await db.insert(assistantArtifactProposals).values({
      lineageId: ids.planLineage,
      sourceVersionId: ids.planV1,
      ...scope,
      proposalType: "plan_revision",
      status: "pending",
      payload: {
        type: "plan_revision",
        schemaVersion: 1,
        summary: "pending",
        proposedSnapshot: { type: "plan", strategy: null, angles: [], hooks: [], ctas: [], constraints: null },
        changes: [],
        writes: [],
      },
    });

    await expect(promoteArtifactVersion({
      scope,
      command: {
        type: "creative",
        operationId: crypto.randomUUID(),
        lineageId: ids.creativeLineage,
        targetVersionId: ids.creativeV2,
        expectedOfficialVersionId: ids.creativeV1,
        expectedRevision: 99,
        planTransition: {
          lineageId: ids.planLineage,
          targetVersionId: ids.planV2,
          expectedOfficialVersionId: ids.planV1,
          expectedRevision: 0,
          acknowledgementId,
        },
      },
    })).rejects.toThrow("Artifact head revision conflict");

    const [planHead] = await db.select().from(assistantArtifactLineageHeads).where(eq(assistantArtifactLineageHeads.lineageId, ids.planLineage));
    const [creativeHead] = await db.select().from(assistantArtifactLineageHeads).where(eq(assistantArtifactLineageHeads.lineageId, ids.creativeLineage));
    const [plan] = await db.select().from(creativePlans).where(eq(creativePlans.id, ids.plan));
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, ids.campaign));
    const proposals = await db.select().from(assistantArtifactProposals).where(eq(assistantArtifactProposals.workspaceId, ids.workspace));
    const events = await db.select().from(assistantArtifactApprovalEvents).where(eq(assistantArtifactApprovalEvents.workspaceId, ids.workspace));
    const creativeRows = await db.select().from(derivations).where(eq(derivations.workspaceId, ids.workspace));

    expect(planHead).toMatchObject({ approvedCurrentVersionId: ids.planV1, revision: 0 });
    expect(creativeHead).toMatchObject({ approvedCurrentVersionId: ids.creativeV1, revision: 0 });
    expect(plan).toMatchObject({ strategy: "old strategy", status: "approved" });
    expect(campaign?.constraints).toBe("old constraints");
    expect(proposals.map((proposal) => proposal.status)).toEqual(["pending"]);
    expect(events).toHaveLength(0);
    expect(Object.fromEntries(creativeRows.map((row) => [row.id, row.status]))).toMatchObject({
      [ids.derivation1]: "approved",
      [ids.derivation2]: "completed",
    });
  });

  it("commits compound heads, canonical rows, proposal staling, and history exactly once", async () => {
    const { ids, scope } = await seedPromotionFixture();
    const acknowledgementId = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    await db.insert(assistantArtifactComparisonAcknowledgements).values({
      id: acknowledgementId,
      creativeTargetVersionId: ids.creativeV2,
      planLineageId: ids.planLineage,
      linkedPlanVersionId: ids.planV2,
      comparedOfficialPlanVersionId: ids.planV1,
      comparedPlanHeadRevision: 0,
      ...scope,
    });
    await db.insert(assistantArtifactProposals).values([
      {
        lineageId: ids.planLineage,
        sourceVersionId: ids.planV1,
        ...scope,
        proposalType: "plan_revision",
        status: "pending",
        payload: {
          type: "plan_revision",
          schemaVersion: 1,
          summary: "pending",
          proposedSnapshot: { type: "plan", strategy: null, angles: [], hooks: [], ctas: [], constraints: null },
          changes: [],
          writes: [],
        },
      },
      {
        lineageId: ids.creativeLineage,
        sourceVersionId: ids.creativeV1,
        ...scope,
        proposalType: "creative_revision",
        status: "pending",
        payload: {
          type: "creative_revision",
          schemaVersion: 1,
          summary: "pending",
          intendedChanges: [],
          format: "1:1",
          referenceIds: [],
          creditImpact: 5,
          writes: [],
          planVersionId: ids.planV1,
        },
      },
    ]);
    const command = {
      type: "creative" as const,
      operationId,
      lineageId: ids.creativeLineage,
      targetVersionId: ids.creativeV2,
      expectedOfficialVersionId: ids.creativeV1,
      expectedRevision: 0,
      planTransition: {
        lineageId: ids.planLineage,
        targetVersionId: ids.planV2,
        expectedOfficialVersionId: ids.planV1,
        expectedRevision: 0,
        acknowledgementId,
      },
    };

    const first = await promoteArtifactVersion({ scope, command });
    const replay = await promoteArtifactVersion({ scope, command });
    const heads = await db.select().from(assistantArtifactLineageHeads);
    const [plan] = await db.select().from(creativePlans).where(eq(creativePlans.id, ids.plan));
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, ids.campaign));
    const proposals = await db.select().from(assistantArtifactProposals).where(eq(assistantArtifactProposals.workspaceId, ids.workspace));
    const events = await db.select().from(assistantArtifactApprovalEvents).where(eq(assistantArtifactApprovalEvents.operationId, operationId));
    const versions = await db.select().from(assistantArtifactVersions).where(eq(assistantArtifactVersions.workspaceId, ids.workspace));
    const creativeRows = await db.select().from(derivations).where(eq(derivations.workspaceId, ids.workspace));

    expect(first).toMatchObject({ replayed: false, staleProposalCount: 2 });
    expect(replay).toMatchObject({ replayed: true });
    expect(heads.find((head) => head.lineageId === ids.planLineage)).toMatchObject({ approvedCurrentVersionId: ids.planV2, workingVersionId: ids.planV2, revision: 1 });
    expect(heads.find((head) => head.lineageId === ids.creativeLineage)).toMatchObject({ approvedCurrentVersionId: ids.creativeV2, workingVersionId: ids.creativeV2, revision: 1 });
    expect(plan).toMatchObject({ strategy: "new strategy", status: "approved" });
    expect(campaign?.constraints).toBe("new constraints");
    expect(proposals.map((proposal) => proposal.status)).toEqual(["stale", "stale"]);
    expect(events).toHaveLength(2);
    expect(versions).toHaveLength(4);
    expect(Object.fromEntries(creativeRows.map((row) => [row.id, row.status]))).toMatchObject({
      [ids.derivation1]: "completed",
      [ids.derivation2]: "approved",
    });
  });
});
