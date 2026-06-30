import type { LibraryV6Asset, LibraryV6Labels } from "@/components/library/v6/library-v6-types";
import { previewLibraryAssets } from "../_fixtures/preview-data";

export const previewLibraryLabels: LibraryV6Labels = {
  sectionLabel: "Workspace · Assets",
  title: "Biblioteca",
  subtitle: "Assets, referências e materiais do workspace",
  upload: "↑ Upload",
  dropzoneTitle: "Arraste arquivos aqui ou clique para selecionar",
  dropzoneHint: "PNG, JPG, WebP até 10 MB",
  dropzoneAria: "Arraste arquivos aqui ou clique para selecionar",
  searchPlaceholder: "Buscar asset por nome ou tag…",
  searchAria: "Buscar asset",
  countSummary: "{shown} de {total} assets",
  deleteAsset: "Excluir asset",
};

export const previewLibraryAssetsView: LibraryV6Asset[] = previewLibraryAssets.map((asset, index) => ({
  id: `preview-asset-${index}`,
  name: asset.name,
  tags: asset.tags,
  sizeLabel: asset.size,
  dimensionsLabel: asset.weight,
  imageUrl: "",
  glyph: asset.glyph,
  gradient: asset.gradient,
}));
