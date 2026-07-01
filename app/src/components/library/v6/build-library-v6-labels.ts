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
    countSummary: t("v6.countSummary"),
    deleteAsset: t("v6.deleteAsset"),
    loadMore: t("v6.loadMore"),
    loadingMore: t("v6.loadingMore"),
  };
}
