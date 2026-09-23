import { lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SEMANTIC_MODEL } from "../src/server/creative-work/semantic-review-offline";
import { appendManifestRecord, runAuthorizedCorpus, syntheticCorpusHash } from "./jev-authorized";
import { SYNTHETIC_CASES } from "./run-jev-offline";

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
  return { cases, authorization, credential: "never-persist-this-key", maxCalls, manifestDir, now };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("authorized Jev run manifest", () => {
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
    const transport = vi.fn(async () => ({
      ok: true as const, decisions: cases[0].expected, usage: null,
      confidence: {}, probabilities: {},
    }));
    const report = await runAuthorizedCorpus({ ...options, transport });
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
    const resumed = await runAuthorizedCorpus({ ...options, resume: true, transport });
    expect(resumed).toMatchObject({ started: 1, completed: 0, failed: 0, outcomeUnknown: 1, remainingCalls: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
    const afterExpiry = await runAuthorizedCorpus({ ...options, resume: true, now: new Date("2026-09-25T00:00:00.000Z"), transport });
    expect(afterExpiry).toMatchObject({ outcomeUnknown: 1, remainingCalls: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
    await expect(runAuthorizedCorpus({ ...options, resume: true, authorization: { ...options.authorization, maxCalls: 2 }, transport })).rejects.toThrow("manifest_mismatch");
  });

  it("counts definite failures and uncertain timeouts against the call cap", async () => {
    const options = fixture(2);
    const transport = vi.fn()
      .mockResolvedValueOnce({ ok: false, reason: "http_status", status: 429 })
      .mockResolvedValueOnce({ ok: false, reason: "timeout" });
    const report = await runAuthorizedCorpus({ ...options, transport });
    expect(report).toMatchObject({ started: 2, failed: 1, outcomeUnknown: 1, remainingCalls: 0 });
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
