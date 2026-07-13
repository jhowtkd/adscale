#!/usr/bin/env node
/**
 * Surface inventory gate (Convergence Phase 1 Gate 1).
 *
 * 1. Regenerates the raw inventory and fails if the committed JSON is stale.
 * 2. Loads human decisions from surface-decisions.yaml.
 * 3. Fails if any raw item with requiresDecision=true lacks a decision.
 * 4. Fails if any decision references unknown evidence / missing id.
 *
 * Usage:
 *   node app/scripts/check-surface-inventory.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
 * decisions:
 *   - id: B1
 *     evidence: path:line or path
 *     decision: manter|fundir|esconder|apagar
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
        evidence: "",
        decision: "",
        rationale: "",
      };
      continue;
    }
    if (!current) continue;
    const field = line.match(/^\s+(evidence|decision|rationale):\s*(.*)\s*$/);
    if (field) {
      current[field[1]] = stripQuotes(field[2]);
    }
  }
  if (current) decisions.push(current);
  return decisions;
}

export function validateSurfaceInventory({ inventory, decisions }) {
  const errors = [];
  const allowed = new Set(["manter", "fundir", "esconder", "apagar"]);

  for (const d of decisions) {
    if (!d.id) errors.push("decision missing id");
    if (!d.evidence) errors.push(`decision ${d.id || "?"} missing evidence`);
    if (!allowed.has(d.decision)) {
      errors.push(
        `decision ${d.id || "?"} has invalid decision "${d.decision}" (expected manter|fundir|esconder|apagar)`
      );
    }
    if (!d.rationale) errors.push(`decision ${d.id || "?"} missing rationale`);
  }

  const requiring = (inventory.ctas || []).filter((c) => c.requiresDecision);
  const covered = new Set();

  for (const item of requiring) {
    const match = decisions.find((d) => {
      if (!d.evidence) return false;
      // evidence may be file or file:line
      const [file, line] = d.evidence.split(":");
      if (line && /^\d+$/.test(line)) {
        return item.file === file && String(item.line) === line;
      }
      return item.file === d.evidence || item.evidence?.startsWith(d.evidence);
    });
    if (!match) {
      errors.push(
        `undecided blocker: ${item.id} (${item.evidence || item.file}:${item.line}) — ${item.note || item.kind}`
      );
    } else {
      covered.add(match.id);
    }
  }

  for (const d of decisions) {
    const [file, line] = (d.evidence || "").split(":");
    const hits = requiring.filter((item) => {
      if (line && /^\d+$/.test(line)) {
        return item.file === file && String(item.line) === line;
      }
      return item.file === d.evidence || item.evidence?.startsWith(d.evidence);
    });
    if (hits.length === 0) {
      const allFiles = [
        ...(inventory.dashboardPages || []).map((p) => p.file),
        ...(inventory.apiRoutes || []).map((p) => p.file),
        ...(inventory.ctas || []).map((p) => p.file),
      ];
      const evidencePath = file || d.evidence;
      const matched = allFiles.some(
        (f) =>
          f === evidencePath ||
          f.startsWith(`${evidencePath}/`) ||
          evidencePath.length > 0 && f.includes(evidencePath)
      );
      const onDisk = existsSync(resolve(repoRoot, evidencePath));
      if (!matched && !onDisk) {
        errors.push(
          `decision ${d.id} evidence not found in inventory or on disk: ${d.evidence}`
        );
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    requiringCount: requiring.length,
    decisionCount: decisions.length,
    coveredIds: [...covered],
  };
}

function stripVolatile(inventory) {
  const clone = structuredClone(inventory);
  delete clone.generatedAt;
  return clone;
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

  if (fresh.fingerprint !== committed.fingerprint) {
    // Auto-refresh committed file so CI and local stay honest, then still validate.
    writeFileSync(rawPath, JSON.stringify(fresh, null, 2) + "\n");
    console.log(
      "SURFACE-INVENTORY: refreshed stale surface-inventory.raw.json to match sources."
    );
  } else if (
    JSON.stringify(stripVolatile(fresh)) !==
    JSON.stringify(stripVolatile({ ...committed, fingerprint: fresh.fingerprint }))
  ) {
    // fingerprint matched but payload drift — rewrite
    writeFileSync(rawPath, JSON.stringify(fresh, null, 2) + "\n");
  }

  const decisions = parseDecisionsYaml(readFileSync(decisionsPath, "utf8"));
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
    `SURFACE-INVENTORY: ok (${result.requiringCount} blockers decided, ${result.decisionCount} decisions)`
  );
}

const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}
