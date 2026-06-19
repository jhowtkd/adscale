import { describe, expect, it } from "vitest";
import {
  buildOlharVerdictFromFailures,
  normalizeExportStatusPayload,
  normalizeOlharVerdictPayload,
  validateExportStatusPayload,
  validateOlharAxisScores,
  validateOlharVerdictPayload,
  type OlharAxisScores,
} from "./dual-verdict";

const validAxes: OlharAxisScores = {
  figura: 2,
  gestalt: 1,
  voz: 3,
  convite: 0,
};

const validOlharPayload = {
  value: "quase" as const,
  axes: validAxes,
  whatWorks: ["Strong focal figure"],
  whatBlocks: ["CTA competes with headline"],
  directionNote: "Simplify the lower third before export.",
  source: "manual" as const,
  evaluatedAt: "2026-06-19T12:00:00.000Z",
};

describe("validateOlharAxisScores", () => {
  it("accepts all four axes scored 0-3", () => {
    expect(validateOlharAxisScores(validAxes)).toEqual({
      ok: true,
      value: validAxes,
    });
  });

  it("rejects scores outside 0-3", () => {
    const result = validateOlharAxisScores({
      ...validAxes,
      figura: 4,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("figura must be an integer between 0 and 3");
    }
  });

  it("rejects missing axes", () => {
    const result = validateOlharAxisScores({
      figura: 1,
      gestalt: 2,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("voz"))).toBe(true);
      expect(result.errors.some((error) => error.includes("convite"))).toBe(true);
    }
  });
});

describe("validateOlharVerdictPayload", () => {
  it("accepts a valid payload", () => {
    expect(validateOlharVerdictPayload(validOlharPayload).ok).toBe(true);
  });

  it("requires directionNote and evaluatedAt", () => {
    const missingDirection = validateOlharVerdictPayload({
      ...validOlharPayload,
      directionNote: "   ",
    });
    expect(missingDirection.ok).toBe(false);

    const missingEvaluatedAt = validateOlharVerdictPayload({
      ...validOlharPayload,
      evaluatedAt: "",
    });
    expect(missingEvaluatedAt.ok).toBe(false);
  });

  it("rejects malformed verdict values", () => {
    const result = validateOlharVerdictPayload({
      ...validOlharPayload,
      value: "aprovada",
    });
    expect(result.ok).toBe(false);
  });
});

describe("validateExportStatusPayload", () => {
  it("accepts a valid export status payload", () => {
    const result = validateExportStatusPayload({
      value: "ajuste_menor",
      issues: [{ code: "cta_drift", message: "CTA wording shifted" }],
      setupIssues: [],
      evaluatedAt: "2026-06-19T12:00:00.000Z",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects malformed export status values", () => {
    const result = validateExportStatusPayload({
      value: "reprovado",
      issues: [],
      setupIssues: [],
      evaluatedAt: "2026-06-19T12:00:00.000Z",
    });
    expect(result.ok).toBe(false);
  });
});

describe("normalizeOlharVerdictPayload", () => {
  it("returns null for malformed payloads", () => {
    expect(normalizeOlharVerdictPayload({ value: "pronta" })).toBeNull();
  });

  it("returns a validated payload", () => {
    expect(normalizeOlharVerdictPayload(validOlharPayload)).toEqual(
      validOlharPayload
    );
  });
});

describe("normalizeExportStatusPayload", () => {
  it("returns null for malformed payloads", () => {
    expect(normalizeExportStatusPayload({ value: "ok" })).toBeNull();
  });
});

describe("buildOlharVerdictFromFailures", () => {
  const baseInput = {
    axes: validAxes,
    directionNote: "Art direction needs a clearer dominant idea.",
    evaluatedAt: "2026-06-19T12:00:00.000Z",
  };

  it("maps visual hard failures to sem_opiniao or confusa", () => {
    expect(
      buildOlharVerdictFromFailures({
        ...baseInput,
        failures: [{ code: "generic_template_aesthetic", message: "template" }],
      })?.value
    ).toBe("sem_opiniao");

    expect(
      buildOlharVerdictFromFailures({
        ...baseInput,
        failures: [{ code: "missing_dominant_idea", message: "no focal point" }],
      })?.value
    ).toBe("confusa");
  });

  it("does not infer quase or pronta from export-only failures", () => {
    expect(
      buildOlharVerdictFromFailures({
        ...baseInput,
        failures: [{ code: "cta_drift", message: "cta changed" }],
      })
    ).toBeNull();
  });

  it("does not infer quase or pronta from empty failures", () => {
    expect(
      buildOlharVerdictFromFailures({
        ...baseInput,
        failures: [],
      })
    ).toBeNull();
  });

  it("chooses confusa over sem_opiniao when both art-direction failures are present", () => {
    expect(
      buildOlharVerdictFromFailures({
        ...baseInput,
        failures: [
          { code: "generic_template_aesthetic", message: "template" },
          { code: "visual_overload", message: "overload" },
        ],
      })?.value
    ).toBe("confusa");
  });
});
