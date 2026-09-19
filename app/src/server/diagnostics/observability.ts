import "server-only";
import { ROOT_CONTEXT, trace, type Attributes, type Span } from "@opentelemetry/api";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  AlwaysOnSampler,
  NodeTracerProvider,
} from "@opentelemetry/sdk-trace-node";
import type {
  ReadableSpan,
  SpanExporter,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-base";

import { redactTelemetry } from "../../lib/redact-telemetry";
import {
  DIAGNOSTIC_EXPORT_BUDGET,
  DIAGNOSTIC_FLAG_DEFAULTS,
  type DiagnosticProcess,
  type GetAiTracerProvider,
  type InitializeObservability,
  type ShutdownObservability,
} from "./contract";

/**
 * Isolated AI-tracing bootstrap (jhowtkd/adscale#388).
 *
 * Stands up Langfuse/OTel observation for the single-piece pilot WITHOUT
 * wrapping a single model call (#389 owns observeModelCall) and WITHOUT
 * persisting content. Rules from spec #382, honored here:
 *
 * - One initialization per process (`web` and `worker`); a second call is a
 *   no-op, never a second SDK/provider.
 * - The AI tracer provider is isolated: it is NEVER registered globally, so
 *   Sentry keeps its own tracing. Correlation is by business IDs plus each
 *   vendor's own IDs — no shared traceId is required.
 * - Spans start as own roots (explicit ROOT_CONTEXT) on an AlwaysOn sampler,
 *   so an unsampled ambient (Sentry) context can never suppress pilot
 *   observation.
 * - Flags stay at frozen defaults (off). Missing credentials degrade to
 *   metadata-only/unavailable — init never throws into generation.
 * - Export is batched outside the business transaction and critical path,
 *   bounded by the frozen export budget, with a drop counter and a timed
 *   shutdown flush. Telemetry faults use sanitized, rate-limited emergency
 *   output with no recursive logging.
 * - Edge runtime refuses to initialize: no Node observability SDK there.
 */

/** Instrumentation scope for every pilot AI span. */
export const AI_TRACER_SCOPE = "adscale.diagnostics.ai";

/** Per-request export timeout in ms (local value; the budget has no timeout). */
export const AI_TRACING_EXPORT_TIMEOUT_MS = 5_000;

/** Fallback Langfuse endpoint when LANGFUSE_BASE_URL is unset. */
const LANGFUSE_DEFAULT_BASE_URL = "https://cloud.langfuse.com";

/** Pilot AI-tracing lifecycle state for this process. */
export type ObservabilityState = "disabled" | "metadata-only" | "active";

export interface ObservabilityStatus {
  state: ObservabilityState;
  process: DiagnosticProcess | null;
  bufferedSpans: number;
  droppedSpans: number;
  exportedSpans: number;
  failedFlushes: number;
}

export interface AiTracingRuntimeStats {
  bufferedSpans: number;
  droppedSpans: number;
  exportedSpans: number;
  failedFlushes: number;
}

export interface AiTracingRuntime {
  readonly provider: NodeTracerProvider;
  startSpan(name: string, attributes?: Attributes): Span;
  flush(): Promise<void>;
  shutdown(timeoutMs: number): Promise<void>;
  stats(): AiTracingRuntimeStats;
}

export interface AiTracingRuntimeOptions {
  process: DiagnosticProcess;
  env?: NodeJS.ProcessEnv;
  /**
   * Explicit exporter override (tests). An injected exporter satisfies the
   * Langfuse-configured requirement; flag policy still lives in
   * initializeObservability, which never injects one.
   */
  exporter?: SpanExporter;
  /** Periodic-flush interval override (tests). Frozen 1 s in production. */
  flushIntervalMs?: number;
}

const EMERGENCY_WINDOW_MS = 60_000;
const EMERGENCY_MAX_PER_WINDOW = 5;
let emergencyWindowStart = 0;
let emergencyCount = 0;
let inEmergencyReport = false;

/**
 * Rate-limited emergency output for AI-tracing-internal failures. Static
 * strings only — no span data, no credentials, no recursion into the
 * journal, the logger, or this module.
 */
function reportAiTracingFailure(kind: string): void {
  if (inEmergencyReport) return;
  inEmergencyReport = true;
  try {
    const now = Date.now();
    if (now - emergencyWindowStart > EMERGENCY_WINDOW_MS) {
      emergencyWindowStart = now;
      emergencyCount = 0;
    }
    emergencyCount += 1;
    if (emergencyCount <= EMERGENCY_MAX_PER_WINDOW) {
      console.error(
        `[ai-tracing] ${kind}; telemetry affected, generation unaffected`,
      );
    }
  } catch {
    // The emergency path must never throw either.
  } finally {
    inEmergencyReport = false;
  }
}

function isTruthyFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === "true";
}

