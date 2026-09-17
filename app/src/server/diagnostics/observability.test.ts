/**
 * trace-388: isolated AI-tracing bootstrap tests.
 *
 * Bootstrap only: init-once per process, isolated (never globally
 * registered) Langfuse/OTel provider, frozen flags/credentials degradation,
 * bounded export with drop counter + timed shutdown, and proof that
 * generation/settlement/prompts/retries are untouched. No model call is
 * wrapped here (#389 owns observeModelCall); no content is persisted.
 *
 * Never touches real Langfuse: active-mode tests use an injected recording
 * exporter or a loopback fake OTLP endpoint with fake credentials.
 */
import { createServer, type Server } from "node:http";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { context, ROOT_CONTEXT, trace } from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type {
  ReadableSpan,
  SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { ExportResultCode } from "@opentelemetry/core";

import {
  decideAutoRetry,
  decideGenerationRefund,
  decideJobIdempotency,
} from "../generation/canonical/policies";
import { extractPromptHardRulesSection } from "../ai/prompt-builder";
import {
  DIAGNOSTIC_EXPORT_BUDGET,
  DIAGNOSTIC_FLAG_DEFAULTS,
} from "./contract";
import {
  __resetObservabilityForTests,
  AI_TRACER_SCOPE,
  createAiTracingRuntime,
  getAiTracerProvider,
  getObservabilityStatus,
  initializeObservability,
  shutdownObservability,
  startAiSpan,
  type AiTracingRuntime,
} from "./observability";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(TEST_DIR, "..", "..", "..");
const SRC_ROOT = join(APP_ROOT, "src");

const MANAGED_ENV_KEYS = [
  "OBSERVABILITY_ENABLED",
  "OBSERVABILITY_LANGFUSE_ENABLED",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
  "LANGFUSE_BASE_URL",
  "NEXT_RUNTIME",
] as const;

let savedEnv: Record<string, string | undefined> = {};
const runtimes: AiTracingRuntime[] = [];

function clearManagedEnv(): void {
  for (const key of MANAGED_ENV_KEYS) {
    delete process.env[key];
  }
}

function trackRuntime(runtime: AiTracingRuntime | null): AiTracingRuntime | null {
  if (runtime) runtimes.push(runtime);
  return runtime;
}

beforeEach(async () => {
  savedEnv = {};
  for (const key of MANAGED_ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
  clearManagedEnv();
  await __resetObservabilityForTests();
});

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) {
    await runtime.shutdown(250);
  }
  await shutdownObservability(250);
  await __resetObservabilityForTests();
  clearManagedEnv();
  for (const key of MANAGED_ENV_KEYS) {
    const value = savedEnv[key];
    if (value !== undefined) process.env[key] = value;
  }
});

/** In-memory exporter: deterministic, no network. */
function recordingExporter(seen: ReadableSpan[][]): SpanExporter {
  return {
    export(spans, resultCallback) {
      seen.push([...spans]);
      resultCallback({ code: ExportResultCode.SUCCESS });
    },
    shutdown() {
      return Promise.resolve();
    },
  };
}

function throwingExporter(): SpanExporter {
  return {
    export(_spans, resultCallback) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: new Error("synthetic export failure"),
      });
    },
    shutdown() {
      return Promise.resolve();
    },
  };
}

function hangingExporter(): SpanExporter {
  return {
    export() {
      // Never calls back: shutdown budget must abandon the flush.
    },
    shutdown() {
      return new Promise(() => {});
    },
  };
}

function endSpans(runtime: AiTracingRuntime, count: number, attributes = {}): void {
  for (let i = 0; i < count; i += 1) {
    runtime.startSpan(`test-span-${i}`, attributes).end();
  }
}

