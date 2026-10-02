import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { env } from "@/server/validation/env";
import { normalizeInstagram } from "../source";
import { abortable } from "../safe-image-download";
import type { InstagramReader, InstagramReadResult } from "./index";

export class InstagramReaderError extends Error {
  constructor(code: string, readonly unbilled = false) { super(code); }
}
const idSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/).max(100);
const runSchema = z.object({ data: z.object({ id: idSchema, status: z.enum(["READY", "RUNNING", "SUCCEEDED", "FAILED", "TIMING-OUT", "TIMED-OUT", "ABORTING", "ABORTED"]),
  defaultDatasetId: idSchema.optional(), usageTotalUsd: z.number().finite().nonnegative().optional() }) });
const profileSchema = z.object({ username: z.string().optional(), fullName: z.string().nullish(), biography: z.string().nullish(),
  private: z.boolean().optional(), isPrivate: z.boolean().optional(), error: z.string().optional(),
  profilePicUrlHD: z.string().nullish(), profilePicUrl: z.string().nullish(),
  latestPosts: z.array(z.object({ displayUrl: z.string().nullish(), caption: z.string().nullish(), dimensionsWidth: z.number().positive().optional(), dimensionsHeight: z.number().positive().optional() })).default([]) });
export type ApifyReaderOptions = {
  token?: string; fetch?: typeof fetch; timeoutMs?: number; retryDelayMs?: number; usageDelayMs?: number; usageTimeoutMs?: number;
  beforeRequest?: () => Promise<boolean>; loadRun?: () => Promise<string | null>; saveRun?: (runId: string) => Promise<void>;
  recordUsage?: (runId: string, usageTotalUsd: number | null) => Promise<void>;
};
export class ApifyInstagramReader implements InstagramReader {
  constructor(private readonly options: ApifyReaderOptions = {}) {}
  async profile(value: string): Promise<InstagramReadResult> {
    try { return await this.readProfile(value); }
    catch (error) { throw error instanceof InstagramReaderError ? error : new InstagramReaderError("reading_failed"); }
  }
  /** One authenticated request to Apify under a deadline. Only a GET is ever retried: an invalid POST response may hide a charged run. */
  private requester(token: string, signal: AbortSignal) {
    const pause = (ms: number) => delay(ms, undefined, { signal });
    return async (path: string, body?: object): Promise<unknown> => {
      for (let attempt = 0; ; attempt++) {
        signal.throwIfAborted();
        try {
          const response = await abortable((this.options.fetch ?? fetch)(`https://api.apify.com/v2/${path}`, {
            method: body ? "POST" : "GET", redirect: "error", signal,
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            ...(body ? { body: JSON.stringify(body) } : {}),
          }), signal);
          if (!response.ok) {
            if (body || (response.status !== 429 && response.status < 500)) throw new InstagramReaderError("reading_failed");
            throw new Error("apify_transient");
          }
          return await abortable(response.json(), signal);
        } catch (error) {
          if (body || error instanceof InstagramReaderError || attempt === 2 || signal.aborted) throw new InstagramReaderError("reading_failed");
          await pause((this.options.retryDelayMs ?? 1_000) * 2 ** attempt);
        }
      }
    };
  }
  /**
   * What the provider charged for the run this reading dispatched, read AFTER the result is recorded (ticket 13, D-4). Apify documents that the cost of a
   * finished run is preliminary and stabilises about ten seconds later, so it is sampled after `usageDelayMs`, up to three times, on the exact run saved
   * by `saveRun`. It used to be read before the result was returned and held the screen for 10.8 s in every reading (21% of the Instagram-only one).
   * Best effort and never throws: a cost that cannot be read is recorded as unknown (`null`), never as free.
   */
  async measureCost(): Promise<void> {
    const { recordUsage, loadRun } = this.options;
    const token = this.options.token ?? env.APIFY_TOKEN;
    if (!recordUsage || !loadRun || !token) return;
    try {
      const runId = await loadRun();
      if (!runId) return; // Nothing was dispatched: nothing to measure.
      idSchema.parse(runId);
      const signal = AbortSignal.timeout(this.options.usageTimeoutMs ?? 90_000);
      const pause = (ms: number) => delay(ms, undefined, { signal });
      const request = this.requester(token, signal);
      let usage: number | null = null;
      try {
        await pause(this.options.usageDelayMs ?? 10_000);
        for (let attempt = 0; attempt < 3; attempt++) {
          const sample: z.infer<typeof runSchema>["data"] = runSchema.parse(await request(`actor-runs/${runId}?waitForFinish=30`)).data;
          if (sample.id !== runId) throw new InstagramReaderError("reading_failed");
          if ((sample.usageTotalUsd ?? 0) > 0) { usage = sample.usageTotalUsd!; break; }
          if (attempt < 2) await pause((this.options.retryDelayMs ?? 1_000) * 2 ** attempt);
        }
      } catch { /* Missing/zero preliminary usage remains explicitly unknown, never free. */ }
      await abortable(recordUsage(runId, usage), AbortSignal.timeout(5_000));
    } catch { /* Recording the cost is best effort: it never turns a recorded reading into a failure. */ }
  }
  private async readProfile(value: string): Promise<InstagramReadResult> {
    const token = this.options.token ?? env.APIFY_TOKEN;
    if (!token) throw new InstagramReaderError("reader_unavailable", true);
    let handle: string;
    try { handle = normalizeInstagram(value); }
    catch { throw new InstagramReaderError("invalid_instagram", true); }
    const signal = AbortSignal.timeout(this.options.timeoutMs ?? 210_000);
    const pause = (ms: number) => delay(ms, undefined, { signal });
    const request = this.requester(token, signal);
    let runId = await abortable(this.options.loadRun?.() ?? Promise.resolve(null), signal);
    let run: z.infer<typeof runSchema>["data"];
    if (runId) {
      idSchema.parse(runId);
      run = runSchema.parse(await request(`actor-runs/${runId}?waitForFinish=30`)).data;
    } else {
      if (this.options.beforeRequest && !(await abortable(this.options.beforeRequest(), signal))) throw new InstagramReaderError("reading_failed");
      signal.throwIfAborted();
      const response = await request("acts/apify~instagram-profile-scraper/runs?waitForFinish=30&timeout=180&restartOnError=false", { usernames: [handle] });
      // Save the run identity even if the rest of its response is malformed.
      runId = z.object({ data: z.object({ id: idSchema }) }).parse(response).data.id;
      if (this.options.saveRun) await abortable(this.options.saveRun(runId), signal);
      run = runSchema.parse(response).data;
    }
    const readRun = async () => {
      const current = runSchema.parse(await request(`actor-runs/${runId}?waitForFinish=30`)).data;
      if (current.id !== runId) throw new InstagramReaderError("reading_failed");
      return current;
    };
    if (run.id !== runId) throw new InstagramReaderError("reading_failed");
    while (["READY", "RUNNING"].includes(run.status)) { await pause(this.options.retryDelayMs ?? 1_000); run = await readRun(); }
    // The provider's cost is NOT read here: measureCost() reads it after the result is recorded, so nothing below waits for it (ticket 13, D-4).
    let result: InstagramReadResult | null = null;
    if (run.status !== "SUCCEEDED" || !run.defaultDatasetId) throw new InstagramReaderError("reading_failed");
    const items = z.array(profileSchema).max(1).parse(await request(`datasets/${run.defaultDatasetId}/items?format=json&limit=1`));
    const p = items[0];
    if (!p) throw new InstagramReaderError("reading_failed");
    if (p.error && p.error !== "not_found" && p.error !== "private") throw new InstagramReaderError("reading_failed");
    if (p.error === "not_found") result = { exists: false, isPrivate: false, avatarUrl: null, bio: "", posts: [] };
    else if (p.private || p.isPrivate || p.error === "private") result = { exists: true, isPrivate: true, avatarUrl: null, bio: "", posts: [] };
    else {
      if (p.username?.toLowerCase() !== handle.toLowerCase()) throw new InstagramReaderError("reading_failed");
      const publicUrl = (value: string | null | undefined) => {
        if (!value || value.length > 4000) return null;
        try { const u = new URL(value); return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password ? u.toString() : null; } catch { return null; }
      };
      result = { exists: true, isPrivate: false, ...(p.fullName?.trim() ? { name: p.fullName.trim().slice(0, 200) } : {}),
        avatarUrl: publicUrl(p.profilePicUrlHD) ?? publicUrl(p.profilePicUrl), bio: (p.biography ?? "").slice(0, 50000),
        posts: p.latestPosts.slice(0, 12).flatMap(post => { const imageUrl = publicUrl(post.displayUrl); return imageUrl ? [{ imageUrl, caption: (post.caption ?? "").slice(0, 5000), width: post.dimensionsWidth, height: post.dimensionsHeight }] : []; }) };
    }
    return result!;
  }
}
