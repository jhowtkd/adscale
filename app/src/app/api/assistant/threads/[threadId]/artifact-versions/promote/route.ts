import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import {
  artifactPromotionCommandSchema,
  artifactPromotionConflictSchema,
  artifactPromotionResultSchema,
} from "@/lib/assistant/artifact-version";
import { emitArtifactIterationTelemetry } from "@/server/assistant/artifact-iteration-telemetry";
import { promoteThreadArtifactVersion } from "@/server/assistant/artifact-version/promotion";
import { getThreadArtifactVersionState } from "@/server/assistant/artifact-version/service";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  ArtifactHeadConflictError,
  ArtifactVersionValidationError,
} from "@/server/repositories/artifact-version";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  let command: ReturnType<typeof artifactPromotionCommandSchema.parse> | null = null;
  let workspaceId: string | null = null;
  let threadId: string | null = null;
  try {
    const scoped = await Promise.all([requireWorkspaceAccess(request), params]);
    workspaceId = scoped[0].workspace.id;
    threadId = scoped[1].threadId;
    const thread = await getAssistantThreadById(workspaceId, threadId);
    if (!thread) return apiError("threadNotFound", 404);
    const parsed = artifactPromotionCommandSchema.safeParse(await request.json());
    if (!parsed.success) return apiError("invalidInput", 400);
    command = parsed.data;
    return NextResponse.json(
      artifactPromotionResultSchema.parse(
        await promoteThreadArtifactVersion({ workspaceId, threadId, command })
      )
    );
  } catch (error) {
    if (
      error instanceof ArtifactHeadConflictError &&
      command &&
      workspaceId &&
      threadId
    ) {
      const refreshed = await getThreadArtifactVersionState(workspaceId, threadId);
      const targets = [
        {
          lineageId: command.lineageId,
          expectedOfficialVersionId: command.expectedOfficialVersionId,
        },
        ...(command.type === "creative" && command.planTransition
          ? [command.planTransition]
          : []),
      ];
      const affected = refreshed.lineages.filter((lineage) =>
        targets.some((target) => target.lineageId === lineage.lineageId)
      );
      const changedTarget =
        targets.find((target) => {
          const lineage = affected.find(
            (candidate) => candidate.lineageId === target.lineageId
          );
          return (lineage?.approvedCurrent?.id ?? null) !== (target.expectedOfficialVersionId ?? null);
        }) ?? targets[0];
      const changedLineage = affected.find(
        (lineage) => lineage.lineageId === changedTarget.lineageId
      );
      const previous = changedLineage?.versions.find(
        (version) => version.id === changedTarget.expectedOfficialVersionId
      );
      const conflict = artifactPromotionConflictSchema.parse({
        error: "revisionConflict",
        message: "A versão oficial mudou enquanto você comparava.",
        previousOfficialLabel: previous ? `v${previous.versionNumber}` : "desconhecida",
        currentOfficialLabel: changedLineage?.approvedCurrent
          ? `v${changedLineage.approvedCurrent.versionNumber}`
          : "nenhuma",
        state: affected,
      });
      const thread = await getAssistantThreadById(workspaceId, threadId);
      if (thread?.campaignId) {
        emitArtifactIterationTelemetry({
          scope: {
            workspaceId,
            clientProfileId: thread.clientProfileId,
            campaignId: thread.campaignId,
            threadId,
          },
          eventKey: "promotion_conflict",
          reasonCode: "concurrent_head_change",
          metadata: {
            artifactType: command.type,
            lineageId: changedTarget.lineageId,
            headRevision: command.expectedRevision,
          },
        });
      }
      return NextResponse.json(conflict, { status: 409 });
    }
    if (error instanceof ArtifactVersionValidationError) {
      return apiError("invalidInput", 400, { message: error.message });
    }
    return handleApiError(error, "assistant.threads.artifact-versions.promote.POST");
  }
}
