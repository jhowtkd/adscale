import { and, desc, eq, inArray, max, ne, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import { db } from "../db";
import {
  brandKnowledgeClaims,
  brandKnowledgeVersions,
  brandTrainingSessions,
  clientProfiles,
  clientReferences,
  creativeWorkOutputs,
  workspaceAssets,
  workspaceMembers,
} from "../db/schema";
import { canonicalJsonStringify } from "../creative-work/canonical-json";
import {
  brandKnowledgeEvidenceKey,
  parseBrandKnowledgeClaimInput,
  type BrandKnowledgeClaim,
  type BrandKnowledgeClaimInput,
  type BrandKnowledgeEvidenceRef,
} from "../brand-knowledge/contracts";
import { findBrandKnowledgeConflicts } from "../brand-knowledge/comparators";
import { compileBrandKnowledgeVersionV2 } from "../brand-knowledge/version-compiler";
import {
  assessCalibrationSlot,
  canActivate,
  freezeCandidate,
  type Candidate,
} from "../brand-training/calibration";
import { REPERTOIRE_EXTRACTOR_VERSION } from "../brand-training/synthesize-repertoire";
import {
  validateRepertoireEvidence,
  visualRepertoireSchema,
  type VisualRepertoire,
} from "../brand-training/visual-repertoire";

export class BrandKnowledgeEvidenceError extends Error {}

export class BrandKnowledgeCalibrationError extends Error {
  readonly code: "calibration_required" | "calibration_stale";

  constructor(code: "calibration_required" | "calibration_stale", message?: string) {
    super(message ?? code);
    this.name = "BrandKnowledgeCalibrationError";
    this.code = code;
  }
}

/** A repertoire review blocked by an unresolved claim conflict: nothing is saved. */
export class BrandKnowledgeConflictError extends Error {
  constructor(message?: string) {
    super(message ?? "conflict");
    this.name = "BrandKnowledgeConflictError";
  }
}

type Executor = Pick<typeof db, "select">;

const hash = (value: unknown) => createHash("sha256").update(canonicalJsonStringify(value)).digest("hex");

async function assertProfile(executor: Executor, workspaceId: string, clientProfileId: string) {
  const [profile] = await executor.select().from(clientProfiles).where(and(
    eq(clientProfiles.workspaceId, workspaceId),
    eq(clientProfiles.id, clientProfileId),
  )).limit(1);
  if (!profile) throw new BrandKnowledgeEvidenceError("Client profile not found");
  return profile;
}

export async function resolveEvidenceHashes(
  executor: Executor,
  workspaceId: string,
  clientProfileId: string,
  claims: readonly Pick<BrandKnowledgeClaim, "value" | "evidenceRefs">[],
): Promise<Map<string, string>> {
  const profile = await assertProfile(executor, workspaceId, clientProfileId);
  const references = claims.flatMap((claim) => claim.evidenceRefs).filter((item) => item.type === "brand_guide" || item.type === "training_asset");
  const referenceIds = [...new Set(references.map((item) => item.id))];
  const rows = referenceIds.length > 0
    ? await executor.select().from(clientReferences).where(and(
        eq(clientReferences.workspaceId, workspaceId),
        eq(clientReferences.clientProfileId, clientProfileId),
        inArray(clientReferences.id, referenceIds),
      ))
    : [];
  const assetKeys = [...new Set(rows.map((row) => row.assetKey))];
  const assets = assetKeys.length > 0
    ? await executor.select().from(workspaceAssets).where(and(
        eq(workspaceAssets.workspaceId, workspaceId),
        inArray(workspaceAssets.key, assetKeys),
      ))
    : [];
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const assetsByKey = new Map(assets.map((asset) => [asset.key, asset]));
  const resolved = new Map<string, string>();

  for (const claim of claims) {
    for (const evidence of claim.evidenceRefs) {
      if (evidence.type === "brand_guide" || evidence.type === "training_asset") {
        const reference = rowsById.get(evidence.id);
        const asset = reference ? assetsByKey.get(reference.assetKey) : null;
        const metadata = asset?.metadata as { sha256?: unknown } | null;
        const currentHash = typeof metadata?.sha256 === "string" ? metadata.sha256 : null;
        if (!reference || !currentHash) throw new BrandKnowledgeEvidenceError(`Evidence ${evidence.id} is not resolvable in this profile`);
        if (evidence.type === "brand_guide" && reference.kind !== "brand_guide") throw new BrandKnowledgeEvidenceError(`Evidence ${evidence.id} is not a brand guide`);
        if (evidence.type === "training_asset" && reference.reviewStatus !== "approved") throw new BrandKnowledgeEvidenceError(`Evidence ${evidence.id} is not an approved training asset`);
        resolved.set(brandKnowledgeEvidenceKey(evidence), currentHash);
      } else if (evidence.type === "brand_kit_field") {
        if (evidence.id !== clientProfileId || !(evidence.path in profile)) throw new BrandKnowledgeEvidenceError(`Brand Kit evidence ${evidence.path} is not resolvable`);
        resolved.set(brandKnowledgeEvidenceKey(evidence), hash(profile[evidence.path as keyof typeof profile]));
      } else {
        const [member] = await executor.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, evidence.id),
        )).limit(1);
        if (!member) throw new BrandKnowledgeEvidenceError(`Human evidence ${evidence.id} is outside this workspace`);
        resolved.set(brandKnowledgeEvidenceKey(evidence), hash({ value: claim.value, actorId: evidence.id }));
      }
    }
  }
  return resolved;
}

