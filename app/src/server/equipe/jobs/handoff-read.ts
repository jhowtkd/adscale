import { inngest } from "@/server/jobs/client";
import { createProdJobDeps, moduleDepsFor } from "./shared";
import type { JobStep } from "./shared";
import { createHandoffReadHandler, claimHandoffProviderAttempt, loadHandoffInstagramRun, recordHandoffInstagramRun } from "../handoff/read";
import { createHandoffReaders } from "../handoff/readers";
import { HANDOFF_INSTAGRAM_COST_EVENT, HANDOFF_READ_EVENT } from "../handoff/contract";
import { createInstagramCostHandler } from "../handoff/instagram-cost";
import { createSiteEnrichment } from "../handoff/site-enrichment";
import { createSiteVision, createInstagramVision } from "../handoff/site-vision";
import { createInstagramEnrichment } from "../handoff/instagram-enrichment";
import type { SiteReadingContext } from "../handoff/site-enrichment";
import { createBudgetedModelClient } from "../agents/budgeted-client";
import { AnthropicEquipeModelClient } from "../agents/anthropic-client";
import { BUDGET_EXCEEDED_EVENT, DrizzleLedgerStore, estimateCostUsdCents } from "../agents/ledger";
import { resolveAgentMonthlyBudgetUsdCents, resolveStrategistModel } from "../agents/roles";
import { EQUIPE_PROMPT_VERSION } from "../agents/prompts";
import { STRATEGIST_AGENT_ID } from "../agents/strategist";
import { objectStorage } from "@/server/storage";
import { createWorkspaceAssetIfKeyAbsent, getWorkspaceAssetByKey, updateWorkspaceAsset } from "@/server/repositories/workspace-asset";
import { env } from "@/server/validation/env";
import { abortable } from "../handoff/safe-image-download";
import { freePlanLimitsApply, freePlanReadersFor } from "../module/free-plan";
const deps = createProdJobDeps();
const ledger = new DrizzleLedgerStore();
const anthropic = new AnthropicEquipeModelClient({ timeoutMs: 30_000 });
/** Outside the free plan an account spends its monthly AI budget (spec 2026-10-07 §3): used up, the refusal is recorded and nothing is called. */
async function monthlyBudgetUsedUp(scope: { workspaceId: string; accountId: string }, taskKind: string, signal?: AbortSignal): Promise<boolean> {
  const budgetUsdCents = resolveAgentMonthlyBudgetUsdCents();
  const spent = ledger.monthlyTotalCostUsdCents(scope.workspaceId, scope.accountId, deps.clock.now());
  const totalCostUsdCents = await (signal ? abortable(spent, signal) : spent);
  if (totalCostUsdCents < budgetUsdCents) return false;
  try {
    await deps.uow.repos.events.create(scope, { actorType: "agent", actorId: STRATEGIST_AGENT_ID, actorRole: "agent", eventType: BUDGET_EXCEEDED_EVENT,
      payload: { totalCostUsdCents, budgetUsdCents, taskKind }, occurredAt: deps.clock.now() });
  } catch { /* Admission still refuses when its evidence cannot be written. */ }
  return true;
}
const onFreePlan = async (scope: { workspaceId: string; accountId: string }) =>
  freePlanLimitsApply(await deps.uow.repos.accounts.get(scope.workspaceId, scope.accountId), scope.workspaceId, freePlanReadersFor(moduleDepsFor(deps, scope.workspaceId)));
const visionClient = (context: SiteReadingContext, signal: AbortSignal) => ({ async chat(request: Parameters<AnthropicEquipeModelClient["chat"]>[0]) {
    signal.throwIfAborted();
    const [handoff] = await abortable(deps.uow.repos.handoffs.list(context), signal);
    if (!handoff || handoff.readingId !== context.readingId || handoff.step === "done") throw new Error("stale_reading");
    const model = resolveStrategistModel();
    if (!model.startsWith("claude-opus-")) throw new Error("site_vision_requires_opus");
    if (!env.ANTHROPIC_API_KEY) throw new Error("anthropic_api_key_missing");
    if (!(await abortable(claimHandoffProviderAttempt(moduleDepsFor(deps, context.workspaceId), context, "vision"), signal))) throw new Error("reading_failed");
    // The lifetime admission is the free plan's (spec 2026-10-07 §3); a paying workspace's brand records on its monthly ledger. The reading already
    // refused to start with that budget used up; this admission still guards a budget another call used up while the reading ran.
    const free = await abortable(onFreePlan(context), signal);
    if (!free && await monthlyBudgetUsedUp(context, "handoff_vision", signal)) throw new Error("budget_exceeded");
    const client = createBudgetedModelClient({ scope: context, repos: deps.uow.repos, ledger, client: () => { signal.throwIfAborted(); return anthropic; },
      free, model, role: "strategist", taskKind: "handoff_vision", now: () => deps.clock.now() });
    const response = await client.chat({ ...request, noRetries: true });
    if (!free) await ledger.record({ workspaceId: context.workspaceId, accountId: context.accountId, role: "strategist", model,
      taskKind: "handoff_vision", promptVersion: EQUIPE_PROMPT_VERSION, ...response.usage,
      costUsdCents: estimateCostUsdCents(model, response.usage.inputTokens, response.usage.outputTokens, response.usage.cacheReadTokens, response.usage.cacheWriteTokens) });
    return response;
  } });
