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
  token?: string; fetch?: typeof fetch; timeoutMs?: number; retryDelayMs?: number; usageDelayMs?: number;
  beforeRequest?: () => Promise<boolean>; loadRun?: () => Promise<string | null>; saveRun?: (runId: string) => Promise<void>;
  recordUsage?: (runId: string, usageTotalUsd: number | null) => Promise<void>;
};
export class ApifyInstagramReader implements InstagramReader {
  constructor(private readonly options: ApifyReaderOptions = {}) {}
  async profile(value: string): Promise<InstagramReadResult> {
    try { return await this.readProfile(value); }
    catch (error) { throw error instanceof InstagramReaderError ? error : new InstagramReaderError("reading_failed"); }
  }
  private async readProfile(value: string): Promise<InstagramReadResult> {
    const token = this.options.token ?? env.APIFY_TOKEN;
    if (!token) throw new InstagramReaderError("reader_unavailable", true);
    let handle: string;
    try { handle = normalizeInstagram(value); }
    catch { throw new InstagramReaderError("invalid_instagram", true); }
    const signal = AbortSignal.timeout(this.options.timeoutMs ?? 210_000);
    const pause = (ms: number) => delay(ms, undefined, { signal });
    const request = async (path: string, body?: object): Promise<unknown> => {
      // Only GET can be retried: an invalid POST response may hide a charged run.
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
    let result: InstagramReadResult | null = null;
    try {
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
    } finally {
      if (this.options.recordUsage) {
        let usage: number | null = null;
        try {
          // Apify documents preliminary completion costs; sample the exact run after ~10s.
          await pause(this.options.usageDelayMs ?? 10_000);
          for (let attempt = 0; attempt < 3; attempt++) {
            const measured = await readRun();
            if ((measured.usageTotalUsd ?? 0) > 0) { usage = measured.usageTotalUsd!; break; }
            if (attempt < 2) await pause((this.options.retryDelayMs ?? 1_000) * 2 ** attempt);
          }
        } catch { /* Missing/zero preliminary usage remains explicitly unknown, never free. */ }
        await abortable(this.options.recordUsage(runId, usage), AbortSignal.timeout(5_000));
      }
    }
    return result!;
  }
}
