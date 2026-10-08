// The palette vision, end to end and without a network (ticket 13, D-2): fake Anthropic SDK -> AnthropicEquipeModelClient -> budgeted client
// (free account, in-memory ledger) -> site/Instagram vision -> enrichment -> handoff read handler -> commands, up to the confirmed summary.
// Every link is the real one; only the SDK, the downloads and the storage are fake.

import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { InMemoryObjectStorage } from "@/server/storage/in-memory-object-storage";
import { createHandoffReadHandler } from "../handoff/read";
import { createInstagramEnrichment } from "../handoff/instagram-enrichment";
import { createSiteEnrichment, type SiteReadingContext } from "../handoff/site-enrichment";
import { FakeInstagramReader, FakeSiteReader, type HandoffReaders, type InstagramReadResult, type SiteReadResult } from "../handoff/readers";
import { createInstagramVision, createSiteVision } from "../handoff/site-vision";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { HANDOFF_GROUPS, hasFailedConfirmedInstagram, identityReady } from "../domain/handoff";
import { AnthropicEquipeModelClient, type AnthropicMessageResponse, type AnthropicSdkLike } from "./anthropic-client";
import { createBudgetedModelClient, MODEL_CALL_REJECTED_EVENT } from "./budgeted-client";
import { modelInputTokenBound } from "./free-budget";
import { BUDGET_EXCEEDED_EVENT, MemoryLedgerStore } from "./ledger";
import { resolveAgentMonthlyBudgetUsdCents } from "./roles";
import { ModelRequestNotSentError, type ModelCallRequest } from "./model-client";

// The production adapter is exercised with the real vision/enrichment/claim chain.
// Only assembly side effects (DB, SDK, remote downloads/storage and Inngest) are replaced.
const production = vi.hoisted(() => ({ deps: null as unknown, ledger: null as unknown, storage: null as unknown,
  sdk: null as unknown, image: null as Buffer | null, saveAsset: null as unknown, findAsset: null as unknown, siteVision: null as unknown, instagramVision: null as unknown }));
vi.mock("@/server/jobs/client", () => ({ inngest: { createFunction: (_config: unknown, handler: unknown) => handler, send: vi.fn() } }));
vi.mock("../jobs/shared", () => ({ createProdJobDeps: () => production.deps, moduleDepsFor: () => production.deps }));
vi.mock("@/server/storage", () => ({ get objectStorage() { return production.storage; } }));
vi.mock("./ledger", async original => ({ ...await original<typeof import("./ledger")>(), DrizzleLedgerStore: class { constructor() { return production.ledger as MemoryLedgerStore; } } }));
vi.mock("./anthropic-client", async original => {
  const actual = await original<typeof import("./anthropic-client")>();
  return { ...actual, AnthropicEquipeModelClient: class extends actual.AnthropicEquipeModelClient {
    constructor(options?: ConstructorParameters<typeof actual.AnthropicEquipeModelClient>[0]) {
      super({ ...options, sdk: options?.sdk ?? production.sdk as AnthropicSdkLike });
    }
  } };
});
vi.mock("@/server/repositories/workspace-asset", () => ({
  createWorkspaceAssetIfKeyAbsent: (...args: unknown[]) => (production.saveAsset as (...args: unknown[]) => unknown)(...args),
  getWorkspaceAssetByKey: (...args: unknown[]) => (production.findAsset as (...args: unknown[]) => unknown)(...args),
  updateWorkspaceAsset: vi.fn(),
}));
vi.mock("../handoff/site-enrichment", async original => {
  const actual = await original<typeof import("../handoff/site-enrichment")>();
  return { ...actual, createSiteEnrichment: (options: Parameters<typeof actual.createSiteEnrichment>[0]) => {
    if (!options.download) production.siteVision = options.vision;
    return actual.createSiteEnrichment({ ...options,
      download: options.download ?? (async () => ({ bytes: production.image!, contentType: "image/jpeg" })) as never });
  } };
});
vi.mock("../handoff/instagram-enrichment", async original => {
  const actual = await original<typeof import("../handoff/instagram-enrichment")>();
  return { ...actual, createInstagramEnrichment: (options: Parameters<typeof actual.createInstagramEnrichment>[0]) => {
    if (!options.download) production.instagramVision = options.vision;
    return actual.createInstagramEnrichment({ ...options,
      download: options.download ?? (async () => ({ bytes: production.image!, contentType: "image/jpeg" })) as never });
  } };
});
vi.mock("../handoff/readers", async original => ({ ...await original<typeof import("../handoff/readers")>(), createHandoffReaders: () => productionReaders }));
let productionReaders: HandoffReaders;

