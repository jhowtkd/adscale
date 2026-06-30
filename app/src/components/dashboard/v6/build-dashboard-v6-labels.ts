import type { useTranslations } from "next-intl";
import type { DashboardV6Labels } from "./dashboard-v6-types";

type Translate = ReturnType<typeof useTranslations>;

export function buildDashboardV6Labels(t: Translate): Omit<DashboardV6Labels, "greeting"> {
  return {
    kpisAria: t("kpisAria"),
    heroProduction: t("heroProduction"),
    openCampaign: t("openCampaign"),
    viewBriefing: t("viewBriefing"),
    metaBriefing: t("metaBriefing"),
    metaVariations: t("metaVariations"),
    metaApproved: t("metaApproved"),
    metaCredits: t("metaCredits"),
    activityTitle: t("activityTitle"),
    activitySubtitle: t("activitySubtitle"),
    viewAll: t("viewAll"),
    tableCampaign: t("tableCampaign"),
    tableStatus: t("tableStatus"),
    tablePlatform: t("tablePlatform"),
    tableVariations: t("tableVariations"),
    tableUpdated: t("tableUpdated"),
    recipesTitle: t("recipesTitle"),
    recipesSubtitle: t("recipesSubtitle"),
    briefingTitle: t("briefingTitle"),
    editBriefing: t("editBriefing"),
    goToActions: t("goToActions"),
  };
}

export function buildDashboardV6Greeting(t: Translate, firstName: string, hour = new Date().getHours()) {
  const key = hour < 12 ? "greetingMorning" : hour < 18 ? "greetingAfternoon" : "greetingEvening";
  return t(key, { firstName });
}
