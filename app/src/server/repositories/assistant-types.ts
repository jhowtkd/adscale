export type MessageType =
  | "user"
  | "assistant"
  | "tool"
  | "action_card"
  | "equipe_card"
  | "equipe_event"
  | "staff_message";

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

// Equipe conversation (#551). A card points at module objects by reference:
// the payload carries ids + version hashes, never a copy of the content, so
// the approval confirmation below always shows the exact closed list the
// client decides on. The chat never approves — the buttons call the Equipe
// commands endpoint (#552).
export interface EquipeCardItemRef {
  itemId: string;
  versionHash: string;
  title?: string;
  scheduledFor?: string;
}

export interface EquipeCardPayload {
  kind: "item" | "batch" | "idea" | "plan_offer";
  accountId: string;
  title: string;
  batchId?: string;
  ideaId?: string;
  approveByAt?: string;
  summary?: string;
  items: EquipeCardItemRef[];
  excluded?: Array<{ itemId: string; reason: string }>;
}

// Feed line written by the module (actor system/agent): "Redação IA criou a
// v2", "Bruna entrou na conversa". Rendered as a centered muted line.
export interface EquipeEventPayload {
  kind: string;
  text: string;
  actor?: "system" | "agent" | "staff";
  actorName?: string;
  ref?: { itemId?: string; batchId?: string };
}

// Message from one of our people (name + photo). Posting is a guarded
// internal command (#547); here only the persisted type + rendering.
export interface StaffMessagePayload {
  staffId: string;
  name: string;
  photoUrl?: string | null;
}

export type AssistantMessagePayload =
  | Record<string, never>
  | ToolMessagePayload
  | ActionCardMessagePayload
  | EquipeCardPayload
  | EquipeEventPayload
  | StaffMessagePayload;

export const ACTION_TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  pending: ["confirmed", "canceled"],
  confirmed: ["running", "canceled"],
  running: ["completed", "failed", "canceled"],
  completed: [],
  failed: ["confirmed"],
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
