import type { CreativeDirectionPool, CreativeWorkBriefingOverrides } from "@/server/creative-work/contracts";
import type { ComposerFormat, ComposerIntent, DraftSnapshot } from "./composer-state";

export function shouldDeferDraftCreate(input: {
  workflowVariant: string;
  objective: string | null | undefined;
}): boolean {
  return input.workflowVariant === "progressive" && !input.objective;
}

export function canFlushAutosaveForWork(input: {
  status: string | undefined;
  outputCount: number;
  autosaveBlocked: boolean;
  revisionUnavailable: boolean;
}): boolean {
  if (input.autosaveBlocked || input.revisionUnavailable) return false;
  if (!input.status || input.status === "draft") return true;
  return input.status === "ready" && input.outputCount === 0;
}

export function captureDraftSnapshot(input: {
  request: string;
  intent: ComposerIntent;
  format: ComposerFormat;
  targetFormats: ComposerFormat[];
  formatMode: "auto" | "manual";
  textLayout: "top" | "center" | "bottom" | "side";
  fontAssetKey: string | null;
  directionPool: CreativeDirectionPool | null;
  briefingOverrides?: CreativeWorkBriefingOverrides;
  briefingVersion?: number;
}): DraftSnapshot {
  return {
    request: input.request,
    intent: input.intent,
    format: input.format,
    settings: {
      targetFormats: [...input.targetFormats],
      formatMode: input.formatMode,
      ...(input.intent === "single" ? {
        ...(input.textLayout !== "top" ? { textLayout: input.textLayout } : {}),
        ...(input.fontAssetKey ? { fontAssetKey: input.fontAssetKey } : {}),
      } : {}),
      ...(input.directionPool ? {
        directionPool: {
          ...input.directionPool,
          directions: input.directionPool.directions.map((direction) => ({ ...direction })),
          selectedIds: [...input.directionPool.selectedIds],
        },
      } : {}),
      ...(input.briefingOverrides ? { briefingOverrides: { ...input.briefingOverrides } } : {}),
      ...(input.briefingVersion !== undefined ? { briefingVersion: input.briefingVersion } : {}),
    },
  };
}
