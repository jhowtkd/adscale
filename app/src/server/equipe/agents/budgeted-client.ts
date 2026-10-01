import type { AccountScope, EquipeRepositories } from "../data";
import { assertAccountExecution } from "../module/execution-authorization";
import { diagnosticReserveUsdCents, freeBudgetUsdCents, hasRecordedDiagnostic, modelInputTokenBound } from "./free-budget";
import { estimateCostUsdCents, maximumCallCostUsdCents, type LedgerStore } from "./ledger";
import type { EquipeModelClient } from "./model-client";
import { EQUIPE_PROMPT_VERSION } from "./prompts";
import type { EquipeAgentRole } from "./roles";

/** Shared per-call admission for agent work and the handoff reader. */
export function createBudgetedModelClient(options: {
  scope: AccountScope; repos: EquipeRepositories; ledger: LedgerStore; client: () => EquipeModelClient;
  free: boolean; model: string; role: EquipeAgentRole; taskKind: string;
  now: () => Date; maxTokens?: number; reserveDiagnostic?: boolean;
}): EquipeModelClient {
  return { async chat(request) {
    const { scope, ledger, model, now } = options;
    if (!options.free) {
      await assertAccountExecution(options.repos, scope);
      return options.client().chat(request);
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
      const response = await options.client().chat({ ...request, maxTokens, noRetries: true });
      if (response.usageKnown === false) throw new Error("free_usage_unknown");
      const usage = { model, ...response.usage };
      if ([usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, usage.cacheWriteTokens].some(n => !Number.isSafeInteger(n) || n < 0)
        || usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens > bound || usage.outputTokens > maxTokens!) throw new Error("free_call_bound_exceeded");
      await lockedLedger.settle(scope, entry.id, usage, estimateCostUsdCents(model, usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, usage.cacheWriteTokens), now());
      return response;
    });
  } };
}
