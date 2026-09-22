import type {
  ArtifactType,
  ArtifactVersionPresentation,
  ArtifactVersionProvenance,
} from "@/lib/assistant/artifact-version";
import {
  artifactProposalSummarySchema,
  artifactVersionSummarySchema,
} from "@/lib/assistant/artifact-version";
import { getCampaignById } from "@/server/repositories/campaign";
import {
  getDerivationById,
  getDerivationsByIds,
} from "@/server/repositories/derivation";
import { getPlanById } from "@/server/repositories/plan";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  ArtifactVersionValidationError,
  createAdoptedArtifact,
  findArtifactLineageOwner,
  getArtifactHeads,
  getArtifactLineage,
  getArtifactVersionsByIds,
  listArtifactLineages,
  listArtifactProposalsForLineages,
  listArtifactVersionsForLineages,
  listPreviouslyApprovedVersionIdsForLineages,
  type ArtifactScope,
} from "@/server/repositories/artifact-version";
import {
  buildCreativeSnapshot,
  buildPlanSnapshot,
  parseArtifactProvenance,
} from "./snapshots";

export class ArtifactLineageOwnershipError extends Error {
  constructor(message = "Artifact version history belongs to another thread") {
    super(message);
    this.name = "ArtifactLineageOwnershipError";
  }
}

async function resolveThreadScope(
  workspaceId: string,
  threadId: string
): Promise<ArtifactScope> {
  const thread = await getAssistantThreadById(workspaceId, threadId);
  if (!thread) throw new ArtifactVersionValidationError("Thread not found");
  if (!thread.campaignId) {
    throw new ArtifactVersionValidationError("Thread is not linked to a campaign");
  }
  return {
    workspaceId,
    clientProfileId: thread.clientProfileId,
    campaignId: thread.campaignId,
    threadId,
  };
}

async function getOwnedExistingLineage(
  scope: ArtifactScope,
  artifactType: ArtifactType,
  artifactId: string
) {
  const owner = await findArtifactLineageOwner(
    scope.workspaceId,
    artifactType,
    artifactId
  );
  if (!owner) return null;
  if (owner.threadId !== scope.threadId) {
    throw new ArtifactLineageOwnershipError();
  }
  const lineage = await getArtifactLineage(scope, owner.id);
  if (!lineage) throw new ArtifactVersionValidationError("Lineage scope mismatch");
  return lineage;
}

function legacyProvenance(input: {
  originalArtifactId: string;
  format?: string | null;
  generationMode?: string | null;
}): ArtifactVersionProvenance {
  return parseArtifactProvenance({
    origin: "legacy_import",
    originalArtifactId: input.originalArtifactId,
    sourceVersionId: null,
    messageId: null,
    actionId: null,
    planVersionId: null,
    format: input.format ?? null,
    generationMode: input.generationMode ?? null,
  });
}

export async function adoptArtifactForThread(input: {
  workspaceId: string;
  threadId: string;
  artifactType: ArtifactType;
  artifactId: string;
}) {
  const scope = await resolveThreadScope(input.workspaceId, input.threadId);
  const existing = await getOwnedExistingLineage(
    scope,
    input.artifactType,
    input.artifactId
  );
  if (existing) return getLineagePresentation(scope, existing);

  let createInput: Parameters<typeof createAdoptedArtifact>[0];
  if (input.artifactType === "plan") {
    const [plan, campaign] = await Promise.all([
      getPlanById(input.artifactId, scope.workspaceId),
      getCampaignById(scope.campaignId, scope.workspaceId),
    ]);
    if (!plan || plan.campaignId !== scope.campaignId || !campaign) {
      throw new ArtifactVersionValidationError("Plan not found in thread campaign");
    }
    createInput = {
      scope,
      artifactType: "plan",
      originalArtifactId: plan.id,
      snapshot: buildPlanSnapshot({ ...plan, constraints: campaign.constraints }),
      provenance: legacyProvenance({ originalArtifactId: plan.id }),
      status: plan.status,
      approved: plan.status === "approved",
    };
  } else {
    const derivation = await getDerivationById(input.artifactId, scope.workspaceId);
    if (!derivation || derivation.campaignId !== scope.campaignId) {
      throw new ArtifactVersionValidationError(
        "Creative not found in thread campaign"
      );
    }
    createInput = {
      scope,
      artifactType: "creative",
      originalArtifactId: derivation.id,
      formatKey: derivation.format,
      snapshot: buildCreativeSnapshot({ ...derivation, planVersionId: null }),
      provenance: legacyProvenance({
        originalArtifactId: derivation.id,
        format: derivation.format,
        generationMode: derivation.generationMode,
      }),
      status: derivation.status,
      approved: derivation.status === "approved",
    };
  }

  try {
    const created = await createAdoptedArtifact(createInput);
    return getLineagePresentation(scope, created.lineage);
  } catch (error) {
    const winner = await getOwnedExistingLineage(
      scope,
      input.artifactType,
      input.artifactId
    );
    if (!winner) throw error;
    return getLineagePresentation(scope, winner);
  }
}

