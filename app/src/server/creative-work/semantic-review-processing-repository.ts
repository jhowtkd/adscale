import "server-only";
import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import {
  creativeWorkItems, semanticReviewObservations as observations,
  semanticReviewPolicies as policies, semanticReviewPolicyBrands as brands,
  semanticReviewQuotaDays as quota,
} from "../db/schema";
import {
  projectSemanticReviewOffline, SEMANTIC_INPUT_VERSION, SEMANTIC_MODEL,
  SEMANTIC_PROFILE, SEMANTIC_QUESTIONS, SEMANTIC_RUBRIC_HASH, SEMANTIC_RUBRIC_VERSION,
} from "./semantic-review-offline";
import { JEV_TIMEOUT_MS, parseJevResponse, type JevResult } from "./semantic-review-http";

export const SEMANTIC_REVIEW_LEASE_MS = 60_000;
export type SemanticReviewObservationScope = { workspaceId: string; observationId: string; ownerToken: string };
type Observation = typeof observations.$inferSelect;
type ProcessingTime = { now: Date; clock?: () => Date };
function readClock(input: ProcessingTime): Date {
  const at = input.clock?.() ?? input.now;
  if (!Number.isFinite(at.getTime())) throw new Error("invalid_clock");
  return at;
}
class ReservationCancelled extends Error {
  constructor(readonly safeCode: string) { super(safeCode); }
}
function timeProblem(observation: Observation, policy: typeof policies.$inferSelect, at: Date): string | null {
  if (!observation.leaseExpiresAt || observation.leaseExpiresAt <= at) return "ownership_lost";
  if (policy.expiresAt <= at || policy.authorizedAt > at) return "authorization_expired";
  if (observation.expiresAt <= at) return "observation_expired";
  return null;
}
type Transaction = Pick<NodePgDatabase, "select" | "execute">;
const scopeSchema = z.object({ workspaceId: z.string().uuid(), observationId: z.string().uuid(), ownerToken: z.string().uuid() });
const versions = { inputVersion: SEMANTIC_INPUT_VERSION, model: SEMANTIC_MODEL, profile: SEMANTIC_PROFILE, rubricHash: SEMANTIC_RUBRIC_HASH, rubricVersion: SEMANTIC_RUBRIC_VERSION };
const sameVersions = (row: typeof versions) => Object.entries(versions).every(([key, value]) => row[key as keyof typeof versions] === value);
const matches = (scope: SemanticReviewObservationScope) => and(eq(observations.id, scope.observationId), eq(observations.workspaceId, scope.workspaceId), eq(observations.ownerToken, scope.ownerToken), eq(observations.state, "running"));
const owned = (scope: SemanticReviewObservationScope, now: Date) => and(matches(scope), gt(observations.leaseExpiresAt, now));
function validate(scope: SemanticReviewObservationScope, now: Date) {
  if (!scopeSchema.safeParse(scope).success || !Number.isFinite(now.getTime())) throw new Error("invalid_processing_scope");
}
async function bounded(tx: Transaction) {
  await tx.execute(sql`set local lock_timeout = '2s'`);
  await tx.execute(sql`set local statement_timeout = '5s'`);
}

/** Business context is a point-in-time MVCC read, never a row lock. */
async function semanticContext(executor: Transaction, observation: Observation) {
  if (!sameVersions(observation)) return { ok: false as const, code: "stale_input" };
  const [work] = await executor.select().from(creativeWorkItems).where(and(eq(creativeWorkItems.id, observation.workItemId), eq(creativeWorkItems.workspaceId, observation.workspaceId), eq(creativeWorkItems.clientProfileId, observation.clientProfileId)));
  if (!work) return { ok: false as const, code: "work_missing" };
  const projected = projectSemanticReviewOffline(work);
  if (!projected.ok || projected.hash !== observation.semanticHash) return { ok: false as const, code: "stale_input" };
  return { ok: true as const, projection: projected.projection };
}
async function context(executor: Transaction, observation: Observation, clock: () => Date) {
  const semantic = await semanticContext(executor, observation);
  if (!semantic.ok) return semantic;
  // Authorization is read last. Dispatch calls this outside a transaction after
  // committing the marker, so revocation need not wait for an observer lock.
  const [policy] = await executor.select().from(policies).where(and(eq(policies.id, observation.policyId), eq(policies.workspaceId, observation.workspaceId)));
  if (!policy || policy.state === "revoked" || policy.revokedAt) return { ok: false as const, code: "authorization_revoked" };
  if (policy.state !== "enabled") return { ok: false as const, code: "policy_disabled" };
  if (policy.provider !== "typesafe" || policy.purpose !== "prepared_work_semantic_review" || !sameVersions(policy)) return { ok: false as const, code: "stale_input" };
  const [brand] = await executor.select({ id: brands.clientProfileId }).from(brands).where(and(eq(brands.policyId, policy.id), eq(brands.workspaceId, observation.workspaceId), eq(brands.clientProfileId, observation.clientProfileId)));
  if (!brand) return { ok: false as const, code: "authorization_revoked" };
  const problem = timeProblem(observation, policy, clock());
  if (problem) return { ok: false as const, code: problem };
  return { ok: true as const, observation, projection: semantic.projection, dataOrigin: policy.dataOrigin, policy };
}