const NOW = new Date("2026-10-15T15:00:00.000Z");
const MODEL = "claude-opus-5-5";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

/** signedDownloadUrl must be https:// for the vision to accept the image. */
class HttpsStorage extends InMemoryObjectStorage { async signedDownloadUrl(key: string) { return `https://assets.example.com/${encodeURIComponent(key)}`; } }
const jpeg = () => sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 200, g: 30, b: 40 } } }).jpeg().toBuffer();

// What proves the request was refused before any model ran is a message that OPENS with the path of a request parameter (model-failure.ts).
const SCHEMA_REFUSAL = "output_config.format.schema: For 'array' type, property 'maxItems' is not supported SEGREDO-DO-PROVEDOR";
const apiError = (status: number, type = "invalid_request_error", message = SCHEMA_REFUSAL) => Anthropic.APIError.generate(status, { type: "error", error: { type, message }, request_id: "req_x" },
  `${status} ${message}`, new Headers({ "request-id": "req_x" }));
const answer = (colors: string[]): AnthropicMessageResponse => ({ content: [{ type: "text", text: JSON.stringify({ logoConfirmed: null, colors, fonts: [] }) }], stop_reason: "end_turn",
  usage: { input_tokens: 700, output_tokens: 60 } });
const palette = (n: number) => Array.from({ length: n }, (_, i) => `#${(0x112233 + i * 0x111111).toString(16)}`);

