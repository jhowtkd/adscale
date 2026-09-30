import { afterEach, describe, expect, it, vi } from "vitest";
import { ApifyInstagramReader, InstagramReaderError } from "./apify";

const RUNS_URL = "https://api.apify.com/v2/acts/apify~instagram-profile-scraper/runs?waitForFinish=30&timeout=180&restartOnError=false";
const runUrl = (id: string) => `https://api.apify.com/v2/actor-runs/${id}?waitForFinish=30`;
const datasetUrl = (id: string) => `https://api.apify.com/v2/datasets/${id}/items?format=json&limit=1`;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function textResponse(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

function runBody(overrides: Record<string, unknown> = {}) {
  return { data: { id: "run-1", status: "SUCCEEDED", defaultDatasetId: "ds-1", usageTotalUsd: 0.003, ...overrides } };
}
function datasetItem(overrides: Record<string, unknown> = {}) {
  return {
    username: "marca_exemplo", fullName: "Marca de Exemplo", biography: "Produtos e serviços da marca.",
    private: false, profilePicUrlHD: "https://instagram.fcdn.net/avatar-hd.jpg", profilePicUrl: "https://instagram.fcdn.net/avatar.jpg",
    latestPosts: [
      { displayUrl: "https://instagram.fcdn.net/p1.jpg", caption: "Uma publicação." },
      { displayUrl: "https://instagram.fcdn.net/p2.jpg", caption: "Outra publicação." },
    ],
    ...overrides,
  };
}

const saved = new Map<string, string | undefined>();
function setEnv(key: string, value: string | undefined) {
  if (!saved.has(key)) saved.set(key, process.env[key]);
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
afterEach(() => {
  for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  saved.clear();
});

/** Fast tests: no real delay between retries/usage samples. */
const FAST = { retryDelayMs: 0, usageDelayMs: 0 };

describe("ApifyInstagramReader", () => {
  it("fails clearly with no token, and never calls Apify", async () => {
    setEnv("APIFY_TOKEN", undefined);
    const fetchImpl = vi.fn();
    const reader = new ApifyInstagramReader({ fetch: fetchImpl, ...FAST });
    await expect(reader.profile("marca_exemplo")).rejects.toMatchObject({ message: "reader_unavailable", unbilled: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an invalid handle before any network call, as unbilled invalid_instagram", async () => {
    const fetchImpl = vi.fn();
    const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
    const error = await reader.profile("not a handle!!").catch((e) => e);
    expect(error).toMatchObject({ message: "invalid_instagram" });
    expect((error as InstagramReaderError).unbilled).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  describe("dispatch: beforeRequest guard and saveRun timing", () => {
    it("calls beforeRequest only before the POST, and never repeats it", async () => {
      const order: string[] = [];
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) { order.push("post"); return jsonResponse(runBody()); }
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem()]);
        throw new Error(`unexpected url ${url}`);
      });
      const beforeRequest = vi.fn(async () => { order.push("beforeRequest"); return true; });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, beforeRequest, ...FAST });
      await reader.profile("marca_exemplo");
      expect(order).toEqual(["beforeRequest", "post"]);
      expect(beforeRequest).toHaveBeenCalledTimes(1);
    });

    it("false from beforeRequest fails as billed/uncertain reading_failed WITHOUT sending the POST", async () => {
      const fetchImpl = vi.fn();
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, beforeRequest: async () => false, ...FAST });
      const error = await reader.profile("marca_exemplo").catch((e) => e);
      expect(error).toMatchObject({ message: "reading_failed" });
      expect((error as InstagramReaderError).unbilled).toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("never calls beforeRequest when resuming from a saved run (no new dispatch to guard)", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === runUrl("saved-run")) return jsonResponse(runBody({ id: "saved-run" }));
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem()]);
        throw new Error(`unexpected url ${url}`);
      });
      const beforeRequest = vi.fn(async () => true);
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, beforeRequest, loadRun: async () => "saved-run", ...FAST });
      await reader.profile("marca_exemplo");
      expect(beforeRequest).not.toHaveBeenCalled();
    });

    it("saves the run id as soon as it is obtained from the POST response, before polling or reading the dataset", async () => {
      const order: string[] = [];
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody({ status: "RUNNING" }));
        if (url === runUrl("run-1")) { order.push("get-run"); return jsonResponse(runBody({ status: "SUCCEEDED" })); }
        if (url === datasetUrl("ds-1")) { order.push("get-dataset"); return jsonResponse([datasetItem()]); }
        throw new Error(`unexpected url ${url}`);
      });
      const saveRun = vi.fn(async (runId: string) => { order.push(`save:${runId}`); });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, saveRun, ...FAST });
      await reader.profile("marca_exemplo");
      expect(saveRun).toHaveBeenCalledWith("run-1");
      expect(order[0]).toBe("save:run-1");
      expect(order.slice(1)).toEqual(["get-run", "get-dataset"]);
    });

    it("saves the run id even when the rest of the POST body/run turns out malformed", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse({ data: { id: "run-1" } }));
      const saveRun = vi.fn();
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, saveRun, ...FAST });
      const error = await reader.profile("marca_exemplo").catch((e) => e);
      expect(error).toMatchObject({ message: "reading_failed" });
      expect((error as InstagramReaderError).unbilled).toBe(false);
      expect(saveRun).toHaveBeenCalledWith("run-1");
    });

    it("sends the expected POST body (handle without @) and auth header", async () => {
      const fetchImpl = vi.fn(async (url: string) => (url === RUNS_URL ? jsonResponse(runBody()) : jsonResponse([datasetItem({ username: "marca_exemplo" })])));
      const reader = new ApifyInstagramReader({ token: "secret-token", fetch: fetchImpl, ...FAST });
      await reader.profile("marca_exemplo");
      const [url, init] = fetchImpl.mock.calls[0]!;
      expect(url).toBe(RUNS_URL);
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
      const body = JSON.parse(String(init?.body));
      expect(body.usernames).toEqual(["marca_exemplo"]);
      expect(url).not.toContain("@");
    });
  });

  describe("resume: loadRun skips the POST entirely and only GETs; a stale run id is NEVER retried with a fresh POST", () => {
    it("uses a saved run id to resume with a GET, never sending a new POST", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === runUrl("saved-run")) return jsonResponse(runBody({ id: "saved-run", status: "SUCCEEDED" }));
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem()]);
        throw new Error(`unexpected url ${url}`);
      });
      const loadRun = vi.fn(async () => "saved-run");
      const saveRun = vi.fn();
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, loadRun, saveRun, ...FAST });
      await reader.profile("marca_exemplo");
      expect(fetchImpl).not.toHaveBeenCalledWith(RUNS_URL, expect.anything());
      expect(saveRun).not.toHaveBeenCalled();
    });

    it("a 404 on the saved run's status GET fails immediately as billed/uncertain reading_failed, with NO retry and NO fallback POST: only a human action (a fresh reading) may dispatch again", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === runUrl("stale-run")) return jsonResponse({ error: { type: "record-not-found" } }, 404);
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, loadRun: async () => "stale-run", ...FAST });
      const error = await reader.profile("marca_exemplo").catch((e) => e);
      expect(error).toMatchObject({ message: "reading_failed" });
      expect((error as InstagramReaderError).unbilled).toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(fetchImpl).not.toHaveBeenCalledWith(RUNS_URL, expect.anything());
    });

    it("loadRun returning null behaves exactly like a first read (dispatches a fresh POST)", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody());
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem()]);
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, loadRun: async () => null, ...FAST });
      await expect(reader.profile("marca_exemplo")).resolves.toMatchObject({ exists: true });
      expect(fetchImpl).toHaveBeenCalledWith(RUNS_URL, expect.anything());
    });
  });

  describe("POST failures: never retried, always billed/uncertain", () => {
    it("a non-JSON POST response fails immediately as reading_failed (billed/uncertain), without any retry", async () => {
      const fetchImpl = vi.fn(async () => textResponse("<html>Internal Server Error</html>", 500));
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const error = await reader.profile("marca_exemplo").catch((e) => e);
      expect(error).toMatchObject({ message: "reading_failed" });
      expect((error as InstagramReaderError).unbilled).toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("a non-JSON 2xx POST response (Apify's transient HTML error page) fails immediately, without any retry", async () => {
      const fetchImpl = vi.fn(async () => textResponse("<html>ok?</html>", 200));
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const error = await reader.profile("marca_exemplo").catch((e) => e);
      expect(error).toMatchObject({ message: "reading_failed" });
      expect((error as InstagramReaderError).unbilled).toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("a transport-level rejection (e.g. a timeout) on the POST fails immediately, without any retry", async () => {
      const fetchImpl = vi.fn(async () => { throw new DOMException("aborted", "AbortError"); });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const error = await reader.profile("marca_exemplo").catch((e) => e);
      expect(error).toMatchObject({ message: "reading_failed" });
      expect((error as InstagramReaderError).unbilled).toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("a 429/5xx POST response ALSO fails immediately without retry (unlike GET, POST is never repeated)", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse({ error: "rate limited" }, 429));
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const error = await reader.profile("marca_exemplo").catch((e) => e);
      expect(error).toMatchObject({ message: "reading_failed" });
      expect((error as InstagramReaderError).unbilled).toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
  });

  describe("GET polling: non-JSON/transient failures retry with backoff, up to 3 attempts total", () => {
    it("retries a transient (5xx) run-status GET up to 3 times, succeeding on the last attempt", async () => {
      let getRunCalls = 0;
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody({ status: "RUNNING" }));
        if (url === runUrl("run-1")) {
          getRunCalls++;
          if (getRunCalls < 3) return textResponse("<html>Bad Gateway</html>", 502);
          return jsonResponse(runBody({ status: "SUCCEEDED" }));
        }
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem()]);
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const result = await reader.profile("marca_exemplo");
      expect(result.exists).toBe(true);
      expect(getRunCalls).toBe(3);
    });

    it("retries a non-JSON (2xx) run-status GET body up to 3 times, succeeding on the last attempt", async () => {
      let getRunCalls = 0;
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody({ status: "RUNNING" }));
        if (url === runUrl("run-1")) {
          getRunCalls++;
          if (getRunCalls < 3) return textResponse("<html>ok?</html>", 200);
          return jsonResponse(runBody({ status: "SUCCEEDED" }));
        }
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem()]);
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const result = await reader.profile("marca_exemplo");
      expect(result.exists).toBe(true);
      expect(getRunCalls).toBe(3);
    });

    it("gives up as reading_failed (billed/uncertain) after exhausting 3 attempts on the run-status GET", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody({ status: "RUNNING" }));
        if (url === runUrl("run-1")) return textResponse("<html>Bad Gateway</html>", 502);
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const error = await reader.profile("marca_exemplo").catch((e) => e);
      expect(error).toMatchObject({ message: "reading_failed" });
      expect((error as InstagramReaderError).unbilled).toBe(false);
      expect(fetchImpl.mock.calls.filter((c) => c[0] === runUrl("run-1"))).toHaveLength(3);
    });

    it("a 4xx (non-429) run-status GET fails immediately, with NO retry (only 429/5xx are transient)", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody({ status: "RUNNING" }));
        if (url === runUrl("run-1")) return jsonResponse({ error: "bad request" }, 400);
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const error = await reader.profile("marca_exemplo").catch((e) => e);
      expect(error).toMatchObject({ message: "reading_failed" });
      expect((error as InstagramReaderError).unbilled).toBe(false);
      expect(fetchImpl.mock.calls.filter((c) => c[0] === runUrl("run-1"))).toHaveLength(1);
    });

    it("retries a non-JSON dataset GET up to 3 times, succeeding on the last attempt", async () => {
      let datasetCalls = 0;
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody({ status: "SUCCEEDED" }));
        if (url === datasetUrl("ds-1")) {
          datasetCalls++;
          if (datasetCalls < 3) return textResponse("<html>Bad Gateway</html>", 502);
          return jsonResponse([datasetItem()]);
        }
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const result = await reader.profile("marca_exemplo");
      expect(result.exists).toBe(true);
      expect(datasetCalls).toBe(3);
    });

    // node:timers/promises' delay() is NOT reliably substituted by vi.useFakeTimers() here
    // (Apify's reader mixes it with a native AbortSignal.timeout()), so this proves the
    // exponential backoff with small REAL delays and a wall-clock lower bound instead of
    // advancing fake time — never waiting anywhere near the real default (1000ms).
    it("waits retryDelayMs with exponential backoff between GET retries (2 retries: delay*1 then delay*2)", async () => {
      let getRunCalls = 0;
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody({ status: "RUNNING" }));
        if (url === runUrl("run-1")) {
          getRunCalls++;
          if (getRunCalls < 3) return textResponse("bad", 502);
          return jsonResponse(runBody({ status: "SUCCEEDED" }));
        }
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem()]);
        throw new Error(`unexpected url ${url}`);
      });
      const retryDelayMs = 20;
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, usageDelayMs: 0, retryDelayMs });
      const start = Date.now();
      const result = await reader.profile("marca_exemplo");
      const elapsed = Date.now() - start;
      expect(result).toMatchObject({ exists: true });
      expect(getRunCalls).toBe(3);
      // Two pauses: retryDelayMs*2^0 + retryDelayMs*2^1 = 3*retryDelayMs, with slack for scheduling jitter.
      expect(elapsed).toBeGreaterThanOrEqual(retryDelayMs * 3 * 0.7);
    });
  });

  describe("polling loop: a RUNNING/READY run is polled at a fixed retryDelayMs cadence", () => {
    it("polls the run status until it reaches SUCCEEDED, then reads the dataset", async () => {
      let getRunCalls = 0;
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody({ status: "READY" }));
        if (url === runUrl("run-1")) {
          getRunCalls++;
          return jsonResponse(runBody({ status: getRunCalls < 2 ? "RUNNING" : "SUCCEEDED" }));
        }
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem()]);
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const result = await reader.profile("marca_exemplo");
      expect(result.exists).toBe(true);
      expect(getRunCalls).toBe(2);
    });
  });

  describe("deadline: the overall call has a generous but bounded timeout, sanitized to the same reading_failed as any other failure", () => {
    // AbortSignal.timeout() is a native timer that fake timers cannot control, so this
    // uses a small REAL timeoutMs instead of advancing fake time.
    it("fails as InstagramReaderError('reading_failed', unbilled:false) — no new wire error code — when the run never reaches a terminal status before timeoutMs", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody({ status: "RUNNING" }));
        if (url === runUrl("run-1")) return jsonResponse(runBody({ status: "RUNNING" }));
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, timeoutMs: 50, retryDelayMs: 10, usageDelayMs: 0 });
      const error = await reader.profile("marca_exemplo").catch((e) => e);
      expect(error).toMatchObject({ message: "reading_failed" });
      expect((error as InstagramReaderError).unbilled).toBe(false);
    });
  });

  describe("run terminal status: a failed/aborted Apify run is billed/uncertain reading_failed", () => {
    for (const status of ["FAILED", "ABORTED", "TIMED-OUT"]) {
      it(`treats a ${status} run as reading_failed (billed/uncertain), without reading the dataset`, async () => {
        const fetchImpl = vi.fn(async (url: string) => {
          if (url === RUNS_URL) return jsonResponse(runBody({ status }));
          throw new Error(`unexpected url ${url}`);
        });
        const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
        const error = await reader.profile("marca_exemplo").catch((e) => e);
        expect(error).toMatchObject({ message: "reading_failed" });
        expect((error as InstagramReaderError).unbilled).toBe(false);
      });
    }
  });

  describe("public profile: identity validation and content mapping", () => {
    it("maps a public profile into InstagramReadResult, capping posts at 12", async () => {
      const posts = Array.from({ length: 15 }, (_, i) => ({ displayUrl: `https://instagram.fcdn.net/p${i}.jpg`, caption: `Post ${i}` }));
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody());
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem({ latestPosts: posts })]);
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const result = await reader.profile("marca_exemplo");
      expect(result).toMatchObject({ exists: true, isPrivate: false, name: "Marca de Exemplo", bio: "Produtos e serviços da marca.", avatarUrl: "https://instagram.fcdn.net/avatar-hd.jpg" });
      expect(result.posts).toHaveLength(12);
      expect(result.posts[0]).toMatchObject({ imageUrl: "https://instagram.fcdn.net/p0.jpg", caption: "Post 0" });
    });

    it("falls back to profilePicUrl when profilePicUrlHD is absent", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody());
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem({ profilePicUrlHD: undefined })]);
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const result = await reader.profile("marca_exemplo");
      expect(result.avatarUrl).toBe("https://instagram.fcdn.net/avatar.jpg");
    });

    it("fails closed as reading_failed when the returned username does not match the requested handle (never invents not_found)", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody());
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem({ username: "outra_marca" })]);
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const error = await reader.profile("marca_exemplo").catch((e) => e);
      expect(error).toMatchObject({ message: "reading_failed" });
      expect((error as InstagramReaderError).unbilled).toBe(false);
    });

    it("also fails closed when the item carries no username at all", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody());
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem({ username: undefined })]);
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      await expect(reader.profile("marca_exemplo")).rejects.toMatchObject({ message: "reading_failed" });
    });

    it("accepts a case-insensitive username match", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody());
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem({ username: "Marca_Exemplo" })]);
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const result = await reader.profile("marca_exemplo");
      expect(result.exists).toBe(true);
    });

    it("drops posts with no usable displayUrl instead of inventing content", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody());
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem({ latestPosts: [{ displayUrl: "https://instagram.fcdn.net/ok.jpg", caption: "ok" }, { caption: "sem imagem" }] })]);
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const result = await reader.profile("marca_exemplo");
      expect(result.posts).toHaveLength(1);
      expect(result.posts[0]).toMatchObject({ imageUrl: "https://instagram.fcdn.net/ok.jpg", caption: "ok" });
    });

    it("defaults a missing caption to an empty string rather than omitting the post", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody());
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem({ latestPosts: [{ displayUrl: "https://instagram.fcdn.net/ok.jpg" }] })]);
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const result = await reader.profile("marca_exemplo");
      expect(result.posts).toMatchObject([{ imageUrl: "https://instagram.fcdn.net/ok.jpg", caption: "" }]);
    });
  });

  describe("private and not_found profiles: ONLY an explicit error marker triggers the minimal output from 04", () => {
    it("returns the minimal private shape when the scraper marks the profile private", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody());
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem({ private: true, biography: undefined, latestPosts: [{ displayUrl: "https://instagram.fcdn.net/leaked.jpg", caption: "x" }] })]);
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const result = await reader.profile("marca_exemplo");
      expect(result).toEqual({ exists: true, isPrivate: true, avatarUrl: null, bio: "", posts: [] });
    });

    it("also treats an explicit error: 'private' item as the minimal private shape", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody());
        if (url === datasetUrl("ds-1")) return jsonResponse([{ username: "marca_exemplo", error: "private" }]);
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const result = await reader.profile("marca_exemplo");
      expect(result).toEqual({ exists: true, isPrivate: true, avatarUrl: null, bio: "", posts: [] });
    });

    it("returns the minimal not_found shape ONLY for an explicit error: 'not_found' item", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody());
        if (url === datasetUrl("ds-1")) return jsonResponse([{ username: "marca_exemplo", error: "not_found" }]);
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const result = await reader.profile("marca_exemplo");
      expect(result).toEqual({ exists: false, isPrivate: false, avatarUrl: null, bio: "", posts: [] });
    });

    it("fails closed as reading_failed (NOT not_found) when the dataset comes back empty", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody());
        if (url === datasetUrl("ds-1")) return jsonResponse([]);
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const error = await reader.profile("marca_exemplo").catch((e) => e);
      expect(error).toMatchObject({ message: "reading_failed" });
      expect((error as InstagramReaderError).unbilled).toBe(false);
    });

    it("fails closed as reading_failed (NOT not_found) when the item reports an unrecognized error string", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody());
        if (url === datasetUrl("ds-1")) return jsonResponse([{ username: "marca_exemplo", error: "some_other_scraper_error" }]);
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const error = await reader.profile("marca_exemplo").catch((e) => e);
      expect(error).toMatchObject({ message: "reading_failed" });
      expect((error as InstagramReaderError).unbilled).toBe(false);
    });
  });

  describe("schema: a Zod mismatch is sanitized to the same InstagramReaderError('reading_failed') as any other failure", () => {
    it("fails closed on a dataset response that is not an array", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody());
        if (url === datasetUrl("ds-1")) return jsonResponse({ unexpected: true });
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const error = await reader.profile("marca_exemplo").catch((e) => e);
      expect(error).toBeInstanceOf(InstagramReaderError);
      expect(error).toMatchObject({ message: "reading_failed" });
      expect((error as InstagramReaderError).unbilled).toBe(false);
    });

    it("fails closed on a run-status response whose data does not match the expected shape", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse({ data: { id: "run-1", status: "not-a-real-status" } }));
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      const error = await reader.profile("marca_exemplo").catch((e) => e);
      expect(error).toBeInstanceOf(InstagramReaderError);
      expect(error).toMatchObject({ message: "reading_failed" });
      expect((error as InstagramReaderError).unbilled).toBe(false);
    });
  });

  describe("cost tracking: usageTotalUsd is preliminary, so recordUsage samples the same run up to 3 times", () => {
    it("records the usage as soon as a sample reports a non-zero usageTotalUsd", async () => {
      let sample = 0;
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody({ usageTotalUsd: 0 }));
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem()]);
        if (url === runUrl("run-1")) { sample++; return jsonResponse(runBody({ usageTotalUsd: sample < 2 ? 0 : 0.0032 })); }
        throw new Error(`unexpected url ${url}`);
      });
      const recordUsage = vi.fn(async () => {});
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, recordUsage, ...FAST });
      await reader.profile("marca_exemplo");
      expect(recordUsage).toHaveBeenCalledTimes(1);
      expect(recordUsage).toHaveBeenCalledWith("run-1", 0.0032);
      expect(sample).toBe(2);
    });

    it("still re-samples (does not trust the POST/completion value blindly) even when usageTotalUsd already reads > 0 there", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody({ usageTotalUsd: 0.0029 }));
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem()]);
        if (url === runUrl("run-1")) return jsonResponse(runBody({ usageTotalUsd: 0.0031 }));
        throw new Error(`unexpected url ${url}`);
      });
      const recordUsage = vi.fn(async () => {});
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, recordUsage, ...FAST });
      await reader.profile("marca_exemplo");
      expect(recordUsage).toHaveBeenCalledWith("run-1", 0.0031);
      expect(fetchImpl.mock.calls.filter((c) => c[0] === runUrl("run-1"))).toHaveLength(1);
    });

    it("records usage null (pending/unknown) when every one of the 3 samples is still zero/late", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody({ usageTotalUsd: 0 }));
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem()]);
        if (url === runUrl("run-1")) return jsonResponse(runBody({ usageTotalUsd: 0 }));
        throw new Error(`unexpected url ${url}`);
      });
      const recordUsage = vi.fn(async () => {});
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, recordUsage, ...FAST });
      await reader.profile("marca_exemplo");
      expect(recordUsage).toHaveBeenCalledTimes(1);
      expect(recordUsage).toHaveBeenCalledWith("run-1", null);
      expect(fetchImpl.mock.calls.filter((c) => c[0] === runUrl("run-1"))).toHaveLength(3);
    });

    it("never samples usage or calls recordUsage when no recordUsage callback was configured", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody({ usageTotalUsd: 0 }));
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem()]);
        throw new Error(`unexpected url ${url}`);
      });
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, ...FAST });
      await reader.profile("marca_exemplo");
      expect(fetchImpl.mock.calls.filter((c) => c[0] === runUrl("run-1"))).toHaveLength(0);
    });

    it("still records usage for a failed reading (the run was dispatched and billed regardless of outcome)", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody({ status: "FAILED", usageTotalUsd: 0 }));
        if (url === runUrl("run-1")) return jsonResponse(runBody({ status: "FAILED", usageTotalUsd: 0.001 }));
        throw new Error(`unexpected url ${url}`);
      });
      const recordUsage = vi.fn(async () => {});
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, recordUsage, ...FAST });
      await expect(reader.profile("marca_exemplo")).rejects.toMatchObject({ message: "reading_failed" });
      expect(recordUsage).toHaveBeenCalledWith("run-1", 0.001);
    });

    it("records usage null when the usage-sampling GET itself keeps failing, never letting that mask the main result", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody({ usageTotalUsd: 0 }));
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem()]);
        if (url === runUrl("run-1")) return textResponse("bad", 502);
        throw new Error(`unexpected url ${url}`);
      });
      const recordUsage = vi.fn(async () => {});
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, recordUsage, ...FAST });
      const result = await reader.profile("marca_exemplo");
      expect(result.exists).toBe(true);
      expect(recordUsage).toHaveBeenCalledWith("run-1", null);
    });

    // node:timers/promises' delay() is affected by AbortSignal.timeout()'s native (unfakeable)
    // signal only as an abort source, not as its own clock, but the surrounding default
    // AbortSignal.timeout(210_000) makes fake-timer advancement unreliable here too; a small
    // REAL usageDelayMs keeps this fast while still proving the wait actually happens.
    it("waits usageDelayMs before the first usage sample (does not sample immediately)", async () => {
      let sample = 0;
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === RUNS_URL) return jsonResponse(runBody({ usageTotalUsd: 0 }));
        if (url === datasetUrl("ds-1")) return jsonResponse([datasetItem()]);
        if (url === runUrl("run-1")) { sample++; return jsonResponse(runBody({ usageTotalUsd: 0.004 })); }
        throw new Error(`unexpected url ${url}`);
      });
      const recordUsage = vi.fn(async () => {});
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, recordUsage, retryDelayMs: 0, usageDelayMs: 100 });
      const start = Date.now();
      await reader.profile("marca_exemplo");
      expect(Date.now() - start).toBeGreaterThanOrEqual(90);
      expect(recordUsage).toHaveBeenCalledWith("run-1", 0.004);
      expect(sample).toBe(1);
    });
  });

  describe("resumed reads keep their own runId/datasetId isolated across calls", () => {
    it("two separate calls resuming from DIFFERENT saved run ids never cross-contaminate their datasets", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === runUrl("run-a")) return jsonResponse(runBody({ id: "run-a", defaultDatasetId: "ds-a", status: "SUCCEEDED" }));
        if (url === runUrl("run-b")) return jsonResponse(runBody({ id: "run-b", defaultDatasetId: "ds-b", status: "SUCCEEDED" }));
        if (url === datasetUrl("ds-a")) return jsonResponse([datasetItem({ username: "marca_a", fullName: "Marca A" })]);
        if (url === datasetUrl("ds-b")) return jsonResponse([datasetItem({ username: "marca_b", fullName: "Marca B" })]);
        throw new Error(`unexpected url ${url}`);
      });
      const readerA = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, loadRun: async () => "run-a", ...FAST });
      const readerB = new ApifyInstagramReader({ token: "k", fetch: fetchImpl, loadRun: async () => "run-b", ...FAST });
      const [a, b] = await Promise.all([readerA.profile("marca_a"), readerB.profile("marca_b")]);
      expect(a.name).toBe("Marca A");
      expect(b.name).toBe("Marca B");
    });
  });
});
