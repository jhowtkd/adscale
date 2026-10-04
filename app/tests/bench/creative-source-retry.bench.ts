import { it, expect, vi } from "vitest";
import http from "node:http";
import { writeFileSync } from "node:fs";
import { Inngest } from "inngest";
import { serve } from "inngest/node";
import { RasterRetryError } from "@/server/equipe/handoff/raster-image";
import { createCreativeWorkSourceAnalyzeJobV2 } from "@/server/jobs/creative-work-source";
const getCreativeWork = vi.hoisted(() => vi.fn());
const getWorkspaceAssetById = vi.hoisted(() => vi.fn());
const getTemplateById = vi.hoisted(() => vi.fn());
const updateCreativeWorkSourceIfUnchanged = vi.hoisted(() => vi.fn());
const getObject = vi.hoisted(() => vi.fn());
const analyzeImageContent = vi.hoisted(() => vi.fn());
const analyzeImageStyle = vi.hoisted(() => vi.fn());
const normalizeImageForAi = vi.hoisted(() => vi.fn());
const inspectUsableTransparency = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({ getCreativeWork, updateCreativeWorkSourceIfUnchanged }));
vi.mock("@/server/repositories/workspace-asset", () => ({ getWorkspaceAssetById }));
vi.mock("@/server/repositories/template", () => ({ getTemplateById }));
vi.mock("@/server/storage", () => ({ objectStorage: { get: getObject } }));
vi.mock("@/server/ai/normalize-image-for-ai", () => ({
  normalizeImageForAi: (...args: unknown[]) => normalizeImageForAi(...args),
  inspectUsableTransparency: (...args: unknown[]) => inspectUsableTransparency(...args),
}));
vi.mock("@/server/ai/image-analysis", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/ai/image-analysis")>(),
  analyzeImageContent,
  analyzeImageStyle,
}));