type Source = "site" | "instagram";
async function setup(source: Source, sdkBehavior: () => Promise<AnthropicMessageResponse>, productionAdapter = false, payingWorkspace = true) {
  const t = makeTestDeps({ now: NOW });
  const workspaceId = uuid(); const userId = uuid();
  t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "ana@example.com", emailVerified: true, role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
  const opened = await executeCommand(t.deps, { workspaceId, actor: { kind: "system", job: "free-open" } }, { type: "open_free_account", payload: { userId } });
  if (!opened.ok) throw new Error(opened.error.code);
  const scope = { workspaceId, accountId: opened.value.accountId! };
  const [person] = await t.deps.uow.repos.people.list(scope);
  const actor = { kind: "client_person", role: "approver", personId: person!.id } as const;
  const row = async () => (await t.deps.uow.repos.handoffs.list(scope))[0]!;
  const command = async (type: string, payload: Record<string, unknown> = {}) => {
    const h = await row();
    const out = await executeCommand(t.deps, { ...scope, actor }, { type, payload: { expectedStep: h.step, expectedVersion: h.version, ...payload } });
    if (!out.ok) throw new Error(out.error.code);
    return out;
  };
  await command("handoff_set_source", source === "site" ? { kind: "site", value: "https://conteudomartech.com.br" } : { kind: "instagram", value: "bauducco" });

  const create = vi.fn(sdkBehavior);
  const sdk: AnthropicSdkLike = { messages: { create } };
  const anthropic = new AnthropicEquipeModelClient({ sdk });
  const ledger = new MemoryLedgerStore();
  const storage = new HttpsStorage();
  const saved = new Map<string, { id: string; key: string; width: number | null; height: number | null }>();
  const saveAsset = async (data: { workspaceId: string; key: string; width?: number | null; height?: number | null }) => {
    const asset = { id: uuid(), key: data.key, width: data.width ?? null, height: data.height ?? null };
    saved.set(`${data.workspaceId}:${data.key}`, asset);
    t.store.workspaceAssets.rows.set(asset.id, { id: asset.id, workspaceId: data.workspaceId, clientProfileId: null, name: "x", key: data.key, type: "image/jpeg", size: 1, width: asset.width, height: asset.height,
      source: `brand_${source}`, tags: [], aiDescription: null, metadata: { provisional: true }, createdAt: NOW, updatedAt: NOW });
    return asset;
  };
  const findAsset = async (workspaceId: string, key: string) => saved.get(`${workspaceId}:${key}`) ?? null;
  const image = await jpeg();
  const imageOptions = { storage, saveAsset: saveAsset as never, findAsset, download: (async () => ({ bytes: image, contentType: "image/jpeg" })) as never };
  const visionClient = (context: SiteReadingContext) => createBudgetedModelClient({ scope: context, repos: t.deps.uow.repos, ledger, client: () => anthropic, free: true,
    model: MODEL, role: "strategist", taskKind: "handoff_vision", now: () => NOW });
  const siteEnrichment = createSiteEnrichment({ ...imageOptions, vision: context => createSiteVision({ storage, client: visionClient(context), model: MODEL }) });
  const instagramEnrichment = createInstagramEnrichment({ ...imageOptions, vision: context => createInstagramVision({ storage, client: visionClient(context), model: MODEL }) });

  const siteResult: SiteReadResult = { title: "Conteúdo Martech", siteName: "Conteúdo Martech", markdown: "Agência de marketing educacional.", links: [], images: [{ url: "https://cdn.example/s1.png" }],
    screenshotUrl: "https://cdn.example/print.png", statusCode: 200, branding: { colors: ["#0178E6"], fonts: ["Inter"] } };
  const profile: InstagramReadResult = { exists: true, isPrivate: false, name: "Bauducco", avatarUrl: "https://cdn.example/avatar.jpg", bio: "Panettones desde 1952.",
    posts: [{ imageUrl: "https://cdn.example/p1.jpg", caption: "Chocottone" }] };
  const readers: HandoffReaders = { site: new FakeSiteReader(siteResult), instagram: new FakeInstagramReader(profile) };
  let job: unknown;
  if (productionAdapter) {
    if (payingWorkspace) t.deps.hasClassicPaidAccess = async () => true;
    Object.assign(production, { deps: t.deps, ledger, storage, sdk, image, saveAsset, findAsset });
    productionReaders = readers;
    vi.stubEnv("ANTHROPIC_API_KEY", "fake-test-anthropic");
    vi.stubEnv("SITE_READER_PROVIDER", "firecrawl");
    vi.stubEnv("INSTAGRAM_READER_PROVIDER", "apify");
    vi.resetModules();
    job = (await import("../jobs/handoff-read")).equipeHandoffReadJob;
  }
  const read = async () => {
    const h = await row();
    const taskIntentId = h.reading.name!.taskIntentId;
    const intent = await t.deps.uow.repos.taskOutbox.get(scope, taskIntentId);
    const args = { event: { data: { ...scope, taskIntentId, ...(intent!.data as object) } }, step: { run: async <T>(_id: string, fn: () => Promise<T>) => fn() } };
    return job ? (job as (args: typeof args) => Promise<unknown>)(args)
      : createHandoffReadHandler(t.deps, readers, siteEnrichment, instagramEnrichment)(args);
  };
  const events = () => t.deps.uow.repos.events.list(scope, { eventType: MODEL_CALL_REJECTED_EVENT });
  const total = () => ledger.lifetimeTotalCostUsdCents(scope.workspaceId, scope.accountId);
  /** From the identity step to the confirmed summary, the way the person would, with no palette of the reading's. */
  const confirmAll = async (colors: string[] = []) => {
    const h = await row();
    await command("handoff_confirm_identity", { name: source === "site" ? "Conteúdo Martech" : "Bauducco", logo: null, colors, fonts: [], paletteChoice: colors.length ? "user" : source });
    await command("handoff_confirm_networks", { kept: (await row()).captured.networks!.map(i => i.id), added: [] });
    await command("handoff_confirm_images", { kept: [], removed: (await row()).captured.images!.map(i => i.id), uploaded: [] });
    expect(h.step).toBe("identity");
    await command("handoff_confirm_summary");
    return row();
  };
  const directVision = async (signal: AbortSignal) => {
    const h = await row();
    const context = { ...scope, handoffId: h.id, readingId: h.readingId!, taskIntentId: h.reading.name!.taskIntentId };
    const key = "manual-normalized.jpg";
    await storage.put(key, image, "image/jpeg");
    if (source === "site") return (production.siteVision as Parameters<typeof createSiteEnrichment>[0]["vision"])(context, signal)({ screenshotKey: key, colors: [], fonts: [], signal });
    return (production.instagramVision as Parameters<typeof createInstagramEnrichment>[0]["vision"])(context, signal)({ imageKeys: [key], signal });
  };
  return { t, scope, row, read, command, create, ledger, events, total, confirmAll, directVision };
}

