import { describe, expect, it } from "vitest";

import {
  brandKnowledgeClaimInputSchema,
  type BrandKnowledgeClaim,
} from "./contracts";

const base = {
  claimKey: "palette.colors",
  kind: "fact",
  value: ["#D71F2B"],
  scope: { level: "global" },
  authority: "inferred",
  confidence: "high",
  evidenceRefs: [{
    type: "brand_guide",
    id: "00000000-0000-4000-8000-000000000001",
    path: "extraction.colors",
    sourceHash: "a".repeat(64),
  }],
  extractorVersion: "brand-guide-v1",
  sourceHash: "a".repeat(64),
} as const;

describe("brand knowledge contracts", () => {
  it("accepts a typed candidate with evidence, authority and confidence", () => {
    expect(brandKnowledgeClaimInputSchema.parse(base)).toMatchObject(base);
  });

  it("rejects unknown keys, invalid values and claims without evidence", () => {
    expect(brandKnowledgeClaimInputSchema.safeParse({ ...base, claimKey: "custom.foo" }).success).toBe(false);
    expect(brandKnowledgeClaimInputSchema.safeParse({ ...base, value: ["red"] }).success).toBe(false);
    expect(brandKnowledgeClaimInputSchema.safeParse({ ...base, evidenceRefs: [] }).success).toBe(false);
  });

  it("validates a visual repertoire collection value strictly", () => {
    const repertoire = {
      version: 1,
      common: [{
        id: "11111111-1111-4111-8111-111111111111",
        dimension: "hierarchy",
        observation: "Título domina a leitura",
        application: "Dar ao título escala superior ao texto de apoio",
        avoid: "Competição de dois focos",
        evidenceIds: ["00000000-0000-4000-8000-000000000001"],
        confidence: "low",
      }],
      languages: [],
    };
    expect(brandKnowledgeClaimInputSchema.safeParse({
      ...base,
      claimKey: "visual.repertoire",
      kind: "rule",
      value: repertoire,
    }).success).toBe(true);
    expect(brandKnowledgeClaimInputSchema.safeParse({
      ...base,
      claimKey: "visual.repertoire",
      kind: "rule",
      value: { ...repertoire, common: [{ ...repertoire.common[0], evidenceIds: [] }] },
    }).success).toBe(false);
  });

  it("validates a people catalog value strictly", () => {
    const catalog = {
      version: 1,
      people: [{
        id: "11111111-1111-4111-8111-111111111111",
        name: "Ana",
        aliases: ["Aninha"],
        referenceIds: ["22222222-2222-4222-8222-222222222222"],
        primaryReferenceId: "22222222-2222-4222-8222-222222222222",
        preserve: ["formato do rosto"],
        referenceAdequacy: "confirmed",
      }],
    };
    expect(brandKnowledgeClaimInputSchema.safeParse({
      ...base,
      claimKey: "people.catalog",
      kind: "fact",
      value: catalog,
    }).success).toBe(true);
    expect(brandKnowledgeClaimInputSchema.safeParse({
      ...base,
      claimKey: "people.catalog",
      kind: "fact",
      value: { ...catalog, people: [{ ...catalog.people[0], referenceIds: [] }] },
    }).success).toBe(false);
  });

  it("keeps candidate, rejected and approved states distinct", () => {
    const claim = {
      ...brandKnowledgeClaimInputSchema.parse(base),
      id: "claim-1",
      workspaceId: "workspace-1",
      clientProfileId: "profile-1",
      status: "candidate",
      reviewedAt: null,
      reviewedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies BrandKnowledgeClaim;
    expect(claim.status).toBe("candidate");
  });
});
