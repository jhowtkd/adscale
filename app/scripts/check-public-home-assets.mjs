#!/usr/bin/env node
/**
 * Public-home asset gate (#446).
 *
 * Verifies, for every record in public/adscale-guest/asset-manifest.json:
 * existence, decodable dimensions (WebP VP8/VP8L/VP8X), a real reference in
 * the guest-home sources, authorization fields, and absence of placeholders.
 *
 * During preview, records may be unapproved (empty approvedBy/approvedAt)
 * and the default run only warns about them. `--release` fails on any
 * unapproved record. Never fill approver/date fictitiously to pass the gate:
 * product-output records additionally require approval even in default mode.
 *
 * Usage: node scripts/check-public-home-assets.mjs [--release]
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const assetsDir = path.join(appRoot, "public", "adscale-guest");
const manifestPath = path.join(assetsDir, "asset-manifest.json");
const sources = [
  path.join(appRoot, "src", "components", "guest-home", "guest-core.mjs"),
  path.join(appRoot, "src", "components", "guest-home", "guest-markup.mjs"),
  path.join(appRoot, "src", "components", "guest-home", "guest-controller.mjs"),
];
const releaseMode = process.argv.includes("--release");

const failures = [];
const warnings = [];
const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);

/** Minimal WebP dimension probe (VP8 lossy, VP8L lossless, VP8X extended). */
function webpDimensions(buffer) {
  if (buffer.length < 30) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buffer.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    const width = buffer.readUIntLE(24, 3) + 1;
    const height = buffer.readUIntLE(27, 3) + 1;
    return { width, height };
  }
  if (chunk === "VP8 ") {
    // Chunk data: 3-byte frame tag, then the 0x9D012A start code.
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) return null;
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }
  if (chunk === "VP8L") {
    if (buffer[20] !== 0x2f) return null;
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

function checkSizedImgTemplates() {
  // Filenames are interpolated (asset(example.image)), so width/height (CLS)
  // are enforced on every <img> template instead of per manifest record.
  for (const source of sources) {
    const text = readFileSync(source, "utf8");
    const tags = text.match(/<img[^>]*>/g) ?? [];
    for (const tag of tags) {
      if (!/width="\d+"/.test(tag) || !/height="\d+"/.test(tag)) {
        fail(`${path.basename(source)}: <img> without width/height: ${tag.slice(0, 80)}…`);
      }
    }
  }
}

function isReferenced(fileName) {
  return sources.some((source) => readFileSync(source, "utf8").includes(fileName));
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  fail(`cannot read manifest: ${error.message}`);
  manifest = null;
}

if (!Array.isArray(manifest)) {
  if (manifest !== null) fail("manifest must be a JSON array of records");
} else if (manifest.length === 0) {
  fail("manifest is empty");
} else {
  for (const [index, record] of manifest.entries()) {
    const label = `record ${index} (${record?.file ?? "?"})`;
    for (const key of ["file", "kind", "rights", "approvedBy", "approvedAt"]) {
      if (typeof record?.[key] !== "string") fail(`${label}: missing string field ${key}`);
    }
    if (record?.kind !== "illustrative" && record?.kind !== "product-output") {
      fail(`${label}: kind must be illustrative or product-output`);
      continue;
    }
    if (!record.file || record.file.includes("/") || record.file.includes("..")) {
      fail(`${label}: file must be a bare filename`);
      continue;
    }
    const filePath = path.join(assetsDir, record.file);
    let bytes;
    try {
      bytes = statSync(filePath).size;
    } catch {
      fail(`${label}: file not found`);
      continue;
    }
    if (bytes === 0) fail(`${label}: file is empty`);
    const content = readFileSync(filePath);
    if (record.file.endsWith(".webp")) {
      const dims = webpDimensions(content);
      if (!dims) fail(`${label}: not a decodable WebP`);
      else console.log(`ok ${record.file}: ${dims.width}x${dims.height}, ${bytes} bytes, ${record.kind}`);
    } else {
      console.log(`ok ${record.file}: ${bytes} bytes, ${record.kind}`);
    }
    if (content.toString("utf8").toLowerCase().includes("placeholder")) {
      fail(`${label}: file contains a placeholder marker`);
    }
    if (!isReferenced(record.file)) fail(`${label}: not referenced by guest-home sources`);
    if (!record.rights || /todo|tbd|placeholder/i.test(record.rights)) {
      fail(`${label}: rights/provenance missing or placeholder`);
    }
    const approved = Boolean(record.approvedBy) && /^\d{4}-\d{2}-\d{2}$/.test(record.approvedAt);
    if (!approved) {
      const message = `${label}: unapproved (approvedBy/approvedAt empty)`;
      if (releaseMode || record.kind === "product-output") fail(message);
      else warn(message);
    }
  }
}

checkSizedImgTemplates();

for (const message of warnings) console.log(`warn ${message}`);
for (const message of failures) console.error(`fail ${message}`);
if (failures.length > 0) {
  console.error(
    releaseMode
      ? "asset gate FAILED (release mode): approve every record with a real approver/date"
      : "asset gate FAILED",
  );
  process.exit(1);
}
console.log(
  releaseMode ? "asset gate passed (release mode)" : "asset gate passed (preview: unapproved records warn only)",
);
