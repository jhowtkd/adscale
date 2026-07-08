import { describe, it, expect } from "vitest";
import { buildCreativeReadiness } from "./creative-readiness";
import type { PreflightResult } from "./preflight-analysis";
import {
  getNextStep,
  isBriefWeak,
  mapGuidedAnswersToCampaignDraft,
} from "./guided-briefing";
import {
  mapRecipeToGenerationConfig,
  rankRecipesForContext,
  estimateCreditCost,
} from "./strategy-recipes";
import { shouldShowPreviewGate } from "./preview-gate";
import { detectPackageStaleness } from "./client-approval-package";

function makePreflight(overrides: Partial<PreflightResult> = {}): PreflightResult {
  const baseDimension = { score: 80, suggestion: "Looks good." };
  return {
    overallScore: 80,
    breakdown: {
      technicalQuality: baseDimension,
      textLegibility: baseDimension,
      visualHierarchy: baseDimension,
      ctaProminence: baseDimension,
      composition: baseDimension,
      brandConsistency: baseDimension,
      platformReadiness: baseDimension,
    },
    criticalIssues: [],
    suggestions: [],
    technical: {
      actualWidth: 1080,
      actualHeight: 1080,
      claimedWidth: 1080,
      claimedHeight: 1080,
      aspectRatio: "1:1",
      format: "png",
      fileSizeBytes: 1024,
      hasAlpha: false,
      estimatedContrast: 0.7,
    },
    ...overrides,
  };
}

/**
 * CQA-01 integration: chains pure cockpit steps without UI or network.
 */
describe("v11.6 cockpit path (pure functions)", () => {
  it("flows weak brief → guided answers → readiness → recipe → preview gate → package staleness", () => {
    // 1. Campaign draft starts weak
    expect(isBriefWeak({})).toBe(true);
    expect(getNextStep({})).toBe("productOffer");

    // 2. Guided briefing strengthens the brief
    const guidedAnswers = {
      product: "Running shoes",
      offer: "20% off launch",
      audience: "Urban runners",
      promise: "Comfort for daily miles",
      objections: "Too expensive",
      cta: "Shop now",
      platforms: "Instagram, Meta",
      constraints: "Keep logo visible",
    };
    const draft = mapGuidedAnswersToCampaignDraft(guidedAnswers, "en");
    expect(draft.product).toBe("Running shoes");
    expect(draft.ctaVariants).toEqual(["Shop now"]);

    // 3. Readiness normalizes preflight for the workspace
    const readiness = buildCreativeReadiness({
      preflight: makePreflight(),
      campaignId: "camp-1",
      assetId: "asset-1",
      analyzedAt: "2026-06-05T12:00:00.000Z",
      campaignBrief: { product: draft.product, offer: draft.offer },
    });
    expect(readiness.status).toBe("ready");
    expect(readiness.canGenerate).toBe(true);

    // 4. Recipe mapping uses campaign context
    const ranked = rankRecipesForContext({ readiness });
    expect(ranked.length).toBeGreaterThanOrEqual(3);
    const config = mapRecipeToGenerationConfig(ranked[0]!.id, {
      campaign: { ctaVariants: draft.ctaVariants },
    });
    expect(config.ctaVariants.length).toBeGreaterThan(0);
    expect(estimateCreditCost(config)).toBeGreaterThan(0);

    // 5. Preview gate only blocks when quality failed; acceptable auto-continues
    expect(
      shouldShowPreviewGate([
        {
          isPreview: true,
          status: "completed",
          imageUrl: "https://example.com/preview.png",
          qualityVerdict: "acceptable",
        },
      ])
    ).toBe(false);
    expect(
      shouldShowPreviewGate([
        {
          isPreview: true,
          status: "completed",
          imageUrl: "https://example.com/preview.png",
          qualityVerdict: "invalid",
        },
      ])
    ).toBe(true);
    expect(
      shouldShowPreviewGate([
        {
          isPreview: true,
          status: "completed",
          imageUrl: "https://example.com/preview.png",
          qualityVerdict: "invalid",
        },
        { status: "completed", imageUrl: "https://example.com/batch.png" },
      ])
    ).toBe(false);

    // 6. Approval package staleness when a derivation is no longer approved
    const derivations = [
      {
        id: "d-approved-1",
        parentId: null,
        status: "approved",
        outputKey: "out/1.png",
        isPreview: false,
      },
      {
        id: "d-rejected-2",
        parentId: null,
        status: "rejected",
        outputKey: "out/2.png",
        isPreview: false,
      },
    ];
    const stale = detectPackageStaleness({
      packageDerivationIds: ["d-approved-1", "d-rejected-2"],
      selectedRootIds: ["d-approved-1"],
      derivations,
    });
    expect(stale.isStale).toBe(true);
    expect(stale.staleReasons).toContain("unapproved:d-rejected-2");
  });

  it("routes blocked readiness toward conservative recipes", () => {
    const readiness = buildCreativeReadiness({
      preflight: makePreflight({
        overallScore: 35,
        criticalIssues: ["CTA not visible"],
      }),
      campaignId: "camp-1",
      assetId: "asset-1",
      analyzedAt: "2026-06-05T12:00:00.000Z",
    });
    expect(readiness.status).toBe("blocked");

    expect(readiness.status).toBe("blocked");
    const ranked = rankRecipesForContext({ readiness });
    expect(ranked[0]!.id).toBe("safe_iteration");
  });
});