function collectSourceFiles(root: string, out: string[] = []): string[] {
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("observability flags", () => {
  it("keeps the frozen defaults off", () => {
    expect(DIAGNOSTIC_FLAG_DEFAULTS.OBSERVABILITY_ENABLED).toBe(false);
    expect(DIAGNOSTIC_FLAG_DEFAULTS.OBSERVABILITY_LANGFUSE_ENABLED).toBe(false);
  });

  it("stays disabled when flags are unset", async () => {
    await initializeObservability("web");
    expect(getObservabilityStatus().state).toBe("disabled");
    expect(getAiTracerProvider()).toBeUndefined();
    expect(startAiSpan("nope")).toBeUndefined();
  });

  it("stays disabled in the Edge runtime even with flags on", async () => {
    process.env.NEXT_RUNTIME = "edge";
    process.env.OBSERVABILITY_ENABLED = "true";
    process.env.OBSERVABILITY_LANGFUSE_ENABLED = "true";
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";
    await initializeObservability("web");
    expect(getObservabilityStatus().state).toBe("disabled");
    expect(getAiTracerProvider()).toBeUndefined();
  });

  it("degrades to metadata-only when the master flag is on but Langfuse is off", async () => {
    process.env.OBSERVABILITY_ENABLED = "true";
    await initializeObservability("web");
    const status = getObservabilityStatus();
    expect(status.state).toBe("metadata-only");
    expect(status.process).toBe("web");
    expect(getAiTracerProvider()).toBeUndefined();
  });

  it("degrades to metadata-only when credentials are missing", async () => {
    process.env.OBSERVABILITY_ENABLED = "true";
    process.env.OBSERVABILITY_LANGFUSE_ENABLED = "true";
    await initializeObservability("worker");
    expect(getObservabilityStatus().state).toBe("metadata-only");
    expect(getAiTracerProvider()).toBeUndefined();
  });

  it("degrades to metadata-only on a malformed Langfuse base URL, never throwing", async () => {
    process.env.OBSERVABILITY_ENABLED = "true";
    process.env.OBSERVABILITY_LANGFUSE_ENABLED = "true";
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";
    process.env.LANGFUSE_BASE_URL = "::::not-a-url";
    await expect(initializeObservability("web")).resolves.toBeUndefined();
    expect(getObservabilityStatus().state).toBe("metadata-only");
    expect(getAiTracerProvider()).toBeUndefined();
  });
});

describe("initialize once per process", () => {
  function enableWithFakeExporter(): void {
    process.env.OBSERVABILITY_ENABLED = "true";
    process.env.OBSERVABILITY_LANGFUSE_ENABLED = "true";
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";
    // Loopback + unroutable port: active mode must still initialize even
    // though nothing listens (export happens off the critical path).
    process.env.LANGFUSE_BASE_URL = "http://127.0.0.1:9";
  }

  it("activates with flags on and credentials present", async () => {
    enableWithFakeExporter();
    await initializeObservability("web");
    const status = getObservabilityStatus();
    expect(status.state).toBe("active");
    expect(status.process).toBe("web");
    expect(getAiTracerProvider()).toBeInstanceOf(NodeTracerProvider);
  });

  it("is a no-op on second call, never a second provider", async () => {
    enableWithFakeExporter();
    await initializeObservability("web");
    const first = getAiTracerProvider();
    await initializeObservability("worker");
    expect(getAiTracerProvider()).toBe(first);
    // The first process wins; the second call changes nothing.
    expect(getObservabilityStatus().process).toBe("web");
    expect(getObservabilityStatus().state).toBe("active");
  });

  it("creates a single provider under concurrent init", async () => {
    enableWithFakeExporter();
    await Promise.all([
      initializeObservability("web"),
      initializeObservability("web"),
      initializeObservability("worker"),
    ]);
    expect(getObservabilityStatus().state).toBe("active");
    const provider = getAiTracerProvider();
    expect(provider).toBeInstanceOf(NodeTracerProvider);
    await initializeObservability("web");
    expect(getAiTracerProvider()).toBe(provider);
  });

  it("shutdown is safe when never initialized and never throws", async () => {
    await expect(shutdownObservability(100)).resolves.toBeUndefined();
    expect(getObservabilityStatus().state).toBe("disabled");
  });
});

describe("provider isolation", () => {
  it("never registers the AI provider globally", async () => {
    const before = trace.getTracerProvider();
    process.env.OBSERVABILITY_ENABLED = "true";
    process.env.OBSERVABILITY_LANGFUSE_ENABLED = "true";
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";
    process.env.LANGFUSE_BASE_URL = "http://127.0.0.1:9";
    await initializeObservability("web");
    expect(getAiTracerProvider()).toBeInstanceOf(NodeTracerProvider);
    expect(trace.getTracerProvider()).toBe(before);
    await shutdownObservability(250);
    expect(trace.getTracerProvider()).toBe(before);
  });

  it("starts spans on the isolated tracer scope", async () => {
    const seen: ReadableSpan[][] = [];
    const runtime = trackRuntime(
      createAiTracingRuntime({
        process: "web",
        exporter: recordingExporter(seen),
      }),
    );
    expect(runtime).not.toBeNull();
    const span = runtime!.startSpan("pilot-span", { "gen_ai.provider": "test" });
    expect(span.isRecording()).toBe(true);
    expect(span.spanContext().traceFlags & 1).toBe(1);
    span.end();
    await runtime!.flush();
    expect(seen.flat()).toHaveLength(1);
    expect(seen[0][0].instrumentationScope.name).toBe(AI_TRACER_SCOPE);
  });

  it("does not let an unsampled ambient context suppress pilot observation", async () => {
    const seen: ReadableSpan[][] = [];
    const runtime = trackRuntime(
      createAiTracingRuntime({
        process: "worker",
        exporter: recordingExporter(seen),
      }),
    );
    expect(runtime).not.toBeNull();
    // Simulate an ambient Sentry-unsampled context: valid IDs, sampled=0.
    const unsampled = trace.wrapSpanContext({
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "b7ad6b7169203331",
      traceFlags: 0,
      traceState: undefined,
      isRemote: true,
    });
    const span = context.with(
      trace.setSpan(ROOT_CONTEXT, unsampled),
      () => runtime!.startSpan("pilot-root"),
    );
    // Own root: fresh trace, sampled, recording — never joins the ambient one.
    expect(span.spanContext().traceId).not.toBe(
      "0af7651916cd43dd8448eb211c80319c",
    );
    expect(span.spanContext().traceFlags & 1).toBe(1);
    expect(span.isRecording()).toBe(true);
    span.end();
    await runtime!.flush();
    expect(seen.flat()).toHaveLength(1);
  });
});

describe("bounded export", () => {
  it("uses the frozen journal budget values", () => {
    expect(DIAGNOSTIC_EXPORT_BUDGET.maxBufferedEvents).toBe(128);
    expect(DIAGNOSTIC_EXPORT_BUDGET.maxBufferedBytes).toBe(512 * 1024);
    expect(DIAGNOSTIC_EXPORT_BUDGET.maxBatchEvents).toBe(25);
    expect(DIAGNOSTIC_EXPORT_BUDGET.maxConcurrentFlushes).toBe(1);
    expect(DIAGNOSTIC_EXPORT_BUDGET.flushIntervalMs).toBe(1000);
  });

  it("bounds the queue at 128 spans with a drop counter", async () => {
    const seen: ReadableSpan[][] = [];
    const runtime = trackRuntime(
      createAiTracingRuntime({
        process: "web",
        exporter: recordingExporter(seen),
      }),
    )!;
    endSpans(runtime, 200);
    const stats = runtime.stats();
    expect(stats.bufferedSpans).toBe(128);
    expect(stats.droppedSpans).toBe(72);
    await runtime.flush();
    expect(seen.flat()).toHaveLength(128);
    expect(runtime.stats().exportedSpans).toBe(128);
    // Every batch respects the 25-span ceiling.
    for (const batch of seen) {
      expect(batch.length).toBeLessThanOrEqual(25);
    }
  });

  it("bounds the queue at 512 KiB with a drop counter", async () => {
    const seen: ReadableSpan[][] = [];
    const runtime = trackRuntime(
      createAiTracingRuntime({
        process: "web",
        exporter: recordingExporter(seen),
      }),
    )!;
    // 8 KiB attributes x 100 spans overflows 512 KiB well before 128 spans.
    endSpans(runtime, 100, { bulk: "x".repeat(8 * 1024) });
    const stats = runtime.stats();
    expect(stats.bufferedSpans).toBeLessThan(100);
    expect(stats.droppedSpans).toBeGreaterThan(0);
    expect(stats.bufferedSpans + stats.droppedSpans).toBe(100);
  });

  it("drops a single span larger than the whole buffer", async () => {
    const seen: ReadableSpan[][] = [];
    const runtime = trackRuntime(
      createAiTracingRuntime({
        process: "web",
        exporter: recordingExporter(seen),
      }),
    )!;
    endSpans(runtime, 1, { bulk: "y".repeat(600 * 1024) });
    expect(runtime.stats().bufferedSpans).toBe(0);
    expect(runtime.stats().droppedSpans).toBe(1);
    await runtime.flush();
    expect(seen.flat()).toHaveLength(0);
  });

  it("runs one flush at a time", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const gate: Array<() => void> = [];
    const exporter: SpanExporter = {
      export(spans, resultCallback) {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        gate.push(() => {
          concurrent -= 1;
          resultCallback({ code: ExportResultCode.SUCCESS });
        });
      },
      shutdown() {
        return Promise.resolve();
      },
    };
    const runtime = trackRuntime(
      createAiTracingRuntime({ process: "web", exporter }),
    )!;
    endSpans(runtime, 50);
    const first = runtime.flush();
    const second = runtime.flush();
    // Both flush calls share one in-flight flush; release exports one by one.
    let settled = false;
    const both = Promise.all([first, second]).then(() => {
      settled = true;
    });
    const deadline = Date.now() + 5000;
    while (!settled && Date.now() < deadline) {
      gate.shift()?.();
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(settled).toBe(true);
    await both;
    expect(maxConcurrent).toBe(1);
  });

  it("flushes periodically without an explicit flush call", async () => {
    const seen: ReadableSpan[][] = [];
    const runtime = trackRuntime(
      createAiTracingRuntime({
        process: "web",
        exporter: recordingExporter(seen),
        flushIntervalMs: 10,
      }),
    )!;
    endSpans(runtime, 3);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(seen.flat()).toHaveLength(3);
  });

  it("keeps failed batches buffered for the next flush and never rejects", async () => {
    const seen: ReadableSpan[][] = [];
    const runtime = trackRuntime(
      createAiTracingRuntime({
        process: "web",
        exporter: throwingExporter(),
      }),
    )!;
    endSpans(runtime, 10);
    await expect(runtime.flush()).resolves.toBeUndefined();
    expect(runtime.stats().failedFlushes).toBeGreaterThan(0);
    // Nothing reached the exporter; spans stay buffered for retry.
    expect(seen.flat()).toHaveLength(0);
    expect(runtime.stats().bufferedSpans).toBe(10);
  });

  it("abandons an unresponsive export at the shutdown budget", async () => {
    const runtime = trackRuntime(
      createAiTracingRuntime({
        process: "worker",
        exporter: hangingExporter(),
      }),
    )!;
    endSpans(runtime, 5);
    const started = Date.now();
    await runtime.shutdown(50);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(runtime.stats().droppedSpans).toBe(5);
    expect(runtime.stats().bufferedSpans).toBe(0);
  });
});

describe("fake Langfuse endpoint", () => {
  it("posts OTLP batches with auth headers outside the business transaction", async () => {
    const requests: Array<{
      method: string | undefined;
      url: string | undefined;
      authorization: string | number | string[] | undefined;
      publicKey: string | number | string[] | undefined;
      bytes: number;
    }> = [];
    const server: Server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        requests.push({
          method: req.method,
          url: req.url,
          authorization: req.headers.authorization,
          publicKey: req.headers["x-langfuse-public-key"],
          bytes: Buffer.concat(chunks).length,
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port =
      typeof address === "object" && address ? address.port : 0;
    expect(port).toBeGreaterThan(0);
    try {
      process.env.OBSERVABILITY_ENABLED = "true";
      process.env.OBSERVABILITY_LANGFUSE_ENABLED = "true";
      process.env.LANGFUSE_PUBLIC_KEY = "pk-fake";
      process.env.LANGFUSE_SECRET_KEY = "sk-fake";
      process.env.LANGFUSE_BASE_URL = `http://127.0.0.1:${port}`;
      await initializeObservability("web");
      expect(getObservabilityStatus().state).toBe("active");
      // Business work completes first; export only happens on flush/shutdown.
      const span = startAiSpan("pilot-export", { "gen_ai.provider": "fake" });
      expect(span).toBeDefined();
      span!.end();
      expect(requests).toHaveLength(0);
      await shutdownObservability(5000);
      expect(requests.length).toBeGreaterThanOrEqual(1);
      expect(requests[0].method).toBe("POST");
      expect(requests[0].url).toBe("/api/public/otel/v1/traces");
      expect(requests[0].authorization).toBe(
        `Basic ${Buffer.from("pk-fake:sk-fake").toString("base64")}`,
      );
      expect(requests[0].publicKey).toBe("pk-fake");
      expect(requests[0].bytes).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});

describe("generation stays byte-identical", () => {
  const PROMPT_FIXTURE =
    "HARD RULES / NON-NEGOTIABLE CONTRACT\n- rule one\n- rule two\n\nMODE:\nrest";

  /** Settlement + retry + idempotency + prompt decisions on fixed inputs. */
  function businessSnapshot(): string {
    return JSON.stringify({
      refund: decideGenerationRefund({
        surface: "assistant",
        generationMode: "creative_revision",
        assistantActionId: "a1",
        failurePhase: "job_failure",
      }),
      retry: decideAutoRetry({ surface: "campaign", eligibleByPolicy: true }),
      idempotency: decideJobIdempotency({
        surface: "quick_tool",
        outputStatus: "completed",
      }),
      prompt: extractPromptHardRulesSection(PROMPT_FIXTURE),
    });
  }

  it("is identical with observability off, on, or throwing", async () => {
    const off = businessSnapshot();

    const seen: ReadableSpan[][] = [];
    const active = trackRuntime(
      createAiTracingRuntime({
        process: "web",
        exporter: recordingExporter(seen),
      }),
    )!;
    endSpans(active, 30, { "gen_ai.provider": "snapshot" });
    await active.flush();
    expect(seen.flat()).toHaveLength(30);
    const on = businessSnapshot();

    const failing = trackRuntime(
      createAiTracingRuntime({
        process: "web",
        exporter: throwingExporter(),
      }),
    )!;
    endSpans(failing, 30);
    await failing.flush();
    expect(failing.stats().failedFlushes).toBeGreaterThan(0);
    const throwing = businessSnapshot();

    expect(on).toBe(off);
    expect(throwing).toBe(off);
    expect(JSON.parse(off).prompt).toContain("rule one");
  });
});

describe("import-chain and wiring guards", () => {
  it("marks the bootstrap module server-only", () => {
    const source = readFileSync(
      join(TEST_DIR, "observability.ts"),
      "utf8",
    );
    expect(source).toMatch(/^import "server-only";/m);
  });

  it("is imported only by the web and worker entrypoints", () => {
    const importers: string[] = [];
    for (const file of collectSourceFiles(SRC_ROOT)) {
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
      const content = readFileSync(file, "utf8");
      if (content.includes("diagnostics/observability")) {
        importers.push(file.slice(SRC_ROOT.length + 1));
      }
    }
    // No model-call wrapper, no journal event, no UI: bootstrap wiring only.
    expect(importers.sort()).toEqual([
      join("instrumentation.ts"),
      join("server", "jobs", "image-worker-entry.ts"),
    ]);
  });

  it("is never imported by a client component", () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(SRC_ROOT)) {
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
      const content = readFileSync(file, "utf8");
      const isClient = /^"use client";/m.test(content) || /^'use client';/m.test(content);
      if (isClient && content.includes("diagnostics/observability")) {
        offenders.push(file.slice(SRC_ROOT.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("wires web init dynamically under the nodejs runtime only", () => {
    const source = readFileSync(join(SRC_ROOT, "instrumentation.ts"), "utf8");
    // No static import: the Node SDK must never enter the Edge bundle.
    for (const line of source.split("\n")) {
      if (/^\s*import\b/.test(line)) {
        expect(line).not.toContain("diagnostics/observability");
      }
    }
    expect(source).toContain("initializeObservability");
    const edgeBlock = source.split('NEXT_RUNTIME === "edge"')[1] ?? "";
    expect(edgeBlock).not.toContain("initializeObservability");
    expect(edgeBlock).not.toContain("diagnostics/observability");
  });

  it("boots the worker through a dynamic entrypoint with Inngest IDs preserved", () => {
    const entry = readFileSync(
      join(SRC_ROOT, "server", "jobs", "image-worker-entry.ts"),
      "utf8",
    );
    const initAt = entry.indexOf("initializeObservability");
    const dynamicAt = entry.indexOf('import("./image-worker")');
    expect(initAt).toBeGreaterThanOrEqual(0);
    expect(dynamicAt).toBeGreaterThan(initAt);
    expect(entry).toContain("startImageWorker");
    // The entrypoint adds no client: the two existing app IDs stay untouched.
    expect(entry).not.toContain("new Inngest");
    const webClient = readFileSync(
      join(SRC_ROOT, "server", "jobs", "client.ts"),
      "utf8",
    );
    const workerClient = readFileSync(
      join(SRC_ROOT, "server", "jobs", "worker-client.ts"),
      "utf8",
    );
    expect(webClient).toContain('id: "adscale"');
    expect(workerClient).toContain('id: "adscale-image-worker"');
    const render = readFileSync(join(APP_ROOT, "..", "render.yaml"), "utf8");
    expect(render).toContain("src/server/jobs/image-worker-entry.ts");
  });
});
