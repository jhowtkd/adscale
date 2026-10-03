// The logo candidates share a 15-second budget for DOWNLOADING (ticket 17, last round of PR 619), and only for that: three logos that never answer must not take the 45-second step with them and
// throw away a palette that was ready, while a picture that downloaded at once may wait for the decoder up to the 45 seconds of the step. A failure to download is a logo that failed to download
// (`logo_download_failed`): no retry of the step. No clock of the machine is read: the timers are the test's, so there is no time ceiling here, only the budget, the events and the result.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { InMemoryObjectStorage } from "@/server/storage/in-memory-object-storage";
import type { CreateWorkspaceAssetInput } from "@/server/repositories/workspace-asset";
import { createSiteEnrichment, type SiteReadingContext } from "./site-enrichment";
import { isRasterRetry } from "./raster-image";
import type { SiteReadResult } from "./readers";
import * as transport from "./svg-draw-child";

vi.mock("./svg-draw-child", async importOriginal => {
  const actual = await importOriginal<typeof import("./svg-draw-child")>();
  return { ...actual, runImageChild: vi.fn(actual.runImageChild) };
});
const child = vi.mocked(transport.runImageChild);
const context: SiteReadingContext = { workspaceId: "ws-1", accountId: "acc-1", handoffId: "handoff-1", readingId: "reading-1", taskIntentId: "intent-1" };
const LOGOS = ["https://example.com/logo-1.jpg", "https://example.com/logo-2.jpg", "https://example.com/logo-3.jpg"];
const SHOT = "https://example.com/print.jpg";
const STEP_MS = 45_000, DOWNLOAD_MS = 15_000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  // The native `AbortSignal.timeout` does not follow fake timers: the same signal, made of the test's clock.
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError")), ms);
    return controller.signal;
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); child.mockReset(); });

const answer = (info: { width: number; height: number; format: string }) => { const header = Buffer.from(JSON.stringify(info)), length = Buffer.alloc(4); length.writeUInt32BE(header.length); return Buffer.concat([length, header, Buffer.from("jpeg-bytes")]); };
/** A decoder that answers when the test lets it (and, like the real one, gives up with the reason of the caller's signal). */
function gatedDecoder() {
  const waiting: Array<() => void> = [];
  child.mockImplementation(((_input: unknown, options: { signal?: AbortSignal }) => new Promise((resolve, reject) => {
    waiting.push(() => resolve(answer({ width: 800, height: 800, format: "jpeg" })));
    options.signal?.addEventListener("abort", () => reject(options.signal!.reason), { once: true });
  })) as never);
  return { waiting: () => waiting.length, release: () => { while (waiting.length) waiting.shift()!(); } };
}
const instantDecoder = () => child.mockImplementation((async () => answer({ width: 800, height: 800, format: "jpeg" })) as never);

