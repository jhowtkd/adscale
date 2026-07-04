/**
 * Bounded goal-agent event emitter. The full telemetry + graduation report is
 * built in Task 13; this minimal stub lets the lifecycle routes record
 * abandonment/stop events without a hard dependency on the analytics backend.
 *
 * Allowed metadata is strictly scalar (stage, creativeLevel, format, counts,
 * reasonCode, actionId). It must never carry message text, annotations,
 * prompts, URLs, or provider data.
 */
export const GOAL_EVENT_KEYS = [
  "goal_started",
  "goal_plan_ready",
  "goal_action_confirmed",
  "goal_batch_ready",
  "goal_base_selected",
  "goal_annotation_submitted",
  "goal_base_approved",
  "goal_package_started",
  "goal_format_approved",
  "goal_completed",
  "goal_stopped",
  "goal_abandoned",
] as const;

export type GoalEventKey = (typeof GOAL_EVENT_KEYS)[number];

export interface GoalEventInput {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  goalRunId: string;
  event: GoalEventKey;
  metadata?: Record<string, string | number | boolean | null>;
}

/**
 * Emits a goal-agent event. The implementation is a structured console log in
 * the pilot; Task 13 wires this to the durable telemetry store + graduation
 * report without changing the call sites.
 */
export async function emitGoalEvent(input: GoalEventInput): Promise<void> {
  if (!GOAL_EVENT_KEYS.includes(input.event)) {
    return;
  }
  // Structured log only — no persistence of prompt/annotation/url content.
  // eslint-disable-next-line no-console
  console.info("[goal-agent]", input.event, {
    workspaceId: input.workspaceId,
    goalRunId: input.goalRunId,
    ...input.metadata,
  });
}

export interface GraduationReportInput {
  startedObjectives: number;
  completedObjectives: number;
  distinctClients: number;
  criticalCreditFailures: number;
  criticalScopeFailures: number;
  stageDropoff: Record<string, number>;
}

export interface GraduationReport {
  startedObjectives: number;
  completedObjectives: number;
  distinctClients: number;
  completionRate: number;
  criticalCreditFailures: number;
  criticalScopeFailures: number;
  stageDropoff: Record<string, number>;
  graduation: {
    enoughObjectives: boolean;
    enoughClients: boolean;
    enoughCompletion: boolean;
    noCriticalFailures: boolean;
    passed: boolean;
  };
}

/**
 * Computes the goal-agent pilot graduation report against the locked gate:
 * at least 20 real objectives across 3 clients, at least 60% completed
 * packages, and zero critical credit or scope-isolation failures. Every gate
 * is an explicit boolean so a reviewer can see exactly which criterion failed.
 */
export function computeGraduationReport(
  input: GraduationReportInput
): GraduationReport {
  const completionRate =
    input.startedObjectives > 0
      ? input.completedObjectives / input.startedObjectives
      : 0;

  const enoughObjectives = input.startedObjectives >= 20;
  const enoughClients = input.distinctClients >= 3;
  const enoughCompletion = completionRate >= 0.6;
  const noCriticalFailures =
    input.criticalCreditFailures === 0 && input.criticalScopeFailures === 0;

  return {
    startedObjectives: input.startedObjectives,
    completedObjectives: input.completedObjectives,
    distinctClients: input.distinctClients,
    completionRate,
    criticalCreditFailures: input.criticalCreditFailures,
    criticalScopeFailures: input.criticalScopeFailures,
    stageDropoff: input.stageDropoff,
    graduation: {
      enoughObjectives,
      enoughClients,
      enoughCompletion,
      noCriticalFailures,
      passed:
        enoughObjectives && enoughClients && enoughCompletion && noCriticalFailures,
    },
  };
}
