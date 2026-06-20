import { describe, expect, it } from "vitest";
import {
  classifyJudgmentUncertainty,
  shouldSkipHumanReview,
} from "@/server/brand-taste/uncertainty-queue";
import { buildBrandTasteProfile } from "@/server/brand-taste/taste-profile";
import type { CalibrationSignal } from "@/server/db/schema";

describe("uncertainty-queue", () => {
  it("requires review for uncalibrated brand", () => {
    const uncertainty = classifyJudgmentUncertainty({
      profile: null,
      approvedRules: [],
      systemOlharVerdict: "pronta",
      systemExportStatus: "pronta",
    });

    expect(uncertainty.requiresHumanReview).toBe(true);
    expect(uncertainty.reasons.some((r) => r.code === "new_brand")).toBe(true);
  });

  it("skips review for low uncertainty calibrated brand", () => {
    const signals: CalibrationSignal[] = Array.from({ length: 10 }, (_, i) => ({
      id: `sig-${i}`,
      workspaceId: "ws-1",
      clientProfileId: "client-1",
      campaignId: "camp-1",
      derivationId: `deriv-${i}`,
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
    }));

    const profile = buildBrandTasteProfile({
      clientProfileId: "client-1",
      workspaceId: "ws-1",
      signals,
    });

    const uncertainty = classifyJudgmentUncertainty({
      profile,
      approvedRules: [],
      systemOlharVerdict: "pronta",
      systemExportStatus: "pronta",
    });

    expect(shouldSkipHumanReview(uncertainty)).toBe(true);
  });
});
