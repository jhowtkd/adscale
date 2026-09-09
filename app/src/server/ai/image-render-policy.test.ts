import { describe, expect, it } from "vitest";
import { LEGACY_IMAGE_POLICY, resolveImageRenderPolicy, selectImageRenderPolicy } from "./image-render-policy";

describe("image render policy", () => {
  it("keeps legacy snapshots and rejects corrupt present policies", () => {
    expect(resolveImageRenderPolicy(undefined)).toEqual(LEGACY_IMAGE_POLICY);
    expect(() => resolveImageRenderPolicy({ version: 2 })).toThrow();
    expect(() => resolveImageRenderPolicy(null)).toThrow();
    expect(() => resolveImageRenderPolicy({ ...LEGACY_IMAGE_POLICY, quality: "max" })).toThrow();
  });
  it("selects stable monotonic workspace cohorts without reducing quality", () => {
    for (let i = 0; i < 200; i++) {
      const id = `workspace-${i}`;
      expect(selectImageRenderPolicy(id, 0, "max")).toEqual(LEGACY_IMAGE_POLICY);
      expect(selectImageRenderPolicy(id, 100, "max").quality).toBe("max");
      const atTen = selectImageRenderPolicy(id, 10, "max");
      expect(selectImageRenderPolicy(id, 10, "max")).toEqual(atTen);
      if (atTen.model !== LEGACY_IMAGE_POLICY.model) {
        expect(selectImageRenderPolicy(id, 50, "max")).toEqual(atTen);
      }
    }
    expect(() => selectImageRenderPolicy("ws", 101, "high")).toThrow();
  });
  it("treats a missing percent as 0 and keeps the inactive quality candidate", () => {
    expect(selectImageRenderPolicy("workspace-env-gap", undefined, undefined)).toEqual(LEGACY_IMAGE_POLICY);
    expect(selectImageRenderPolicy("workspace-env-gap", undefined, "max")).toEqual(LEGACY_IMAGE_POLICY);
  });
});
