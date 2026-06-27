import type { GuidedCommand } from "@/lib/guided-flow/commands";
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
  command: GuidedCommand
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