describe.each<Source>(["instagram", "site"])("the palette vision through the whole chain (%s)", (source) => {
  const errorKey = `${source}_vision_failed`;

  it("a provider 400 gives the reservation back, leaves the cause on record, and the summary is confirmable", async () => {
    const f = await setup(source, async () => { throw apiError(400); });
    await f.read();
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.ledger.entries).toHaveLength(1);
    expect(f.ledger.entries[0]!.reservedCostUsdCents).toBeGreaterThan(0);
    expect(f.ledger.entries[0]).toMatchObject({ costUsdCents: 0, settledAt: NOW });
    expect(await f.total()).toBe(0);
    const [event] = await f.events();
    expect(event!.payload).toEqual({ role: "strategist", model: MODEL, taskKind: "handoff_vision", kind: "provider_rejected", status: 400, errorType: "invalid_request_error",
      requestId: "req_x", param: "output_config.format.schema", reason: "schema_unsupported", schema: "site_identity" });
    expect(JSON.stringify(event!.payload)).not.toContain("SEGREDO-DO-PROVEDOR"); // Only structured fields: never the provider's text.

    let h = await f.row();
    expect(h.reading.colors).toMatchObject({ status: "not_found", error: errorKey });
    expect(Object.values(h.reading).some(g => g?.status === "failed")).toBe(false);
    expect(identityReady(h)).toBe(true);
    expect(hasFailedConfirmedInstagram(h)).toBe(false);
    h = await f.confirmAll();
    expect(h.step).toBe("done");
    expect(h.readsUsed).toBe(1);
    expect(f.create).toHaveBeenCalledTimes(1); // No retry, no second charged reading.
    expect(await f.total()).toBe(0);
  });

  it("ticket 16: the vision call is recorded with the prompt version equipe-prompts/v6", async () => {
    const f = await setup(source, async () => answer(["#111111"]));
    await f.read();
    expect(f.ledger.entries).toHaveLength(1);
    expect(f.ledger.entries[0]).toMatchObject({ taskKind: "handoff_vision", promptVersion: "equipe-prompts/v6" });
  });

  it.each([[400, "Output blocked by content filtering policy"], [400, "prompt is too long: 250000 tokens > 200000 maximum"], [422, "credit balance is too low"]])(
    "a provider %i without a request parameter path (%s) is no proof: the maximum stays, yet the palette is only not found", async (status, message) => {
    const f = await setup(source, async () => { throw apiError(status, "invalid_request_error", message); });
    await f.read();
    const [entry] = f.ledger.entries;
    expect(f.ledger.entries).toHaveLength(1);
    expect(entry!.settledAt).toBeUndefined();
    expect(await f.total()).toBe(entry!.reservedCostUsdCents);
    expect(await f.events()).toHaveLength(0);
    expect((await f.row()).reading.colors).toMatchObject({ status: "not_found", error: errorKey });
    expect((await f.confirmAll()).step).toBe("done");
  });

  it("a provider 503 is a doubt: the maximum stays on the cap, yet the palette is only not found and the summary is confirmable", async () => {
    const f = await setup(source, async () => { throw apiError(503, "overloaded_error"); });
    await f.read();
    const [entry] = f.ledger.entries;
    expect(f.ledger.entries).toHaveLength(1);
    expect(entry!.settledAt).toBeUndefined();
    expect(entry!.costUsdCents).toBe(entry!.reservedCostUsdCents);
    expect(await f.total()).toBe(entry!.reservedCostUsdCents);
    expect(await f.events()).toHaveLength(0);
    // The orphan reconciler closes the doubt at its maximum, never lower.
    await f.ledger.settleExpiredReservations(new Date(NOW.getTime() + 16 * 60_000));
    expect(await f.total()).toBe(entry!.reservedCostUsdCents);

    let h = await f.row();
    expect(h.reading.colors).toMatchObject({ status: "not_found", error: errorKey });
    expect(Object.values(h.reading).some(g => g?.status === "failed")).toBe(false);
    h = await f.confirmAll();
    expect(h.step).toBe("done");
    expect(f.create).toHaveBeenCalledTimes(1);
  });

  it.each([[1, 1, "found"], [3, 3, "found"], [8, 6, "found"], [0, 0, "not_found"]] as const)("a valid answer with %i colors reads %i (%s), costs what it used, and settles", async (given, kept, status) => {
    const f = await setup(source, async () => answer(palette(given)));
    await f.read();
    const h = await f.row();
    expect(h.reading.colors?.status).toBe(status);
    expect(h.reading.colors?.error).toBeUndefined();
    // The site's own candidate (#0178E6) is replaced by the model's answer; the Instagram has none.
    expect(h.captured.colors?.map(c => c.value) ?? []).toEqual(palette(given).slice(0, 6));
    expect(h.captured.colors?.length ?? 0).toBe(kept);
    expect(f.ledger.entries).toHaveLength(1);
    expect(f.ledger.entries[0]).toMatchObject({ inputTokens: 700, outputTokens: 60, settledAt: NOW });
    expect(f.ledger.entries[0]!.costUsdCents).toBeLessThan(f.ledger.entries[0]!.reservedCostUsdCents!);
    expect(await f.total()).toBe(f.ledger.entries[0]!.costUsdCents);
    expect(Object.values(h.reading).some(g => g?.status === "failed")).toBe(false);
  });
});

