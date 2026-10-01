import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { FirecrawlSiteReader } from "./readers/firecrawl";
import { FakeInstagramReader } from "./readers";
import { claimHandoffProviderAttempt, createHandoffReadHandler } from "./read";
import { createSiteEnrichment, type SiteEnrichment, type SiteReadingContext } from "./site-enrichment";
import { HANDOFF_READ_EVENT } from "./contract";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { executeCommand } from "../module/commands";
import { HANDOFF_GROUPS, type HandoffState } from "../domain/handoff";
import { InMemoryObjectStorage } from "@/server/storage/in-memory-object-storage";

describe("PR609 independent review probes", () => {
  it("keeps a possibly billed attempt counted after lost ACK and later DNS failure", async () => {
    const t = makeTestDeps(); const workspaceId = uuid(); const userId = `user-${uuid()}`;
    t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "ana@example.com", emailVerified: true, role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
    const opened = await executeCommand(t.deps, { actor: { kind: "system", job: "free-open" }, workspaceId }, { type: "open_free_account", payload: { userId } });
    if (!opened.ok) throw new Error(opened.error.code);
    const scope = { workspaceId, accountId: opened.value.accountId! };
    const [person] = await t.deps.uow.repos.people.list(scope);
    const [initial] = await t.deps.uow.repos.handoffs.list(scope);
    const selected = await executeCommand(t.deps, { ...scope, actor: { kind: "client_person", role: "approver", personId: person!.id } }, { type: "handoff_set_source", payload: { expectedStep: initial!.step, expectedVersion: initial!.version, kind: "site", value: "https://acme.com" } });
    if (!selected.ok) throw new Error(selected.error.code);
    const [row] = await t.deps.uow.repos.handoffs.list(scope);
    const taskIntentId = row!.reading.name!.taskIntentId;
    const context = { ...scope, readingId: row!.readingId!, taskIntentId };
    const beforeRequest = () => claimHandoffProviderAttempt(t.deps, context, "site");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { markdown: "Acme", metadata: { statusCode: 200 } } })));
    const first = new FirecrawlSiteReader({ apiKey: "test-only", lookup: async () => [{ address: "93.184.216.34", family: 4 }], beforeRequest, fetch: fetchImpl });
    await first.read(row!.source!.normalized); // POST completed; its step result/ACK was lost.
    const resumed = new FirecrawlSiteReader({ apiKey: "test-only", beforeRequest, fetch: fetchImpl, lookup: async () => { throw Object.assign(new Error("not found"), { code: "ENOTFOUND" }); } });
    const event = { data: { ...scope, taskIntentId, readingId: row!.readingId, source: row!.source, groups: [...HANDOFF_GROUPS], runIds: Object.fromEntries(HANDOFF_GROUPS.map(g => [g, row!.reading[g]!.runId])) } };
    await createHandoffReadHandler(t.deps, { site: resumed, instagram: new FakeInstagramReader() })({ event, step: { run: async (_id, fn) => fn() } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "handoff.site_dispatched" })).toHaveLength(1);
    const [after] = await t.deps.uow.repos.handoffs.list(scope);
    expect(after!.readsUsed).toBe(1);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "handoff.read_not_billed" })).toHaveLength(0);
  });

  it("does not refund a non-2xx Firecrawl response even when its body mentions DNS", async () => {
    const reader = new FirecrawlSiteReader({ apiKey: "test-only", lookup: async () => [{ address: "93.184.216.34", family: 4 }], fetch: vi.fn(async () => new Response(JSON.stringify({ success: false, code: "DNS_ERROR", error: "net::ERR_NAME_NOT_RESOLVED" }), { status: 500 })) });
    const error = await reader.read("https://acme.com").catch(e => e);
    expect(error.unbilled).toBe(false);
  });

  it("identity finishes by its deadline when its own storage GET stalls", async () => {
    const bytes = await sharp({ create: { width: 600, height: 600, channels: 3, background: "white" } }).jpeg().toBuffer();
    const storage = new InMemoryObjectStorage();
    storage.get = async () => new Promise<Buffer>(() => {});
    const enrichment = createSiteEnrichment({ storage, findAsset: async () => null, saveAsset: async data => ({ id: uuid(), key: data.key, width: data.width ?? null, height: data.height ?? null }), download: async () => ({ bytes, contentType: "image/jpeg" }), timeoutMs: 50, vision: () => async () => ({ logoConfirmed: true, colors: ["#111111", "#222222", "#333333"], fonts: [] }) });
    const result = await Promise.race([enrichment.identity({ title: "Acme", siteName: "Acme", markdown: "", links: [], images: [], screenshotUrl: "https://acme.com/print.jpg", branding: { logo: { url: "https://acme.com/logo.jpg" } } }, { workspaceId: uuid(), accountId: uuid(), handoffId: uuid(), readingId: uuid(), taskIntentId: uuid() }).then(() => "finished"), new Promise<string>(resolve => setTimeout(() => resolve("hung"), 200))]);
    expect(result).toBe("finished");
  });

  // --- fixup-01 extensions (review-01 P1/P2) ---------------------------------

  async function openFreeHandoffWithSite(t: ReturnType<typeof makeTestDeps>) {
    const workspaceId = uuid(); const userId = `user-${uuid()}`;
    t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "ana@example.com", emailVerified: true, role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
    const opened = await executeCommand(t.deps, { actor: { kind: "system", job: "free-open" }, workspaceId }, { type: "open_free_account", payload: { userId } });
    if (!opened.ok) throw new Error(opened.error.code);
    const scope = { workspaceId, accountId: opened.value.accountId! };
    const [person] = await t.deps.uow.repos.people.list(scope);
    const approver = { kind: "client_person" as const, role: "approver" as const, personId: person!.id };
    const [initial] = await t.deps.uow.repos.handoffs.list(scope);
    const selected = await executeCommand(t.deps, { ...scope, actor: approver }, { type: "handoff_set_source", payload: { expectedStep: initial!.step, expectedVersion: initial!.version, kind: "site", value: "https://acme.com" } });
    if (!selected.ok) throw new Error(selected.error.code);
    const row = async () => (await t.deps.uow.repos.handoffs.list(scope))[0]! as HandoffState & { id: string };
    return { t, scope, approver, row };
  }

  it("P1: a missing API key on a RETRY after the attempt was already dispatched never refunds readsUsed (a POST may have gone out)", async () => {
    const { t, scope, row } = await openFreeHandoffWithSite(makeTestDeps());
    const first = await row();
    const taskIntentId = first.reading.name!.taskIntentId;
    const context = { ...scope, readingId: first.readingId!, taskIntentId };
    const beforeRequest = () => claimHandoffProviderAttempt(t.deps, context, "site");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { markdown: "Acme", metadata: { statusCode: 200 } } })));
    const dispatched = new FirecrawlSiteReader({ apiKey: "test-only", lookup: async () => [{ address: "93.184.216.34", family: 4 }], beforeRequest, fetch: fetchImpl });
    await dispatched.read(first.source!.normalized); // POST completed; its step result/ACK was lost.
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "handoff.site_dispatched" })).toHaveLength(1);

    // apiKey: "" is deliberate — the nullish-coalescing env fallback only
    // triggers on null/undefined, so "" still exercises the missing-key path.
    const resumedWithNoKey = new FirecrawlSiteReader({ apiKey: "", beforeRequest, fetch: fetchImpl, lookup: async () => [{ address: "93.184.216.34", family: 4 }] });
    const event = { data: { ...scope, taskIntentId, readingId: first.readingId, source: first.source, groups: [...HANDOFF_GROUPS], runIds: Object.fromEntries(HANDOFF_GROUPS.map(g => [g, first.reading[g]!.runId])) } };
    await createHandoffReadHandler(t.deps, { site: resumedWithNoKey, instagram: new FakeInstagramReader() })({ event, step: { run: async (_id, fn) => fn() } });

    expect(fetchImpl).toHaveBeenCalledTimes(1); // the resumed attempt never re-POSTs: it fails locally before that
    const after = await row();
    expect(after.readsUsed).toBe(1);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "handoff.read_not_billed" })).toHaveLength(0);
  });

  it("P2: an HTTP-200 DNS failure Firecrawl reports for a DISPATCHED attempt refunds readsUsed, with a marker event naming site_provider_dns", async () => {
    const { t, scope, row } = await openFreeHandoffWithSite(makeTestDeps());
    const first = await row();
    expect(first.readsUsed).toBe(1);
    const taskIntentId = first.reading.name!.taskIntentId;
    const context = { ...scope, readingId: first.readingId!, taskIntentId };
    const beforeRequest = () => claimHandoffProviderAttempt(t.deps, context, "site");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: false, code: "DNS_ERROR", error: "could not resolve host" }), { status: 200 }));
    const reader = new FirecrawlSiteReader({ apiKey: "test-only", lookup: async () => [{ address: "93.184.216.34", family: 4 }], beforeRequest, fetch: fetchImpl });
    const event = { data: { ...scope, taskIntentId, readingId: first.readingId, source: first.source, groups: [...HANDOFF_GROUPS], runIds: Object.fromEntries(HANDOFF_GROUPS.map(g => [g, first.reading[g]!.runId])) } };
    await createHandoffReadHandler(t.deps, { site: reader, instagram: new FakeInstagramReader() })({ event, step: { run: async (_id, fn) => fn() } });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "handoff.site_dispatched" })).toHaveLength(1);
    const after = await row();
    expect(after.readsUsed).toBe(0); // refunded
    for (const group of HANDOFF_GROUPS) expect(after.reading[group]).toMatchObject({ status: "failed", error: "site_provider_dns" });
    // The SAME taskIntentId is shared by all 6 groups: only ONE refund marker, not six.
    const notBilled = await t.deps.uow.repos.events.list(scope, { eventType: "handoff.read_not_billed" });
    expect(notBilled).toHaveLength(1);
    expect(notBilled[0]!.payload).toMatchObject({ taskIntentId, reason: "site_provider_dns" });
  });

  it("P2: site_provider_dns idempotency — a SECOND group result under the same taskIntentId never refunds twice", async () => {
    const { t, scope, row } = await openFreeHandoffWithSite(makeTestDeps());
    const first = await row();
    const taskIntentId = first.reading.name!.taskIntentId;
    await claimHandoffProviderAttempt(t.deps, { ...scope, readingId: first.readingId!, taskIntentId }, "site");
    const recordFailed = async (group: "name" | "logo", error: string) => {
      const current = await row(); const g = current.reading[group]!;
      return executeCommand(t.deps, { ...scope, actor: { kind: "system", job: HANDOFF_READ_EVENT } }, {
        type: "handoff_record_group", payload: { readingId: current.readingId!, runId: g.runId, taskIntentId: g.taskIntentId, group, result: { status: "failed", items: [], error } },
      });
    };
    const firstOutcome = await recordFailed("name", "site_provider_dns");
    expect(firstOutcome.ok).toBe(true);
    expect((await row()).readsUsed).toBe(0);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "handoff.read_not_billed" })).toHaveLength(1);

    // "logo" shares the SAME taskIntentId as "name" (one reading dispatch, one claim).
    const secondOutcome = await recordFailed("logo", "site_provider_dns");
    expect(secondOutcome.ok).toBe(true);
    expect((await row()).readsUsed).toBe(0);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "handoff.read_not_billed" })).toHaveLength(1);
  });

  it("P2: once an intent has been refunded (read_not_billed), it can never claim a dispatch afterward — even with other groups still pending", async () => {
    const { t, scope, row } = await openFreeHandoffWithSite(makeTestDeps());
    const first = await row();
    const nameGroup = first.reading.name!;
    const taskIntentId = nameGroup.taskIntentId;
    // A LOCAL, free failure on "name" BEFORE any dispatch: refunds readsUsed and
    // marks the intent as read_not_billed. "logo"/"colors"/etc. remain pending.
    const localFailure = await executeCommand(t.deps, { ...scope, actor: { kind: "system", job: HANDOFF_READ_EVENT } }, {
      type: "handoff_record_group", payload: { readingId: first.readingId!, runId: nameGroup.runId, taskIntentId, group: "name", result: { status: "failed", items: [], error: "site_dns_or_address" } },
    });
    expect(localFailure.ok).toBe(true);
    const afterRefund = await row();
    expect(afterRefund.readsUsed).toBe(0);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "handoff.read_not_billed" })).toHaveLength(1);
    expect(afterRefund.reading.logo?.status).toBe("pending"); // other groups genuinely still open

    // A race where the dispatch call loses to the refund must still be refused:
    // an intent that has already been proven free cannot retroactively become billed.
    const claimed = await claimHandoffProviderAttempt(t.deps, { ...scope, readingId: first.readingId!, taskIntentId }, "site");
    expect(claimed).toBe(false);
    expect(await t.deps.uow.repos.events.list(scope, { eventType: "handoff.site_dispatched" })).toEqual([]);
  });

  it("P2: site_provider_dns obsolescence — a delayed result for an OBSOLETE reading still refunds, even though the group update itself is ignored", async () => {
    const { t, scope, approver, row } = await openFreeHandoffWithSite(makeTestDeps());
    const stale = await row();
    const staleReadingId = stale.readingId!;
    const staleColors = stale.reading.colors!;
    await claimHandoffProviderAttempt(t.deps, { ...scope, readingId: staleReadingId, taskIntentId: stale.reading.name!.taskIntentId }, "site");

    // A billed failure on "name" makes the retry legitimate (some group failed).
    await executeCommand(t.deps, { ...scope, actor: { kind: "system", job: HANDOFF_READ_EVENT } }, { type: "handoff_record_group",
      payload: { readingId: staleReadingId, runId: stale.reading.name!.runId, taskIntentId: stale.reading.name!.taskIntentId, group: "name", result: { status: "failed", items: [], error: "site_unavailable" } } });
    const beforeRetry = await row();
    const retried = await executeCommand(t.deps, { ...scope, actor: approver }, { type: "handoff_retry_reading", payload: { expectedStep: beforeRetry.step, expectedVersion: beforeRetry.version } });
    if (!retried.ok) throw new Error(retried.error.code);
    const fresh = await row();
    expect(fresh.readsUsed).toBe(2);
    expect(fresh.readingId).not.toBe(staleReadingId);

    // A late, HTTP-200 DNS-reported failure arrives for the OLD reading's "colors" group.
    const late = await executeCommand(t.deps, { ...scope, actor: { kind: "system", job: HANDOFF_READ_EVENT } }, { type: "handoff_record_group",
      payload: { readingId: staleReadingId, runId: staleColors.runId, taskIntentId: staleColors.taskIntentId, group: "colors", result: { status: "failed", items: [], error: "site_provider_dns" } } });
    expect(late.ok && late.value.data).toEqual({ ignored: true });

    const after = await row();
    expect(after.readsUsed).toBe(1); // the stale reading's proven-free failure still released its admission
    const events = await t.deps.uow.repos.events.list(scope, { eventType: "handoff.read_not_billed" });
    expect(events).toEqual([expect.objectContaining({ payload: expect.objectContaining({ taskIntentId: staleColors.taskIntentId, reason: "site_provider_dns" }) })]);
    expect(after.reading.colors).toEqual(fresh.reading.colors); // the CURRENT reading's group is untouched
  });

  it.each([
    ["identity", (e: SiteEnrichment, data: Parameters<SiteEnrichment["identity"]>[0], ctx: SiteReadingContext) => e.identity(data, ctx)],
    ["images", (e: SiteEnrichment, data: Parameters<SiteEnrichment["images"]>[0], ctx: SiteReadingContext) => e.images(data, ctx)],
  ] as const)("P2: %s finishes by its own deadline when the asset-repo lookup (findAsset) stalls, never a global hang", async (_group, run) => {
    const bytes = await sharp({ create: { width: 600, height: 600, channels: 3, background: "white" } }).jpeg().toBuffer();
    const storage = new InMemoryObjectStorage();
    const enrichment = createSiteEnrichment({
      storage,
      findAsset: async () => new Promise<null>(() => {}), // hangs forever — the P2 deadline must still bound it
      saveAsset: async data => ({ id: uuid(), key: data.key, width: data.width ?? null, height: data.height ?? null }),
      download: async () => ({ bytes, contentType: "image/jpeg" }),
      timeoutMs: 50,
      vision: () => async () => ({ logoConfirmed: true, colors: ["#111111", "#222222", "#333333"], fonts: [] }),
    });
    const data = { title: "Acme", siteName: "Acme", markdown: "", links: [], images: [{ url: "https://acme.com/a.jpg" }], screenshotUrl: "https://acme.com/print.jpg", branding: { logo: { url: "https://acme.com/logo.jpg" } } };
    const context: SiteReadingContext = { workspaceId: uuid(), accountId: uuid(), handoffId: uuid(), readingId: uuid(), taskIntentId: uuid() };
    const result = await Promise.race([
      run(enrichment, data, context),
      new Promise<string>(resolve => setTimeout(() => resolve("hung"), 200)),
    ]);
    expect(result).toMatchObject({ groupErrors: _group === "identity" ? { logo: "logo_download_failed", colors: "site_vision_failed" } : { images: "image_download_failed" } });
  });

  it.each([
    ["identity", (e: SiteEnrichment, data: Parameters<SiteEnrichment["identity"]>[0], ctx: SiteReadingContext) => e.identity(data, ctx)],
    ["images", (e: SiteEnrichment, data: Parameters<SiteEnrichment["images"]>[0], ctx: SiteReadingContext) => e.images(data, ctx)],
  ] as const)("P2: %s finishes by its own deadline when the asset-repo save (saveAsset) stalls, never a global hang", async (_group, run) => {
    const bytes = await sharp({ create: { width: 600, height: 600, channels: 3, background: "white" } }).jpeg().toBuffer();
    const storage = new InMemoryObjectStorage();
    const enrichment = createSiteEnrichment({
      storage,
      findAsset: async () => null, // resolves promptly: execution reaches download/decode/put, then stalls on save
      saveAsset: async () => new Promise<null>(() => {}), // hangs forever — the P2 deadline must still bound it
      download: async () => ({ bytes, contentType: "image/jpeg" }),
      timeoutMs: 50,
      vision: () => async () => ({ logoConfirmed: true, colors: ["#111111", "#222222", "#333333"], fonts: [] }),
    });
    const data = { title: "Acme", siteName: "Acme", markdown: "", links: [], images: [{ url: "https://acme.com/a.jpg" }], screenshotUrl: "https://acme.com/print.jpg", branding: { logo: { url: "https://acme.com/logo.jpg" } } };
    const context: SiteReadingContext = { workspaceId: uuid(), accountId: uuid(), handoffId: uuid(), readingId: uuid(), taskIntentId: uuid() };
    const result = await Promise.race([
      run(enrichment, data, context),
      new Promise<string>(resolve => setTimeout(() => resolve("hung"), 200)),
    ]);
    expect(result).toMatchObject({ groupErrors: _group === "identity" ? { logo: "logo_download_failed", colors: "site_vision_failed" } : { images: "image_download_failed" } });
  });

  it.each([
    ["identity", (e: SiteEnrichment, data: Parameters<SiteEnrichment["identity"]>[0], ctx: SiteReadingContext) => e.identity(data, ctx)],
    ["images", (e: SiteEnrichment, data: Parameters<SiteEnrichment["images"]>[0], ctx: SiteReadingContext) => e.images(data, ctx)],
  ] as const)("P2: %s never starts a download when the asset-repo lookup resolves LATE, after its own deadline already passed", async (_group, run) => {
    const bytes = await sharp({ create: { width: 600, height: 600, channels: 3, background: "white" } }).jpeg().toBuffer();
    const storage = new InMemoryObjectStorage();
    const download = vi.fn(async () => ({ bytes, contentType: "image/jpeg" }));
    const enrichment = createSiteEnrichment({
      storage,
      findAsset: async () => { await new Promise(resolve => setTimeout(resolve, 150)); return null; }, // resolves well AFTER the 50ms deadline
      saveAsset: async data => ({ id: uuid(), key: data.key, width: data.width ?? null, height: data.height ?? null }),
      download,
      timeoutMs: 50,
      vision: () => async () => ({ logoConfirmed: true, colors: ["#111111", "#222222", "#333333"], fonts: [] }),
    });
    const data = { title: "Acme", siteName: "Acme", markdown: "", links: [], images: [{ url: "https://acme.com/a.jpg" }], screenshotUrl: "https://acme.com/print.jpg", branding: { logo: { url: "https://acme.com/logo.jpg" } } };
    const context: SiteReadingContext = { workspaceId: uuid(), accountId: uuid(), handoffId: uuid(), readingId: uuid(), taskIntentId: uuid() };
    await Promise.race([run(enrichment, data, context).catch(() => undefined), new Promise(resolve => setTimeout(resolve, 250))]);
    await new Promise(resolve => setTimeout(resolve, 160)); // Observe the late lookup completing, not just the timeout.
    expect(download).not.toHaveBeenCalled();
  });

  it("P2: identity never starts the vision (chat) call when its OWN stored-bytes GET (logo re-fetch before normalizing) resolves LATE, after the deadline already passed", async () => {
    const bytes = await sharp({ create: { width: 600, height: 600, channels: 3, background: "white" } }).jpeg().toBuffer();
    class DelayedGetStorage extends InMemoryObjectStorage {
      async get(key: string) { await new Promise(resolve => setTimeout(resolve, 150)); return super.get(key); }
    }
    const storage = new DelayedGetStorage();
    const visionFn = vi.fn(async () => ({ logoConfirmed: true, colors: ["#111111", "#222222", "#333333"], fonts: [] }));
    const enrichment = createSiteEnrichment({
      storage,
      findAsset: async () => null,
      saveAsset: async data => ({ id: uuid(), key: data.key, width: data.width ?? null, height: data.height ?? null }),
      download: async () => ({ bytes, contentType: "image/jpeg" }),
      timeoutMs: 50,
      vision: () => visionFn,
    });
    const data = { title: "Acme", siteName: "Acme", markdown: "", links: [], images: [], screenshotUrl: "https://acme.com/print.jpg", branding: { logo: { url: "https://acme.com/logo.jpg" } } };
    const context: SiteReadingContext = { workspaceId: uuid(), accountId: uuid(), handoffId: uuid(), readingId: uuid(), taskIntentId: uuid() };
    await Promise.race([enrichment.identity(data, context).catch(() => undefined), new Promise(resolve => setTimeout(resolve, 300))]);
    await new Promise(resolve => setTimeout(resolve, 160)); // The late GET has completed by this assertion.
    expect(visionFn).not.toHaveBeenCalled();
  });
});
