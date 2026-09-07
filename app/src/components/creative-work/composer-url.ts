import { UUID_SCHEMA, type ComposerIntent } from "./composer-state";

export function searchWithWorkId(search: string, workId: string): string | null {
  if (!UUID_SCHEMA.safeParse(workId).success) return null;
  const params = new URLSearchParams(search);
  params.set("workId", workId);
  return params.toString();
}

export function searchWithIntent(search: string, intent: ComposerIntent): string {
  const params = new URLSearchParams(search);
  params.delete("workId");
  params.set("intent", intent);
  return params.toString();
}

export function searchWithCampaignId(search: string, campaignId: string | null): string {
  const params = new URLSearchParams(search);
  if (campaignId) params.set("campaignId", campaignId);
  else params.delete("campaignId");
  return params.toString();
}

export function hrefWithSearch(pathname: string, query: string | null, hash = ""): string {
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

export function searchWithoutConsumedTemplate(
  search: string,
  templateId: string,
  workId: string | null,
  intent: string | null,
): string | null {
  const current = new URLSearchParams(search);
  if (current.get("templateId") !== templateId) return null;
  const canonical = new URLSearchParams();
  if (workId && UUID_SCHEMA.safeParse(workId).success) canonical.set("workId", workId);
  if (intent) canonical.set("intent", intent);
  return canonical.toString();
}
