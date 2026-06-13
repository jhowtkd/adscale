#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const ownershipPath = resolve(
  repoRoot,
  ".planning/phases/109-visual-foundations-and-baseline/109-OWNERSHIP.md",
);
const dashboardRoot = resolve(repoRoot, "app/src/app/(dashboard)");
const componentsRoot = resolve(repoRoot, "app/src/components");
const validOwners = new Set(["109", "110", "111", "112", "113"]);
const exceptionOwners = new Set(["no visual migration", "out of milestone"]);
const excludedVisibleFiles = [
  /\.test\.tsx$/,
  /\.spec\.tsx$/,
];

function fail(messages) {
  for (const message of messages) console.error(`OWNERSHIP: ${message}`);
  process.exitCode = 1;
}

function walk(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function parseTable(source, heading) {
  const marker = `## ${heading}`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`missing section ${heading}`);
  const section = source.slice(start + marker.length).split(/^## /m)[0];
  const lines = section.split("\n").filter((line) => line.startsWith("|"));
  if (lines.length < 3) throw new Error(`missing table rows in ${heading}`);
  const cells = (line) => line
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map((value) => value.replaceAll("\\|", "|").trim());
  const headers = cells(lines[0]);
  return lines.slice(2).map((line) => {
    const values = cells(line);
    if (values.length !== headers.length) {
      throw new Error(`malformed ${heading} row: ${line}`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function plain(value) {
  return value.replace(/^`|`$/g, "").trim();
}

function routeFromFile(path) {
  const rel = relative(dashboardRoot, path).replaceAll("\\", "/");
  if (rel === "layout.tsx") return "authenticated layout";
  const directory = rel.replace(/\/page\.tsx$/, "");
  return directory === "page.tsx" ? "/" : `/${directory}`;
}

function regexFromMatcher(value) {
  const matcher = plain(value);
  if (!matcher.startsWith("re:")) throw new Error(`family matcher must start with re:: ${matcher}`);
  return new RegExp(matcher.slice(3));
}

function duplicates(values) {
  const seen = new Set();
  return [...new Set(values.filter((value) => seen.has(value) || !seen.add(value)))];
}

try {
  const source = readFileSync(ownershipPath, "utf8");
  const routes = parseTable(source, "Authenticated Routes");
  const families = parseTable(source, "Visible Component Families");
  const scenarios = parseTable(source, "Phase 114 Scenario Catalog");
  const errors = [];

  for (const [name, rows] of [["route", routes], ["family", families]]) {
    for (const field of ["ID", "Matcher", "Owner", "Boundary", "Rationale", "Phase 114 Scenario"]) {
      for (const row of rows) {
        if (!row[field]?.trim()) errors.push(`${name} ${row.ID || "<unknown>"} has empty ${field}`);
      }
    }
    for (const id of duplicates(rows.map((row) => row.ID))) errors.push(`duplicate ${name} ID ${id}`);
    for (const matcher of duplicates(rows.map((row) => row.Matcher))) errors.push(`duplicate ${name} matcher ${matcher}`);
  }

  const scenarioIds = new Set(scenarios.map((row) => row.ID));
  for (const id of duplicates(scenarios.map((row) => row.ID))) errors.push(`duplicate scenario ID ${id}`);
  for (const scenario of scenarios) {
    if (!scenario.ID || !scenario["Observable Browser State"]) errors.push("scenario row has empty fields");
  }

  for (const row of [...routes, ...families]) {
    const owner = plain(row.Owner);
    if (owner === "114" || /phase\s*114/i.test(owner)) errors.push(`${row.ID} incorrectly assigns implementation to Phase 114`);
    if (!validOwners.has(owner) && !exceptionOwners.has(owner)) errors.push(`${row.ID} has invalid owner ${owner}`);
    if (exceptionOwners.has(owner) && !row.Rationale.trim()) errors.push(`${row.ID} exception requires rationale`);
    if (!scenarioIds.has(row["Phase 114 Scenario"])) {
      errors.push(`${row.ID} references missing scenario ${row["Phase 114 Scenario"]}`);
    }
  }

  const liveRoutes = walk(dashboardRoot)
    .filter((path) => /\/(page|layout)\.tsx$/.test(path))
    .map(routeFromFile)
    .sort();
  const inventoriedRoutes = routes.map((row) => plain(row.Matcher)).sort();
  for (const route of liveRoutes) {
    const count = inventoriedRoutes.filter((candidate) => candidate === route).length;
    if (count !== 1) errors.push(`live authenticated route ${route} has ${count} ownership rows`);
  }
  for (const route of inventoriedRoutes) {
    if (!liveRoutes.includes(route)) errors.push(`inventoried route ${route} has no live page/layout file`);
  }

  const compiledFamilies = families.map((row) => ({ row, regex: regexFromMatcher(row.Matcher) }));
  const visibleFiles = walk(componentsRoot)
    .filter((path) => path.endsWith(".tsx"))
    .map((path) => relative(repoRoot, path).replaceAll("\\", "/"))
    .filter((path) => !excludedVisibleFiles.some((pattern) => pattern.test(path)))
    .sort();

  for (const file of visibleFiles) {
    const matches = compiledFamilies.filter(({ regex }) => regex.test(file));
    if (matches.length !== 1) {
      errors.push(`${file} has ${matches.length} family owners${matches.length ? `: ${matches.map(({ row }) => row.ID).join(", ")}` : ""}`);
    }
  }
  for (const { row, regex } of compiledFamilies) {
    if (!visibleFiles.some((file) => regex.test(file))) errors.push(`${row.ID} matcher classifies no visible source file`);
  }

  const liveTopLevelFamilies = new Set(visibleFiles.map((file) => file.split("/")[3]));
  for (const family of liveTopLevelFamilies) {
    if (!compiledFamilies.some(({ regex }) => visibleFiles.some((file) => file.split("/")[3] === family && regex.test(file)))) {
      errors.push(`new visible top-level family ${family} is unclassified`);
    }
  }

  if (errors.length) fail(errors);
  else {
    console.log(
      `Visual ownership complete: ${routes.length} routes, ${families.length} families, ${scenarios.length} Phase 114 scenarios, ${visibleFiles.length} visible files.`,
    );
  }
} catch (error) {
  fail([error instanceof Error ? error.message : String(error)]);
}
