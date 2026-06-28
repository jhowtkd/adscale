import {
  artifactProposalPayloadSchema,
  artifactVersionComparisonSchema,
  creativeVersionSnapshotSchema,
  planVersionSnapshotSchema,
  type ArtifactVersionComparison,
} from "@/lib/assistant/artifact-version";
import { getTargetDimensions } from "@/lib/formats";
import { emitArtifactIterationTelemetry } from "@/server/assistant/artifact-iteration-telemetry";
import { getAssistantActionById } from "@/server/repositories/assistant-action";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  ArtifactVersionValidationError,
  getArtifactHead,
  getArtifactLineage,
  getArtifactProposal,
  getArtifactVersion,
  type ArtifactScope,
} from "@/server/repositories/artifact-version";
import { objectStorage } from "@/server/storage";
import { buildPlanSemanticComparison } from "../plan-iteration/diff";

type VersionRow = NonNullable<Awaited<ReturnType<typeof getArtifactVersion>>>;

function versionHeader(version: VersionRow) {
  return {
    versionNumber: version.versionNumber,
    status: version.status,
    createdAt: version.createdAt,
    feedback: version.feedback,
  };
}

async function resolveScope(
  workspaceId: string,
  threadId: string
): Promise<ArtifactScope> {
  const thread = await getAssistantThreadById(workspaceId, threadId);
  if (!thread?.campaignId) {
    throw new ArtifactVersionValidationError("Thread is not linked to a campaign");
  }
  return {
    workspaceId,
    clientProfileId: thread.clientProfileId,
    campaignId: thread.campaignId,
    threadId,
  };
}

async function intendedChanges(scope: ArtifactScope, version: VersionRow) {
  const actionId = version.provenance.actionId;
  if (actionId) {
    const action = await getAssistantActionById(scope.workspaceId, actionId);
    const proposalId = action?.threadId === scope.threadId
      ? action.inputSnapshot?.proposalId
      : null;
    if (typeof proposalId === "string") {
      const proposal = await getArtifactProposal(scope, proposalId);
      const payload = artifactProposalPayloadSchema.safeParse(proposal?.payload);
      if (
        proposal?.status === "confirmed" &&
        payload.success &&
        payload.data.type === "creative_revision"
      ) {
        return payload.data.intendedChanges;
      }
    }
  }
  return version.feedback ? [version.feedback] : [];
}

async function creativeVersion(scope: ArtifactScope, version: VersionRow) {
  const snapshot = creativeVersionSnapshotSchema.parse(version.snapshot);
  const [preview, planVersion, changes] = await Promise.all([
    snapshot.outputKey
      ? objectStorage
          .signedDownloadUrl(snapshot.outputKey)
          .then((previewUrl) => ({ previewUrl, previewError: null as null }))
          .catch(() => ({
            previewUrl: null,
            previewError: "preview_unavailable" as const,
          }))
      : Promise.resolve({
          previewUrl: null,
          previewError: "preview_unavailable" as const,
        }),
    snapshot.planVersionId
      ? getArtifactVersion(scope, snapshot.planVersionId)
      : Promise.resolve(null),
    intendedChanges(scope, version),
  ]);

  return {
    ...versionHeader(version),
    ...preview,
    format: snapshot.format,
    dimensions: snapshot.format ? getTargetDimensions(snapshot.format) : null,
    cta: snapshot.ctaText,
    boundPlanVersion: planVersion ? `v${planVersion.versionNumber}` : null,
    intendedChanges: changes,
  };
}

export async function compareArtifactVersions(input: {
  workspaceId: string;
  threadId: string;
  lineageId: string;
  versionAId: string;
  versionBId: string;
  includeUnchanged?: boolean;
}): Promise<ArtifactVersionComparison> {
  if (input.versionAId === input.versionBId) {
    throw new ArtifactVersionValidationError("Comparison versions must be distinct");
  }

  const scope = await resolveScope(input.workspaceId, input.threadId);
  const [lineage, versionA, versionB, head] = await Promise.all([
    getArtifactLineage(scope, input.lineageId),
    getArtifactVersion(scope, input.versionAId),
    getArtifactVersion(scope, input.versionBId),
    getArtifactHead(scope, input.lineageId),
  ]);
  if (!lineage || !versionA || !versionB || !head) {
    throw new ArtifactVersionValidationError("Invalid comparison selection");
  }
  if (
    versionA.lineageId !== input.lineageId ||
    versionB.lineageId !== input.lineageId
  ) {
    throw new ArtifactVersionValidationError("Comparison lineage mismatch");
  }

  if (lineage.artifactType === "plan") {
    const before = planVersionSnapshotSchema.parse(versionA.snapshot);
    const after = planVersionSnapshotSchema.parse(versionB.snapshot);
    const comparison = artifactVersionComparisonSchema.parse({
      type: "plan",
      headRevision: head.revision,
      versionA: versionHeader(versionA),
      versionB: versionHeader(versionB),
      fields: buildPlanSemanticComparison(
        before,
        after,
        input.includeUnchanged ?? false
      ),
    });
    emitArtifactIterationTelemetry({
      scope,
      eventKey: "comparison_opened",
      metadata: {
        artifactType: "plan",
        lineageId: input.lineageId,
        sourceVersionNumber: versionA.versionNumber,
        targetVersionNumber: versionB.versionNumber,
        headRevision: head.revision,
      },
    });
    return comparison;
  }
  if (lineage.artifactType !== "creative") {
    throw new ArtifactVersionValidationError("Invalid artifact type");
  }
  const comparison = artifactVersionComparisonSchema.parse({
    type: "creative",
    headRevision: head.revision,
    versionA: await creativeVersion(scope, versionA),
    versionB: await creativeVersion(scope, versionB),
  });
  emitArtifactIterationTelemetry({
    scope,
    eventKey: "comparison_opened",
    metadata: {
      artifactType: "creative",
      lineageId: input.lineageId,
      sourceVersionNumber: versionA.versionNumber,
      targetVersionNumber: versionB.versionNumber,
      headRevision: head.revision,
    },
  });
  return comparison;
}
