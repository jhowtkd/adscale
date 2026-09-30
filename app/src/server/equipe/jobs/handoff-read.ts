import { inngest } from "@/server/jobs/client";
import { createProdJobDeps, moduleDepsFor } from "./shared";
import type { JobStep } from "./shared";
import { createHandoffReadHandler, claimHandoffProviderAttempt, loadHandoffInstagramRun, recordHandoffInstagramRun } from "../handoff/read";
import { createHandoffReaders } from "../handoff/readers";
import { HANDOFF_READ_EVENT } from "../handoff/contract";
import { createSiteEnrichment } from "../handoff/site-enrichment";
import { createSiteVision, createInstagramVision } from "../handoff/site-vision";
import { createInstagramEnrichment } from "../handoff/instagram-enrichment";
import type { SiteReadingContext } from "../handoff/site-enrichment";
import { createBudgetedModelClient } from "../agents/budgeted-client";
import { AnthropicEquipeModelClient } from "../agents/anthropic-client";
import { DrizzleLedgerStore, estimateCostUsdCents } from "../agents/ledger";
import { resolveStrategistModel } from "../agents/roles";
import { EQUIPE_PROMPT_VERSION } from "../agents/prompts";
import { objectStorage } from "@/server/storage";
import { createWorkspaceAssetIfKeyAbsent, getWorkspaceAssetByKey } from "@/server/repositories/workspace-asset";
import { env } from "@/server/validation/env";
import { abortable } from "../handoff/safe-image-download";
const deps = createProdJobDeps();
const ledger = new DrizzleLedgerStore();
const anthropic = new AnthropicEquipeModelClient({ timeoutMs: 30_000 });
const visionClient = (context: SiteReadingContext, signal: AbortSignal) => ({ async chat(request: Parameters<AnthropicEquipeModelClient["chat"]>[0]) {
    signal.throwIfAborted();
    const [handoff] = await abortable(deps.uow.repos.handoffs.list(context), signal);
    if (!handoff || handoff.readingId !== context.readingId || handoff.step === "done") throw new Error("stale_reading");
    const model = resolveStrategistModel();
    if (!model.startsWith("claude-opus-")) throw new Error("site_vision_requires_opus");
    if (!env.ANTHROPIC_API_KEY) throw new Error("anthropic_api_key_missing");
    if (!(await abortable(claimHandoffProviderAttempt(moduleDepsFor(deps, context.workspaceId), context, "vision"), signal))) throw new Error("reading_failed");
    const account = await abortable(deps.uow.repos.accounts.get(context.workspaceId, context.accountId), signal);
    const free = account?.status === "free";
    const client = createBudgetedModelClient({ scope: context, repos: deps.uow.repos, ledger, client: () => { signal.throwIfAborted(); return anthropic; },
      free, model, role: "strategist", taskKind: "handoff_vision", now: () => deps.clock.now() });
    const response = await client.chat({ ...request, noRetries: true });
    if (!free) await ledger.record({ workspaceId: context.workspaceId, accountId: context.accountId, role: "strategist", model,
      taskKind: "handoff_vision", promptVersion: EQUIPE_PROMPT_VERSION, ...response.usage,
      costUsdCents: estimateCostUsdCents(model, response.usage.inputTokens, response.usage.outputTokens, response.usage.cacheReadTokens, response.usage.cacheWriteTokens) });
    return response;
  } });
const imageOptions = { storage: objectStorage, saveAsset: createWorkspaceAssetIfKeyAbsent, findAsset: getWorkspaceAssetByKey };
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
    process.env.INSTAGRAM_READER_PROVIDER === "apify" ? instagramEnrichment : undefined)({ event, step: step as unknown as JobStep });
});
