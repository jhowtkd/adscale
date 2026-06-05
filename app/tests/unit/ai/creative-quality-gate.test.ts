import { describe, it, expect } from "vitest";
import type { CreativeContract } from "@/server/ai/creative-contract";
import type {
  CreativeQaChecklist,
  CreativeQaCriterionResult,
} from "@/server/ai/creative-qa";
import {
  assertDerivationApprovable,
  classifyCreativeQualityGate,
  deriveQualityVerdict,
  extractPolishSuggestions,
  type CreativeHardFailureCode,
} from "@/server/ai/creative-quality-gate";

const passed: CreativeQaCriterionResult = { status: "passed", note: "OK." };

function checklist(
  overrides: Partial<CreativeQaChecklist> & {
    styleFidelity?: CreativeQaCriterionResult;
  }
): CreativeQaChecklist & { styleFidelity?: CreativeQaCriterionResult } {
  return {
    legibility: passed,
    ctaOffer: passed,
    informationPreservation: passed,
    briefMatch: passed,
    formatFit: passed,
    creativeRisk: passed,
    ...overrides,
  };
}

const artVariationContract: CreativeContract = {
  generationMode: "art_variation",
  targetFormat: "4:5",
  ctaSemantics: { kind: "explicit", text: "Shop Now" },
  baseAssetId: "base-1",
  styleAssetId: null,
  client: "Acme Corp",
  product: "Widget",
  offer: "20% off",
  constraints: null,
};

const formatAdaptationContract: CreativeContract = {
  ...artVariationContract,
  generationMode: "format_adaptation",
  targetFormat: "9:16",
};

const restylingContract: CreativeContract = {
  ...artVariationContract,
  generationMode: "restyling",
  styleAssetId: "style-1",
};

function expectHardCode(
  result: ReturnType<typeof classifyCreativeQualityGate>,
  code: CreativeHardFailureCode
) {
  expect(result.hardFailures.some((f) => f.code === code)).toBe(true);
}

describe("classifyCreativeQualityGate — hard failures", () => {
  it("maps ctaOffer failed + explicit CTA contract to cta_drift", () => {
    const result = classifyCreativeQualityGate({
      contract: artVariationContract,
      checklist: checklist({
        ctaOffer: {
          status: "failed",
          note: "CTA was replaced with a different call to action.",
        },
      }),
    });
    expectHardCode(result, "cta_drift");
    expect(result.hardFailures.find((f) => f.code === "cta_drift")?.criterion).toBe(
      "ctaOffer"
    );
  });

  it("maps briefMatch failed with brand mismatch note to wrong_brand", () => {
    const result = classifyCreativeQualityGate({
      contract: artVariationContract,
      checklist: checklist({
        briefMatch: {
          status: "failed",
          note: "Client/brand mismatch: image shows a competitor logo instead of Acme Corp.",
        },
      }),
    });
    expectHardCode(result, "wrong_brand");
  });

  it("maps briefMatch failed with unsupported claim note to unsupported_offer", () => {
    const result = classifyCreativeQualityGate({
      contract: artVariationContract,
      checklist: checklist({
        briefMatch: {
          status: "failed",
          note: "Unsupported claim: 50% off is not in contract.",
        },
      }),
    });
    expectHardCode(result, "unsupported_offer");
  });

  it("maps ctaOffer failed with unsupported claim to unsupported_offer", () => {
    const result = classifyCreativeQualityGate({
      contract: artVariationContract,
      checklist: checklist({
        ctaOffer: {
          status: "failed",
          note: "Offer text includes an unsupported claim not in contract.",
        },
      }),
    });
    expectHardCode(result, "unsupported_offer");
    expect(result.hardFailures.some((f) => f.code === "cta_drift")).toBe(false);
  });

  it("maps creativeRisk failed with unsupported factual claim to unsupported_offer", () => {
    const result = classifyCreativeQualityGate({
      contract: artVariationContract,
      checklist: checklist({
        creativeRisk: {
          status: "failed",
          note: "Unsupported factual claim about pricing was invented.",
        },
      }),
    });
    expectHardCode(result, "unsupported_offer");
  });

  it("keeps subjective creativeRisk failed as polish only", () => {
    const result = classifyCreativeQualityGate({
      contract: artVariationContract,
      checklist: checklist({
        creativeRisk: {
          status: "failed",
          note: "Visual feels generic and risky for the brand tone.",
        },
      }),
    });
    expect(result.hardFailures).toHaveLength(0);
    expect(result.polishSuggestions.some((s) => s.includes("generic"))).toBe(true);
  });

  it("maps styleFidelity failed in restyling to copied_style_reference_facts", () => {
    const result = classifyCreativeQualityGate({
      contract: restylingContract,
      checklist: checklist({
        styleFidelity: {
          status: "failed",
          note: "Unrelated discount copied from style reference, not base image.",
        },
      }),
    });
    expectHardCode(result, "copied_style_reference_facts");
  });

  it("maps informationPreservation failed to cropped_critical_content", () => {
    const result = classifyCreativeQualityGate({
      contract: artVariationContract,
      checklist: checklist({
        informationPreservation: {
          status: "failed",
          note: "Logo and CTA zone were cropped out of frame.",
        },
      }),
    });
    expectHardCode(result, "cropped_critical_content");
  });

  it("maps legibility failed to unreadable_required_text", () => {
    const result = classifyCreativeQualityGate({
      contract: artVariationContract,
      checklist: checklist({
        legibility: {
          status: "failed",
          note: "Required headline and CTA text are illegible.",
        },
      }),
    });
    expectHardCode(result, "unreadable_required_text");
  });

  it("maps formatFit failed in format_adaptation to invalid_format_layout", () => {
    const result = classifyCreativeQualityGate({
      contract: formatAdaptationContract,
      checklist: checklist({
        formatFit: {
          status: "failed",
          note: "Blur bands and pasted poster layout, not native 9:16.",
        },
      }),
    });
    expectHardCode(result, "invalid_format_layout");
  });

  it("maps formatFit failed in art_variation to polish, not hard failure", () => {
    const result = classifyCreativeQualityGate({
      contract: artVariationContract,
      checklist: checklist({
        formatFit: {
          status: "failed",
          note: "Composition feels slightly crowded for 4:5.",
        },
      }),
    });
    expect(result.hardFailures).toHaveLength(0);
    expect(result.polishSuggestions.some((s) => s.includes("crowded"))).toBe(true);
  });
});

