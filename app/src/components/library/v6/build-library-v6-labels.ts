import type { useTranslations } from "next-intl";
import type { LibraryV6Labels } from "./library-v6-types";

type Translate = ReturnType<typeof useTranslations>;

export function buildLibraryV6Labels(t: Translate): LibraryV6Labels {
  return {
    sectionLabel: t("v6.sectionLabel"),
    title: t("title"),
    subtitle: t("v6.subtitle"),
    upload: t("upload"),
    dropzoneTitle: t("dropzoneLabel"),
    dropzoneHint: t("dropzoneHint"),
    dropzoneAria: t("v6.dropzoneAria"),
    searchPlaceholder: t("v6.searchPlaceholder"),
    searchAria: t("v6.searchPlaceholder"),
    filtersAria: t("v6.filtersAria"),
    filterAll: t("v6.filterAll"),
    filterReference: t("v6.filterReference"),
    filterLogo: t("v6.filterLogo"),
    filterPhoto: t("v6.filterPhoto"),
    filterGenerated: t("v6.filterGenerated"),
    filterFavorite: t("v6.filterFavorite"),
    // Template with {shown}/{total} filled in LibraryV6View via .replace —
    // t.raw avoids ICU FORMATTING_ERROR when values are not passed here.
    countSummary: String(t.raw("v6.countSummary")),
    deleteAsset: t("v6.deleteAsset"),
    previewLoading: t("v6.previewLoading"),
    previewNoPreview: t("v6.previewNoPreview"),
    previewError: t("v6.previewError"),
    previewDark: t("v6.previewDark"),
    retryPreview: t("v6.retryPreview"),
    replaceAsset: t("v6.replaceAsset"),
    originLabel: t("v6.originLabel"),
    createdLabel: t("v6.createdLabel"),
    functionLabel: t("v6.functionLabel"),
    loadMore: t("v6.loadMore"),
    loadingMore: t("v6.loadingMore"),
  };
}