function assertEvidenceCurrent(claims: readonly Pick<BrandKnowledgeClaim, "value" | "evidenceRefs">[], hashes: ReadonlyMap<string, string>) {
  for (const claim of claims) for (const evidence of claim.evidenceRefs) {
    if (hashes.get(brandKnowledgeEvidenceKey(evidence)) !== evidence.sourceHash) throw new BrandKnowledgeEvidenceError(`Evidence ${evidence.id} changed or is stale`);
  }
}

export async function createBrandKnowledgeCandidates(
  workspaceId: string,
  clientProfileId: string,
  values: readonly BrandKnowledgeClaimInput[],
): Promise<BrandKnowledgeClaim[]> {
  if (values.length === 0) return [];
  const claims = values.map(parseBrandKnowledgeClaimInput);
  const hashes = await resolveEvidenceHashes(db, workspaceId, clientProfileId, claims.map((claim) => ({ ...claim, value: claim.value })));
  assertEvidenceCurrent(claims.map((claim) => ({ ...claim, value: claim.value })), hashes);
  await db.insert(brandKnowledgeClaims).values(claims.map((claim) => ({
    workspaceId,
    clientProfileId,
    ...claim,
    status: "candidate" as const,
  }))).onConflictDoNothing();
  return listBrandKnowledgeClaims(workspaceId, clientProfileId);
}

export async function listBrandKnowledgeClaims(workspaceId: string, clientProfileId: string): Promise<BrandKnowledgeClaim[]> {
  await assertProfile(db, workspaceId, clientProfileId);
  return db.select().from(brandKnowledgeClaims).where(and(
    eq(brandKnowledgeClaims.workspaceId, workspaceId),
    eq(brandKnowledgeClaims.clientProfileId, clientProfileId),
  )).orderBy(desc(brandKnowledgeClaims.createdAt)) as unknown as Promise<BrandKnowledgeClaim[]>;
}

export async function reviewBrandKnowledgeClaim(input: {
  workspaceId: string;
  clientProfileId: string;
  claimId: string;
  userId: string;
  status: "approved" | "rejected";
  value?: unknown;
  alternatives?: Array<{ claimId: string; value: unknown }>;
}): Promise<BrandKnowledgeClaim | null> {
  const [existing] = await db.select().from(brandKnowledgeClaims).where(and(
    eq(brandKnowledgeClaims.workspaceId, input.workspaceId),
    eq(brandKnowledgeClaims.clientProfileId, input.clientProfileId),
    eq(brandKnowledgeClaims.id, input.claimId),
  )).limit(1);
  if (!existing) return null;
  const value = input.value === undefined ? existing.value : input.value;
  parseBrandKnowledgeClaimInput({ ...existing, value });
  const humanSourceHash = hash({ value, actorId: input.userId });
  const evidenceRefs = input.value === undefined
    ? existing.evidenceRefs
    : [...existing.evidenceRefs, { type: "human" as const, id: input.userId, path: "review.value", sourceHash: humanSourceHash }];
  const now = new Date();
  const [updated] = await db.update(brandKnowledgeClaims).set({
    value,
    status: input.status,
    ...(input.value === undefined ? {} : { authority: "human" as const, confidence: "high" as const, sourceHash: humanSourceHash }),
    evidenceRefs,
    reviewDecision: {
      action: input.status,
      alternatives: input.alternatives ?? [],
      evidenceRefs,
    },
    reviewedAt: now,
    reviewedByUserId: input.userId,
    updatedAt: now,
  }).where(and(
    eq(brandKnowledgeClaims.workspaceId, input.workspaceId),
    eq(brandKnowledgeClaims.clientProfileId, input.clientProfileId),
    eq(brandKnowledgeClaims.id, input.claimId),
  )).returning();
  return updated as unknown as BrandKnowledgeClaim | null;
}

