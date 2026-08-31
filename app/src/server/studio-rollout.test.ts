import { describe, expect, it } from "vitest";
import {
  isStudioCarouselEnabled,
  resolveStudioRolloutVariant,
  studioRolloutBucket,
} from "./studio-rollout";

const workspaces = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];

describe("studio rollout", () => {
  it("has stable deterministic buckets and exact percentage boundaries", () => {
    expect(studioRolloutBucket(workspaces[0]!)).toBe(studioRolloutBucket(workspaces[0]!));
    expect(new Set(workspaces.map(studioRolloutBucket)).size).toBeGreaterThan(1);
    for (const workspaceId of workspaces) {
      expect(resolveStudioRolloutVariant(workspaceId, 0)).toBe("control");
      expect(resolveStudioRolloutVariant(workspaceId, 100)).toBe("progressive");
    }
  });
});

describe("isStudioCarouselEnabled", () => {
  it("hides new carousel creation at zero and shows it at one hundred", () => {
    for (const workspaceId of workspaces) {
      expect(isStudioCarouselEnabled(workspaceId, 0)).toBe(false);
      expect(isStudioCarouselEnabled(workspaceId, 100)).toBe(true);
    }
  });

  it("clamps out-of-range percentages to the same 0/100 boundaries", () => {
    expect(isStudioCarouselEnabled(workspaces[0]!, -10)).toBe(false);
    expect(isStudioCarouselEnabled(workspaces[0]!, 150)).toBe(true);
    expect(isStudioCarouselEnabled(workspaces[0]!, 3.7)).toBe(
      isStudioCarouselEnabled(workspaces[0]!, 3),
    );
  });

  it("uses the same workspace bucket as the progressive Studio rollout", () => {
    for (const workspaceId of workspaces) {
      const bucket = studioRolloutBucket(workspaceId);
      expect(isStudioCarouselEnabled(workspaceId, bucket)).toBe(false);
      expect(isStudioCarouselEnabled(workspaceId, bucket + 1)).toBe(true);
      // Exactly one threshold flip: the carousel gate and the progressive
      // variant switch on the very same deterministic bucket value.
      expect(resolveStudioRolloutVariant(workspaceId, bucket + 1)).toBe("progressive");
    }
  });

  it("is deterministic per workspace", () => {
    const first = isStudioCarouselEnabled(workspaces[1]!, 50);
    for (let call = 0; call < 3; call += 1) {
      expect(isStudioCarouselEnabled(workspaces[1]!, 50)).toBe(first);
    }
  });
});
