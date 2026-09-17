import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = resolve("scripts/check-diagnostics-content-gate.mjs");

function run(env = {}) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: resolve("."),
    env: {
      ...process.env,
      DIAGNOSTICS_CONTENT_POLICY_RECEIPT: "",
      ...env,
    },
    encoding: "utf8",
  });
}

function validReceipt() {
  return {
    policyVersion: "v1",
    approvedBy: "data-owner@example.com",
    approvedAt: "2026-09-17T10:00:00.000Z",
    retentionWindows: {
      diagnosticIndexDays: 30,
      aiTracesDays: 7,
      accessAuditDays: 90,
    },
    deletionProof: {
      endpoint: "fake",
      traceIds: ["trace-1"],
      requeriedAt: "2026-09-17T11:00:00.000Z",
      allConfirmed: true,
    },
    allowlistedWorkspaces: ["ws-pilot"],
  };
}

function withReceipt(receipt) {
  const dir = mkdtempSync(join(tmpdir(), "content-gate-"));
  const path = join(dir, "receipt.json");
  writeFileSync(path, JSON.stringify(receipt));
  return { dir, path };
}

test("content gate reports BLOCKED when no receipt is configured", () => {
  const result = run();
  assert.equal(result.status, 2);
  assert.match(result.stdout, /^STATUS=BLOCKED$/m);
  assert.match(result.stdout, /^capture_authorized=false$/m);
});

test("content gate passes on a valid approval receipt", () => {
  const { dir, path } = withReceipt(validReceipt());
  try {
    const result = run({ DIAGNOSTICS_CONTENT_POLICY_RECEIPT: path });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^STATUS=PASS$/m);
    assert.match(result.stdout, /^policyVersion=v1$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("content gate fails on an invalid receipt", () => {
  const cases = [
    { ...validReceipt(), policyVersion: "v2" },
    { ...validReceipt(), approvedBy: "" },
    {
      ...validReceipt(),
      retentionWindows: {
        diagnosticIndexDays: 30,
        aiTracesDays: 365,
        accessAuditDays: 90,
      },
    },
    {
      ...validReceipt(),
      deletionProof: {
        endpoint: "fake",
        traceIds: ["trace-1"],
        requeriedAt: "2026-09-17T11:00:00.000Z",
        allConfirmed: false,
      },
    },
    { ...validReceipt(), deletionProof: undefined },
  ];
  for (const receipt of cases) {
    const { dir, path } = withReceipt(receipt);
    try {
      const result = run({ DIAGNOSTICS_CONTENT_POLICY_RECEIPT: path });
      assert.equal(result.status, 1);
      assert.match(result.stdout, /^STATUS=FAIL$/m);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("content gate fails when the receipt file is missing or malformed", () => {
  const missing = run({
    DIAGNOSTICS_CONTENT_POLICY_RECEIPT: "/nonexistent/receipt.json",
  });
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /^STATUS=FAIL$/m);

  const dir = mkdtempSync(join(tmpdir(), "content-gate-"));
  try {
    const path = join(dir, "receipt.json");
    writeFileSync(path, "{not-json");
    const malformed = run({ DIAGNOSTICS_CONTENT_POLICY_RECEIPT: path });
    assert.equal(malformed.status, 1);
    assert.match(malformed.stdout, /^STATUS=FAIL$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
