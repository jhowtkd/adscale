import type { WorkspaceAsset } from "@/lib/hooks/use-workspace-assets";
import type { LibraryV6Asset } from "./library-v6-types";

const GRADIENTS = [
  "from-emerald-800/90 to-teal-700/70",
  "from-slate-800/90 to-slate-600/70",
  "from-indigo-900/80 to-blue-800/60",
  "from-rose-900/70 to-pink-800/50",
  "from-amber-900/80 to-yellow-800/60",
  "from-cyan-900/80 to-sky-800/60",
  "from-violet-900/80 to-purple-800/60",
  "from-zinc-800/90 to-zinc-600/70",
];

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
    gradient: GRADIENTS[index % GRADIENTS.length],
  };
}
