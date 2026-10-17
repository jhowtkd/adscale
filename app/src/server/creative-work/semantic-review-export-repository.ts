import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { creativeWorkItems, semanticReviewObservations, semanticReviewPolicies, semanticReviewCollectionRuns } from "../db/schema";
import { EVALUATION_VERSIONS, parseSemanticFamilyPlan, semanticDigest, type SemanticFamilyPlan } from "./semantic-review-evaluation";
import { validateSemanticExportApproval } from "./semantic-review-export-authorization";
import { projectSemanticReviewOffline } from "./semantic-review-offline";

/** Read-only, explicit IDs, MVCC snapshot; never locks a business row. */
export function createSemanticReviewExportRepository<TSchema extends Record<string, unknown>>(database: NodePgDatabase<TSchema>) {
  return {
    async reconstruct(input: { authorization: unknown; plan: unknown; now?: Date; clock?: () => Date }) {
      const clock = input.clock ?? (() => input.now ?? new Date());
      const now = clock();
      const plan = parseSemanticFamilyPlan(input.plan, now);
      const planHash = semanticDigest(plan);
      const approval = validateSemanticExportApproval(input.authorization, plan.workspaceId, planHash, plan.entries.map((e) => e.reviewId), now);
      const scope = { workspaceId: approval.workspaceId, clientProfileIds: approval.clientProfileIds, reviewIds: approval.reviewIds };
      const result = await database.transaction(async (tx) => {
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
        // The initial page proves the recorded starting boundary. This does not
        // establish contiguity after arbitrary manual deletions in the middle.
        const historyComplete = policies.length > 0 && policies.every((policy) => {
          const history = runs.filter((run) => run.policyId === policy.id);
          if (!history.length) return false;
          const start = Math.max(policy.authorizedAt.getTime(), policy.createdAt.getTime());
          return history.some((run) => run.initialPage && run.status === "collected" && Date.parse(run.windowLower + "Z") === start);
        });
        const operational = policyIds.length ? await tx.select({ policyId: semanticReviewObservations.policyId,
          state: semanticReviewObservations.state, createdAt: semanticReviewObservations.createdAt,
          sendStartedAt: semanticReviewObservations.sendStartedAt, httpElapsedMs: semanticReviewObservations.httpElapsedMs,
          usage: semanticReviewObservations.usage, errorCode: semanticReviewObservations.errorCode,
          profile: semanticReviewObservations.profile, model: semanticReviewObservations.model,
          inputVersion: semanticReviewObservations.inputVersion, rubricVersion: semanticReviewObservations.rubricVersion, rubricHash: semanticReviewObservations.rubricHash,
        }).from(semanticReviewObservations).where(and(eq(semanticReviewObservations.workspaceId, scope.workspaceId), inArray(semanticReviewObservations.policyId, policyIds))) : [];
        return { records, collectionRuns: runs.map((run) => ({ ...run, recordedAt: run.recordedAt.toISOString() })), collectionHistoryComplete: historyComplete,
          processingObservations: operational.map(({ profile, model, inputVersion, rubricVersion, rubricHash, ...row }) => ({ ...row,
            dataOrigin: policies.find((policy) => policy.id === row.policyId)!.dataOrigin,
            versions: { profile, model, inputVersion, rubricVersion, rubricHash },
            createdAt: row.createdAt.toISOString(), sendStartedAt: row.sendStartedAt?.toISOString() ?? null,
          })),
        };
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
      validateSemanticExportApproval(approval, plan.workspaceId, planHash, plan.entries.map((e) => e.reviewId), clock());
      return result;
    },
  };
}
export type SemanticReviewExportRepository = ReturnType<typeof createSemanticReviewExportRepository>;
export type SemanticExportSelection = SemanticFamilyPlan;
