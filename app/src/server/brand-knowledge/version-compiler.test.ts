import { describe, expect, it } from "vitest";

import { compileBrandKnowledgeVersion } from "./version-compiler";
import { brandKnowledgeEvidenceKey, type BrandKnowledgeClaim } from "./contracts";

describe("brand knowledge version compiler", () => {
  it("publishes only accepted conflict-free claims with a stable canonical hash", () => {
    const claims = [claim("claim-b", "typography.families", ["Poppins"]), claim("claim-a", "palette.colors", ["#D71F2B"])];
    const first = compileBrandKnowledgeVersion({ profileId: "profile-1", claims, evidenceHashes: evidenceHashes(claims) });
    const second = compileBrandKnowledgeVersion({ profileId: "profile-1", claims: [...claims].reverse(), evidenceHashes: evidenceHashes(claims) });
    expect(first.hash).toBe(second.hash);
    expect(first.snapshot.claims.map((item) => item.id)).toEqual(["claim-a", "claim-b"]);
  });

  it("rejects pending, rejected and conflicting claims", () => {
    const pending = { ...claim("claim-1", "palette.colors", ["#D71F2B"]), status: "candidate" as const };
    expect(() => compileBrandKnowledgeVersion({ profileId: "profile-1", claims: [pending], evidenceHashes: evidenceHashes([pending]) })).toThrow("accepted claims");

    const conflicting = [claim("claim-1", "palette.colors", ["#D71F2B"]), claim("claim-2", "palette.colors", ["#00FF00"])];
    expect(() => compileBrandKnowledgeVersion({ profileId: "profile-1", claims: conflicting, evidenceHashes: evidenceHashes(conflicting) })).toThrow("unresolved conflicts");
  });

  it("rejects stale evidence after review", () => {
    const current = claim("claim-1", "palette.colors", ["#D71F2B"]);
    expect(() => compileBrandKnowledgeVersion({ profileId: "profile-1", claims: [current], evidenceHashes: new Map([[brandKnowledgeEvidenceKey(current.evidenceRefs[0]!), "b".repeat(64)]]) })).toThrow("evidence changed");
  });
});

function claim(id: string, claimKey: BrandKnowledgeClaim["claimKey"], value: unknown): BrandKnowledgeClaim {
  return {
    id,
    workspaceId: "workspace-1",
    clientProfileId: "profile-1",
    claimKey,
    kind: "fact",
    value,
    scope: { level: "global" },
    authority: "explicit",
    confidence: "high",
    status: "approved",
    evidenceRefs: [{ type: "brand_guide", id: `evidence-${id}`, path: "value", sourceHash: "a".repeat(64) }],
    extractorVersion: "v1",
    sourceHash: "a".repeat(64),
    reviewedAt: new Date("2026-08-13T12:00:00.000Z"),
    reviewedByUserId: "reviewer-1",
    createdAt: new Date("2026-08-13T10:00:00.000Z"),
    updatedAt: new Date("2026-08-13T12:00:00.000Z"),
  };
}

function evidenceHashes(claims: BrandKnowledgeClaim[]) {
  return new Map(claims.flatMap((item) => item.evidenceRefs.map((evidence) => [brandKnowledgeEvidenceKey(evidence), evidence.sourceHash])));
}
