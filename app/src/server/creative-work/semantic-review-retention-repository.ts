import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { semanticReviewObservations as observations, semanticReviewPolicies as policies, semanticReviewQuotaDays as quota } from "../db/schema";

export const SEMANTIC_REVIEW_RETENTION_MS = 30 * 86_400_000;
export const SEMANTIC_REVIEW_RETENTION_PAGE_SIZE = 100;
type MaintenanceScope = { workspaceId: string; now: Date; clock?: () => Date; limit?: number };
const scopeSchema = z.object({
  workspaceId: z.string().uuid(), now: z.date(),
  limit: z.number().int().min(1).max(SEMANTIC_REVIEW_RETENTION_PAGE_SIZE).optional(),
});
function validate(input: MaintenanceScope) {
  if (!scopeSchema.safeParse(input).success) throw new Error("invalid_retention_scope");
  return input.limit ?? SEMANTIC_REVIEW_RETENTION_PAGE_SIZE;
}
function clock(input: MaintenanceScope) {
  const now = input.clock?.() ?? input.now;
  if (!Number.isFinite(now.getTime())) throw new Error("invalid_clock");
  return now;
}
const noActiveLease = (now: Date) => or(isNull(observations.leaseExpiresAt), lte(observations.leaseExpiresAt, now));
const expirable = (workspaceId: string, now: Date) => and(
  eq(observations.workspaceId, workspaceId), noActiveLease(now),
  or(
    and(eq(observations.state, "queued"), or(lte(observations.expiresAt, now), isNotNull(observations.sendStartedAt))),
    and(eq(observations.state, "running"), lte(observations.leaseExpiresAt, now)),
  ),
);
const cleanable = (workspaceId: string, now: Date) => and(
  eq(observations.workspaceId, workspaceId),
  lt(observations.createdAt, new Date(now.getTime() - SEMANTIC_REVIEW_RETENTION_MS)),
  inArray(observations.state, ["completed", "failed", "skipped", "outcome_unknown"]),
  noActiveLease(now),
);
// Even a disabled authorization still within its window protects deduplication.
const activeWindow = (workspaceId: string, now: Date) => sql`exists (select 1 from ${policies}
  where ${policies.workspaceId} = ${workspaceId}::uuid and (${policies.state} = 'enabled'
    or (${policies.state} <> 'revoked' and ${policies.revokedAt} is null
      and ${policies.expiresAt} > ${now.toISOString()}::timestamp)))`;

