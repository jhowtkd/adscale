import { describe, it, expect } from "vitest";
import type { CreativeContract } from "@/server/ai/creative-contract";
import type { CreativeQaChecklist, CreativeQaCriterionResult } from "@/server/ai/creative-qa";
import {
  classifyCreativeQualityGate,
  deriveQualityVerdict,
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

interface MatrixCase {
  id: string;
  contract: CreativeContract;
  checklist: CreativeQaChecklist & { styleFidelity?: CreativeQaCriterionResult };
  expectedCode: CreativeHardFailureCode;
  noteSnippet: RegExp;
}

const TEST_02_MATRIX: MatrixCase[] = [
  {
    id: "Cantona / Manchester United invention",
    contract: artVariationContract,
    checklist: checklist({
      briefMatch: {
        status: "failed",
        note: "Output depicts Eric Cantona and Manchester United branding not in the campaign brief.",
      },
    }),
    expectedCode: "invented_factual_entity",
    noteSnippet: /Cantona|Manchester United/i,
  },
  {
    id: "replaced source subject",
    contract: artVariationContract,
    checklist: checklist({
      informationPreservation: {
        status: "failed",
        note: "Hero photo replaced with a different subject than the base creative.",
      },
    }),
    expectedCode: "replaced_source_subject",
    noteSnippet: /replaced.*subject/i,
  },
  {
    id: "unauthorized logo / brand",
    contract: artVariationContract,
    checklist: checklist({
      briefMatch: {
        status: "failed",
        note: "Unauthorized brand logo appears; brand not in allowed entities list.",
      },
    }),
    expectedCode: "unauthorized_brand_or_ip",
    noteSnippet: /unauthorized brand|allowed entities/i,
  },
];

interface AdvisoryCase {
  id: string;
  contract: CreativeContract;
  checklist: CreativeQaChecklist & { styleFidelity?: CreativeQaCriterionResult };
  noteSnippet: RegExp;
}

const ADVISORY_MATRIX: AdvisoryCase[] = [
  {
    id: "different campaign identity",
    contract: formatAdaptationContract,
    checklist: checklist({
      formatFit: {
        status: "failed",
        note: "Layout reads as a different campaign identity, not a faithful format adaptation.",
      },
    }),
    noteSnippet: /different campaign/i,
  },
  {
    id: "generic template aesthetic",
    contract: artVariationContract,
    checklist: checklist({
      creativeRisk: {
        status: "failed",
        note: "Generic premium-tech glassmorphism template with no campaign-specific justification.",
      },
    }),
    noteSnippet: /generic.*template|glassmorphism/i,
  },
  {
    id: "visual overload / excess modules",
    contract: artVariationContract,
    checklist: checklist({
      creativeRisk: {
        status: "failed",
        note: "More than three competing information zones with equal visual weight and a fourth module.",
      },
    }),
    noteSnippet: /more than three|competing/i,
  },
  {
    id: "decorative-only variation",
    contract: artVariationContract,
    checklist: checklist({
      creativeRisk: {
        status: "failed",
        note: "Decorative-only variation: background recolor without a new composition mechanism.",
      },
    }),
    noteSnippet: /decorative-only|background recolor/i,
  },
];

describe("TEST-02 gate failure matrix", () => {
  it.each(TEST_02_MATRIX)("$id → $expectedCode hard failure + invalid verdict", (matrixCase) => {
    const gate = classifyCreativeQualityGate({
      contract: matrixCase.contract,
      checklist: matrixCase.checklist,
    });

    const failure = gate.hardFailures.find((f) => f.code === matrixCase.expectedCode);
    expect(failure, `expected hard failure ${matrixCase.expectedCode}`).toBeTruthy();
    expect(matrixCase.noteSnippet.test(failure!.message)).toBe(true);

    const verdict = deriveQualityVerdict({
      hardFailures: gate.hardFailures,
      qualityScore: 85,
      checklist: matrixCase.checklist,
    });
    expect(verdict).toBe("invalid");
    expect(
      gate.polishSuggestions.some((s) => matrixCase.noteSnippet.test(s))
    ).toBe(false);
  });

  it.each(ADVISORY_MATRIX)(
    "$id stays advisory — polish suggestion, no hard failure",
    (advisoryCase) => {
      const gate = classifyCreativeQualityGate({
        contract: advisoryCase.contract,
        checklist: advisoryCase.checklist,
      });

      expect(gate.hardFailures).toEqual([]);
      expect(
        gate.polishSuggestions.some((s) => advisoryCase.noteSnippet.test(s))
      ).toBe(true);

      const verdict = deriveQualityVerdict({
        hardFailures: gate.hardFailures,
        qualityScore: 85,
        checklist: advisoryCase.checklist,
      });
      expect(verdict).toBe("improvable");
    }
  );

  it("restyling style contamination maps to style_reference_contamination", () => {
    const gate = classifyCreativeQualityGate({
      contract: restylingContract,
      checklist: checklist({
        styleFidelity: {
          status: "failed",
          note: "Unrelated discount copied from style reference, not base image.",
        },
      }),
    });
    expect(gate.hardFailures.some((f) => f.code === "style_reference_contamination")).toBe(
      true
    );
  });
});
