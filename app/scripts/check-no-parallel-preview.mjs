#!/usr/bin/env node
/**
 * Phase 7 guard: the discarded /v6 preview tree must not return.
 * Production modules may keep `v6` in their internal names while the migration
 * is being completed; only route literals and the parallel route tree fail.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ownAppRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootArgIndex = process.argv.indexOf("--app-root");
const appRoot = rootArgIndex >= 0
  ? resolve(process.argv[rootArgIndex + 1] ?? "")
  : ownAppRoot;
const sourceRoot = resolve(appRoot, "src");
const previewRoot = resolve(sourceRoot, "app/(preview)/v6");
const routeLiteral = /["'`]\/v6(?:\/|["'`])/;
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);

function walk(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((entry) => {
    const path = resolve(root, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const previewFiles = walk(previewRoot);
const routeLiteralFiles = walk(sourceRoot).filter(
  (path) => sourceExtensions.has(extname(path)) && routeLiteral.test(readFileSync(path, "utf8"))
);

if (previewFiles.length > 0 || routeLiteralFiles.length > 0) {
  console.error("NO-PARALLEL-PREVIEW: the retired /v6 product tree returned.");
  for (const path of [...previewFiles, ...routeLiteralFiles]) {
    console.error(`  - ${path.slice(appRoot.length + 1)}`);
  }
  process.exit(1);
}

console.log("NO-PARALLEL-PREVIEW: ok (no /v6 route tree or route literals)");
