import type { WorkspaceAsset } from "@/lib/hooks/use-workspace-assets";
import { pickSurfaceGradient } from "@/lib/v6-surface-gradients";
import type { LibraryV6Asset } from "./library-v6-types";

function assetKind(asset: WorkspaceAsset): LibraryV6Asset["kind"] {
  const tags = (asset.tags ?? []).map((tag) => tag.toLowerCase());
  const category = typeof asset.metadata?.category === "string" ? asset.metadata.category.toLowerCase() : "";

  if (asset.source === "creative_work" || tags.includes("generated")) return "generated";
  if (category === "logo" || tags.includes("logo") || asset.name.toLowerCase().includes("logo")) return "logo";
  if (["person", "landscape", "product"].includes(category) || tags.some((tag) => ["photo", "photography"].includes(tag))) {
    return "photo";
  }
  return "reference";
}

function assetGlyph(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].slice(0, 2)}${parts[1].slice(0, 2)}`.toUpperCase();
  }
  return name.slice(0, 4).toUpperCase();
}

export function mapWorkspaceAssetToV6(
  asset: WorkspaceAsset,
  index: number,
  formatSize: (bytes: number) => string,
  formatDate: (date: string) => string,
): LibraryV6Asset {
  const dimensionsLabel = asset.width && asset.height ? `${asset.width}×${asset.height}` : "—";
  return {
    id: asset.id,
    name: asset.name,
    tags: asset.tags ?? [],
    sizeLabel: formatSize(asset.size),
    dimensionsLabel,
    aspectRatioLabel: asset.width && asset.height ? `${(asset.width / asset.height).toFixed(2)}:1` : "—",
    source: asset.source,
    createdAtLabel: formatDate(asset.createdAt),
    kind: assetKind(asset),
    imageUrl: asset.url,
    glyph: assetGlyph(asset.name),
    gradient: pickSurfaceGradient(index),
    width: asset.width,
    height: asset.height,
  };
}
