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
