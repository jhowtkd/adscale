"use client";

import { z } from "zod";
import { quoteCreativeWork, type CreativeDirectionPool } from "@/server/creative-work/contracts";
import type { CreativeWorkItem, CreativeWorkSource, CreativeWorkDetail } from "@/lib/hooks/use-creative-work";
import type { CreativeWorkBriefingOverrides } from "@/server/creative-work/contracts";

export type ComposerState = "empty" | "saving" | "analyzing" | "ready" | "generating" | "results";
export type ComposerActionPhase = "idle" | "saving" | "preparing" | "submitting" | "reconciling";
export type ComposerIntent = Exclude<CreativeWorkItem["toolKind"], "social_post">;
export type ComposerStage = "entry" | "configure" | "plan" | "generation" | "results";
export type ComposerFormat = CreativeWorkItem["format"];

export type DraftSnapshot = {
  request: string;
  intent: ComposerIntent;
  format: ComposerFormat;
  settings: {
    targetFormats: ComposerFormat[];
    formatMode: "auto" | "manual";
    textLayout?: "top" | "center" | "bottom" | "side";
    fontAssetKey?: string;
    directionPool?: CreativeDirectionPool;
    briefingOverrides?: CreativeWorkBriefingOverrides;
    briefingVersion?: number;
  };
};

export const COMPOSER_INTENTS = new Set<ComposerIntent>([
  "variations",
  "single",
  "format_adaptation",
  "restyle",
  "carousel",
]);

export const UUID_SCHEMA = z.string().uuid();
const DRAFT_STORAGE_PREFIX = "adscale:creative-draft:v1";

export function draftStorageKey(clientProfileId: string, intent: ComposerIntent): string {
  return `${DRAFT_STORAGE_PREFIX}:${clientProfileId}:${intent}`;
}

export function readStoredDraft(clientProfileId: string, intent: ComposerIntent): string | null {
  if (typeof window === "undefined") return null;
  if (typeof window.localStorage?.getItem !== "function") return null;
  const value = window.localStorage.getItem(draftStorageKey(clientProfileId, intent));
  return value && UUID_SCHEMA.safeParse(value).success ? value : null;
}

export function writeStoredDraft(clientProfileId: string, intent: ComposerIntent, workId: string): void {
  if (typeof window === "undefined" || typeof window.localStorage?.setItem !== "function" || !UUID_SCHEMA.safeParse(workId).success) return;
  window.localStorage.setItem(draftStorageKey(clientProfileId, intent), workId);
}

export function clearStoredDraft(clientProfileId: string, intent: ComposerIntent): void {
  if (typeof window === "undefined" || typeof window.localStorage?.removeItem !== "function") return;
  window.localStorage.removeItem(draftStorageKey(clientProfileId, intent));
}

export function reusableSourceForProtocol(
  previous: ComposerIntent,
  next: ComposerIntent,
  sources: readonly CreativeWorkSource[],
): ({ assetId: string } | { templateId: string }) & { usage?: CreativeWorkSource["usage"] } | null {
  if (next === "single" || next === "carousel") return null;
  const original = sources.find((source) =>
    source.status === "ready"
    && source.usageConfirmed
    && source.usage !== "style"
    && (previous !== "single" || source.usage === "content")
    && Boolean(source.assetId || source.templateId)
  );
  if (!original) return null;
  const identity = original.assetId ? { assetId: original.assetId } : { templateId: original.templateId! };
  return { ...identity, usage: next === "restyle" ? "content" : "both" };
}

export function canonicalQuote(
  intent: ComposerIntent,
  format: ComposerFormat,
  targetFormats: ComposerFormat[],
  directionPool?: CreativeDirectionPool,
) {
  if (intent === "carousel") return { unitCount: 0, credits: 0 };
  const { unitCount, credits } = quoteCreativeWork({ intent, format, targetFormats, directionPool });
  return { unitCount, credits };
}

export function signature(snapshot: DraftSnapshot) {
  return JSON.stringify(snapshot);
}

