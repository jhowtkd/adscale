import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createSemanticReviewProcessingRepository } from "./semantic-review-processing-repository";
import { createSemanticReviewRetentionRepository } from "./semantic-review-retention-repository";
import {
  clientProfiles,
  creativeWorkItems,
  semanticReviewObservations,
  semanticReviewPolicies,
  semanticReviewPolicyBrands,
  workspaces,
} from "../db/schema";
import {
  projectSemanticReviewOffline,
  SEMANTIC_INPUT_VERSION,
  SEMANTIC_MODEL,
  SEMANTIC_PROFILE,
  SEMANTIC_RUBRIC_HASH,
  SEMANTIC_RUBRIC_VERSION,
} from "./semantic-review-offline";

export const SEMANTIC_REVIEW_VERSIONS = {
  profile: SEMANTIC_PROFILE,
  inputVersion: SEMANTIC_INPUT_VERSION,
  rubricVersion: SEMANTIC_RUBRIC_VERSION,
  rubricHash: SEMANTIC_RUBRIC_HASH,
  model: SEMANTIC_MODEL,
} as const;
export const SEMANTIC_REVIEW_PAGE_SIZE = 25;
export const SEMANTIC_REVIEW_OVERLAP_MS = 10 * 60_000;
const MAX_AUTHORIZATION_MS = 14 * 24 * 60 * 60_000;
const QUEUE_LIFETIME_MS = 24 * 60 * 60_000;

type Policy = typeof semanticReviewPolicies.$inferSelect;
const scopeSchema = z.object({ workspaceId: z.string().uuid(), policyId: z.string().uuid() });
const policySchema = z.object({
  workspaceId: z.string().uuid(),
  clientProfileIds: z.array(z.string().uuid()).min(1).max(100),
  authorizationReference: z.string().url().max(2048).refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash && !value.includes("?");
  }),
  authorizedBy: z.string().trim().min(1).max(200).regex(/^[^\r\n\x00-\x1f]+$/),
  authorizedAt: z.date(),
  expiresAt: z.date(),
  provider: z.literal("typesafe"),
  purpose: z.literal("prepared_work_semantic_review"),
  dataOrigin: z.enum(["synthetic", "authorized"]),
  profile: z.literal(SEMANTIC_PROFILE),
  inputVersion: z.literal(SEMANTIC_INPUT_VERSION),
  rubricVersion: z.literal(SEMANTIC_RUBRIC_VERSION),
  rubricHash: z.literal(SEMANTIC_RUBRIC_HASH),
  model: z.literal(SEMANTIC_MODEL),
  samplePercent: z.number().int().min(0).max(100).default(10),
  dailyAttemptLimit: z.number().int().min(1).max(100).default(100),
}).strict().refine((value) => value.expiresAt > value.authorizedAt
  && value.expiresAt.getTime() - value.authorizedAt.getTime() <= MAX_AUTHORIZATION_MS
  && (value.dataOrigin === "synthetic" || value.samplePercent === 10));
export type RegisterSemanticReviewPolicy = z.input<typeof policySchema>;

export type SemanticReviewCollectionSummary = {
  status: "collected" | "disabled" | "no_policy" | "failed";
  code?: "collection_page_failed";
  workspaceId?: string;
  policyId?: string;
  consulted: number;
  eligible: number;
  unique: number;
  duplicates: number;
  outOfScope: number;
  invalid: number;
  notSampled: number;
  exclusions: Record<string, number>;
  windowComplete: boolean;
};
export function emptySemanticReviewSummary(status: SemanticReviewCollectionSummary["status"]): SemanticReviewCollectionSummary {
  return { status, consulted: 0, eligible: 0, unique: 0, duplicates: 0, outOfScope: 0, invalid: 0, notSampled: 0, exclusions: {}, windowComplete: false };
}

