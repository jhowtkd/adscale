import { describe, expect, it } from "vitest";
import {
  parsePilotAllowlist,
  resolveQualityFeaturePolicy,
} from "./quality-policy";

describe("pilot allowlist parsing (ICE-05B)", () => {
  it("parses comma-separated workspace ids, ignoring blanks", () => {
    expect(parsePilotAllowlist(undefined)).toEqual([]);
    expect(parsePilotAllowlist("")).toEqual([]);
    expect(
      parsePilotAllowlist("  00000000-0000-4000-8000-000000000001 , 00000000-0000-4000-8000-000000000002  "),
    ).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ]);
  });

  it("fails closed on malformed entries instead of mis-scoping the pilot", () => {
    expect(() => parsePilotAllowlist("not-a-uuid")).toThrow(/invalid_pilot_allowlist/);
    expect(() =>
      parsePilotAllowlist("00000000-0000-4000-8000-000000000001,zzz"),
    ).toThrow(/invalid_pilot_allowlist/);
  });
});

describe("single quality-feature policy resolver (ICE-05B)", () => {
  const switchesOn = { qualityRecovery: "true", brandCortex: "true" };
  const switchesOff = { qualityRecovery: "false", brandCortex: "false" };

  it("freezes new single and carousel preparations on quality_recovery_v1", () => {
    for (const toolKind of ["single", "carousel"] as const) {
      const resolved = resolveQualityFeaturePolicy({
        feature: "quality_recovery",
        workspaceId: "00000000-0000-4000-8000-000000000001",
        toolKind,
        snapshot: null,
        switches: switchesOff,
        allowlistRaw: undefined,
      });
      expect(resolved.status).toBe("eligible");
      expect(resolved.generationPolicyVersion).toBe("quality_recovery_v1");
    }
  });

  it("gates other protocols on the switch and the pilot allowlist", () => {
    const off = resolveQualityFeaturePolicy({
      feature: "quality_recovery",
      workspaceId: "00000000-0000-4000-8000-000000000001",
      toolKind: "variations",
      snapshot: null,
      switches: switchesOff,
      allowlistRaw: undefined,
    });
    expect(off.status).toBe("off");
    expect(off.generationPolicyVersion).toBe("legacy");

    const listed = resolveQualityFeaturePolicy({
      feature: "quality_recovery",
      workspaceId: "00000000-0000-4000-8000-000000000001",
      toolKind: "variations",
      snapshot: null,
      switches: switchesOn,
      allowlistRaw: "00000000-0000-4000-8000-000000000001",
    });
    expect(listed.status).toBe("eligible");
    expect(listed.generationPolicyVersion).toBe("quality_recovery_v1");

    const unlisted = resolveQualityFeaturePolicy({
      feature: "quality_recovery",
      workspaceId: "00000000-0000-4000-8000-000000000009",
      toolKind: "variations",
      snapshot: null,
      switches: switchesOn,
      allowlistRaw: "00000000-0000-4000-8000-000000000001",
    });
    expect(unlisted.status).toBe("ineligible");
    expect(unlisted.reason).toBe("not_allowlisted");
    expect(unlisted.generationPolicyVersion).toBe("legacy");
  });

  it("never reinterprets an existing snapshot, whatever the switches say", () => {
    const legacy = resolveQualityFeaturePolicy({
      feature: "quality_recovery",
      workspaceId: "00000000-0000-4000-8000-000000000001",
      toolKind: "variations",
      snapshot: { generationPolicyVersion: "legacy" },
      switches: switchesOn,
      allowlistRaw: "00000000-0000-4000-8000-000000000001",
    });
    expect(legacy.status).toBe("frozen_legacy");
    expect(legacy.generationPolicyVersion).toBe("legacy");

    const enabled = resolveQualityFeaturePolicy({
      feature: "quality_recovery",
      workspaceId: "00000000-0000-4000-8000-000000000009",
      toolKind: "variations",
      snapshot: { generationPolicyVersion: "quality_recovery_v1" },
      switches: switchesOff,
      allowlistRaw: undefined,
    });
    expect(enabled.status).toBe("frozen_enabled");
    expect(enabled.generationPolicyVersion).toBe("quality_recovery_v1");
  });

  it("keeps Brand Cortex separate: single flagged, carousel always, rest never", () => {
    const flagged = resolveQualityFeaturePolicy({
      feature: "brand_cortex_single",
      workspaceId: "00000000-0000-4000-8000-000000000001",
      toolKind: "single",
      snapshot: null,
      switches: switchesOn,
      allowlistRaw: undefined,
    });
    expect(flagged.status).toBe("eligible");
    expect(flagged.includePublishedBrandKnowledge).toBe(true);

    // The recovery switch never enables Brand Cortex and vice versa.
    const crossed = resolveQualityFeaturePolicy({
      feature: "brand_cortex_single",
      workspaceId: "00000000-0000-4000-8000-000000000001",
      toolKind: "single",
      snapshot: null,
      switches: { qualityRecovery: "true", brandCortex: "false" },
      allowlistRaw: undefined,
    });
    expect(crossed.status).toBe("off");

    const always = resolveQualityFeaturePolicy({
      feature: "brand_cortex_single",
      workspaceId: "00000000-0000-4000-8000-000000000001",
      toolKind: "carousel",
      snapshot: null,
      switches: switchesOff,
      allowlistRaw: undefined,
    });
    expect(always.status).toBe("eligible");

    const never = resolveQualityFeaturePolicy({
      feature: "brand_cortex_single",
      workspaceId: "00000000-0000-4000-8000-000000000001",
      toolKind: "restyle",
      snapshot: null,
      switches: switchesOn,
      allowlistRaw: undefined,
    });
    expect(never.status).toBe("ineligible");
    expect(never.reason).toBe("protocol_never");
  });

  it("reads Brand Cortex inclusion from the frozen identity snapshot", () => {
    const frozen = resolveQualityFeaturePolicy({
      feature: "brand_cortex_single",
      workspaceId: "00000000-0000-4000-8000-000000000001",
      toolKind: "single",
      snapshot: { includePublishedBrandKnowledge: true },
      switches: switchesOff,
      allowlistRaw: undefined,
    });
    expect(frozen.status).toBe("frozen_enabled");
    const absent = resolveQualityFeaturePolicy({
      feature: "brand_cortex_single",
      workspaceId: "00000000-0000-4000-8000-000000000001",
      toolKind: "single",
      snapshot: {},
      switches: switchesOn,
      allowlistRaw: undefined,
    });
    expect(absent.status).toBe("frozen_legacy");
  });
});
