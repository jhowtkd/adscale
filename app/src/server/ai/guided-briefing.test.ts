import { describe, expect, it } from "vitest";
import {
  answersFromCampaign,
  buildSuggestion,
  getNextStep,
  isBriefWeak,
  mapGuidedAnswersToCampaignDraft,
  mapGuidedAnswersToPilotBriefing,
  mergeConstraintsWithObjections,
} from "./guided-briefing";

describe("guided-briefing", () => {
  it("detects weak brief when fewer than two core fields are filled", () => {
    expect(isBriefWeak({})).toBe(true);
    expect(isBriefWeak({ product: "SaaS tool" })).toBe(true);
    expect(
      isBriefWeak({ product: "SaaS", offer: "Free trial", audience: "SMBs" })
    ).toBe(false);
  });

  it("returns productOffer as first step for empty answers", () => {
    expect(getNextStep({})).toBe("productOffer");
  });

  it("skips completed steps", () => {
    expect(
      getNextStep({ product: "Shoes", offer: "50% off" })
    ).toBe("audience");
    expect(
      getNextStep({
        product: "Shoes",
        offer: "50% off",
        audience: "Runners",
        promise: "Run faster",
        objections: "",
        cta: "Shop now",
        platforms: "Instagram",
      })
    ).toBe("constraints");
  });

  it("builds locale-aware suggestions from prior answers", () => {
    const answers = { product: "Coffee", offer: "2-for-1" };
    expect(buildSuggestion("audience", answers, {}, "en")).toContain("Coffee");
    expect(buildSuggestion("audience", answers, {}, "pt-BR")).toContain(
      "Coffee"
    );
    expect(buildSuggestion("cta", answers, { suggestedCta: "Buy now" }, "en")).toBe(
      "Buy now"
    );
  });

  it("maps guided answers to campaign draft fields", () => {
    const draft = mapGuidedAnswersToCampaignDraft(
      {
        product: "Course",
        offer: "Launch discount",
        audience: "Creators",
        promise: "Learn ads fast",
        objections: "No time",
        cta: "Enroll",
        platforms: "Meta, TikTok",
        constraints: "Keep logo visible",
      },
      "en"
    );

    expect(draft).toMatchObject({
      product: "Course",
      offer: "Launch discount",
      audience: "Creators",
      objective: "Learn ads fast",
      ctaVariants: ["Enroll"],
      platforms: ["Meta", "TikTok"],
    });
    expect(draft.constraints).toContain("Objections to address: No time");
    expect(draft.constraints).toContain("Keep logo visible");
  });

  it("maps to pilot briefing shape", () => {
    const pilot = mapGuidedAnswersToPilotBriefing({
      promise: "Grow sales",
      audience: "Retailers",
      cta: "Start",
      platforms: "Google",
    });
    expect(pilot.objective).toBe("Grow sales");
    expect(pilot.ctaText).toBe("Start");
    expect(pilot.platforms).toBe("Google");
  });

  it("hydrates answers from stored campaign", () => {
    const answers = answersFromCampaign({
      product: "App",
      offer: "Trial",
      audience: "Startups",
      objective: "Scale leads",
      constraints: "Objections to address: Budget\nNo red backgrounds",
      platforms: ["Meta"],
      ctaVariants: ["Try free"],
    });
    expect(answers.objections).toBe("Budget");
    expect(answers.constraints).toBe("No red backgrounds");
    expect(answers.cta).toBe("Try free");
  });

  it("merges objections prefix in pt-BR", () => {
    expect(
      mergeConstraintsWithObjections("Preço", "Sem vermelho", "pt-BR")
    ).toBe("Objeções a endereçar: Preço\nSem vermelho");
  });
});
