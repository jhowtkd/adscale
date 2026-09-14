import { createHash } from "node:crypto";

import { canonicalJsonStringify } from "../creative-work/canonical-json";
import { findBrandKnowledgeConflicts } from "./comparators";
import { brandKnowledgeEvidenceKey, type BrandKnowledgeClaim } from "./contracts";

export interface PublishedBrandClaim {
  id: string;
  claimKey: BrandKnowledgeClaim["claimKey"];
  kind: BrandKnowledgeClaim["kind"];
  value: unknown;
  scope: BrandKnowledgeClaim["scope"];
  authority: BrandKnowledgeClaim["authority"];
  confidence: BrandKnowledgeClaim["confidence"];
  evidenceRefs: BrandKnowledgeClaim["evidenceRefs"];
  reviewedAt: string;
  reviewedByUserId: string;
}

export interface BrandKnowledgeVersionSnapshotV1 {
  schemaVersion: 1;
  profileId: string;
  compiledAt: string;
  claims: PublishedBrandClaim[];
  excluded: Array<{ claimId: string; reason: "not_approved" }>;
}

/**
 * Published snapshot of a calibration-validated candidate (plan 01, T4): the
 * frozen claims plus the frozen identity, the evidence hashes and the
 * calibration proof. The version hash is the candidate hash — proof metadata
 * never alters the validated content hash.
 */
export type BrandKnowledgeVersionSnapshotV2 = Omit<BrandKnowledgeVersionSnapshotV1, "schemaVersion"> & {
  schemaVersion: 2;
  identity: Omit<
    import("../creative-work/contracts").CreativeWorkIdentitySnapshot,
    "brandKnowledge"
  >;
  evidenceHashes: Record<string, string>;
  calibration: { sessionId: string; round: number; candidateHash: string };
};

export type BrandKnowledgeVersionSnapshot =
  | BrandKnowledgeVersionSnapshotV1
  | BrandKnowledgeVersionSnapshotV2;

export class BrandKnowledgeCompilationError extends Error {}

export function compileBrandKnowledgeVersion(input: {
  profileId: string;
  claims: readonly BrandKnowledgeClaim[];
  evidenceHashes: ReadonlyMap<string, string>;
  now?: () => Date;
}): { hash: string; snapshot: BrandKnowledgeVersionSnapshotV1 } {
  const approved = input.claims.filter((claim) => claim.status === "approved");
  if (approved.length === 0) throw new BrandKnowledgeCompilationError("No accepted claims to publish");
  for (const claim of approved) {
    if (!claim.reviewedAt || !claim.reviewedByUserId) throw new BrandKnowledgeCompilationError(`Claim ${claim.id} lacks human review`);
    for (const evidence of claim.evidenceRefs) {
      if (input.evidenceHashes.get(brandKnowledgeEvidenceKey(evidence)) !== evidence.sourceHash) {
        throw new BrandKnowledgeCompilationError(`Claim ${claim.id} evidence changed after review`);
      }
    }
  }
  const conflicts = findBrandKnowledgeConflicts(approved);
  if (conflicts.length > 0) throw new BrandKnowledgeCompilationError("Cannot publish with unresolved conflicts");

  const claims = approved.map((claim): PublishedBrandClaim => ({
    id: claim.id,
    claimKey: claim.claimKey,
    kind: claim.kind,
    value: claim.value,
    scope: claim.scope,
    authority: claim.authority,
    confidence: claim.confidence,
    evidenceRefs: [...claim.evidenceRefs].sort((a, b) => `${a.type}:${a.id}:${a.path}`.localeCompare(`${b.type}:${b.id}:${b.path}`)),
    reviewedAt: claim.reviewedAt!.toISOString(),
    reviewedByUserId: claim.reviewedByUserId!,
  })).sort((a, b) => `${a.claimKey}:${canonicalJsonStringify(a.scope)}:${a.id}`.localeCompare(`${b.claimKey}:${canonicalJsonStringify(b.scope)}:${b.id}`));
  const excluded = input.claims
    .filter((claim) => claim.status !== "approved")
    .map((claim) => ({ claimId: claim.id, reason: "not_approved" as const }))
    .sort((a, b) => a.claimId.localeCompare(b.claimId));
  const hash = createHash("sha256").update(canonicalJsonStringify({ schemaVersion: 1, profileId: input.profileId, claims, excluded })).digest("hex");
  return {
    hash,
    snapshot: {
      schemaVersion: 1,
      profileId: input.profileId,
      compiledAt: (input.now?.() ?? new Date()).toISOString(),
      claims,
      excluded,
    },
  };
}

/**
 * Publishes the EXACT validated candidate (plan 01, T4): no recompilation of
 * mutable claims — the frozen knowledge, identity and evidence hashes are
 * carried over, and the version hash is the candidate hash. The caller must
 * have validated activation (canActivate) and revalidated evidence inside the
 * same transaction before calling this pure projection.
 */
export function compileBrandKnowledgeVersionV2(input: {
  candidate: {
    hash: string;
    knowledge: BrandKnowledgeVersionSnapshotV1;
    identity: BrandKnowledgeVersionSnapshotV2["identity"];
    evidenceHashes: Record<string, string>;
  };
  calibration: { sessionId: string; round: number };
}): { hash: string; snapshot: BrandKnowledgeVersionSnapshotV2 } {
  const { schemaVersion: _ignored, ...knowledge } = input.candidate.knowledge;
  // Detached copy: later in-memory edits of the candidate (or of the mutable
  // claims it was frozen from) cannot mutate the published output.
  const frozen = JSON.parse(canonicalJsonStringify({
    knowledge,
    identity: input.candidate.identity,
    evidenceHashes: input.candidate.evidenceHashes,
  })) as {
    knowledge: Omit<BrandKnowledgeVersionSnapshotV1, "schemaVersion">;
    identity: BrandKnowledgeVersionSnapshotV2["identity"];
    evidenceHashes: Record<string, string>;
  };
  return {
    hash: input.candidate.hash,
    snapshot: {
      ...frozen.knowledge,
      schemaVersion: 2,
      identity: frozen.identity,
      evidenceHashes: frozen.evidenceHashes,
      calibration: {
        sessionId: input.calibration.sessionId,
        round: input.calibration.round,
        candidateHash: input.candidate.hash,
      },
    },
  };
}