/**
 * Pure candidate patch for an approved repertoire review (plan 02, T2): the
 * reviewed collection replaces every prior `visual.repertoire` published
 * claim, orphaned repertoire evidence keys are pruned, and the candidate hash
 * is recomputed. Rounds keep their own frozen candidates — a new candidate
 * never rewrites a round under test.
 */
export function buildRepertoireReviewedCandidate(input: {
  candidate: Candidate;
  claim: {
    id: string;
    value: VisualRepertoire;
    evidenceRefs: BrandKnowledgeClaim["evidenceRefs"];
  };
  reviewedByUserId: string;
  reviewedAt: string;
}): Candidate {
  const remaining = input.candidate.knowledge.claims.filter(
    (claim) => claim.claimKey !== "visual.repertoire",
  );
  const published = {
    id: input.claim.id,
    claimKey: "visual.repertoire" as const,
    kind: "rule" as const,
    value: input.claim.value,
    scope: { level: "global" as const },
    authority: "human" as const,
    confidence: "high" as const,
    evidenceRefs: input.claim.evidenceRefs,
    reviewedAt: input.reviewedAt,
    reviewedByUserId: input.reviewedByUserId,
  };
  const knowledge = {
    ...input.candidate.knowledge,
    claims: [...remaining, published],
  };
  const liveKeys = new Set(
    knowledge.claims.flatMap((claim) =>
      claim.evidenceRefs.map((evidence) => brandKnowledgeEvidenceKey(evidence)),
    ),
  );
  const evidenceHashes: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.candidate.evidenceHashes)) {
    // Identity asset keys (`asset:...`) are not claim evidence — they always
    // survive. Repertoire evidence keys survive only while referenced.
    if (key.startsWith("asset:") || liveKeys.has(key)) {
      evidenceHashes[key] = value;
    }
  }
  for (const evidence of input.claim.evidenceRefs) {
    evidenceHashes[brandKnowledgeEvidenceKey(evidence)] = evidence.sourceHash;
  }
  return freezeCandidate({
    knowledge,
    identity: input.candidate.identity,
    evidenceHashes,
  });
}

/**
 * Review the trained visual repertoire as one set (plan 02, T2): validates
 * the operator-edited collection, checks conflicts, approves it while
 * explicitly superseding the prior approved collection, and replaces the
 * session candidate — all in a single transaction. Non-repertoire claims are
 * untouched: nothing unreviewed is approved silently.
 */
