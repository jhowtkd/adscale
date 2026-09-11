#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_CATALOG_RELATIVE = "docs/evidence/2026-09-08-sunburst-visual-corpus.json";
export const FAMILIES = ["piece", "variation", "adaptation", "restyle", "review", "carousel"];
export const CASES_PER_FAMILY = 4;

const repoRootFromScript = resolve(fileURLToPath(new URL("../..", import.meta.url)));

export function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function resolveCatalogPath(catalogPath, repoRoot = repoRootFromScript) {
  return resolve(repoRoot, catalogPath ?? DEFAULT_CATALOG_RELATIVE);
}

export function parseArgs(argv) {
  const args = { catalog: null, binariesRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--catalog") args.catalog = argv[index + 1];
    if (token === "--binaries-root") args.binariesRoot = argv[index + 1];
  }
  return args;
}

function fail(errors, message) {
  errors.push(message);
}

function requiredString(errors, value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(errors, `${label} is required`);
}

function resolveSafe(root, relativePath, label, errors) {
  if (typeof relativePath !== "string" || relativePath.trim() === "") {
    fail(errors, `${label} path is required`);
    return null;
  }
  if (isAbsolute(relativePath) || relativePath.includes("\\")) {
    fail(errors, `${label} must be a posix relative path`);
    return null;
  }
  const resolved = resolve(root, relativePath);
  const rel = relative(root, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    fail(errors, `${label} escapes binaries root: ${relativePath}`);
    return null;
  }
  return resolved;
}

function indexById(items, label, errors) {
  const map = new Map();
  if (!Array.isArray(items)) {
    fail(errors, `${label} must be an array`);
    return map;
  }
  for (const item of items) {
    if (typeof item?.id !== "string" || item.id.trim() === "") {
      fail(errors, `${label} entry is missing id`);
      continue;
    }
    if (map.has(item.id)) fail(errors, `${label} duplicate id: ${item.id}`);
    map.set(item.id, item);
  }
  return map;
}

function verifyBinary(errors, binariesRoot, asset, label) {
  const filePath = resolveSafe(binariesRoot, asset.path, label, errors);
  if (!filePath) return;
  if (!existsSync(filePath)) {
    fail(errors, `${label} missing binary: ${asset.path}`);
    return;
  }
  const digest = sha256Buffer(readFileSync(filePath));
  if (digest !== asset.sha256) {
    fail(errors, `${label} sha256 mismatch for ${asset.path}: expected ${asset.sha256}, got ${digest}`);
  }
}

