import { describe, expect, it } from "vitest";
import { buildBrandTasteProfile, computeEvidenceLevel } from "@/server/brand-taste/taste-profile";
import type { CalibrationSignal } from "@/server/db/schema";

function signal(
  overrides: Partial<CalibrationSignal> = {}
): CalibrationSignal {
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

describe("taste-profile", () => {
  it("returns uncalibrated for empty signals", () => {
    const profile = buildBrandTasteProfile({
      clientProfileId: "client-1",
      workspaceId: "ws-1",
      signals: [],
    });

    expect(profile.evidenceLevel).toBe("uncalibrated");
    expect(profile.decisionCount).toBe(0);
    expect(profile.caveats.length).toBeGreaterThan(0);
  });

  it("reaches seed_calibrated at 5 fixture decisions", () => {
    const signals = Array.from({ length: 5 }, (_, i) =>
      signal({ id: `sig-${i}`, derivationId: `deriv-${i}` })
    );

    const level = computeEvidenceLevel({
      decisionCount: signals.length,
      sourceComposition: {
        synthetic_fixture: 5,
        operator_imported: 0,
        real_customer: 0,
      },
    });

    expect(level).toBe("seed_calibrated");

    const profile = buildBrandTasteProfile({
      clientProfileId: "client-1",
      workspaceId: "ws-1",
      signals,
    });

    expect(profile.positivePatterns.length).toBeGreaterThan(0);
    expect(profile.caveats.some((c) => c.includes("fixture"))).toBe(true);
  });

  it("separates entra, quase and nao_entra patterns", () => {
    const signals = [
      signal({ humanVerdict: "entra" }),
      signal({ humanVerdict: "quase", systemOlharVerdict: "quase" }),
      signal({
        humanVerdict: "nao_entra",
        systemOlharVerdict: "pronta",
        mismatchBucket: "system_too_permissive",
      }),
    ];

    const profile = buildBrandTasteProfile({
      clientProfileId: "client-1",
      workspaceId: "ws-1",
      signals,
    });

    expect(profile.positivePatterns.length).toBeGreaterThan(0);
    expect(profile.quasePatterns.length).toBeGreaterThan(0);
    expect(profile.rejectionPatterns.length).toBeGreaterThan(0);
  });

  it("tracks sourceComposition separately for each source label", () => {
    const signals = [
      signal({ sourceLabel: "synthetic_fixture" }),
      signal({ sourceLabel: "synthetic_fixture" }),
      signal({ sourceLabel: "operator_imported" }),
      signal({ sourceLabel: "real_customer" }),
    ];

    const profile = buildBrandTasteProfile({
      clientProfileId: "client-1",
      workspaceId: "ws-1",
      signals,
    });

    expect(profile.sourceComposition).toEqual({
      synthetic_fixture: 2,
      operator_imported: 1,
      real_customer: 1,
    });
  });

  it("builds taste profile only from signals scoped to the selected clientProfileId", () => {
    const profileA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const profileB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    const mixedSignals = [
      signal({ clientProfileId: profileA, humanVerdict: "entra" }),
      signal({ clientProfileId: profileA, humanVerdict: "entra" }),
      signal({
        clientProfileId: profileB,
        humanVerdict: "nao_entra",
        mismatchBucket: "system_too_permissive",
      }),
      signal({
        clientProfileId: profileB,
        humanVerdict: "nao_entra",
        mismatchBucket: "system_too_permissive",
      }),
    ];

    const profileForA = buildBrandTasteProfile({
      clientProfileId: profileA,
      workspaceId: "ws-1",
      signals: mixedSignals.filter((entry) => entry.clientProfileId === profileA),
    });
    const profileForB = buildBrandTasteProfile({
      clientProfileId: profileB,
      workspaceId: "ws-1",
      signals: mixedSignals.filter((entry) => entry.clientProfileId === profileB),
    });

    expect(profileForA.decisionCount).toBe(2);
    expect(profileForA.positivePatterns.length).toBeGreaterThan(0);
    expect(profileForA.rejectionPatterns.length).toBe(0);

    expect(profileForB.decisionCount).toBe(2);
    expect(profileForB.rejectionPatterns.length).toBeGreaterThan(0);
    expect(profileForB.positivePatterns.length).toBe(0);
  });
});