export async function reviewRepertoireCollection(input: {
  workspaceId: string;
  clientProfileId: string;
  sessionId: string;
  expectedRevision: number;
  value: unknown;
  userId: string;
}): Promise<{ claim: BrandKnowledgeClaim; revision: number }> {
  const repertoire = visualRepertoireSchema.parse(input.value);
  const evidenceIds = [...new Set(
    [...repertoire.common, ...repertoire.languages.flatMap((language) => language.rules)]
      .flatMap((rule) => rule.evidenceIds),
  )];
  if (evidenceIds.length === 0) {
    throw new BrandKnowledgeEvidenceError("Repertoire has no evidence-backed rules");
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.workspaceId}:${input.clientProfileId}`}))`);
    await assertProfile(tx, input.workspaceId, input.clientProfileId);
    const [session] = await tx.select().from(brandTrainingSessions).where(and(
      eq(brandTrainingSessions.id, input.sessionId),
      eq(brandTrainingSessions.workspaceId, input.workspaceId),
      eq(brandTrainingSessions.clientProfileId, input.clientProfileId),
    )).limit(1);
    if (!session) throw new BrandKnowledgeCalibrationError("calibration_required", "Calibration session not found");
    if (session.status === "activated" || session.status === "archived") {
      throw new BrandKnowledgeCalibrationError("calibration_stale", "Session is closed");
    }
    if (session.status === "calibrating") {
      throw new BrandKnowledgeCalibrationError("calibration_stale", "Cannot replace the candidate while a round is running");
    }
    if (session.revision !== input.expectedRevision) {
      throw new BrandKnowledgeCalibrationError("calibration_stale", "Session revision changed");
    }
    // Evidence must be approved training assets of this profile, at their
    // current hashes — stale or foreign references fail the whole set.
    const provisional: BrandKnowledgeEvidenceRef[] = evidenceIds.map((id) => ({
      type: "training_asset",
      id,
      path: "repertoire.evidence",
      sourceHash: "0".repeat(64),
    }));
    let hashes: Map<string, string>;
    try {
      hashes = await resolveEvidenceHashes(tx, input.workspaceId, input.clientProfileId, [
        { value: repertoire, evidenceRefs: provisional },
      ]);
    } catch (error) {
      if (error instanceof BrandKnowledgeEvidenceError) throw error;
      throw new BrandKnowledgeEvidenceError(
        error instanceof Error ? error.message : "Repertoire evidence is not resolvable",
      );
    }
    const resolvedIds = new Set(evidenceIds);
    try {
      validateRepertoireEvidence(repertoire, resolvedIds);
    } catch {
      throw new BrandKnowledgeEvidenceError("Repertoire evidence is not an approved training asset");
    }
    const evidenceRefs: BrandKnowledgeEvidenceRef[] = provisional.map((evidence) => ({
      ...evidence,
      sourceHash: hashes.get(brandKnowledgeEvidenceKey(evidence))!,
    }));
    // Conflicts block the set: the patched approvals (prior repertoire
    // collection excluded) must be conflict-free before anything is written.
    const existing = await tx.select().from(brandKnowledgeClaims).where(and(
      eq(brandKnowledgeClaims.workspaceId, input.workspaceId),
      eq(brandKnowledgeClaims.clientProfileId, input.clientProfileId),
    )) as unknown as BrandKnowledgeClaim[];
    const patched = [
      ...existing.filter((claim) =>
        claim.status === "approved" && claim.claimKey !== "visual.repertoire",
      ),
      {
        id: "pending-repertoire-review",
        claimKey: "visual.repertoire",
        value: repertoire,
        scope: { level: "global" },
        authority: "human",
        confidence: "high",
        status: "approved",
        evidenceRefs,
      } as BrandKnowledgeClaim,
    ];
    if (findBrandKnowledgeConflicts(patched).length > 0) {
      throw new BrandKnowledgeConflictError("Repertoire review conflicts with an approved claim");
    }
    const humanSourceHash = hash({ value: repertoire, actorId: input.userId });
    const parsed = parseBrandKnowledgeClaimInput({
      claimKey: "visual.repertoire",
      kind: "rule",
      value: repertoire,
      scope: { level: "global" },
      authority: "human",
      confidence: "high",
      evidenceRefs,
      extractorVersion: REPERTOIRE_EXTRACTOR_VERSION,
      sourceHash: humanSourceHash,
    });
    const now = new Date();
    const [inserted] = await tx.insert(brandKnowledgeClaims).values({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      ...parsed,
      status: "approved",
      reviewedAt: now,
      reviewedByUserId: input.userId,
    }).returning();
    const claim = inserted as unknown as BrandKnowledgeClaim;
    await tx.update(brandKnowledgeClaims).set({ status: "superseded", updatedAt: now }).where(and(
      eq(brandKnowledgeClaims.workspaceId, input.workspaceId),
      eq(brandKnowledgeClaims.clientProfileId, input.clientProfileId),
      eq(brandKnowledgeClaims.claimKey, "visual.repertoire"),
      eq(brandKnowledgeClaims.status, "approved"),
      ne(brandKnowledgeClaims.id, claim.id),
    ));
    const candidate = buildRepertoireReviewedCandidate({
      candidate: session.candidate as Candidate,
      claim: { id: claim.id, value: repertoire, evidenceRefs },
      reviewedByUserId: input.userId,
      reviewedAt: now.toISOString(),
    });
    // CAS on the session revision, like publish: a concurrent writer wins the
    // race and this update touches no row.
    await tx.update(brandTrainingSessions).set({
      candidate,
      revision: session.revision + 1,
      updatedAt: now,
    }).where(and(
      eq(brandTrainingSessions.id, session.id),
      eq(brandTrainingSessions.revision, session.revision),
    ));
    return { claim, revision: session.revision + 1 };
  });
}