function nonEmpty(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveBaseUrl(raw: string | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  const candidate =
    trimmed.length === 0 ? LANGFUSE_DEFAULT_BASE_URL : trimmed;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return candidate;
  } catch {
    return null;
  }
}

interface AiTracingConfig {
  enabled: boolean;
  langfuseEnabled: boolean;
  publicKey: string | null;
  secretKey: string | null;
  baseUrl: string | null;
}

function resolveConfig(env: NodeJS.ProcessEnv): AiTracingConfig {
  return {
    enabled: isTruthyFlag(
      env.OBSERVABILITY_ENABLED,
      DIAGNOSTIC_FLAG_DEFAULTS.OBSERVABILITY_ENABLED,
    ),
    langfuseEnabled: isTruthyFlag(
      env.OBSERVABILITY_LANGFUSE_ENABLED,
      DIAGNOSTIC_FLAG_DEFAULTS.OBSERVABILITY_LANGFUSE_ENABLED,
    ),
    publicKey: nonEmpty(env.LANGFUSE_PUBLIC_KEY),
    secretKey: nonEmpty(env.LANGFUSE_SECRET_KEY),
    baseUrl: resolveBaseUrl(env.LANGFUSE_BASE_URL),
  };
}

/** Cap for a single string span attribute before the budget pass. */
const SPAN_ATTRIBUTE_STRING_CAP = 4_000;

/** Suffix marking a truncated string span attribute. */
const SPAN_TRUNCATION_SUFFIX = "…[truncated]";

/** Marker attribute left when whole attributes were dropped to fit. */
export const SPAN_ATTRIBUTES_TRUNCATED_KEY = "adscale.attributes_truncated";

