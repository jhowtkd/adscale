import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import { db } from "../db";
import {
  brandKnowledgeClaims,
  brandKnowledgeVersions,
  clientProfiles,
  clientReferences,
  workspaceAssets,
  workspaceMembers,
} from "../db/schema";
import { canonicalJsonStringify } from "../creative-work/canonical-json";
import {
  brandKnowledgeEvidenceKey,
  parseBrandKnowledgeClaimInput,
  type BrandKnowledgeClaim,
  type BrandKnowledgeClaimInput,
} from "../brand-knowledge/contracts";
import { compileBrandKnowledgeVersion } from "../brand-knowledge/version-compiler";

export class BrandKnowledgeEvidenceError extends Error {}

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

async function resolveEvidenceHashes(
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

export async function publishBrandKnowledgeVersion(input: {
  workspaceId: string;
  clientProfileId: string;
  userId: string;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.workspaceId}:${input.clientProfileId}`}))`);
    await assertProfile(tx, input.workspaceId, input.clientProfileId);
    const claims = await tx.select().from(brandKnowledgeClaims).where(and(
      eq(brandKnowledgeClaims.workspaceId, input.workspaceId),
      eq(brandKnowledgeClaims.clientProfileId, input.clientProfileId),
    )) as unknown as BrandKnowledgeClaim[];
    const hashes = await resolveEvidenceHashes(tx, input.workspaceId, input.clientProfileId, claims);
    const compiled = compileBrandKnowledgeVersion({ profileId: input.clientProfileId, claims, evidenceHashes: hashes });
    const [existing] = await tx.select().from(brandKnowledgeVersions).where(and(
      eq(brandKnowledgeVersions.workspaceId, input.workspaceId),
      eq(brandKnowledgeVersions.clientProfileId, input.clientProfileId),
      eq(brandKnowledgeVersions.hash, compiled.hash),
    )).limit(1);
    if (existing) return existing;
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
    return published!;
  });
}

export async function listBrandKnowledgeVersions(workspaceId: string, clientProfileId: string) {
  await assertProfile(db, workspaceId, clientProfileId);
  return db.select().from(brandKnowledgeVersions).where(and(
    eq(brandKnowledgeVersions.workspaceId, workspaceId),
    eq(brandKnowledgeVersions.clientProfileId, clientProfileId),
  )).orderBy(desc(brandKnowledgeVersions.versionNumber));
}

export async function getActiveBrandKnowledgeVersion(workspaceId: string, clientProfileId: string) {
  const [version] = await db.select().from(brandKnowledgeVersions).where(and(
    eq(brandKnowledgeVersions.workspaceId, workspaceId),
    eq(brandKnowledgeVersions.clientProfileId, clientProfileId),
    eq(brandKnowledgeVersions.status, "active"),
  )).limit(1);
  return version ?? null;
}
