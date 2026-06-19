import { describe, it, expect } from "vitest";
import type { CreativeContract } from "@/server/ai/creative-contract";
import type {
  CreativeQaChecklist,
  CreativeQaCriterionResult,
} from "@/server/ai/creative-qa";
import { CORPUS_ARCHETYPE_FIXTURES, CORPUS_POSITIVE_FIXTURES } from "@/server/ai/corpus-fixtures";
import { normalizeCreativeQaResult } from "@/server/ai/creative-qa";
import { CONTAMINATION_FAILURE_CODES } from "@/server/ai/factual-visual-separation";
import {
  assertDerivationApprovable,
  classifyCreativeQualityGate,
  computeQualityGateFromAnalysis,
  deriveQualityVerdict,
  extractPolishSuggestions,
  normalizeHardFailureCode,
  type CreativeHardFailureCode,
} from "@/server/ai/creative-quality-gate";
import {
  CAMPAIGN_IDENTITY_DRIFT_PATTERN,
  CAMPAIGN_IDENTITY_SAFE_PATTERN,
  DECORATIVE_ONLY_PATTERN,
  GENERIC_TEMPLATE_NOTE_MARKERS,
  MISSING_DOMINANT_IDEA_MARKERS,
  OVERLOAD_NOTE_MARKERS,
  REPLACED_SOURCE_SUBJECT_PATTERN,
  STYLE_REFERENCE_CONTAMINATION_PATTERN,
  UNAUTHORIZED_BRAND_PATTERN,
} from "@/server/ai/creative-quality-taxonomy";

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

  it("maps styleFidelity failed in restyling to style_reference_contamination", () => {
    const result = classifyCreativeQualityGate({
      contract: restylingContract,
      checklist: checklist({
        styleFidelity: {
          status: "failed",
          note: "Unrelated discount copied from style reference, not base image.",
        },
      }),
    });
    expectHardCode(result, "style_reference_contamination");
    expect(result.hardFailures.some((f) => f.code === "copied_style_reference_facts")).toBe(
      false
    );
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

  it("promotes creativeRisk overload note to visual_overload hard failure", () => {
    const overloadFixture = CORPUS_ARCHETYPE_FIXTURES.find(
      (f) => f.id === "corpus-visual-overload"
    )!;
    const qa = normalizeCreativeQaResult(overloadFixture.rawQaModelOutput);
    const result = classifyCreativeQualityGate({
      contract: overloadFixture.contract,
      checklist: qa.checklist,
    });
    expectHardCode(result, "visual_overload");
    expect(
      result.polishSuggestions.some((s) => /competing information zones/i.test(s))
    ).toBe(false);
  });

  it("promotes severe generic template creativeRisk note to generic_template_aesthetic", () => {
    const genericFixture = CORPUS_ARCHETYPE_FIXTURES.find(
      (f) => f.id === "corpus-generic-template-aesthetic"
    )!;
    const qa = normalizeCreativeQaResult(genericFixture.rawQaModelOutput);
    const result = classifyCreativeQualityGate({
      contract: genericFixture.contract,
      checklist: qa.checklist,
    });
    expectHardCode(result, "generic_template_aesthetic");
    expect(result.polishSuggestions.some((s) => /generic premium-tech/i.test(s))).toBe(
      false
    );
  });

  it("promotes briefMatch campaign drift in format_adaptation to campaign_identity_drift", () => {
    const driftFixture = CORPUS_ARCHETYPE_FIXTURES.find(
      (f) => f.id === "corpus-format-campaign-drift"
    )!;
    const qa = normalizeCreativeQaResult(driftFixture.rawQaModelOutput);
    const result = classifyCreativeQualityGate({
      contract: driftFixture.contract,
      checklist: qa.checklist,
    });
    expectHardCode(result, "campaign_identity_drift");
  });

  it("promotes formatFit drift note to campaign_identity_drift before invalid_format_layout", () => {
    const result = classifyCreativeQualityGate({
      contract: formatAdaptationContract,
      checklist: checklist({
        formatFit: {
          status: "failed",
          note: "Layout reads as a different campaign identity, not a faithful NR1 format adaptation.",
        },
      }),
    });
    expectHardCode(result, "campaign_identity_drift");
    expect(result.hardFailures.some((f) => f.code === "invalid_format_layout")).toBe(
      false
    );
  });

  it("promotes informationPreservation replaced hero note to replaced_source_subject", () => {
    const result = classifyCreativeQualityGate({
      contract: artVariationContract,
      checklist: checklist({
        informationPreservation: {
          status: "failed",
          note: "replaced hero photo with different subject than base",
        },
      }),
    });
    expectHardCode(result, "replaced_source_subject");
    expect(result.hardFailures.some((f) => f.code === "cropped_critical_content")).toBe(
      false
    );
  });

  it("promotes decorative_only_variation only in art_variation mode", () => {
    const note = "background-only recolor without mechanism change";
    const artResult = classifyCreativeQualityGate({
      contract: artVariationContract,
      checklist: checklist({
        creativeRisk: { status: "failed", note },
      }),
    });
    expectHardCode(artResult, "decorative_only_variation");

    const formatResult = classifyCreativeQualityGate({
      contract: formatAdaptationContract,
      checklist: checklist({
        creativeRisk: { status: "failed", note },
      }),
    });
    expect(formatResult.hardFailures.some((f) => f.code === "decorative_only_variation")).toBe(
      false
    );
    expect(formatResult.polishSuggestions.some((s) => s.includes("background-only"))).toBe(
      true
    );
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

describe("capped score", () => {
  it("computeQualityGateFromAnalysis caps qualityScore when hard failure is active", () => {
    const gate = computeQualityGateFromAnalysis({
      contract: artVariationContract,
      checklist: checklist({
        ctaOffer: {
          status: "failed",
          note: "CTA missing; does not match contract Shop Now.",
        },
      }),
      qualityScore: 85,
    });

    expect(gate.qualityScore).toBeLessThanOrEqual(50);
    expect(gate.qualityVerdict).toBe("invalid");
    expect(gate.hardFailures.some((f) => f.code === "cta_drift")).toBe(true);
  });

  it("computeQualityGateFromAnalysis caps invented_factual_entity raw 85 to ≤20", () => {
    const gate = computeQualityGateFromAnalysis({
      contract: artVariationContract,
      checklist: checklist({
        briefMatch: {
          status: "failed",
          note: "Output depicts Cantona, a celebrity athlete not in the campaign brief.",
        },
      }),
      qualityScore: 85,
    });

    expect(gate.qualityScore).toBeLessThanOrEqual(20);
    expect(gate.qualityVerdict).toBe("invalid");
  });

  it("leaves qualityScore unchanged when no hard failures are present", () => {
    const gate = computeQualityGateFromAnalysis({
      contract: artVariationContract,
      checklist: checklist(),
      qualityScore: 85,
    });

    expect(gate.qualityScore).toBe(85);
    expect(gate.qualityVerdict).toBe("acceptable");
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

describe("invented_factual_entity", () => {
  const inventedFixture = CORPUS_ARCHETYPE_FIXTURES.find(
    (fixture) => fixture.id === "corpus-invented-factual-entity"
  )!;

  it("promotes Cantona-style briefMatch notes to invented_factual_entity hard failure", () => {
    const qa = normalizeCreativeQaResult(inventedFixture.rawQaModelOutput);
    const gate = classifyCreativeQualityGate({
      contract: inventedFixture.contract,
      checklist: qa.checklist,
    });

    expect(gate.hardFailures.some((f) => f.code === "invented_factual_entity")).toBe(
      true
    );
    expect(
      deriveQualityVerdict({
        hardFailures: gate.hardFailures,
        qualityScore: 85,
        checklist: qa.checklist,
      })
    ).toBe("invalid");
  });

  it("does not send Cantona-style creativeRisk notes to polishSuggestions", () => {
    const gate = classifyCreativeQualityGate({
      contract: inventedFixture.contract,
      checklist: checklist({
        creativeRisk: {
          status: "failed",
          note: "Hallucinated celebrity athlete imported into NR1 compliance creative.",
        },
      }),
    });

    expect(gate.hardFailures.some((f) => f.code === "invented_factual_entity")).toBe(
      true
    );
    expect(
      gate.polishSuggestions.some((note) => /hallucinat|celebrity athlete/i.test(note))
    ).toBe(false);
  });
});

function noteMatches(pattern: RegExp, note: string): boolean {
  return pattern.test(note);
}

describe("GATE-01 taxonomy patterns", () => {
  const patternCases: Array<{
    name: string;
    pattern: RegExp;
    match: string[];
    noMatch: string[];
  }> = [
    {
      name: "CAMPAIGN_IDENTITY_DRIFT_PATTERN",
      pattern: CAMPAIGN_IDENTITY_DRIFT_PATTERN,
      match: [
        "education/professor enrollment narrative instead of CENBRAP NR1",
        "different campaign narrative than the base NR1 compliance piece",
        "replaced with a new enrollment story",
      ],
      noMatch: [
        "faithful NR1 format adaptation with same campaign identity",
        "same campaign identity preserved across aspect ratios",
      ],
    },
    {
      name: "CAMPAIGN_IDENTITY_SAFE_PATTERN",
      pattern: CAMPAIGN_IDENTITY_SAFE_PATTERN,
      match: [
        "faithful NR1 format adaptation",
        "same campaign identity preserved",
        "identical people and preserved narrative",
      ],
      noMatch: [
        "education/professor enrollment narrative instead of CENBRAP NR1",
      ],
    },
    {
      name: "REPLACED_SOURCE_SUBJECT_PATTERN",
      pattern: REPLACED_SOURCE_SUBJECT_PATTERN,
      match: [
        "replaced hero photo with a stock athlete",
        "different subject than base image",
      ],
      noMatch: ["faithful subject framing with same hero photo"],
    },
    {
      name: "DECORATIVE_ONLY_PATTERN",
      pattern: DECORATIVE_ONLY_PATTERN,
      match: [
        "background-only recolor without mechanism change",
        "glow-only tweak without a new visual mechanism",
      ],
      noMatch: ["new focal hierarchy with different proof presentation"],
    },
    {
      name: "STYLE_REFERENCE_CONTAMINATION_PATTERN",
      pattern: STYLE_REFERENCE_CONTAMINATION_PATTERN,
      match: [
        "athlete portraits and team uniforms from style reference",
        "factual claims copied from style reference",
        "style reference contamination in offer text",
      ],
      noMatch: ["palette and typography transfer only from style reference"],
    },
    {
      name: "OVERLOAD_NOTE_MARKERS",
      pattern: OVERLOAD_NOTE_MARKERS,
      match: ["more than three competing information zones"],
      noMatch: ["clear single dominant focal point"],
    },
    {
      name: "GENERIC_TEMPLATE_NOTE_MARKERS",
      pattern: GENERIC_TEMPLATE_NOTE_MARKERS,
      match: ["generic premium-tech neon template aesthetic"],
      noMatch: ["campaign-specific NR1 audit visual idea"],
    },
    {
      name: "MISSING_DOMINANT_IDEA_MARKERS",
      pattern: MISSING_DOMINANT_IDEA_MARKERS,
      match: ["no NR1 audit-specific visual idea"],
      noMatch: ["dominant NR1 compliance visual idea preserved"],
    },
  ];

  it.each(patternCases)("$name matches corpus exemplars", ({ pattern, match, noMatch }) => {
    for (const note of match) {
      expect(noteMatches(pattern, note), `expected match: ${note}`).toBe(true);
    }
    for (const note of noMatch) {
      expect(noteMatches(pattern, note), `expected no match: ${note}`).toBe(false);
    }
  });
});

describe("normalizeHardFailureCode", () => {
  it.each([
    ["copied_style_reference_facts", "style_reference_contamination"],
    ["format_campaign_drift", "campaign_identity_drift"],
    ["restyling_factual_contamination", "style_reference_contamination"],
    ["invented_factual_entity", "invented_factual_entity"],
    ["campaign_identity_drift", "campaign_identity_drift"],
  ] as const)("maps %s to %s", (input, expected) => {
    expect(normalizeHardFailureCode(input)).toBe(expected);
  });
});

describe("GATE-01 explicit promotion paths", () => {
  it.each([
    {
      name: "unauthorized_brand_or_ip",
      contract: artVariationContract,
      checklist: checklist({
        briefMatch: {
          status: "failed",
          note: "Unauthorized brand logo appears; brand not in allowed entities list.",
        },
      }),
      code: "unauthorized_brand_or_ip" as const,
    },
    {
      name: "missing_dominant_idea",
      contract: artVariationContract,
      checklist: checklist({
        creativeRisk: {
          status: "failed",
          note: "No NR1 audit-specific visual idea; decorative chrome only.",
        },
      }),
      code: "missing_dominant_idea" as const,
    },
  ])("promotes $name from failed checklist note", ({ contract, checklist: cl, code }) => {
    const result = classifyCreativeQualityGate({ contract, checklist: cl });
    expectHardCode(result, code);
  });
});

describe("CONTAMINATION_FAILURE_CODES", () => {
  it("includes GATE-01 factual and aesthetic contamination codes", () => {
    const expected: CreativeHardFailureCode[] = [
      "copied_style_reference_facts",
      "style_reference_contamination",
      "campaign_identity_drift",
      "invented_factual_entity",
      "replaced_source_subject",
      "unauthorized_brand_or_ip",
      "wrong_brand",
      "unsupported_offer",
    ];
    for (const code of expected) {
      expect(CONTAMINATION_FAILURE_CODES.has(code)).toBe(true);
    }
    expect(CONTAMINATION_FAILURE_CODES.has("cta_drift" as never)).toBe(false);
  });
});

describe("GATE-02 score override", () => {
  it("returns invalid when hardFailures exist with qualityScore 85", () => {
    const { hardFailures } = classifyCreativeQualityGate({
      contract: artVariationContract,
      checklist: checklist({
        creativeRisk: {
          status: "failed",
          note: "Generic premium-tech neon template aesthetic; no NR1 audit-specific visual idea.",
        },
      }),
    });
    expect(hardFailures.length).toBeGreaterThan(0);
    expect(
      deriveQualityVerdict({
        hardFailures,
        qualityScore: 85,
        checklist: checklist({
          creativeRisk: {
            status: "failed",
            note: "Generic premium-tech neon template aesthetic; no NR1 audit-specific visual idea.",
          },
        }),
      })
    ).toBe("invalid");
  });
});

describe("GATE-05 faithful format adaptation guard", () => {
  const faithfulFixture = CORPUS_POSITIVE_FIXTURES.find(
    (f) => f.id === "corpus-faithful-format-adaptation"
  )!;

  const formatAdaptationContract: CreativeContract = {
    generationMode: "format_adaptation",
    targetFormat: "4:5",
    client: "CENBRAP",
    product: "NR1 compliance toolkit",
    offer: "Conformidade NR1",
    constraints: "Preserve NR1 checklist narrative",
  };

  it("faithful corpus fixture produces no hard failures at qualityScore 85", () => {
    const qa = normalizeCreativeQaResult(faithfulFixture.rawQaModelOutput);
    const gate = classifyCreativeQualityGate({
      contract: faithfulFixture.contract,
      checklist: qa.checklist,
    });
    const verdict = deriveQualityVerdict({
      hardFailures: gate.hardFailures,
      qualityScore: 85,
      checklist: qa.checklist,
    });

    expect(gate.hardFailures).toHaveLength(0);
    expect(verdict).toBe("improvable");
    expect(
      assertDerivationApprovable({
        qualityVerdict: verdict,
        hardFailures: gate.hardFailures,
      }).ok
    ).toBe(true);
  });

  it("mild generic warning does not promote to generic_template_aesthetic", () => {
    const gate = classifyCreativeQualityGate({
      contract: formatAdaptationContract,
      checklist: checklist({
        creativeRisk: {
          status: "warning",
          note: "could be bolder; hook remains campaign-specific",
        },
      }),
    });

    expect(
      gate.hardFailures.some((f) => f.code === "generic_template_aesthetic")
    ).toBe(false);
  });

  it("faithful format note does not promote campaign_identity_drift", () => {
    const gate = classifyCreativeQualityGate({
      contract: formatAdaptationContract,
      checklist: checklist({
        formatFit: {
          status: "passed",
          note: "Faithful NR1 format adaptation in native 4:5 layout.",
        },
      }),
    });

    expect(
      gate.hardFailures.some((f) => f.code === "campaign_identity_drift")
    ).toBe(false);
  });

  it("creativeRisk simplification warning does not promote visual_overload", () => {
    const gate = classifyCreativeQualityGate({
      contract: formatAdaptationContract,
      checklist: checklist({
        creativeRisk: {
          status: "warning",
          note: "badge row could be simplified; hook and CTA remain dominant",
        },
      }),
    });

    expect(gate.hardFailures.some((f) => f.code === "visual_overload")).toBe(
      false
    );
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

  it("blocks when olharVerdict is sem_opiniao even without legacy hard failures", () => {
    const result = assertDerivationApprovable({
      qualityVerdict: "improvable",
      hardFailures: [],
      olharVerdict: {
        value: "sem_opiniao",
        axes: { figura: 1, gestalt: 1, voz: 1, convite: 1 },
        whatWorks: [],
        whatBlocks: ["Generic template feel"],
        directionNote: "Rebuild around a dominant idea.",
        source: "quality_gate",
        evaluatedAt: "2026-06-19T12:00:00.000Z",
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.olharVerdict?.value).toBe("sem_opiniao");
    }
  });

  it("blocks when olharVerdict is confusa even without legacy hard failures", () => {
    const result = assertDerivationApprovable({
      qualityVerdict: "improvable",
      hardFailures: [],
      olharVerdict: {
        value: "confusa",
        axes: { figura: 0, gestalt: 0, voz: 1, convite: 0 },
        whatWorks: [],
        whatBlocks: ["No focal point"],
        directionNote: "Composition lacks a dominant idea.",
        source: "quality_gate",
        evaluatedAt: "2026-06-19T12:00:00.000Z",
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.olharVerdict?.value).toBe("confusa");
    }
  });

  it("blocks when exportStatus is bloqueado even when legacy gate passes", () => {
    const result = assertDerivationApprovable({
      qualityVerdict: "acceptable",
      hardFailures: [],
      exportStatus: {
        value: "bloqueado",
        issues: [{ code: "wrong_brand", message: "Brand mismatch", severity: "blocker" }],
        setupIssues: [],
        evaluatedAt: "2026-06-19T12:00:00.000Z",
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.exportStatus?.value).toBe("bloqueado");
    }
  });

  it("allows improvable when olharVerdict is quase and export is ajuste_menor", () => {
    expect(
      assertDerivationApprovable({
        qualityVerdict: "improvable",
        hardFailures: [],
        olharVerdict: {
          value: "quase",
          axes: { figura: 2, gestalt: 2, voz: 2, convite: 2 },
          whatWorks: ["Clear figure"],
          whatBlocks: ["Invite could be stronger"],
          directionNote: "Minor polish before export.",
          source: "manual",
          evaluatedAt: "2026-06-19T12:00:00.000Z",
        },
        exportStatus: {
          value: "ajuste_menor",
          issues: [{ code: "cta_drift", message: "Minor CTA drift" }],
          setupIssues: [],
          evaluatedAt: "2026-06-19T12:00:00.000Z",
        },
      }).ok
    ).toBe(true);
  });

  it("legacy hard failures still block when dual verdict payloads are absent", () => {
    const result = assertDerivationApprovable({
      qualityVerdict: "improvable",
      hardFailures: [{ code: "cta_drift", message: "CTA drift" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.olharVerdict).toBeUndefined();
      expect(result.exportStatus).toBeUndefined();
    }
  });

  it("legacy rows without dual verdict keep current behavior", () => {
    expect(
      assertDerivationApprovable({
        qualityVerdict: "improvable",
        hardFailures: [],
      }).ok
    ).toBe(true);
  });
});
