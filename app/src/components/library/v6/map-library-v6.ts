import type { WorkspaceAsset } from "@/lib/hooks/use-workspace-assets";
import { pickSurfaceGradient } from "@/lib/v6-surface-gradients";
import type { LibraryV6Asset } from "./library-v6-types";
import { classifyLibraryAsset } from "@/lib/library-asset-kind";

function assetKind(asset: WorkspaceAsset, logoAssetKey?: string | null): LibraryV6Asset["kind"] {
  const kind = asset.metadata?.kind;
  const tags = (asset.tags ?? []).map((tag) => tag.toLowerCase());
  const category = typeof asset.metadata?.category === "string" ? asset.metadata.category.toLowerCase() : "";
  return classifyLibraryAsset({
    logo: kind === "instagram_avatar" || Boolean(logoAssetKey && asset.key === logoAssetKey) || (typeof kind === "string" && kind.includes("logo")),
    page: kind === "site_page",
    post: asset.source === "brand_instagram",
    generated: asset.source === "creative_work" || tags.includes("generated"),
    legacyLogo: category === "logo" || tags.includes("logo") || asset.name.toLowerCase().includes("logo"),
    photo: ["person", "landscape", "product"].includes(category) || tags.some(tag => ["photo", "photography"].includes(tag)),
  }, (cases, fallback) => cases.find(([matches]) => matches)?.[1] ?? fallback);
}

function assetGlyph(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].slice(0, 2)}${parts[1].slice(0, 2)}`.toUpperCase();
  }
  return name.slice(0, 4).toUpperCase();
}

const originOfSource = (source?: string | null) => source === "brand_site" ? "site" : source === "brand_instagram" ? "instagram" : "user";

/**
 * Where the brand's CURRENT identity came from, for the origin filter: the logo from its own asset,
 * a color or font from the handoff snapshot only while the current value still matches it, and
 * otherwise from the person (typed in the Brand Kit).
 */
export function identityOriginsOf(input: {
  hasLogo: boolean;
  logoSource?: string | null;
  colors: readonly string[];
  fonts: readonly string[];
  snapshot?: { colors: ReadonlyArray<{ value: string; origin: string }>; fonts: ReadonlyArray<{ value: string; origin: string }> };
}) {
  const originOf = (value: string, captured: ReadonlyArray<{ value: string; origin: string }> = []) =>
    captured.find((item) => item.value.trim().toLowerCase() === value.trim().toLowerCase())?.origin ?? "user";
  return {
    logo: input.hasLogo ? originOfSource(input.logoSource) : undefined,
    colors: input.colors.map((color) => originOf(color, input.snapshot?.colors)),
    fonts: input.fonts.map((font) => originOf(font, input.snapshot?.fonts)),
  };
}

export function mapWorkspaceAssetToV6(
  asset: WorkspaceAsset,
  index: number,
  formatSize: (bytes: number) => string,
  formatDate: (date: string) => string,
  logoAssetKey?: string | null,
): LibraryV6Asset {
  const dimensionsLabel = asset.width && asset.height ? `${asset.width}×${asset.height}` : "—";
  return {
    id: asset.id,
    key: asset.key,
    name: asset.name,
    tags: asset.tags ?? [],
    sizeLabel: formatSize(asset.size),
    dimensionsLabel,
    aspectRatioLabel: asset.width && asset.height ? `${(asset.width / asset.height).toFixed(2)}:1` : "—",
    source: asset.source,
    createdAtLabel: formatDate(asset.createdAt),
    kind: assetKind(asset, logoAssetKey),
    imageUrl: asset.url,
    glyph: assetGlyph(asset.name),
    gradient: pickSurfaceGradient(index),
    width: asset.width,
    height: asset.height,
    ...(typeof asset.metadata?.originUrl === "string" ? { originUrl: asset.metadata.originUrl } : {}),
    ...(typeof asset.metadata?.caption === "string" ? { caption: asset.metadata.caption } : {}),
  };
}
