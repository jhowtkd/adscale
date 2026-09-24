import { lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SEMANTIC_MODEL } from "../src/server/creative-work/semantic-review-offline";
import type { DiagnosticEventEnvelope } from "../src/server/diagnostics/contract";
import { createDiagnosticJournal } from "../src/server/diagnostics/journal";
import type { NewDiagnosticEvent } from "../src/server/db/schema";
import { appendManifestRecord, runAuthorizedCorpus, syntheticCorpusHash } from "./jev-authorized";
import { SYNTHETIC_CASES } from "./run-jev-offline";

const directorySync = vi.hoisted(() => ({ calls: 0, failAt: 0 }));
vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return {
    ...fs,
    fsyncSync: (fd: number) => {
      if (fs.fstatSync(fd).isDirectory()) {
        directorySync.calls += 1;
        if (directorySync.calls === directorySync.failAt) throw new Error("simulated directory fsync failure");
      }
      return fs.fsyncSync(fd);
    },
  };
});

const cases = SYNTHETIC_CASES.slice(0, 2);
const now = new Date("2026-09-22T12:00:00.000Z");
const roots: string[] = [];

function fixture(maxCalls = 1) {
  const root = mkdtempSync(join(tmpdir(), "adscale-jev-"));
  roots.push(root);
  const manifestDir = join(root, "run");
  const authorization = {
    reference: "https://example.org/approvals/jev-pilot",
    authorizedBy: "pilot-operator",
    approvedAt: "2026-09-22T11:00:00.000Z",
    expiresAt: "2026-09-23T11:00:00.000Z",
    provider: "typesafe",
    purpose: "offline_jev_semantic_review",
    corpusSha256: syntheticCorpusHash(cases),
    syntheticOnly: true,
    spendApproved: true,
    maxCalls,
  };
  return { cases, authorization, credential: "never-persist-this-key", maxCalls, manifestDir, now, diagnosticSink: () => {} };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  directorySync.calls = 0;
  directorySync.failAt = 0;
});

