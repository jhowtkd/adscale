import {
  GOAL_CREATIVE_LEVELS,
  GOAL_FORMATS,
  assistantGoalPresentationSchema,
  type AssistantGoalPresentation,
} from "@/lib/assistant/goal";
import { getGoalRunScoped, listAnnotationsForVersion } from "@/server/repositories/assistant-goal";
import { getDerivationsByCampaign } from "@/server/repositories/derivation";
import { objectStorage } from "@/server/storage";
import type { GoalStage } from "@/lib/assistant/goal";
import {
  listArtifactLineages,
  listArtifactVersionsForLineages,
  type ArtifactScope,
} from "@/server/repositories/artifact-version";

type DerivationRow = Awaited<ReturnType<typeof getDerivationsByCampaign>>[number];
type LineageRow = Awaited<ReturnType<typeof listArtifactLineages>>[number];

/**
 * Lineages already loaded by the caller for `campaignId`; reused only when the
 * goal resolves to the same campaign so the projection never mixes scopes.
 */
export interface GoalProjectionPreload {
  campaignId: string;
  lineages: LineageRow[];
}

/**
 * Resolves an ephemeral preview URL from a stored output key. The URL is built
 * at request time and never persisted in the projection, so a rotated or
 * expiring URL cannot leak through the cached thread payload.
 */
function previewUrlFor(outputKey: string | null): string | null {
  if (!outputKey) return null;
  try {
    return objectStorage.publicUrl(outputKey);
  } catch {
    return null;
  }
}

function candidateStatusFor(derivation: DerivationRow): "running" | "ready" | "failed" {
  switch (derivation.status) {
    case "completed":
    case "approved":
      return "ready";
    case "failed":
    case "rejected":
      return "failed";
    default:
      return "running";
  }
}

/**
 * Maps the goal stage to the four live plan steps the user sees. The steps are a
 * compact, non-authoritative progress hint — the stage is the source of truth.
 */
function planStepsFor(stage: GoalStage): AssistantGoalPresentation["planSteps"] {
  const order = ["understand", "plan", "create", "review"] as const;
  type StepKey = (typeof order)[number];
  type Status = "pending" | "active" | "done" | "blocked";
  const stageToActiveStep: Record<string, StepKey> = {
    intake: "understand",
    planning: "plan",
    awaiting_generation: "create",
    generating_variants: "create",
    choosing_base: "create",
    reviewing_base: "create",
    awaiting_package: "review",
    generating_package: "review",
    reviewing_package: "review",
    completed: "review",
  };
  const active = stageToActiveStep[stage];
  return order.map((key) => {
    let status: Status = "pending";
    if (stage === "completed") {
      status = "done";
    } else if (active === key) {
      status = stage === "failed" ? "blocked" : "active";
    } else if (active && order.indexOf(key) < order.indexOf(active)) {
      status = "done";
    }
    return { key, status };
  });
}

/**
 * Builds the strict, allowlisted goal projection for the workspace. Only this
 * shape ever reaches the client: it carries stage, plan steps, assumptions,
 * blockers, candidates (with ephemeral preview URLs only), selected base,
 * annotations, package items, and approval progress. It is parsed through the
 * presentation schema before returning so a forbidden field cannot slip in.
 */
