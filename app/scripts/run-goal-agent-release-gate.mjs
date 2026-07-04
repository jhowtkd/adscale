#!/usr/bin/env node

/**
 * Goal-agent pilot release gate. Runs the focused goal-agent test suite,
 * typecheck, lint, build, and the Playwright pilot spec in order, stopping on
 * the first failure. Invoke with `npm run goal-agent-release-gate`.
 */
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const GOAL_AGENT_TEST_PATTERNS = [
  "src/server/repositories/assistant-goal.test.ts",
  "src/server/assistant/goal/**/*.test.ts",
  "src/app/api/assistant/threads/**/goal/**/*.test.ts",
  "src/app/api/feedback/analytics/goal-agent/**/*.test.ts",
  "src/server/assistant/action-execution/handlers/generate-creative-triplet.test.ts",
  "src/server/assistant/action-execution/handlers/generate-goal-package.test.ts",
  "src/server/assistant/action-execution/handlers/revise-creative-annotations.test.ts",
  "src/components/assistant/CreativeTripletGrid.test.tsx",
  "src/components/assistant/GoalPackageReview.test.tsx",
  "src/components/assistant/AssistantStartComposer.test.tsx",
  "src/app/api/export/zip/route.test.ts",
  "src/app/api/assistant/threads/route.test.ts",
];

const steps = [
  {
    label: "goal-agent unit/integration tests",
    command: "npx",
    args: [
      "vitest",
      "run",
      "--config",
      "config/vitest.config.ts",
      ...GOAL_AGENT_TEST_PATTERNS,
    ],
  },
  { label: "typecheck", command: "npm", args: ["run", "typecheck"] },
  { label: "lint", command: "npm", args: ["run", "lint"] },
  { label: "build", command: "npm", args: ["run", "build"] },
  {
    label: "goal-agent e2e",
    command: "npx",
    args: ["playwright", "test", "tests/e2e/assistant-goal-agent.spec.ts"],
  },
];

for (const step of steps) {
  console.log(`\n==> ${step.label}`);
  try {
    execFileSync(step.command, step.args, {
      cwd: appDir,
      stdio: "inherit",
      env: process.env,
    });
  } catch {
    console.error(`\n✗ Release gate FAILED at: ${step.label}`);
    process.exit(1);
  }
}

console.log("\n✓ Goal-agent release gate passed.");
