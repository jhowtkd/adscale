import { createHash } from "node:crypto";
import type {
  CanonicalPerformanceSnapshotInput,
  PerformancePlacement,
} from "./types";

export interface PerformanceSourceIdentity {
  derivationId: string;
  platform: CanonicalPerformanceSnapshotInput["platform"];
  placement: PerformancePlacement;
  adAccountId?: string | null;
  startDate: string;
  endDate: string;
  sourceType: CanonicalPerformanceSnapshotInput["sourceType"];
  externalCampaignId?: string | null;
  externalAdGroupId?: string | null;
  externalAdId?: string | null;
  scope: CanonicalPerformanceSnapshotInput["scope"];
}

function normalizedOptional(value: string | null | undefined) {
  return value?.trim() || "~";
}

function stableScope(scope: PerformanceSourceIdentity["scope"]) {
  if (scope.kind === "total") return "total";
  return JSON.stringify(
    Object.entries(scope.dimensions)
      .map(([key, value]) => [key.trim(), value.trim()] as const)
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

export function buildPerformanceSourceKey(identity: PerformanceSourceIdentity) {
  const canonical = [
    identity.sourceType,
    identity.derivationId,
    identity.platform,
    identity.placement,
    normalizedOptional(identity.adAccountId),
    identity.startDate,
    identity.endDate,
    normalizedOptional(identity.externalCampaignId),
    normalizedOptional(identity.externalAdGroupId),
    normalizedOptional(identity.externalAdId),
    stableScope(identity.scope),
  ].join("|");

  return createHash("sha256").update(canonical).digest("hex");
}
