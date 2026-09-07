import { createDefaultCreativeDirectionPool, type CreativeDirectionPool } from "@/server/creative-work/contracts";
import { protocolIdentityContract } from "@/server/creative-work/identity-policy";
import type { StudioRolloutVariant } from "@/lib/beta-analytics/studio-session";
import type { CreativeSourceUsage } from "@/lib/hooks/use-creative-work";
import type { ComposerActionPhase, ComposerFormat, ComposerIntent } from "./composer-state";

export type SelectIntentAction = "first_progressive" | "noop" | "defer" | "switch";

export function nextProtocolTargetFormats(intent: ComposerIntent): ComposerFormat[] {
  return intent === "format_adaptation" ? ["1:1", "9:16"] : [];
}

export function nextProtocolDirectionPool(intent: ComposerIntent): CreativeDirectionPool | null {
  return intent === "variations" ? createDefaultCreativeDirectionPool() : null;
}

export function firstProgressiveObjectiveUsage(intent: ComposerIntent): CreativeSourceUsage {
  if (intent === "restyle") return protocolIdentityContract("restyle").restyleOriginalUsage ?? "content";
  if (intent === "carousel") return "style";
  return "both";
}

export function protocolSwitchHasPendingWork(input: {
  isUploading: boolean;
  actionPhase: ComposerActionPhase;
  sourceMutationPending: boolean;
  createMutationPending: boolean;
  createInFlight: boolean;
  hasUnsavedChanges: boolean;
}): boolean {
  return input.isUploading
    || input.actionPhase !== "idle"
    || input.sourceMutationPending
    || input.createMutationPending
    || input.createInFlight
    || input.hasUnsavedChanges;
}

/** First progressive pick keeps free-entry text/file; later picks switch or wait. */
export function selectIntentDecision(input: {
  workflowVariant: StudioRolloutVariant;
  hasObjective: boolean;
  next: ComposerIntent;
  current: ComposerIntent;
  hasPendingWork: boolean;
}): SelectIntentAction {
  if (input.workflowVariant === "progressive" && !input.hasObjective) return "first_progressive";
  if (input.next === input.current) return "noop";
  if (input.hasPendingWork) return "defer";
  return "switch";
}
