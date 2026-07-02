export const CAMPAIGN_DEEP_LINK_IDS = {
  assets: "mission-assets",
  readiness: "mission-readiness",
  briefing: "mission-briefing",
  recipe: "mission-generate",
  generate: "mission-generate",
  review: "mission-review",
  export: "mission-export",
  share: "mission-share",
} as const;

export type CampaignTabDeepLink = keyof typeof CAMPAIGN_DEEP_LINK_IDS;

const VALID_TABS = new Set<string>(Object.keys(CAMPAIGN_DEEP_LINK_IDS));

export function parseCampaignTabParam(
  tab: string | null,
  mode: string | null
): { tab: CampaignTabDeepLink; mode?: string } | null {
  if (!tab) return null;
  const normalized = tab.trim();
  if (!VALID_TABS.has(normalized)) return null;
  return { tab: normalized as CampaignTabDeepLink, mode: mode ?? undefined };
}

export function scrollToCampaignDeepLink(tab: CampaignTabDeepLink): void {
  const elementId = CAMPAIGN_DEEP_LINK_IDS[tab];
  requestAnimationFrame(() => {
    document.getElementById(elementId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
}

export interface CampaignDeepLinkActions {
  goToSetup: () => void;
  goToTrabalho: () => void;
  hasDerivations?: boolean;
  openStrategyRecipe?: () => void;
}

export function applyCampaignDeepLink(
  tab: CampaignTabDeepLink,
  mode: string | undefined,
  actions: CampaignDeepLinkActions
): void {
  switch (tab) {
    case "assets":
      actions.goToSetup();
      break;
    case "readiness":
      if (actions.hasDerivations) {
        actions.goToTrabalho();
      } else {
        actions.goToSetup();
      }
      break;
    case "briefing":
      actions.goToSetup();
      break;
    case "recipe":
      actions.goToTrabalho();
      actions.openStrategyRecipe?.();
      break;
    case "generate":
      actions.goToTrabalho();
      actions.openStrategyRecipe?.();
      break;
    case "review":
    case "export":
    case "share":
      actions.goToTrabalho();
      break;
    default:
      break;
  }

  scrollToCampaignDeepLink(tab);
}