describe("classifyCreativeQualityGate — warnings and score issues", () => {
  it("never produces hard failures when checklist is warning-only", () => {
    const result = classifyCreativeQualityGate({
      contract: artVariationContract,
      checklist: checklist({
        briefMatch: { status: "warning", note: "Audience could be clearer." },
        creativeRisk: { status: "warning", note: "Generic visual." },
        formatFit: { status: "warning", note: "Slightly tight layout." },
      }),
      scoreIssues: ["Minor contrast issue"],
    });
    expect(result.hardFailures).toHaveLength(0);
    expect(result.polishSuggestions.length).toBeGreaterThanOrEqual(3);
  });

  it("routes unmapped scoreIssues to polishSuggestions only", () => {
    const result = classifyCreativeQualityGate({
      contract: artVariationContract,
      checklist: checklist({}),
      scoreIssues: ["Improve color harmony", "Sharpen product focus"],
    });
    expect(result.hardFailures).toHaveLength(0);
    expect(result.polishSuggestions).toEqual(
      expect.arrayContaining(["Improve color harmony", "Sharpen product focus"])
    );
  });

  it("promotes brand mismatch scoreIssue to wrong_brand hard failure", () => {
    const result = classifyCreativeQualityGate({
      contract: artVariationContract,
      checklist: checklist({}),
      scoreIssues: ["brand mismatch: wrong client logo"],
    });
    expectHardCode(result, "wrong_brand");
    expect(result.polishSuggestions).not.toContain("brand mismatch: wrong client logo");
  });

  it("keeps subjective score issues as polish only", () => {
    const result = classifyCreativeQualityGate({
      contract: artVariationContract,
      checklist: checklist({}),
      scoreIssues: ["Improve color harmony"],
    });
    expect(result.hardFailures).toHaveLength(0);
    expect(result.polishSuggestions).toContain("Improve color harmony");
  });

  it("promotes format layout score issue in format_adaptation to invalid_format_layout", () => {
    const result = classifyCreativeQualityGate({
      contract: formatAdaptationContract,
      checklist: checklist({}),
      scoreIssues: ["Invalid format layout with blur bands, not native 9:16"],
    });
    expectHardCode(result, "invalid_format_layout");
  });

  it("does not hard-fail variationLevelFit-only polish issues", () => {
    const result = classifyCreativeQualityGate({
      contract: artVariationContract,
      checklist: checklist({}),
      scoreIssues: ["Variation level could be bolder for extreme setting"],
    });
    expect(result.hardFailures).toHaveLength(0);
  });
});

