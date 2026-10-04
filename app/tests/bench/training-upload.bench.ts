// Ticket 19, phase 1: the REAL POST handler of /api/client-profiles/[id]/training-assets, with auth, repositories, storage and Inngest faked (no database, no vendor), measured in
// a clean process. BENCH_MODE=before runs it with `main`'s upload (the frozen oracle: sharp in the server); BENCH_MODE=after with the code under test. Fixtures are written by
// ANOTHER process (run-training-upload-bench.ts) and only read from disk here. Evidence, not an assertion: nothing here fails on time or memory.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { it, vi } from "vitest";

const MODE = process.env.BENCH_MODE === "before" ? "before" : "after";
const SCENARIO = process.env.BENCH_SCENARIO ?? "";
const FIXTURES = process.env.BENCH_FIXTURES ?? "";
const OUT = process.env.BENCH_OUT ?? "";
const stored: Array<{ key: string; bytes: number; type: string }> = [];
const events: unknown[] = [];

vi.mock("next-intl/server", () => ({ getTranslations: () => Promise.resolve((key: string) => key) }));
vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess: () => Promise.resolve({ user: { id: "user-1" }, workspace: { id: "ws-bench" } }) }));
vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: async () => ({ id: "profile-1" }),
  createTrainingReference: async (_workspaceId: string, input: Record<string, unknown>) => ({ id: "ref-1", ...input }),
  deleteTrainingReference: async () => null,
  getTrainingReferences: async () => [],
}));
vi.mock("@/server/repositories/workspace-asset", () => ({
  createWorkspaceAsset: async (input: Record<string, unknown>) => ({ id: "asset-1", ...input }),
  deleteWorkspaceAsset: async () => null,
  getWorkspaceAssetsByKeys: async () => [],
}));
vi.mock("@/server/storage", () => ({ objectStorage: {
  put: async (key: string, body: Buffer, type: string) => { stored.push({ key, bytes: body.byteLength, type }); },
  delete: async () => undefined, publicUrl: (key: string) => `https://cdn.example/${key}`,
} }));
vi.mock("@/server/jobs/client", () => ({ inngest: { send: async (event: unknown) => { events.push(event); } } }));
// The only switch between the two runs: which upload module the real route imports.
vi.mock("@/server/brand-training/upload", async importOriginal => {
  if (process.env.BENCH_MODE === "before") return await import("../fixtures/classic-raster-main/upload");
  return await importOriginal();
});

type Reading = { status: number; retryAfter: string | null; ms: number; baseRssMb: number; peakRssMb: number; afterRssMb: number; storedBytes: number; body: string };
const mb = (bytes: number) => Math.round((bytes / 1048576) * 10) / 10;

/** `phase` runs `count` requests at once while RSS is sampled every 2 ms. */
async function phase(post: (request: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>, file: { name: string; type: string; bytes: Buffer }, count: number): Promise<Reading[]> {
  const base = process.memoryUsage.rss();
  let peak = base;
  const sampler = setInterval(() => { peak = Math.max(peak, process.memoryUsage.rss()); }, 2);
  const before = stored.length;
  const readings = await Promise.all(Array.from({ length: count }, async () => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array(file.bytes)], file.name, { type: file.type }));
    const started = performance.now();
    const response = await post(new Request("http://localhost/api/client-profiles/profile-1/training-assets", { method: "POST", body: form }), { params: Promise.resolve({ id: "profile-1" }) });
    const text = await response.text();
    return { status: response.status, retryAfter: response.headers.get("Retry-After"), ms: Math.round(performance.now() - started), text };
  }));
  clearInterval(sampler);
  peak = Math.max(peak, process.memoryUsage.rss());
  const written = stored.slice(before).reduce((total, item) => total + item.bytes, 0);
  return readings.map(r => ({ status: r.status, retryAfter: r.retryAfter, ms: r.ms, baseRssMb: mb(base), peakRssMb: mb(peak), afterRssMb: mb(process.memoryUsage.rss()), storedBytes: Math.round(written / count), body: r.text.slice(0, 90) }));
}

it(`training-assets POST: ${SCENARIO} (${MODE})`, async () => {
  const manifest = JSON.parse(readFileSync(path.join(FIXTURES, "manifest.json"), "utf8")) as Record<string, { file: string; name: string; type: string; describes: string }>;
  const entry = manifest[SCENARIO];
  if (!entry) throw new Error(`unknown scenario ${SCENARIO}`);
  const file = { name: entry.name, type: entry.type, bytes: readFileSync(path.join(FIXTURES, entry.file)) };
  const { POST } = await import("@/app/api/client-profiles/[id]/training-assets/route");
  const loaded = process.report.getReport().sharedObjects.filter(object => /sharp|vips/i.test(object)).length > 0;
  const startRssMb = mb(process.memoryUsage.rss());
  // Two readings one after the other (the first one can hide the peak: a WebP's metadata is read once and cached by the allocator), then eight together.
  const first = (await phase(POST, file, 1))[0]!;
  const second = (await phase(POST, file, 1))[0]!;
  const eight = await phase(POST, file, 8);
  const result = {
    scenario: SCENARIO, mode: MODE, describes: entry.describes, fileBytes: file.bytes.length, sharpInServerProcess: loaded, startRssMb,
    reading1: first, reading2: second,
    eightTogether: { statuses: eight.map(r => r.status), retryAfterOfFailures: eight.filter(r => r.status >= 400).map(r => r.retryAfter), failedBodies: [...new Set(eight.filter(r => r.status >= 400).map(r => r.body))], msEach: eight.map(r => r.ms), baseRssMb: eight[0]!.baseRssMb, peakRssMb: eight[0]!.peakRssMb, afterRssMb: eight[0]!.afterRssMb, storedBytesEach: eight[0]!.storedBytes },
    maxRssMbOfProcess: mb(process.resourceUsage().maxRSS * 1024), eventsSent: events.length,
  };
  writeFileSync(OUT, JSON.stringify(result, null, 2));
});
