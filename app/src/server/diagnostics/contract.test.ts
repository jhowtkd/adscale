import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CONTENT_AVAILABILITY_STATES,
  DIAGNOSTIC_CONTENT_MODES,
  DIAGNOSTIC_DATA_ORIGINS,
  DIAGNOSTIC_ENVELOPE_KEY,
  DIAGNOSTIC_EVENT_NAMES,
  DIAGNOSTIC_EVENT_STATUSES,
  DIAGNOSTIC_EXPORT_BUDGET,
  DIAGNOSTIC_FLAG_DEFAULTS,
  DIAGNOSTIC_SCHEMA_VERSION,
  DIAGNOSTIC_STAGES,
  isDiagnosticDataOrigin,
  isDiagnosticEventName,
  isDiagnosticEventStatus,
  isDiagnosticStage,
  type DiagnosticContext,
  type DiagnosticEventEnvelope,
} from "./contract";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");

type InventoryCallPoint = {
  id: string;
  file: string;
  symbol: string;
  sdkMethod: string;
  kind: string;
  stage: string[];
  classification: string;
  path: string;
  notes: string;
};

type Inventory = {
  schemaVersion: number;
  ticket: string;
  executionSha: string;
  classifications: Record<string, string>;
  callPoints: InventoryCallPoint[];
  pendingAcceptanceBlockers: unknown[];
};

function loadInventory(): Inventory {
  const raw = readFileSync(resolve(here, "ai-call-inventory.json"), "utf8");
  return JSON.parse(raw) as Inventory;
}

describe("frozen diagnostic contract (#384)", () => {
  it("pins schema version 1", () => {
    expect(DIAGNOSTIC_SCHEMA_VERSION).toBe(1);
  });

  it("freezes the 13 single-piece stages in journey order", () => {
    expect([...DIAGNOSTIC_STAGES]).toEqual([
      "source_analysis",
      "prepare",
      "briefing",
      "copy",
      "copy_rewrite",
      "art_direction",
      "queue",
      "image",
      "composition",
      "quality",
      "revision",
      "selection",
      "export",
    ]);
    expect(isDiagnosticStage("image")).toBe(true);
    expect(isDiagnosticStage("carousel")).toBe(false);
    expect(isDiagnosticStage(undefined)).toBe(false);
  });

  it("freezes the 16 minimum event names", () => {
    expect([...DIAGNOSTIC_EVENT_NAMES]).toEqual([
      "operation.started",
      "stage.started",
      "stage.completed",
      "stage.failed",
      "model.call.started",
      "model.call.completed",
      "model.call.failed",
      "model.validation.failed",
      "operation.replayed",
      "operation.completed",
      "operation.failed",
      "selection.confirmed",
      "selection.effect.failed",
      "export.prepared",
      "export.served",
      "telemetry.degraded",
    ]);
    expect(isDiagnosticEventName("model.call.failed")).toBe(true);
    expect(isDiagnosticEventName("model.call.retried")).toBe(false);
  });

  it("freezes statuses, data origins and content vocabulary", () => {
    expect([...DIAGNOSTIC_EVENT_STATUSES]).toEqual([
      "started",
      "completed",
      "failed",
    ]);
    expect(isDiagnosticEventStatus("completed")).toBe(true);
    expect(isDiagnosticEventStatus("recovered")).toBe(false);
    expect([...DIAGNOSTIC_DATA_ORIGINS]).toEqual([
      "production",
      "staging",
      "synthetic",
      "test",
    ]);
    expect(isDiagnosticDataOrigin("synthetic")).toBe(true);
    expect(isDiagnosticDataOrigin("dev")).toBe(false);
    expect([...CONTENT_AVAILABILITY_STATES]).toEqual([
      "not_collected",
      "redacted",
      "truncated",
      "expired",
      "unavailable",
    ]);
    // No `raw` mode in v1.
    expect([...DIAGNOSTIC_CONTENT_MODES]).toEqual([
      "metadata_only",
      "redacted",
    ]);
  });

  it("freezes flag defaults (capture off) and the export budget", () => {
    expect(DIAGNOSTIC_FLAG_DEFAULTS).toEqual({
      OBSERVABILITY_ENABLED: false,
      OBSERVABILITY_LANGFUSE_ENABLED: false,
      OBSERVABILITY_WORKSPACE_ALLOWLIST: "",
      OBSERVABILITY_CONTENT_MODE: "metadata_only",
    });
    expect(DIAGNOSTIC_EXPORT_BUDGET).toEqual({
      maxBufferedEvents: 128,
      maxBufferedBytes: 512 * 1024,
      maxBatchEvents: 25,
      maxConcurrentFlushes: 1,
      flushIntervalMs: 1000,
      maxEventBytes: 16 * 1024,
    });
    expect(DIAGNOSTIC_ENVELOPE_KEY).toBe("diagnosticContext");
  });

  it("types a complete DiagnosticContext and envelope", () => {
    const context: DiagnosticContext = {
      schemaVersion: 1,
      workspaceId: "ws_1",
      clientProfileId: null,
      workItemId: "wi_1",
      protocol: "single",
      operationId: "op_1",
      releaseSha: "92bc0ed2",
      environment: "test",
      process: "worker",
      dataOrigin: "test",
    };
    const envelope: DiagnosticEventEnvelope = {
      eventId: "evt_1",
      event: "model.call.completed",
      schemaVersion: 1,
      occurredAt: "2026-09-16T00:00:00.000Z",
      recordedAt: "2026-09-16T00:00:00.010Z",
      stage: "image",
      status: "completed",
      correlation: "full",
      context,
      call: {
        callId: "call_1",
        provider: "openai",
        requestedModel: "gpt-image-2-2026-04-21",
        returnedModel: "gpt-image-2-2026-04-21",
        providerRequestId: null,
      },
    };
    expect(envelope.context?.protocol).toBe("single");
  });
});

