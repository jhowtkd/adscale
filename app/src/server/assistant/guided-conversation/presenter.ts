import type { GuidedFlowPresentation } from "@/lib/guided-flow/commands";
import { allowedCommandsForState } from "./transition";
import { navigationHistory, type JourneyState } from "./state";

export function presentJourneyState(
  state: JourneyState,
  preview?: GuidedFlowPresentation["retentionPreview"]
): GuidedFlowPresentation {
  return {
    path: state.path,
    status: state.status,
    currentStep: state.currentStep,
    revision: state.revision,
    schemaVersion: state.schemaVersion,
    missingFields: state.missingFields,
    assetIds: state.assetIds,
    referenceIds: state.referenceIds,
    campaignId: state.campaignId,
    recoverableError: state.recoverableError as Record<string, unknown> | null,
    slots: state.slots as Record<string, unknown>,
    navigationHistory: navigationHistory(state),
    allowedCommands: allowedCommandsForState(state),
    ...(preview ? { retentionPreview: preview } : {}),
  };
}
