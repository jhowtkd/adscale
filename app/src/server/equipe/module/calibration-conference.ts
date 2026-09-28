// Calibration conference gate (#546 review): while a front calibrates, the
// client only sees and decides items quality already released for the CURRENT
// version ("recebe as primeiras entregas, já conferidas"). Client reads omit
// un-conferred items; client commands refuse them until release_item_to_client
// covers the current version. A caption edit re-arms the gate for the new
// version — the same rule #545 flags as the quality re-check.

import type { AccountScope, EquipeItem, EquipeRepositories } from "../data";
import { ROUND_ITEM_RELEASED_EVENT } from "./calibration-shared";

/**
 * The front still confers: calibrating (or past the limit, still conferring),
 * or not yet started while the account calibrates — delivered items that no
 * round has conferred yet. Released/paused/closed fronts decide normally.
 */
export function requiresCalibrationConference(accountStatus: string, frontStatus: string): boolean {
  const accountInCalibration = accountStatus === "calibrating" || accountStatus === "active";
  const frontConferring =
    frontStatus === "draft" || frontStatus === "calibrating" || frontStatus === "scope_decision";
  return accountInCalibration && frontConferring;
}

function releaseKey(itemId: string, versionHash: string): string {
  return `${itemId}:${versionHash}`;
}

/**
 * Every (item, version) quality released across the front's rounds. Release
 * events live on their round, so this scans the front's rounds; callers with
 * several items reuse the set.
 */
export async function loadReleasedVersions(
  repos: EquipeRepositories,
  scope: AccountScope,
  frontId: string,
): Promise<Set<string>> {
  const released = new Set<string>();
  const rounds = (await repos.calibrationRounds.list(scope)).filter(
    (round) => round.frontId === frontId,
  );
  for (const round of rounds) {
    const events = await repos.events.list(scope, { objectType: "round", objectId: round.id });
    for (const event of events) {
      if (event.eventType !== ROUND_ITEM_RELEASED_EVENT) continue;
      const payload = event.payload as { itemId?: unknown; versionHash?: unknown } | null;
      if (typeof payload?.itemId === "string" && typeof payload?.versionHash === "string") {
        released.add(releaseKey(payload.itemId, payload.versionHash));
      }
    }
  }
  return released;
}

export function isReleasedVersion(released: Set<string>, item: EquipeItem): boolean {
  return !!item.currentVersionHash && released.has(releaseKey(item.id, item.currentVersionHash));
}

/** True while the client must neither see nor decide the item. */
export async function isItemConferring(
  repos: EquipeRepositories,
  scope: AccountScope,
  accountStatus: string,
  item: EquipeItem,
): Promise<boolean> {
  const front = await repos.fronts.get(scope, item.frontId);
  if (!front) return false;
  if (!requiresCalibrationConference(accountStatus, front.status)) return false;
  const released = await loadReleasedVersions(repos, scope, front.id);
  return !isReleasedVersion(released, item);
}

export function conferencePendingMessage(itemId: string): string {
  return `item ${itemId} is still in quality conference`;
}
