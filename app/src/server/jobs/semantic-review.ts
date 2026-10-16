import "server-only";
import { inngest } from "./client";
import { collectSemanticReview } from "../creative-work/semantic-review-collector";
import { processSemanticReviewObservation, type SemanticReviewProcessingSummary } from "../creative-work/semantic-review-processor";
import { semanticReviewDatabaseError } from "../creative-work/semantic-review-processing-repository";
import type { SemanticReviewDiagnosticSink } from "../creative-work/semantic-review-diagnostics";
import type { SemanticReviewCollectionSummary, SemanticReviewRepository } from "../creative-work/semantic-review-repository";

export const SEMANTIC_REVIEW_SWEEP_BUDGET_MS = 20_000;
export const SEMANTIC_REVIEW_SWEEP_MAX_OBSERVATIONS = 3;

export type SemanticReviewSweepDependencies = {
  repository?: SemanticReviewRepository;
  enabled?: boolean;
  credential?: string;
  clock?: () => Date;
  fetchImpl?: typeof fetch;
  diagnosticSink?: SemanticReviewDiagnosticSink;
};

export type SemanticReviewSweepSummary = {
  status: "disabled" | "not_configured" | "deferred" | "completed" | "failed";
  code?: string;
  phase?: "expiration" | "collection" | "processing";
  expiration: Awaited<ReturnType<SemanticReviewRepository["expireObservations"]>> | null;
  collection: SemanticReviewCollectionSummary | null;
  processing: SemanticReviewProcessingSummary[];
};

/** One bounded sweep. Only these phase summaries may cross the Inngest step boundary. */
export async function runSemanticReviewSweep(options: SemanticReviewSweepDependencies = {}): Promise<SemanticReviewSweepSummary> {
  const result: SemanticReviewSweepSummary = { status: "completed", expiration: null, collection: null, processing: [] };
  const enabled = () => options.enabled ?? process.env.JEV_OBSERVER_ENABLED === "true";
  if (!enabled()) return { ...result, status: "disabled" };
  const credential = options.credential ?? process.env.TYPESAFE_API_KEY;
  if (!credential) return { ...result, status: "not_configured", code: "missing_credential" };
  if (!/^[\x21-\x7e]{1,4096}$/.test(credential)) return { ...result, status: "not_configured", code: "invalid_credential" };

  const clock = options.clock ?? (() => new Date());
  const now = () => {
    const at = clock();
    if (!Number.isFinite(at.getTime())) throw new Error("invalid_clock");
    return at;
  };
  let phase: NonNullable<SemanticReviewSweepSummary["phase"]> = "expiration";
  try {
    const deadline = new Date(now().getTime() + SEMANTIC_REVIEW_SWEEP_BUDGET_MS);
    const guard = (): SemanticReviewSweepSummary | null => {
      if (!enabled()) return { ...result, status: "disabled", phase };
      if (now() >= deadline) return { ...result, status: "deferred", code: "budget_insufficient", phase };
      return null;
    };
    // Off/unconfigured executions never import the database or load policies.
    const repository = options.repository ?? await (async () => {
      const [{ db }, { createSemanticReviewRepository }] = await Promise.all([
        import("../db"), import("../creative-work/semantic-review-repository"),
      ]);
      return createSemanticReviewRepository(db);
    })();
    let stopped = guard();
    if (stopped) return stopped;
    const page = await repository.listWorkspacesWithExpirableObservations({ now: now(), clock: now, limit: 1 });
    stopped = guard();
    if (stopped) return stopped;
    if (page.workspaceIds[0]) {
      result.expiration = await repository.expireObservations({ workspaceId: page.workspaceIds[0], now: now(), clock: now, limit: 100 });
    }

    phase = "collection";
    stopped = guard();
    if (stopped) return stopped;
    result.collection = await collectSemanticReview({ repository, enabled: options.enabled, now: now() });
    // A failed page still identifies the fairly selected workspace. Its existing
    // queue must make progress even when that page keeps failing.
    const workspaceId = result.collection.workspaceId;
    if (!workspaceId || !["collected", "failed"].includes(result.collection.status)) return result;

    phase = "processing";
    for (let index = 0; index < SEMANTIC_REVIEW_SWEEP_MAX_OBSERVATIONS; index += 1) {
      stopped = guard();
      if (stopped) return stopped;
      const processed = await processSemanticReviewObservation({ repository, workspaceId,
        enabled: options.enabled, credential, clock: now, deadline,
        fetchImpl: options.fetchImpl, diagnosticSink: options.diagnosticSink });
      result.processing.push(processed);
      if (["deferred", "disabled", "not_configured", "no_observation"].includes(processed.status)) break;
    }
    return result;
  } catch (error) {
    // Never throw raw SQL, credentials, projected text or provider responses
    // into Inngest/Sentry. Durable claims/markers remain the recovery authority.
    return { ...result, status: "failed", phase, code: semanticReviewDatabaseError(error) };
  }
}

export function createSemanticReviewObserverJob(dependencies: SemanticReviewSweepDependencies = {}) {
  return inngest.createFunction({
    id: "semantic-review-observer",
    triggers: [{ cron: "*/5 * * * *" }],
    retries: 0,
    concurrency: 1,
  }, async ({ step }) => step.run("semantic-review-sweep", () => runSemanticReviewSweep(dependencies)));
}

export const semanticReviewObserverJob = createSemanticReviewObserverJob();