type ArtifactLineageRow = Awaited<ReturnType<typeof listArtifactLineages>>[number];
type AssistantThreadRow = NonNullable<
  Awaited<ReturnType<typeof getAssistantThreadById>>
>;

function groupBy<T, K>(rows: T[], keyOf: (row: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }
  return grouped;
}

async function getLineagePresentation(
  scope: ArtifactScope,
  lineage: ArtifactLineageRow
): Promise<ArtifactVersionPresentation> {
  const [presentation] = await buildLineagePresentations(scope, [lineage]);
  return presentation!;
}

/**
 * Builds presentations for many lineages with one round trip per table
 * (versions, heads, proposals, approval events, missing head versions,
 * derivations) instead of a per-lineage query chain. Output order follows the
 * input lineage order and each presentation is identical to the per-lineage
 * build.
 */
async function buildLineagePresentations(
  scope: ArtifactScope,
  lineages: ArtifactLineageRow[]
): Promise<ArtifactVersionPresentation[]> {
  if (lineages.length === 0) return [];
  const lineageIds = lineages.map((lineage) => lineage.id);
  const [allPageVersions, heads, allProposals, approvalRows] = await Promise.all([
    listArtifactVersionsForLineages(scope, lineageIds),
    getArtifactHeads(scope, lineageIds),
    listArtifactProposalsForLineages(scope, lineageIds),
    listPreviouslyApprovedVersionIdsForLineages(scope, lineageIds),
  ]);
  const pageVersionsByLineage = groupBy(allPageVersions, (version) => version.lineageId);
  const headByLineage = new Map(heads.map((head) => [head.lineageId, head]));
  const proposalsByLineage = groupBy(allProposals, (proposal) => proposal.lineageId);
  const approvedByLineage = new Map<string, Set<string>>();
  for (const row of approvalRows) {
    const bucket = approvedByLineage.get(row.lineageId);
    if (bucket) bucket.add(row.versionId);
    else approvedByLineage.set(row.lineageId, new Set([row.versionId]));
  }

  const pageVersionIds = new Set(allPageVersions.map((version) => version.id));
  const missingHeadIds = new Set<string>();
  for (const head of heads) {
    for (const versionId of [head.approvedCurrentVersionId, head.workingVersionId]) {
      if (typeof versionId === "string" && !pageVersionIds.has(versionId)) {
        missingHeadIds.add(versionId);
      }
    }
  }
  const creativeDerivationIds = [
    ...new Set(
      lineages
        .filter((lineage) => lineage.artifactType === "creative")
        .map((lineage) => lineage.originalArtifactId)
    ),
  ];
  const [missingHeadVersions, derivationRows] = await Promise.all([
    getArtifactVersionsByIds(scope, [...missingHeadIds]),
    getDerivationsByIds(creativeDerivationIds, scope.workspaceId),
  ]);
  const missingHeadVersionById = new Map(
    missingHeadVersions.map((version) => [version.id, version])
  );
  const derivationById = new Map(
    derivationRows.map((derivation) => [derivation.id, derivation])
  );

  return lineages.map((lineage) => {
    const head = headByLineage.get(lineage.id) ?? null;
    const pageVersions = pageVersionsByLineage.get(lineage.id) ?? [];
    const lineagePageVersionIds = new Set(pageVersions.map((version) => version.id));
    const lineageMissingHeadIds = [
      head?.approvedCurrentVersionId,
      head?.workingVersionId,
    ].filter(
      (versionId): versionId is string =>
        typeof versionId === "string" && !lineagePageVersionIds.has(versionId)
    );
    const missingHeadVersionsForLineage = [...new Set(lineageMissingHeadIds)]
      .map((versionId) => missingHeadVersionById.get(versionId) ?? null)
      .filter(
        (version): version is NonNullable<typeof version> =>
          version !== null && version.lineageId === lineage.id
      );
    const derivation =
      lineage.artifactType === "creative"
        ? derivationById.get(lineage.originalArtifactId) ?? null
        : null;
    return presentLineage({
      scope,
      lineage,
      head,
      allVersions: [...pageVersions, ...missingHeadVersionsForLineage],
      proposals: proposalsByLineage.get(lineage.id) ?? [],
      previouslyApproved: approvedByLineage.get(lineage.id) ?? new Set<string>(),
      derivation,
    });
  });
}

