import { redirect } from "next/navigation";

/**
 * Legacy "new campaign" entry: Instrumento por superfície keeps creation on
 * Palco da Marca. Campaign grouping remains optional after the work exists.
 */
export default function NewCampaignPage() {
  redirect("/?compose=1");
}
