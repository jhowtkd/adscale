/** Audited executable closure; new dependencies require explicit review. */
import ts from "typescript";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ownAppRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const JOB = "src/server/jobs/semantic-review.ts";
const ROUTE = "src/app/api/inngest/route.ts";
// Audited: projection/contracts, pilot persistence/evaluation, private-file tooling,
// synthetic test-DB CLIs, existing journal/logger,
// DB wiring and Inngest registration. credit-units and equipe/agents/provider
// contain constants/pure resolution. No business executor belongs here.
// Exact files and package specifiers; adding one requires explicit review.
const ALLOWED_FILES = new Set([
  "scripts/jev-authorized.ts",
  "scripts/jev-collect.ts",
  "scripts/jev-decide.ts",
  "scripts/jev-decision-evidence.ts",
  "scripts/jev-decision-evaluation.ts",
  "scripts/jev-evaluate-demo.ts",
  "scripts/jev-evaluate.ts",
  "scripts/jev-process.ts",
  "scripts/jev-retain.ts",
  "scripts/run-jev-offline.ts",
  "src/lib/billing/credit-units.ts",
  "src/lib/creative-work-protocol-eligibility.ts",
  "src/lib/logger.ts",
  "src/lib/redact-telemetry.ts",
  "src/server/creative-work/art-refinement.ts",
  "src/server/creative-work/briefing-check.ts",
  "src/server/creative-work/canonical-json.ts",
  "src/server/creative-work/carousel-contracts.ts",
  "src/server/creative-work/carousel-editorial-state.ts",
  "src/server/creative-work/commercial-offer.ts",
  "src/server/creative-work/contracts.ts",
  "src/server/creative-work/fact-pack.ts",
  "src/server/creative-work/piece-reference.ts",
  "src/server/creative-work/placement-policy.ts",
  "src/server/creative-work/prepared-plan.ts",
  "src/server/creative-work/semantic-review-collection.pg-helpers.ts",
  "src/server/creative-work/semantic-review-collector.ts",
  "src/server/creative-work/semantic-review-diagnostics.ts",
  "src/server/creative-work/semantic-review-evaluation.ts",
  "src/server/creative-work/semantic-review-export-authorization.ts",
  "src/server/creative-work/semantic-review-export-repository.ts",
  "src/server/creative-work/semantic-review-http.ts",
  "src/server/creative-work/semantic-review-metrics.ts",
  "src/server/creative-work/semantic-review-offline.ts",
  "src/server/creative-work/semantic-review-processing-repository.ts",
  "src/server/creative-work/semantic-review-processor.ts",
  "src/server/creative-work/semantic-review-repository.ts",
  "src/server/creative-work/semantic-review-retention-repository.ts",
  "src/server/db/equipe-schema.ts",
  "src/server/db/index.ts",
  "src/server/db/schema.ts",
  "src/server/diagnostics/capture-enabled.ts",
  "src/server/diagnostics/context.ts",
  "src/server/diagnostics/contract.ts",
  "src/server/diagnostics/journal.ts",
  "src/server/equipe/agents/provider.ts",
  "src/server/jobs/client.ts",
  "src/server/jobs/inngest-runtime.ts",
  "src/server/jobs/semantic-review.ts",
  "src/server/jobs/sentry-middleware.ts",
  "src/server/validation/env.ts"
]);
const ALLOWED_PACKAGES = new Set([
  "@sentry/nextjs",
  "drizzle-orm",
  "drizzle-orm/node-postgres",
  "drizzle-orm/pg-core",
  "inngest",
  "node:async_hooks",
  "node:child_process",
  "node:crypto",
  "node:fs",
  "node:os",
  "node:path",
  "node:url",
  "pg",
  "server-only",
  "zod"
]);

const pilot = (file) => file === JOB || /^src\/server\/creative-work\/semantic-review[^/]*\.ts$/.test(file);
const productionSource = (file) => /\.[cm]?[jt]sx?$/.test(file)
  && !/(?:^|\/)(?:__tests__|tests)(?:\/|$)|\.(?:test|spec|pg-helpers)\.|\.d\.ts$/.test(file);
function walk(directory, appRoot) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path, appRoot) : productionSource(relative(appRoot, path)) ? [path] : [];
  });
}

