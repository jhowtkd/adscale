import type { GuidedCommand } from "@/lib/guided-flow/commands";
import { FROM_ZERO_MIN_REFERENCES } from "@/lib/guided-flow/types";
import type { RetentionPreview } from "@/lib/guided-flow/commands";
import { initialStepForPath } from "@/lib/guided-flow/types";
import {
  existingCreativeBackTarget,
  EXISTING_CREATIVE_FIELD_DEPENDENCIES,
} from "./definitions/existing-creative";
import {
  fromZeroBackTarget,
  FROM_ZERO_FIELD_DEPENDENCIES,
} from "./definitions/from-zero";
import {
  briefingReadinessPasses,
  buildBriefReview,
  getActiveBriefingPrompt,
  isBriefingComplete,
} from "./briefing-prompts";
import { mapGuidedAnswersToCampaignDraft } from "@/server/ai/guided-briefing";
import { answersFromJourneySlots } from "./briefing-prompts";
import {
  journeyStateToPatch,
  navigationHistory,
  pushNavigationHistory,
  type JourneyState,
} from "./state";

export class GuidedTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuidedTransitionError";
  }
}

export interface TransitionResult {
  state: JourneyState;
  preview?: RetentionPreview;
  noop?: boolean;
}

export type GuidedTransitionCommand =
  | GuidedCommand
  | {
      type: "apply_creative_analysis";
      workspaceAssetId: string;
      diagnosis: Record<string, unknown>;
      briefingSnapshot: Record<string, unknown>;
      assumptions: string[];
      missingFields: string[];
    }
  | { type: "action_completed"; campaignId?: string | null }
  | { type: "action_started"; campaignId?: string | null }
  | { type: "action_failed"; safeError: string }
  | { type: "action_canceled" };

function emptyPathState(
  state: JourneyState,
  path: "existing_creative" | "from_zero"
): JourneyState {
  return {
    ...state,
    path,
    status: "active",
    currentStep: initialStepForPath(path),
    missingFields: [],
    assetIds: path === "from_zero" ? [] : state.assetIds,
    referenceIds: path === "from_zero" ? [] : state.referenceIds,
    campaignId: path === "from_zero" ? null : state.campaignId,
    recoverableError: null,
    slots: {
      navigationHistory: [initialStepForPath(path)],
      answers: {},
    },
  };
}

function computeRetentionPreview(
  state: JourneyState,
  targetPath: "existing_creative" | "from_zero"
): RetentionPreview {
  if (state.path === targetPath) {
    return { retained: ["all"], cleared: [] };
  }

  const retained: string[] = [];
  const cleared: string[] = [
    "currentStep",
    "pathSpecificSlots",
    "diagnosis",
    "recommendedAction",
    "reviewApproved",
  ];

  if (state.slots.answers && Object.keys(state.slots.answers).length > 0) {
    retained.push("compatibleBriefAnswers");
  }

  if (targetPath === "existing_creative" && state.assetIds.length > 0) {
    retained.push("assetIds");
  }

  if (state.path === "from_zero" && targetPath === "existing_creative") {
    cleared.push("referenceIds", "briefSnapshot");
  }

  if (state.path === "existing_creative" && targetPath === "from_zero") {
    cleared.push("campaignId", "assetIds", "diagnosis");
  }

  return { retained, cleared };
}

function invalidateDependents(
  state: JourneyState,
  field: string,
  dependencies: Record<string, string[]>
): JourneyState {
  const dependentKeys = dependencies[field] ?? [];
  const staleFields = new Set(state.slots.staleFields ?? []);
  staleFields.add(field);
  for (const key of dependentKeys) {
    staleFields.add(key);
  }

  const nextSlots = { ...state.slots, staleFields: [...staleFields] };

  for (const key of dependentKeys) {
    if (key === "diagnosis") {
      delete nextSlots.diagnosis;
    }
    if (key === "recommendedAction") {
      delete nextSlots.recommendedAction;
    }
    if (key === "reviewApproved") {
      nextSlots.reviewApproved = false;
    }
    if (key === "briefSnapshot") {
      delete nextSlots.briefSnapshot;
    }
    if (key === "briefReviewApproved") {
      nextSlots.briefReviewApproved = false;
    }
  }

  return { ...state, slots: nextSlots };
}

