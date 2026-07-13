#!/usr/bin/env node
/**
 * Generate a raw surface inventory for Convergence Phase 1 Gate 1.
 *
 * Scans dashboard pages, API routes, and UI CTA patterns including:
 *   - router.push / href literals
 *   - disabled controls (DropdownMenuItem, Button)
 *   - comingSoon titles
 *   - onClick handlers on disabled menu items
 *
 * Items with requiresDecision=true MUST have a matching entry in
 * surface-decisions.yaml (enforced by check-surface-inventory.mjs).
 *
 * Output: .planning/convergence/surface-inventory.raw.json
 */
import { createHash } from "node:crypto";
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
        id: `page:${route === "/" ? "/" : route.replace(/\/$/, "") || "/"}`,
        kind: "dashboard_page",
        route: route === "/" ? "/" : route.replace(/\/$/, "") || "/",
        file: relative(repoRoot, file).replace(/\\/g, "/"),
        requiresDecision: false,
      };
    }
  );
}

function listApiRoutes() {
  const root = join(appSrc, "app/api");
  return walk(root, (f) => f.endsWith("/route.ts")).map((file) => {
    const rel = relative(root, dirname(file)).replace(/\\/g, "/");
    return {
      id: `api:/api/${rel}`,
      kind: "api_route",
      route: `/api/${rel}`,
      file: relative(repoRoot, file).replace(/\\/g, "/"),
      requiresDecision: false,
    };
  });
}

function lineOf(text, index) {
  return text.slice(0, index).split(/\n/).length;
}

function extractCtas() {
  const uiRoots = [
    join(appSrc, "components"),
    join(appSrc, "app/(dashboard)"),
  ];
  const files = uiRoots.flatMap((root) =>
    walk(
      root,
      (f) =>
        (f.endsWith(".tsx") || f.endsWith(".ts")) &&
        !f.endsWith(".test.tsx") &&
        !f.endsWith(".test.ts")
    )
  );

  const ctas = [];
  const seen = new Set();

  function push(item) {
    const key = `${item.kind}|${item.file}|${item.line}|${item.destination ?? item.label ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    ctas.push(item);
  }

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const rel = relative(repoRoot, file).replace(/\\/g, "/");

    for (const re of [
      /router\.push\(\s*[`'"]([^`'"]+)[`'"]/g,
      /href=\{?[`'"]([^`'"]+)[`'"]\}?/g,
    ]) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(text)) !== null) {
        const dest = match[1];
        if (!dest.startsWith("/") && !dest.startsWith("http")) continue;
        const line = lineOf(text, match.index);
        push({
          id: `nav:${rel}:${line}`,
          kind: "cta_navigation",
          destination: dest,
          file: rel,
          line,
          evidence: `${rel}:${line}`,
          requiresDecision: false,
        });
      }
    }

    // Always-disabled / comingSoon controls — not busy/pending bindings.
    const inertPatterns = [
      {
        re: /<(DropdownMenuItem|Button)([^>]*\bdisabled(?:=\{true\})?(?!\s*=\{)[^>]*)>([\s\S]{0,400}?)<\/\1>/g,
        note: "always-disabled control",
      },
    ];

    for (const { re, note } of inertPatterns) {
      re.lastIndex = 0;
      let block;
      while ((block = re.exec(text)) !== null) {
        const attrs = block[2] || "";
        // Skip dynamic disabled={expr} except disabled={true}
        if (/\bdisabled=\{(?!true\})/.test(attrs)) continue;
        const body = block[3] || "";
        const line = lineOf(text, block.index);
        const hasComingSoon =
          /comingSoon/.test(attrs) ||
          /comingSoon/.test(body) ||
          /comingSoon/.test(text.slice(Math.max(0, block.index - 80), block.index + block[0].length + 80));
        const labelMatch =
          body.match(/\{t\(["']([^"']+)["']\)\}/) ||
          body.match(/>([^<{][^<]{0,40})</);
        push({
          id: `inert:${rel}:${line}`,
          kind: "cta_disabled",
          destination: null,
          file: rel,
          line,
          evidence: `${rel}:${line}`,
          label: labelMatch ? labelMatch[1].trim() : null,
          hasComingSoon,
          requiresDecision: true,
          note: hasComingSoon ? "disabled + comingSoon" : note,
        });
      }
    }

    // Bare disabled attribute on opening tag (no ={...})
    const bareDisabled =
      /<(DropdownMenuItem|Button)\b([^>]*\sdisabled(?:\s|>|\/)[^>]*)>/g;
    let bare;
    while ((bare = bareDisabled.exec(text)) !== null) {
      const attrs = bare[2] || "";
      if (/\bdisabled=\{/.test(attrs)) continue;
      const line = lineOf(text, bare.index);
      if (
        ctas.some(
          (c) =>
            c.file === rel &&
            Math.abs(c.line - line) <= 2 &&
            c.kind === "cta_disabled"
        )
      ) {
        continue;
      }
      const window = text.slice(bare.index, bare.index + 250);
      const hasComingSoon = /comingSoon/.test(window);
      push({
        id: `inert:${rel}:${line}`,
        kind: "cta_disabled",
        destination: null,
        file: rel,
        line,
        evidence: `${rel}:${line}`,
        requiresDecision: true,
        note: hasComingSoon ? "disabled + comingSoon" : "always-disabled control",
        hasComingSoon,
      });
    }

    // title={...comingSoon...}
    const comingSoonRe = /title=\{[^}]*comingSoon[^}]*\}/g;
    let cs;
    while ((cs = comingSoonRe.exec(text)) !== null) {
      const line = lineOf(text, cs.index);
      if (
        ctas.some(
          (c) =>
            c.file === rel &&
            Math.abs(c.line - line) <= 5 &&
            c.hasComingSoon
        )
      ) {
        continue;
      }
      push({
        id: `comingSoon:${rel}:${line}`,
        kind: "cta_disabled",
        destination: null,
        file: rel,
        line,
        evidence: `${rel}:${line}`,
        requiresDecision: true,
        note: "comingSoon title",
        hasComingSoon: true,
      });
    }
  }

  return ctas;
}

function contentFingerprint(pages, apis, ctas) {
  const payload = JSON.stringify({ pages, apis, ctas });
  return createHash("sha256").update(payload).digest("hex");
}

export function buildInventory() {
  const pages = listDashboardPages();
  const apis = listApiRoutes();
  const ctas = extractCtas();
  const fingerprint = contentFingerprint(pages, apis, ctas);
  return {
    generatedAt: new Date().toISOString(),
    schemaVersion: 2,
    fingerprint,
    counts: {
      dashboardPages: pages.length,
      apiRoutes: apis.length,
      ctas: ctas.length,
      requiringDecision: ctas.filter((c) => c.requiresDecision).length,
    },
    dashboardPages: pages,
    apiRoutes: apis,
    ctas,
  };
}

function main() {
  const inventory = buildInventory();
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(inventory, null, 2) + "\n");
  console.log(
    `surface-inventory: wrote ${outPath} (${inventory.counts.dashboardPages} pages, ${inventory.counts.apiRoutes} apis, ${inventory.counts.ctas} ctas, ${inventory.counts.requiringDecision} require decision)`
  );
}

const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}