function presentLineage(input: {
  scope: ArtifactScope;
  lineage: ArtifactLineageRow;
  head: Awaited<ReturnType<typeof getArtifactHeads>>[number] | null;
  allVersions: Awaited<ReturnType<typeof listArtifactVersionsForLineages>>;
  proposals: Awaited<ReturnType<typeof listArtifactProposalsForLineages>>;
  previouslyApproved: Set<string>;
  derivation: Awaited<ReturnType<typeof getDerivationsByIds>>[number] | null;
}): ArtifactVersionPresentation {
  const { scope, lineage, head, allVersions, proposals, previouslyApproved, derivation } =
    input;
  const versionSummaries = allVersions.map((version) =>
    artifactVersionSummarySchema.parse({
      id: version.id,
      lineageId: version.lineageId,
      versionNumber: version.versionNumber,
      sourceVersionId: version.sourceVersionId,
      status: version.status,
      snapshot: version.snapshot,
      provenance: version.provenance,
      feedback: version.feedback,
      previouslyApproved: previouslyApproved.has(version.id),
      createdAt: version.createdAt,
    })
  );
  const proposalSummaries = proposals.map((proposal) =>
    artifactProposalSummarySchema.parse({
      id: proposal.id,
      lineageId: proposal.lineageId,
      sourceVersionId: proposal.sourceVersionId,
      proposalType: proposal.proposalType,
      status: proposal.status,
      payload: proposal.payload,
      feedback: proposal.feedback,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
    })
  );
  const byId = new Map(
    versionSummaries.map((version) => [version.id, version])
  );

  let generationStatus: ArtifactVersionPresentation["generationStatus"] = null;
  if (
    lineage.artifactType === "creative" &&
    derivation &&
    derivation.campaignId === scope.campaignId
  ) {
    generationStatus = { status: derivation.status, safeError: null };
  }

  return {
    lineageId: lineage.id,
    artifactType: lineage.artifactType as ArtifactType,
    headRevision: head?.revision ?? 0,
    approvedCurrent: head?.approvedCurrentVersionId
      ? byId.get(head.approvedCurrentVersionId) ?? null
      : null,
    working: head?.workingVersionId
      ? byId.get(head.workingVersionId) ?? null
      : null,
    versions: versionSummaries,
    pendingProposals: proposalSummaries,
    generationStatus,
  };
}

export interface ThreadArtifactPreload {
  thread?: AssistantThreadRow | null;
  lineages?: ArtifactLineageRow[];
}

export async function getThreadArtifactVersionState(
  workspaceId: string,
  threadId: string,
  preload: ThreadArtifactPreload = {}
) {
  const thread =
    preload.thread && preload.thread.id === threadId && preload.thread.workspaceId === workspaceId
      ? preload.thread
      : await getAssistantThreadById(workspaceId, threadId);
  if (!thread) throw new ArtifactVersionValidationError("Thread not found");
  if (!thread.campaignId) return { lineages: [] };
  const scope: ArtifactScope = {
    workspaceId,
    clientProfileId: thread.clientProfileId,
    campaignId: thread.campaignId,
    threadId,
  };
  const lineages = preload.lineages ?? (await listArtifactLineages(scope));
  return { lineages: await buildLineagePresentations(scope, lineages) };
}
