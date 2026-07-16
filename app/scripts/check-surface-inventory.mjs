#!/usr/bin/env node
/**
 * Surface inventory gate (Convergence Phase 1 Gate 1).
 *
 * 1. Rebuilds inventory in memory and FAILS unless committed raw JSON matches
 *    fresh content (ignoring only generatedAt). Fingerprint-only checks are
 *    insufficient — tampering ctas while preserving fingerprint must fail.
 *    Does not rewrite; run `npm run convergence:inventory` to regenerate.
 * 2. Loads human decisions from surface-decisions.yaml.
 * 3. Validates decisions against the fresh scan (not the committed payload).
 * 4. Every requiresDecision item needs exactly one decision with
 *    blockerId === item.id (1:1). Curated decisions never cover blockers.
 *
 * Usage:
 *   node app/scripts/check-surface-inventory.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildInventory } from "./generate-surface-inventory.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const rawPath = resolve(repoRoot, ".planning/convergence/surface-inventory.raw.json");
const decisionsPath = resolve(
  repoRoot,
  ".planning/convergence/surface-decisions.yaml"
);

function stripQuotes(value) {
  const v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * Minimal YAML list parser for decisions.
 *
 * Blocker decisions (required for requiresDecision items):
 *   - id: B-landing
 *     blockerId: inert:app/src/.../DerivationCard.tsx:590
 *     decision: esconder
 *     rationale: "..."
 *
 * Curated decisions (product surfaces, not auto-blockers):
 *   - id: B-templates-use
 *     evidence: app/src/.../templates/page.tsx
 *     decision: manter
 *     rationale: "..."
 */