const imageOptions = { storage: objectStorage, saveAsset: createWorkspaceAssetIfKeyAbsent, findAsset: getWorkspaceAssetByKey,
  // The plate of a logo is kept with its asset even when another import stored it first (ticket 16); `metadata` is merged by the repository.
  updateAssetMetadata: (assetId: string, workspaceId: string, metadata: Record<string, unknown>) => updateWorkspaceAsset(assetId, workspaceId, { metadata }) };
const enrichment = createSiteEnrichment({
  ...imageOptions, vision: (context, signal) => createSiteVision({ storage: objectStorage, client: visionClient(context, signal) }),
});
const instagramEnrichment = createInstagramEnrichment({
  ...imageOptions, vision: (context, signal) => createInstagramVision({ storage: objectStorage, client: visionClient(context, signal) }),
});
export const equipeHandoffReadJob = inngest.createFunction({
  id: "equipe-handoff-read", triggers: [{ event: HANDOFF_READ_EVENT }], retries: 1,
  concurrency: [{ limit: 1, key: "event.data.accountId" }],
}, async ({ event, step }) => {
  const moduleDeps = moduleDepsFor(deps, String(event.data.workspaceId));
  const context = {
    workspaceId: String(event.data.workspaceId), accountId: String(event.data.accountId), readingId: String(event.data.readingId), taskIntentId: String(event.data.taskIntentId),
  };
  const readers = createHandoffReaders({ beforeSiteRequest: () => claimHandoffProviderAttempt(moduleDeps, context, "site"),
    instagram: { beforeRequest: () => claimHandoffProviderAttempt(moduleDeps, context, "instagram"),
      loadRun: () => loadHandoffInstagramRun(moduleDeps, context), saveRun: runId => recordHandoffInstagramRun(moduleDeps, context, runId),
      recordUsage: (runId, usage) => recordHandoffInstagramRun(moduleDeps, context, runId, usage) } });
  return createHandoffReadHandler(moduleDeps, readers, process.env.SITE_READER_PROVIDER === "firecrawl" ? enrichment : undefined,
    process.env.INSTAGRAM_READER_PROVIDER === "apify" ? instagramEnrichment : undefined,
    // The provider's cost is read by a function of its own, told once the groups are recorded (ticket 13, D-4). One event per reading: sending it twice is one.
    { dispatchInstagramCost: data => inngest.send({ id: `equipe-handoff-instagram-cost-${data.taskIntentId}`, name: HANDOFF_INSTAGRAM_COST_EVENT, data }),
      monthlyBudgetExhausted: async scope => !(await onFreePlan(scope)) && monthlyBudgetUsedUp(scope, "handoff_read") })({ event, step: step as unknown as JobStep });
});
/**
 * Reads, and records, what the provider charged for the Instagram run a reading dispatched. A function of its own so that its ten seconds of waiting hold nothing on
 * the screen: the steps of the reading run one at a time (concurrency 1 per account) and the cost used to be one of them (ticket 13, D-4).
 */
export const equipeHandoffInstagramCostJob = inngest.createFunction({
  id: "equipe-handoff-instagram-cost", triggers: [{ event: HANDOFF_INSTAGRAM_COST_EVENT }], retries: 1,
  concurrency: [{ limit: 1, key: "event.data.accountId" }],
}, async ({ event, step }) => {
  const moduleDeps = moduleDepsFor(deps, String(event.data.workspaceId));
  const context = {
    workspaceId: String(event.data.workspaceId), accountId: String(event.data.accountId), readingId: String(event.data.readingId), taskIntentId: String(event.data.taskIntentId),
  };
  const readers = createHandoffReaders({ instagram: {
    loadRun: () => loadHandoffInstagramRun(moduleDeps, context), recordUsage: (runId, usage) => recordHandoffInstagramRun(moduleDeps, context, runId, usage) } });
  return createInstagramCostHandler(readers)({ event, step: step as unknown as JobStep });
});
