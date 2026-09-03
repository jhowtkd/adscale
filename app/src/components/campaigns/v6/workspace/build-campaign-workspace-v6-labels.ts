import type { useTranslations } from "next-intl";
import type { CampaignWorkspaceV6Labels } from "./campaign-workspace-v6-types";

type Translate = ReturnType<typeof useTranslations>;

export function buildCampaignWorkspaceV6Labels(t: Translate, tc: Translate): CampaignWorkspaceV6Labels {
  return {
    sectionLabel: t("v6.sectionCampaign"),
    backToCampaigns: tc("backToCampaigns"),
    deleteCampaign: tc("deleteDraft"),
    stagesAria: t("v6.stagesAria"),
    briefingTitle: t("v6.briefingTitle"),
    briefingVersion: t("v6.briefingVersion"),
    rulesTitle: t("v6.rulesTitle"),
    newPiece: t("v6.newPiece"),
  };
}