// Local evidence only: actual application and job, fake I/O, real SDK executor.
it("real executor reuses one claim across three bounded analysis attempts", async () => {
  const rows = new Map<string, Record<string, unknown>>();
  const completed = new Map<string, unknown>();
  const runs = new Map<string, number>(), providers = new Map<string, number>(), claims = new Map<string, number>();
  let clock = 0;
  getCreativeWork.mockImplementation(async (_ws, id) => ({ work: {}, sources: [{ ...rows.get(id) }], outputs: [] }));
  updateCreativeWorkSourceIfUnchanged.mockImplementation(async (_ws, id, _source, expected, patch) => {
    const row = rows.get(id)!;
    if (!row) return null;
    if (row.status !== expected.status || row.usage !== expected.usage || new Date(row.updatedAt as string).getTime() !== new Date(expected.updatedAt).getTime()) return null;
    const next = { ...row, ...patch, updatedAt: new Date(1_800_000_000_000 + ++clock) }; rows.set(id, next);
    if (patch.status === "analyzing") claims.set(id, (claims.get(id) ?? 0) + 1);
    console.log("CAS", id, expected.status, "->", next.status, next.updatedAt.toISOString()); return { ...next };
  });
  getWorkspaceAssetById.mockImplementation(async (id) => ({ id, key: id, type: "image/png" }));
  getObject.mockImplementation(async (id) => Buffer.from(id));
  normalizeImageForAi.mockImplementation(async ({ buffer }: { buffer: Buffer }) => {
    const id = buffer.toString(), n = (runs.get(id) ?? 0) + 1; runs.set(id, n); console.log("ANALYSIS", id, n);
    if (id === "source-deleted" && n === 1) {
      setTimeout(() => { rows.delete(id); console.log("DELETED DURING BACKOFF", id); }, 100);
      throw new RasterRetryError("capacity");
    }
    if (n <= Number(id.slice(-1))) throw new RasterRetryError("capacity");
    return { buffer, mimeType: "image/png", hasTransparency: false };
  });
  analyzeImageContent.mockImplementation(async (buffer: Buffer) => {
    const id = buffer.toString(); providers.set(id, (providers.get(id) ?? 0) + 1); console.log("PROVIDER", id, providers.get(id));
    if (Number(process.env.SOURCE_PROBE_PROVIDER_MS)) await new Promise((resolve) => setTimeout(resolve, Number(process.env.SOURCE_PROBE_PROVIDER_MS)));
    return { product: "Tênis", offer: "20%", cta: { text: "Comprar", style: "botão" }, brandElements: ["logo"], keyVisual: "produto", textContent: { headline: "Novo", bullets: [] }, format: "4:5" };
  });
  const dev = process.env.SOURCE_PROBE_DEV_URL ?? "http://127.0.0.1:39298", port = Number(process.env.SOURCE_PROBE_PORT ?? "39631");
  const client = new Inngest({ id: `ticket19-real-source-proof-${port}-${process.env.SOURCE_PROBE_CHECKPOINTING ?? "on"}-${process.env.SOURCE_PROBE_PROVIDER_MS ?? "0"}`, isDev: true, baseUrl: dev, eventKey: "local-test", ...(process.env.SOURCE_PROBE_CHECKPOINTING === "false" ? { checkpointing: false } : {}) });
  const job = createCreativeWorkSourceAnalyzeJobV2(client);
  const original = job.fn;
  job.fn = async (...args: Parameters<typeof original>) => {
    const result = await original(...args);
    completed.set(args[0].event.data.sourceId, result ?? null);
    console.log("COMPLETED", args[0].event.data.sourceId, result?.status ?? null);
    return result;
  };
  const handler = serve({ client, functions: [job], serveHost: `http://127.0.0.1:${port}` });
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve)); console.log("APP READY", port);
  try {
    for (const n of [1, 2, 3]) { const id = `source-${n}`; rows.set(id, { id, workspaceId: "probe-ws", workItemId: id, assetId: id, templateId: null, usage: "content", status: "uploaded", failureCode: null, updatedAt: new Date(1_700_000_000_000) }); }
    rows.set("source-deleted", { id: "source-deleted", workspaceId: "probe-ws", workItemId: "source-deleted", assetId: "source-deleted", usage: "content", status: "uploaded", failureCode: null, updatedAt: new Date(1_700_000_000_000) });
    let registered = false;
    for (let i = 0; i < 90 && !registered; i++) {
      try { registered = (await fetch(`${dev}/health`)).ok; } catch { /* CLI still starting */ }
      if (!registered) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    expect(registered).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 8000)); // allow CLI SDK synchronization
    await client.send(["source-1", "source-2", "source-3", "source-deleted"].map((id) => ({ name: "creative-work.source.analyze.v2", data: { workspaceId: "probe-ws", workItemId: id, sourceId: id } })));
    for (let i = 0; i < 240; i++) { if ([...rows.values()].every((row) => row.status === "ready" || row.status === "failed") && completed.has("source-deleted")) break; await new Promise((resolve) => setTimeout(resolve, 1000)); }
    const results = [1, 2, 3].map((n) => ({ failures: n, status: rows.get(`source-${n}`)?.status, failureCode: rows.get(`source-${n}`)?.failureCode, claims: claims.get(`source-${n}`) ?? 0, analysisExecutions: runs.get(`source-${n}`) ?? 0, providerCalls: providers.get(`source-${n}`) ?? 0 }));
    const deletion = { completed: completed.has("source-deleted"), result: completed.get("source-deleted"), exists: rows.has("source-deleted"), analysisExecutions: runs.get("source-deleted"), providerCalls: providers.get("source-deleted") ?? 0 };
    expect(deletion).toEqual({ completed: true, result: null, exists: false, analysisExecutions: 1, providerCalls: 0 });
    console.log("RESULTS", JSON.stringify({ results, deletion }));
    if (process.env.SOURCE_PROBE_OUTPUT) writeFileSync(process.env.SOURCE_PROBE_OUTPUT, JSON.stringify({ sdk: "4.4.0", checkpointing: process.env.SOURCE_PROBE_CHECKPOINTING !== "false", providerLatencyMs: Number(process.env.SOURCE_PROBE_PROVIDER_MS ?? 0), results, deletion }, null, 2));
    expect(results).toEqual([
      { failures: 1, status: "ready", failureCode: null, claims: 1, analysisExecutions: 2, providerCalls: 1 },
      { failures: 2, status: "ready", failureCode: null, claims: 1, analysisExecutions: 3, providerCalls: 1 },
      { failures: 3, status: "failed", failureCode: "analysis_failed", claims: 1, analysisExecutions: 3, providerCalls: 0 },
    ]);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
}, 360_000);
