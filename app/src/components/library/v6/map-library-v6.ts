import type { WorkspaceAsset } from "@/lib/hooks/use-workspace-assets";
import { pickSurfaceGradient } from "@/lib/v6-surface-gradients";
import type { LibraryV6Asset } from "./library-v6-types";

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
): LibraryV6Asset {
  return {
    id: asset.id,
    name: asset.name,
    tags: asset.tags ?? [],
    sizeLabel: asset.width && asset.height ? `${asset.width}×${asset.height}` : "—",
    dimensionsLabel: formatSize(asset.size),
    imageUrl: asset.url,
    glyph: assetGlyph(asset.name),
    gradient: pickSurfaceGradient(index),
  };
}