describe("a schema the endpoint would refuse never leaves this process", () => {
  const call = async (schema: z.ZodTypeAny) => {
    const f = await setup("instagram", async () => answer([]));
    const base: ModelCallRequest = { model: MODEL, messages: [{ role: "user", content: "x" }], maxTokens: 500, output: { name: "hand_made", schema } };
    const client = createBudgetedModelClient({ scope: f.scope, repos: f.t.deps.uow.repos, ledger: f.ledger, client: () => new AnthropicEquipeModelClient({ sdk: { messages: { create: f.create } } }),
      free: true, model: MODEL, role: "strategist", taskKind: "handoff_vision", now: () => NOW });
    const error = await client.chat({ ...base, inputTokenBound: modelInputTokenBound(base)! }).then(() => null, (e: unknown) => e);
    return { f, error };
  };
  it.each([
    ["array maxItems", z.object({ a: z.array(z.string()).max(6) }), "maxItems"],
    ["array minItems 3", z.object({ a: z.array(z.string()).min(3) }), "minItems"],
    ["number minimum", z.object({ a: z.number().min(1) }), "minimum"],
    ["number maximum", z.object({ a: z.number().max(5) }), "maximum"],
    ["nested in an optional list", z.object({ a: z.array(z.object({ b: z.array(z.string()).max(2) })).nullable() }), "maxItems"],
  ])("%s: ModelRequestNotSentError, the reservation given back, the SDK untouched", async (_name, schema, keyword) => {
    const { f, error } = await call(schema);
    expect(error).toBeInstanceOf(ModelRequestNotSentError);
    expect((error as Error).message).toContain(keyword);
    expect(f.create).not.toHaveBeenCalled();
    expect(f.ledger.entries).toHaveLength(1);
    expect(f.ledger.entries[0]).toMatchObject({ costUsdCents: 0, settledAt: NOW });
    expect(await f.total()).toBe(0);
    expect((await f.events())[0]!.payload).toMatchObject({ kind: "not_sent", schema: "hand_made", message: expect.stringContaining("anthropic_schema_unsupported") });
  });
  it("control: min 1 and plain shapes are sent", async () => {
    const { f, error } = await call(z.object({ a: z.array(z.string()).min(1), b: z.string().min(1).max(100) }));
    expect(error).toBeNull();
    expect(f.create).toHaveBeenCalledTimes(1);
  });
});


