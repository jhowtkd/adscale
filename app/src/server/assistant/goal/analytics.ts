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
