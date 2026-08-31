import { describe, expect, it } from "vitest";
import { resolveStudioRolloutVariant, studioRolloutBucket } from "./studio-rollout";

describe("studio rollout", () => {
  it("has stable deterministic buckets and exact percentage boundaries", () => {
    const workspaces = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
    expect(studioRolloutBucket(workspaces[0]!)).toBe(studioRolloutBucket(workspaces[0]!));
    expect(new Set(workspaces.map(studioRolloutBucket)).size).toBeGreaterThan(1);
    for (const workspaceId of workspaces) {
      expect(resolveStudioRolloutVariant(workspaceId, 0)).toBe("control");
      expect(resolveStudioRolloutVariant(workspaceId, 100)).toBe("progressive");
    }
  });
});
