import { describe, expect, it } from "vitest";
import { classifyCreativeQualityGate } from "./creative-quality-gate";
import { restylingContractFixture } from "./prompt-builder.test-fixtures";

describe("restyling factual-base brand gate", () => {
  it("blocks a wordmark absent from the factual base", () => {
    const passed = { status: "passed" as const, note: "OK" };
    const result = classifyCreativeQualityGate({
      contract: restylingContractFixture(),
      checklist: {
        legibility: passed,
        ctaOffer: passed,
        informationPreservation: passed,
        briefMatch: {
          status: "failed",
          note: "Wordmark Instituto Educação+ ausente no FACTUAL BASE foi adicionado ao output.",
        },
        formatFit: passed,
        creativeRisk: passed,
        styleFidelity: passed,
      },
    });

    expect(result.hardFailures).toEqual([
      expect.objectContaining({ code: "wrong_brand", criterion: "briefMatch" }),
    ]);
  });

  it("blocks Portuguese QA wording for a logo missing from the base", () => {
    const passed = { status: "passed" as const, note: "OK" };
    const result = classifyCreativeQualityGate({
      contract: restylingContractFixture(),
      checklist: {
        legibility: passed,
        ctaOffer: passed,
        informationPreservation: passed,
        briefMatch: {
          status: "failed",
          note: "Logotipo Instituto Educação+ não existe no FACTUAL BASE.",
        },
        formatFit: passed,
        creativeRisk: passed,
        styleFidelity: passed,
      },
    });
    expect(result.hardFailures[0]?.code).toBe("wrong_brand");
  });
});
