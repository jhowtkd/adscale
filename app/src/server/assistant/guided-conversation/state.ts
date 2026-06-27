import type { GuidedFlowPath, GuidedFlowStatus } from "@/lib/guided-flow/types";
import { GUIDED_FLOW_SCHEMA_VERSION } from "@/lib/guided-flow/commands";
import type { AssistantGuidedFlow } from "@/server/db/schema";

export interface RecoverableError {
  code: string;
  message: string;
  step?: string;
  retryCommand?: string;
}

export interface JourneySlots {
  answers?: Record<string, { value: string; source?: string; confirmed?: boolean }>;
  briefingSnapshot?: Record<string, unknown>;
  briefAnswers?: Record<string, unknown>;
  diagnosis?: Record<string, unknown>;
  assumptions?: string[];
  recommendedAction?: string;
  reviewApproved?: boolean;
  navigationHistory?: string[];
  staleFields?: string[];
  [key: string]: unknown;
}

export interface JourneyState {
  id: string;
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  path: GuidedFlowPath;
  status: GuidedFlowStatus;
  currentStep: string;
  revision: number;
  schemaVersion: number;
  slots: JourneySlots;
  missingFields: string[];
  assetIds: string[];
  referenceIds: string[];
  campaignId: string | null;
  recoverableError: RecoverableError | null;
}

function parseRecoverableError(
  value: Record<string, unknown> | null | undefined
): RecoverableError | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  if (typeof value.code !== "string" || typeof value.message !== "string") {
    return null;
  }
  return {
    code: value.code,
    message: value.message,
    step: typeof value.step === "string" ? value.step : undefined,
    retryCommand:
      typeof value.retryCommand === "string" ? value.retryCommand : undefined,
  };
}

function migrateLegacySlots(slots: Record<string, unknown>): JourneySlots {
  const migrated: JourneySlots = { ...slots };

  if (!migrated.navigationHistory) {
    migrated.navigationHistory = [];
  }

  if (migrated.briefAnswers && !migrated.answers) {
    const answers: JourneySlots["answers"] = {};
    for (const [key, value] of Object.entries(migrated.briefAnswers)) {
      if (typeof value === "string") {
        answers[key] = { value, source: "legacy", confirmed: true };
      }
    }
    migrated.answers = answers;
  }

  return migrated;
}

export function journeyStateFromRow(row: AssistantGuidedFlow): JourneyState {
  const rawSlots = (row.slots ?? {}) as Record<string, unknown>;
  const slots =
    row.schemaVersion >= GUIDED_FLOW_SCHEMA_VERSION
      ? migrateLegacySlots(rawSlots)
      : migrateLegacySlots(rawSlots);

  return {
    id: row.id,
    workspaceId: row.workspaceId,
    clientProfileId: row.clientProfileId,
    threadId: row.threadId,
    path: row.path as GuidedFlowPath,
    status: row.status as GuidedFlowStatus,
    currentStep: row.currentStep,
    revision: row.revision ?? 0,
    schemaVersion: row.schemaVersion ?? GUIDED_FLOW_SCHEMA_VERSION,
    slots,
    missingFields: (row.missingFields ?? []) as string[],
    assetIds: (row.assetIds ?? []) as string[],
    referenceIds: (row.referenceIds ?? []) as string[],
    campaignId: row.campaignId ?? null,
    recoverableError: parseRecoverableError(
      row.recoverableError as Record<string, unknown> | null | undefined
    ),
  };
}

export function journeyStateToPatch(state: JourneyState) {
  return {
    path: state.path,
    status: state.status,
    currentStep: state.currentStep,
    slots: state.slots as Record<string, unknown>,
    missingFields: state.missingFields,
    assetIds: state.assetIds,
    referenceIds: state.referenceIds,
    campaignId: state.campaignId,
    revision: state.revision,
    schemaVersion: state.schemaVersion,
    recoverableError: state.recoverableError,
  };
}

export function navigationHistory(state: JourneyState): string[] {
  return state.slots.navigationHistory ?? [];
}

export function pushNavigationHistory(state: JourneyState, step: string): JourneyState {
  const history = [...navigationHistory(state)];
  if (history[history.length - 1] !== step) {
    history.push(step);
  }
  return {
    ...state,
    slots: {
      ...state.slots,
      navigationHistory: history,
    },
  };
}
