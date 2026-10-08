import { RasterRetryError, isRasterRetry } from "./raster-image";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { HANDOFF_GROUPS, MONTHLY_BUDGET_READING_ERROR, readingRun, isGroupFinished, type HandoffGroup, type HandoffItem } from "../domain/handoff";
import { parseLogoSurface } from "../domain/logo-surface";
import type { EquipeModuleDeps } from "../module/ports";
import { stableStringify } from "../module/shared";
import { executeCommand } from "../module/commands";
import { authorizeAccountExecution } from "../module/execution-authorization";
import { HANDOFF_READ_EVENT, type HandoffInstagramCostEvent } from "./contract";
import { isSocialProfileLink, normalizeInstagram, normalizeSocial, socialPlatformOf } from "./source";
import type { HandoffReaders, InstagramReadResult, SiteReadResult } from "./readers";
import { SiteReaderError } from "./readers/firecrawl";
import { InstagramReaderError } from "./readers/apify";
import type { SiteEnrichment, SiteReadingContext } from "./site-enrichment";
import type { InstagramEnrichment } from "./instagram-enrichment";
const eventSchema = z.object({ workspaceId: z.string().uuid(), accountId: z.string().uuid(), taskIntentId: z.string().uuid(), readingId: z.string().uuid(),
  source: z.object({ kind: z.enum(["site", "instagram"]), value: z.string(), normalized: z.string() }),
  groups: z.array(z.enum(HANDOFF_GROUPS)).min(1).max(6), runIds: z.record(z.string().uuid()) });
type Step = { run<T>(id: string, fn: () => Promise<T>): Promise<T> };
type ProviderContext = Pick<SiteReadingContext, "workspaceId" | "accountId" | "readingId" | "taskIntentId">;
export async function loadHandoffInstagramRun(deps: EquipeModuleDeps, context: ProviderContext) {
  const events = await deps.uow.repos.events.list(context, { eventType: "handoff.instagram_run" });
  const payload = events.find(e => (e.payload as { taskIntentId?: string }).taskIntentId === context.taskIntentId)?.payload as { providerRunId?: string } | undefined;
  return payload?.providerRunId ?? null;
}
export async function recordHandoffInstagramRun(deps: EquipeModuleDeps, context: ProviderContext, providerRunId: string, usageTotalUsd?: number | null) {
  await deps.uow.run(async repos => {
    await repos.accounts.get(context.workspaceId, context.accountId, { forUpdate: true });
    const dispatched = (await repos.events.list(context, { eventType: "handoff.instagram_dispatched" })).some(e => (e.payload as { taskIntentId?: string }).taskIntentId === context.taskIntentId);
    if (!dispatched) throw new Error("reading_failed");
    const runs = await repos.events.list(context, { eventType: "handoff.instagram_run" });
    const prior = runs.find(e => (e.payload as { taskIntentId?: string }).taskIntentId === context.taskIntentId)?.payload as { providerRunId?: string } | undefined;
    if (prior && prior.providerRunId !== providerRunId) throw new Error("reading_failed");
    const eventType = usageTotalUsd === undefined ? "handoff.instagram_run" : "handoff.instagram_usage";
    if (usageTotalUsd !== undefined && !prior) throw new Error("reading_failed");
    if (usageTotalUsd === undefined && prior) return;
    if (usageTotalUsd !== undefined && (await repos.events.list(context, { eventType })).some(e => {
      const p = e.payload as { taskIntentId?: string; usageTotalUsd?: number | null };
      return p.taskIntentId === context.taskIntentId && (p.usageTotalUsd !== null || usageTotalUsd === null);
    })) return;
    await repos.events.create(context, { actorType: "system", actorId: HANDOFF_READ_EVENT, actorRole: "system", eventType,
      payload: { taskIntentId: context.taskIntentId, readingId: context.readingId, providerRunId,
        usageTotalUsd: usageTotalUsd ?? null, costPending: usageTotalUsd == null }, occurredAt: deps.clock.now() });
  });
}
/**
 * What Firecrawl says it charged for a site reading, as an account event, so credits can be reconciled with the app's accounts (ticket 13, D-5).
 * One per reading: a redelivery records nothing new. Recorded whatever the outcome of the reading (a charged 404 cost its credit too).
 */
