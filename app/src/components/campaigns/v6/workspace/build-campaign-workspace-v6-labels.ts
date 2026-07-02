import type { useTranslations } from "next-intl";
import type { CampaignWorkspaceV6Labels } from "./campaign-workspace-v6-types";

type Translate = ReturnType<typeof useTranslations>;

export function buildCampaignWorkspaceV6Labels(t: Translate, tc: Translate): CampaignWorkspaceV6Labels {
  return {
    backToCampaigns: tc("backToCampaigns"),
    sendFeedback: t("v6.sendFeedback"),
    deleteCampaign: tc("deleteDraft"),
    stagesAria: t("v6.stagesAria"),
    briefingTitle: t("v6.briefingTitle"),
    briefingVersion: t("v6.briefingVersion"),
    rulesTitle: t("v6.rulesTitle"),
    derivationsTitle: t("v6.derivationsTitle"),
    viewAllDerivations: t("v6.viewAllDerivations"),
    openDerivation: t("v6.openDerivation"),
    moreOptionsFor: (title) => t("v6.moreOptionsFor", { title }),
  };
}