/** Extends the canonical repository; never imports a global connection. */
export function createSemanticReviewProcessingRepository<TSchema extends Record<string, unknown>>(database: NodePgDatabase<TSchema>) {
  return {
    async claimObservation(input: { workspaceId: string; observationId?: string; ownerToken: string } & ProcessingTime) {
      if (!z.string().uuid().safeParse(input.workspaceId).success || !z.string().uuid().safeParse(input.ownerToken).success || (input.observationId && !z.string().uuid().safeParse(input.observationId).success) || !Number.isFinite(input.now.getTime())) throw new Error("invalid_processing_scope");
      return database.transaction(async (tx) => {
        await bounded(tx);
        const [row] = await tx.select().from(observations).where(and(
          eq(observations.workspaceId, input.workspaceId), input.observationId ? eq(observations.id, input.observationId) : undefined,
          or(and(eq(observations.state, "queued"), isNull(observations.sendStartedAt)), and(eq(observations.state, "running"), lte(observations.leaseExpiresAt, input.now))),
          input.observationId ? undefined : or(sql`${observations.sendStartedAt} is not null`, sql`exists (
            select 1 from ${policies} where ${policies.id} = ${observations.policyId}
            and ${policies.workspaceId} = ${observations.workspaceId} and ${policies.state} = 'enabled'
            and ${policies.revokedAt} is null and ${policies.authorizedAt} <= ${input.now.toISOString()}::timestamp
            and ${policies.expiresAt} > ${input.now.toISOString()}::timestamp
            and ${policies.inputVersion} = ${SEMANTIC_INPUT_VERSION} and ${policies.profile} = ${SEMANTIC_PROFILE}
            and ${policies.model} = ${SEMANTIC_MODEL} and ${policies.rubricHash} = ${SEMANTIC_RUBRIC_HASH}
            and ${policies.rubricVersion} = ${SEMANTIC_RUBRIC_VERSION}
          )`),
        )).orderBy(asc(observations.createdAt), asc(observations.id)).limit(1).for("update", { skipLocked: true });
        if (!row) return null;
        const claimedAt = readClock(input);
        // Only expired claims are recovered. A durable send marker is never reset.
        const unknown = row.sendStartedAt !== null;
        const [claimed] = await tx.update(observations).set({
          ownerToken: input.ownerToken, state: unknown ? "outcome_unknown" : "running",
          leaseExpiresAt: unknown ? null : new Date(claimedAt.getTime() + SEMANTIC_REVIEW_LEASE_MS),
          ...(unknown ? { finishedAt: claimedAt, currentAtCompletion: false, errorCode: "lease_expired_after_send" } : {}),
        }).where(and(eq(observations.id, row.id), eq(observations.workspaceId, input.workspaceId), row.ownerToken ? eq(observations.ownerToken, row.ownerToken) : isNull(observations.ownerToken))).returning();
        return claimed ?? null;
      });
    },
    async prepareObservation(input: SemanticReviewObservationScope & ProcessingTime) {
      validate(input, input.now);
      return database.transaction(async (tx) => {
        await bounded(tx);
        const [row] = await tx.select().from(observations).where(owned(input, input.now)).for("update");
        if (!row) return { ok: false as const, code: "ownership_lost" };
        return context(tx, row, () => readClock(input));
      });
    },
    async reserveObservationAttempt(input: SemanticReviewObservationScope & ProcessingTime & { deadline: Date }) {
      validate(input, input.now);
      if (!input.deadline || !Number.isFinite(input.deadline.getTime())) throw new Error("invalid_clock");
      return database.transaction(async (tx) => {
        await bounded(tx);
        const [candidate] = await tx.select().from(observations).where(owned(input, input.now));
        if (!candidate) return { ok: false as const, code: "ownership_lost" };
        const initial = await context(tx, candidate, () => readClock(input));
        if (!initial.ok) return initial;
        const dayUtc = readClock(input).toISOString().slice(0, 10);
        // Quota (including the implicit workspace FK lock) precedes the
        // observation lock, so workspace DELETE cannot close the inverse cycle.
        const [reserved] = await tx.insert(quota).values({ workspaceId: input.workspaceId, dayUtc, attempts: 1 })
          .onConflictDoUpdate({ target: [quota.workspaceId, quota.dayUtc], set: { attempts: sql`${quota.attempts} + 1` }, setWhere: sql`${quota.attempts} < ${Math.min(initial.policy.dailyAttemptLimit, 100)}` }).returning();
        if (!reserved) return { ok: false as const, code: "quota_exhausted" };
        // A cascading DELETE may already own this row while waiting on quota.
        // Desist immediately rather than making the business DELETE a victim.
        const [row] = await tx.select().from(observations).where(owned(input, readClock(input))).for("update", { noWait: true });
        if (!row) throw new ReservationCancelled("ownership_lost");
        if (row.sendStartedAt) throw new ReservationCancelled("attempt_already_started");
        const current = await context(tx, row, () => readClock(input));
        if (!current.ok) throw new ReservationCancelled(current.code);
        if (reserved.attempts > Math.min(current.policy.dailyAttemptLimit, 100)) throw new ReservationCancelled("quota_exhausted");
        const markedAt = readClock(input);
        const problem = timeProblem(row, current.policy, markedAt);
        // Every guard after the increment rolls back the entire reservation.
        if (problem) throw new ReservationCancelled(problem);
        if (markedAt.toISOString().slice(0, 10) !== dayUtc) throw new ReservationCancelled("quota_day_changed");
        if (input.deadline.getTime() - markedAt.getTime() < JEV_TIMEOUT_MS + 2_000) throw new ReservationCancelled("budget_insufficient");
        await tx.update(observations).set({ sendStartedAt: markedAt }).where(owned(input, markedAt));
        return { ok: true as const };
      }).catch((error: unknown) => {
        if (error instanceof ReservationCancelled) return { ok: false as const, code: error.safeCode };
        throw error;
      });
    },
    async authorizeObservationSend(input: SemanticReviewObservationScope & ProcessingTime) {
      validate(input, input.now);
      // Deliberately outside a transaction: this is the final authorization read
      // after the durable marker, immediately before dispatch, with no row locks.
      const [row] = await database.select().from(observations).where(owned(input, readClock(input)));
      if (!row) return { ok: false as const, code: "ownership_lost" };
      if (!row.sendStartedAt) return { ok: false as const, code: "attempt_not_started" };
      const current = await context(database, row, () => readClock(input));
      if (!current.ok) return current;
      const [stillOwned] = await database.select({ id: observations.id }).from(observations).where(owned(input, readClock(input)));
      return stillOwned ? { ok: true as const } : { ok: false as const, code: "ownership_lost" };
    },
    async releaseObservation(input: SemanticReviewObservationScope & ProcessingTime) {
      validate(input, input.now);
      return database.transaction(async (tx) => {
        await bounded(tx);
        const [row] = await tx.select().from(observations).where(owned(input, input.now)).for("update");
        if (!row) return false;
        const rows = await tx.update(observations).set({ state: "queued", ownerToken: null, leaseExpiresAt: null }).where(and(owned(input, readClock(input)), isNull(observations.sendStartedAt))).returning({ id: observations.id });
        return rows.length === 1;
      });
    },
    async skipObservation(input: SemanticReviewObservationScope & ProcessingTime & { code: string }) {
      validate(input, input.now);
      return database.transaction(async (tx) => {
        await bounded(tx);
        const [row] = await tx.select().from(observations).where(owned(input, input.now)).for("update");
        if (!row) return false;
        const finishedAt = readClock(input);
        const rows = await tx.update(observations).set({ state: "skipped", errorCode: safeCode(input.code), finishedAt, leaseExpiresAt: null, currentAtCompletion: false }).where(owned(input, finishedAt)).returning({ id: observations.id });
        return rows.length === 1;
      });
    },
    async finishObservation(input: SemanticReviewObservationScope & ProcessingTime & { state: "completed" | "failed" | "outcome_unknown"; code?: string; result?: Extract<JevResult, { ok: true }>; httpElapsedMs?: number | null }) {
      validate(input, input.now);
      if (input.httpElapsedMs != null && (!Number.isSafeInteger(input.httpElapsedMs) || input.httpElapsedMs < 0 || input.httpElapsedMs > 2_147_483_647)) throw new Error("invalid_http_elapsed");
      if ((input.state === "completed") !== Boolean(input.result)) throw new Error("invalid_completion");
      // Reuse the canonical response validator at this public write boundary.
      // Only enumerated keys/values survive even if a caller bypasses TypeScript.
      const result = input.result ? parseJevResponse({ model: SEMANTIC_MODEL, usage: input.result.usage,
        answers: Object.fromEntries(SEMANTIC_QUESTIONS.map((question) => [question, {
          type: "choice", choice: input.result!.decisions[question], confidence: input.result!.confidence[question],
          probabilities: input.result!.probabilities[question],
        }])),
      }) : undefined;
      if (result && !result.ok) throw new Error("invalid_completion");
      return database.transaction(async (tx) => {
        await bounded(tx);
        const [row] = await tx.select().from(observations).where(and(owned(input, input.now), sql`${observations.sendStartedAt} is not null`)).for("update");
        if (!row) return false;
        let currentAtCompletion = false;
        let contextCode: string | undefined;
        try {
          // A failed read must not discard a valid response or poison its write.
          currentAtCompletion = await tx.transaction(async (readTx) => (await semanticContext(readTx, row)).ok);
        } catch { contextCode = "context_unavailable"; }
        const finishedAt = readClock(input);
        if (!row.leaseExpiresAt || row.leaseExpiresAt <= finishedAt) return false;
        await tx.update(observations).set({
          state: input.state, finishedAt, leaseExpiresAt: null,
          currentAtCompletion: currentAtCompletion && input.state === "completed",
          errorCode: input.code ? safeCode(input.code) : contextCode ?? null,
          httpElapsedMs: input.httpElapsedMs ?? null,
          ...(result?.ok ? { decisions: result.decisions, confidence: result.confidence, probabilities: result.probabilities, usage: result.usage, returnedModel: SEMANTIC_MODEL } : {}),
        }).where(owned(input, finishedAt));
        return true;
      });
    },
  };
}

