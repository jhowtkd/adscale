import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = resolve("scripts/check-diagnostics-staging-gate.mjs");

function run(env = {}) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: resolve("."),
    env: {
      ...process.env,
      DIAGNOSTICS_STAGING_RECEIPT: "",
      ...env,
    },
    encoding: "utf8",
  });
}

function validReceipt() {
  return {
    environment: "staging",
    dataOrigin: "synthetic",
    releaseSha: "92bc0ed2",
    receivedAt: "2026-09-16T15:00:00.000Z",
    processes: ["web", "worker"],
    eventIds: ["evt_web_1", "evt_worker_1"],
  };
}

test("staging gate reports BLOCKED when no receipt is configured", () => {
  const result = run();
  assert.equal(result.status, 2);
  assert.match(result.stdout, /^STATUS=BLOCKED$/m);
  assert.match(result.stdout, /^rollout_authorized=false$/m);
});

test("staging gate passes on a valid staging receipt", () => {
  const dir = mkdtempSync(join(tmpdir(), "diag-gate-"));
  try {
    const receiptPath = join(dir, "receipt.json");
    writeFileSync(receiptPath, JSON.stringify(validReceipt()));
    const result = run({ DIAGNOSTICS_STAGING_RECEIPT: receiptPath });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^STATUS=PASS$/m);
    assert.match(result.stdout, /^environment=staging$/m);
    assert.match(result.stdout, /^eventCount=2$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("staging gate fails when the receipt is incomplete", () => {
  const dir = mkdtempSync(join(tmpdir(), "diag-gate-"));
  try {
    const receipt = validReceipt();
    delete receipt.eventIds;
    receipt.processes = ["web"];
    const receiptPath = join(dir, "receipt.json");
    writeFileSync(receiptPath, JSON.stringify(receipt));
    const result = run({ DIAGNOSTICS_STAGING_RECEIPT: receiptPath });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /^STATUS=FAIL$/m);
    assert.match(result.stdout, /eventIds/);
    assert.match(result.stdout, /worker/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("staging gate fails when the receipt file is missing", () => {
  const result = run({
    DIAGNOSTICS_STAGING_RECEIPT: join(tmpdir(), "diag-gate-does-not-exist.json"),
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^STATUS=FAIL$/m);
});