export async function publishBrandKnowledgeVersion(input: {
  workspaceId: string;
  clientProfileId: string;
  userId: string;
  sessionId: string;
  expectedRevision: number;
  candidateHash: string;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.workspaceId}:${input.clientProfileId}`}))`);
    await assertProfile(tx, input.workspaceId, input.clientProfileId);
    const [session] = await tx.select().from(brandTrainingSessions).where(and(
      eq(brandTrainingSessions.id, input.sessionId),
      eq(brandTrainingSessions.workspaceId, input.workspaceId),
      eq(brandTrainingSessions.clientProfileId, input.clientProfileId),
    )).limit(1);
    if (!session) throw new BrandKnowledgeCalibrationError("calibration_required", "Calibration session not found");
    if (session.status === "activated") {
      if (!session.activatedVersionId) throw new BrandKnowledgeCalibrationError("calibration_stale", "Activated session lost its version link");
      const [activated] = await tx.select().from(brandKnowledgeVersions).where(and(
        eq(brandKnowledgeVersions.id, session.activatedVersionId),
        eq(brandKnowledgeVersions.workspaceId, input.workspaceId),
        eq(brandKnowledgeVersions.clientProfileId, input.clientProfileId),
      )).limit(1);
      if (!activated) throw new BrandKnowledgeCalibrationError("calibration_stale", "Activated version is gone");
      return activated;
    }
    if (session.status === "archived") throw new BrandKnowledgeCalibrationError("calibration_stale", "Calibration session is archived");
    if (session.revision !== input.expectedRevision) {
      throw new BrandKnowledgeCalibrationError("calibration_stale", "Session revision changed");
    }
    // Only the latest round can activate, and only for its own candidate: an
    // approval never validates a different (older or replaced) candidate.
    const latest = session.rounds[session.rounds.length - 1];
    if (!latest || latest.candidate.hash !== input.candidateHash) {
      throw new BrandKnowledgeCalibrationError("calibration_stale", "Candidate is not the validated round candidate");
    }
    const [active] = await tx.select().from(brandKnowledgeVersions).where(and(
      eq(brandKnowledgeVersions.workspaceId, input.workspaceId),
      eq(brandKnowledgeVersions.clientProfileId, input.clientProfileId),
      eq(brandKnowledgeVersions.status, "active"),
    )).limit(1);
    if (session.baseVersionId !== (active?.id ?? null)) {
      throw new BrandKnowledgeCalibrationError("calibration_stale", "Another session activated a version first");
    }
    const slotWorkIds = latest.slots.map((slot) => slot.workItemId);
    const outputRows = await tx.select().from(creativeWorkOutputs).where(and(
      eq(creativeWorkOutputs.workspaceId, input.workspaceId),
      inArray(creativeWorkOutputs.workItemId, slotWorkIds),
    ));
    const slots = latest.slots.map((slot) => {
      const candidates = outputRows.filter((row) => row.workItemId === slot.workItemId);
      const row = candidates.find((candidate) => candidate.id === slot.outputId) ?? candidates[0] ?? null;
      return assessCalibrationSlot({
        output: row ? { id: row.id, status: row.status, quality: row.quality } : null,
        outputId: row?.id ?? slot.outputId,
        feedback: slot.feedback,
      });
    });
    if (!canActivate(input.candidateHash, { candidateHash: latest.candidate.hash, slots })) {
      throw new BrandKnowledgeCalibrationError("calibration_required", "Round is not fully approved");
    }
    try {
      const hashes = await resolveEvidenceHashes(tx, input.workspaceId, input.clientProfileId, latest.candidate.knowledge.claims);
      assertEvidenceCurrent(latest.candidate.knowledge.claims, hashes);
    } catch (error) {
      if (error instanceof BrandKnowledgeEvidenceError) {
        throw new BrandKnowledgeCalibrationError("calibration_stale", error.message);
      }
      throw error;
    }
    const frozenAssetKeys = [...new Set(latest.candidate.identity.assets.map((asset) => asset.assetKey))];
    if (frozenAssetKeys.length > 0) {
      const reachable = await tx.select({ key: workspaceAssets.key }).from(workspaceAssets).where(and(
        eq(workspaceAssets.workspaceId, input.workspaceId),
        inArray(workspaceAssets.key, frozenAssetKeys),
      ));
      if (reachable.length !== frozenAssetKeys.length) {
        throw new BrandKnowledgeCalibrationError("calibration_stale", "A frozen reference asset is no longer reachable");
      }
    }
    const compiled = compileBrandKnowledgeVersionV2({
      candidate: latest.candidate,
      calibration: { sessionId: session.id, round: latest.number },
    });
    const [existing] = await tx.select().from(brandKnowledgeVersions).where(and(
      eq(brandKnowledgeVersions.workspaceId, input.workspaceId),
      eq(brandKnowledgeVersions.clientProfileId, input.clientProfileId),
      eq(brandKnowledgeVersions.hash, compiled.hash),
    )).limit(1);
    if (existing) {
      await tx.update(brandTrainingSessions).set({
        status: "activated",
        activatedVersionId: existing.id,
        revision: session.revision + 1,
        updatedAt: new Date(),
      }).where(and(
        eq(brandTrainingSessions.id, session.id),
        eq(brandTrainingSessions.revision, session.revision),
      ));
      return existing;
    }
    const [{ value: highest = 0 } = { value: 0 }] = await tx.select({ value: max(brandKnowledgeVersions.versionNumber) }).from(brandKnowledgeVersions).where(and(
      eq(brandKnowledgeVersions.workspaceId, input.workspaceId),
      eq(brandKnowledgeVersions.clientProfileId, input.clientProfileId),
    ));
    await tx.update(brandKnowledgeVersions).set({ status: "superseded" }).where(and(
      eq(brandKnowledgeVersions.workspaceId, input.workspaceId),
      eq(brandKnowledgeVersions.clientProfileId, input.clientProfileId),
      eq(brandKnowledgeVersions.status, "active"),
    ));
    const [published] = await tx.insert(brandKnowledgeVersions).values({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      versionNumber: (highest ?? 0) + 1,
      hash: compiled.hash,
      status: "active",
      snapshot: compiled.snapshot,
      publishedByUserId: input.userId,
    }).returning();
    await tx.update(brandTrainingSessions).set({
      status: "activated",
      activatedVersionId: published!.id,
      revision: session.revision + 1,
      updatedAt: new Date(),
    }).where(and(
      eq(brandTrainingSessions.id, session.id),
      eq(brandTrainingSessions.revision, session.revision),
    ));
    return published!;
  });
}

