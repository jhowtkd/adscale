import { describe, expect, it } from "vitest";

import { compareBrandKnowledgeValues, findBrandKnowledgeConflicts } from "./comparators";
import type { BrandKnowledgeClaim } from "./contracts";

describe("brand knowledge typed comparators", () => {
  it("treats perceptually equivalent colors as compatible", () => {
    expect(compareBrandKnowledgeValues("palette.colors", ["#D71F2B"], ["#D71F2C"])).toBe("compatible");
    expect(compareBrandKnowledgeValues("palette.colors", ["#D71F2B"], ["#00FF00"])).toBe("conflict");
  });

  it("normalizes fonts and compares element lists as sets", () => {
    expect(compareBrandKnowledgeValues("typography.families", ["Poppins  ", "Inter"], ["inter", "poppins"])).toBe("compatible");
    expect(compareBrandKnowledgeValues("visual.required_elements", ["Logo", "Faixa vermelha"], [" faixa vermelha ", "logo"])).toBe("compatible");
    expect(compareBrandKnowledgeValues(
      "typography.headline",
      { family: " Poppins ", weight: 700, style: "normal" },
      { family: "poppins", weight: 700, style: "NORMAL" },
    )).toBe("compatible");
    expect(compareBrandKnowledgeValues(
      "typography.headline",
      { family: "Poppins", weight: 700, style: "normal" },
      { family: "Poppins", weight: 400, style: "normal" },
    )).toBe("conflict");
  });

  it("requires a human for unsafe text equivalence", () => {
    expect(compareBrandKnowledgeValues("logo.placement", "inferior direito", "canto direito inferior")).toBe("human_needed");
  });

  it("returns real conflicts with values, authority, confidence and evidence", () => {
    const claims = [
      claim("claim-1", ["#D71F2B"], "explicit", "high"),
      claim("claim-2", ["#00FF00"], "inferred", "medium"),
    ];
    const conflicts = findBrandKnowledgeConflicts(claims);
    expect(conflicts).toEqual([expect.objectContaining({
      claimKey: "palette.colors",
      claims: [
        expect.objectContaining({ id: "claim-1", authority: "explicit", confidence: "high", evidenceRefs: expect.any(Array) }),
        expect.objectContaining({ id: "claim-2", authority: "inferred", confidence: "medium", evidenceRefs: expect.any(Array) }),
      ],
    })]);
  });
});

function claim(
  id: string,
  value: unknown,
  authority: BrandKnowledgeClaim["authority"],
  confidence: BrandKnowledgeClaim["confidence"],
): BrandKnowledgeClaim {
  return {
    id,
    workspaceId: "workspace-1",
    clientProfileId: "profile-1",
    claimKey: "palette.colors",
    kind: "fact",
    value,
    scope: { level: "global" },
    authority,
    confidence,
    status: "approved",
    evidenceRefs: [{ type: "brand_guide", id: `evidence-${id}`, path: "colors", sourceHash: "a".repeat(64) }],
    extractorVersion: "v1",
    sourceHash: "a".repeat(64),
    reviewedAt: new Date(),
    reviewedByUserId: "reviewer-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