/** The identity is independent of policy/cursor/time, including upon reauthorization. */
export function semanticReviewIdentity(work: { workspaceId: string; clientProfileId: string; id: string }, semanticHash: string): string {
  return createHash("sha256").update(JSON.stringify([
    work.workspaceId, work.clientProfileId, work.id, semanticHash,
    SEMANTIC_INPUT_VERSION, SEMANTIC_RUBRIC_VERSION, SEMANTIC_RUBRIC_HASH, SEMANTIC_PROFILE, SEMANTIC_MODEL,
  ])).digest("hex");
}
export function semanticReviewSampled(identity: string, samplePercent: number): boolean {
  const bucket = Number.parseInt(identity.slice(0, 8), 16) / 0x1_0000_0000 * 100;
  return bucket < samplePercent;
}
function currentVersions(policy: Policy): boolean {
  return Object.entries(SEMANTIC_REVIEW_VERSIONS).every(([key, value]) => policy[key as keyof typeof SEMANTIC_REVIEW_VERSIONS] === value);
}
function validPolicy(policy: Policy, now: Date): boolean {
  return policy.state !== "revoked" && policy.authorizedAt <= now && policy.expiresAt > now && currentVersions(policy);
}
function parseScope(input: { workspaceId: string; policyId: string }) {
  const parsed = scopeSchema.safeParse(input);
  if (!parsed.success) throw new Error("invalid_policy_scope");
  return parsed.data;
}
function safeNow(now: Date) {
  if (!Number.isFinite(now.getTime())) throw new Error("invalid_clock");
  return now;
}

/** The real keyset query; callers may inspect its SQL for query-plan evidence. */
export function semanticReviewPageQuery(executor: Pick<NodePgDatabase, "select">, window: {
  workspaceId: string;
  lower: string;
  upper: string;
  cursorUpdatedAt?: string | null;
  cursorWorkItemId?: string | null;
}) {
  const work = creativeWorkItems;
  return executor.select({
    id: work.id, workspaceId: work.workspaceId, clientProfileId: work.clientProfileId,
    toolKind: work.toolKind, trainingSessionId: work.trainingSessionId,
    trainingRound: work.trainingRound, trainingSlot: work.trainingSlot,
    updatedAt: work.updatedAt, cursorTimestamp: sql<string>`${work.updatedAt}::text`,
  }).from(work).where(and(
    eq(work.workspaceId, window.workspaceId),
    sql`${work.updatedAt} >= ${window.lower}::timestamp`,
    sql`${work.updatedAt} <= ${window.upper}::timestamp`,
    window.cursorUpdatedAt && window.cursorWorkItemId
      ? sql`(${work.updatedAt}, ${work.id}) > (${window.cursorUpdatedAt}::timestamp, ${window.cursorWorkItemId}::uuid)` : undefined,
  )).orderBy(asc(work.updatedAt), asc(work.id)).limit(SEMANTIC_REVIEW_PAGE_SIZE);
}

