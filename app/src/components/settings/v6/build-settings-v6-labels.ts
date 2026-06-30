import type { useTranslations } from "next-intl";
import type { SettingsV6Labels } from "./settings-v6-types";

type Translate = ReturnType<typeof useTranslations>;

export function buildSettingsV6Labels(t: Translate): SettingsV6Labels {
  return {
    sectionLabel: t("v6.sectionLabel"),
    title: t("v6.title"),
    subtitle: t("v6.subtitle"),
    openCard: t("v6.openCard"),
    unavailable: t("v6.unavailable"),
  };
}
