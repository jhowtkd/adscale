import { describe, it, expect } from "vitest";
import {
  ART_DIRECTION_FAILURE_TO_VERDICT,
  ART_DIRECTION_FAILURE_REASONS,
  buildArtCritiqueFromFailures,
  resolveArtDirectionVerdictFromFailures,
  type ArtDirectionFailureReason,
} from "./art-direction-verdict";
import type { CreativeHardFailureCode } from "../creative-quality-gate";

describe("ART_DIRECTION_FAILURE_TO_VERDICT", () => {
  it("maps generic_template_aesthetic to sem_opiniao", () => {
    expect(ART_DIRECTION_FAILURE_TO_VERDICT.generic_template_aesthetic).toBe(
      "sem_opiniao"
    );
  });

  it("maps decorative_only_variation to sem_opiniao", () => {
    expect(ART_DIRECTION_FAILURE_TO_VERDICT.decorative_only_variation).toBe(
      "sem_opiniao"
    );
  });

  it("maps missing_dominant_idea to confusa", () => {
    expect(ART_DIRECTION_FAILURE_TO_VERDICT.missing_dominant_idea).toBe(
      "confusa"
    );
  });

  it("maps visual_overload to confusa", () => {
    expect(ART_DIRECTION_FAILURE_TO_VERDICT.visual_overload).toBe("confusa");
  });
});

describe("ART_DIRECTION_FAILURE_REASONS", () => {
  it("lists exactly the four art-direction visual failure codes", () => {
    expect(ART_DIRECTION_FAILURE_REASONS).toEqual([
      "generic_template_aesthetic",
      "decorative_only_variation",
      "missing_dominant_idea",
      "visual_overload",
    ] satisfies ArtDirectionFailureReason[]);
  });
});

describe("resolveArtDirectionVerdictFromFailures", () => {
  it("returns sem_opiniao for a single template aesthetic failure", () => {
    expect(
      resolveArtDirectionVerdictFromFailures([
        { code: "generic_template_aesthetic", message: "template feel" },
      ])
    ).toBe("sem_opiniao");
  });

  it("returns confusa for a single missing dominant idea failure", () => {
    expect(
      resolveArtDirectionVerdictFromFailures([
        { code: "missing_dominant_idea", message: "no focal point" },
      ])
    ).toBe("confusa");
  });

  it("returns null for export-only wrong_brand failure", () => {
    expect(
      resolveArtDirectionVerdictFromFailures([
        { code: "wrong_brand", message: "brand mismatch" },
      ])
    ).toBeNull();
  });

  it("returns null for export-only cta_drift failure", () => {
    expect(
      resolveArtDirectionVerdictFromFailures([
        { code: "cta_drift", message: "cta changed" },
      ])
    ).toBeNull();
  });

  it("chooses confusa over sem_opiniao when both art-direction failures present", () => {
    expect(
      resolveArtDirectionVerdictFromFailures([
        { code: "generic_template_aesthetic", message: "template" },
        { code: "visual_overload", message: "overload" },
      ])
    ).toBe("confusa");
  });

  it("ignores export failures when mixed with art-direction failures", () => {
    expect(
      resolveArtDirectionVerdictFromFailures([
        { code: "wrong_brand", message: "brand" },
        { code: "decorative_only_variation", message: "decorative" },
      ])
    ).toBe("sem_opiniao");
  });

  it("returns null for empty failure list", () => {
    expect(resolveArtDirectionVerdictFromFailures([])).toBeNull();
  });

  it("accepts string codes and normalizes them", () => {
    const codes: CreativeHardFailureCode[] = ["unsupported_offer", "invalid_format_layout"];
    expect(
      resolveArtDirectionVerdictFromFailures(
        codes.map((code) => ({ code, message: "export issue" }))
      )
    ).toBeNull();
  });
});

describe("buildArtCritiqueFromFailures (plan 04, T1)", () => {
  it("builds a weak critique with problem, intervention and evidence", () => {
    const critique = buildArtCritiqueFromFailures([
      { code: "visual_overload", message: "Muitos elementos competem." },
    ]);
    expect(critique).toMatchObject({
      verdict: "weak",
      problem: "Muitos elementos competem.",
      mode: "edit",
      confidence: "high",
    });
    expect(critique?.intervention.length).toBeGreaterThan(0);
    expect(critique?.evidence).toEqual(["Muitos elementos competem."]);
    expect(critique?.preserve).toContain("anatomy");
  });

  it("asks for another composition only when the structure is weak", () => {
    expect(buildArtCritiqueFromFailures([
      { code: "missing_dominant_idea", message: "Sem foco." },
    ])?.mode).toBe("recompose");
    expect(buildArtCritiqueFromFailures([
      { code: "decorative_only_variation", message: "Só decorativo." },
    ])?.mode).toBe("edit");
  });

  it("never invents a critique without an art-direction failure", () => {
    expect(buildArtCritiqueFromFailures([])).toBeNull();
    expect(buildArtCritiqueFromFailures([
      { code: "wrong_brand", message: "Marca errada." },
    ])).toBeNull();
    expect(buildArtCritiqueFromFailures([
      { code: "visual_overload", message: "   " },
    ])).toBeNull();
  });
});
