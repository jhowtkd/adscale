import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAcceptedDebtYaml,
  parseRequirements,
  parseStateFrontmatter,
  validatePlanningConsistency,
} from "./check-planning-consistency.mjs";

test("parseRequirements distinguishes open and complete", () => {
  const md = `
- [x] **PLAN-01**: done
- [ ] **PLAN-02**: pending
- [X] **CREV-01**: also done
`;
  const { open, complete } = parseRequirements(md);
  assert.deepEqual(open, ["PLAN-02"]);
  assert.deepEqual(complete, ["PLAN-01", "CREV-01"]);
});

test("parseAcceptedDebtYaml rejects prose-only debt and reads structured entries", () => {
  const yaml = `
accepted_debt:
  - requirement: PLAN-02
    reason: "Field-level diff deferred"
    owner: "Jhonatan"
    accepted_at: "2026-07-12"
    carry_forward: true
`;
  const debts = parseAcceptedDebtYaml(yaml);
  assert.equal(debts.length, 1);
  assert.equal(debts[0].requirement, "PLAN-02");
  assert.equal(debts[0].carry_forward, true);
});

test("STATE complete with uncovered open requirement fails", () => {
  const result = validatePlanningConsistency({
    requirementsMd: "- [ ] **PLAN-02**: pending\n",
    stateMd: `---
status: completed
progress:
  percent: 100
---
Progress: [██████████] 100%
`,
    roadmapMd: "# Roadmap\n",
    acceptedDebtYaml: "accepted_debt: []\n",
  });
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /PLAN-02/);
});

test("accepted_debt covers open requirement under complete STATE", () => {
  const result = validatePlanningConsistency({
    requirementsMd: "- [ ] **PLAN-02**: pending\n",
    stateMd: `---
status: completed
progress:
  percent: 100
---
`,
    roadmapMd: "# Roadmap\n",
    acceptedDebtYaml: `
accepted_debt:
  - requirement: PLAN-02
    reason: "Deferred field diff"
    owner: "Jhonatan"
    accepted_at: "2026-07-12"
    carry_forward: true
`,
  });
  assert.equal(result.ok, true);
});

test("loose tech debt phrase is ignored", () => {
  const result = validatePlanningConsistency({
    requirementsMd: "- [ ] **PLAN-02**: pending\n",
    stateMd: `---
status: completed
---
tech debt accepted for PLAN-02
`,
    roadmapMd: "# Roadmap\n",
    acceptedDebtYaml: "accepted_debt: []\n",
  });
  assert.equal(result.ok, false);
});

test("frontmatter percent vs 100% bar disagreement fails", () => {
  const result = validatePlanningConsistency({
    requirementsMd: "- [x] **PLAN-01**: done\n",
    stateMd: `---
status: active
progress:
  percent: 72
---
Progress: [██████████] 100%
`,
    roadmapMd: "# Roadmap\n",
    acceptedDebtYaml: "accepted_debt: []\n",
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /disagrees/);
});

test("parseStateFrontmatter reads nested percent", () => {
  const data = parseStateFrontmatter(`---
status: completed
progress:
  percent: 72
---
`);
  assert.equal(data.status, "completed");
  assert.equal(data.progress_percent, 72);
});

test("STATE Plan 4 of 5 under complete status fails", () => {
  const result = validatePlanningConsistency({
    requirementsMd: "- [x] **PLAN-01**: done\n",
    stateMd: `---
status: completed
current_plan: 5
progress:
  percent: 100
  completed_plans: 5
  total_plans: 5
---
Plan: 4 of 5
Total Plans in Phase: 5
Progress: [██████████] 100%

### Pending Todos

_None_
`,
    roadmapMd: `# Roadmap
- ✅ **v13.9 Copiloto**
- [x] **Phase 203: A**
- [x] **Phase 204: B**
- [x] **Phase 205: C**
- [x] **Phase 206: D**
- [x] **Phase 207: E**
`,
    acceptedDebtYaml: "accepted_debt: []\n",
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /X === Y/);
});

test("STATE complete with current_plan != phase total fails", () => {
  const result = validatePlanningConsistency({
    requirementsMd: "- [x] **PLAN-01**: done\n",
    stateMd: `---
status: completed
current_plan: 4
progress:
  percent: 100
  completed_plans: 5
  total_plans: 5
---
Plan: 5 of 5
Total Plans in Phase: 5
Progress: [██████████] 100%

### Pending Todos

_None_
`,
    roadmapMd: `# Roadmap
- ✅ **v13.9 Copiloto**
- [x] **Phase 203: A**
- [x] **Phase 204: B**
- [x] **Phase 205: C**
- [x] **Phase 206: D**
- [x] **Phase 207: E**
`,
    acceptedDebtYaml: "accepted_debt: []\n",
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /current_plan=4/);
});


test("pending todos under complete STATE fail", () => {
  const result = validatePlanningConsistency({
    requirementsMd: "- [x] **PLAN-01**: done\n",
    stateMd: `---
status: completed
progress:
  percent: 100
  completed_plans: 1
  total_plans: 1
---
Progress: [██████████] 100%

### Pending Todos

- Execute 204-02 orchestrator
`,
    roadmapMd: `# Roadmap
- ✅ **v13.9 Copiloto**
- [x] **Phase 203: A**
- [x] **Phase 204: B**
- [x] **Phase 205: C**
- [x] **Phase 206: D**
- [x] **Phase 207: E**
`,
    acceptedDebtYaml: "accepted_debt: []\n",
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Pending Todos/);
});

test("📋 v13.9 with all phases checked fails", () => {
  const result = validatePlanningConsistency({
    requirementsMd: "- [x] **PLAN-01**: done\n",
    stateMd: `---
status: completed
progress:
  percent: 100
  completed_plans: 1
  total_plans: 1
---
Progress: [██████████] 100%

### Pending Todos

_None_
`,
    roadmapMd: `# Roadmap
- 📋 **v13.9 Copiloto**
- [x] **Phase 203: A**
- [x] **Phase 204: B**
- [x] **Phase 205: C**
- [x] **Phase 206: D**
- [x] **Phase 207: E**

### Phase 205: Creative
Plans:
- [ ] 205-01-PLAN.md — pending
`,
    acceptedDebtYaml: "accepted_debt: []\n",
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /📋/);
  assert.match(result.errors.join("\n"), /205-01-PLAN/);
});

test("roadmapClaimsV139Done is enforced when STATE complete without ✅", () => {
  const result = validatePlanningConsistency({
    requirementsMd: "- [x] **PLAN-01**: done\n",
    stateMd: `---
status: completed
progress:
  percent: 100
  completed_plans: 1
  total_plans: 1
---
Progress: [██████████] 100%

### Pending Todos

_None_
`,
    roadmapMd: `# Roadmap
- 🔄 **v13.9 Copiloto**
- [x] **Phase 203: A**
- [x] **Phase 204: B**
- [x] **Phase 205: C**
- [x] **Phase 206: D**
- [x] **Phase 207: E**
`,
    acceptedDebtYaml: "accepted_debt: []\n",
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /does not mark v13\.9 with ✅/);
});
