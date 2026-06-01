import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { createCampaign } from "@/server/repositories/campaign";

export default async function NewCampaignPage() {
  const [{ workspace }, t] = await Promise.all([
    requireWorkspaceAccess(),
    getTranslations("campaign"),
  ]);

  const campaign = await createCampaign(workspace.id, {
    name: t("new"),
    client: t("bootstrapDraftClient"),
  });

  redirect(`/campaigns/${campaign.id}`);
}
