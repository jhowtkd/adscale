import { redirect } from "next/navigation";

/**
 * Legacy "new campaign" entry: creation now starts in the operational Home.
 * Campaign grouping remains optional after the creative work exists.
 */
export default function NewCampaignPage() {
  redirect("/?compose=1");
}