describe.each<Source>(["site", "instagram"])("production handoff vision monthly admission (%s)", source => {
  it.each([0, 1])("an exhausted monthly cap (+%i) starts no reading and sends no SDK calls, including duplicate delivery; the read is given back", async extra => {
    const f = await setup(source, async () => answer(["#112233"]), true);
    const entry = await f.ledger.record({ ...f.scope, role: "strategist", model: MODEL, taskKind: "strategist_turn", promptVersion: "equipe-prompts/v6",
      inputTokens: 1, outputTokens: 1, costUsdCents: resolveAgentMonthlyBudgetUsdCents() + extra });
    entry.createdAt = NOW;
    await f.read();
    expect(f.create).not.toHaveBeenCalled();
    expect(f.ledger.entries).toHaveLength(1);
    // The monthly cap is temporary: the palette is not kept as "not found" for good, the whole reading waits and trying again costs no reading.
    const h = await f.row();
    for (const group of HANDOFF_GROUPS) expect(h.reading[group]).toMatchObject({ status: "failed", error: "monthly_budget_exceeded" });
    expect(h.readsUsed).toBe(0);
    const refusals = await f.t.deps.uow.repos.events.list(f.scope, { eventType: BUDGET_EXCEEDED_EVENT });
    expect(refusals.map(event => (event.payload as { taskKind?: string }).taskKind)).toEqual(["handoff_read"]);
    await f.read();
    expect(f.create).not.toHaveBeenCalled();
    expect(f.ledger.entries).toHaveLength(1);
    expect(await f.t.deps.uow.repos.events.list(f.scope, { eventType: BUDGET_EXCEEDED_EVENT })).toHaveLength(1);
  });

  it("a cap another call used up while the reading ran still stops the vision before the SDK: the palette is not found", async () => {
    const f = await setup(source, async () => answer(["#112233"]), true);
    let reads = 0;
    // The reading starts under the cap (first read of the ledger); the vision's own admission (the next one) finds it used up.
    vi.spyOn(f.ledger, "monthlyTotalCostUsdCents").mockImplementation(async () => (reads++ === 0 ? 0 : resolveAgentMonthlyBudgetUsdCents()));
    await f.read();
    expect(f.create).not.toHaveBeenCalled();
    expect((await f.row()).reading.colors).toMatchObject({ status: "not_found", error: `${source}_vision_failed` });
    const refusals = await f.t.deps.uow.repos.events.list(f.scope, { eventType: BUDGET_EXCEEDED_EVENT });
    expect(refusals.map(event => (event.payload as { taskKind?: string }).taskKind)).toEqual(["handoff_vision"]);
  });

  it("without the classic port the production adapter still reserves and settles the free lifetime call", async () => {
    const f = await setup(source, async () => answer(["#112233"]), true, false);
    await f.read();
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.ledger.entries).toHaveLength(1);
    expect(f.ledger.entries[0]).toMatchObject({ taskKind: "handoff_vision", settledAt: NOW });
    expect(f.ledger.entries[0]!.reservedCostUsdCents).toBeGreaterThan(0);
  });

  it("production execution suspension stops vision before the SDK", async () => {
    const f = await setup(source, async () => answer(["#112233"]), true);
    await f.t.deps.uow.repos.pauses.create(f.scope, { level: "execution", scope: "account", origin: "security", resumableBy: "staff", status: "active" } as never);
    await expect(f.directVision(new AbortController().signal)).rejects.toThrow("reading_failed");
    expect(f.create).not.toHaveBeenCalled();
    expect(f.ledger.entries).toHaveLength(0);
  });

  it("aborting during monthly admission stops the production SDK dispatch", async () => {
    const f = await setup(source, async () => answer(["#112233"]), true);
    const controller = new AbortController();
    vi.spyOn(f.ledger, "monthlyTotalCostUsdCents").mockImplementation(async () => { controller.abort(new Error("test_abort")); return 0; });
    await expect(f.directVision(controller.signal)).rejects.toThrow("test_abort");
    expect(f.create).not.toHaveBeenCalled();
    expect(f.ledger.entries).toHaveLength(0);
  });

  it("a completed/obsolete reading cannot dispatch vision through the production adapter", async () => {
    const f = await setup(source, async () => answer(["#112233"]), true);
    const h = await f.row();
    await f.t.deps.uow.repos.handoffs.update(f.scope, h.id, { step: "done" });
    await expect(f.directVision(new AbortController().signal)).rejects.toThrow("stale_reading");
    expect(f.create).not.toHaveBeenCalled();
    expect(f.ledger.entries).toHaveLength(0);
  });

  it("prior-month spend allows exactly one current vision cost entry and no retry", async () => {
    const f = await setup(source, async () => answer(["#112233"]), true);
    const prior = await f.ledger.record({ ...f.scope, role: "strategist", model: MODEL, taskKind: "strategist_turn", promptVersion: "equipe-prompts/v6",
      inputTokens: 1, outputTokens: 1, costUsdCents: resolveAgentMonthlyBudgetUsdCents() });
    prior.createdAt = new Date("2026-09-15T15:00:00Z");
    expect(await f.ledger.monthlyTotalCostUsdCents(f.scope.workspaceId, f.scope.accountId, NOW)).toBe(0);
    await f.read();
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.create.mock.calls[0]![1]).toMatchObject({ maxRetries: 0 });
    expect((await f.row()).reading.colors).toMatchObject({ status: "found" });
    expect(f.ledger.entries).toHaveLength(2);
    expect(f.ledger.entries[1]).toMatchObject({ taskKind: "handoff_vision", promptVersion: "equipe-prompts/v6" });
    expect(f.ledger.entries[1]!.costUsdCents).toBeGreaterThan(0);
    expect(f.ledger.entries[1]!.reservedCostUsdCents).toBeUndefined();
    expect(await f.ledger.monthlyTotalCostUsdCents(f.scope.workspaceId, f.scope.accountId, NOW)).toBe(f.ledger.entries[1]!.costUsdCents);
    await f.read();
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.ledger.entries).toHaveLength(2);
  });
});
