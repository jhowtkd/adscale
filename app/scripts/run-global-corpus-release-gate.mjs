#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");

const GLOBAL_CORPUS_TESTS = [
  "tests/unit/human-quality/global-evidence.test.ts",
  "src/app/api/feedback/global-corpus-evidence/route.test.ts",
  "src/app/api/feedback/human-quality-corpus/route.test.ts",
  "src/app/api/feedback/human-quality-corpus/candidates/route.test.ts",
  "src/app/api/feedback/human-quality-corpus/candidates/[id]/promote/route.test.ts",
  "src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.test.ts",
  "tests/unit/human-quality/human-quality-service.test.ts",
  "tests/unit/human-quality/feedback-artifact.test.ts",
  "tests/unit/human-quality/queue-filters.test.ts",
  "src/components/feedback/HumanQualityCorpusPanel.test.tsx",
];

function runVitest(files) {
  const cmd = ["vitest", "run", "--config", "config/vitest.config.ts", ...files];
  if (dryRun) {
    console.log(`[dry-run] cd app && npx ${cmd.join(" ")}`);
    return;
  }
  execFileSync("npx", cmd, { cwd: appDir, stdio: "inherit" });
}

try {
  console.log("v13.1 global corpus release gate — technical regression");
  runVitest(GLOBAL_CORPUS_TESTS);
  console.log("\nGlobal corpus release gate passed (technical).");
  console.log(
    "Operational evidence remains blocked until human sample and customer-real source sufficiency are met."
  );
} catch (error) {
  console.error("\nGlobal corpus release gate failed.");
  process.exit(1);
}