/** Maintenance extends the same repository and never reads or locks business rows. */
export function createSemanticReviewRetentionRepository<TSchema extends Record<string, unknown>>(database: NodePgDatabase<TSchema>) {
  return {
    async expireObservations(input: MaintenanceScope) {
      const limit = validate(input);
      return database.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '2s'`);
        await tx.execute(sql`set local statement_timeout = '5s'`);
        const candidates = await tx.select().from(observations).where(expirable(input.workspaceId, clock(input)))
          .orderBy(asc(observations.createdAt), asc(observations.id)).limit(limit).for("update", { skipLocked: true });
        const at = clock(input);
        const summary = { workspaceId: input.workspaceId, examined: candidates.length, expired: 0, recovered: 0, outcomeUnknown: 0 };
        const unknown: string[] = [], expired: string[] = [], recovered: string[] = [];
        for (const row of candidates) {
          // Recheck time after acquiring locks, including an injected clock going backwards.
          if (row.leaseExpiresAt && row.leaseExpiresAt > at) continue;
          if (row.state === "running" && (!row.leaseExpiresAt || row.leaseExpiresAt > at)) continue;
          if (row.sendStartedAt) unknown.push(row.id);
          else if (row.expiresAt <= at) expired.push(row.id);
          else if (row.state === "running") recovered.push(row.id);
        }
        if (unknown.length) {
          const rows = await tx.update(observations).set({ state: "outcome_unknown", finishedAt: at,
            leaseExpiresAt: null, currentAtCompletion: false, errorCode: "lease_expired_after_send" })
            .where(and(expirable(input.workspaceId, at), inArray(observations.id, unknown))).returning({ id: observations.id });
          summary.outcomeUnknown = rows.length;
        }
        if (expired.length) {
          const rows = await tx.update(observations).set({ state: "skipped", finishedAt: at,
            ownerToken: null, leaseExpiresAt: null, currentAtCompletion: false, errorCode: "queue_expired" })
            .where(and(expirable(input.workspaceId, at), inArray(observations.id, expired))).returning({ id: observations.id });
          summary.expired = rows.length;
        }
        if (recovered.length) {
          const rows = await tx.update(observations).set({ state: "queued", ownerToken: null, leaseExpiresAt: null })
            .where(and(expirable(input.workspaceId, at), inArray(observations.id, recovered), isNull(observations.sendStartedAt))).returning({ id: observations.id });
          summary.recovered = rows.length;
        }
        return summary;
      });
    },
    async cleanObservations(input: MaintenanceScope & { apply?: boolean }) {
      const limit = validate(input);
      if (input.apply !== undefined && typeof input.apply !== "boolean") throw new Error("invalid_retention_scope");
      return database.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '2s'`);
        await tx.execute(sql`set local statement_timeout = '5s'`);
        const blocked = async (at: Date) => {
          const result = await tx.execute<{ active: boolean }>(sql`select ${activeWindow(input.workspaceId, at)} as active`);
          return result.rows[0].active;
        };
        const blockedSummary = (at: Date) => ({ workspaceId: input.workspaceId,
          mode: input.apply ? "apply" as const : "dry_run" as const,
          status: "blocked_active_pilot_window" as const,
          cutoff: new Date(at.getTime() - SEMANTIC_REVIEW_RETENTION_MS).toISOString(),
          eligible: 0, deleted: 0, observationIds: [] as string[] });
        const startedAt = clock(input);
        if (await blocked(startedAt)) return blockedSummary(startedAt);
        // Same bounded selection in preview and apply; busy rows are left to a later page.
        const candidates = await tx.select({ id: observations.id }).from(observations)
          .where(cleanable(input.workspaceId, clock(input))).orderBy(asc(observations.createdAt), asc(observations.id))
          .limit(limit).for("update", { skipLocked: true });
        const at = clock(input);
        if (await blocked(at)) return blockedSummary(at);
        const ids = candidates.map((row) => row.id);
        const eligible = ids.length ? await tx.select({ id: observations.id }).from(observations)
          .where(and(cleanable(input.workspaceId, at), inArray(observations.id, ids))) : [];
        const observationIds = eligible.map((row) => row.id).sort();
        const deleted = input.apply && observationIds.length ? await tx.delete(observations)
          .where(and(cleanable(input.workspaceId, at), inArray(observations.id, observationIds), sql`not ${activeWindow(input.workspaceId, at)}`)).returning({ id: observations.id }) : [];
        return { workspaceId: input.workspaceId, mode: input.apply ? "apply" as const : "dry_run" as const,
          status: "ready" as const,
          cutoff: new Date(at.getTime() - SEMANTIC_REVIEW_RETENTION_MS).toISOString(),
          eligible: observationIds.length, deleted: deleted.length, observationIds };
      });
    },
    async cleanQuotaDays(input: MaintenanceScope & { apply?: boolean }) {
      const limit = validate(input);
      if (input.apply !== undefined && typeof input.apply !== "boolean") throw new Error("invalid_retention_scope");
      // Deliberately separate from observation locks; current reservations only
      // touch today's row, which is never a candidate for this transaction.
      return database.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '2s'`);
        await tx.execute(sql`set local statement_timeout = '5s'`);
        const cutoff = (at: Date) => new Date(at.getTime() - SEMANTIC_REVIEW_RETENTION_MS).toISOString().slice(0, 10);
        const predicate = (at: Date) => and(eq(quota.workspaceId, input.workspaceId), lt(quota.dayUtc, cutoff(at)));
        const candidates = await tx.select({ dayUtc: quota.dayUtc }).from(quota).where(predicate(clock(input)))
          .orderBy(asc(quota.dayUtc)).limit(limit).for("update", { skipLocked: true });
        const at = clock(input);
        const dayUtc = candidates.map((row) => row.dayUtc).filter((day) => day < cutoff(at));
        const deleted = input.apply && dayUtc.length ? await tx.delete(quota)
          .where(and(predicate(at), inArray(quota.dayUtc, dayUtc))).returning({ dayUtc: quota.dayUtc }) : [];
        return { workspaceId: input.workspaceId, mode: input.apply ? "apply" as const : "dry_run" as const,
          cutoffDayUtc: cutoff(at), eligible: dayUtc.length, deleted: deleted.length, dayUtc };
      });
    },
  };
}