export function parseDecisionsYaml(text) {
  const decisions = [];
  const lines = text.split(/\r?\n/);
  let inList = false;
  let current = null;

  for (const raw of lines) {
    const line = raw.replace(/\t/g, "  ");
    if (/^\s*#/.test(line) || line.trim() === "") continue;
    if (/^decisions:\s*\[\s*\]\s*$/.test(line)) return [];
    if (/^decisions:\s*$/.test(line)) {
      inList = true;
      continue;
    }
    if (!inList) continue;

    const start = line.match(/^\s*-\s+id:\s*(.+)\s*$/);
    if (start) {
      if (current) decisions.push(current);
      current = {
        id: stripQuotes(start[1]),
        blockerId: "",
        evidence: "",
        decision: "",
        rationale: "",
      };
      continue;
    }
    if (!current) continue;
    const field = line.match(
      /^\s+(blockerId|evidence|decision|rationale):\s*(.*)\s*$/
    );
    if (field) {
      current[field[1]] = stripQuotes(field[2]);
    }
  }
  if (current) decisions.push(current);
  return decisions;
}

/** Strip volatile fields so freshness compares durable inventory content. */
export function normalizeInventoryForCompare(inventory) {
  const rest = { ...inventory };
  delete rest.generatedAt;
  return rest;
}

export function inventoriesContentEqual(a, b) {
  return (
    JSON.stringify(normalizeInventoryForCompare(a)) ===
    JSON.stringify(normalizeInventoryForCompare(b))
  );
}

export function validateSurfaceInventory({ inventory, decisions }) {
  const errors = [];
  const allowed = new Set(["manter", "fundir", "esconder", "apagar"]);

  for (const d of decisions) {
    if (!d.id) errors.push("decision missing id");
    if (!allowed.has(d.decision)) {
      errors.push(
        `decision ${d.id || "?"} has invalid decision "${d.decision}" (expected manter|fundir|esconder|apagar)`
      );
    }
    if (!d.rationale) errors.push(`decision ${d.id || "?"} missing rationale`);
    if (!d.blockerId && !d.evidence) {
      errors.push(
        `decision ${d.id || "?"} must set blockerId (for inert CTAs) or evidence (for curated surfaces)`
      );
    }
  }

  const requiring = (inventory.ctas || []).filter((c) => c.requiresDecision);
  const blockerDecisions = decisions.filter((d) => d.blockerId);
  const curatedDecisions = decisions.filter((d) => !d.blockerId && d.evidence);

  const byBlockerId = new Map();
  for (const d of blockerDecisions) {
    if (byBlockerId.has(d.blockerId)) {
      errors.push(
        `duplicate blockerId "${d.blockerId}" on decisions ${byBlockerId.get(d.blockerId)} and ${d.id}`
      );
    } else {
      byBlockerId.set(d.blockerId, d.id);
    }
  }

  for (const item of requiring) {
    const matchId = byBlockerId.get(item.id);
    if (!matchId) {
      errors.push(
        `undecided blocker: ${item.id} (${item.evidence || item.file}:${item.line}) — ${item.note || item.kind}`
      );
    }
  }

  for (const d of blockerDecisions) {
    const hits = requiring.filter((item) => item.id === d.blockerId);
    if (hits.length === 0) {
      errors.push(
        `decision ${d.id} blockerId not found in inventory requiringDecision set: ${d.blockerId}`
      );
    } else if (hits.length > 1) {
      errors.push(
        `decision ${d.id} blockerId matched ${hits.length} items (expected 1): ${d.blockerId}`
      );
    }
  }

  for (const d of curatedDecisions) {
    const evidencePath = d.evidence.split(":")[0];
    const allFiles = [
      ...(inventory.dashboardPages || []).map((p) => p.file),
      ...(inventory.apiRoutes || []).map((p) => p.file),
      ...(inventory.ctas || []).map((p) => p.file),
    ];
    const matched = allFiles.some(
      (f) =>
        f === evidencePath ||
        f.startsWith(`${evidencePath}/`) ||
        (evidencePath.length > 0 && f.includes(evidencePath))
    );
    const onDisk = existsSync(resolve(repoRoot, evidencePath));
    if (!matched && !onDisk) {
      errors.push(
        `curated decision ${d.id} evidence not found in inventory or on disk: ${d.evidence}`
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    requiringCount: requiring.length,
    decisionCount: decisions.length,
    blockerDecisionCount: blockerDecisions.length,
    curatedDecisionCount: curatedDecisions.length,
  };
}

function main() {
  if (!existsSync(decisionsPath)) {
    console.error(`SURFACE-INVENTORY: missing ${decisionsPath}`);
    process.exit(1);
  }
  if (!existsSync(rawPath)) {
    console.error(
      `SURFACE-INVENTORY: missing ${rawPath}. Run: npm run convergence:inventory`
    );
    process.exit(1);
  }

  const fresh = buildInventory();
  const committed = JSON.parse(readFileSync(rawPath, "utf8"));

  if (!inventoriesContentEqual(fresh, committed)) {
    console.error(
      "SURFACE-INVENTORY: FAILED — committed raw inventory does not match current scan."
    );
    console.error(
      "  Run: npm run convergence:inventory && commit .planning/convergence/surface-inventory.raw.json"
    );
    console.error(`  committed fingerprint: ${committed.fingerprint}`);
    console.error(`  current fingerprint:   ${fresh.fingerprint}`);
    if (fresh.fingerprint === committed.fingerprint) {
      console.error(
        "  fingerprints match but payload differs (possible tampering of ctas/pages/apis)."
      );
    }
    process.exit(1);
  }

  const decisions = parseDecisionsYaml(readFileSync(decisionsPath, "utf8"));
  // Decisions must be checked against the live scan, not a possibly-tampered commit.
  const result = validateSurfaceInventory({
    inventory: fresh,
    decisions,
  });

  if (!result.ok) {
    console.error("SURFACE-INVENTORY: FAILED");
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(
    `SURFACE-INVENTORY: ok (${result.requiringCount} blockers 1:1, ${result.blockerDecisionCount} blocker decisions, ${result.curatedDecisionCount} curated)`
  );
}

const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}
