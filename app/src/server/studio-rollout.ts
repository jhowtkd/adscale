import { createHash } from "node:crypto";
import type { StudioRolloutVariant } from "@/lib/beta-analytics/studio-session";

export function studioRolloutBucket(workspaceId: string): number {
  const prefix = createHash("sha256").update(workspaceId).digest("hex").slice(0, 8);
  return Number.parseInt(prefix, 16) % 100;
}

export function resolveStudioRolloutVariant(
  workspaceId: string,
  percent: number,
): StudioRolloutVariant {
  const bounded = Math.max(0, Math.min(100, Math.trunc(percent)));
  return studioRolloutBucket(workspaceId) < bounded ? "progressive" : "control";
}

/**
 * New-creation gate for the Studio carousel (Task 10). Reads the SAME
 * deterministic workspace bucket as the progressive Studio rollout so both
 * percentages move workspaces together. Existing carousel works stay
 * readable, retryable and exportable regardless of this gate — it only
 * hides the new-creation card on the dashboard.
 */
export function isStudioCarouselEnabled(workspaceId: string, percent: number): boolean {
  const bounded = Math.max(0, Math.min(100, Math.trunc(percent)));
  return studioRolloutBucket(workspaceId) < bounded;
}

/**
 * Entry-interview gate for Studio (Task 7). Reads the SAME deterministic
 * workspace bucket as the progressive Studio rollout so both percentages
 * move workspaces together. Task 9 wires the dashboard UI to this gate.
 */
export function isStudioEntryInterviewEnabled(workspaceId: string, percent: number): boolean {
  const bounded = Math.max(0, Math.min(100, Math.trunc(percent)));
  return studioRolloutBucket(workspaceId) < bounded;
}
