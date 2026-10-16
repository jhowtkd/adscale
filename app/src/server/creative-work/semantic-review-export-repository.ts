import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { creativeWorkItems, semanticReviewObservations, semanticReviewPolicies, semanticReviewCollectionRuns } from "../db/schema";
import { EVALUATION_VERSIONS, type SemanticFamilyPlan } from "./semantic-review-evaluation";
import { projectSemanticReviewOffline } from "./semantic-review-offline";

/** Read-only, explicit IDs, MVCC snapshot; never locks a business row. */
export function createSemanticReviewExportRepository<TSchema extends Record<string, unknown>>(database: NodePgDatabase<TSchema>) {
  return {
    async reconstruct(input: { workspaceId: string; clientProfileIds: string[]; reviewIds: string[] }) {
      const scope = z.object({ workspaceId: z.string().uuid(), clientProfileIds: z.array(z.string().uuid()).min(1).max(100), reviewIds: z.array(z.string().uuid()).min(1).max(100) }).strict().parse(input);
      if (new Set(scope.reviewIds).size !== scope.reviewIds.length) throw new Error("duplicate_review_ids");
      return database.transaction(async (tx) => {
        await tx.execute(sql`set transaction read only`);
        await tx.execute(sql`set local statement_timeout = '5s'`);
        const observations = await tx.select().from(semanticReviewObservations).where(and(eq(semanticReviewObservations.workspaceId, scope.workspaceId), inArray(semanticReviewObservations.id, scope.reviewIds)));
        // Missing/foreign IDs are deliberately indistinguishable unavailable cases.
        if (observations.some((row) => !scope.clientProfileIds.includes(row.clientProfileId))) throw new Error("export_scope_denied");
        const policyIds = [...new Set(observations.map((row) => row.policyId))];
        const policies = policyIds.length ? await tx.select().from(semanticReviewPolicies).where(and(eq(semanticReviewPolicies.workspaceId, scope.workspaceId), inArray(semanticReviewPolicies.id, policyIds))) : [];
        const records = [];
        for (const reviewId of scope.reviewIds) {
          const observation = observations.find((row) => row.id === reviewId);
          if (!observation) { records.push({ reviewId, observation: null, policy: null, projected: null, unavailableReason: "observation_unavailable" as const }); continue; }
          const policy = policies.find((row) => row.id === observation.policyId) ?? null;
          const currentVersions = Object.entries(EVALUATION_VERSIONS).every(([key, value]) => observation[key as keyof typeof EVALUATION_VERSIONS] === value);
          if (!currentVersions) { records.push({ reviewId, observation, policy, projected: null, unavailableReason: "version_mismatch" as const }); continue; }
          const [work] = await tx.select().from(creativeWorkItems).where(and(eq(creativeWorkItems.workspaceId, scope.workspaceId), eq(creativeWorkItems.id, observation.workItemId), eq(creativeWorkItems.clientProfileId, observation.clientProfileId)));
          const projected = work ? projectSemanticReviewOffline(work) : null;
          if (!projected?.ok || !policy) { records.push({ reviewId, observation, policy, projected: null, unavailableReason: "context_unavailable" as const }); continue; }
          if (projected.hash !== observation.semanticHash) { records.push({ reviewId, observation, policy, projected: null, unavailableReason: "hash_mismatch" as const }); continue; }
          records.push({ reviewId, observation, policy, projected, unavailableReason: null });
        }
        const runs = policyIds.length ? await tx.select().from(semanticReviewCollectionRuns).where(and(eq(semanticReviewCollectionRuns.workspaceId, scope.workspaceId), inArray(semanticReviewCollectionRuns.policyId, policyIds))).orderBy(asc(semanticReviewCollectionRuns.recordedAt), asc(semanticReviewCollectionRuns.id)) : [];
        // An absent initial window or any gap is incomplete evidence. Retention
        // and legacy runs cannot silently turn partial history into a full funnel.
        const historyComplete = policies.length > 0 && policies.every((policy) => {
          const history = runs.filter((run) => run.policyId === policy.id);
          if (!history.length) return false;
          const start = Math.max(policy.authorizedAt.getTime(), policy.createdAt.getTime());
          return history.some((run) => run.initialPage && Date.parse(run.windowLower + "Z") === start);
        });
        return { records, collectionRuns: runs.map((run) => ({ ...run, recordedAt: run.recordedAt.toISOString() })), collectionHistoryComplete: historyComplete };
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
    },
  };
}
export type SemanticReviewExportRepository = ReturnType<typeof createSemanticReviewExportRepository>;
export type SemanticExportSelection = SemanticFamilyPlan;
