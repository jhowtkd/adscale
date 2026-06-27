import type { GuidedFlowPath, GuidedFlowStatus } from "@/lib/guided-flow/types";
import { GUIDED_FLOW_SCHEMA_VERSION } from "@/lib/guided-flow/commands";
import type { AssistantGuidedFlow } from "@/server/db/schema";
import { z } from "zod";
import {
  FROM_ZERO_STEPS,
  EXISTING_CREATIVE_STEPS,
} from "./definitions/from-zero";

export interface RecoverableError {
  code: string;
  message: string;
  step?: string;
  retryCommand?: string;
}

export interface JourneySlots {
  answers?: Record<
    string,
    { value: string; source?: string; confirmed?: boolean; unknown?: boolean }
  >;
  briefingSnapshot?: Record<string, unknown>;
  briefSnapshot?: Record<string, unknown>;
  briefAnswers?: Record<string, unknown>;
  briefReviewApproved?: boolean;
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

const commonStateSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientProfileId: z.string(),
  threadId: z.string(),
  status: z.enum(["active", "completed", "abandoned", "blocked"]),
  revision: z.number().int().min(0),
  schemaVersion: z.number().int().min(1),
  slots: z.record(z.unknown()),
  missingFields: z.array(z.string()),
  assetIds: z.array(z.string()),
  referenceIds: z.array(z.string()),
  campaignId: z.string().nullable(),
  recoverableError: z
    .object({
      code: z.string(),
      message: z.string(),
      step: z.string().optional(),
      retryCommand: z.string().optional(),
    })
    .nullable(),
});

const journeyStateSchema = z.discriminatedUnion("path", [
  commonStateSchema.extend({
    path: z.literal("unclassified"),
    currentStep: z.literal("start"),
  }),
  commonStateSchema.extend({
    path: z.literal("from_zero"),
    currentStep: z.enum(FROM_ZERO_STEPS),
  }),
  commonStateSchema.extend({
    path: z.literal("existing_creative"),
    currentStep: z.enum(EXISTING_CREATIVE_STEPS),
  }),
]);

function migrateLegacyStep(path: string, step: string): string {
  if (path === "existing_creative" && step === "await_diagnosis") {
    return "review_diagnosis";
  }
  if (path === "from_zero" && step === "await_plan") {
    return "confirm_plan";
  }
  return step;
}

export function journeyStateFromRow(row: AssistantGuidedFlow): JourneyState {
  const rawSlots = (row.slots ?? {}) as Record<string, unknown>;
  const slots =
    row.schemaVersion >= GUIDED_FLOW_SCHEMA_VERSION
      ? migrateLegacySlots(rawSlots)
      : migrateLegacySlots(rawSlots);

  const candidate = {
    id: row.id,
    workspaceId: row.workspaceId,
    clientProfileId: row.clientProfileId,
    threadId: row.threadId,
    path: row.path as GuidedFlowPath,
    status: row.status as GuidedFlowStatus,
    currentStep: migrateLegacyStep(row.path, row.currentStep),
    revision: row.revision ?? 0,
    schemaVersion: GUIDED_FLOW_SCHEMA_VERSION,
    slots,
    missingFields: (row.missingFields ?? []) as string[],
    assetIds: (row.assetIds ?? []) as string[],
    referenceIds: (row.referenceIds ?? []) as string[],
    campaignId: row.campaignId ?? null,
    recoverableError: parseRecoverableError(
      row.recoverableError as Record<string, unknown> | null | undefined
    ),
  };

  const parsed = journeyStateSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(`Invalid guided journey state: ${parsed.error.message}`);
  }
  return parsed.data as JourneyState;
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
