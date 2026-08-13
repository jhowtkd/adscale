import { describe, expect, it } from "vitest";

import { brandKnowledgeEvidenceKey } from "../brand-knowledge/contracts";
import { compileBrandKnowledgeVersion } from "../brand-knowledge/version-compiler";

describe("brand knowledge persistence invariants", () => {
  it("keys evidence by type, owner and path so one profile field cannot mask another", () => {
    expect(brandKnowledgeEvidenceKey({ type: "brand_kit_field", id: "profile-1", path: "brandColors" }))
      .not.toBe(brandKnowledgeEvidenceKey({ type: "brand_kit_field", id: "profile-1", path: "brandFonts" }));
  });

  it("keeps publication output immutable from later candidate edits", () => {
    const claim = {
      id: "claim-1",
      workspaceId: "workspace-1",
      clientProfileId: "profile-1",
      claimKey: "palette.colors" as const,
      kind: "fact" as const,
      value: ["#D71F2B"],
      scope: { level: "global" as const },
      authority: "explicit" as const,
      confidence: "high" as const,
      status: "approved" as const,
      evidenceRefs: [{ type: "brand_guide" as const, id: "guide-1", path: "colors", sourceHash: "a".repeat(64) }],
      extractorVersion: "v1",
      sourceHash: "a".repeat(64),
      reviewedAt: new Date("2026-08-13T12:00:00.000Z"),
      reviewedByUserId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const evidence = new Map([[brandKnowledgeEvidenceKey(claim.evidenceRefs[0]), "a".repeat(64)]]);
    const published = compileBrandKnowledgeVersion({ profileId: "profile-1", claims: [claim], evidenceHashes: evidence });
    claim.value = ["#000000"];
    expect(published.snapshot.claims[0]?.value).toEqual(["#D71F2B"]);
  });
});
