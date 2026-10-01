// The Apify cost measurement as a property (ticket 13, D-4): whatever the provider answers to the samples, measureCost() never throws, records the cost
// of the run it was handed exactly once (null when it cannot tell, never zero), and never samples more than three times.
import { describe, expect, it, vi } from "vitest";
import { ApifyInstagramReader } from "./apify";

const RUN_URL = "https://api.apify.com/v2/actor-runs/run-1?waitForFinish=30";
const FAST = { retryDelayMs: 0, usageDelayMs: 0 };
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T,>(r: () => number, items: readonly T[]): T => items[Math.floor(r() * items.length)]!;

type Kind = "zero" | "positive" | "absent" | "otherRun" | "nonJson" | "http429" | "http500" | "http404" | "reject" | "badSchema";
const KINDS: Kind[] = ["zero", "positive", "absent", "otherRun", "nonJson", "http429", "http500", "http404", "reject", "badSchema"];
const body = (id: string, extra: Record<string, unknown>) => ({ data: { id, status: "SUCCEEDED", defaultDatasetId: "ds-1", ...extra } });

function respond(kind: Kind, usage: number): Promise<Response> {
  const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } }));
  switch (kind) {
    case "zero": return json(body("run-1", { usageTotalUsd: 0 }));
    case "positive": return json(body("run-1", { usageTotalUsd: usage }));
    case "absent": return json(body("run-1", {}));
    case "otherRun": return json(body("run-2", { usageTotalUsd: 9.99 }));
    case "nonJson": return Promise.resolve(new Response("<html>bad gateway</html>", { status: 200, headers: { "content-type": "text/html" } }));
    case "http429": return json({}, 429);
    case "http500": return json({}, 500);
    case "http404": return json({}, 404);
    case "reject": return Promise.reject(new TypeError("fetch failed"));
    case "badSchema": return json(body("run-1", { usageTotalUsd: -1 }));
  }
}

/** The contract, written independently of the implementation: a GET is retried (up to 3 tries) only when it fails in a way that can pass; a failed or foreign sample ends it. */
function oracle(script: Array<{ kind: Kind; usage: number }>) {
  let index = 0, gets = 0;
  const next = () => script[index++] ?? { kind: "zero" as Kind, usage: 0 };
  const sample = (): "error" | { kind: Kind; usage: number } => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const answer = next(); gets++;
      if (["zero", "positive", "absent", "otherRun", "badSchema"].includes(answer.kind)) return answer;
      if (answer.kind === "http404") return "error";
      if (attempt === 2) return "error";
    }
    return "error";
  };
  for (let n = 0; n < 3; n++) {
    const got = sample();
    if (got === "error" || got.kind === "otherRun" || got.kind === "badSchema") return { value: null, gets };
    if (got.kind === "positive") return { value: got.usage, gets };
  }
  return { value: null, gets };
}

describe("ApifyInstagramReader.measureCost property", () => {
  it("records exactly once, the first positive usage of the right run or null, and never throws, for 1,500 random provider behaviors", async () => {
    const r = rng(404);
    const seen = new Set<string>();
    for (let i = 0; i < 1500; i++) {
      const script = Array.from({ length: int(r, 0, 9) }, () => ({ kind: pick(r, KINDS), usage: Math.round((0.0001 + r() * 0.05) * 1e5) / 1e5 }));
      const log: string[] = [];
      let cursor = 0;
      const fetchImpl = vi.fn(async (url: string) => {
        log.push(url);
        const step = script[cursor++] ?? { kind: "zero" as Kind, usage: 0 };
        return respond(step.kind, step.usage);
      });
      const recordUsage = vi.fn(async () => {});
      const reader = new ApifyInstagramReader({ token: "k", fetch: fetchImpl as never, recordUsage, loadRun: async () => "run-1", ...FAST });
      await expect(reader.measureCost(), JSON.stringify(script)).resolves.toBeUndefined();
      const expected = oracle(script);
      seen.add(expected.value === null ? "null" : "value");
      expect(recordUsage, JSON.stringify(script)).toHaveBeenCalledTimes(1);
      expect(recordUsage).toHaveBeenCalledWith("run-1", expected.value);
      // Only the run it was handed is ever asked about, and never a POST.
      expect(log.every(url => url === RUN_URL)).toBe(true);
      expect(fetchImpl.mock.calls.every(([, init]) => (init as RequestInit).method === "GET")).toBe(true);
      expect(log).toHaveLength(expected.gets);
      // 3 samples, each of which may retry a transient failure up to 3 tries.
      expect(log.length).toBeLessThanOrEqual(9);
      // Another run's usage is never recorded.
      expect(recordUsage.mock.calls.every(call => (call as unknown[])[1] !== 9.99)).toBe(true);
    }
    expect(seen).toEqual(new Set(["null", "value"]));
  }, 60_000);

  it("never records a cost for a reading that dispatched nothing, and never fetches", async () => {
    for (const loadRun of [async () => null, async () => "not a valid id!!", async () => { throw new Error("db down"); }]) {
      const fetchImpl = vi.fn(); const recordUsage = vi.fn(async () => {});
      await expect(new ApifyInstagramReader({ token: "k", fetch: fetchImpl as never, recordUsage, loadRun, ...FAST }).measureCost()).resolves.toBeUndefined();
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(recordUsage).not.toHaveBeenCalled();
    }
  });

  it("a recordUsage that rejects is swallowed, and was still called once", async () => {
    const recordUsage = vi.fn(async () => { throw new Error("db down"); });
    const fetchImpl = vi.fn(async () => respond("positive", 0.004));
    await expect(new ApifyInstagramReader({ token: "k", fetch: fetchImpl as never, recordUsage, loadRun: async () => "run-1", ...FAST }).measureCost()).resolves.toBeUndefined();
    expect(recordUsage).toHaveBeenCalledTimes(1);
  });

  it("profile() never records the cost nor waits for usageDelayMs, whatever the run reports (60 random runs)", async () => {
    const r = rng(9);
    for (let i = 0; i < 60; i++) {
      const usage = pick(r, [0, 0.003, undefined]);
      const fetchImpl = vi.fn(async (url: string) => {
        if (url.includes("/runs?")) return respond(usage === undefined ? "absent" : usage === 0 ? "zero" : "positive", usage ?? 0);
        if (url.includes("/datasets/")) return new Response(JSON.stringify([{ username: "marca_exemplo", fullName: "M", biography: "b", private: false, latestPosts: [] }]), { status: 200 });
        throw new Error(`unexpected ${url}`);
      });
      const recordUsage = vi.fn(async () => {});
      let saved: string | null = null;
      const start = Date.now();
      await new ApifyInstagramReader({ token: "k", fetch: fetchImpl as never, recordUsage, saveRun: async id => { saved = id; }, loadRun: async () => saved, retryDelayMs: 0, usageDelayMs: 60_000 }).profile("marca_exemplo");
      expect(Date.now() - start).toBeLessThan(5_000);
      expect(recordUsage).not.toHaveBeenCalled();
      expect(fetchImpl.mock.calls.map(([url]) => String(url))).not.toContain(RUN_URL); // No cost sample: the run came finished with the dispatch.
    }
  });
});
