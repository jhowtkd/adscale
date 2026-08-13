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
