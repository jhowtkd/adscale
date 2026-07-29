/**
 * Local transport benchmark for #119. It only sends synthetic events to an
 * Inngest dev server; it never contacts the cloud or invokes a paid provider.
 * Usage: INNGEST_DEV=1 node scripts/bench-inngest-dispatch.mjs
 */

import { Inngest } from "inngest";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const baseUrl = process.env.INNGEST_PERF_URL ?? "http://127.0.0.1:8288";
const parsedUrl = new URL(baseUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedUrl.hostname)) {
  throw new Error(`Refusing non-local Inngest URL: ${baseUrl}`);
}

const client = new Inngest({
  id: "adscale-performance-audit",
  eventKey: "local",
  baseUrl,
});
const runs = 20;
const eventCounts = [1, 4, 16, 32];

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

async function measure(eventCount) {
  const durations = [];
  let payloadBytes = 0;
  for (let run = 0; run < runs; run += 1) {
    const events = Array.from({ length: eventCount }, (_, index) => ({
      id: `audit-${eventCount}-${run}-${index}`,
      name: "audit.performance.dispatch",
      data: {
        workspaceId: "00000000-0000-0000-0000-000000000001",
        workItemId: "00000000-0000-0000-0000-000000000002",
        outputId: `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
        generationCorrelationId: `audit-correlation-${run}`,
      },
    }));
    assert.equal(new Set(events.map((event) => event.id)).size, eventCount);
    assert.equal(new Set(events.map((event) => event.data.generationCorrelationId)).size, 1);
    payloadBytes = Buffer.byteLength(JSON.stringify(events));
    const started = performance.now();
    await client.send(events);
    durations.push(performance.now() - started);
  }

  return {
    eventCount,
    payloadBytes,
    p50Ms: round(percentile(durations, 0.5)),
    p95Ms: round(percentile(durations, 0.95)),
    p99Ms: round(percentile(durations, 0.99)),
    perUnitP50Ms: round(percentile(durations, 0.5) / eventCount),
    perUnitP95Ms: round(percentile(durations, 0.95) / eventCount),
    transportCallsPerGeneration: 1,
    eventIdsUniquePerGeneration: true,
    correlationSharedAcrossUnits: true,
  };
}

const results = [];
await client.send([{
  id: "audit-warmup",
  name: "audit.performance.dispatch",
  data: {
    workspaceId: "00000000-0000-0000-0000-000000000001",
    workItemId: "00000000-0000-0000-0000-000000000002",
    outputId: "00000000-0000-0000-0000-000000000001",
    generationCorrelationId: "audit-warmup-correlation",
  },
}]);
for (const eventCount of eventCounts) {
  results.push(await measure(eventCount));
}

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  endpoint: baseUrl,
  runs,
  warmupEvents: 1,
  semantics: "one transport call carrying N independent unit events; no batching implementation changed",
  semanticEvidence: {
    benchmarkScope: "transport shape and latency only; this script does not execute generation handlers",
    billing: "validated separately by settlement-adapters tests",
    cancellation: "validated separately by creative-work cancellation tests",
    redelivery: "validated separately by creative-work and settlement-adapters tests",
    failureIsolation: "validated separately by creative-work tests",
  },
  results,
  limitations: [
    "local Inngest transport, not Render network latency",
    "billing, cancellation, re-delivery and failure isolation are not executed by this benchmark",
  ],
}, null, 2));
