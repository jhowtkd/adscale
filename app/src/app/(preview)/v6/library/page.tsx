import LibraryV6View from "@/components/library/v6/LibraryV6View";
import { previewLibraryAssetsView, previewLibraryLabels } from "./preview-library-fixtures";

export default function LibraryPreviewPage() {
  return (
    <LibraryV6View
      labels={previewLibraryLabels}
      assets={previewLibraryAssetsView}
      shownCount={previewLibraryAssetsView.length}
      totalCount={84}
      searchQuery=""
      interactive={false}
      useImagePreview={false}
    />
  );
}
