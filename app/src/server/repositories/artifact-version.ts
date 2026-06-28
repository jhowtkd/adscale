import { and, desc, eq, max, ne, or, sql } from "drizzle-orm";
import type {
  ArtifactPromotionCommand,
  ArtifactProposalPayload,
  ArtifactType,
  ArtifactVersionProvenance,
  ArtifactVersionSnapshot,
} from "@/lib/assistant/artifact-version";
import {
  artifactProposalPayloadSchema,
  artifactVersionProvenanceSchema,
  artifactVersionSnapshotSchema,
} from "@/lib/assistant/artifact-version";
import { db } from "../db";
import {
  assistantActionRecords,
  assistantArtifactApprovalEvents,
  assistantArtifactComparisonAcknowledgements,
  assistantArtifactLineageHeads,
  assistantArtifactLineages,
  assistantArtifactProposals,
  assistantArtifactVersions,
  campaigns,
  creativePlans,
  derivations,
} from "../db/schema";
import { containsDeniedPersistenceKeys } from "./assistant-types";

export interface ArtifactScope {
  workspaceId: string;
  clientProfileId: string;
  campaignId: string;
  threadId: string;
}

export type ProposalStatus = "pending" | "stale" | "confirmed" | "canceled";

export class ArtifactVersionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactVersionValidationError";
  }
}

export class ArtifactHeadConflictError extends Error {
  constructor(
    message: string,
    readonly head: typeof assistantArtifactLineageHeads.$inferSelect | null
  ) {
    super(message);
    this.name = "ArtifactHeadConflictError";
  }
}

export function assertArtifactScope(
  scope: ArtifactScope,
  row: Partial<ArtifactScope>
) {
  if (row.workspaceId !== scope.workspaceId) {
    throw new ArtifactVersionValidationError("Cross-workspace access rejected");
  }
  if (row.clientProfileId !== scope.clientProfileId) {
    throw new ArtifactVersionValidationError("Cross-client access rejected");
  }
  if (row.campaignId !== scope.campaignId) {
    throw new ArtifactVersionValidationError("Cross-campaign access rejected");
  }
  if (row.threadId !== scope.threadId) {
    throw new ArtifactVersionValidationError("Cross-thread access rejected");
  }
}

export function assertSafeArtifactJson(value: unknown, label: string) {
  const artifactDeniedKeys = new Set([
    "prompt",
    "inputPrompt",
    "providerPayload",
    "rawProviderPayload",
    "generationLog",
  ]);
  const seen = new Set<unknown>();
  const hasArtifactDeniedKey = (candidate: unknown): boolean => {
    if (!candidate || typeof candidate !== "object") return false;
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    if (Array.isArray(candidate)) return candidate.some(hasArtifactDeniedKey);
    return Object.entries(candidate as Record<string, unknown>).some(
      ([key, nested]) => artifactDeniedKeys.has(key) || hasArtifactDeniedKey(nested)
    );
  };
  if (containsDeniedPersistenceKeys(value) || hasArtifactDeniedKey(value)) {
    throw new ArtifactVersionValidationError(`${label} contains denied keys`);
  }
}

const PROPOSAL_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  pending: ["stale", "confirmed", "canceled"],
  stale: ["canceled"],
  confirmed: [],
  canceled: [],
};

export function isValidProposalTransition(
  current: ProposalStatus,
  next: ProposalStatus
) {
  return PROPOSAL_TRANSITIONS[current].includes(next);
}

const lineageScope = (scope: ArtifactScope) =>
  and(
    eq(assistantArtifactLineages.workspaceId, scope.workspaceId),
    eq(assistantArtifactLineages.clientProfileId, scope.clientProfileId),
    eq(assistantArtifactLineages.campaignId, scope.campaignId),
    eq(assistantArtifactLineages.threadId, scope.threadId)
  );

const versionScope = (scope: ArtifactScope) =>
  and(
    eq(assistantArtifactVersions.workspaceId, scope.workspaceId),
    eq(assistantArtifactVersions.clientProfileId, scope.clientProfileId),
    eq(assistantArtifactVersions.campaignId, scope.campaignId),
    eq(assistantArtifactVersions.threadId, scope.threadId)
  );

