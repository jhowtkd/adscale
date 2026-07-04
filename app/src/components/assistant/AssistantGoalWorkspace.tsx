"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import type { ArtifactVersionPresentation } from "@/lib/assistant/artifact-version";
import type { AssistantGoalPresentation } from "@/lib/assistant/goal";
import { useAssistantGoal } from "@/lib/hooks/use-assistant-goal";
import { usePromoteAssistantArtifactVersion } from "@/lib/hooks/use-assistant-artifact-versions";
import { assistantThreadQueryKey } from "@/lib/hooks/use-assistant-threads";
import { useIsMobile } from "@/lib/hooks/use-media-query";
import { Button } from "@/components/ui/button";
import AssistantGoalPlan from "./AssistantGoalPlan";
import CreativeTripletGrid from "./CreativeTripletGrid";
import CreativeAnnotationEditor from "./CreativeAnnotationEditor";
import GoalPackageReview from "./GoalPackageReview";
import { apiFetch } from "@/lib/api-client";

export interface AssistantGoalWorkspaceProps {
  threadId: string;
  projection: AssistantGoalPresentation;
  artifactLineages?: ArtifactVersionPresentation[];
}

/**
 * Stage-aware host for the goal workspace. The desktop layout swaps from the
 * conversation grid to the workspace grid once candidates exist, so the visual
 * workspace never shrinks below 640px. This component renders the right panel
 * for the current stage: triplet selection, base annotation, and four-format
 * package review.
 */
export default function AssistantGoalWorkspace({
  threadId,
  projection,
  artifactLineages = [],
}: AssistantGoalWorkspaceProps) {
  const t = useTranslations("assistant.goal");
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [isDownloading, setIsDownloading] = useState(false);
  const promote = usePromoteAssistantArtifactVersion(threadId);
  const { stop, resume, isStopping } = useGoalLifecycle(threadId, projection.revision);

  const invalidateThread = () => {
    void queryClient.invalidateQueries({
      queryKey: assistantThreadQueryKey(threadId),
    });
  };

  const showTriplet =
    projection.candidates.length > 0 &&
    (projection.stage === "choosing_base" ||
      projection.stage === "reviewing_base" ||
      projection.stage === "generating_variants");

  const showAnnotations =
    projection.stage === "reviewing_base" && Boolean(projection.selectedBaseVersionId);

  const showPackageReview =
    projection.stage === "reviewing_package" ||
    projection.stage === "awaiting_package" ||
    projection.stage === "generating_package";

  const basePreviewUrl = useMemo(() => {
    if (!projection.selectedBaseVersionId) return null;
    const fromCandidate = projection.candidates.find(
      (candidate) => candidate.versionId === projection.selectedBaseVersionId
    );
    if (fromCandidate?.previewUrl) return fromCandidate.previewUrl;
    const fromPackage = projection.packageItems.find(
      (item) => item.versionId === projection.selectedBaseVersionId
    );
    return fromPackage?.previewUrl ?? null;
  }, [projection]);

  const handleApproveFormat = async (versionId: string) => {
    const match = artifactLineages
      .flatMap((lineage) =>
        lineage.versions.map((version) => ({ lineage, version }))
      )
      .find((entry) => entry.version.id === versionId);
    if (!match || match.lineage.artifactType !== "creative") return;

    await promote.mutateAsync({
      type: "creative",
      lineageId: match.lineage.lineageId,
      targetVersionId: versionId,
      expectedOfficialVersionId: match.lineage.approvedCurrent?.id ?? null,
      expectedRevision: match.lineage.headRevision,
      operationId: crypto.randomUUID(),
      planTransition: null,
    });
    invalidateThread();
  };

  const handleDownloadZip = async () => {
    setIsDownloading(true);
    try {
      const response = await apiFetch("/api/export/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalRunId: projection.id }),
      });
      if (!response.ok) return;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "adscale-goal-package.zip";
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4"
      data-testid="assistant-goal-workspace"
    >
      <AssistantGoalPlan
        projection={projection}
        onStop={stop}
        onResume={resume}
        isStopping={isStopping}
      />

      {showTriplet ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {t("candidates")}
          </h3>
          <CreativeTripletGrid
            candidates={projection.candidates}
            expectedRevision={projection.revision}
            selectedBaseVersionId={projection.selectedBaseVersionId}
            onSelectBase={(versionId, expectedRevision) => {
              void apiFetch(
                `/api/assistant/threads/${threadId}/goal/select-base`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ versionId, expectedRevision }),
                }
              ).then((response) => {
                if (response.ok) invalidateThread();
              });
            }}
          />
        </section>
      ) : null}

      {showAnnotations && projection.selectedBaseVersionId && basePreviewUrl ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {t("annotate")}
          </h3>
          <CreativeAnnotationEditor
            imageUrl={basePreviewUrl}
            versionId={projection.selectedBaseVersionId}
            annotations={projection.annotations}
            isMobile={isMobile}
            onAdd={(annotation) => {
              void apiFetch(
                `/api/assistant/threads/${threadId}/goal/annotations`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    goalRunId: projection.id,
                    versionId: projection.selectedBaseVersionId,
                    ...annotation,
                  }),
                }
              ).then((response) => {
                if (response.ok) invalidateThread();
              });
            }}
            onRemove={(annotationId) => {
              void apiFetch(
                `/api/assistant/threads/${threadId}/goal/annotations?annotationId=${annotationId}`,
                { method: "DELETE" }
              ).then((response) => {
                if (response.ok) invalidateThread();
              });
            }}
          />
        </section>
      ) : null}

      {showPackageReview ? (
        <GoalPackageReview
          packageItems={projection.packageItems}
          approvedFormatCount={projection.approvedFormatCount}
          requiredFormatCount={projection.requiredFormatCount}
          onApprove={(versionId) => {
            void handleApproveFormat(versionId);
          }}
          onAnnotate={() => {
            // Package annotate routes back to base revision in later turns.
          }}
        />
      ) : null}

      {projection.stage === "completed" ? (
        <section className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isDownloading}
            data-testid="assistant-goal-download-zip"
            onClick={() => void handleDownloadZip()}
          >
            {t("downloadZip")}
          </Button>
        </section>
      ) : null}
    </div>
  );
}

function useGoalLifecycle(threadId: string, revision: number) {
  const goal = useAssistantGoal();
  return {
    stop: () => goal.stop({ threadId, expectedRevision: revision }),
    resume: () => goal.resume({ threadId, expectedRevision: revision }),
    isStopping: goal.command.isPending,
  };
}
