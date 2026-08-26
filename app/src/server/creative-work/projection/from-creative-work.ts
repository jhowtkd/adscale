import {
  getCanonicalWorkNextAction,
  mapCreativeWorkOutputStatusToCanonical,
  normalizeCreativeWorkState,
} from "@/server/creative-work/canonical/status";
import {
  makeCanonicalWorkId,
  requireIso,
  toIso,
  type CanonicalCreativeWork,
  type CanonicalOutput,
  type CanonicalVersion,
  type CanonicalWorkSummary,
} from "@/server/creative-work/canonical/types";
import {
  resolveCreativeWorkInferredBriefing,
  type CreativeWorkInputSnapshot,
} from "@/server/creative-work/contracts";

export interface CreativeWorkProjectionSource {
  id: string;
  workspaceId: string;
  clientProfileId: string;
  brandName?: string | null;
  campaignId?: string | null;
  title?: string;
  toolKind: string;
  status: string;
  format: string;
  brief: {
    theme?: string | null;
    objective?: string | null;
    audience?: string | null;
    offer?: string | null;
  } | null;
  inputSnapshot?: Pick<CreativeWorkInputSnapshot, "inferredBriefing"> | null;
  copy: {
    headline?: string | null;
    body?: string | null;
    cta?: string | null;
  } | null;
  identitySnapshot: unknown | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CreativeWorkOutputProjectionSource {
  id: string;
  status: string;
  creativeLevel: string | null;
  targetFormat?: string | null;
  versionNumber?: number | null;
  parentOutputId?: string | null;
  /**
   * Direction this output belongs to (#124). Directional outputs share the
   * same creative level and format, so the plan key below must include it or
   * later entries would overwrite earlier ones. Absent on legacy outputs.
   */
  directionId?: string | null;
  outputKey: string | null;
  isSelected: boolean | null;
  createdAt?: Date | string | null;
}

function resumeHrefForCreativeWork(workItemId: string, campaignId: string | null | undefined): string {
  return campaignId
    ? `/campaigns/${campaignId}?creativeWork=${workItemId}`
    : `/creative-work/${workItemId}`;
}

export function projectCreativeWorkAsCanonicalWork(
  work: CreativeWorkProjectionSource,
  outputs: CreativeWorkOutputProjectionSource[] = []
): CanonicalCreativeWork {
  const hasCopy = Boolean(work.copy);
  const hasIdentitySnapshot = work.identitySnapshot != null;
  const outputStatuses = outputs.map((o) => o.status);
  const hasSelectedOutput = outputs.some((o) => o.isSelected === true);

  const state = normalizeCreativeWorkState({
    status: work.status,
    hasCopy,
    hasIdentitySnapshot,
    outputStatuses,
    hasSelectedOutput,
  });

  const orderedOutputs = [...outputs].sort((left, right) => {
    const leftFormat = left.targetFormat ?? work.format;
    const rightFormat = right.targetFormat ?? work.format;
    return leftFormat.localeCompare(rightFormat)
      || (left.creativeLevel ?? "").localeCompare(right.creativeLevel ?? "")
      || (left.versionNumber ?? 1) - (right.versionNumber ?? 1);
  });
  const latestByPlan = new Map<string, CreativeWorkOutputProjectionSource>();
  for (const output of orderedOutputs) {
    const planKey = output.directionId
      ? `${output.creativeLevel ?? ""}:${output.targetFormat ?? work.format}:direction:${output.directionId}`
      : `${output.creativeLevel ?? ""}:${output.targetFormat ?? work.format}`;
    latestByPlan.set(planKey, output);
  }

  const projectOutput = (o: CreativeWorkOutputProjectionSource): CanonicalOutput => {
    const status = mapCreativeWorkOutputStatusToCanonical(o.status);
    return {
      id: o.id,
      sourceKind: "creative_work_output" as const,
      status: o.isSelected ? "approved" : status,
      format: o.targetFormat ?? work.format,
      creativeLevel: o.creativeLevel,
      outputKey: o.outputKey,
      isSelected: o.isSelected === true,
      versionLabel: `${o.creativeLevel ?? o.id.slice(0, 8)} ${o.targetFormat ?? work.format} · v${o.versionNumber ?? 1}`,
      createdAt: toIso(o.createdAt),
    };
  };
  const canonicalOutputs: CanonicalOutput[] = [...latestByPlan.values()].map(projectOutput);

  const versions: CanonicalVersion[] = orderedOutputs.map((output) => ({
    id: `version:${output.id}`,
    label: `${output.creativeLevel ?? output.id.slice(0, 8)} ${output.targetFormat ?? work.format} · v${output.versionNumber ?? 1}`,
    outputId: output.id,
    createdAt: toIso(output.createdAt),
  }));

  const selected = orderedOutputs.find((output) => output.isSelected) ?? null;
  const preview = [...orderedOutputs].reverse().find((output) => output.outputKey && output.status === "completed") ?? null;

  // Historical read compatibility: #194 keeps completed rows immutable.
  // Remove this fallback only after an explicit migration proves no stored
  // Creative Work still lacks the versioned envelope.
  const inferredBriefing = work.toolKind === "single"
    ? resolveCreativeWorkInferredBriefing(work.inputSnapshot)
    : null;
  const theme = inferredBriefing ? inferredBriefing.message.value : work.brief?.theme ?? null;
  const name = work.title?.trim() || theme?.trim() || "Criar Post";

  return {
    id: makeCanonicalWorkId("creative_work", work.id),
    originKind: "creative_work",
    originId: work.id,
    origin: "quick_tool",
    workspaceId: work.workspaceId,
    clientProfileId: work.clientProfileId,
    name,
    state,
    intent: {
      kind: "social_post",
      objective: inferredBriefing ? inferredBriefing.objective.value : work.brief?.objective ?? null,
      formatHint: work.format,
      platforms: [],
    },
    briefing: {
      product: null,
      client: null,
      audience: inferredBriefing ? inferredBriefing.audience.value : work.brief?.audience ?? null,
      offer: inferredBriefing ? inferredBriefing.offer.value : work.brief?.offer ?? null,
      tone: inferredBriefing?.tone.value ?? null,
      constraints: inferredBriefing?.constraints.value ?? null,
      notes: null,
      headline: work.copy?.headline ?? null,
      body: work.copy?.body ?? null,
      cta: work.copy?.cta ?? null,
      theme,
    },
    outputs: canonicalOutputs,
    versions,
    selectedOutputId: selected?.id ?? null,
    createdAt: requireIso(work.createdAt),
    updatedAt: requireIso(work.updatedAt),
    resumable: state !== "abandoned" && state !== "failed",
    resumeHref: resumeHrefForCreativeWork(work.id, work.campaignId),
    protocol: work.toolKind === "social_post" ? "variations" : work.toolKind,
    brandName: work.brandName ?? null,
    previewHref: preview
      ? `/api/creative-work/${work.id}/outputs/${preview.id}/download`
      : null,
    previewAlt: name,
    resultCount: canonicalOutputs.filter(
      (output) => output.outputKey && (output.status === "ready" || output.status === "approved"),
    ).length,
    nextAction: getCanonicalWorkNextAction(state),
  };
}

export function summarizeCreativeWorkAsCanonicalWork(
  work: CreativeWorkProjectionSource,
  outputs: CreativeWorkOutputProjectionSource[] = []
): CanonicalWorkSummary {
  const full = projectCreativeWorkAsCanonicalWork(work, outputs);
  return {
    id: full.id,
    originKind: full.originKind,
    originId: full.originId,
    origin: full.origin,
    workspaceId: full.workspaceId,
    clientProfileId: full.clientProfileId,
    name: full.name,
    state: full.state,
    updatedAt: full.updatedAt,
    resumable: full.resumable,
    resumeHref: full.resumeHref,
    protocol: full.protocol,
    brandName: full.brandName,
    previewHref: full.previewHref,
    previewAlt: full.previewAlt,
    resultCount: full.resultCount,
    nextAction: full.nextAction,
  };
}
