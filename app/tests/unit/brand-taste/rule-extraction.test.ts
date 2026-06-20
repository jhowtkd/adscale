import { describe, expect, it } from "vitest";
import {
  canPromoteRuleToApproved,
  extractRuleCandidatesFromSignals,
} from "@/server/brand-taste/rule-extraction";
import type { CalibrationSignal } from "@/server/db/schema";

function mismatchSignal(
  overrides: Partial<CalibrationSignal> = {}
): CalibrationSignal {
  return {
    id: `sig-${Math.random()}`,
    workspaceId: "ws-1",
    clientProfileId: "client-1",
    campaignId: "camp-1",
    derivationId: `deriv-${Math.random()}`,
    outputDecisionEventId: null,
    humanVerdict: "nao_entra",
    systemOlharVerdict: "pronta",
    systemExportStatus: "pronta",
    mismatchBucket: "system_too_permissive",
    sourceLabel: "synthetic_fixture",
    reviewerId: "user-1",
    reviewedAt: new Date("2026-06-20T12:00:00Z"),
    sanitizedNote: "Too generic",
    idempotencyKey: null,
    createdAt: new Date("2026-06-20T12:00:00Z"),
    ...overrides,
  };
}

describe("rule-extraction", () => {
  it("extracts rule candidates from mismatches", () => {
    const candidates = extractRuleCandidatesFromSignals({
      clientProfileId: "client-1",
      signals: [
        mismatchSignal({ id: "sig-1" }),
        mismatchSignal({ id: "sig-2" }),
      ],
    });

    expect(candidates.length).toBe(1);
    expect(candidates[0]?.category).toBe("gestalt");
    expect(candidates[0]?.supportingDecisionIds).toHaveLength(2);
    expect(candidates[0]?.confidence).toBe("medium");
  });

  it("blocks ambiguous single-row promotion", () => {
    const candidate = extractRuleCandidatesFromSignals({
      clientProfileId: "client-1",
      signals: [
        mismatchSignal({
          id: "sig-1",
          mismatchBucket: "unclear_sample",
        }),
      ],
    })[0]!;

    const result = canPromoteRuleToApproved(candidate);
    expect(result.ok).toBe(false);
  });
});
