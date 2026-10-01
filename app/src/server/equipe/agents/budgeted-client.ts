import { logger } from "@/lib/logger";
import type { AccountScope, EquipeRepositories } from "../data";
import { assertAccountExecution } from "../module/execution-authorization";
import { diagnosticReserveUsdCents, freeBudgetUsdCents, hasRecordedDiagnostic, modelInputTokenBound } from "./free-budget";
import { estimateCostUsdCents, maximumCallCostUsdCents, type LedgerStore } from "./ledger";
import type { EquipeModelClient, ModelCallRequest, ModelCallResponse } from "./model-client";
import { classifyModelFailure, type ModelFailure } from "./model-failure";
import { EQUIPE_PROMPT_VERSION } from "./prompts";
import type { EquipeAgentRole } from "./roles";

/** A call the provider (or this process) refused before any model ran. The payload says why and carries no content of the call. */
export const MODEL_CALL_REJECTED_EVENT = "agent.model_call_rejected";

type CallLabel = { role: EquipeAgentRole; model: string; taskKind: string };

/** Keeps the cause of a refused call: a log line and an account event, both without prompts, images or links. Never throws. */
async function recordRefusal(repos: EquipeRepositories, scope: AccountScope, now: () => Date, failure: ModelFailure, request: ModelCallRequest, label: CallLabel) {
  const detail = { ...label, kind: failure.kind, ...(failure.status !== undefined ? { status: failure.status } : {}),
    ...(failure.type ? { errorType: failure.type } : {}), ...(failure.requestId ? { requestId: failure.requestId } : {}),
    ...(request.output ? { schema: request.output.name } : {}), message: failure.message };
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
      // Proof that nothing ran gives the whole reservation back, at once. Anything else may have been billed and keeps its maximum
      // (even if this write fails: a doubt is never refunded, and the orphan reconciler only closes it, at the maximum).
      const giveBack = async () => {
        try { await lockedLedger.settle(scope, entry.id, { model, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, 0, now()); }
        catch { /* Conserved at the maximum. */ }
      };
      let client: EquipeModelClient;
      // A client that cannot even be chosen (an aborted reading, an unknown provider) sent nothing.
      try { client = options.client(); } catch (error) { await giveBack(); throw error; }
      let response: ModelCallResponse;
      try { response = await client.chat({ ...request, maxTokens, noRetries: true }); }
      catch (error) {
        const failure = classifyModelFailure(error);
        if (failure.kind !== "other") { await giveBack(); await recordRefusal(repos, scope, now, failure, request, label); }
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
