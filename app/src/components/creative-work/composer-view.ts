import { hasCreativeWorkProtocolSourceShape } from "@/lib/creative-work-protocol-eligibility";
import { isPieceReferenceReady } from "@/server/creative-work/piece-reference";
import type { ComposerIntent } from "./composer-state";

type SourceUsage = "content" | "style" | "both";

type SourceShape = {
  id: string;
  status: string;
  usage: SourceUsage;
  usageConfirmed?: boolean;
  pieceReference?: Parameters<typeof isPieceReferenceReady>[0] | null;
};

export function composerHasMeaningfulInput(input: {
  intent: ComposerIntent;
  request: string;
  readySources: ReadonlyArray<Pick<SourceShape, "id" | "usage">>;
}): boolean {
  if (input.intent === "carousel") return input.request.trim().length > 0;
  return hasCreativeWorkProtocolSourceShape({
    intent: input.intent,
    request: input.request,
    sources: input.readySources.map((source) => ({ sourceId: source.id, usage: source.usage })),
  });
}

export function composerAnalyzingOrFailedSources(
  intent: ComposerIntent,
  sources: ReadonlyArray<Pick<SourceShape, "status">>,
): boolean {
  return sources.some((source) =>
    source.status === "uploaded"
    || source.status === "analyzing"
    || (intent === "single" && source.status === "failed"));
}

export function composerSinglePieceReferenceBlocked(
  intent: ComposerIntent,
  sources: ReadonlyArray<Pick<SourceShape, "pieceReference" | "usageConfirmed">>,
): boolean {
  return intent === "single" && sources.some((source) =>
    source.pieceReference ? !isPieceReferenceReady(source.pieceReference) : source.usageConfirmed === false);
}

export function persistedBrandTrainingSuggestion(input: {
  status?: string;
  assets?: unknown;
}): "missing_visual_references" | null {
  return Array.isArray(input.assets)
    && input.assets.length === 0
    && input.status !== "draft"
    && Boolean(input.status)
    ? "missing_visual_references"
    : null;
}

export function isRevisingOutputBusy(input: {
  pending: boolean;
  variables?: {
    outputId?: string;
    instruction?: string;
    revisionAssetId?: string | null;
  };
  outputId: string;
  outputs: ReadonlyArray<{
    id: string;
    parentOutputId?: string | null;
    revisionInstruction?: string | null;
    revisionAssetId?: string | null;
  }>;
}): boolean {
  if (!input.pending) return false;
  if (input.variables?.outputId === input.outputId) return true;
  const current = input.outputs.find((output) => output.id === input.outputId);
  if (!current) return false;
  return current.parentOutputId === input.variables?.outputId
    && current.revisionInstruction === input.variables?.instruction
    && current.revisionAssetId === input.variables?.revisionAssetId;
}

export type PreparedPlanTracking = {
  preparedInput: { revision: string; signature: string } | null;
  hydratingRevision: string | null;
  invalidatedPlanRevision: string | null;
  emitPlanChanged: boolean;
};

/** Keep a prepared plan visible until the operator edits the input it was built from. */
export function nextPreparedPlanTracking(input: {
  preparedPlan: { preparedRevision: string; workId: string } | null;
  hydratingRevision: string | null;
  previous: { revision: string; signature: string } | null;
  planInputSignature: string;
  invalidatedPlanRevision: string | null;
}): PreparedPlanTracking {
  if (!input.preparedPlan) {
    return {
      preparedInput: null,
      hydratingRevision: null,
      invalidatedPlanRevision: input.invalidatedPlanRevision,
      emitPlanChanged: false,
    };
  }
  if (input.hydratingRevision === input.preparedPlan.preparedRevision) {
    return {
      preparedInput: input.previous,
      hydratingRevision: null,
      invalidatedPlanRevision: null,
      emitPlanChanged: false,
    };
  }
  if (!input.previous || input.previous.revision !== input.preparedPlan.preparedRevision) {
    return {
      preparedInput: {
        revision: input.preparedPlan.preparedRevision,
        signature: input.planInputSignature,
      },
      hydratingRevision: input.hydratingRevision,
      invalidatedPlanRevision: null,
      emitPlanChanged: false,
    };
  }
  if (
    input.previous.signature !== input.planInputSignature
    && input.invalidatedPlanRevision !== input.preparedPlan.preparedRevision
  ) {
    return {
      preparedInput: input.previous,
      hydratingRevision: input.hydratingRevision,
      invalidatedPlanRevision: input.preparedPlan.preparedRevision,
      emitPlanChanged: true,
    };
  }
  return {
    preparedInput: input.previous,
    hydratingRevision: input.hydratingRevision,
    invalidatedPlanRevision: input.invalidatedPlanRevision,
    emitPlanChanged: false,
  };
}

export type ComposerBrandIdentity = {
  source: "snapshot" | "live";
  mode: string;
  versionNumber: number | null;
  assets: Array<{
    referenceId: string;
    label: string;
    usageMode: string;
    reasons: string[];
  }>;
};

export function projectComposerBrandIdentity(input: {
  intent: ComposerIntent;
  frozenKnowledge?: { mode: string; versionNumber: number | null } | null;
  snapshotAssets?: Array<{ referenceId: string; label: string; usageMode: string }>;
  reasons?: Record<string, string[]>;
  livePublished: boolean;
  liveVersionNumber: number | null;
}): ComposerBrandIdentity | null {
  if (input.intent !== "single") return null;
  if (input.frozenKnowledge) {
    return {
      source: "snapshot",
      mode: input.frozenKnowledge.mode,
      versionNumber: input.frozenKnowledge.versionNumber,
      assets: (input.snapshotAssets ?? []).map((asset) => ({
        referenceId: asset.referenceId,
        label: asset.label,
        usageMode: asset.usageMode,
        reasons: input.reasons?.[asset.referenceId] ?? [],
      })),
    };
  }
  return {
    source: "live",
    mode: input.livePublished ? "published" : "legacy_fallback",
    versionNumber: input.liveVersionNumber,
    assets: [],
  };
}