describe("AI call-point inventory (#384)", () => {
  const inventory = loadInventory();
  const byId = new Map(inventory.callPoints.map((cp) => [cp.id, cp]));

  it("has unique ids and a known classification per entry", () => {
    expect(byId.size).toBe(inventory.callPoints.length);
    const allowed = new Set(Object.keys(inventory.classifications));
    expect(allowed).toEqual(
      new Set([
        "covered",
        "unused-by-scope",
        "coverage-pending-blocking-acceptance",
      ]),
    );
    for (const cp of inventory.callPoints) {
      expect(allowed.has(cp.classification)).toBe(true);
    }
  });

  it("maps every covered entry to at least one frozen stage", () => {
    const covered = inventory.callPoints.filter(
      (cp) => cp.classification === "covered",
    );
    expect(covered.length).toBeGreaterThan(0);
    for (const cp of covered) {
      expect(cp.stage.length).toBeGreaterThan(0);
      for (const stage of cp.stage) {
        expect(isDiagnosticStage(stage)).toBe(true);
      }
    }
    for (const cp of inventory.callPoints.filter(
      (cp) => cp.classification === "unused-by-scope",
    )) {
      expect(cp.stage).toEqual([]);
    }
  });

  it("points every single-file entry at a file that exists", () => {
    for (const cp of inventory.callPoints) {
      if (cp.file.includes("*") || cp.file.includes(",")) continue;
      expect(
        existsSync(resolve(repoRoot, cp.file)),
        `${cp.id}: ${cp.file} must exist`,
      ).toBe(true);
    }
  });

  it("finds the recorded SDK marker at every covered call site", () => {
    for (const cp of inventory.callPoints.filter(
      (cp) => cp.classification === "covered",
    )) {
      const source = readFileSync(resolve(repoRoot, cp.file), "utf8");
      const markers = cp.sdkMethod.split(" / ");
      const hit = markers.some((marker) => source.includes(marker));
      expect(hit, `${cp.id}: ${cp.sdkMethod} in ${cp.file}`).toBe(true);
    }
  });

  it("has no coverage-pending blockers at acceptance", () => {
    expect(inventory.pendingAcceptanceBlockers).toEqual([]);
    const pending = inventory.callPoints.filter(
      (cp) => cp.classification === "coverage-pending-blocking-acceptance",
    );
    expect(pending).toEqual([]);
  });
});
