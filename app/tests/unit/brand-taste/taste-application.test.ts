import { describe, expect, it } from "vitest";
import { selectApplicableRules } from "@/server/brand-taste/taste-application";
import { buildBrandTasteProfile } from "@/server/brand-taste/taste-profile";
import type { CalibrationRule, CalibrationSignal } from "@/server/db/schema";

function rule(overrides: Partial<CalibrationRule> = {}): CalibrationRule {
  return {
    id: "rule-brand-1",
    workspaceId: "ws-1",
    clientProfileId: "client-1",
    category: "voice",
    status: "approved",
    rationale: "Prefer warm invitation tone",
    supportingSignalIds: [],
    confidence: "medium",
    caveats: [],
    mismatchBucket: null,
    version: 1,
    approvedAt: new Date("2026-06-20T12:00:00Z"),
    approvedBy: "user-1",
    createdAt: new Date("2026-06-20T12:00:00Z"),
    updatedAt: new Date("2026-06-20T12:00:00Z"),
    ...overrides,
  };
}

function signal(overrides: Partial<CalibrationSignal> = {}): CalibrationSignal {
  return {
    id: `sig-${Math.random()}`,
    workspaceId: "ws-1",
    clientProfileId: "client-1",
    campaignId: "camp-1",
    derivationId: `deriv-${Math.random()}`,
    outputDecisionEventId: null,
    humanVerdict: "entra",
    systemOlharVerdict: "pronta",
    systemExportStatus: "pronta",
    mismatchBucket: null,
    sourceLabel: "synthetic_fixture",
    reviewerId: "user-1",
    reviewedAt: new Date("2026-06-20T12:00:00Z"),
    sanitizedNote: null,
    idempotencyKey: null,
    createdAt: new Date("2026-06-20T12:00:00Z"),
    ...overrides,
  };
}

describe("selectApplicableRules", () => {
  it("skips brand-taste for uncalibrated profiles even when approved rules exist", () => {
    const approvedRules = [rule({ id: "rule-a" }), rule({ id: "rule-b", category: "gestalt" })];
    const profile = buildBrandTasteProfile({
      clientProfileId: "client-1",
      workspaceId: "ws-1",
      signals: [],
    });

    expect(profile.evidenceLevel).toBe("uncalibrated");

    const result = selectApplicableRules({ approvedRules, profile });

    expect(result.appliedRuleIds).toEqual([]);
    expect(result.constraintLines).toEqual([]);
  });

  it("returns real rule IDs for calibrated profiles", () => {
    const approvedRules = [
      rule({ id: "rule-voice-1", category: "voice" }),
      rule({ id: "rule-gestalt-2", category: "gestalt" }),
    ];
    const signals = Array.from({ length: 5 }, (_, i) =>
      signal({ id: `sig-${i}`, derivationId: `deriv-${i}` })
    );
    const profile = buildBrandTasteProfile({
      clientProfileId: "client-1",
      workspaceId: "ws-1",
      signals,
    });

    expect(profile.evidenceLevel).not.toBe("uncalibrated");

    const result = selectApplicableRules({ approvedRules, profile });

    expect(result.appliedRuleIds).toEqual(["rule-voice-1", "rule-gestalt-2"]);
    expect(result.appliedRuleIds).not.toContain("inline-0");
    expect(result.constraintLines.some((line) => line.includes("[brand-taste:rule-voice-1]"))).toBe(
      true
    );
  });
});
