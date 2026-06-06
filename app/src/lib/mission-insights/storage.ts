import type { MissionInsightMoment } from "./types";

const STORAGE_PREFIX = "adscale:mission-insight:";

function storageKey(moment: MissionInsightMoment): string {
  return `${STORAGE_PREFIX}${moment}`;
}

export function hasMissionInsightBeenPrompted(moment: MissionInsightMoment): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(storageKey(moment)) === "1";
  } catch {
    return true;
  }
}

export function markMissionInsightPrompted(moment: MissionInsightMoment): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(moment), "1");
  } catch {
    // ignore quota / privacy mode
  }
}