export async function buildGoalProjection(input: {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  preload?: GoalProjectionPreload;
}): Promise<AssistantGoalPresentation | null> {
  const goal = await getGoalRunScoped(
    input.workspaceId,
    input.clientProfileId,
    input.threadId
  );
  if (!goal || !goal.campaignId) {
    return null;
  }

  const derivations = await getDerivationsByCampaign(
    goal.campaignId,
    input.workspaceId
  );
  const scope: ArtifactScope = {
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    campaignId: goal.campaignId,
    threadId: input.threadId,
  };
  const lineages =
    input.preload && input.preload.campaignId === goal.campaignId
      ? input.preload.lineages
      : await listArtifactLineages(scope);
  const creativeLineages = lineages.filter(
    (lineage) => lineage.artifactType === "creative"
  );
  const latestVersions = await listArtifactVersionsForLineages(
    scope,
    creativeLineages.map((lineage) => lineage.id),
    1
  );
  const latestVersionByLineageId = new Map(
    latestVersions.map((version) => [version.lineageId, version])
  );
  const versionEntries = creativeLineages.map(
    (lineage) =>
      [
        lineage.originalArtifactId,
        latestVersionByLineageId.get(lineage.id) ?? null,
      ] as const
  );
  const versionByDerivationId = new Map(versionEntries);
  const derivationIdByVersionId = new Map(
    versionEntries.flatMap(([derivationId, version]) =>
      version ? [[version.id, derivationId] as const] : []
    )
  );

  // Candidates are the 1:1 triplet, rendered in fixed conservative/balanced/bold
  // order regardless of insertion order. A missing level leaves the slot empty.
  const triplet = derivations.filter(
    (d) => d.format === "1:1" && (d.generationMode === "art_variation" || d.creativeLevel)
  );
  const byLevel = new Map<string, DerivationRow>();
  for (const derivation of triplet) {
    if (derivation.creativeLevel && !byLevel.has(derivation.creativeLevel)) {
      byLevel.set(derivation.creativeLevel, derivation);
    }
  }
  const candidates = GOAL_CREATIVE_LEVELS.map((level) => {
    const derivation = byLevel.get(level);
    if (!derivation) return null;
    return {
      versionId: versionByDerivationId.get(derivation.id)?.id ?? null,
      derivationId: derivation.id,
      creativeLevel: level,
      format: derivation.format ?? "1:1",
      status: candidateStatusFor(derivation),
      previewUrl: previewUrlFor(derivation.outputKey ?? null),
    };
  }).filter((c): c is NonNullable<typeof c> => c !== null);

  // Package items: the four canonical formats. The 1:1 base is "ready" once a
  // base is selected; the other three slots fill in as package children resolve.
  const approvedFormats = new Set(
    derivations
      .filter((d) => d.status === "approved")
      .map((d) => d.format)
      .filter((f): f is string => Boolean(f))
  );
  const formatItems = GOAL_FORMATS.map((format) => {
    const selectedBaseDerivationId = goal.selectedBaseVersionId
      ? derivationIdByVersionId.get(goal.selectedBaseVersionId)
      : null;
    const derivation =
      format === "1:1" && selectedBaseDerivationId
        ? derivations.find((d) => d.id === selectedBaseDerivationId)
        : derivations.find(
            (d) =>
              d.format === format && d.status !== "failed" && d.status !== "rejected"
          );
    return {
      format,
      versionId: derivation
        ? versionByDerivationId.get(derivation.id)?.id ?? null
        : null,
      status: approvedFormats.has(format)
        ? ("approved" as const)
        : derivation
          ? derivation.status === "completed" || derivation.status === "approved"
            ? ("ready" as const)
            : ("running" as const)
          : ("pending" as const),
      previewUrl: previewUrlFor(derivation?.outputKey ?? null),
    };
  });

  const annotations =
    goal.selectedBaseVersionId
      ? await listAnnotationsForVersion(
          input.workspaceId,
          goal.id,
          goal.selectedBaseVersionId
        ).catch(() => [])
      : [];

  const presentation = {
    id: goal.id,
    revision: goal.revision,
    stage: goal.stage as GoalStage,
    objective: goal.objective,
    planSteps: planStepsFor(goal.stage as GoalStage),
    assumptions: goal.assumptions ?? [],
    blockers: goal.blockers ?? [],
    candidates,
    selectedBaseVersionId: goal.selectedBaseVersionId ?? null,
    annotations: annotations.map((a) => ({
      id: a.id,
      versionId: a.versionId,
      x: a.x,
      y: a.y,
      width: a.width,
      height: a.height,
      comment: a.comment,
      status: a.status as "draft" | "submitted" | "addressed",
      addressedByVersionId: a.addressedByVersionId ?? null,
    })),
    packageItems: formatItems,
    approvedFormatCount: approvedFormats.size,
    requiredFormatCount: 4 as const,
  };

  return assistantGoalPresentationSchema.parse(presentation);
}