async function setup(download: (url: string, signal: AbortSignal | undefined) => Promise<{ bytes: Buffer; contentType: string }>) {
  const jpeg = { bytes: await sharp({ create: { width: 800, height: 800, channels: 3, background: "#336699" } }).jpeg().toBuffer(), contentType: "image/jpeg" };
  const storage = new InMemoryObjectStorage();
  const saved: CreateWorkspaceAssetInput[] = [];
  const rows = new Map<string, { id: string; key: string; width: number | null; height: number | null; metadata?: unknown }>();
  const calls: string[] = [];
  const vision = vi.fn(async () => ({ logoConfirmed: null, colors: ["#111111"], fonts: ["Inter"] }));
  const enrichment = createSiteEnrichment({
    storage,
    download: (async (url: string, options: { signal?: AbortSignal }) => { calls.push(url); return download(url, options.signal) ; }) as never,
    saveAsset: async (data: CreateWorkspaceAssetInput) => { saved.push(data); const row = { id: `a-${rows.size + 1}`, key: data.key, width: data.width ?? null, height: data.height ?? null, metadata: data.metadata }; rows.set(`${data.workspaceId}:${data.key}`, row); return row; },
    findAsset: async (workspaceId: string, key: string) => rows.get(`${workspaceId}:${key}`) ?? null,
    vision: () => vision as never,
  });
  const data: SiteReadResult = { title: "T", siteName: "Marca", markdown: "m", links: [], images: [], screenshotUrl: SHOT, statusCode: 200, branding: { logo: { url: LOGOS[0]! }, colors: [], fonts: [] }, logoCandidates: LOGOS.slice(1) };
  return { enrichment, data, jpeg, calls, saved, vision, logoCalls: () => calls.filter(url => LOGOS.includes(url)) };
}
/** A download that never answers, as a server that holds the connection: it ends only when the signal it was given does. */
const hang = (signal: AbortSignal | undefined) => new Promise<never>((_, reject) => { signal?.addEventListener("abort", () => reject(signal.reason), { once: true }); });
const settled = (promise: Promise<unknown>) => { const state = { done: false, value: undefined as unknown, error: undefined as unknown }; promise.then(value => { state.done = true; state.value = value; }, error => { state.done = true; state.error = error; }); return state; };

describe("three logo candidates that never answer", () => {
  it("share ONE 15-second download budget: the first holds the line, the others are not even asked for, the logo is `logo_download_failed`, the palette and the fonts are delivered, and the step is not retried", async () => {
    instantDecoder();
    const t = await setup(async (url, signal) => (LOGOS.includes(url) ? hang(signal) : t0.jpeg));
    const t0 = t;
    const outcome = settled(t.enrichment.identity(t.data, context));
    await vi.advanceTimersByTimeAsync(DOWNLOAD_MS - 1);
    expect(outcome.done).toBe(false); // the budget is not spent yet
    expect(t.logoCalls()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome.done).toBe(true);
    expect(outcome.error).toBeUndefined();
    const result = outcome.value as Awaited<ReturnType<typeof t.enrichment.identity>>;
    expect(result.groupErrors).toMatchObject({ logo: "logo_download_failed" });
    expect(result.groupErrors?.colors).toBeUndefined();
    expect(result.branding.logo).toBeUndefined();
    expect(result.branding.colors).toEqual(["#111111"]); // the palette that was ready is not lost
    expect(result.branding.fonts).toEqual(["Inter"]);
    expect(t.vision).toHaveBeenCalledTimes(1);
    expect(t.logoCalls()).toHaveLength(1); // one download of a logo was ever active: the other two met a spent budget
    expect(t.saved.map(asset => asset.name).sort()).toEqual(["site_screenshot"]);
    expect(isRasterRetry(outcome.error)).toBe(false);
  });

  it("two that fail at once and a third that never answers share the same 15 seconds: all three are asked for, the result is `logo_download_failed` at the budget, nothing is retried", async () => {
    instantDecoder();
    const t = await setup(async (url, signal) => { if (url === LOGOS[0] || url === LOGOS[1]) throw new Error("404"); return LOGOS.includes(url) ? hang(signal) : t0.jpeg; });
    const t0 = t;
    const outcome = settled(t.enrichment.identity(t.data, context));
    await vi.advanceTimersByTimeAsync(DOWNLOAD_MS - 1);
    expect(outcome.done).toBe(false);
    expect(t.logoCalls()).toEqual(LOGOS);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome.done).toBe(true);
    expect(outcome.error).toBeUndefined();
    const result = outcome.value as Awaited<ReturnType<typeof t.enrichment.identity>>;
    expect(result.groupErrors).toMatchObject({ logo: "logo_download_failed" });
    expect(result.branding.colors).toEqual(["#111111"]);
    expect(t.vision).toHaveBeenCalledTimes(1);
  });

  it("a logo that answers inside the budget is used as before, whatever happened to the candidates before it", async () => {
    instantDecoder();
    const t = await setup(async url => { if (url === LOGOS[0]) throw new Error("404"); return t0.jpeg; });
    const t0 = t;
    const outcome = settled(t.enrichment.identity(t.data, context));
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome.done).toBe(true);
    const result = outcome.value as Awaited<ReturnType<typeof t.enrichment.identity>>;
    expect(result.branding.logo).toBeTruthy();
    expect(result.groupErrors?.logo).toBeUndefined();
    expect(t.logoCalls()).toEqual([LOGOS[0], LOGOS[1]]);
  });
});