function applyBack(state: JourneyState): JourneyState {
  const backTarget =
    state.path === "from_zero"
      ? fromZeroBackTarget(state.currentStep)
      : state.path === "existing_creative"
        ? existingCreativeBackTarget(state.currentStep)
        : null;

  if (!backTarget) {
    throw new GuidedTransitionError("Cannot go back from current step");
  }

  return pushNavigationHistory(
    {
      ...state,
      currentStep: backTarget,
      recoverableError: null,
    },
    backTarget
  );
}

export function transitionJourney(
  state: JourneyState,
  command: GuidedTransitionCommand
): TransitionResult {
  switch (command.type) {
    case "preview_switch":
      return {
        state,
        preview: computeRetentionPreview(state, command.path),
        noop: true,
      };

    case "preview_restart":
      return {
        state,
        preview: {
          retained: [],
          cleared: [
            "slots",
            "missingFields",
            "assetIds",
            "referenceIds",
            "campaignId",
            "recoverableError",
          ],
        },
        noop: true,
      };

    case "clear_error":
      return {
        state: { ...state, recoverableError: null },
      };

    case "select_path": {
      if (state.path !== "unclassified" && state.path !== command.path) {
        throw new GuidedTransitionError(
          "Use switch_path to change an active journey path"
        );
      }
      const next = pushNavigationHistory(
        emptyPathState(state, command.path),
        initialStepForPath(command.path)
      );
      return { state: { ...next, revision: state.revision } };
    }

    case "switch_path": {
      if (state.path === command.path) {
        return { state, noop: true };
      }
      const preview = computeRetentionPreview(state, command.path);
      const next = emptyPathState(state, command.path);
      if (preview.retained.includes("compatibleBriefAnswers") && state.slots.answers) {
        next.slots.answers = { ...state.slots.answers };
      }
      if (preview.retained.includes("assetIds")) {
        next.assetIds = [...state.assetIds];
      }
      return {
        state: pushNavigationHistory(next, next.currentStep),
      };
    }

    case "restart": {
      if (state.path === "unclassified") {
        throw new GuidedTransitionError("No active path to restart");
      }
      const path = state.path as "existing_creative" | "from_zero";
      return {
        state: pushNavigationHistory(emptyPathState(state, path), initialStepForPath(path)),
      };
    }

    case "back":
      return { state: applyBack(state) };

    case "edit_field": {
      const dependencies =
        state.path === "from_zero"
          ? FROM_ZERO_FIELD_DEPENDENCIES
          : state.path === "existing_creative"
            ? EXISTING_CREATIVE_FIELD_DEPENDENCIES
            : {};

      const answers = { ...(state.slots.answers ?? {}) };
      answers[command.field] = {
        value: command.value,
        source: "user",
        confirmed: true,
      };

      let next: JourneyState = {
        ...state,
        recoverableError: null,
        slots: {
          ...state.slots,
          answers,
        },
      };

      next = invalidateDependents(next, command.field, dependencies);
      return { state: next };
    }

    case "answer_brief": {
      if (state.path !== "from_zero" || state.currentStep !== "collect_brief") {
        throw new GuidedTransitionError("Brief answers are only accepted during collect_brief");
      }

      const answers = { ...(state.slots.answers ?? {}) };
      answers[command.field] = {
        value: command.unknown ? "" : command.value,
        source: "user",
        confirmed: true,
        unknown: command.unknown,
      };

      const nextSlots = {
        ...state.slots,
        answers,
      };

      let nextStep = state.currentStep;
      if (isBriefingComplete(nextSlots)) {
        nextStep = "review_brief";
      }

      return {
        state: pushNavigationHistory(
          {
            ...state,
            currentStep: nextStep,
            recoverableError: null,
            slots: nextSlots,
          },
          nextStep
        ),
      };
    }

    case "skip_brief_field": {
      if (state.path !== "from_zero" || state.currentStep !== "collect_brief") {
        throw new GuidedTransitionError("Skip is only allowed during collect_brief");
      }

      const prompt = getActiveBriefingPrompt(state.slots);
      if (!prompt?.allowSkip || prompt.field !== command.field) {
        throw new GuidedTransitionError("Field cannot be skipped");
      }

      const answers = { ...(state.slots.answers ?? {}) };
      answers[command.field] = {
        value: "",
        source: "user",
        confirmed: true,
        unknown: true,
      };

      const nextSlots = { ...state.slots, answers };
      let nextStep = state.currentStep;
      if (isBriefingComplete(nextSlots)) {
        nextStep = "review_brief";
      }

      return {
        state: pushNavigationHistory(
          { ...state, currentStep: nextStep, slots: nextSlots },
          nextStep
        ),
      };
    }

    case "confirm_brief_review": {
      if (state.path !== "from_zero" || state.currentStep !== "review_brief") {
        throw new GuidedTransitionError("Brief review is not active");
      }
      if (!briefingReadinessPasses(state.slots)) {
        throw new GuidedTransitionError("Briefing readiness rules not satisfied");
      }

      const briefAnswers = answersFromJourneySlots(state.slots);
      const briefSnapshot = mapGuidedAnswersToCampaignDraft(briefAnswers, "pt-BR");

      return {
        state: pushNavigationHistory(
          {
            ...state,
            currentStep: "select_references",
            missingFields: [],
            slots: {
              ...state.slots,
              briefAnswers: briefAnswers as Record<string, unknown>,
              briefSnapshot,
              briefReviewApproved: true,
            },
          },
          "select_references"
        ),
      };
    }

    case "set_references": {
      if (state.path !== "from_zero" || state.currentStep !== "select_references") {
        throw new GuidedTransitionError("References are only accepted during select_references");
      }
      const referenceIds = [...new Set(command.referenceIds)];
      if (referenceIds.length < FROM_ZERO_MIN_REFERENCES) {
        throw new GuidedTransitionError("At least three validated references are required");
      }
      return {
        state: pushNavigationHistory(
          {
            ...state,
            currentStep: "confirm_plan",
            referenceIds,
            missingFields: [],
            recoverableError: null,
            slots: {
              ...state.slots,
              referenceCount: referenceIds.length,
              recommendedAction: "create_creative_plan",
            },
          },
          "confirm_plan"
        ),
      };
    }

    case "select_creative":
      throw new GuidedTransitionError("Creative selection must be resolved by the command service");

    case "apply_creative_analysis": {
      if (state.path !== "existing_creative" || state.currentStep !== "select_creative") {
        throw new GuidedTransitionError("Creative analysis is only accepted during select_creative");
      }
      return {
        state: pushNavigationHistory(
          {
            ...state,
            currentStep: "review_diagnosis",
            campaignId: null,
            assetIds: [command.workspaceAssetId],
            missingFields: command.missingFields,
            recoverableError: null,
            slots: {
              ...state.slots,
              briefingSnapshot: command.briefingSnapshot,
              diagnosis: command.diagnosis,
              assumptions: command.assumptions,
              baseWorkspaceAssetId: command.workspaceAssetId,
              recommendedAction: "start_complete_campaign",
              reviewApproved: false,
            },
          },
          "review_diagnosis"
        ),
      };
    }

    case "action_completed":
      return {
        state: {
          ...state,
          status: "completed",
          campaignId: command.campaignId ?? state.campaignId,
          recoverableError: null,
        },
      };

    case "action_started":
      return {
        state: {
          ...state,
          status: "active",
          campaignId: command.campaignId ?? state.campaignId,
          recoverableError: null,
        },
      };

    case "action_failed":
      return {
        state: {
          ...state,
          status: "blocked",
          recoverableError: {
            code: "action_failed",
            message: command.safeError,
            step: state.currentStep,
            retryCommand: "clear_error",
          },
        },
      };

    case "action_canceled":
      return {
        state: { ...state, status: "active", recoverableError: null },
      };

    case "correct_diagnosis_field": {
      if (state.path !== "existing_creative" || state.currentStep !== "review_diagnosis") {
        throw new GuidedTransitionError("Diagnosis correction is not active");
      }

      const briefingSnapshot = {
        ...((state.slots.briefingSnapshot as Record<string, unknown>) ?? {}),
        [command.field]: command.value,
      };

      let next = invalidateDependents(
        {
          ...state,
          slots: {
            ...state.slots,
            briefingSnapshot,
            reviewApproved: false,
          },
          missingFields: state.missingFields.filter((f) => f !== command.field),
        },
        command.field,
        EXISTING_CREATIVE_FIELD_DEPENDENCIES
      );

      return { state: next };
    }

    case "correct_diagnosis_assumption": {
      if (state.path !== "existing_creative" || state.currentStep !== "review_diagnosis") {
        throw new GuidedTransitionError("Diagnosis correction is not active");
      }
      const assumptions = Array.isArray(state.slots.assumptions)
        ? [...state.slots.assumptions]
        : [];
      if (command.index >= assumptions.length) {
        throw new GuidedTransitionError("Diagnosis assumption not found");
      }
      assumptions[command.index] = command.value;
      return {
        state: invalidateDependents(
          {
            ...state,
            slots: { ...state.slots, assumptions, reviewApproved: false },
          },
          "assumptions",
          EXISTING_CREATIVE_FIELD_DEPENDENCIES
        ),
      };
    }

    case "approve_diagnosis": {
      if (state.path !== "existing_creative" || state.currentStep !== "review_diagnosis") {
        throw new GuidedTransitionError("Diagnosis review is not active");
      }

      return {
        state: pushNavigationHistory(
          {
            ...state,
            currentStep: "confirm_improvement",
            slots: {
              ...state.slots,
              reviewApproved: true,
            },
          },
          "confirm_improvement"
        ),
      };
    }

    default: {
      const _exhaustive: never = command;
      throw new GuidedTransitionError(`Unsupported command: ${String(_exhaustive)}`);
    }
  }
}