export function validateSunburstVisualCorpus(catalog, { binariesRoot } = {}) {
  const errors = [];
  if (!catalog || typeof catalog !== "object") {
    return ["catalog must be an object"];
  }

  if (catalog.version !== 1) fail(errors, "version must be 1");
  if (catalog.paidCallsAuthorized !== false) fail(errors, "paidCallsAuthorized must be false until a human approves spend");
  if (catalog.sunburstPercent !== 0) fail(errors, "sunburstPercent must remain 0");
  requiredString(errors, catalog.disclaimer, "disclaimer");
  if (catalog.policies?.control?.model !== "gpt-image-2-2026-04-21") {
    fail(errors, "control model must be gpt-image-2-2026-04-21");
  }
  if (catalog.policies?.candidate?.model !== "gpt-image-2.5-sunburst-2026-09-08") {
    fail(errors, "candidate model must be gpt-image-2.5-sunburst-2026-09-08");
  }

  const assets = indexById(catalog.assets, "assets", errors);
  const cases = Array.isArray(catalog.cases) ? catalog.cases : [];
  if (cases.length !== FAMILIES.length * CASES_PER_FAMILY) {
    fail(errors, `cases must contain ${FAMILIES.length * CASES_PER_FAMILY} entries`);
  }

  const familyCounts = Object.fromEntries(FAMILIES.map((family) => [family, 0]));
  const brands = new Set();
  const segments = new Set();
  const caseIds = new Set();

  for (const entry of cases) {
    const id = entry?.id;
    if (typeof id !== "string" || id.trim() === "") {
      fail(errors, "case id is required");
      continue;
    }
    if (caseIds.has(id)) fail(errors, `duplicate case id: ${id}`);
    caseIds.add(id);

    if (!FAMILIES.includes(entry.family)) fail(errors, `${id} has invalid family`);
    else familyCounts[entry.family] += 1;

    if (entry.result != null) fail(errors, `${id} result must stay null until a paid batch runs`);

    if (entry.status === "ready") {
      requiredString(errors, entry.brand, `${id}.brand`);
      requiredString(errors, entry.segment, `${id}.segment`);
      requiredString(errors, entry.instruction, `${id}.instruction`);
      if (entry.executionAllowed === false) fail(errors, `${id} ready case cannot set executionAllowed false`);
      if (entry.brand) brands.add(entry.brand);
      if (entry.segment) segments.add(entry.segment);
      if (entry.family === "review") requiredString(errors, entry.revisionInstruction, `${id}.revisionInstruction`);
      if (!Array.isArray(entry.sources) || entry.sources.length === 0) {
        fail(errors, `${id} ready case needs sources`);
      } else {
        const roles = [];
        for (const source of entry.sources) {
          const asset = assets.get(source.assetId);
          if (!asset) {
            fail(errors, `${id} unknown asset ${source.assetId}`);
            continue;
          }
          if (asset.brand && entry.brand && asset.brand !== entry.brand) {
            fail(errors, `${id} source ${source.assetId} belongs to ${asset.brand}`);
          }
          requiredString(errors, source.role, `${id} source role`);
          roles.push(source.role);
          if (binariesRoot) verifyBinary(errors, binariesRoot, asset, `${id} ${source.assetId}`);
        }
        if (entry.family === "review" && roles[0] !== "revision") {
          fail(errors, `${id} first source role must be revision`);
        }
      }
    } else if (entry.status === "blocked") {
      requiredString(errors, entry.blockedReason, `${id}.blockedReason`);
      if (entry.executionAllowed !== false) fail(errors, `${id} blocked case must set executionAllowed false`);
    } else {
      fail(errors, `${id} status must be ready or blocked`);
    }
  }

  for (const family of FAMILIES) {
    if (familyCounts[family] !== CASES_PER_FAMILY) {
      fail(errors, `family ${family} must have ${CASES_PER_FAMILY} cases`);
    }
  }
  if (!brands.has("nike") || !brands.has("mtv") || !brands.has("absolut")) {
    fail(errors, "ready cases must cover nike, mtv and absolut");
  }
  if (!segments.has("spirits") && !segments.has("sport") && !segments.has("media")) {
    fail(errors, "ready cases must include a non-education segment");
  }
  if (![...segments].some((segment) => segment !== "education")) {
    fail(errors, "at least one ready case must be outside education");
  }

  if (binariesRoot) {
    for (const asset of assets.values()) {
      verifyBinary(errors, binariesRoot, asset, `asset ${asset.id}`);
    }
  }

  const smoke = catalog.batches?.smokeCaseIds;
  const calibration = catalog.batches?.calibrationCaseIds;
  for (const [label, ids] of [
    ["batches.smokeCaseIds", smoke],
    ["batches.calibrationCaseIds", calibration],
  ]) {
    if (!Array.isArray(ids) || ids.length !== 6) {
      fail(errors, `${label} must list 6 cases`);
      continue;
    }
    for (const id of ids) {
      const entry = cases.find((item) => item.id === id);
      if (!entry) fail(errors, `${label} unknown case ${id}`);
      else if (entry.status !== "ready") fail(errors, `${label} ${id} is not ready`);
    }
  }

  if (!Array.isArray(catalog.batches?.sequenceStarts) || catalog.batches.sequenceStarts.length !== 3) {
    fail(errors, "batches.sequenceStarts must list 3 sequences");
  } else {
    for (const sequence of catalog.batches.sequenceStarts) {
      if (!assets.has(sequence.baseAssetId)) fail(errors, `sequence ${sequence.id} unknown base asset`);
      if (!Array.isArray(sequence.edits) || sequence.edits.length !== 3) {
        fail(errors, `sequence ${sequence.id} must have 3 literal edits`);
      }
    }
  }

  return errors;
}

export function loadCatalog(catalogPath) {
  return JSON.parse(readFileSync(catalogPath, "utf8"));
}

function printErrors(errors) {
  for (const error of errors) console.error(`SUNBURST-CORPUS: ${error}`);
}

export function main(argv = process.argv.slice(2), options = {}) {
  const args = parseArgs(argv);
  const repoRoot = options.repoRoot ?? repoRootFromScript;
  const catalogPath = resolve(args.catalog ?? resolve(repoRoot, DEFAULT_CATALOG_RELATIVE));
  const binariesRoot = resolve(args.binariesRoot ?? repoRoot);
  if (!existsSync(catalogPath)) {
    printErrors([`catalog missing: ${catalogPath}`]);
    return 1;
  }
  const catalog = loadCatalog(catalogPath);
  const errors = validateSunburstVisualCorpus(catalog, { binariesRoot });
  if (errors.length > 0) {
    printErrors(errors);
    return 1;
  }
  const ready = catalog.cases.filter((entry) => entry.status === "ready").length;
  const blocked = catalog.cases.filter((entry) => entry.status === "blocked").length;
  console.log(`SUNBURST-CORPUS: ok ready=${ready} blocked=${blocked} paidCallsAuthorized=false`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}
