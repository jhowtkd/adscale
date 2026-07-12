#!/usr/bin/env node
/**
 * Generate a raw surface inventory for Convergence Phase 1 Gate 1.
 *
 * Scans:
 *   - dashboard page routes under app/src/app/(dashboard)
 *   - API route trees under app/src/app/api
 *   - CTA-like patterns (router.push, href=, getByRole button labels in key UI)
 *
 * Output: .planning/convergence/surface-inventory.raw.json
 * Humans classify decisions in surface-inventory.md — Gate 1 requires zero
 * undecided blockers (CTA with no consumer).
 *
 * Usage:
 *   node app/scripts/generate-surface-inventory.mjs
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const appSrc = resolve(repoRoot, "app/src");
const outDir = resolve(repoRoot, ".planning/convergence");
const outPath = join(outDir, "surface-inventory.raw.json");

function walk(dir, predicate) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      results.push(...walk(full, predicate));
    } else if (predicate(full)) {
      results.push(full);
    }
  }
  return results;
}

function listDashboardPages() {
  const root = join(appSrc, "app/(dashboard)");
  return walk(root, (f) => f.endsWith("/page.tsx") || f.endsWith("/page.ts")).map(
    (file) => {
      const rel = relative(join(appSrc, "app/(dashboard)"), file)
        .replace(/\\/g, "/")
        .replace(/\/page\.tsx?$/, "");
      const route = "/" + (rel === "page" || rel === "" ? "" : rel)
        .replace(/\/page$/, "")
        .replace(/\[([^\]]+)\]/g, ":$1");
      return {
        kind: "dashboard_page",
        route: route === "/" ? "/" : route.replace(/\/$/, "") || "/",
        file: relative(repoRoot, file).replace(/\\/g, "/"),
      };
    }
  );
}

function listApiRoutes() {
  const root = join(appSrc, "app/api");
  return walk(root, (f) => f.endsWith("/route.ts")).map((file) => {
    const rel = relative(root, dirname(file)).replace(/\\/g, "/");
    return {
      kind: "api_route",
      route: `/api/${rel}`,
      file: relative(repoRoot, file).replace(/\\/g, "/"),
    };
  });
}

function extractCtas() {
  const uiRoots = [
    join(appSrc, "components"),
    join(appSrc, "app/(dashboard)"),
  ];
  const files = uiRoots.flatMap((root) =>
    walk(root, (f) => f.endsWith(".tsx") || f.endsWith(".ts"))
  );

  const ctas = [];
  const pushPatterns = [
    /router\.push\(\s*[`'"]([^`'"]+)[`'"]/g,
    /href=\{?[`'"]([^`'"]+)[`'"]\}?/g,
  ];

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const rel = relative(repoRoot, file).replace(/\\/g, "/");
    for (const re of pushPatterns) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(text)) !== null) {
        const dest = match[1];
        if (!dest.startsWith("/") && !dest.startsWith("http")) continue;
        const line = text.slice(0, match.index).split(/\n/).length;
        ctas.push({
          kind: "cta_navigation",
          destination: dest,
          file: rel,
          line,
          evidence: `${rel}:${line}`,
        });
      }
    }

    // Disabled / comingSoon CTAs (likely inert)
    if (/comingSoon|disabled\s*\n?\s*title=\{/.test(text) || /disabled\s*\n/.test(text)) {
      const disabledMatches = [
        ...text.matchAll(/disabled(?:=\{[^}]+\})?[\s\S]{0,80}?(comingSoon|title=\{)/g),
      ];
      for (const m of disabledMatches) {
        const line = text.slice(0, m.index).split(/\n/).length;
        ctas.push({
          kind: "cta_disabled",
          destination: null,
          file: rel,
          line,
          evidence: `${rel}:${line}`,
          note: "disabled or comingSoon nearby",
        });
      }
    }
  }

  return ctas;
}

function main() {
  const pages = listDashboardPages();
  const apis = listApiRoutes();
  const ctas = extractCtas();

  const inventory = {
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    counts: {
      dashboardPages: pages.length,
      apiRoutes: apis.length,
      ctas: ctas.length,
    },
    dashboardPages: pages,
    apiRoutes: apis,
    ctas,
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(inventory, null, 2) + "\n");
  console.log(
    `surface-inventory: wrote ${outPath} (${pages.length} pages, ${apis.length} apis, ${ctas.length} ctas)`
  );
}

main();