describe("authorized Jev run manifest", () => {
  it("syncs a new run under a symlinked parent before sending", async () => {
    const options = fixture();
    const root = join(options.manifestDir, "..");
    symlinkSync(root, join(root, "alias"));
    const transport = vi.fn(async () => ({
      ok: true as const, decisions: cases[0].expected, usage: null,
      confidence: {}, probabilities: {},
    }));
    const report = await runAuthorizedCorpus({
      ...options, manifestDir: join(root, "alias", "run"), transport,
    });
    expect(report.completed).toBe(1);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("reports a parent sync failure and removes the empty run before any send", async () => {
    const options = fixture();
    const transport = vi.fn();
    directorySync.failAt = 1;
    await expect(runAuthorizedCorpus({ ...options, transport })).rejects.toThrow("manifest_write_failed");
    expect(transport).not.toHaveBeenCalled();
    expect(() => lstatSync(options.manifestDir)).toThrow();
  });

  it("requires a successful directory sync on resume after a failed manifest sync", async () => {
    const options = fixture();
    const transport = vi.fn(async () => ({
      ok: true as const, decisions: cases[0].expected, usage: null,
      confidence: {}, probabilities: {},
    }));
    directorySync.failAt = 2;
    await expect(runAuthorizedCorpus({ ...options, transport })).rejects.toThrow("manifest_write_failed");
    expect(transport).not.toHaveBeenCalled();
    directorySync.calls = 0;
    directorySync.failAt = 1;
    await expect(runAuthorizedCorpus({ ...options, resume: true, transport })).rejects.toThrow("manifest_write_failed");
    expect(transport).not.toHaveBeenCalled();
    directorySync.calls = 0;
    directorySync.failAt = 0;
    expect((await runAuthorizedCorpus({ ...options, resume: true, transport })).completed).toBe(1);
    expect(directorySync.calls).toBe(1);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("requires bounded, corpus-specific authorization before any network call", async () => {
    const options = fixture();
    const transport = vi.fn();
    await expect(runAuthorizedCorpus({ ...options, authorization: { ...options.authorization, corpusSha256: "0".repeat(64) }, transport })).rejects.toThrow("invalid_authorization");
    await expect(runAuthorizedCorpus({ ...options, credential: undefined, transport })).rejects.toThrow("missing_credential");
    expect(transport).not.toHaveBeenCalled();
    expect(() => lstatSync(options.manifestDir)).toThrow();
  });

  it("stores only metadata in private, durable files and counts successful calls", async () => {
    const options = fixture();
    const events: DiagnosticEventEnvelope[] = [];
    const saved: NewDiagnosticEvent[] = [];
    const journal = createDiagnosticJournal({ persistBatch: async (rows) => {
      saved.push(...rows);
      return { inserted: rows.length, duplicates: 0 };
    } });
    const transport = vi.fn(async () => ({
      ok: true as const, decisions: cases[0].expected, usage: null,
      confidence: {}, probabilities: {},
    }));
    const report = await runAuthorizedCorpus({ ...options, transport, diagnosticSink: (event) => {
      events.push(event);
      journal.enqueue(event);
    } });
    await journal.shutdown(1_000);
    expect(report).toMatchObject({ started: 1, completed: 1, failed: 0, outcomeUnknown: 0, remainingCalls: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][1]).toBe(options.credential);
    expect(lstatSync(options.manifestDir).mode & 0o777).toBe(0o700);
    const manifestPath = join(options.manifestDir, "manifest.jsonl");
    expect(lstatSync(manifestPath).mode & 0o777).toBe(0o600);
    const text = readFileSync(manifestPath, "utf8");
    expect(text.split("\n").filter(Boolean)).toHaveLength(3);
    expect(text).toContain(SEMANTIC_MODEL);
    expect(text).not.toMatch(/never-persist-this-key|Anuncie o curso|Curso por R\$/);
    expect(events.map((event) => event.event)).toEqual([
      "operation.started", "model.call.started", "model.call.completed", "operation.completed",
    ]);
    expect(events.every((event) => event.stage === undefined && event.attributes?.operationKind === "semantic_review"
      && event.context?.dataOrigin === "synthetic")).toBe(true);
    expect(events[2].call).toMatchObject({ provider: "typesafe", requestedModel: SEMANTIC_MODEL, returnedModel: SEMANTIC_MODEL, providerRequestId: null });
    expect(events[2].call?.inputTokens).toBeUndefined();
    expect(JSON.stringify(events)).not.toMatch(/never-persist-this-key|Anuncie o curso|Curso por R\$/);
    expect(saved.map((event) => event.event)).toEqual(events.map((event) => event.event));
    expect(saved.every((event) => event.stage === null && event.dataOrigin === "synthetic"
      && event.attributes.operationKind === "semantic_review")).toBe(true);
  });

  it("marks an interrupted attempt unknown on resume without sending it again", async () => {
    const options = fixture();
    const transport = vi.fn(async () => ({ ok: false as const, reason: "http_status" as const, status: 429 }));
    const persist: typeof appendManifestRecord = (fd, record) => {
      if (record.kind === "terminal") throw new Error("simulated disk failure");
      appendManifestRecord(fd, record);
    };
    await expect(runAuthorizedCorpus({ ...options, transport, persist })).rejects.toThrow("manifest_write_failed");
    expect(transport).toHaveBeenCalledTimes(1);
    const resumed = await runAuthorizedCorpus({ ...options, credential: undefined, resume: true, transport });
    expect(resumed).toMatchObject({ started: 1, completed: 0, failed: 0, outcomeUnknown: 1, remainingCalls: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
    const afterExpiry = await runAuthorizedCorpus({ ...options, credential: undefined, resume: true, now: new Date("2026-09-25T00:00:00.000Z"), transport });
    expect(afterExpiry).toMatchObject({ outcomeUnknown: 1, remainingCalls: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
    await expect(runAuthorizedCorpus({ ...options, resume: true, authorization: { ...options.authorization, maxCalls: 2 }, transport })).rejects.toThrow("manifest_mismatch");
  });

  it("requires a credential on resume while an eligible call slot remains", async () => {
    const options = fixture(2);
    const transport = vi.fn(async () => ({ ok: true as const, decisions: cases[0].expected, usage: null, confidence: {}, probabilities: {} }));
    const persist: typeof appendManifestRecord = (fd, record) => {
      if (record.kind === "terminal") throw new Error("simulated disk failure");
      appendManifestRecord(fd, record);
    };
    await expect(runAuthorizedCorpus({ ...options, transport, persist })).rejects.toThrow("manifest_write_failed");
    await expect(runAuthorizedCorpus({ ...options, credential: undefined, resume: true, transport })).rejects.toThrow("missing_credential");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("reports calibration and holdout agreement from completed provider decisions", async () => {
    const options = fixture(2);
    const mixedCases = [SYNTHETIC_CASES[0], SYNTHETIC_CASES[6]];
    const transport = vi.fn()
      .mockResolvedValueOnce({ ok: true, decisions: mixedCases[0].expected, usage: null, confidence: {}, probabilities: {} })
      .mockResolvedValueOnce({ ok: true, decisions: cases[0].expected, usage: null, confidence: {}, probabilities: {} });
    const report = await runAuthorizedCorpus({ ...options, cases: mixedCases,
      authorization: { ...options.authorization, corpusSha256: syntheticCorpusHash(mixedCases) }, transport });
    expect(report.splits.calibration).toMatchObject({
      cases: 1, completed: 1, evaluated: 1,
      syntheticFamilyAgreement: { numerator: 1, denominator: 1, value: 1 },
    });
    expect(report.splits.holdout).toMatchObject({
      cases: 1, completed: 1, evaluated: 1,
      syntheticFamilyAgreement: { numerator: 0, denominator: 1, value: 0 },
    });
    expect(report.splits.holdout.matrix.body_claims.unsupported.not_applicable).toBe(1);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("counts definite failures and uncertain timeouts against the call cap", async () => {
    const options = fixture(2);
    const events: DiagnosticEventEnvelope[] = [];
    const transport = vi.fn()
      .mockResolvedValueOnce({ ok: false, reason: "http_status", status: 429 })
      .mockResolvedValueOnce({ ok: false, reason: "timeout" });
    const report = await runAuthorizedCorpus({ ...options, transport, diagnosticSink: (event) => events.push(event) });
    expect(report).toMatchObject({ started: 2, failed: 1, outcomeUnknown: 1, remainingCalls: 0 });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(events.map((event) => event.event)).toEqual([
      "operation.started", "model.call.started", "model.call.failed", "operation.failed",
      "operation.started", "model.call.started", "model.call.failed", "operation.failed",
    ]);
    expect(events.filter((event) => event.event === "model.call.failed").map((event) => event.error?.reason)).toEqual(["http_status", "timeout"]);
  });

  it("stops before the next send when approval expires during a run", async () => {
    const options = fixture(2);
    let clockTime = new Date("2026-09-23T10:59:59.000Z");
    const transport = vi.fn(async () => {
      clockTime = new Date("2026-09-23T11:00:00.000Z");
      return { ok: true as const, decisions: cases[0].expected, usage: null, confidence: {}, probabilities: {} };
    });
    const report = await runAuthorizedCorpus({ ...options, now: undefined, clock: () => clockTime, transport });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({ started: 1, completed: 1, remainingCalls: 0 });
    expect(readFileSync(join(options.manifestDir, "manifest.jsonl"), "utf8").split("\n").filter(Boolean)).toHaveLength(3);
  });

  it("does not send if approval expires after the durable start marker", async () => {
    const options = fixture();
    let checks = 0;
    const transport = vi.fn();
    const report = await runAuthorizedCorpus({ ...options, now: undefined, transport, clock: () => {
      checks += 1;
      return new Date(checks < 3 ? "2026-09-23T10:59:59.000Z" : "2026-09-23T11:00:00.000Z");
    } });
    expect(transport).not.toHaveBeenCalled();
    expect(report).toMatchObject({ started: 1, failed: 1, remainingCalls: 0 });
    expect(readFileSync(join(options.manifestDir, "manifest.jsonl"), "utf8")).toContain("authorization_expired_before_send");
  });
});