/** Only allowlisted codes can cross the repository persistence boundary. */
const SAFE_CODES = new Set([
  "authorization_revoked", "authorization_expired", "policy_disabled", "observation_expired", "work_missing", "stale_input",
  "request_too_large", "response_too_large", "empty_response", "invalid_response", "redirect", "http_status", "timeout", "network_error",
  "budget_insufficient", "observer_disabled", "context_unavailable", "persistence_failed", "db_serialization_failure", "db_deadlock", "db_lock_timeout", "db_statement_timeout", "db_scope_missing", "db_unavailable",
]);
function safeCode(code: string) { return SAFE_CODES.has(code) ? code : "persistence_failed"; }
export function semanticReviewDatabaseError(error: unknown): string {
  let cause = error;
  for (let depth = 0; depth < 5 && cause && typeof cause === "object"; depth += 1) {
    const { code, cause: next } = cause as { code?: unknown; cause?: unknown };
    if (typeof code === "string") {
      if (code.startsWith("08")) return "db_unavailable";
      const known: Record<string, string> = { "40001": "db_serialization_failure", "40P01": "db_deadlock", "55P03": "db_lock_timeout", "57014": "db_statement_timeout", "23503": "db_scope_missing" };
      if (known[code]) return known[code];
    }
    cause = next;
  }
  return "persistence_failed";
}
