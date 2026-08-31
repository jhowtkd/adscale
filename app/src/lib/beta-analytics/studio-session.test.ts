import { describe, expect, it, vi } from "vitest";
import {
  getOrCreateStudioSession,
  STUDIO_SESSION_STORAGE_KEY,
  STUDIO_SESSION_TTL_MS,
} from "./studio-session";

const workspaceId = "11111111-1111-4111-8111-111111111111";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };
}

describe("getOrCreateStudioSession", () => {
  it("reuses a valid workspace session and rotates invalid records", () => {
    const store = storage();
    const now = 1_000;
    const current = getOrCreateStudioSession(workspaceId, now, store);
    const reused = getOrCreateStudioSession(workspaceId, now + 1, store);

    expect(reused).toEqual(current);
    expect(current.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(JSON.parse(store.setItem.mock.calls[0]?.[1] ?? "{}")).toEqual({
      id: current.id,
      workspaceId,
      expiresAt: now + STUDIO_SESSION_TTL_MS,
    });

    store.setItem(STUDIO_SESSION_STORAGE_KEY, JSON.stringify({ ...current, workspaceId: "other" }));
    expect(getOrCreateStudioSession(workspaceId, now + 2, store).id).not.toBe(current.id);
    store.setItem(STUDIO_SESSION_STORAGE_KEY, "not-json");
    expect(getOrCreateStudioSession(workspaceId, now + 3, store).id).toMatch(/^[0-9a-f-]{36}$/i);
    store.setItem(STUDIO_SESSION_STORAGE_KEY, JSON.stringify({ ...current, expiresAt: now }));
    expect(getOrCreateStudioSession(workspaceId, now, store).id).not.toBe(current.id);
  });
});
