import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Spec 2026-10-07 §2: the composer left `/`, so no code may build a link to `/` with a query again. Only the
 * conversation's `suggestion` and an invite's `workspaceId` keys are allowed. The guest flow
 * (src/components/guest-home) lands on `/` without a query, so it is scanned like everything else.
 */
const APP_ROOT = process.cwd();
const SCANNED_DIRS = ["src"];
const SCANNED_FILES = ["next.config.ts"];
const ALLOWED_QUERY_KEYS = new Set(["suggestion", "workspaceId"]);
const ROOT_WITH_QUERY = /["'`]\/\?([^"'`\s]*)/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(join(APP_ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx|mjs)$/.test(entry.name) || /\.(test|spec)\.(ts|tsx|mjs)$/.test(entry.name)) return [];
    return [path];
  });
}

function rootQueryLinks(files: string[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    const text = readFileSync(join(APP_ROOT, file), "utf8");
    for (const match of text.matchAll(ROOT_WITH_QUERY)) {
      const keys = [...new URLSearchParams(match[1] ?? "").keys()];
      if (keys.length > 0 && keys.every((key) => ALLOWED_QUERY_KEYS.has(key))) continue;
      const line = text.slice(0, match.index ?? 0).split("\n").length;
      found.push(`${file.split(sep).join("/")}:${line}: ${match[0]}`);
    }
  }
  return found;
}

describe("composer links (spec 2026-10-07 §2)", () => {
  it("no code builds a link to / with a query, except the conversation's suggestion and an invite's workspace", () => {
    const files = [...SCANNED_DIRS.flatMap(sourceFiles), ...SCANNED_FILES];
    expect(rootQueryLinks(files)).toEqual([]);
  });
});