describe("the budget of the download is only for the download", () => {
  it("a logo that downloaded at once and waits more than 15 seconds for the decoder is not cut: it has the 45 seconds of the step, and it is imported when the decoder answers, with no retry", async () => {
    const decoder = gatedDecoder();
    const t = await setup(async () => t0.jpeg);
    const t0 = t;
    const outcome = settled(t.enrichment.identity(t.data, context));
    await vi.advanceTimersByTimeAsync(0);
    expect(decoder.waiting()).toBeGreaterThan(0); // the picture is in the child's hands (or waiting for its turn)
    await vi.advanceTimersByTimeAsync(DOWNLOAD_MS + 5_000);
    expect(outcome.done).toBe(false); // the 15 seconds of the download did not reach the decoder
    for (let turn = 0; turn < 6 && !outcome.done; turn++) { decoder.release(); await vi.advanceTimersByTimeAsync(0); }
    expect(outcome.done).toBe(true);
    expect(outcome.error).toBeUndefined();
    const result = outcome.value as Awaited<ReturnType<typeof t.enrichment.identity>>;
    expect(result.branding.logo).toBeTruthy();
    expect(result.groupErrors ?? {}).toEqual({});
    expect(result.branding.colors).toEqual(["#111111"]);
    expect(t.logoCalls()).toEqual([LOGOS[0]]); // one download, no second pass
  });

  it("a decoder that does not answer in the 45 seconds of the step is a retry of the step (wait_timeout), as before: the 15 seconds did not become the step's deadline, the 45 did not change", async () => {
    gatedDecoder();
    const t = await setup(async () => t0.jpeg);
    const t0 = t;
    const outcome = settled(t.enrichment.identity(t.data, context));
    await vi.advanceTimersByTimeAsync(STEP_MS - 1);
    expect(outcome.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome.done).toBe(true);
    expect(isRasterRetry(outcome.error)).toBe(true);
    expect(outcome.error).toMatchObject({ reason: "wait_timeout" });
    expect(t.vision).not.toHaveBeenCalled(); // the paid call is not made for a step that will run again
  });

  it("the budget of the logos is no more than the step's own when the step is shorter (`timeoutMs` under 15 seconds): the shorter wins", async () => {
    instantDecoder();
    const jpeg = await sharp({ create: { width: 800, height: 800, channels: 3, background: "#336699" } }).jpeg().toBuffer();
    const enrichment = createSiteEnrichment({
      storage: new InMemoryObjectStorage(), timeoutMs: 5_000,
      download: (async (url: string, options: { signal?: AbortSignal }) => (LOGOS.includes(url) ? hang(options.signal) : { bytes: jpeg, contentType: "image/jpeg" })) as never,
      saveAsset: async data => ({ id: "a", key: data.key, width: null, height: null }), findAsset: async () => null,
      vision: () => (async () => ({ logoConfirmed: null, colors: ["#111111"], fonts: [] })) as never,
    });
    const data: SiteReadResult = { title: "T", siteName: "M", markdown: "m", links: [], images: [], screenshotUrl: SHOT, statusCode: 200, branding: { logo: { url: LOGOS[0]! }, colors: [], fonts: [] } };
    const outcome = settled(enrichment.identity(data, context));
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome.done).toBe(true); // at the step's 5 seconds, not at 15
  });
});
