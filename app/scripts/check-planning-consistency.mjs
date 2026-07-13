#!/usr/bin/env node
/**
 * Planning consistency validator (Convergence Phase 1).
 *
 * Hierarchy (source of truth):
 *   1. REQUIREMENTS.md checkboxes + accepted_debt entries determine completion
 *   2. STATE.md and ROADMAP.md are projections — they must not claim
 *      complete/shipped/100% while a requirement is still open without debt
 *
 * Loose phrases like "tech debt" in prose do NOT count. Only structured
 * entries in `.planning/accepted-debt.yaml` are accepted.
 *
 * Usage:
 *   node app/scripts/check-planning-consistency.mjs
 *   node app/scripts/check-planning-consistency.mjs --root /path/to/repo
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(__dirname, "../..");

function parseArgs(argv) {
  const args = { root: DEFAULT_ROOT };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root" && argv[i + 1]) {
      args.root = resolve(argv[++i]);
    }
  }
  return args;
}

/**
 * Minimal YAML subset parser for accepted-debt.yaml.
 * Supports:
 *   accepted_debt: []
 *   accepted_debt:
 *     - requirement: PLAN-02
 *       reason: "..."
 *       owner: "..."
 *       accepted_at: "2026-07-12"
 *       carry_forward: true
 */
export function parseAcceptedDebtYaml(text) {
  const debts = [];
  const lines = text.split(/\r?\n/);
  let inList = false;
  let current = null;

  for (const raw of lines) {
    const line = raw.replace(/\t/g, "  ");
    if (/^\s*#/.test(line) || line.trim() === "") continue;

    if (/^accepted_debt:\s*\[\s*\]\s*$/.test(line)) {
      return [];
    }
    if (/^accepted_debt:\s*$/.test(line)) {
      inList = true;
      continue;
    }
    if (!inList) continue;

    const itemStart = line.match(/^\s*-\s+requirement:\s*(.+)\s*$/);
    if (itemStart) {
      if (current) debts.push(current);
      current = {
        requirement: stripQuotes(itemStart[1]),
        reason: "",
        owner: "",
        accepted_at: "",
        carry_forward: false,
      };
      continue;
    }
    if (!current) continue;

    const field = line.match(/^\s+(reason|owner|accepted_at|carry_forward):\s*(.*)\s*$/);
    if (field) {
      const [, key, value] = field;
      if (key === "carry_forward") {
        current.carry_forward = /^(true|yes|1)$/i.test(stripQuotes(value));
      } else {
        current[key] = stripQuotes(value);
      }
    }
  }
  if (current) debts.push(current);
  return debts;
}

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

export function parseRequirements(markdown) {
  const open = [];
  const complete = [];
  const re = /^-\s+\[([ xX])\]\s+\*\*([A-Z]+-\d+)\*\*/gm;
  let match;
  while ((match = re.exec(markdown)) !== null) {
    const id = match[2];
    if (match[1].toLowerCase() === "x") complete.push(id);
    else open.push(id);
  }
  return { open, complete };
}

export function parseStateFrontmatter(markdown) {
  const fence = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fence) return {};
  const data = {};
  for (const line of fence[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.+)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (/^\d+(\.\d+)?$/.test(value)) value = Number(value);
    data[m[1]] = value;
  }
  // nested progress.percent / completed_plans
  const percent = fence[1].match(/^\s+percent:\s*(\d+)/m);
  if (percent) data.progress_percent = Number(percent[1]);
  const completedPlans = fence[1].match(/^\s+completed_plans:\s*(\d+)/m);
  if (completedPlans) data.completed_plans = Number(completedPlans[1]);
  const totalPlans = fence[1].match(/^\s+total_plans:\s*(\d+)/m);
  if (totalPlans) data.total_plans = Number(totalPlans[1]);
  return data;
}

