import type { useTranslations } from "next-intl";
import type { CampaignsV6Labels } from "./campaigns-v6-types";

type Translate = ReturnType<typeof useTranslations>;

export function buildCampaignsV6Labels(t: Translate, tc: Translate): CampaignsV6Labels {
  return {
    sectionLabel: t("v6.sectionWorks"),
    versionBadge: t("v6.versionBadge"),
    formatTitle: (count) => t("v6.worksTitle", { count }),
    subtitle: t("v6.worksSubtitle"),
    sortPrefix: t("v6.sortPrefix"),
    newCampaign: t("new"),
    searchPlaceholder: t("v6.searchPlaceholder"),
    searchAriaLabel: t("v6.searchPlaceholder"),
    filtersAria: t("v6.filtersAria"),
    statusChipPrefix: tc("status"),
    platformChipPrefix: tc("platforms"),
    originAll: t("v6.originAll"),
    originCampaigns: t("v6.originCampaigns"),
    originPosts: t("v6.originPosts"),
    viewList: t("v6.viewList"),
    viewGrid: t("v6.viewGrid"),
    viewBoard: t("v6.viewBoard"),
    selectCampaign: (name) => t("v6.selectCampaign", { name }),
    actionsFor: (name) => t("v6.actionsFor", { name }),
    openCampaign: t("v6.openCampaign"),
    duplicate: tc("duplicate"),
    saveAsTemplate: tc("saveAsTemplate"),
    archive: tc("archive"),
    delete: tc("delete"),
    variationsLabel: t("v6.variationsLabel"),
    approvedLabel: t("v6.approvedLabel"),
  };
}
