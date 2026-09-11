import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  DEFAULT_CATALOG_RELATIVE,
  main,
  validateSunburstVisualCorpus,
} from "./check-sunburst-visual-corpus.mjs";

const script = resolve(dirname(fileURLToPath(import.meta.url)), "check-sunburst-visual-corpus.mjs");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const liveCatalogPath = resolve(repoRoot, DEFAULT_CATALOG_RELATIVE);

const FAMILIES = ["piece", "variation", "adaptation", "restyle", "review", "carousel"];
const BRANDS = ["nike", "mtv", "absolut"];
const SEGMENTS = { nike: "sport", mtv: "media", absolut: "spirits" };

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "sunburst-corpus-"));
  mkdirSync(join(root, "docs/commercial-studies/real-brands/originals"), { recursive: true });
  return root;
}

function digest(body) {
  return createHash("sha256").update(body).digest("hex");
}

function catalogFor(root, mutate = (value) => value) {
  const assets = [
    { id: "original-nike", brand: "nike", file: "nike.jpg", body: "nike-original" },
    { id: "original-mtv", brand: "mtv", file: "mtv.jpg", body: "mtv-original" },
    { id: "original-absolut", brand: "absolut", file: "absolut.jpg", body: "absolut-original" },
  ].map((item) => {
    const path = `docs/commercial-studies/real-brands/originals/${item.file}`;
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, item.body);
    return {
      id: item.id,
      kind: "campaign_original",
      brand: item.brand,
      gitignored: true,
      path,
      sha256: digest(item.body),
    };
  });

  const cases = [];
  for (const family of FAMILIES) {
    for (let index = 0; index < 4; index += 1) {
      if (family === "carousel") {
        cases.push({
          id: `${family}-${index}`,
          family,
          status: "blocked",
          brand: null,
          segment: null,
          protocol: "carousel",
          format: "4:5",
          executionAllowed: false,
          blockedReason: "No authorized carousel deck.",
          sources: [],
          result: null,
        });
        continue;
      }
      const brand = BRANDS[index % 3];
      cases.push({
        id: `${family}-${brand}-${index}`,
        family,
        status: "ready",
        brand,
        segment: SEGMENTS[brand],
        protocol: family === "review" ? "revision" : "recreation",
        format: "4:5",
        instruction: `Literal ${family} instruction for ${brand}.`,
        revisionInstruction: family === "review" ? "Troque somente a chamada por JUST DO IT." : undefined,
        sources: [{ assetId: `original-${brand}`, role: family === "review" ? "revision" : "brand_identity", order: 1 }],
        result: null,
      });
    }
  }

  const readyIds = cases.filter((entry) => entry.status === "ready").map((entry) => entry.id);
  return mutate({
    version: 1,
    paidCallsAuthorized: false,
    sunburstPercent: 0,
    disclaimer: "Estudo independente produzido no ADScale. Sem afiliação, patrocínio ou aprovação da marca analisada.",
    policies: {
      control: { model: "gpt-image-2-2026-04-21", quality: "product_flow" },
      candidate: { model: "gpt-image-2.5-sunburst-2026-09-08", quality: "explicit" },
    },
    assets,
    cases,
    batches: {
      smokeCaseIds: readyIds.slice(0, 6),
      calibrationCaseIds: readyIds.slice(0, 6),
      sequenceStarts: [
        { id: "sequence-nike", baseAssetId: "original-nike", edits: ["a", "b", "c"] },
        { id: "sequence-mtv", baseAssetId: "original-mtv", edits: ["a", "b", "c"] },
        { id: "sequence-absolut", baseAssetId: "original-absolut", edits: ["a", "b", "c"] },
      ],
    },
  });
}

function runCli(root) {
  return spawnSync(process.execPath, [script, "--binaries-root", root, "--catalog", join(root, "catalog.json")], {
    encoding: "utf8",
  });
}

test("live catalog parses and keeps results empty without authorizing spend", () => {
  const catalog = JSON.parse(readFileSync(liveCatalogPath, "utf8"));
  assert.equal(catalog.paidCallsAuthorized, false);
  assert.equal(catalog.sunburstPercent, 0);
  assert.equal(catalog.cases.length, 24);
  assert.equal(catalog.cases.filter((entry) => entry.status === "ready").length, 20);
  assert.equal(catalog.cases.filter((entry) => entry.status === "blocked").length, 4);
  assert.ok(catalog.cases.every((entry) => entry.result == null));
  assert.deepEqual(validateSunburstVisualCorpus(catalog), []);
});

test("ready catalog with matching binaries passes", () => {
  const root = fixtureRoot();
  const catalog = catalogFor(root);
  writeFileSync(join(root, "catalog.json"), JSON.stringify(catalog));
  assert.deepEqual(validateSunburstVisualCorpus(catalog, { binariesRoot: root }), []);
  const result = runCli(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ready=20 blocked=4/);
});

test("missing binary fails", () => {
  const root = fixtureRoot();
  const catalog = catalogFor(root);
  catalog.assets[0].path = "docs/commercial-studies/real-brands/originals/missing.jpg";
  writeFileSync(join(root, "catalog.json"), JSON.stringify(catalog));
  const result = runCli(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing binary/);
});

test("hash mismatch fails", () => {
  const root = fixtureRoot();
  const catalog = catalogFor(root);
  catalog.assets[0].sha256 = "0".repeat(64);
  writeFileSync(join(root, "catalog.json"), JSON.stringify(catalog));
  const result = runCli(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /sha256 mismatch/);
});

test("prefilled results and authorized spend are rejected", () => {
  const root = fixtureRoot();
  const catalog = catalogFor(root, (value) => {
    value.paidCallsAuthorized = true;
    value.cases[0].result = { callId: "invented" };
    return value;
  });
  const errors = validateSunburstVisualCorpus(catalog, { binariesRoot: root });
  assert.ok(errors.some((error) => /paidCallsAuthorized/.test(error)));
  assert.ok(errors.some((error) => /result must stay null/.test(error)));
});

test("blocked case without reason fails", () => {
  const root = fixtureRoot();
  const catalog = catalogFor(root);
  catalog.cases.find((entry) => entry.status === "blocked").blockedReason = "";
  const errors = validateSunburstVisualCorpus(catalog, { binariesRoot: root });
  assert.ok(errors.some((error) => /blockedReason/.test(error)));
});

test("path traversal is rejected", () => {
  const root = fixtureRoot();
  const catalog = catalogFor(root);
  catalog.assets[0].path = "../secret.jpg";
  const errors = validateSunburstVisualCorpus(catalog, { binariesRoot: root });
  assert.ok(errors.some((error) => /escapes binaries root/.test(error)));
});

test("script source never calls a provider", () => {
  const source = readFileSync(script, "utf8");
  assert.doesNotMatch(source, /openai/i);
  assert.doesNotMatch(source, /api\.openai\.com/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});

test("main reports a missing catalog", () => {
  const status = main(["--catalog", join(tmpdir(), "missing-sunburst-catalog.json")], { repoRoot });
  assert.equal(status, 1);
});
