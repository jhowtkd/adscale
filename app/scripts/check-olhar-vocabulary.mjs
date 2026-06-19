#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALLOWED_CONTEXT_PATTERNS,
  FORBIDDEN_UI_FIRST_CREATIVE_TERMS,
  SCANNED_OLHAR_PROMPT_FILES,
} from "../src/server/ai/olhar/vocabulary.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");

export function scanOlharVocabulary({
  root = repoRoot,
  files = SCANNED_OLHAR_PROMPT_FILES,
  forbiddenTerms = FORBIDDEN_UI_FIRST_CREATIVE_TERMS,
  allowedPatterns = ALLOWED_CONTEXT_PATTERNS,
} = {}) {
  const violations = [];

  for (const relativePath of files) {
    const absolutePath = resolve(root, relativePath);
    if (!existsSync(absolutePath)) {
      violations.push({
        file: relativePath,
        line: 0,
        term: "(missing file)",
        text: `File not found: ${relativePath}`,
      });
      continue;
    }

    const content = readFileSync(absolutePath, "utf8");
    const lines = content.split("\n");

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const lineNumber = index + 1;

      if (allowedPatterns.some((pattern) => pattern.test(line.trim()))) {
        continue;
      }

      const lowerLine = line.toLowerCase();
      for (const term of forbiddenTerms) {
        if (lowerLine.includes(term.toLowerCase())) {
          violations.push({
            file: relativePath,
            line: lineNumber,
            term,
            text: line.trim(),
          });
        }
      }
    }
  }

  return violations;
}

function main() {
  const violations = scanOlharVocabulary();

  if (violations.length === 0) {
    console.log("Olhar vocabulary audit passed.");
    return;
  }

  console.error(`Olhar vocabulary audit failed (${violations.length} violation(s)):`);
  for (const violation of violations) {
    console.error(
      `  ${violation.file}:${violation.line} — forbidden term "${violation.term}"`
    );
    if (violation.text) {
      console.error(`    ${violation.text}`);
    }
  }
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
