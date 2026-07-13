import assert from "node:assert/strict";
import test from "node:test";
import {
  parseDecisionsYaml,
  validateSurfaceInventory,
} from "./check-surface-inventory.mjs";

test("undecided inert CTA fails the inventory gate", () => {
  const result = validateSurfaceInventory({
    inventory: {
      ctas: [
        {
          id: "inert:x:1",
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
    decisions: [],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /undecided blocker/);
});

test("matching decision covers inert CTA", () => {
  const result = validateSurfaceInventory({
    inventory: {
      ctas: [
        {
          id: "inert:x:1",
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
        evidence: "app/src/components/workspace/DerivationCard.tsx:590",
        decision: "esconder",
        rationale: "frozen",
      },
    ],
  });
  assert.equal(result.ok, true);
});

test("parseDecisionsYaml reads structured entries", () => {
  const decisions = parseDecisionsYaml(`
decisions:
  - id: B1
    evidence: app/src/foo.tsx:10
    decision: manter
    rationale: "ok"
`);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].id, "B1");
  assert.equal(decisions[0].decision, "manter");
});
