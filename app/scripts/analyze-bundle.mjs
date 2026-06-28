#!/usr/bin/env node

/**
 * Bundle Analysis Script for CI
 *
 * Gates on **initial load** (shared runtime + root app shell), not the sum of
 * every lazy-loaded route chunk. Phase 22 targeted bundle inicial < 2 MB.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const NEXT_DIR = join(process.cwd(), ".next");
const CHUNKS_DIR = join(NEXT_DIR, "static", "chunks");
const BUILD_MANIFEST = join(NEXT_DIR, "build-manifest.json");
const THRESHOLD_MB = 2.0;
const THRESHOLD_BYTES = THRESHOLD_MB * 1024 * 1024;
const LAZY_TOTAL_WARN_MB = 4.0;

const KEY_ROUTE_CHUNKS = [
  { dir: [], prefix: "layout-" },
  { dir: ["(dashboard)"], prefix: "layout-" },
  { dir: ["(dashboard)"], prefix: "page-" },
];

function getChunkFiles() {
  try {
    return readdirSync(CHUNKS_DIR).filter((f) => f.endsWith(".js"));
  } catch {
    console.error("❌ .next/static/chunks/ not found. Run build first.");
    process.exit(1);
  }
}

function fileSize(relativePath) {
  const absolute = join(NEXT_DIR, relativePath);
  if (!existsSync(absolute)) return 0;
  return statSync(absolute).size;
}

function sumSizes(relativePaths) {
  const unique = [...new Set(relativePaths)];
  let total = 0;
  for (const path of unique) {
    total += fileSize(path);
  }
  return total;
}

function readBuildManifest() {
  if (!existsSync(BUILD_MANIFEST)) {
    console.error("❌ .next/build-manifest.json not found. Run build first.");
    process.exit(1);
  }
  return JSON.parse(readFileSync(BUILD_MANIFEST, "utf8"));
}

function findRouteChunks() {
  const appChunksDir = join(CHUNKS_DIR, "app");
  if (!existsSync(appChunksDir)) return [];

  const matches = [];
  for (const { dir, prefix } of KEY_ROUTE_CHUNKS) {
    const absoluteDir = join(appChunksDir, ...dir);
    if (!existsSync(absoluteDir)) continue;
    const hit = readdirSync(absoluteDir).find((name) => name.startsWith(prefix) && name.endsWith(".js"));
    if (hit) {
      matches.push(join("static", "chunks", "app", ...dir, hit).replace(/\\/g, "/"));
    }
  }
  return matches;
}

function analyzeChunks() {
  const manifest = readBuildManifest();
  const coreFiles = [...(manifest.polyfillFiles ?? []), ...(manifest.rootMainFiles ?? [])];
  const routeFiles = findRouteChunks();
  const initialLoadBytes = sumSizes([...coreFiles, ...routeFiles]);

  const files = getChunkFiles();
  let lazyTotalBytes = 0;
  const chunks = [];

  for (const file of files) {
    const size = statSync(join(CHUNKS_DIR, file)).size;
    lazyTotalBytes += size;
    chunks.push({
      file,
      sizeKb: (size / 1024).toFixed(2),
    });
  }

  chunks.sort((a, b) => parseFloat(b.sizeKb) - parseFloat(a.sizeKb));

  console.log("\n📦 Bundle Analysis Report");
  console.log("==========================");
  console.log(`\nInitial load (core + dashboard shell): ${(initialLoadBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Core chunks: ${coreFiles.length}`);
  console.log(`  Route shell chunks: ${routeFiles.length}`);
  console.log(`Initial load threshold: ${THRESHOLD_MB} MB`);
  console.log(`\nAll lazy chunks (informational): ${chunks.length} files, ${(lazyTotalBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Lazy total warn threshold: ${LAZY_TOTAL_WARN_MB} MB`);
  console.log(`\nTop 10 largest chunks:`);
  console.log("----------------------");

  for (const chunk of chunks.slice(0, 10)) {
    console.log(`${chunk.file.padEnd(50)} ${chunk.sizeKb.padStart(10)} KB`);
  }

  const initialPass = initialLoadBytes <= THRESHOLD_BYTES;
  const lazyWarn = lazyTotalBytes > LAZY_TOTAL_WARN_MB * 1024 * 1024;

  if (!initialPass) {
    console.error(`\n❌ Initial load exceeds threshold!`);
    console.error(`   Limit: ${THRESHOLD_MB} MB`);
    console.error(`   Actual: ${(initialLoadBytes / 1024 / 1024).toFixed(2)} MB`);
    process.exit(1);
  }

  console.log(
    `\n✅ Initial load within threshold (${(initialLoadBytes / 1024 / 1024).toFixed(2)} MB < ${THRESHOLD_MB} MB)`,
  );

  if (lazyWarn) {
    console.warn(
      `\n⚠️  Total lazy chunk volume is high (${(lazyTotalBytes / 1024 / 1024).toFixed(2)} MB > ${LAZY_TOTAL_WARN_MB} MB). Review largest async imports.`,
    );
  }

  const report = {
    initialLoadBytes,
    initialLoadMb: parseFloat((initialLoadBytes / 1024 / 1024).toFixed(2)),
    lazyTotalBytes,
    lazyTotalMb: parseFloat((lazyTotalBytes / 1024 / 1024).toFixed(2)),
    thresholdMb: THRESHOLD_MB,
    pass: initialPass,
    coreFiles,
    routeFiles,
    chunks,
  };

  console.log("\n📊 JSON Report:");
  console.log(JSON.stringify(report, null, 2));
}

analyzeChunks();