export async function recordHandoffSiteUsage(deps: EquipeModuleDeps, context: ProviderContext, creditsUsed: number) {
  await deps.uow.run(async repos => {
    await repos.accounts.get(context.workspaceId, context.accountId, { forUpdate: true });
    if ((await repos.events.list(context, { eventType: "handoff.site_usage" })).some(e => (e.payload as { taskIntentId?: string }).taskIntentId === context.taskIntentId)) return;
    await repos.events.create(context, { actorType: "system", actorId: HANDOFF_READ_EVENT, actorRole: "system", eventType: "handoff.site_usage",
      payload: { taskIntentId: context.taskIntentId, readingId: context.readingId, creditsUsed }, occurredAt: deps.clock.now() });
  });
}
/** A sync provider has no resumable remote run: an uncertain dispatch must never be silently repeated. */
export async function claimHandoffProviderAttempt(deps: EquipeModuleDeps, context: ProviderContext, provider: "site" | "instagram" | "vision") {
  return deps.uow.run(async repos => {
    await repos.accounts.get(context.workspaceId, context.accountId, { forUpdate: true });
    const allowed = await authorizeAccountExecution(repos, context);
    const [h] = await repos.handoffs.list(context);
    const intent = await repos.taskOutbox.get(context, context.taskIntentId);
    if (!allowed.ok || !h || h.step === "done" || h.readingId !== context.readingId || intent?.eventName !== HANDOFF_READ_EVENT) return false;
    const p = intent.data as { readingId: string; source: { kind: string }; groups: HandoffGroup[]; runIds: Record<string, string> };
    if ((provider !== "vision" && p.source.kind !== provider) || p.readingId !== context.readingId || !p.groups.some(g => readingRun(h.reading[g], p.source.kind as "site" | "instagram")?.taskIntentId === context.taskIntentId && !isGroupFinished(readingRun(h.reading[g], p.source.kind as "site" | "instagram")?.status))) return false;
    const eventType = `handoff.${provider}_dispatched`;
    if ((await repos.events.list(context, { eventType })).some(e => (e.payload as { taskIntentId?: string }).taskIntentId === context.taskIntentId)) return false;
    if ((await repos.events.list(context, { eventType: "handoff.read_not_billed" })).some(e => (e.payload as { taskIntentId?: string }).taskIntentId === context.taskIntentId)) return false;
    await repos.events.create(context, { actorType: "system", actorId: HANDOFF_READ_EVENT, actorRole: "system", eventType,
      payload: { taskIntentId: context.taskIntentId, readingId: context.readingId }, occurredAt: deps.clock.now() });
    return true;
  });
}
/** A terminal raster failure releases only the reading counter, once; provider/AI ledgers are untouched. */
export async function recordRasterRetry(deps: EquipeModuleDeps, context: SiteReadingContext, stage: string, reason: string) {
  return deps.uow.run(async repos => {
    await repos.accounts.get(context.workspaceId, context.accountId, { forUpdate: true });
    const events = await repos.events.list(context, { eventType: "handoff.raster_retry" });
    const previous = events.filter(e => (e.payload as { taskIntentId?: string }).taskIntentId === context.taskIntentId);
    const attempts = previous.filter(e => (e.payload as { stage?: string }).stage === stage).length + 1;
    const refunded = attempts >= 2 && !previous.some(e => (e.payload as { refunded?: boolean }).refunded);
    if (refunded) {
      const [h] = await repos.handoffs.list(context);
      if (h) await repos.handoffs.update(context, h.id, { readsUsed: Math.max(0, h.readsUsed - 1) });
    }
    await repos.events.create(context, { actorType: "system", actorId: HANDOFF_READ_EVENT, actorRole: "system", eventType: "handoff.raster_retry",
      payload: { taskIntentId: context.taskIntentId, readingId: context.readingId, stage, reason, attempts, refunded }, occurredAt: deps.clock.now() });
    return attempts;
  });
}
/**
 * Reasons a group came back EMPTY although the reading itself worked: the vision could not read a palette (a refused call, an image it could not open), or
 * every logo / image found was too small to use (ticket 13, D-8). The profile, the page and the photos were read, so these are NOT FOUND, never a failed
 * reading: they must not block the summary or call the Instagram read a failure, and the person chooses, types or uploads what is missing.
 */
