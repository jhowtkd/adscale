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
import { getDerivationById } from "@/server/repositories/derivation";
import { getPlanById } from "@/server/repositories/plan";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  ArtifactVersionValidationError,
  createAdoptedArtifact,
  findArtifactLineageOwner,
  getArtifactHead,
  getArtifactLineage,
  listArtifactLineages,
  listArtifactProposals,
  listArtifactVersions,
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
  if (existing) return getLineagePresentation(scope, existing.id);

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
    return getLineagePresentation(scope, created.lineage.id);
  } catch (error) {
    const winner = await getOwnedExistingLineage(
      scope,
      input.artifactType,
      input.artifactId
    );
    if (!winner) throw error;
    return getLineagePresentation(scope, winner.id);
  }
}

async function getLineagePresentation(
  scope: ArtifactScope,
  lineageId: string
): Promise<ArtifactVersionPresentation> {
  const lineage = await getArtifactLineage(scope, lineageId);
  if (!lineage) throw new ArtifactVersionValidationError("Lineage not found");
  const [versions, head, proposals] = await Promise.all([
    listArtifactVersions(scope, lineageId),
    getArtifactHead(scope, lineageId),
    listArtifactProposals(scope, lineageId),
  ]);
  const versionSummaries = versions.map((version) =>
    artifactVersionSummarySchema.parse({
      id: version.id,
      lineageId: version.lineageId,
      versionNumber: version.versionNumber,
      sourceVersionId: version.sourceVersionId,
      status: version.status,
      snapshot: version.snapshot,
      provenance: version.provenance,
      feedback: version.feedback,
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
  if (lineage.artifactType === "creative") {
    const derivation = await getDerivationById(
      lineage.originalArtifactId,
      scope.workspaceId
    );
    if (derivation && derivation.campaignId === scope.campaignId) {
      generationStatus = { status: derivation.status, safeError: null };
    }
  }

  return {
    lineageId: lineage.id,
    artifactType: lineage.artifactType as ArtifactType,
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

export async function getThreadArtifactVersionState(
  workspaceId: string,
  threadId: string
) {
  const thread = await getAssistantThreadById(workspaceId, threadId);
  if (!thread) throw new ArtifactVersionValidationError("Thread not found");
  if (!thread.campaignId) return { lineages: [] };
  const scope: ArtifactScope = {
    workspaceId,
    clientProfileId: thread.clientProfileId,
    campaignId: thread.campaignId,
    threadId,
  };
  const lineages = await listArtifactLineages(scope);
  return {
    lineages: await Promise.all(
      lineages.map((lineage) => getLineagePresentation(scope, lineage.id))
    ),
  };
}
