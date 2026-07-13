import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  inventoriesContentEqual,
  parseDecisionsYaml,
  validateSurfaceInventory,
} from "./check-surface-inventory.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rawPath = resolve(
  repoRoot,
  ".planning/convergence/surface-inventory.raw.json"
);

const BLOCKER_ID = "inert:app/src/components/workspace/DerivationCard.tsx:590";

test("undecided inert CTA fails without blockerId match", () => {
  const result = validateSurfaceInventory({
    inventory: {
      ctas: [
        {
          id: BLOCKER_ID,
          kind: "cta_disabled",
          file: "app/src/components/workspace/DerivationCard.tsx",
          line: 590,
          evidence: "app/src/components/workspace/DerivationCard.tsx:590",
          requiresDecision: true,
          note: "disabled + comingSoon",
        },
      ],
      dashboardPages: [],
      apiRoutes: [],
    },
    decisions: [
      {
        id: "B-file-only",
        blockerId: "",
        evidence: "app/src/components/workspace/DerivationCard.tsx",
        decision: "esconder",
        rationale: "file-only must not cover blockers",
      },
    ],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /undecided blocker/);
});

test("file-only decision does not cover a blocker in the same file", () => {
  const result = validateSurfaceInventory({
    inventory: {
      ctas: [
        {
          id: BLOCKER_ID,
          kind: "cta_disabled",
          file: "app/src/components/workspace/DerivationCard.tsx",
          line: 590,
          evidence: "app/src/components/workspace/DerivationCard.tsx:590",
          requiresDecision: true,
        },
        {
          id: "inert:app/src/components/workspace/DerivationCard.tsx:999",
          kind: "cta_disabled",
          file: "app/src/components/workspace/DerivationCard.tsx",
          line: 999,
          evidence: "app/src/components/workspace/DerivationCard.tsx:999",
          requiresDecision: true,
        },
      ],
      dashboardPages: [],
      apiRoutes: [],
    },
    decisions: [
      {
        id: "B-one",
        blockerId: BLOCKER_ID,
        evidence: "app/src/components/workspace/DerivationCard.tsx:590",
        decision: "esconder",
        rationale: "covers only 590",
      },
    ],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /:999/);
});

test("matching blockerId covers inert CTA 1:1", () => {
  const result = validateSurfaceInventory({
    inventory: {
      ctas: [
        {
          id: BLOCKER_ID,
          kind: "cta_disabled",
          file: "app/src/components/workspace/DerivationCard.tsx",
          line: 590,
          evidence: "app/src/components/workspace/DerivationCard.tsx:590",
          requiresDecision: true,
          note: "disabled + comingSoon",
        },
      ],
      dashboardPages: [],
      apiRoutes: [],
    },
    decisions: [
      {
        id: "B-landing",
        blockerId: BLOCKER_ID,
        evidence: "app/src/components/workspace/DerivationCard.tsx:590",
        decision: "esconder",
        rationale: "frozen",
      },
    ],
  });
  assert.equal(result.ok, true);
});

test("duplicate blockerId fails", () => {
  const result = validateSurfaceInventory({
    inventory: {
      ctas: [
        {
          id: BLOCKER_ID,
          kind: "cta_disabled",
          file: "app/src/components/workspace/DerivationCard.tsx",
          line: 590,
          evidence: "app/src/components/workspace/DerivationCard.tsx:590",
          requiresDecision: true,
        },
      ],
      dashboardPages: [],
      apiRoutes: [],
    },
    decisions: [
      {
        id: "B-a",
        blockerId: BLOCKER_ID,
        decision: "esconder",
        rationale: "a",
      },
      {
        id: "B-b",
        blockerId: BLOCKER_ID,
        decision: "apagar",
        rationale: "b",
      },
    ],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /duplicate blockerId/);
});

test("parseDecisionsYaml reads blockerId", () => {
  const decisions = parseDecisionsYaml(`
decisions:
  - id: B1
    blockerId: inert:foo.tsx:10
    evidence: app/src/foo.tsx:10
    decision: manter
    rationale: "ok"
`);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].blockerId, "inert:foo.tsx:10");
});

test("inventoriesContentEqual ignores generatedAt only", () => {
  const base = {
    fingerprint: "abc",
    schemaVersion: 2,
    counts: { ctas: 1 },
    ctas: [{ id: "x", requiresDecision: true }],
    dashboardPages: [],
    apiRoutes: [],
  };
  assert.equal(
    inventoriesContentEqual(
      { ...base, generatedAt: "2020-01-01T00:00:00.000Z" },
      { ...base, generatedAt: "2026-01-01T00:00:00.000Z" }
    ),
    true
  );
  assert.equal(
    inventoriesContentEqual(base, {
      ...base,
      ctas: [],
    }),
    false
  );
});

test("freshness drift fails without rewriting the committed snapshot", () => {
  const before = readFileSync(rawPath, "utf8");
  const parsed = JSON.parse(before);
  parsed.fingerprint = "stale-for-test";
  writeFileSync(rawPath, `${JSON.stringify(parsed, null, 2)}\n`);

  try {
    const result = spawnSync(
      process.execPath,
      [resolve(repoRoot, "app/scripts/check-surface-inventory.mjs")],
      { encoding: "utf8" }
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /does not match current scan|stale/);
    assert.match(result.stderr, /convergence:inventory/);
    const after = readFileSync(rawPath, "utf8");
    assert.equal(
      after,
      `${JSON.stringify(parsed, null, 2)}\n`,
      "checker must not rewrite surface-inventory.raw.json on drift"
    );
  } finally {
    writeFileSync(rawPath, before);
  }
});

test("tampered ctas with preserved fingerprint fails without rewrite", () => {
  const before = readFileSync(rawPath, "utf8");
  const parsed = JSON.parse(before);
  const requiring = (parsed.ctas || []).filter((c) => c.requiresDecision);
  assert.ok(
    requiring.length > 0,
    "fixture must include at least one requiringDecision CTA"
  );
  // Remove blockers but keep the old fingerprint — classic bypass.
  parsed.ctas = (parsed.ctas || []).filter((c) => !c.requiresDecision);
  parsed.counts = {
    ...parsed.counts,
    ctas: parsed.ctas.length,
    requiringDecision: 0,
  };
  writeFileSync(rawPath, `${JSON.stringify(parsed, null, 2)}\n`);

  try {
    const result = spawnSync(
      process.execPath,
      [resolve(repoRoot, "app/scripts/check-surface-inventory.mjs")],
      { encoding: "utf8" }
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /does not match current scan/);
    assert.match(result.stderr, /fingerprints match but payload differs/);
    assert.match(result.stderr, /convergence:inventory/);
    const after = readFileSync(rawPath, "utf8");
    assert.equal(
      after,
      `${JSON.stringify(parsed, null, 2)}\n`,
      "checker must not rewrite surface-inventory.raw.json on tamper"
    );
  } finally {
    writeFileSync(rawPath, before);
  }
});
