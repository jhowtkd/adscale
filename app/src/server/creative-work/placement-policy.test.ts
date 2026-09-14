import { describe, expect, it } from "vitest";
import {
  buildStaticComposePlan,
  clampWidthRatio,
  clearspacePx,
  contrastRatio,
  layerBox,
  policyForExactAsset,
  preflightExactComposition,
  relativeLuminance,
  toProvenance,
} from "./placement-policy";
import type { CreativeWorkIdentityAssetSnapshot } from "./contracts";

function asset(
  overrides: Partial<CreativeWorkIdentityAssetSnapshot> & {
    category: CreativeWorkIdentityAssetSnapshot["category"];
  },
): CreativeWorkIdentityAssetSnapshot {
  return {
    referenceId: overrides.referenceId ?? "ref-1",
    assetKey: overrides.assetKey ?? "ws/logo.png",
    label: overrides.label ?? "Logo",
    category: overrides.category,
    usageMode: overrides.usageMode ?? "exact",
    analysis: null,
    mimeType: "image/png",
    hasAlpha: overrides.hasAlpha ?? true,
    placement: overrides.placement ?? null,
  };
}

describe("policyForExactAsset — per format, not category-only", () => {
  it("gives logo different width preferences on 9:16 vs 1:1", () => {
    const square = policyForExactAsset("logo", "1:1")!;
    const story = policyForExactAsset("logo", "9:16")!;
    expect(square.preferredGravity).toBe("southwest");
    expect(story.preferredWidthRatio).toBeGreaterThanOrEqual(square.preferredWidthRatio);
    expect(square.clearspaceRatio).not.toEqual(story.clearspaceRatio);
  });

  it("marks logo required and graphic omissible", () => {
    expect(policyForExactAsset("logo", "4:5")!.required).toBe(true);
    expect(policyForExactAsset("logo", "4:5")!.omissible).toBe(false);
    expect(policyForExactAsset("graphic", "4:5")!.omissible).toBe(true);
  });

  it("returns null for visual_reference", () => {
    expect(policyForExactAsset("visual_reference", "4:5")).toBeNull();
  });

  it("returns null for person: people are never exact-composited", () => {
    expect(policyForExactAsset("person", "4:5")).toBeNull();
  });
});

describe("layerBox + clearspace", () => {
  it("insets southwest logo from the left and bottom edges", () => {
    const box = layerBox({
      gravity: "southwest",
      canvas: { width: 1080, height: 1350 },
      layer: { width: 200, height: 80 },
      clearspacePx: 40,
    });
    expect(box.left).toBe(40);
    expect(box.top).toBe(1350 - 80 - 40);
  });

  it("respects clearspace on all three priority formats", () => {
    for (const dims of [
      { width: 1080, height: 1080 },
      { width: 1080, height: 1350 },
      { width: 1080, height: 1920 },
    ]) {
      const policy = policyForExactAsset("logo", "4:5")!;
      const pad = clearspacePx(dims, policy);
      expect(pad).toBeGreaterThan(20);
      const box = layerBox({
        gravity: "southwest",
        canvas: dims,
        layer: { width: 200, height: 60 },
        clearspacePx: pad,
      });
      expect(box.left).toBe(pad);
      expect(box.top + box.height).toBe(dims.height - pad);
    }
  });
});

describe("contrastRatio", () => {
  it("is high for yellow on navy and low for navy on navy", () => {
    const navy = relativeLuminance(7, 21, 34);
    const yellow = relativeLuminance(255, 201, 20);
    expect(contrastRatio(yellow, navy)).toBeGreaterThan(5);
    expect(contrastRatio(navy, navy)).toBeCloseTo(1, 5);
  });
});

describe("preflightExactComposition", () => {
  it("blocks required exact assets without alpha before the provider call", () => {
    const result = preflightExactComposition({
      format: "4:5",
      dimensions: { width: 1080, height: 1350 },
      assets: [asset({ category: "logo", hasAlpha: false })],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.blocked[0]?.reason).toBe("exact_asset_missing_alpha");
    }
  });

  it("passes when exact logo has alpha", () => {
    const result = preflightExactComposition({
      format: "4:5",
      dimensions: { width: 1080, height: 1350 },
      assets: [asset({ category: "logo", hasAlpha: true })],
    });
    expect(result).toEqual({ ok: true });
  });

  it("blocks an exact transparent seal whose decoded aspect cannot fit before the provider", () => {
    const result = preflightExactComposition({
      format: "4:5",
      dimensions: { width: 1080, height: 1350 },
      assets: [asset({ category: "logo", hasAlpha: true })],
      inspectedAssets: new Map([["ws/logo.png", { width: 1, height: 10_000 }]]),
    });
    expect(result).toEqual(expect.objectContaining({ ok: false }));
    if (!result.ok) expect(result.blocked[0]?.reason).toBe("exact_asset_no_space");
  });

  it("keeps a decoded transparent logo with a feasible aspect eligible", () => {
    const result = preflightExactComposition({
      format: "4:5",
      dimensions: { width: 1080, height: 1350 },
      assets: [asset({ category: "logo", hasAlpha: true })],
      inspectedAssets: new Map([["ws/logo.png", { width: 200, height: 80 }]]),
    });
    expect(result).toEqual({ ok: true });
  });

  it("reports an impossible optional exact graphic as an omission instead of blocking", () => {
    const result = preflightExactComposition({
      format: "4:5",
      dimensions: { width: 1080, height: 1350 },
      assets: [asset({ category: "graphic", hasAlpha: true })],
      inspectedAssets: new Map([["ws/logo.png", { width: 1, height: 10_000 }]]),
      reportOmissions: true,
    });
    expect(result).toEqual(expect.objectContaining({ ok: true }));
    if (result.ok) expect(result.omitted).toEqual([
      expect.objectContaining({ assetKey: "ws/logo.png", reason: "exact_asset_no_space" }),
    ]);
  });
});

describe("buildStaticComposePlan", () => {
  it("plans logo with format policy and records provenance shape", () => {
    const { layers, omitted, blocked } = buildStaticComposePlan({
      format: "4:5",
      dimensions: { width: 1080, height: 1350 },
      assets: [
        asset({ category: "logo", placement: { gravity: "southeast", widthRatio: 0.18 } }),
        asset({
          category: "visual_reference",
          usageMode: "reference",
          referenceId: "ref-v",
        }),
      ],
    });
    expect(blocked).toEqual([]);
    expect(omitted).toEqual([]);
    expect(layers).toHaveLength(1);
    expect(layers[0]!.gravity).toBe("southeast");
    expect(layers[0]!.clearspacePx).toBeGreaterThan(0);
    expect(clampWidthRatio(0.18, layers[0]!.policy)).toBe(0.18);

    const prov = toProvenance({
      format: "4:5",
      dimensions: { width: 1080, height: 1350 },
      layers,
      omitted,
      blocked,
    });
    expect(prov.version).toBe(1);
    expect(prov.composed[0]?.assetKey).toBe("ws/logo.png");
    expect(prov.composed[0]?.policy.required).toBe(true);
  });
});
