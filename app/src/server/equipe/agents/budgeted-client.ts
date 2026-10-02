import { logger } from "@/lib/logger";
import type { AccountScope, EquipeRepositories } from "../data";
import { assertAccountExecution } from "../module/execution-authorization";
import { diagnosticReserveUsdCents, freeBudgetUsdCents, hasRecordedDiagnostic, modelInputTokenBound } from "./free-budget";
import { estimateCostUsdCents, maximumCallCostUsdCents, type LedgerStore } from "./ledger";
import type { EquipeModelClient, ModelCallRequest, ModelCallResponse } from "./model-client";
import { classifyModelFailure, type ModelFailure } from "./model-failure";
import { EQUIPE_PROMPT_VERSION } from "./prompts";
import type { EquipeAgentRole } from "./roles";

/** A call the provider (or this process) refused before any model ran. The payload says why, in structured fields, and carries no content of the call. */
export const MODEL_CALL_REJECTED_EVENT = "agent.model_call_rejected";

/**
 * The most reservations one free account is ever given back by zero (review of PR 614). The strict cap never refunds a doubt, and a refusal is proof;
 * but a mistake in telling them apart, or a person who keeps provoking one, must not reopen the cap without end. From the next one on the maximum stays
 * and the event says so (reason `give_back_limit`).
 */
export const MAX_GIVE_BACKS_PER_ACCOUNT = 5;

type CallLabel = { role: EquipeAgentRole; model: string; taskKind: string };

/** Keeps the cause of a refused call: a log line and an account event, structured, without prompts, images, links or the provider's text. Never throws. */
async function recordRefusal(repos: EquipeRepositories, scope: AccountScope, now: () => Date, failure: ModelFailure, request: ModelCallRequest, label: CallLabel) {
  const detail = { ...label, kind: failure.kind, ...(failure.status !== undefined ? { status: failure.status } : {}),
    ...(failure.type ? { errorType: failure.type } : {}), ...(failure.code ? { code: failure.code } : {}), ...(failure.requestId ? { requestId: failure.requestId } : {}),
    ...(failure.param ? { param: failure.param } : {}), ...(failure.reason ? { reason: failure.reason } : {}),
    ...(request.output ? { schema: request.output.name } : {}), ...(failure.message ? { message: failure.message } : {}) };
  logger.warn("[equipe-model-call] request refused before it ran", detail);
  try {
    await repos.events.create({ workspaceId: scope.workspaceId, accountId: scope.accountId },
      { actorType: "system", actorId: "equipe.model_call", actorRole: "system", eventType: MODEL_CALL_REJECTED_EVENT, payload: detail, occurredAt: now() });
  } catch { /* The refusal stands even if its event cannot be written. */ }
}

/** Shared per-call admission for agent work and the handoff reader. */
export function createBudgetedModelClient(options: {
  scope: AccountScope; repos: EquipeRepositories; ledger: LedgerStore; client: () => EquipeModelClient;
  free: boolean; model: string; role: EquipeAgentRole; taskKind: string;
  now: () => Date; maxTokens?: number; reserveDiagnostic?: boolean;
}): EquipeModelClient {
  return { async chat(request) {
    const { scope, ledger, model, now } = options;
    const label: CallLabel = { role: options.role, model, taskKind: options.taskKind };
    if (!options.free) {
      await assertAccountExecution(options.repos, scope);
      try { return await options.client().chat(request); }
      catch (error) {
        const failure = classifyModelFailure(error);
        if (failure.kind !== "other") await recordRefusal(options.repos, scope, now, failure, request, label);
        throw error;
      }
    }
    return ledger.withAccountLock(scope, async (lockedLedger, lockedRepos) => {
      const repos = lockedRepos ?? options.repos;
      await assertAccountExecution(repos, scope);
      const minimumBound = modelInputTokenBound(request);
      const bound = request.inputTokenBound;
      const maxTokens = options.maxTokens === undefined ? request.maxTokens : Math.min(request.maxTokens ?? options.maxTokens, options.maxTokens);
      const maximum = bound !== undefined && maxTokens !== undefined ? maximumCallCostUsdCents(model, bound, maxTokens) : null;
      if (request.model !== model || minimumBound === null || bound === undefined || bound < minimumBound || maximum === null) throw new Error("free_call_unbounded");
      const total = await lockedLedger.lifetimeTotalCostUsdCents(scope.workspaceId, scope.accountId);
      const reserve = options.reserveDiagnostic && !(await hasRecordedDiagnostic(repos, scope)) ? diagnosticReserveUsdCents() : 0;
      if (total + reserve + maximum > freeBudgetUsdCents()) throw new Error("budget_exceeded");
      const entry = await lockedLedger.record({ ...scope, role: options.role, model, promptVersion: EQUIPE_PROMPT_VERSION, taskKind: options.taskKind,
        inputTokens: 0, outputTokens: 0, costUsdCents: maximum, reservedCostUsdCents: maximum, reservationExpiresAt: new Date(now().getTime() + 15 * 60 * 1000) });
      // Proof that nothing ran gives the whole reservation back, at once, up to MAX_GIVE_BACKS_PER_ACCOUNT per account. Anything else may have been
      // billed and keeps its maximum (even if this write fails: a doubt is never refunded, and the orphan reconciler only closes it, at the maximum).
      const giveBack = async (): Promise<"given_back" | "limit" | "kept"> => {
        try {
          if (await lockedLedger.countGivenBackReservations(scope.workspaceId, scope.accountId) >= MAX_GIVE_BACKS_PER_ACCOUNT) return "limit";
          await lockedLedger.settle(scope, entry.id, { model, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, 0, now());
          return "given_back";
        } catch { return "kept"; }
      };
      let client: EquipeModelClient;
      // A client that cannot even be chosen (an aborted reading, an unknown provider) sent nothing. Quiet unless the limit stops the give-back.
      try { client = options.client(); }
      catch (error) {
        if (await giveBack() === "limit") await recordRefusal(repos, scope, now, { kind: "not_sent", reason: "give_back_limit" }, request, label);
        throw error;
      }
      let response: ModelCallResponse;
      try { response = await client.chat({ ...request, maxTokens, noRetries: true }); }
      catch (error) {
        const failure = classifyModelFailure(error);
        if (failure.kind !== "other") {
          const outcome = await giveBack();
          await recordRefusal(repos, scope, now, outcome === "limit" ? { ...failure, reason: "give_back_limit" } : failure, request, label);
        }
        throw error;
      }
      if (response.usageKnown === false) throw new Error("free_usage_unknown");
      const usage = { model, ...response.usage };
      if ([usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, usage.cacheWriteTokens].some(n => !Number.isSafeInteger(n) || n < 0)
        || usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens > bound || usage.outputTokens > maxTokens!) throw new Error("free_call_bound_exceeded");
      await lockedLedger.settle(scope, entry.id, usage, estimateCostUsdCents(model, usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, usage.cacheWriteTokens), now());
      return response;
    });
  } };
}
