import { describe, expect, it } from "vitest";
import type { WorkspaceAsset } from "@/lib/hooks/use-workspace-assets";
import { identityOriginsOf, mapWorkspaceAssetToV6 } from "./map-library-v6";

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

  describe("ticket 07: brand origin classification", () => {
    it("classifies a site page (metadata.kind: site_page) regardless of source", () => {
      const asset = { ...baseAsset, source: "brand_site", metadata: { kind: "site_page", title: "Sobre nós" } } as WorkspaceAsset;
      const result = mapWorkspaceAssetToV6(asset, 0, (bytes) => `${bytes} B`, () => "10/08/2026");
      expect(result.kind).toBe("page");
    });

    it("classifies any Instagram-origin asset as a social post", () => {
      const asset = { ...baseAsset, source: "brand_instagram", metadata: null } as WorkspaceAsset;
      const result = mapWorkspaceAssetToV6(asset, 0, (bytes) => `${bytes} B`, () => "10/08/2026");
      expect(result.kind).toBe("post");
    });

    it("classifies a materialized brand logo by metadata.kind, not by category", () => {
      const asset = { ...baseAsset, source: "brand_site", metadata: { kind: "brand_logo" } } as WorkspaceAsset;
      const result = mapWorkspaceAssetToV6(asset, 0, (bytes) => `${bytes} B`, () => "10/08/2026");
      expect(result.kind).toBe("logo");
    });

    it("preserves originUrl and caption from metadata (ticket 07: survives any later metadata write)", () => {
      const asset = {
        ...baseAsset, source: "brand_instagram",
        metadata: { originUrl: "https://instagram.com/p/xyz", caption: "Equipe no escritório" },
      } as WorkspaceAsset;
      const result = mapWorkspaceAssetToV6(asset, 0, (bytes) => `${bytes} B`, () => "10/08/2026");
      expect(result.originUrl).toBe("https://instagram.com/p/xyz");
      expect(result.caption).toBe("Equipe no escritório");
    });

    it("omits originUrl/caption when metadata does not carry them", () => {
      const asset = { ...baseAsset, source: "upload", metadata: { category: "product" } } as WorkspaceAsset;
      const result = mapWorkspaceAssetToV6(asset, 0, (bytes) => `${bytes} B`, () => "10/08/2026");
      expect(result).not.toHaveProperty("originUrl");
      expect(result).not.toHaveProperty("caption");
    });
  });
});

describe("identityOriginsOf (PR 610 review: the origin of the CURRENT identity)", () => {
  it.each([
    ["brand_site", "site"],
    ["brand_instagram", "instagram"],
    ["brand_upload", "user"],
    ["upload", "user"],
  ])("takes the logo's origin from the current logo asset's own source: %s is %s", (logoSource, expected) => {
    expect(identityOriginsOf({ hasLogo: true, logoSource, colors: [], fonts: [] }).logo).toBe(expected);
  });

  it("treats a logo without an asset row (the old brand-kit producer) as the user's, and no logo as no origin", () => {
    expect(identityOriginsOf({ hasLogo: true, colors: [], fonts: [] }).logo).toBe("user");
    expect(identityOriginsOf({ hasLogo: false, colors: [], fonts: [] }).logo).toBeUndefined();
  });

  it("keeps a color or font's captured origin only while the current value still matches the handoff snapshot", () => {
    const origins = identityOriginsOf({
      hasLogo: false,
      colors: ["#111111", "#ABCDEF", "#333333"],
      fonts: ["Inter", "Custom Sans"],
      snapshot: {
        colors: [{ value: "#111111", origin: "site" }, { value: "#abcdef", origin: "instagram" }, { value: "#999999", origin: "site" }],
        fonts: [{ value: "inter", origin: "site" }, { value: "Replaced Font", origin: "site" }],
      },
    });
    // "#333333" and "Custom Sans" are not in the snapshot: typed by the person since the handoff.
    expect(origins.colors).toEqual(["site", "instagram", "user"]);
    expect(origins.fonts).toEqual(["site", "user"]);
  });

  it("without a snapshot, every current color and font is the user's", () => {
    const origins = identityOriginsOf({ hasLogo: false, colors: ["#111111"], fonts: ["Inter"] });
    expect(origins.colors).toEqual(["user"]);
    expect(origins.fonts).toEqual(["user"]);
  });
});