function measureAttributesBytes(name: string, attributes: Attributes): number {
  try {
    return Buffer.byteLength(JSON.stringify({ name, attributes }), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function attributeByteSize(key: string, value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify({ [key]: value }), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Reduce span attributes to the frozen per-event budget (trace-389,
 * carried from the #388 review: #388 bounded the buffer only).
 *
 * First caps every string attribute, then drops the largest attributes
 * until the span fits `maxEventBytes`, leaving a truncation marker when
 * anything was dropped. Never mutates the input, never throws; the
 * buffer-level drop stays as the backstop for spans that grow past the
 * whole-buffer budget after creation.
 */
export function truncateSpanAttributes(
  name: string,
  attributes?: Attributes,
): Attributes | undefined {
  if (attributes === undefined) return undefined;
  try {
    let next: Attributes = { ...attributes };
    for (const [key, value] of Object.entries(next)) {
      if (typeof value === "string" && value.length > SPAN_ATTRIBUTE_STRING_CAP) {
        next[key] = value.slice(0, SPAN_ATTRIBUTE_STRING_CAP) + SPAN_TRUNCATION_SUFFIX;
      }
    }
    if (
      measureAttributesBytes(name, next) <= DIAGNOSTIC_EXPORT_BUDGET.maxEventBytes
    ) {
      return next;
    }
    const bySizeDesc = Object.keys(next).sort(
      (a, b) => attributeByteSize(b, next[b]) - attributeByteSize(a, next[a]),
    );
    let truncated = false;
    for (const key of bySizeDesc) {
      if (
        measureAttributesBytes(name, next) <= DIAGNOSTIC_EXPORT_BUDGET.maxEventBytes
      ) {
        break;
      }
      delete next[key];
      truncated = true;
    }
    if (truncated) {
      next = { ...next, [SPAN_ATTRIBUTES_TRUNCATED_KEY]: true };
    }
    return next;
  } catch {
    return attributes;
  }
}

function measureSpanBytes(span: ReadableSpan): number {
  try {
    const snapshot = {
      name: span.name,
      attributes: span.attributes,
      status: span.status,
      kind: span.kind,
      links: span.links.length,
      events: span.events.map((event) => ({
        name: event.name,
        attributes: event.attributes,
      })),
    };
    return Buffer.byteLength(JSON.stringify(snapshot), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`ai-tracing flush timed out after ${ms}ms`));
    }, ms);
    if (typeof timer === "object" && typeof timer.unref === "function") {
      timer.unref();
    }
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

interface BufferedSpan {
  span: ReadableSpan;
  bytes: number;
}

/**
 * Frozen-budget queue in front of the Langfuse span processor: at most 128
 * spans or 512 KiB buffered, batches of at most 25, one concurrent flush,
 * periodic flush, drop counter, timed shutdown. Failed batches stay
 * buffered for the next flush. Never throws, never rejects.
 */
class BoundedLangfuseSpanProcessor implements SpanProcessor {
  private readonly exportBatch: (spans: ReadableSpan[]) => Promise<void>;
  private readonly flushIntervalMs: number;
  private queue: BufferedSpan[] = [];
  private queuedBytes = 0;
  private droppedSpans = 0;
  private exportedSpans = 0;
  private failedFlushes = 0;
  private inFlight: Promise<void> | null = null;
  private inFlightCount = 0;
  private discardRequeues = false;
  private shut = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    exportBatch: (spans: ReadableSpan[]) => Promise<void>,
    flushIntervalMs: number = DIAGNOSTIC_EXPORT_BUDGET.flushIntervalMs,
  ) {
    this.exportBatch = exportBatch;
    this.flushIntervalMs = flushIntervalMs;
  }

  onStart(): void {
    // Nothing to do at span start; queueing happens at span end.
  }

  onEnd(span: ReadableSpan): void {
    try {
      if (this.shut) {
        this.droppedSpans += 1;
        reportAiTracingFailure("span-after-shutdown-dropped");
        return;
      }
      const bytes = measureSpanBytes(span);
      if (
        !Number.isFinite(bytes) ||
        bytes > DIAGNOSTIC_EXPORT_BUDGET.maxBufferedBytes
      ) {
        this.droppedSpans += 1;
        reportAiTracingFailure("oversize-span-dropped");
        return;
      }
      if (
        this.queue.length >= DIAGNOSTIC_EXPORT_BUDGET.maxBufferedEvents ||
        this.queuedBytes + bytes > DIAGNOSTIC_EXPORT_BUDGET.maxBufferedBytes
      ) {
        this.droppedSpans += 1;
        reportAiTracingFailure("buffer-full-span-dropped");
        return;
      }
      this.queue.push({ span, bytes });
      this.queuedBytes += bytes;
    } catch {
      this.droppedSpans += 1;
      reportAiTracingFailure("enqueue-failed");
    }
  }

  forceFlush(): Promise<void> {
    if (!this.inFlight) {
      this.inFlight = this.runFlush().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  async shutdown(): Promise<void> {
    this.stop();
    try {
      await this.forceFlush();
    } catch {
      reportAiTracingFailure("shutdown-flush-failed");
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.forceFlush();
    }, this.flushIntervalMs);
    if (
      this.timer &&
      typeof this.timer === "object" &&
      typeof this.timer.unref === "function"
    ) {
      this.timer.unref();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  markShutDown(): void {
    this.shut = true;
  }

  /**
   * Count everything still queued or in flight as dropped. Used when the
   * shutdown budget expires: the abandoned flush discards instead of
   * requeueing so nothing is counted twice.
   */
  abandon(): void {
    const lost = this.queue.length + this.inFlightCount;
    this.queue = [];
    this.queuedBytes = 0;
    this.inFlightCount = 0;
    this.discardRequeues = true;
    if (lost > 0) {
      this.droppedSpans += lost;
      reportAiTracingFailure("shutdown-unflushed-dropped");
    }
  }

  stats(): AiTracingRuntimeStats {
    return {
      bufferedSpans: this.queue.length,
      droppedSpans: this.droppedSpans,
      exportedSpans: this.exportedSpans,
      failedFlushes: this.failedFlushes,
    };
  }

  private async runFlush(): Promise<void> {
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(
          0,
          DIAGNOSTIC_EXPORT_BUDGET.maxBatchEvents,
        );
        for (const item of batch) {
          this.queuedBytes -= item.bytes;
        }
        this.inFlightCount = batch.length;
        try {
          await this.exportBatch(batch.map((item) => item.span));
        } catch {
          // Keep the failed batch for the next flush; stop this one so a
          // down endpoint does not burn a timeout per batch.
          this.failedFlushes += 1;
          this.inFlightCount = 0;
          if (this.discardRequeues) {
            return;
          }
          reportAiTracingFailure("flush-failed-batch-requeued");
          const restored = [...batch, ...this.queue];
          this.queue = [];
          this.queuedBytes = 0;
          for (const item of restored) {
            this.queue.push(item);
            this.queuedBytes += item.bytes;
          }
          return;
        }
        this.inFlightCount = 0;
        this.exportedSpans += batch.length;
      }
    } catch {
      this.failedFlushes += 1;
      reportAiTracingFailure("flush-failed");
    }
  }
}

/**
 * Build one isolated AI-tracing runtime: own NodeTracerProvider (never
 * registered globally) feeding the bounded queue, which hands batches to
 * the Langfuse span processor. Returns null when Langfuse is not
 * configured (flag off, credentials missing, or malformed base URL) and
 * no explicit exporter was injected.
 *
 * Flag policy lives in initializeObservability; this factory builds
 * whatever it is explicitly given, so tests can inject an exporter.
 */
export function createAiTracingRuntime(
  options: AiTracingRuntimeOptions,
): AiTracingRuntime | null {
  const env = options.env ?? process.env;
  let config: AiTracingConfig;
  try {
    config = resolveConfig(env);
  } catch {
    reportAiTracingFailure("config-resolve-failed");
    return null;
  }
  const langfuseConfigured =
    config.langfuseEnabled &&
    config.publicKey !== null &&
    config.secretKey !== null &&
    config.baseUrl !== null;
  if (options.exporter === undefined && !langfuseConfigured) {
    return null;
  }
  try {
    const release = env.RENDER_GIT_COMMIT?.trim() || "unknown";
    const environment = env.NODE_ENV?.trim() || "unknown";
    const resource = resourceFromAttributes({
      "service.name": "adscale",
      "adscale.process": options.process,
      "adscale.release": release,
      "adscale.environment": environment,
    });
    // The bounded queue above is the SOLE batching authority: it feeds the
    // inner processor at most maxBatchEvents spans and then awaits
    // forceFlush. The inner batch size must therefore exceed any outer
    // batch — otherwise a full batch self-flushes fire-and-forget on
    // arrival, forceFlush resolves vacuously, and exports overlap.
    const innerBatchSize = DIAGNOSTIC_EXPORT_BUDGET.maxBufferedEvents + 1;
    const inner =
      options.exporter === undefined
        ? new LangfuseSpanProcessor({
            publicKey: config.publicKey ?? undefined,
            secretKey: config.secretKey ?? undefined,
            baseUrl: config.baseUrl ?? undefined,
            flushAt: innerBatchSize,
            flushInterval: DIAGNOSTIC_EXPORT_BUDGET.flushIntervalMs / 1000,
            timeout: AI_TRACING_EXPORT_TIMEOUT_MS / 1000,
            mediaUploadEnabled: false,
            mask: ({ data }) => redactTelemetry(data),
            shouldExportSpan: ({ otelSpan }) =>
              otelSpan?.instrumentationScope?.name === AI_TRACER_SCOPE,
            environment,
            release,
          })
        : new LangfuseSpanProcessor({
            exporter: options.exporter,
            flushAt: innerBatchSize,
            flushInterval: DIAGNOSTIC_EXPORT_BUDGET.flushIntervalMs / 1000,
            timeout: AI_TRACING_EXPORT_TIMEOUT_MS / 1000,
            mediaUploadEnabled: false,
            mask: ({ data }) => redactTelemetry(data),
            shouldExportSpan: ({ otelSpan }) =>
              otelSpan?.instrumentationScope?.name === AI_TRACER_SCOPE,
            environment,
            release,
          });
    const outer = new BoundedLangfuseSpanProcessor(async (spans) => {
      for (const span of spans) {
        inner.onEnd(span);
      }
      // Awaits pending mask/convert work, then the batched export itself.
      await inner.forceFlush();
    }, options.flushIntervalMs);
    // The provider is constructed with its processor and never registered
    // globally: Sentry keeps its own tracing on its own provider.
    const provider = new NodeTracerProvider({
      resource,
      // Parent-independent sampling: an unsampled ambient context can never
      // suppress pilot spans. Spans additionally start as own roots.
      sampler: new AlwaysOnSampler(),
      spanProcessors: [outer],
    });
    outer.start();
    const tracer = provider.getTracer(AI_TRACER_SCOPE);

    return {
      provider,
      startSpan(name: string, attributes?: Attributes): Span {
        try {
          // Own root: never joins (or inherits sampling from) an ambient
          // Sentry context. Correlation is by business IDs, not traceId.
          // Creation-time truncation to the frozen per-event budget.
          return tracer.startSpan(
            name,
            { attributes: truncateSpanAttributes(name, attributes) },
            ROOT_CONTEXT,
          );
        } catch {
          reportAiTracingFailure("start-span-failed");
          return trace.wrapSpanContext({
            traceId: "00000000000000000000000000000000",
            spanId: "0000000000000000",
            traceFlags: 0,
          });
        }
      },
      async flush(): Promise<void> {
        try {
          await outer.forceFlush();
        } catch {
          reportAiTracingFailure("flush-failed");
        }
      },
      async shutdown(timeoutMs: number): Promise<void> {
        outer.stop();
        outer.markShutDown();
        try {
          await withTimeout(
            (async () => {
              await outer.forceFlush();
              await inner.shutdown();
              await provider.shutdown();
            })(),
            Math.max(0, timeoutMs),
          );
        } catch {
          // Budget exhausted: whatever is still buffered or in flight dies
          // with the process. Count it as dropped so the loss is
          // detectable; the abandoned flush discards instead of requeueing.
          outer.abandon();
        }
      },
      stats(): AiTracingRuntimeStats {
        return outer.stats();
      },
    };
  } catch {
    reportAiTracingFailure("runtime-create-failed");
    return null;
  }
}

interface ObservabilitySingleton {
  process: DiagnosticProcess;
  state: ObservabilityState;
  runtime: AiTracingRuntime | null;
}

let singleton: ObservabilitySingleton | null = null;
let inFlightInit: Promise<void> | null = null;

async function doInitialize(processName: DiagnosticProcess): Promise<void> {
  try {
    // NOTE: the parameter is deliberately not named `process` — it would
    // shadow the Node global this function reads below.
    const env = process.env;
    if (env.NEXT_RUNTIME === "edge") {
      singleton = { process: processName, state: "disabled", runtime: null };
      return;
    }
    const config = resolveConfig(env);
    if (!config.enabled) {
      singleton = { process: processName, state: "disabled", runtime: null };
      return;
    }
    const runtime = createAiTracingRuntime({ process: processName, env });
    if (!runtime) {
      // Enabled but Langfuse not configured: metadata-only. AI spans are
      // unavailable (no provider); the journal/metadata path is unaffected.
      singleton = { process: processName, state: "metadata-only", runtime: null };
      return;
    }
    singleton = { process: processName, state: "active", runtime };
  } catch {
    reportAiTracingFailure("initialize-failed");
    try {
      singleton = { process: processName, state: "metadata-only", runtime: null };
    } catch {
      singleton = null;
    }
  }
}

/**
 * Initialize observability once per process. A second call — sequential or
 * concurrent, same process or not — is a no-op that resolves without
 * creating a second SDK or provider. Never rejects.
 */
export const initializeObservability: InitializeObservability = (
  processName: DiagnosticProcess,
) => {
  if (singleton) {
    return Promise.resolve();
  }
  if (inFlightInit) {
    return inFlightInit;
  }
  inFlightInit = doInitialize(processName).finally(() => {
    inFlightInit = null;
  });
  return inFlightInit;
};

/**
 * Timed shutdown flush: buffered spans flush within timeoutMs, then the
 * Langfuse processor and the isolated provider close. Unflushed spans at
 * budget expiry are counted as dropped. Safe when never initialized.
 * Never rejects. Clears the singleton so a later init can run again.
 */
export const shutdownObservability: ShutdownObservability = async (
  timeoutMs: number,
) => {
  const current = singleton;
  singleton = null;
  if (!current?.runtime) {
    return;
  }
  try {
    await current.runtime.shutdown(timeoutMs);
  } catch {
    reportAiTracingFailure("shutdown-failed");
  }
};

/**
 * The isolated AI tracer provider, or undefined when observability is
 * disabled, metadata-only, or not initialized. Never a global registration.
 */
export const getAiTracerProvider: GetAiTracerProvider = () =>
  singleton?.runtime?.provider;

/** Start one pilot span as an own root; undefined when unavailable. */
export function startAiSpan(
  name: string,
  attributes?: Attributes,
): Span | undefined {
  try {
    return singleton?.runtime?.startSpan(name, attributes);
  } catch {
    reportAiTracingFailure("start-span-failed");
    return undefined;
  }
}

/**
 * Global capture switch (jhowtkd/adscale#397): true only when
 * `OBSERVABILITY_ENABLED` is explicitly truthy, else the frozen default
 * (off). Pure env read — the tab-hiding gate in #394 and any emission host
 * check this before observing anything. Never throws.
 */
export function isDiagnosticCaptureEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  try {
    return isTruthyFlag(
      env.OBSERVABILITY_ENABLED,
      DIAGNOSTIC_FLAG_DEFAULTS.OBSERVABILITY_ENABLED,
    );
  } catch {
    return DIAGNOSTIC_FLAG_DEFAULTS.OBSERVABILITY_ENABLED;
  }
}

/** Process-local lifecycle state and loss counters for console health. */
export function getObservabilityStatus(): ObservabilityStatus {
  const current = singleton;
  const stats = current?.runtime?.stats() ?? {
    bufferedSpans: 0,
    droppedSpans: 0,
    exportedSpans: 0,
    failedFlushes: 0,
  };
  return {
    state: current?.state ?? "disabled",
    process: current?.process ?? null,
    ...stats,
  };
}

/**
 * Test-only reset: stops the singleton runtime (if any) and clears init
 * state so each test starts uninitialized. Never use in production code.
 */
export async function __resetObservabilityForTests(): Promise<void> {
  const current = singleton;
  singleton = null;
  inFlightInit = null;
  if (current?.runtime) {
    try {
      await current.runtime.shutdown(0);
    } catch {
      // Shutdown never rejects; belt-and-braces for test hygiene.
    }
  }
}
