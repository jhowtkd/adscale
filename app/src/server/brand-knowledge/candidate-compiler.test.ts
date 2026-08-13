import { describe, expect, it } from "vitest";

import {
  compileBrandKnowledgeCandidates,
  compileExplicitBrandKitCandidates,
} from "./candidate-compiler";

describe("brand knowledge candidate compiler", () => {
  it("creates reviewable claims from an extracted guide without publishing them", () => {
    const claims = compileBrandKnowledgeCandidates({
      evidence: {
        type: "brand_guide",
        id: "00000000-0000-4000-8000-000000000001",
        sourceHash: "a".repeat(64),
      },
      extracted: {
        colors: ["#d71f2b", "#D71F2B"],
        fonts: ["Poppins"],
        logoDescription: "Logo no canto inferior direito",
        toneOfVoice: "Direto",
        prohibitedElements: "gradientes; neon",
        requiredElements: "logo; faixa vermelha",
      },
      confidence: "medium",
    });

    expect(claims.map((claim) => claim.claimKey)).toEqual([
      "palette.colors",
      "typography.families",
      "logo.placement",
      "visual.required_elements",
      "visual.prohibited_elements",
    ]);
    expect(claims[0]).toMatchObject({
      value: ["#D71F2B"],
      authority: "inferred",
      confidence: "medium",
      status: "candidate",
      evidenceRefs: [expect.objectContaining({ type: "brand_guide" })],
    });
  });

  it("creates candidates from an approved training asset and preserves its typed source", () => {
    const claims = compileBrandKnowledgeCandidates({
      evidence: {
        type: "training_asset",
        id: "00000000-0000-4000-8000-000000000002",
        sourceHash: "b".repeat(64),
      },
      approvedAsset: {
        assetKey: "workspaces/ws/brand/logo.png",
        category: "logo",
        usageMode: "exact",
        rules: ["Manter respiro mínimo"],
        constraints: ["Não distorcer"],
        confidence: 0.9,
      },
    });

    expect(claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ claimKey: "logo.primary_asset", value: expect.objectContaining({ assetKey: expect.any(String) }) }),
      expect.objectContaining({ claimKey: "visual.required_elements", status: "candidate" }),
      expect.objectContaining({ claimKey: "visual.prohibited_elements", status: "candidate" }),
    ]));
  });

  it("turns human-edited Brand Kit fields into explicit future-version candidates", () => {
    const claims = compileExplicitBrandKitCandidates({
      profileId: "profile-1",
      brandColors: ["#d71f2b"],
      brandFonts: ["Poppins"],
      requiredElements: "logo; faixa vermelha",
      prohibitedElements: "neon",
    });

    expect(claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ claimKey: "palette.colors", authority: "explicit", confidence: "high", status: "candidate" }),
      expect.objectContaining({ claimKey: "typography.families", authority: "explicit" }),
      expect.objectContaining({ claimKey: "visual.required_elements", authority: "explicit" }),
      expect.objectContaining({ claimKey: "visual.prohibited_elements", authority: "explicit" }),
    ]));
    expect(claims[0]?.evidenceRefs[0]).toEqual(expect.objectContaining({ type: "brand_kit_field", id: "profile-1" }));
  });
});
