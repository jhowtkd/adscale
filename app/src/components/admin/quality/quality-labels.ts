import { useTranslations } from "next-intl";

export function useQualityLabels() {
  const t = useTranslations("admin.quality");
  const tc = useTranslations("admin.quality.common");

  return { t, tc };
}
