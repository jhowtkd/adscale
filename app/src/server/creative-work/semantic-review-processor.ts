import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createDiagnosticContext, withDiagnosticContext } from "../diagnostics/context";
import { isDiagnosticCaptureEnabled } from "../diagnostics/observability";
import { buildJevRequest, evaluateJev, JEV_REQUEST_LIMIT, JEV_TIMEOUT_MS } from "./semantic-review-http";
import { runSemanticReviewCall, semanticReviewFailureState, type SemanticReviewDiagnosticSink } from "./semantic-review-diagnostics";
import type { SemanticReviewRepository } from "./semantic-review-repository";
import { semanticReviewDatabaseError, type SemanticReviewObservationScope } from "./semantic-review-processing-repository";

export type SemanticReviewProcessingSummary = {
  status: "disabled" | "not_configured" | "deferred" | "no_observation" | "completed" | "failed" | "skipped" | "outcome_unknown" | "ownership_lost";
  workspaceId: string;
  observationId?: string;
  code?: string;
  sent: boolean;
};

/** One observation, one owner, at most one send. No business mutation or retry. */
export async function processSemanticReviewObservation(options: {
  repository: SemanticReviewRepository;
  workspaceId: string;
  observationId?: string;
  ownerToken?: string;
  enabled?: boolean;
  credential?: string;
  fetchImpl?: typeof fetch;
  clock?: () => Date;
  deadline?: Date;
  diagnosticSink?: SemanticReviewDiagnosticSink;
}): Promise<SemanticReviewProcessingSummary> {
  const { repository, workspaceId } = options;
  if (!z.string().uuid().safeParse(workspaceId).success || (options.observationId && !z.string().uuid().safeParse(options.observationId).success)) throw new Error("invalid_processing_scope");
  const clock = options.clock ?? (() => new Date());
  const now = () => {
    const value = clock();
    if (!Number.isFinite(value.getTime())) throw new Error("invalid_clock");
    return value;
  };
  const deadline = options.deadline ?? new Date(now().getTime() + 20_000);
  if (!Number.isFinite(deadline.getTime())) throw new Error("invalid_clock");
  const enabled = () => options.enabled ?? process.env.JEV_OBSERVER_ENABLED === "true";
  const budget = () => deadline.getTime() - now().getTime() >= JEV_TIMEOUT_MS + 2_000;
  const summary = (status: SemanticReviewProcessingSummary["status"], code?: string): SemanticReviewProcessingSummary => ({ status, workspaceId, ...(code ? { code } : {}), sent: false });
  if (!enabled()) return summary("disabled");
  const credential = (options.credential ?? process.env.TYPESAFE_API_KEY)?.trim();
  if (!credential || /[\x00-\x20\x7f]/.test(credential)) return summary("not_configured", "missing_credential");
  if (!budget()) return summary("deferred", "budget_insufficient");
  // Resolve optional diagnostics before the reservation; no bootstrap/provider.
  let sink: SemanticReviewDiagnosticSink = () => {};
  if (isDiagnosticCaptureEnabled()) {
    try { sink = options.diagnosticSink ?? (await import("../diagnostics/journal")).enqueueDiagnosticEvent; }
    catch { /* Missing diagnostics never disables the processor. */ }
  }
  let scope: SemanticReviewObservationScope | undefined;
  let marked = false;
  let sent = false;
  const resultSummary = (status: SemanticReviewProcessingSummary["status"], code?: string) => ({ ...summary(status, code), observationId: scope?.observationId, sent });
  const cancel = async (code: string): Promise<SemanticReviewProcessingSummary> => {
    if (code === "ownership_lost" || code === "attempt_already_started") return resultSummary("ownership_lost", code);
    const deferred = !marked && ["quota_exhausted", "quota_day_changed", "budget_insufficient", "policy_disabled", "observer_disabled"].includes(code);
    const changed = deferred
      ? await repository.releaseObservation({ ...scope!, now: now(), clock: now })
      : await repository.skipObservation({ ...scope!, now: now(), clock: now, code });
    return resultSummary(changed ? deferred ? "deferred" : "skipped" : "ownership_lost", code);
  };
  try {
    const row = await repository.claimObservation({ workspaceId, observationId: options.observationId, ownerToken: options.ownerToken ?? randomUUID(), now: now(), clock: now });
    if (!row) return summary("no_observation");
    scope = { workspaceId, observationId: row.id, ownerToken: row.ownerToken! };
    if (row.state === "outcome_unknown") return resultSummary("outcome_unknown", row.errorCode ?? "lease_expired_after_send");
    const prepared = await repository.prepareObservation({ ...scope, now: now(), clock: now });
    if (!prepared.ok) return await cancel(prepared.code);
    if (Buffer.byteLength(JSON.stringify(buildJevRequest(prepared.projection)), "utf8") > JEV_REQUEST_LIMIT) return await cancel("request_too_large");
    if (!enabled()) return await cancel("observer_disabled");
    if (!budget()) return await cancel("budget_insufficient");
    const context = createDiagnosticContext({ workspaceId, workItemId: row.workItemId, clientProfileId: row.clientProfileId,
      dataOrigin: prepared.dataOrigin === "synthetic" ? "synthetic" : "production" });
    const reserved = await repository.reserveObservationAttempt({ ...scope, now: now(), clock: now });
    if (!reserved.ok) return await cancel(reserved.code);
    marked = true;
    const authorized = await repository.authorizeObservationSend({ ...scope, now: now(), clock: now });
    if (!authorized.ok) return await cancel(authorized.code);
    if (!enabled()) return await cancel("observer_disabled");
    if (!budget()) return await cancel("budget_insufficient");
    const dispatchAt = now();
    if (!row.leaseExpiresAt || row.leaseExpiresAt <= dispatchAt) return await cancel("ownership_lost");
    if (prepared.policy.expiresAt <= dispatchAt) return await cancel("authorization_expired");
    if (row.expiresAt <= dispatchAt) return await cancel("observation_expired");
    sent = true;
    const result = await withDiagnosticContext(context, () => runSemanticReviewCall({ context,
      sink: (event) => { if (isDiagnosticCaptureEnabled()) sink(event); },
      call: () => evaluateJev(prepared.projection, credential, options.fetchImpl),
    }));
    const state = result.ok ? "completed" : semanticReviewFailureState(result);
    const finished = await repository.finishObservation({ ...scope, now: now(), clock: now, state,
      ...(result.ok ? { result } : { code: result.reason }) });
    if (!finished) return resultSummary("ownership_lost", "ownership_lost");
    // The completion transaction computes currency while holding the work lock.
    // A summary must not assert currency from the pre-send projection.
    return resultSummary(state, result.ok ? undefined : result.reason);
  } catch (error) {
    const code = semanticReviewDatabaseError(error);
    if (scope) {
      try {
        if (marked || sent) await repository.finishObservation({ ...scope, now: now(), clock: now, state: "outcome_unknown", code, currentAtCompletion: false });
        else await repository.releaseObservation({ ...scope, now: now(), clock: now });
      } catch { /* A durable marker survives even a second persistence failure. */ }
    }
    return resultSummary(marked || sent ? "outcome_unknown" : "failed", code);
  }
}
