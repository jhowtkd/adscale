import { redirect } from "next/navigation";
import { composerHref } from "@/lib/studio/composer-href";

/**
 * Legacy "new campaign" entry: creation happens in the composer (spec 2026-10-07 §2). Campaign grouping remains
 * optional after the work exists.
 */
export default function NewCampaignPage() {
  redirect(composerHref({ compose: "1" }));
}
