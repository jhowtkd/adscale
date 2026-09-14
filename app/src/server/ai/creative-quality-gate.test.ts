import { describe, expect, it } from "vitest";
import {
  buildCreativeWorkQualityPayload,
  classifyCreativeQualityGate,
  deriveCreativeWorkObjectiveVerdict,
  inconclusivePersonFidelity,
  personReferenceHash,
} from "./creative-quality-gate";
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

describe("person identity mismatch verdict (plan 03, T3)", () => {
  it("fails on a confirmed person_identity_mismatch like any objective code", () => {
    const derived = deriveCreativeWorkObjectiveVerdict({
      deterministicCodes: [],
      findings: [{ code: "person_identity_mismatch", status: "confirmed", note: "Pessoa Ana divergiu." }],
      evaluatorStatus: "completed",
    });
    expect(derived).toEqual({ verdict: "fail", objectiveCodes: ["person_identity_mismatch"] });
  });

  it("keeps the person code out of the shared vision evaluator enum", async () => {
    const { CREATIVE_WORK_VISION_FAILURE_CODES } = await import("./creative-qa");
    expect(CREATIVE_WORK_VISION_FAILURE_CODES).not.toContain("person_identity_mismatch");
  });
});

describe("art critique payload field (plan 04, T1)", () => {
  const baseInput = {
    deterministicFindings: [],
    visionFindings: [],
    evaluatorStatus: "completed" as const,
    subjective: null,
    checks: {
      file: { ok: true, width: 1080, height: 1080, format: "png", bytes: 10 },
      dimensions: { ok: true, expected: { width: 1080, height: 1080 }, actual: { width: 1080, height: 1080 } },
      references: { ok: true, missingRequired: [] },
    },
    attempt: 1,
  };

  it("persists a validated critique and keeps schema version 1", () => {
    const payload = buildCreativeWorkQualityPayload({
      ...baseInput,
      artCritique: {
        verdict: "weak", problem: "Foco dividido", intervention: "Unificar foco",
        mode: "edit", preserve: ["facts"], evidence: ["Dois títulos"], confidence: "high",
      },
    });
    expect(payload.schemaVersion).toBe(1);
    expect(payload.artCritique).toMatchObject({ verdict: "weak", mode: "edit" });
  });

  it("drops an invalid critique instead of persisting it raw", () => {
    const payload = buildCreativeWorkQualityPayload({
      ...baseInput,
      artCritique: { verdict: "weak", problem: "", intervention: "", mode: "edit", preserve: [], evidence: [], confidence: "high" },
    });
    expect(payload).not.toHaveProperty("artCritique");
    expect(buildCreativeWorkQualityPayload(baseInput)).not.toHaveProperty("artCritique");
  });
});
