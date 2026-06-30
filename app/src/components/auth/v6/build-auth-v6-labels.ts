import type { useTranslations } from "next-intl";
import type { AuthV6BrandingLabels } from "./auth-v6-types";

type Translate = ReturnType<typeof useTranslations>;

export function buildAuthV6BrandingLabels(t: Translate): AuthV6BrandingLabels {
  return {
    sectionLabel: t("v6.sectionLabel"),
    title: t("v6.brandTitle"),
    subtitle: t("v6.brandSubtitle"),
    features: [
      { title: t("v6.featureBriefTitle"), body: t("v6.featureBriefBody") },
      { title: t("v6.featureBatchTitle"), body: t("v6.featureBatchBody") },
      { title: t("v6.featureReviewTitle"), body: t("v6.featureReviewBody") },
    ],
  };
}