describe("classifyCreativeQualityGate — inherited CTA", () => {
  const inheritedCtaContract: CreativeContract = {
    ...artVariationContract,
    ctaSemantics: { kind: "inherited" },
  };

  it("maps inherited CTA + ctaOffer failed + missing CTA note to cta_drift", () => {
    const result = classifyCreativeQualityGate({
      contract: inheritedCtaContract,
      checklist: checklist({
        ctaOffer: {
          status: "failed",
          note: "CTA missing from output",
        },
      }),
    });
    expectHardCode(result, "cta_drift");
  });

  it("does not hard-fail inherited ctaOffer with vague polish-only note", () => {
    const result = classifyCreativeQualityGate({
      contract: inheritedCtaContract,
      checklist: checklist({
        ctaOffer: {
          status: "failed",
          note: "CTA button could use more contrast.",
        },
      }),
    });
    expect(result.hardFailures).toHaveLength(0);
  });

  it("does not produce cta_drift when inherited CTA ctaOffer passed", () => {
    const result = classifyCreativeQualityGate({
      contract: inheritedCtaContract,
      checklist: checklist({
        ctaOffer: { status: "passed", note: "CTA preserved from base." },
      }),
    });
    expect(result.hardFailures.some((f) => f.code === "cta_drift")).toBe(false);
  });
});

describe("extractPolishSuggestions", () => {
  it("collects warnings and score issues without hard mapping", () => {
    const suggestions = extractPolishSuggestions({
      contract: artVariationContract,
      checklist: checklist({
        briefMatch: { status: "warning", note: "Tone is slightly off." },
      }),
      scoreIssues: ["Boost contrast"],
    });
    expect(suggestions).toContain("Tone is slightly off.");
    expect(suggestions).toContain("Boost contrast");
  });
});

describe("deriveQualityVerdict", () => {
  const warnChecklist = checklist({
    briefMatch: { status: "warning", note: "Audience could be clearer." },
  });

  it("returns invalid when hard failures exist even with high qualityScore", () => {
    const { hardFailures } = classifyCreativeQualityGate({
      contract: artVariationContract,
      checklist: checklist({
        ctaOffer: {
          status: "failed",
          note: "CTA missing; does not match contract Shop Now.",
        },
      }),
    });
    expect(
      deriveQualityVerdict({
        hardFailures,
        qualityScore: 88,
        checklist: checklist({
          ctaOffer: {
            status: "failed",
            note: "CTA missing; does not match contract Shop Now.",
          },
        }),
      })
    ).toBe("invalid");
  });

  it("returns invalid for qualityScore 92 with hard failure from score issue promotion", () => {
    const { hardFailures } = classifyCreativeQualityGate({
      contract: artVariationContract,
      checklist: checklist({}),
      scoreIssues: ["brand mismatch: wrong client logo"],
    });
    expect(
      deriveQualityVerdict({
        hardFailures,
        qualityScore: 92,
        checklist: checklist({}),
      })
    ).toBe("invalid");
  });

  it("returns improvable when no hard failures but score below 70 or warnings", () => {
    expect(
      deriveQualityVerdict({
        hardFailures: [],
        qualityScore: 65,
        checklist: warnChecklist,
      })
    ).toBe("improvable");

    expect(
      deriveQualityVerdict({
        hardFailures: [],
        qualityScore: 85,
        checklist: warnChecklist,
      })
    ).toBe("improvable");
  });

  it("returns acceptable when no hard failures, score >= 70, no warnings", () => {
    expect(
      deriveQualityVerdict({
        hardFailures: [],
        qualityScore: 82,
        checklist: checklist({}),
      })
    ).toBe("acceptable");
  });
});

describe("assertDerivationApprovable", () => {
  it("blocks when qualityVerdict is invalid", () => {
    const result = assertDerivationApprovable({
      qualityVerdict: "invalid",
      hardFailures: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.qualityVerdict).toBe("invalid");
    }
  });

  it("blocks when hardFailures array is non-empty", () => {
    const result = assertDerivationApprovable({
      qualityVerdict: "improvable",
      hardFailures: [{ code: "cta_drift", message: "CTA drift" }],
    });
    expect(result.ok).toBe(false);
  });

  it("allows improvable verdict with no hard failures", () => {
    expect(
      assertDerivationApprovable({
        qualityVerdict: "improvable",
        hardFailures: [],
      }).ok
    ).toBe(true);
  });
});