const NOT_FOUND_REASONS: Partial<Record<HandoffGroup, readonly string[]>> = {
  colors: ["site_vision_failed", "instagram_vision_failed"], logo: ["logo_too_small", "logo_unsupported_format"], images: ["images_too_small", "images_not_found"],
};
/** The plate a logo was measured to ask for (ticket 16), as the field a captured item carries; nothing when it was not measured or needs none. */
const surfaceOf = (value: unknown): Pick<HandoffItem, "surface"> => { const surface = parseLogoSurface(value); return surface ? { surface } : {}; };
function capturedGroups(kind: "site" | "instagram", data: SiteReadResult | InstagramReadResult, handle: string, runId: string) {
  const captured: Record<HandoffGroup, HandoffItem[]> = { name: [], logo: [], colors: [], fonts: [], networks: [], images: [] };
  const add = (group: HandoffGroup, value: string, extra: Partial<HandoffItem> = {}) => {
    if (captured[group].length < 30 && !captured[group].some(item => item.value === value)) captured[group].push({ id: `${runId}:${group}:${captured[group].length}`, value, origin: kind, ...extra });
  };
  if (kind === "site") {
    const site = data as SiteReadResult;
    if ((site.statusCode ?? 200) >= 400) throw new Error("site_unavailable");
    const name = site.siteName?.trim() || site.title?.trim();
    if (name) add("name", name.slice(0, 200));
    if (site.branding?.logo) add("logo", site.branding.logo.url, { key: site.branding.logo.key, ...(site.branding.logo.assetId ? { id: site.branding.logo.assetId } : {}), ...surfaceOf(site.branding.logo.surface) });
    for (const color of site.branding?.colors ?? []) if (/^#[0-9a-f]{6}$/i.test(color)) add("colors", color);
    for (const font of site.branding?.fonts ?? []) add("fonts", font);
    for (const link of site.links) {
      try {
        const platform = socialPlatformOf(new URL(link).hostname);
        if (platform === "instagram") add("networks", normalizeInstagram(link), { platform });
        // A share button, a video or a playlist is not a network of the brand (and would be a dead address once the query is cleaned).
        else if (platform && isSocialProfileLink(platform, link)) add("networks", normalizeSocial(platform, link), { platform });
      } catch { /* A malformed public link is not a social profile. */ }
    }
    for (const image of site.images.slice(0, 30)) add("images", image.url, { key: image.key, width: image.width, height: image.height, ...(image.assetId ? { id: image.assetId } : {}) });
  } else {
    const instagram = data as InstagramReadResult;
    if (!instagram.exists || instagram.isPrivate) throw new Error(instagram.exists ? "instagram_private" : "instagram_not_found");
    if (instagram.name?.trim()) add("name", instagram.name.trim().slice(0, 200));
    if (instagram.avatarUrl) add("logo", instagram.avatarUrl, { key: instagram.avatarKey, ...(instagram.avatarAssetId ? { id: instagram.avatarAssetId } : {}), ...surfaceOf(instagram.avatarSurface) });
    for (const color of instagram.colors ?? []) if (/^#[0-9a-f]{6}$/i.test(color)) add("colors", color);
    add("networks", handle, { platform: "instagram" });
    for (const post of instagram.posts.slice(0, 12)) add("images", post.imageUrl, { key: post.key, caption: post.caption, width: post.width, height: post.height, ...(post.assetId ? { id: post.assetId } : {}) });
  }
  return captured;
}
export type HandoffReadOptions = {
  /** Starts the function that reads the provider's cost (ticket 13, D-4). Without it the cost is never read, and stays unknown. */
  dispatchInstagramCost?: (event: HandoffInstagramCostEvent) => Promise<unknown>;
  /** Whether the account's monthly AI budget is used up (spec 2026-10-07 §3); false on the free plan, whose lifetime cap is checked per call. */
  monthlyBudgetExhausted?: (scope: { workspaceId: string; accountId: string }) => Promise<boolean>;
};
export function createHandoffReadHandler(deps: EquipeModuleDeps, readers: HandoffReaders, siteEnrichment?: SiteEnrichment, instagramEnrichment?: InstagramEnrichment, options: HandoffReadOptions = {}) {
  return async ({ event, step }: { event: { data: unknown }; step: Step }) => {
    const p = eventSchema.parse(event.data);
    const scope = { workspaceId: p.workspaceId, accountId: p.accountId };
    const claimed = await step.run(`claim-${p.taskIntentId}`, () => deps.uow.run(async (repos) => {
      await repos.accounts.get(scope.workspaceId, scope.accountId, { forUpdate: true });
      const intent = await repos.taskOutbox.get(scope, p.taskIntentId);
      const [h] = await repos.handoffs.list(scope);
      if (!h || h.step === "done" || h.readingId !== p.readingId || intent?.eventName !== HANDOFF_READ_EVENT || stableStringify(intent.data) !== stableStringify({ readingId: p.readingId, source: p.source, groups: p.groups, runIds: p.runIds })) return false;
      let unfinished = false;
      for (const group of p.groups) {
        const run = readingRun(h.reading[group], p.source.kind);
        if (run?.runId !== p.runIds[group] || run?.taskIntentId !== p.taskIntentId) return false;
        if (!isGroupFinished(run.status)) unfinished = true;
      }
      if (!unfinished) return false;
      // Only an event that still has work to do reaches the gate. The outbox already marked it sent, so closing the gate must not
      // acknowledge it: it fails here (retried by Inngest, replayable) and the same event runs once the gate opens.
      const allowed = await authorizeAccountExecution(repos, scope);
      if (!allowed.ok && allowed.error.code === "unknown_account") return false;
      if (!allowed.ok) throw new Error("handoff_read_gated");
      if (!(await repos.events.list(scope)).some(e => e.eventType === "handoff.read_claimed" && (e.payload as { taskIntentId?: string })?.taskIntentId === p.taskIntentId)) {
        await repos.events.create(scope, { actorType: "system", actorId: HANDOFF_READ_EVENT, actorRole: "system", eventType: "handoff.read_claimed", payload: { taskIntentId: p.taskIntentId }, occurredAt: deps.clock.now() });
      }
      return { handoffId: h.id };
    }));
    if (!claimed) return { ignored: true };
    const context: SiteReadingContext = { ...scope, handoffId: claimed.handoffId, readingId: p.readingId, taskIntentId: p.taskIntentId };
    // With the monthly AI budget used up nothing is read (MONTHLY_BUDGET_READING_ERROR): every group fails unbilled, the read is given back, and the card
    // offers to try again without spending one.
    if (options.monthlyBudgetExhausted && await step.run(`monthly-budget-${p.taskIntentId}`, () => options.monthlyBudgetExhausted!(scope))) {
      for (const group of p.groups) {
        await step.run(`record-${p.taskIntentId}-${group}`, async () => {
          const outcome = await executeCommand(deps, { ...scope, actor: { kind: "system", job: HANDOFF_READ_EVENT } }, {
            type: "handoff_record_group", payload: { readingId: p.readingId, runId: p.runIds[group], taskIntentId: p.taskIntentId, group,
              result: { status: "failed", items: [], error: MONTHLY_BUDGET_READING_ERROR } },
          });
          if (!outcome.ok) throw new Error(outcome.error.code);
          return outcome.value.data;
        });
      }
      return { refused: MONTHLY_BUDGET_READING_ERROR };
    }
    for (const group of p.groups) {
      await step.run(`start-${p.taskIntentId}-${group}`, async () => {
        const result = await executeCommand(deps, { ...scope, actor: { kind: "system", job: HANDOFF_READ_EVENT } }, {
          type: "handoff_record_group", payload: { readingId: p.readingId, runId: p.runIds[group], taskIntentId: p.taskIntentId, group, result: { status: "running", items: [] } },
        });
        if (!result.ok) throw new Error(result.error.code);
        return result.value.data;
      });
    }
    const result = await step.run(`reader-${p.taskIntentId}`, async (): Promise<{ data: SiteReadResult | InstagramReadResult | null; error: string | null; creditsUsed?: number }> => {
      try {
        const data = p.source.kind === "site" ? await readers.site.read(p.source.normalized, context) : await readers.instagram.profile(p.source.normalized, context);
        capturedGroups(p.source.kind, data, p.source.normalized, p.taskIntentId); // Reject inaccessible sources before saving any content/assets.
        return { data, error: null };
      } catch (e) {
        const code = e instanceof SiteReaderError || e instanceof InstagramReaderError ? e.message : e instanceof Error && ["reader_unavailable", "site_unavailable", "instagram_private", "instagram_not_found"].includes(e.message) ? e.message : "reading_failed";
        // A charged answer that became an error (a 404) still says what it cost.
        return { data: null, error: code, ...(e instanceof SiteReaderError && e.creditsUsed !== undefined ? { creditsUsed: e.creditsUsed } : {}) };
      }
    });
    const data = result.data;
    const credits = p.source.kind === "site" ? (data as SiteReadResult | null)?.creditsUsed ?? result.creditsUsed : undefined;
    // Best effort: a credit count that cannot be written never turns a read page into a failure.
    if (credits !== undefined) { try { await step.run(`site-usage-${p.taskIntentId}`, () => recordHandoffSiteUsage(deps, context, credits)); } catch { /* The reading stands. */ } }
    const site = p.source.kind === "site" && data ? data as SiteReadResult : null;
    // Only image steps retry: the durable reader result and completed image/model steps are reused.
    const rasterStep = <T>(stage: string, run: () => Promise<T>, terminal: () => T) => step.run(`${stage}-${p.taskIntentId}`, async () => {
      try { return await run(); }
      catch (error) {
        if (!(error instanceof RasterRetryError)) throw error;
        const attempts = await recordRasterRetry(deps, context, stage, error.reason);
        logger.error("[equipe-handoff] raster step failed", { readingId: p.readingId, stage, reason: error.reason, attempts, terminal: attempts >= 2 });
        if (attempts < 2) throw error; // Existing Inngest retry (one); no unbounded local retry loop.
        return terminal();
      }
    });
    // Independent durable groups: name/networks arrive immediately while identity/images finish concurrently.
    const identity = site && siteEnrichment && p.groups.some(g => ["logo", "colors", "fonts"].includes(g)) ? rasterStep("site-identity", () => siteEnrichment.identity(site, context), () => ({ branding: { ...site.branding, logo: undefined, colors: [] }, groupErrors: { logo: "raster_system_failed", colors: "raster_system_failed", fonts: "raster_system_failed" } })) : null;
    const images = site && siteEnrichment && p.groups.includes("images") ? rasterStep("site-images", () => siteEnrichment.images(site, context), () => ({ images: [], groupErrors: { images: "raster_system_failed" } })) : null;
    const instagram = p.source.kind === "instagram" && data ? data as InstagramReadResult : null;
    const instagramImages = instagram && instagramEnrichment && p.groups.some(g => ["logo", "images", "colors"].includes(g)) ? rasterStep("instagram-images", () => instagramEnrichment.images(instagram, context), () => ({ ...instagram, avatarUrl: null, posts: [], groupErrors: { logo: "raster_system_failed", images: "raster_system_failed", colors: "raster_system_failed" } })) : null;
    // The identity reads what the images step stored, but a step NEVER waits for another step inside its own callback: Inngest runs the steps of a function one at
    // a time (concurrency 1 per account) and in any order, so the callback of the one picked first would wait for a step that cannot start, holding the only place,
    // and the reading would hang for good (ticket 13: the Instagram reading stopped after the reader). The dependency is chained here, in the function body, where
    // Inngest replays it: the identity step exists once the images step is in.
    const instagramIdentity = instagramImages && instagramEnrichment && p.groups.includes("colors")
      ? instagramImages.then(images => rasterStep<Pick<InstagramReadResult, "colors" | "groupErrors">>("instagram-identity", () => images.groupErrors?.colors === "raster_system_failed" ? Promise.resolve({ colors: [], groupErrors: { colors: "raster_system_failed" } }) : instagramEnrichment.identity(images, context), () => ({ colors: [], groupErrors: { colors: "raster_system_failed" } }))) : null;
    instagramIdentity?.catch(() => undefined); // When the colors were not asked for nobody awaits it: its failure must not be an unhandled rejection (the groups that do await it still see it).
    let records: Promise<unknown> = Promise.resolve();
    const outcomes = await Promise.allSettled(p.groups.map(async group => {
      let enriched = data; let error = result.error;
      try {
        if (site && ["logo", "colors", "fonts"].includes(group) && identity) enriched = { ...site, ...await identity };
        if (site && group === "images" && images) enriched = { ...site, ...await images };
        if (instagram && ["logo", "images", "colors"].includes(group) && instagramImages) enriched = await instagramImages;
        if (instagram && group === "colors" && instagramIdentity) enriched = { ...enriched as InstagramReadResult, ...await instagramIdentity };
        if (enriched) error = enriched.groupErrors?.[group as keyof NonNullable<SiteReadResult["groupErrors"]>] ?? error;
      } catch (cause) { if (isRasterRetry(cause)) throw cause; error = "reading_failed"; }
      const items = !error && enriched ? capturedGroups(p.source.kind, enriched, p.source.normalized, p.taskIntentId)[group] : [];
      const notFound = !!error && !!NOT_FOUND_REASONS[group]?.includes(error);
      const text = data ? (site ? site.markdown : (data as InstagramReadResult).bio) : "";
      const content = text.trim() ? [{ id: `${p.taskIntentId}:public-content`, value: text.slice(0, 50000), origin: p.source.kind }] : [];
      // Reads are parallel; commands on a shared transaction client must remain sequential (#574).
      const record = records.then(() => step.run(`record-${p.taskIntentId}-${group}`, async () => {
        const outcome = await executeCommand(deps, { ...scope, actor: { kind: "system", job: HANDOFF_READ_EVENT } }, {
          type: "handoff_record_group", payload: { readingId: p.readingId, runId: p.runIds[group], taskIntentId: p.taskIntentId, group,
            result: { ...(group === p.groups[0] ? { content } : {}), status: error && !notFound ? "failed" : items.length ? "found" : "not_found", items, ...(error ? { error } : {}) } },
        });
        if (!outcome.ok) throw new Error(outcome.error.code);
        return outcome.value.data;
      }));
      records = record.catch(() => {});
      await record;
    }));
    // The provider's cost stabilises about ten seconds after a run ends (ticket 13, D-4). Reading it is a function of its own, told here, AFTER every group is
    // recorded: as a step of this function it held the screen for those seconds, because the steps of a function run one at a time (concurrency 1 per account), in
    // an order this function does not control. A run that was dispatched is measured whatever the outcome (a private profile was billed too); a cost that cannot be
    // asked for never turns a recorded reading into a failure, and stays unknown, never free.
    if (p.source.kind === "instagram" && readers.instagram.measureCost && options.dispatchInstagramCost) {
      try { await step.run(`instagram-cost-dispatch-${p.taskIntentId}`, async () => { await options.dispatchInstagramCost!({ ...context }); return null; }); } catch { /* The reading stands. */ }
    }
    const failed = outcomes.find(outcome => outcome.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    return { recorded: p.groups.length };
  };
}
