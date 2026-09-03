import { describe, expect, it } from "vitest";
import type { WorkspaceAsset } from "@/lib/hooks/use-workspace-assets";
import { mapWorkspaceAssetToV6 } from "./map-library-v6";

const baseAsset = {
  id: "asset-1",
  workspaceId: "workspace-1",
  name: "asset.png",
  key: "asset.png",
  type: "image/png",
  size: 2048,
  width: 1080,
  height: 1350,
  tags: [],
  aiDescription: null,
  source: "upload",
  metadata: null,
  url: "/asset.png",
  createdAt: "2026-08-10T12:00:00.000Z",
} satisfies WorkspaceAsset;

describe("mapWorkspaceAssetToV6", () => {
  it.each([
    ["creative_work", null, "generated"],
    ["upload", { category: "logo" }, "logo"],
    ["upload", { category: "person" }, "photo"],
    ["upload", null, "reference"],
  ] as const)("classifies %s assets for the library filter", (source, metadata, kind) => {
    const asset = { ...baseAsset, source, metadata } as WorkspaceAsset;
    const result = mapWorkspaceAssetToV6(asset, 0, (bytes) => `${bytes} B`, () => "10/08/2026");

    expect(result.kind).toBe(kind);
    expect(result.sizeLabel).toBe("2048 B");
    expect(result.dimensionsLabel).toBe("1080×1350");
    expect(result.aspectRatioLabel).toBe("0.80:1");
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1350);
  });
});