/** No global connection: callers explicitly supply the authorized database. */
export function createSemanticReviewRepository<TSchema extends Record<string, unknown>>(database: NodePgDatabase<TSchema>) {
  return {
    ...createSemanticReviewProcessingRepository(database),
    ...createSemanticReviewRetentionRepository(database),
    async registerPolicy(input: RegisterSemanticReviewPolicy, now = new Date()) {
      safeNow(now);
      const parsed = policySchema.safeParse(input);
      if (!parsed.success || parsed.data.authorizedAt > now || parsed.data.expiresAt <= now) throw new Error("invalid_policy");
      const { clientProfileIds, ...values } = parsed.data;
      const ids = [...new Set(clientProfileIds)];
      return database.transaction(async (tx) => {
        const brands = await tx.select({ id: clientProfiles.id }).from(clientProfiles)
          .where(and(eq(clientProfiles.workspaceId, values.workspaceId), inArray(clientProfiles.id, ids))).for("share");
        if (brands.length !== ids.length) throw new Error("invalid_policy_scope");
        const [policy] = await tx.insert(semanticReviewPolicies).values({ ...values, state: "disabled", createdAt: now, updatedAt: now }).returning();
        await tx.insert(semanticReviewPolicyBrands).values(ids.map((clientProfileId) => ({ policyId: policy.id, workspaceId: policy.workspaceId, clientProfileId })));
        return { ...policy, clientProfileIds: ids };
      });
    },
    async setPolicyEnabled(input: { workspaceId: string; policyId: string; enabled: boolean }, now = new Date()) {
      const scope = parseScope(input);
      safeNow(now);
      return database.transaction(async (tx) => {
        // Serialize activation changes for this workspace; the partial unique index
        // remains the final guard even for writers outside this command.
        await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, scope.workspaceId)).for("no key update");
        const [policy] = await tx.select().from(semanticReviewPolicies).where(and(eq(semanticReviewPolicies.id, scope.policyId), eq(semanticReviewPolicies.workspaceId, scope.workspaceId))).for("update");
        if (!policy) throw new Error("policy_not_found");
        if (policy.state === "revoked" || (input.enabled && !validPolicy(policy, now))) throw new Error("policy_not_valid");
        if (input.enabled) {
          await tx.update(semanticReviewPolicies).set({ state: "disabled", updatedAt: now }).where(and(eq(semanticReviewPolicies.workspaceId, scope.workspaceId), eq(semanticReviewPolicies.state, "enabled"), lte(semanticReviewPolicies.expiresAt, now)));
          const others = await tx.select({ id: semanticReviewPolicies.id }).from(semanticReviewPolicies).where(and(eq(semanticReviewPolicies.workspaceId, scope.workspaceId), eq(semanticReviewPolicies.state, "enabled")));
          if (others.some((other) => other.id !== scope.policyId)) throw new Error("policy_already_active");
        }
        const [updated] = await tx.update(semanticReviewPolicies).set({ state: input.enabled ? "enabled" : "disabled", updatedAt: now }).where(eq(semanticReviewPolicies.id, scope.policyId)).returning();
        return updated;
      });
    },
    async revokePolicy(input: { workspaceId: string; policyId: string }, now = new Date()) {
      const scope = parseScope(input);
      safeNow(now);
      return database.transaction(async (tx) => {
        const [policy] = await tx.select().from(semanticReviewPolicies)
          .where(and(eq(semanticReviewPolicies.id, scope.policyId), eq(semanticReviewPolicies.workspaceId, scope.workspaceId))).for("update");
        if (!policy) throw new Error("policy_not_found");
        if (policy.state === "revoked") return policy;
        const [revoked] = await tx.update(semanticReviewPolicies).set({ state: "revoked", revokedAt: now, updatedAt: now })
          .where(eq(semanticReviewPolicies.id, scope.policyId)).returning();
        return revoked;
      });
    },
    async getPolicy(input: { workspaceId: string; policyId: string }) {
      const scope = parseScope(input);
      return database.transaction(async (tx) => {
        const [policy] = await tx.select().from(semanticReviewPolicies).where(and(eq(semanticReviewPolicies.id, scope.policyId), eq(semanticReviewPolicies.workspaceId, scope.workspaceId)));
        if (!policy) return null;
        const brands = await tx.select({ id: semanticReviewPolicyBrands.clientProfileId }).from(semanticReviewPolicyBrands).where(and(eq(semanticReviewPolicyBrands.policyId, scope.policyId), eq(semanticReviewPolicyBrands.workspaceId, scope.workspaceId))).orderBy(asc(semanticReviewPolicyBrands.clientProfileId));
        return { ...policy, clientProfileIds: brands.map((brand) => brand.id) };
      });
    },
    async listObservations(input: { workspaceId: string; policyId?: string; limit?: number }) {
      if (!z.string().uuid().safeParse(input.workspaceId).success
        || (input.policyId && !z.string().uuid().safeParse(input.policyId).success)) throw new Error("invalid_policy_scope");
      const limit = input.limit ?? 100;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("invalid_limit");
      return database.select().from(semanticReviewObservations).where(and(eq(semanticReviewObservations.workspaceId, input.workspaceId), input.policyId ? eq(semanticReviewObservations.policyId, input.policyId) : undefined)).orderBy(asc(semanticReviewObservations.createdAt), asc(semanticReviewObservations.id)).limit(limit);
    },
    async collectNextPage({ enabled, now = new Date() }: { enabled: boolean; now?: Date }): Promise<SemanticReviewCollectionSummary> {
      if (!enabled) return emptySemanticReviewSummary("disabled");
      safeNow(now);
      return database.transaction(async (tx) => {
        // Contention and statement time are bounded; no HTTP occurs in this tx.
        await tx.execute(sql`set local lock_timeout = '2s'`);
        await tx.execute(sql`set local statement_timeout = '5s'`);
        const [policy] = await tx.select().from(semanticReviewPolicies).where(and(
          eq(semanticReviewPolicies.state, "enabled"),
          lte(semanticReviewPolicies.authorizedAt, now),
          gt(semanticReviewPolicies.expiresAt, now),
          ...Object.entries(SEMANTIC_REVIEW_VERSIONS).map(([key, value]) => eq(semanticReviewPolicies[key as keyof typeof SEMANTIC_REVIEW_VERSIONS], value)),
        )).orderBy(sql`${semanticReviewPolicies.lastCollectedAt} asc nulls first`, asc(semanticReviewPolicies.createdAt), asc(semanticReviewPolicies.id)).limit(1).for("update", { skipLocked: true });
        if (!policy) return emptySemanticReviewSummary("no_policy");
        let summary: SemanticReviewCollectionSummary;
        try {
          summary = await tx.transaction(async (pageTx) => {
            const summary = { ...emptySemanticReviewSummary("collected"), policyId: policy.id, workspaceId: policy.workspaceId };
            const brands = await pageTx.select({ id: semanticReviewPolicyBrands.clientProfileId }).from(semanticReviewPolicyBrands)
              .where(and(eq(semanticReviewPolicyBrands.policyId, policy.id), eq(semanticReviewPolicyBrands.workspaceId, policy.workspaceId))).for("share");
            const allowed = new Set(brands.map((brand) => brand.id));
            const upper = policy.windowUpper ?? new Date(Math.max(now.getTime(), policy.lastWindowUpper ? new Date(policy.lastWindowUpper + "Z").getTime() : 0)).toISOString();
            const consentStart = Math.max(policy.authorizedAt.getTime(), policy.createdAt.getTime());
            const lower = policy.windowLower ?? new Date(Math.max(consentStart, policy.lastWindowUpper ? new Date(policy.lastWindowUpper + "Z").getTime() - SEMANTIC_REVIEW_OVERLAP_MS : consentStart)).toISOString();
            const page = allowed.size === 0 ? [] : await semanticReviewPageQuery(pageTx, {
              workspaceId: policy.workspaceId, lower, upper,
              cursorUpdatedAt: policy.cursorUpdatedAt, cursorWorkItemId: policy.cursorWorkItemId,
            });
            // Only authorized single/non-training keys may cause content reads.
            const contentKeys = page.filter((row) => allowed.has(row.clientProfileId)
              && row.toolKind === "single" && row.trainingSessionId === null
              && row.trainingRound === null && row.trainingSlot === null);
            const work = creativeWorkItems;
            const content = contentKeys.length === 0 ? [] : await pageTx.select({
              id: work.id, workspaceId: work.workspaceId, clientProfileId: work.clientProfileId,
              toolKind: work.toolKind, status: work.status, trainingSessionId: work.trainingSessionId,
              trainingRound: work.trainingRound, trainingSlot: work.trainingSlot,
              request: work.request, brief: work.brief, format: work.format, settings: work.settings,
              inputSnapshot: work.inputSnapshot, copy: work.copy, updatedAt: work.updatedAt,
            }).from(work).where(and(
              eq(work.workspaceId, policy.workspaceId), eq(work.toolKind, "single"),
              isNull(work.trainingSessionId), isNull(work.trainingRound), isNull(work.trainingSlot),
              inArray(work.clientProfileId, [...allowed]),
              or(...contentKeys.map((key) => and(eq(work.id, key.id), eq(work.clientProfileId, key.clientProfileId), sql`${work.updatedAt} = ${key.cursorTimestamp}::timestamp`))),
            ));
            const contentById = new Map(content.map((row) => [row.id, row]));
            const exclude = (kind: "outOfScope" | "invalid" | "notSampled", reason: string) => {
              summary[kind] += 1;
              summary.exclusions[reason] = (summary.exclusions[reason] ?? 0) + 1;
            };
            const insertions: Array<typeof semanticReviewObservations.$inferInsert> = [];
            for (const row of page) {
              summary.consulted += 1;
              if (!allowed.has(row.clientProfileId)) { exclude("outOfScope", "outside_policy_scope"); continue; }
              if (row.toolKind !== "single") { exclude("outOfScope", "protocol"); continue; }
              if (row.trainingSessionId !== null || row.trainingRound !== null || row.trainingSlot !== null) { exclude("outOfScope", "training"); continue; }
              const prepared = contentById.get(row.id);
              if (!prepared) { exclude("invalid", "changed_during_collection"); continue; }
              const projection = projectSemanticReviewOffline(prepared);
              if (!projection.ok) { exclude("invalid", projection.reason); continue; }
              summary.eligible += 1;
              if (!semanticReviewSampled(semanticReviewIdentity(row, projection.hash), policy.samplePercent)) { exclude("notSampled", "not_sampled"); continue; }
              insertions.push({
                workspaceId: row.workspaceId, clientProfileId: row.clientProfileId, workItemId: row.id,
                policyId: policy.id, semanticHash: projection.hash, ...SEMANTIC_REVIEW_VERSIONS,
                state: "queued", observedUpdatedAt: row.cursorTimestamp,
                createdAt: now, expiresAt: new Date(now.getTime() + QUEUE_LIFETIME_MS),
              });
            }
            if (insertions.length) {
              const inserted = await pageTx.insert(semanticReviewObservations).values(insertions).onConflictDoNothing().returning({ id: semanticReviewObservations.id });
              summary.unique = inserted.length;
              summary.duplicates = insertions.length - inserted.length;
            }
            summary.windowComplete = page.length < SEMANTIC_REVIEW_PAGE_SIZE;
            const last = page.at(-1);
            await pageTx.update(semanticReviewPolicies).set({
              windowLower: summary.windowComplete ? null : lower,
              windowUpper: summary.windowComplete ? null : upper,
              cursorUpdatedAt: summary.windowComplete ? null : last!.cursorTimestamp,
              cursorWorkItemId: summary.windowComplete ? null : last!.id,
              lastWindowUpper: summary.windowComplete ? upper : policy.lastWindowUpper,
            }).where(eq(semanticReviewPolicies.id, policy.id));
            return summary;
          });
        } catch {
          // No raw database/provider messages or speculative counts escape.
          summary = { ...emptySemanticReviewSummary("failed"), code: "collection_page_failed", policyId: policy.id, workspaceId: policy.workspaceId };
        }
        // Persist scheduling even after rolling the page back to its savepoint.
        await tx.update(semanticReviewPolicies).set({ lastCollectedAt: sql`clock_timestamp()`, updatedAt: now })
          .where(eq(semanticReviewPolicies.id, policy.id));
        return summary;
      });
    },
  };
}
export type SemanticReviewRepository = ReturnType<typeof createSemanticReviewRepository>;