export function checkJevDependencies({ appRoot = ownAppRoot } = {}) {
  const normalize = (file) => file.startsWith("npm:") ? file : relative(appRoot, file).replaceAll("\\", "/");
  const config = ts.readConfigFile(resolve(appRoot, "tsconfig.json"), ts.sys.readFile);
  if (config.error) throw new Error("Cannot read dependency gate tsconfig");
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, appRoot);
  const cache = new Map();
  function imports(file) {
    if (cache.has(file)) return cache.get(file);
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const result = { edges: [], unresolved: [] };
    const add = (specifier) => {
      if (!specifier.startsWith(".") && !specifier.startsWith("@/")) { result.edges.push(`npm:${specifier}`); return; }
      const target = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule?.resolvedFileName;
      if (!target) result.unresolved.push(specifier);
      else if (!target.endsWith(".d.ts")) result.edges.push(target);
    };
    const visit = (node) => {
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        if (clause?.isTypeOnly) return;
        if (clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings)
          && clause.namedBindings.elements.length && clause.namedBindings.elements.every((entry) => entry.isTypeOnly)) return;
        add(node.moduleSpecifier.text);
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        if (node.isTypeOnly || (node.exportClause && ts.isNamedExports(node.exportClause)
          && node.exportClause.elements.length && node.exportClause.elements.every((entry) => entry.isTypeOnly))) return;
        add(node.moduleSpecifier.text);
      } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteralLike(argument)) add(argument.text);
        else result.unresolved.push("non-literal executable import");
      } else if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference)) {
        const expression = node.moduleReference.expression;
        if (expression && ts.isStringLiteral(expression)) add(expression.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    cache.set(file, result);
    return result;
  }

  const sources = walk(resolve(appRoot, "src"), appRoot);
  const protectedFiles = sources.filter((file) => !pilot(normalize(file))).length;
  const route = resolve(appRoot, ROUTE);
  if (!sources.includes(route) || !imports(route).edges.includes(resolve(appRoot, JOB))) {
    throw new Error("Missing observer job import in the served Inngest route");
  }
  if (!protectedFiles) throw new Error("Missing protected production sources");
  const scriptsRoot = resolve(appRoot, "scripts");
  const scripts = existsSync(scriptsRoot) ? walk(scriptsRoot, appRoot)
    .filter((file) => /^scripts\/jev-[^/]*\.ts$/.test(normalize(file))) : [];
  const roots = [...sources.filter((file) => pilot(normalize(file))), ...scripts];
  const localFiles = new Set();
  const packages = new Set();
  const pending = roots.map((root) => [root]);
  while (pending.length) {
    const path = pending.pop();
    const file = path.at(-1);
    const name = normalize(file);
    if (file.startsWith("npm:")) {
      if (!ALLOWED_PACKAGES.has(file.slice(4))) throw new Error(`Unreviewed pilot dependency: ${path.map(normalize).join(" -> ")}`);
      packages.add(file.slice(4));
      continue;
    }
    if (localFiles.has(file)) continue;
    if (!ALLOWED_FILES.has(name)) throw new Error(`Unreviewed pilot dependency: ${path.map(normalize).join(" -> ")}`);
    localFiles.add(file);
    const { edges, unresolved } = imports(file);
    if (unresolved.length) throw new Error(`Unresolved pilot dependency: ${name} -> ${unresolved.join(", ")}`);
    for (const dependency of edges) pending.push([...path, dependency]);
  }

  // Invert all production source imports; only internals and the served route
  // may reach the pilot. Continue through the route to catch its importers too.
  const parents = new Map();
  for (const file of new Set([...sources, ...localFiles])) {
    for (const target of imports(file).edges) {
      if (target.startsWith("npm:")) continue;
      if (!parents.has(target)) parents.set(target, []);
      parents.get(target).push(file);
    }
  }
  const visited = new Set();
  const affected = [...new Set([...roots, ...[...parents.keys()].filter((file) => pilot(normalize(file)))])]
    .map((file) => [file]);
  while (affected.length) {
    const path = affected.pop();
    const file = path[0];
    if (visited.has(file)) continue;
    visited.add(file);
    const name = normalize(file);
    const internalScript = name.startsWith("scripts/") && ALLOWED_FILES.has(name);
    if (!pilot(name) && !internalScript && name !== ROUTE) throw new Error(`Protected source imports pilot: ${path.map(normalize).join(" -> ")}`);
    for (const parent of parents.get(file) ?? []) affected.push([parent, ...path]);
  }
  return { protectedFiles, pilotExecutableFiles: localFiles.size, pilotPackages: packages.size, violations: 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log("JEV-DEPENDENCIES:", JSON.stringify(checkJevDependencies())); }
  catch (error) { console.error("JEV-DEPENDENCIES:", error.message); process.exitCode = 1; }
}
