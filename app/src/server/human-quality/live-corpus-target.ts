/**
 * Select a non-fixture client profile for live operational evidence (v13.4).
 * Cenbrap remains fixture/seed — excluded by name pattern.
 */

export const FIXTURE_PROFILE_NAME_PATTERN = /cenbrap/i;

export interface ClientProfileRef {
  id: string;
  name: string;
  workspaceId: string;
}

export function isFixtureSeedProfileName(name: string): boolean {
  return FIXTURE_PROFILE_NAME_PATTERN.test(name.trim());
}

/** Prefer the first profile that is not a fixture/seed brand name (e.g. Cenbrap). */
export function selectLiveCorpusTarget(
  profiles: ClientProfileRef[]
): ClientProfileRef | null {
  const sorted = [...profiles].sort((a, b) => a.name.localeCompare(b.name));
  return sorted.find((profile) => !isFixtureSeedProfileName(profile.name)) ?? null;
}

export const LIVE_EVIDENCE_BRAND_NAME = "Live Evidence Brand";