export function allowedCommandsForState(state: JourneyState): GuidedCommand["type"][] {
  const commands: GuidedCommand["type"][] = ["preview_restart"];

  if (state.recoverableError) {
    commands.push("clear_error");
  }

  if (state.path === "unclassified") {
    return ["select_path", ...commands];
  }

  if (state.path === "from_zero" && state.currentStep === "collect_brief") {
    commands.push("answer_brief", "skip_brief_field");
  }

  if (state.path === "from_zero" && state.currentStep === "review_brief") {
    commands.push("confirm_brief_review", "edit_field");
  }

  if (state.path === "from_zero" && state.currentStep === "select_references") {
    commands.push("set_references");
  }

  if (state.path === "existing_creative" && state.currentStep === "select_creative") {
    commands.push("select_creative");
  }

  if (state.path === "existing_creative" && state.currentStep === "review_diagnosis") {
    commands.push("correct_diagnosis_field", "correct_diagnosis_assumption", "approve_diagnosis");
  }

  commands.push("back", "switch_path", "preview_switch", "restart", "edit_field");

  const history = navigationHistory(state);
  const backTarget =
    state.path === "from_zero"
      ? fromZeroBackTarget(state.currentStep)
      : state.path === "existing_creative"
        ? existingCreativeBackTarget(state.currentStep)
        : null;

  if (!backTarget && history.length <= 1) {
    return commands.filter((c) => c !== "back");
  }

  return commands;
}

export { journeyStateToPatch };
