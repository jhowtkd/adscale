export type MessageType = "user" | "assistant" | "tool" | "action_card";

export type ActionStatus =
  | "pending"
  | "confirmed"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

export type JobRef = {
  kind: "derivation" | "inngest_run";
  id: string;
};

export interface ToolMessagePayload {
  toolName: string;
  summary: string;
}

export interface ActionCardMessagePayload {
  actionRecordId: string;
  status: ActionStatus;
  display: Record<string, unknown>;
}

export type AssistantMessagePayload =
  | Record<string, never>
  | ToolMessagePayload
  | ActionCardMessagePayload;

export const ACTION_TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  pending: ["confirmed", "canceled"],
  confirmed: ["running", "canceled"],
  running: ["completed", "failed", "canceled"],
  completed: [],
  failed: [],
  canceled: [],
};

export const PERSISTENCE_DENYLIST = [
  "reasoning",
  "thinking",
  "rawArgs",
  "signedUrl",
  "internalEvidence",
] as const;

export type PersistenceDenylistKey = (typeof PERSISTENCE_DENYLIST)[number];

export function containsDeniedPersistenceKeys(
  value: unknown,
  seen = new Set<unknown>()
): boolean {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((item) => containsDeniedPersistenceKeys(item, seen));
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if ((PERSISTENCE_DENYLIST as readonly string[]).includes(key)) {
      return true;
    }
    if (containsDeniedPersistenceKeys(nested, seen)) {
      return true;
    }
  }

  return false;
}

export function isValidActionTransition(
  current: ActionStatus,
  next: ActionStatus
): boolean {
  return ACTION_TRANSITIONS[current].includes(next);
}