/** Open plan checkboxes under a phase detail section (e.g. 205-01-PLAN.md). */
export function parseOpenPhasePlans(roadmapMd) {
  const open = [];
  const sections = roadmapMd.split(/^### Phase /m).slice(1);
  for (const section of sections) {
    const header = section.match(/^(\d+):/);
    if (!header) continue;
    const phaseNum = header[1];
    const phaseChecked = new RegExp(
      `- \\[x\\] \\*\\*Phase ${phaseNum}:`,
      "i"
    ).test(roadmapMd);
    const progressComplete = new RegExp(
      `\\|\\s*${phaseNum}\\.[^|]+\\|\\s*\\d+/\\d+\\s*\\|\\s*Complete`,
      "i"
    ).test(roadmapMd);

    if (!phaseChecked && !progressComplete) continue;

    const planRe = /- \[([ xX])\]\s+(\d+-[\w.-]*PLAN\.md)/g;
    let match;
    while ((match = planRe.exec(section)) !== null) {
      if (match[1].toLowerCase() !== "x") {
        open.push({ phase: phaseNum, plan: match[2] });
      }
    }
  }
  return open;
}

export function parsePendingTodos(stateMd) {
  const section = stateMd.match(
    /### Pending Todos\r?\n([\s\S]*?)(?=\r?\n### |\r?\n## |$)/i
  );
  if (!section) return [];
  const body = section[1].trim();
  if (!body || /^_?None\b/i.test(body)) return [];
  return (body.match(/^-\s+.+/gm) || []).map((line) => line.replace(/^-\s+/, "").trim());
}

export function validatePlanningConsistency({
  requirementsMd,
  stateMd,
  roadmapMd,
  acceptedDebtYaml,
}) {
  const errors = [];
  const { open, complete } = parseRequirements(requirementsMd);
  const state = parseStateFrontmatter(stateMd);
  const debts = parseAcceptedDebtYaml(acceptedDebtYaml);

  for (const debt of debts) {
    if (!debt.requirement) {
      errors.push("accepted_debt entry missing requirement id");
      continue;
    }
    if (!debt.reason || !debt.owner || !debt.accepted_at) {
      errors.push(
        `accepted_debt for ${debt.requirement} must include reason, owner, and accepted_at`
      );
    }
    if (!open.includes(debt.requirement) && !complete.includes(debt.requirement)) {
      errors.push(
        `accepted_debt references unknown requirement ${debt.requirement}`
      );
    }
  }

  const coveredOpen = new Set(
    debts
      .filter((d) => open.includes(d.requirement))
      .map((d) => d.requirement)
  );
  const uncoveredOpen = open.filter((id) => !coveredOpen.has(id));

  const status = String(state.status ?? "").toLowerCase();
  const claimsComplete =
    status === "completed" ||
    status === "complete" ||
    status === "shipped" ||
    state.progress_percent === 100 ||
    /Progress:\s*\[█+\]\s*100%/i.test(stateMd);

  if (claimsComplete && uncoveredOpen.length > 0) {
    errors.push(
      `STATE claims complete/shipped/100% but open requirements lack accepted_debt: ${uncoveredOpen.join(", ")}`
    );
  }

  if (/✅ \*\*v13\.9/.test(roadmapMd) && uncoveredOpen.length > 0) {
    errors.push(
      `ROADMAP marks v13.9 shipped while open requirements lack accepted_debt: ${uncoveredOpen.join(", ")}`
    );
  }

  // Frontmatter percent vs body progress bar honesty
  if (
    typeof state.progress_percent === "number" &&
    state.progress_percent < 100 &&
    /Progress:\s*\[█+\]\s*100%/i.test(stateMd)
  ) {
    errors.push(
      `STATE frontmatter progress.percent=${state.progress_percent} disagrees with body Progress 100% bar`
    );
  }

  // Plan: X of Y vs Total Plans in Phase: Z
  const planOf = stateMd.match(/Plan:\s*(\d+)\s+of\s+(\d+)/i);
  const totalInPhase = stateMd.match(/Total Plans in Phase:\s*(\d+)/i);
  if (planOf && totalInPhase) {
    const ofY = Number(planOf[2]);
    const total = Number(totalInPhase[1]);
    if (ofY !== total) {
      errors.push(
        `STATE Plan X of Y uses Y=${ofY} but Total Plans in Phase=${total}`
      );
    }
  }

  // Frontmatter completed_plans vs total_plans when claiming complete
  if (
    claimsComplete &&
    typeof state.completed_plans === "number" &&
    typeof state.total_plans === "number" &&
    state.completed_plans !== state.total_plans
  ) {
    errors.push(
      `STATE claims complete but completed_plans=${state.completed_plans} != total_plans=${state.total_plans}`
    );
  }

  // Pending todos must be empty when milestone claims complete
  const pendingTodos = parsePendingTodos(stateMd);
  if (claimsComplete && pendingTodos.length > 0) {
    errors.push(
      `STATE claims complete but Pending Todos still lists: ${pendingTodos.join("; ")}`
    );
  }

  // Phases 203–207 all checked → milestone must not stay 📋
  const phases203to207Complete = [203, 204, 205, 206, 207].every((n) =>
    new RegExp(`- \\[x\\] \\*\\*Phase ${n}:`, "i").test(roadmapMd)
  );
  if (phases203to207Complete && /📋 \*\*v13\.9/.test(roadmapMd)) {
    errors.push(
      "ROADMAP still marks v13.9 as active (📋) while phases 203–207 are all checked complete"
    );
  }
  if (
    claimsComplete &&
    phases203to207Complete &&
    !/✅ \*\*v13\.9/.test(roadmapMd)
  ) {
    errors.push(
      "STATE claims complete and phases 203–207 are checked, but ROADMAP does not mark v13.9 with ✅"
    );
  }

  // Open plan checkboxes under completed phases
  const openPhasePlans = parseOpenPhasePlans(roadmapMd);
  if (openPhasePlans.length > 0) {
    errors.push(
      `ROADMAP has unchecked plans under completed phases: ${openPhasePlans
        .map((p) => `${p.plan} (phase ${p.phase})`)
        .join(", ")}`
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    open,
    complete,
    uncoveredOpen,
    debts,
    state,
    pendingTodos,
    openPhasePlans,
  };
}

function main() {
  const { root } = parseArgs(process.argv.slice(2));
  const requirementsPath = resolve(root, ".planning/REQUIREMENTS.md");
  const statePath = resolve(root, ".planning/STATE.md");
  const roadmapPath = resolve(root, ".planning/ROADMAP.md");
  const debtPath = resolve(root, ".planning/accepted-debt.yaml");

  for (const path of [requirementsPath, statePath, roadmapPath, debtPath]) {
    if (!existsSync(path)) {
      console.error(`PLANNING-CONSISTENCY: missing required file ${path}`);
      process.exit(1);
    }
  }

  const result = validatePlanningConsistency({
    requirementsMd: readFileSync(requirementsPath, "utf8"),
    stateMd: readFileSync(statePath, "utf8"),
    roadmapMd: readFileSync(roadmapPath, "utf8"),
    acceptedDebtYaml: readFileSync(debtPath, "utf8"),
  });

  if (!result.ok) {
    console.error("PLANNING-CONSISTENCY: FAILED");
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(
    `PLANNING-CONSISTENCY: ok (${result.complete.length} complete, ${result.open.length} open, ${result.debts.length} accepted_debt)`
  );
}

const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}
