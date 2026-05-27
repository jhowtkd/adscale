#!/usr/bin/env node

/**
 * Bundle Analysis Script for CI
 * 
 * Analyzes .next/static/chunks/ after build to ensure bundle size constraints.
 * Fails if total bundle exceeds threshold.
 */

import { readdirSync, statSync } from "fs";
import { join } from "path";

const CHUNKS_DIR = join(process.cwd(), ".next", "static", "chunks");
const THRESHOLD_MB = 2.0;
const THRESHOLD_BYTES = THRESHOLD_MB * 1024 * 1024;

function getChunkFiles() {
  try {
    return readdirSync(CHUNKS_DIR).filter((f) => f.endsWith(".js"));
  } catch {
    console.error("❌ .next/static/chunks/ not found. Run build first.");
    process.exit(1);
  }
}

function analyzeChunks() {
  const files = getChunkFiles();
  let totalSize = 0;
  const chunks = [];

  for (const file of files) {
    const size = statSync(join(CHUNKS_DIR, file)).size;
    totalSize += size;
    chunks.push({
      file,
      sizeKb: (size / 1024).toFixed(2),
    });
  }

  // Sort by size descending
  chunks.sort((a, b) => parseFloat(b.sizeKb) - parseFloat(a.sizeKb));

  console.log("\n📦 Bundle Analysis Report");
  console.log("==========================");
  console.log(`\nTotal chunks: ${chunks.length}`);
  console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Threshold: ${THRESHOLD_MB} MB`);
  console.log(`\nTop 10 largest chunks:`);
  console.log("----------------------");
  
  for (const chunk of chunks.slice(0, 10)) {
    console.log(`${chunk.file.padEnd(50)} ${chunk.sizeKb.padStart(10)} KB`);
  }

  if (totalSize > THRESHOLD_BYTES) {
    console.error(`\n❌ Bundle size exceeds threshold!`);
    console.error(`   Limit: ${THRESHOLD_MB} MB`);
    console.error(`   Actual: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    process.exit(1);
  }

  console.log(`\n✅ Bundle size within threshold (${(totalSize / 1024 / 1024).toFixed(2)} MB < ${THRESHOLD_MB} MB)`);
  
  // Output JSON for CI artifacts
  const report = {
    totalSize: totalSize,
    totalSizeMb: parseFloat((totalSize / 1024 / 1024).toFixed(2)),
    thresholdMb: THRESHOLD_MB,
    pass: totalSize <= THRESHOLD_BYTES,
    chunks: chunks,
  };
  
  console.log("\n📊 JSON Report:");
  console.log(JSON.stringify(report, null, 2));
}

analyzeChunks();
