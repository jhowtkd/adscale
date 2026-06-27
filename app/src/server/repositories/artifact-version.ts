import { and, desc, eq, max, ne } from "drizzle-orm";
import type {
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
  assistantArtifactLineageHeads,
  assistantArtifactLineages,
  assistantArtifactProposals,
  assistantArtifactVersions,
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