const proposalScope = (scope: ArtifactScope) =>
  and(
    eq(assistantArtifactProposals.workspaceId, scope.workspaceId),
    eq(assistantArtifactProposals.clientProfileId, scope.clientProfileId),
    eq(assistantArtifactProposals.campaignId, scope.campaignId),
    eq(assistantArtifactProposals.threadId, scope.threadId)
  );

const approvalScope = (scope: ArtifactScope) =>
  and(
    eq(assistantArtifactApprovalEvents.workspaceId, scope.workspaceId),
    eq(assistantArtifactApprovalEvents.clientProfileId, scope.clientProfileId),
    eq(assistantArtifactApprovalEvents.campaignId, scope.campaignId),
    eq(assistantArtifactApprovalEvents.threadId, scope.threadId)
  );

const acknowledgementScope = (scope: ArtifactScope) =>
  and(
    eq(assistantArtifactComparisonAcknowledgements.workspaceId, scope.workspaceId),
    eq(assistantArtifactComparisonAcknowledgements.clientProfileId, scope.clientProfileId),
    eq(assistantArtifactComparisonAcknowledgements.campaignId, scope.campaignId),
    eq(assistantArtifactComparisonAcknowledgements.threadId, scope.threadId)
  );

export async function findArtifactLineageOwner(
  workspaceId: string,
  artifactType: ArtifactType,
  originalArtifactId: string
) {
  const [row] = await db
    .select({
      id: assistantArtifactLineages.id,
      workspaceId: assistantArtifactLineages.workspaceId,
      threadId: assistantArtifactLineages.threadId,
    })
    .from(assistantArtifactLineages)
    .where(
      and(
        eq(assistantArtifactLineages.workspaceId, workspaceId),
        eq(assistantArtifactLineages.artifactType, artifactType),
        eq(assistantArtifactLineages.originalArtifactId, originalArtifactId)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function getArtifactLineage(
  scope: ArtifactScope,
  lineageId: string
) {
  const [row] = await db
    .select()
    .from(assistantArtifactLineages)
    .where(and(eq(assistantArtifactLineages.id, lineageId), lineageScope(scope)))
    .limit(1);
  return row ?? null;
}

export async function listArtifactLineages(scope: ArtifactScope) {
  return db
    .select()
    .from(assistantArtifactLineages)
    .where(lineageScope(scope))
    .orderBy(desc(assistantArtifactLineages.createdAt));
}

export async function getArtifactVersion(
  scope: ArtifactScope,
  versionId: string
) {
  const [row] = await db
    .select()
    .from(assistantArtifactVersions)
    .where(and(eq(assistantArtifactVersions.id, versionId), versionScope(scope)))
    .limit(1);
  return row ?? null;
}

export async function listArtifactVersions(
  scope: ArtifactScope,
  lineageId: string,
  limit = 50
) {
  const lineage = await getArtifactLineage(scope, lineageId);
  if (!lineage) throw new ArtifactVersionValidationError("Lineage not found");

  return db
    .select()
    .from(assistantArtifactVersions)
    .where(
      and(
        eq(assistantArtifactVersions.lineageId, lineageId),
        versionScope(scope)
      )
    )
    .orderBy(desc(assistantArtifactVersions.versionNumber))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function getArtifactHead(
  scope: ArtifactScope,
  lineageId: string
) {
  const lineage = await getArtifactLineage(scope, lineageId);
  if (!lineage) return null;
  const [head] = await db
    .select()
    .from(assistantArtifactLineageHeads)
    .where(eq(assistantArtifactLineageHeads.lineageId, lineageId))
    .limit(1);
  return head ?? null;
}

export async function createAdoptedArtifact(input: {
  scope: ArtifactScope;
  artifactType: ArtifactType;
  originalArtifactId: string;
  formatKey?: string | null;
  snapshot: ArtifactVersionSnapshot;
  provenance: ArtifactVersionProvenance;
  status: string;
  approved: boolean;
}) {
  assertSafeArtifactJson(input.snapshot, "snapshot");
  assertSafeArtifactJson(input.provenance, "provenance");
  const snapshot = artifactVersionSnapshotSchema.parse(input.snapshot);
  const provenance = artifactVersionProvenanceSchema.parse(input.provenance);

  return db.transaction(async (tx) => {
    const lineageId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const [lineage] = await tx
      .insert(assistantArtifactLineages)
      .values({
        id: lineageId,
        artifactType: input.artifactType,
        ...input.scope,
        originalArtifactId: input.originalArtifactId,
        origin: "legacy_import",
        formatKey: input.formatKey ?? null,
      })
      .returning();
    const [version] = await tx
      .insert(assistantArtifactVersions)
      .values({
        id: versionId,
        lineageId,
        ...input.scope,
        versionNumber: 1,
        sourceVersionId: null,
        status: input.status,
        snapshot,
        provenance,
        feedback: null,
      })
      .returning();
    const [head] = await tx
      .insert(assistantArtifactLineageHeads)
      .values({
        lineageId,
        approvedCurrentVersionId: input.approved ? versionId : null,
        workingVersionId: versionId,
        revision: 0,
      })
      .returning();
    return { lineage: lineage!, version: version!, head: head! };
  });
}

export async function createArtifactVersion(input: {
  scope: ArtifactScope;
  lineageId: string;
  sourceVersionId: string;
  status: string;
  snapshot: ArtifactVersionSnapshot;
  provenance: ArtifactVersionProvenance;
  feedback?: string | null;
}) {
  assertSafeArtifactJson(input.snapshot, "snapshot");
  assertSafeArtifactJson(input.provenance, "provenance");
  const snapshot = artifactVersionSnapshotSchema.parse(input.snapshot);
  const provenance = artifactVersionProvenanceSchema.parse(input.provenance);
  const lineage = await getArtifactLineage(input.scope, input.lineageId);
  const source = await getArtifactVersion(input.scope, input.sourceVersionId);
  if (!lineage || !source || source.lineageId !== input.lineageId) {
    throw new ArtifactVersionValidationError("Invalid source lineage");
  }

  return db.transaction(async (tx) => {
    const [counter] = await tx
      .select({ value: max(assistantArtifactVersions.versionNumber) })
      .from(assistantArtifactVersions)
      .where(eq(assistantArtifactVersions.lineageId, input.lineageId));
    const [created] = await tx
      .insert(assistantArtifactVersions)
      .values({
        lineageId: input.lineageId,
        ...input.scope,
        versionNumber: (counter?.value ?? 0) + 1,
        sourceVersionId: input.sourceVersionId,
        status: input.status,
        snapshot,
        provenance,
        feedback: input.feedback?.slice(0, 2_000) ?? null,
      })
      .returning();
    return created!;
  });
}

export async function updateArtifactHead(input: {
  scope: ArtifactScope;
  lineageId: string;
  expectedRevision: number;
  approvedCurrentVersionId?: string | null;
  workingVersionId?: string | null;
}) {
  const lineage = await getArtifactLineage(input.scope, input.lineageId);
  if (!lineage) throw new ArtifactVersionValidationError("Lineage not found");

  for (const versionId of [
    input.approvedCurrentVersionId,
    input.workingVersionId,
  ]) {
    if (versionId) {
      const version = await getArtifactVersion(input.scope, versionId);
      if (!version || version.lineageId !== input.lineageId) {
        throw new ArtifactVersionValidationError("Head target is outside lineage");
      }
    }
  }

  const [updated] = await db
    .update(assistantArtifactLineageHeads)
    .set({
      ...(input.approvedCurrentVersionId !== undefined
        ? { approvedCurrentVersionId: input.approvedCurrentVersionId }
        : {}),
      ...(input.workingVersionId !== undefined
        ? { workingVersionId: input.workingVersionId }
        : {}),
      revision: input.expectedRevision + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(assistantArtifactLineageHeads.lineageId, input.lineageId),
        eq(assistantArtifactLineageHeads.revision, input.expectedRevision)
      )
    )
    .returning();
  if (!updated) {
    throw new ArtifactHeadConflictError(
      "Artifact head revision conflict",
      await getArtifactHead(input.scope, input.lineageId)
    );
  }
  return updated;
}

export async function createArtifactProposal(input: {
  scope: ArtifactScope;
  lineageId: string;
  sourceVersionId: string;
  proposalType: "plan_revision" | "creative_revision";
  payload: ArtifactProposalPayload;
  feedback?: string | null;
}) {
  assertSafeArtifactJson(input.payload, "proposal payload");
  const payload = artifactProposalPayloadSchema.parse(input.payload);
  if (payload.type !== input.proposalType) {
    throw new ArtifactVersionValidationError("Proposal type does not match payload");
  }
  const lineage = await getArtifactLineage(input.scope, input.lineageId);
  const source = await getArtifactVersion(input.scope, input.sourceVersionId);
  if (!lineage || !source || source.lineageId !== input.lineageId) {
    throw new ArtifactVersionValidationError("Invalid proposal source");
  }
  const [created] = await db
    .insert(assistantArtifactProposals)
    .values({
      lineageId: input.lineageId,
      sourceVersionId: input.sourceVersionId,
      ...input.scope,
      proposalType: input.proposalType,
      status: "pending",
      payload,
      feedback: input.feedback?.slice(0, 2_000) ?? null,
    })
    .returning();
  return created!;
}

export async function getArtifactProposal(
  scope: ArtifactScope,
  proposalId: string
) {
  const [row] = await db
    .select()
    .from(assistantArtifactProposals)
    .where(
      and(eq(assistantArtifactProposals.id, proposalId), proposalScope(scope))
    )
    .limit(1);
  return row ?? null;
}

export async function listArtifactProposals(
  scope: ArtifactScope,
  lineageId: string
) {
  const lineage = await getArtifactLineage(scope, lineageId);
  if (!lineage) throw new ArtifactVersionValidationError("Lineage not found");
  return db
    .select()
    .from(assistantArtifactProposals)
    .where(
      and(
        eq(assistantArtifactProposals.lineageId, lineageId),
        proposalScope(scope)
      )
    )
    .orderBy(desc(assistantArtifactProposals.createdAt));
}

export async function transitionArtifactProposal(input: {
  scope: ArtifactScope;
  proposalId: string;
  nextStatus: ProposalStatus;
}) {
  const [existing] = await db
    .select()
    .from(assistantArtifactProposals)
    .where(
      and(eq(assistantArtifactProposals.id, input.proposalId), proposalScope(input.scope))
    )
    .limit(1);
  if (!existing) throw new ArtifactVersionValidationError("Proposal not found");
  if (!isValidProposalTransition(existing.status as ProposalStatus, input.nextStatus)) {
    throw new ArtifactVersionValidationError("Invalid proposal transition");
  }
  const [updated] = await db
    .update(assistantArtifactProposals)
    .set({ status: input.nextStatus, updatedAt: new Date() })
    .where(
      and(eq(assistantArtifactProposals.id, input.proposalId), proposalScope(input.scope))
    )
    .returning();
  return updated!;
}

export async function staleSiblingProposals(input: {
  scope: ArtifactScope;
  lineageId: string;
  sourceVersionId: string;
  exceptProposalId: string;
}) {
  return db
    .update(assistantArtifactProposals)
    .set({ status: "stale", updatedAt: new Date() })
    .where(
      and(
        eq(assistantArtifactProposals.lineageId, input.lineageId),
        eq(assistantArtifactProposals.sourceVersionId, input.sourceVersionId),
        eq(assistantArtifactProposals.status, "pending"),
        ne(assistantArtifactProposals.id, input.exceptProposalId),
        proposalScope(input.scope)
      )
    )
    .returning();
}

export async function findActiveGenerationForLineage(
  scope: ArtifactScope,
  lineageId: string
) {
  const rows = await db
    .select({ id: assistantActionRecords.id })
    .from(assistantActionRecords)
    .where(
      and(
        eq(assistantActionRecords.workspaceId, scope.workspaceId),
        eq(assistantActionRecords.threadId, scope.threadId),
        eq(assistantActionRecords.status, "running"),
        sql`${assistantActionRecords.inputSnapshot}->>'lineageId' = ${lineageId}`
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function listArtifactProposalsByPlanVersion(input: {
  scope: ArtifactScope;
  planVersionId: string;
}) {
  return db
    .select({
      id: assistantArtifactProposals.id,
      status: assistantArtifactProposals.status,
      proposalType: assistantArtifactProposals.proposalType,
    })
    .from(assistantArtifactProposals)
    .where(
      and(
        eq(assistantArtifactProposals.proposalType, "creative_revision"),
        eq(assistantArtifactProposals.status, "pending"),
        sql`${assistantArtifactProposals.payload}->>'planVersionId' = ${input.planVersionId}`,
        proposalScope(input.scope)
      )
    );
}

type ArtifactTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function loadPromotionTarget(
  tx: ArtifactTx,
  scope: ArtifactScope,
  target: {
    lineageId: string;
    targetVersionId: string;
    expectedOfficialVersionId: string;
    expectedRevision: number;
  },
  artifactType: ArtifactType
) {
  const [[lineage], [head], [version]] = await Promise.all([
    tx.select().from(assistantArtifactLineages).where(and(
      eq(assistantArtifactLineages.id, target.lineageId),
      lineageScope(scope)
    )).limit(1),
    tx.select().from(assistantArtifactLineageHeads).where(
      eq(assistantArtifactLineageHeads.lineageId, target.lineageId)
    ).limit(1),
    tx.select().from(assistantArtifactVersions).where(and(
      eq(assistantArtifactVersions.id, target.targetVersionId),
      eq(assistantArtifactVersions.lineageId, target.lineageId),
      versionScope(scope)
    )).limit(1),
  ]);
  if (!lineage || lineage.artifactType !== artifactType || !head || !version) {
    throw new ArtifactVersionValidationError("Promotion target not found in scope");
  }
  if (head.approvedCurrentVersionId !== target.expectedOfficialVersionId) {
    throw new ArtifactHeadConflictError("Artifact head changed", head);
  }
  const [priorApproval] = await tx
    .select({ id: assistantArtifactApprovalEvents.id })
    .from(assistantArtifactApprovalEvents)
    .where(and(
      eq(assistantArtifactApprovalEvents.promotedVersionId, version.id),
      approvalScope(scope)
    ))
    .limit(1);
  if (
    version.status !== "ready" &&
    version.status !== "approved" &&
    !priorApproval
  ) {
    throw new ArtifactVersionValidationError("Version is not eligible for promotion");
  }
  if (head.approvedCurrentVersionId === version.id) {
    throw new ArtifactVersionValidationError("Version is already official");
  }
  return { lineage, head, version };
}

async function casPromotionHead(
  tx: ArtifactTx,
  input: {
    scope: ArtifactScope;
    lineageId: string;
    targetVersionId: string;
    expectedRevision: number;
  }
) {
  const [updated] = await tx
    .update(assistantArtifactLineageHeads)
    .set({
      approvedCurrentVersionId: input.targetVersionId,
      workingVersionId: input.targetVersionId,
      revision: input.expectedRevision + 1,
      updatedAt: new Date(),
    })
    .where(and(
      eq(assistantArtifactLineageHeads.lineageId, input.lineageId),
      eq(assistantArtifactLineageHeads.revision, input.expectedRevision)
    ))
    .returning();
  if (!updated) {
    const [head] = await tx.select().from(assistantArtifactLineageHeads).where(
      eq(assistantArtifactLineageHeads.lineageId, input.lineageId)
    ).limit(1);
    throw new ArtifactHeadConflictError("Artifact head revision conflict", head ?? null);
  }
}

async function syncCanonicalPlan(
  tx: ArtifactTx,
  scope: ArtifactScope,
  originalPlanId: string,
  snapshot: Extract<ArtifactVersionSnapshot, { type: "plan" }>
) {
  const [plan] = await tx.update(creativePlans).set({
    strategy: snapshot.strategy,
    angles: snapshot.angles,
    hooks: snapshot.hooks,
    ctas: snapshot.ctas,
    status: "approved",
    updatedAt: new Date(),
  }).where(and(
    eq(creativePlans.id, originalPlanId),
    eq(creativePlans.workspaceId, scope.workspaceId),
    eq(creativePlans.campaignId, scope.campaignId)
  )).returning({ id: creativePlans.id });
  if (!plan) throw new ArtifactVersionValidationError("Canonical plan write failed");

  const [campaign] = await tx.update(campaigns).set({
    constraints: snapshot.constraints,
    updatedAt: new Date(),
  }).where(and(
    eq(campaigns.id, scope.campaignId),
    eq(campaigns.workspaceId, scope.workspaceId),
    eq(campaigns.clientProfileId, scope.clientProfileId)
  )).returning({ id: campaigns.id });
  if (!campaign) throw new ArtifactVersionValidationError("Canonical campaign write failed");
}

async function stalePromotionProposals(
  tx: ArtifactTx,
  scope: ArtifactScope,
  lineageId: string,
  previousVersionId: string | null,
  includePlanDependents: boolean
) {
  if (!previousVersionId) return [];
  return tx.update(assistantArtifactProposals).set({
    status: "stale",
    updatedAt: new Date(),
  }).where(and(
    eq(assistantArtifactProposals.status, "pending"),
    proposalScope(scope),
    or(
      and(
        eq(assistantArtifactProposals.lineageId, lineageId),
        eq(assistantArtifactProposals.sourceVersionId, previousVersionId)
      ),
      includePlanDependents
        ? and(
            eq(assistantArtifactProposals.proposalType, "creative_revision"),
            sql`${assistantArtifactProposals.payload}->>'planVersionId' = ${previousVersionId}`
          )
        : undefined
    )
  )).returning({ id: assistantArtifactProposals.id });
}

async function appendApprovalEvent(
  tx: ArtifactTx,
  input: {
    scope: ArtifactScope;
    operationId: string;
    artifactType: ArtifactType;
    lineageId: string;
    promotedVersionId: string;
    previousOfficialVersionId: string | null;
  }
) {
  const [event] = await tx.insert(assistantArtifactApprovalEvents).values({
    operationId: input.operationId,
    artifactType: input.artifactType,
    lineageId: input.lineageId,
    promotedVersionId: input.promotedVersionId,
    previousOfficialVersionId: input.previousOfficialVersionId,
    ...input.scope,
  }).returning();
  if (!event) throw new ArtifactVersionValidationError("Approval history write failed");
  return event;
}

async function promotionRowsForOperation(
  tx: ArtifactTx,
  scope: ArtifactScope,
  operationId: string
) {
  const events = await tx.select().from(assistantArtifactApprovalEvents).where(and(
    eq(assistantArtifactApprovalEvents.operationId, operationId),
    approvalScope(scope)
  ));
  if (events.length === 0) return [];
  const versions = await tx.select({
    id: assistantArtifactVersions.id,
    versionNumber: assistantArtifactVersions.versionNumber,
  }).from(assistantArtifactVersions).where(versionScope(scope));
  const byId = new Map(versions.map((version) => [version.id, version.versionNumber]));
  return events.map((event) => ({
    artifactType: event.artifactType as ArtifactType,
    lineageId: event.lineageId,
    previousVersionNumber: event.previousOfficialVersionId
      ? byId.get(event.previousOfficialVersionId) ?? null
      : null,
    targetVersionNumber: byId.get(event.promotedVersionId)!,
  }));
}

export async function createComparisonAcknowledgement(input: {
  scope: ArtifactScope;
  creativeTargetVersionId: string;
  planLineageId: string;
  linkedPlanVersionId: string;
  comparedOfficialPlanVersionId: string;
  expectedPlanRevision: number;
}) {
  const [created] = await db.insert(assistantArtifactComparisonAcknowledgements).values({
    creativeTargetVersionId: input.creativeTargetVersionId,
    planLineageId: input.planLineageId,
    linkedPlanVersionId: input.linkedPlanVersionId,
    comparedOfficialPlanVersionId: input.comparedOfficialPlanVersionId,
    comparedPlanHeadRevision: input.expectedPlanRevision,
    ...input.scope,
  }).returning();
  return created!;
}

export async function promoteArtifactVersion(input: {
  scope: ArtifactScope;
  command: ArtifactPromotionCommand;
}) {
  return db.transaction(async (tx) => {
    const replay = await promotionRowsForOperation(
      tx,
      input.scope,
      input.command.operationId
    );
    if (replay.length > 0) {
      return { promotions: replay, staleProposalCount: 0, replayed: true };
    }

    const primary = await loadPromotionTarget(
      tx,
      input.scope,
      input.command,
      input.command.type
    );
    const promotions: Awaited<ReturnType<typeof promotionRowsForOperation>> = [];
    let staleProposalCount = 0;

    if (input.command.type === "plan") {
      if (primary.version.snapshot.type !== "plan") {
        throw new ArtifactVersionValidationError("Plan snapshot mismatch");
      }
      await casPromotionHead(tx, { scope: input.scope, ...input.command });
      await syncCanonicalPlan(
        tx,
        input.scope,
        primary.lineage.originalArtifactId,
        primary.version.snapshot
      );
      staleProposalCount += (await stalePromotionProposals(
        tx,
        input.scope,
        primary.lineage.id,
        primary.head.approvedCurrentVersionId,
        true
      )).length;
      await appendApprovalEvent(tx, {
        scope: input.scope,
        operationId: input.command.operationId,
        artifactType: "plan",
        lineageId: primary.lineage.id,
        promotedVersionId: primary.version.id,
        previousOfficialVersionId: primary.head.approvedCurrentVersionId,
      });
      promotions.push({
        artifactType: "plan",
        lineageId: primary.lineage.id,
        previousVersionNumber: primary.head.approvedCurrentVersionId
          ? (await tx.select({ versionNumber: assistantArtifactVersions.versionNumber }).from(assistantArtifactVersions).where(eq(assistantArtifactVersions.id, primary.head.approvedCurrentVersionId)).limit(1))[0]?.versionNumber ?? null
          : null,
        targetVersionNumber: primary.version.versionNumber,
      });
    } else {
      if (primary.version.snapshot.type !== "creative" || !primary.version.snapshot.planVersionId) {
        throw new ArtifactVersionValidationError("Creative has no exact plan binding");
      }
      const [linkedPlan] = await tx.select().from(assistantArtifactVersions).where(and(
        eq(assistantArtifactVersions.id, primary.version.snapshot.planVersionId),
        versionScope(input.scope)
      )).limit(1);
      if (!linkedPlan || linkedPlan.snapshot.type !== "plan") {
        throw new ArtifactVersionValidationError("Linked plan version not found");
      }
      const [planHead] = await tx.select().from(assistantArtifactLineageHeads).where(
        eq(assistantArtifactLineageHeads.lineageId, linkedPlan.lineageId)
      ).limit(1);
      if (!planHead) throw new ArtifactVersionValidationError("Linked plan head not found");

      if (planHead.approvedCurrentVersionId !== linkedPlan.id) {
        const transition = input.command.planTransition;
        if (!transition || transition.lineageId !== linkedPlan.lineageId || transition.targetVersionId !== linkedPlan.id) {
          throw new ArtifactVersionValidationError("Exact linked plan transition required");
        }
        const plan = await loadPromotionTarget(tx, input.scope, transition, "plan");
        const [acknowledgement] = await tx
          .select()
          .from(assistantArtifactComparisonAcknowledgements)
          .where(and(
            eq(assistantArtifactComparisonAcknowledgements.id, transition.acknowledgementId),
            eq(assistantArtifactComparisonAcknowledgements.creativeTargetVersionId, primary.version.id),
            eq(assistantArtifactComparisonAcknowledgements.planLineageId, linkedPlan.lineageId),
            eq(assistantArtifactComparisonAcknowledgements.linkedPlanVersionId, linkedPlan.id),
            eq(assistantArtifactComparisonAcknowledgements.comparedOfficialPlanVersionId, planHead.approvedCurrentVersionId!),
            eq(assistantArtifactComparisonAcknowledgements.comparedPlanHeadRevision, transition.expectedRevision),
            acknowledgementScope(input.scope)
          ))
          .limit(1);
        if (!acknowledgement || planHead.revision !== transition.expectedRevision) {
          throw new ArtifactVersionValidationError("Linked plan comparison acknowledgement is stale or invalid");
        }
        await casPromotionHead(tx, { scope: input.scope, ...transition });
        await syncCanonicalPlan(tx, input.scope, plan.lineage.originalArtifactId, linkedPlan.snapshot);
        staleProposalCount += (await stalePromotionProposals(tx, input.scope, linkedPlan.lineageId, planHead.approvedCurrentVersionId, true)).length;
        await appendApprovalEvent(tx, {
          scope: input.scope,
          operationId: input.command.operationId,
          artifactType: "plan",
          lineageId: linkedPlan.lineageId,
          promotedVersionId: linkedPlan.id,
          previousOfficialVersionId: planHead.approvedCurrentVersionId,
        });
        const [previousPlan] = await tx.select({ versionNumber: assistantArtifactVersions.versionNumber }).from(assistantArtifactVersions).where(eq(assistantArtifactVersions.id, planHead.approvedCurrentVersionId!)).limit(1);
        promotions.push({ artifactType: "plan", lineageId: linkedPlan.lineageId, previousVersionNumber: previousPlan?.versionNumber ?? null, targetVersionNumber: linkedPlan.versionNumber });
      } else if (input.command.planTransition !== null) {
        throw new ArtifactVersionValidationError("Plan transition is not required");
      }

      await casPromotionHead(tx, { scope: input.scope, ...input.command });
      const creativeSnapshot = primary.version.snapshot;
      const [approved] = await tx.update(derivations).set({ status: "approved", updatedAt: new Date() }).where(and(
        eq(derivations.id, creativeSnapshot.derivationId),
        eq(derivations.workspaceId, input.scope.workspaceId),
        eq(derivations.campaignId, input.scope.campaignId)
      )).returning({ id: derivations.id });
      if (!approved) throw new ArtifactVersionValidationError("Canonical creative write failed");
      if (primary.head.approvedCurrentVersionId) {
        const [previous] = await tx.select({ snapshot: assistantArtifactVersions.snapshot }).from(assistantArtifactVersions).where(and(
          eq(assistantArtifactVersions.id, primary.head.approvedCurrentVersionId),
          versionScope(input.scope)
        )).limit(1);
        if (previous?.snapshot.type === "creative" && previous.snapshot.derivationId !== creativeSnapshot.derivationId) {
          const [demoted] = await tx.update(derivations).set({ status: "completed", updatedAt: new Date() }).where(and(
            eq(derivations.id, previous.snapshot.derivationId),
            eq(derivations.workspaceId, input.scope.workspaceId),
            eq(derivations.campaignId, input.scope.campaignId)
          )).returning({ id: derivations.id });
          if (!demoted) throw new ArtifactVersionValidationError("Previous creative demotion failed");
        }
      }
      staleProposalCount += (await stalePromotionProposals(tx, input.scope, primary.lineage.id, primary.head.approvedCurrentVersionId, false)).length;
      await appendApprovalEvent(tx, {
        scope: input.scope,
        operationId: input.command.operationId,
        artifactType: "creative",
        lineageId: primary.lineage.id,
        promotedVersionId: primary.version.id,
        previousOfficialVersionId: primary.head.approvedCurrentVersionId,
      });
      const [previousCreative] = primary.head.approvedCurrentVersionId
        ? await tx.select({ versionNumber: assistantArtifactVersions.versionNumber }).from(assistantArtifactVersions).where(eq(assistantArtifactVersions.id, primary.head.approvedCurrentVersionId)).limit(1)
        : [];
      promotions.push({ artifactType: "creative", lineageId: primary.lineage.id, previousVersionNumber: previousCreative?.versionNumber ?? null, targetVersionNumber: primary.version.versionNumber });
    }

    return { promotions, staleProposalCount, replayed: false };
  });
}
