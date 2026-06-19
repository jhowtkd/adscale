import { describe, expect, it } from "vitest";
import type { CreativeQaChecklist } from "../creative-qa";
import {
  buildPassagemOlharVerdict,
  deriveOlharAxesFromQaChecklist,
} from "./olhar-qa";

function makeChecklist(
  overrides: Partial<Record<keyof CreativeQaChecklist, { status: "passed" | "warning" | "failed"; note: string }>> = {}
): CreativeQaChecklist {
  const base = {
    legibility: { status: "passed" as const, note: "Headline reads at thumbnail scale." },
    ctaOffer: { status: "passed" as const, note: "CTA preserved." },
    informationPreservation: { status: "passed" as const, note: "Offer badge intact." },
    briefMatch: { status: "passed" as const, note: "Matches campaign voice." },
    formatFit: { status: "passed" as const, note: "Fits 4:5." },
    creativeRisk: { status: "passed" as const, note: "Distinct focal figure." },
  };

  return { ...base, ...overrides };
}

describe("deriveOlharAxesFromQaChecklist", () => {
  it("maps checklist statuses to Olhar axes conservatively", () => {
    const axes = deriveOlharAxesFromQaChecklist(
      makeChecklist({
        legibility: { status: "warning", note: "Small type." },
        creativeRisk: { status: "failed", note: "Generic template feel." },
        ctaOffer: { status: "failed", note: "CTA drift." },
      })
    );

    expect(axes.figura).toBe(2);
    expect(axes.voz).toBe(0);
    expect(axes.convite).toBe(0);
  });
});

describe("buildPassagemOlharVerdict", () => {
  it("maps art-direction hard failures to sem_opiniao or confusa", () => {
    const verdict = buildPassagemOlharVerdict({
      hardFailures: [{ code: "generic_template_aesthetic", message: "Template UI feel", criterion: "creativeRisk" }],
      qa: {
        checklist: makeChecklist({
          creativeRisk: { status: "failed", note: "Generic template feel." },
        }),
        issues: ["Generic template feel."],
        suggestions: ["Give the hero figure a clearer silhouette."],
      },
      evaluatedAt: "2026-06-19T12:00:00.000Z",
    });

    expect(verdict?.value).toBe("sem_opiniao");
    expect(verdict?.whatBlocks).toContain("Template UI feel");
    expect(verdict?.directionNote).toContain("silhouette");
  });

  it("returns null for export-only failures", () => {
    const verdict = buildPassagemOlharVerdict({
      hardFailures: [{ code: "cta_drift", message: "CTA changed", criterion: "ctaOffer" }],
      qa: {
        checklist: makeChecklist({
          ctaOffer: { status: "failed", note: "CTA changed." },
        }),
        issues: ["CTA changed."],
        suggestions: ["Restore exact CTA text."],
      },
      evaluatedAt: "2026-06-19T12:00:00.000Z",
    });

    expect(verdict).toBeNull();
  });

  it("keeps export failures out of art-direction whatBlocks", () => {
    const verdict = buildPassagemOlharVerdict({
      hardFailures: [
        { code: "cta_drift", message: "CTA changed", criterion: "ctaOffer" },
        { code: "visual_overload", message: "Too many badges", criterion: "creativeRisk" },
      ],
      qa: {
        checklist: makeChecklist({
          creativeRisk: { status: "failed", note: "Too many badges." },
          ctaOffer: { status: "failed", note: "CTA changed." },
        }),
        issues: ["Too many badges.", "CTA changed."],
        suggestions: ["Simplify the lower third."],
      },
      evaluatedAt: "2026-06-19T12:00:00.000Z",
    });

    expect(verdict?.value).toBe("confusa");
    expect(verdict?.whatBlocks).toEqual(["Too many badges"]);
    expect(verdict?.whatBlocks).not.toContain("CTA changed");
  });
});
