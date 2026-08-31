import {
  STUDIO_SESSION_STORAGE_KEY,
  STUDIO_SESSION_TTL_MS,
} from "./constants";

export { STUDIO_SESSION_STORAGE_KEY, STUDIO_SESSION_TTL_MS };

export type StudioSession = {
  id: string;
  workspaceId: string;
  expiresAt: number;
};

export type StudioRolloutVariant = "control" | "progressive";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validSession(value: unknown, workspaceId: string, now: number): value is StudioSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<StudioSession>;
  return session.workspaceId === workspaceId
    && typeof session.id === "string"
    && uuidPattern.test(session.id)
    && typeof session.expiresAt === "number"
    && session.expiresAt > now;
}

export function getOrCreateStudioSession(
  workspaceId: string,
  now = Date.now(),
  storage: Pick<Storage, "getItem" | "setItem"> | undefined =
    typeof window === "undefined" ? undefined : sessionStorage,
): StudioSession {
  let existing: unknown;
  try {
    const stored = storage?.getItem(STUDIO_SESSION_STORAGE_KEY);
    existing = stored ? JSON.parse(stored) : undefined;
  } catch {
    existing = undefined;
  }
  if (validSession(existing, workspaceId, now)) return existing;

  const session = {
    id: crypto.randomUUID(),
    workspaceId,
    expiresAt: now + STUDIO_SESSION_TTL_MS,
  };
  storage?.setItem(STUDIO_SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}
