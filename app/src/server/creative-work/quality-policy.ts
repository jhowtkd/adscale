/**
 * Single quality-feature policy resolver (ICE-05B).
 *
 * Every quality-feature decision — new preparation, re-preparation, worker
 * execution — flows through `resolveQualityFeaturePolicy`. Existing
 * snapshots are never reinterpreted: the frozen values decide, whatever
 * the live switches or allowlists say today. New preparations decide from
 * the switch plus the per-feature pilot allowlist plus protocol
 * eligibility, and the verdict is frozen into the snapshot.
 *
 * The two features stay separate: quality recovery and Brand Cortex each
 * read their own switch and their own allowlist. Call limits and
 * settlement never consult this module.
 */
import {
  resolveGenerationPolicyVersion,
  type CreativeWorkGenerationPolicyVersion,
  type CreativeWorkIntent,
} from "./contracts";
import { protocolIdentityContract } from "./identity-policy";

export type QualityFeature = "quality_recovery" | "brand_cortex_single";

export type QualityPolicyStatus =
  | "off"
  | "eligible"
  | "ineligible"
  | "frozen_enabled"
  | "frozen_legacy";

export type QualityPolicyVerdict = {
  status: QualityPolicyStatus;
  /** Machine-readable reason for the verdict. */
  reason: string;
  generationPolicyVersion: CreativeWorkGenerationPolicyVersion;
  includePublishedBrandKnowledge: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse a comma-separated pilot allowlist. Fails closed: a malformed entry
 * throws instead of silently scoping the pilot to the wrong workspaces.
 */
export function parsePilotAllowlist(raw: string | undefined): string[] {
  if (!raw || raw.trim().length === 0) return [];
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  for (const entry of entries) {
    if (!UUID_PATTERN.test(entry)) {
      throw new Error(`invalid_pilot_allowlist:${entry}`);
    }
  }
  return entries;
}

export function resolveQualityFeaturePolicy(input: {
  feature: QualityFeature;
  workspaceId: string;
  toolKind: CreativeWorkIntent;
  /**
   * Frozen state of an existing work, or null for a new preparation.
   * Recovery reads generationPolicyVersion; Cortex reads the frozen
   * inclusion flag from the identity snapshot.
   */
  snapshot:
    | {
        generationPolicyVersion?: CreativeWorkGenerationPolicyVersion | string;
        includePublishedBrandKnowledge?: boolean;
      }
    | null
    | undefined;
  switches: {
    qualityRecovery: string | undefined;
    brandCortex: string | undefined;
  };
  allowlistRaw: string | undefined;
}): QualityPolicyVerdict {
  const generationPolicyVersion = resolveGenerationPolicyVersion(
    input.snapshot?.generationPolicyVersion !== undefined
      ? { generationPolicyVersion: input.snapshot.generationPolicyVersion as CreativeWorkGenerationPolicyVersion }
      : null,
  );
  const frozenInclusion = input.snapshot?.includePublishedBrandKnowledge === true;

  // An existing snapshot decides by itself: re-preparation and workers
  // follow the frozen values, never the live configuration.
  if (input.snapshot !== null && input.snapshot !== undefined) {
    if (input.feature === "quality_recovery") {
      return generationPolicyVersion === "quality_recovery_v1"
        ? {
            status: "frozen_enabled",
            reason: "snapshot_frozen",
            generationPolicyVersion,
            includePublishedBrandKnowledge: frozenInclusion,
          }
        : {
            status: "frozen_legacy",
            reason: "snapshot_frozen",
            generationPolicyVersion,
            includePublishedBrandKnowledge: frozenInclusion,
          };
    }
    return frozenInclusion
      ? {
          status: "frozen_enabled",
          reason: "snapshot_frozen",
          generationPolicyVersion,
          includePublishedBrandKnowledge: true,
        }
      : {
          status: "frozen_legacy",
          reason: "snapshot_frozen",
          generationPolicyVersion,
          includePublishedBrandKnowledge: false,
        };
  }

  // New preparation: protocol eligibility first, then the switch, then the
  // pilot allowlist. Each feature reads only its own switch and allowlist.
  if (input.feature === "quality_recovery") {
    if (input.toolKind === "single" || input.toolKind === "carousel") {
      return {
        status: "eligible",
        reason: input.toolKind === "single" ? "single_integrated" : "carousel_v1_only",
        generationPolicyVersion: "quality_recovery_v1",
        includePublishedBrandKnowledge: false,
      };
    }
    if (input.switches.qualityRecovery !== "true") {
      return {
        status: "off",
        reason: "switch_off",
        generationPolicyVersion: "legacy",
        includePublishedBrandKnowledge: false,
      };
    }
    const allowlist = parsePilotAllowlist(input.allowlistRaw);
    if (allowlist.length > 0 && !allowlist.includes(input.workspaceId)) {
      return {
        status: "ineligible",
        reason: "not_allowlisted",
        generationPolicyVersion: "legacy",
        includePublishedBrandKnowledge: false,
      };
    }
    return {
      status: "eligible",
      reason: allowlist.length > 0 ? "allowlisted" : "switch_on",
      generationPolicyVersion: "quality_recovery_v1",
      includePublishedBrandKnowledge: false,
    };
  }

  const contract = protocolIdentityContract(input.toolKind);
  if (contract.publishedBrandKnowledge === "always") {
    return {
      status: "eligible",
      reason: "protocol_always",
      generationPolicyVersion: "legacy",
      includePublishedBrandKnowledge: true,
    };
  }
  if (contract.publishedBrandKnowledge === "never") {
    return {
      status: "ineligible",
      reason: "protocol_never",
      generationPolicyVersion: "legacy",
      includePublishedBrandKnowledge: false,
    };
  }
  if (input.switches.brandCortex !== "true") {
    return {
      status: "off",
      reason: "switch_off",
      generationPolicyVersion: "legacy",
      includePublishedBrandKnowledge: false,
    };
  }
  const allowlist = parsePilotAllowlist(input.allowlistRaw);
  if (allowlist.length > 0 && !allowlist.includes(input.workspaceId)) {
    return {
      status: "ineligible",
      reason: "not_allowlisted",
      generationPolicyVersion: "legacy",
      includePublishedBrandKnowledge: false,
    };
  }
  return {
    status: "eligible",
    reason: allowlist.length > 0 ? "allowlisted" : "switch_on",
    generationPolicyVersion: "legacy",
    includePublishedBrandKnowledge: true,
  };
}
