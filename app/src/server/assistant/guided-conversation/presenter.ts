import type { GuidedFlowPresentation } from "@/lib/guided-flow/commands";
import { allowedCommandsForState } from "./transition";
import { navigationHistory, type JourneyState } from "./state";
import {
  buildBriefReview,
  getActiveBriefingPrompt,
} from "./briefing-prompts";

export function presentJourneyState(
  state: JourneyState,
  preview?: GuidedFlowPresentation["retentionPreview"]
): GuidedFlowPresentation {
  const presentation: GuidedFlowPresentation = {
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

  if (state.path === "from_zero" && state.currentStep === "collect_brief") {
    const prompt = getActiveBriefingPrompt(state.slots);
    if (prompt) {
      presentation.prompt = {
        field: prompt.field,
        labelKey: prompt.labelKey,
        quickReplies: prompt.quickReplies,
        allowSkip: prompt.allowSkip,
        allowUnknown: prompt.allowUnknown,
        suggestion: prompt.suggestion,
      };
    }
  }

  if (state.path === "from_zero" && state.currentStep === "review_brief") {
    presentation.briefReview = buildBriefReview(state.slots);
  }

  if (state.path === "existing_creative" && state.currentStep === "review_diagnosis") {
    const diagnosis = (state.slots.diagnosis ?? {}) as Record<string, unknown>;
    presentation.diagnosisReview = {
      facts: Array.isArray(diagnosis.issues)
        ? (diagnosis.issues as string[])
        : [],
      assumptions: Array.isArray(state.slots.assumptions)
        ? (state.slots.assumptions as string[])
        : [],
      missingFields: state.missingFields,
      editable: true,
    };
  }

  return presentation;
}
