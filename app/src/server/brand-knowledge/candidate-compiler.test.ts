import { describe, expect, it } from "vitest";

import {
  compileBrandKnowledgeCandidates,
  compileExplicitBrandKitCandidates,
  compilePeopleCatalogCandidate,
  compileRepertoireCandidate,
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

  it("compiles a synthesized repertoire as one global rule candidate with asset evidence", () => {
    const claim = compileRepertoireCandidate({
      repertoire: {
        version: 1,
        common: [{
          id: "11111111-1111-4111-8111-111111111111",
          dimension: "hierarchy",
          observation: "Título domina a leitura",
          application: "Dar ao título escala superior ao texto de apoio",
          avoid: "Competição de dois focos",
          evidenceIds: ["00000000-0000-4000-8000-000000000002"],
          confidence: "low",
        }],
        languages: [],
      },
      evidence: [{
        type: "training_asset",
        id: "00000000-0000-4000-8000-000000000002",
        path: "repertoire.common[0]",
        sourceHash: "b".repeat(64),
      }],
      sourceHash: "c".repeat(64),
    });
    expect(claim).toMatchObject({
      claimKey: "visual.repertoire",
      kind: "rule",
      status: "candidate",
      scope: { level: "global" },
      authority: "inferred",
      extractorVersion: "visual-repertoire-v1",
    });
  });

  it("rejects a repertoire candidate whose value is not a valid collection", () => {
    expect(() => compileRepertoireCandidate({
      repertoire: { version: 1, common: [], languages: [{ id: "x", name: "", contexts: [], rules: [] }] },
      evidence: [],
      sourceHash: "c".repeat(64),
    })).toThrow();
  });

  it("compiles the reviewed people catalog as one human fact candidate", () => {
    const claim = compilePeopleCatalogCandidate({
      catalog: {
        version: 1,
        people: [{
          id: "11111111-1111-4111-8111-111111111111",
          name: "Ana",
          aliases: [],
          referenceIds: ["22222222-2222-4222-8222-222222222222"],
          primaryReferenceId: "22222222-2222-4222-8222-222222222222",
          preserve: ["formato do rosto"],
          referenceAdequacy: "confirmed",
        }],
      },
      evidence: [{
        type: "training_asset",
        id: "22222222-2222-4222-8222-222222222222",
        path: "people.ana",
        sourceHash: "b".repeat(64),
      }],
      sourceHash: "c".repeat(64),
    });
    expect(claim).toMatchObject({
      claimKey: "people.catalog",
      kind: "fact",
      status: "candidate",
      scope: { level: "global" },
      authority: "human",
      extractorVersion: "people-catalog-v1",
    });
  });

  it("rejects a people catalog candidate whose primary photo is outside the set", () => {
    expect(() => compilePeopleCatalogCandidate({
      catalog: {
        version: 1,
        people: [{
          id: "11111111-1111-4111-8111-111111111111",
          name: "Ana",
          aliases: [],
          referenceIds: ["22222222-2222-4222-8222-222222222222"],
          primaryReferenceId: "33333333-3333-4333-8333-333333333333",
          preserve: [],
          referenceAdequacy: "confirmed",
        }],
      },
      evidence: [],
      sourceHash: "c".repeat(64),
    })).toThrow();
  });
});
