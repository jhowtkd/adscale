import type { LibraryAssetKind } from "@/lib/library-asset-kind";

export type LibraryV6AssetKind = LibraryAssetKind;
export type LibraryV6Filter = "all" | LibraryV6AssetKind | "favorite" | "identity" | "images" | "documents";

export type LibraryV6Asset = {
  id: string;
  name: string;
  tags: string[];
  sizeLabel: string;
  dimensionsLabel: string;
  aspectRatioLabel: string;
  source: string;
  createdAtLabel: string;
  kind: LibraryV6AssetKind;
  imageUrl: string;
  glyph: string;
  gradient: string;
  width?: number | null;
  height?: number | null;
  originUrl?: string;
  caption?: string;
  key?: string;
};

export type LibraryV6Labels = {
  sectionLabel: string;
  title: string;
  subtitle: string;
  upload: string;
  dropzoneTitle: string;
  dropzoneHint: string;
  dropzoneAria: string;
  searchPlaceholder: string;
  searchAria: string;
  filtersAria: string;
  filterAll: string;
  filterReference: string;
  filterLogo: string;
  filterPhoto: string;
  filterGenerated: string;
  filterFavorite: string;
  countSummary: string;
  deleteAsset: string;
  previewLoading: string;
  previewNoPreview: string;
  previewError: string;
  previewDark: string;
  retryPreview: string;
  replaceAsset: string;
  originLabel: string;
  createdLabel: string;
  functionLabel: string;
  loadMore: string;
  loadingMore: string;
};
