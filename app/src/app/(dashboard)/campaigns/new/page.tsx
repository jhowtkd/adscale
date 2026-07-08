import { redirect } from "next/navigation";

/**
 * Canonical "new campaign" entry: open the name/client modal on the list.
 * Keeps legacy /campaigns/new links working without silent auto-create.
 */
export default function NewCampaignPage() {
  redirect("/campaigns?new=1");
}