export function snapshotFromWork(work: Pick<CreativeWorkItem, "request" | "toolKind" | "format" | "settings">): DraftSnapshot {
  return {
    request: work.request,
    intent: work.toolKind === "social_post" ? "variations" : work.toolKind,
    format: work.format,
    settings: {
      targetFormats: [...work.settings.targetFormats],
      formatMode: work.settings.formatMode ?? "manual",
      ...(work.settings.textLayout ? { textLayout: work.settings.textLayout } : {}),
      ...(work.settings.fontAssetKey ? { fontAssetKey: work.settings.fontAssetKey } : {}),
      ...(work.settings.directionPool ? {
        directionPool: {
          ...work.settings.directionPool,
          directions: work.settings.directionPool.directions.map((direction) => ({ ...direction })),
          selectedIds: [...work.settings.directionPool.selectedIds],
        },
      } : {}),
      ...(work.settings.briefingOverrides ? { briefingOverrides: { ...work.settings.briefingOverrides } } : {}),
      ...(work.settings.briefingVersion !== undefined ? { briefingVersion: work.settings.briefingVersion } : {}),
    },
  };
}

export function isCreativeWorkConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & { status?: unknown };
  return candidate.status === 409;
}

export function focusBrandSwitcher() {
  (document.getElementById("active-brand-switcher-inline")
    ?? document.getElementById("active-brand-switcher"))?.focus();
}

export function projectComposerStage(input: {
  objectiveSelected: boolean;
  detail: CreativeWorkDetail | null;
}): ComposerStage {
  if (!input.objectiveSelected) return "entry";
  if (!input.detail) return "configure";
  if (input.detail.work.status === "draft") return input.detail.preparedPlan ? "plan" : "configure";
  if (input.detail.work.status === "ready" && input.detail.outputs.length === 0) return "plan";
  if (input.detail.work.status === "generating" || input.detail.outputs.some((output) => output.status === "queued" || output.status === "processing")) return "generation";
  return "results";
}

export function projectComposerBusyState(input: {
  generatePending: boolean;
  workStatus?: string | null;
  hasOutputs: boolean;
  isUploading: boolean;
  createPending: boolean;
  autosavePending: boolean;
  sourceMutationPending: boolean;
  preparePending: boolean;
  analyzingSources: boolean;
  hasWorkId: boolean;
  hasRequest: boolean;
  hasSources: boolean;
}): ComposerState {
  if (input.generatePending || input.workStatus === "generating") return "generating";
  if (input.hasOutputs || ["partial", "completed", "failed"].includes(input.workStatus ?? "")) return "results";
  if (input.isUploading || input.createPending || input.autosavePending || input.sourceMutationPending) return "saving";
  if (input.preparePending || input.analyzingSources) return "analyzing";
  if (input.hasWorkId || input.hasRequest || input.hasSources) return "ready";
  return "empty";
}

export function projectVisiblePreparedPlan<T extends { preparedRevision: string }>(input: {
  preparedPlan: T | null;
  preparedInput: { revision: string; signature: string } | null;
  planInputSignature: string;
  invalidatedPlanRevision: string | null;
}): { visiblePreparedPlan: T | null; planChangedSincePreparation: boolean } {
  const planChangedSincePreparation = Boolean(input.preparedInput
    && input.preparedInput.revision === input.preparedPlan?.preparedRevision
    && input.preparedInput.signature !== input.planInputSignature);
  const visiblePreparedPlan = input.invalidatedPlanRevision === input.preparedPlan?.preparedRevision
    || planChangedSincePreparation
    ? null
    : input.preparedPlan;
  return { visiblePreparedPlan, planChangedSincePreparation };
}

export function projectVisibleComposerStage(stage: ComposerStage, hasVisiblePlan: boolean): ComposerStage {
  return hasVisiblePlan ? stage : stage === "plan" ? "configure" : stage;
}

export function projectComposerGenerateGate(input: {
  clientProfileId: string | null;
  hasMeaningfulInput: boolean;
  workStatus?: string | null;
  outputCount: number;
  analyzingOrFailedSources: boolean;
  singlePieceReferenceBlocked: boolean;
  formatAdaptationNeedsFormats: boolean;
  singleNeedsFont: boolean;
  isUploading: boolean;
  actionPhase: ComposerActionPhase;
  generatePending: boolean;
  sourceMutationPending: boolean;
  briefingBusy: boolean;
  briefingBlocked: boolean;
  brandConflictPending: boolean;
}): boolean {
  return Boolean(input.clientProfileId)
    && input.hasMeaningfulInput
    && (!input.workStatus || input.workStatus === "draft"
      || (input.workStatus === "ready" && input.outputCount === 0))
    && !input.analyzingOrFailedSources
    && !input.singlePieceReferenceBlocked
    && !input.formatAdaptationNeedsFormats
    && !input.singleNeedsFont
    && !input.isUploading
    && input.actionPhase === "idle"
    && !input.generatePending
    && !input.sourceMutationPending
    && !input.briefingBusy
    && !input.briefingBlocked
    && !input.brandConflictPending;
}