export async function listBrandKnowledgeVersions(workspaceId: string, clientProfileId: string) {
  await assertProfile(db, workspaceId, clientProfileId);
  return db.select({
    id: brandKnowledgeVersions.id,
    versionNumber: brandKnowledgeVersions.versionNumber,
    hash: brandKnowledgeVersions.hash,
    status: brandKnowledgeVersions.status,
    publishedByUserId: brandKnowledgeVersions.publishedByUserId,
    publishedAt: brandKnowledgeVersions.publishedAt,
  }).from(brandKnowledgeVersions).where(and(
    eq(brandKnowledgeVersions.workspaceId, workspaceId),
    eq(brandKnowledgeVersions.clientProfileId, clientProfileId),
  )).orderBy(desc(brandKnowledgeVersions.versionNumber));
}

export async function getBrandKnowledgeVersion(workspaceId: string, clientProfileId: string, versionId: string) {
  const [version] = await db.select().from(brandKnowledgeVersions).where(and(
    eq(brandKnowledgeVersions.id, versionId),
    eq(brandKnowledgeVersions.workspaceId, workspaceId),
    eq(brandKnowledgeVersions.clientProfileId, clientProfileId),
  )).limit(1);
  return version ?? null;
}

export async function getActiveBrandKnowledgeVersion(workspaceId: string, clientProfileId: string) {
  const [version] = await db.select().from(brandKnowledgeVersions).where(and(
    eq(brandKnowledgeVersions.workspaceId, workspaceId),
    eq(brandKnowledgeVersions.clientProfileId, clientProfileId),
    eq(brandKnowledgeVersions.status, "active"),
  )).limit(1);
  return version ?? null;
}
