/**
 * Picks where "Continuar de onde parei" should navigate.
 *
 * Priority:
 * 1. Campaign currently generating
 * 2. Campaign in review (active)
 * 3. Incomplete campaign (not completed/failed)
 * 4. Most recently updated campaign (API already sorts by updatedAt desc)
 */

export type ContinueCampaignCandidate = {
  id: string;
  name: string;
  status: string;
  updatedAt: Date | string;
};

export type ContinueTarget =
  | { kind: "campaign"; href: string; campaignId: string; name: string; status: string }
  | { kind: "empty" };

export function resolveContinueTarget(
  campaigns: ContinueCampaignCandidate[]
): ContinueTarget {
  if (campaigns.length === 0) {
    return { kind: "empty" };
  }

  const generating = campaigns.find((c) => c.status === "generating");
  if (generating) {
    return toCampaignTarget(generating);
  }

  const inReview = campaigns.find((c) => c.status === "active");
  if (inReview) {
    return toCampaignTarget(inReview);
  }

  const incomplete = campaigns.find(
    (c) => c.status !== "completed" && c.status !== "failed"
  );
  if (incomplete) {
    return toCampaignTarget(incomplete);
  }

  return toCampaignTarget(campaigns[0]);
}

function toCampaignTarget(campaign: ContinueCampaignCandidate): ContinueTarget {
  return {
    kind: "campaign",
    href: `/campaigns/${campaign.id}`,
    campaignId: campaign.id,
    name: campaign.name,
    status: campaign.status,
  };
}
