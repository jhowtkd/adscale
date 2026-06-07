import { describe, expect, it } from "vitest";
import { buildMissionHref } from "./hrefs";
import { buildEvidenceHref } from "../evidence";
import type { ProgressionEvidenceContext } from "../evidence";

const context = (campaignId: string | null): ProgressionEvidenceContext => ({
  firstCampaignId: campaignId,
  evidence: [],
});

describe("buildEvidenceHref", () => {
  it("routes progression CTAs to campaign deep-link tabs", () => {
    const ctx = context("camp-1");
    expect(buildEvidenceHref("base_creative_uploaded", ctx)).toBe(
      "/campaigns/camp-1?tab=assets"
    );
    expect(buildEvidenceHref("readiness_ran", ctx)).toBe(
      "/campaigns/camp-1?tab=readiness"
    );
    expect(buildEvidenceHref("creative_exported", ctx)).toBe(
      "/campaigns/camp-1?tab=export"
    );
    expect(buildEvidenceHref("share_created", ctx)).toBe(
      "/campaigns/camp-1?tab=share"
    );
    expect(buildEvidenceHref("creative_approved", ctx)).toBe(
      "/campaigns/camp-1?tab=review"
    );
  });

  it("falls back to new campaign when no campaign exists", () => {
    expect(buildEvidenceHref("base_creative_uploaded", context(null))).toBe(
      "/campaigns/new"
    );
  });
});

describe("buildMissionHref", () => {
  it("maps upload and export missions to resume tab targets", () => {
    const ctx = context("camp-2");
    expect(buildMissionHref("upload", ctx)).toBe("/campaigns/camp-2?tab=assets");
    expect(buildMissionHref("export", ctx)).toBe("/campaigns/camp-2?tab=export");
    expect(buildMissionHref("share", ctx)).toBe("/campaigns/camp-2?tab=share");
  });

  it("maps guided workflow missions to tab deep links", () => {
    const ctx = context("camp-2");
    expect(buildMissionHref("guided_briefing", ctx)).toBe(
      "/campaigns/camp-2?tab=briefing"
    );
    expect(buildMissionHref("preview", ctx)).toBe(
      "/campaigns/camp-2?tab=generate&mode=preview"
    );
    expect(buildMissionHref("review", ctx)).toBe("/campaigns/camp-2?tab=review");
  });
});
