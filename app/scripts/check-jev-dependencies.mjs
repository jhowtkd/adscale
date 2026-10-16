/** Executable import closure, using TS resolution and excluding erased type imports. */
import ts from "typescript";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(appRoot, "src");
const config = ts.readConfigFile(resolve(appRoot, "tsconfig.json"), ts.sys.readFile);
const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, appRoot);
const cache = new Map();
const normalize = (file) => file.startsWith("npm:") ? file : relative(appRoot, file).replaceAll("\\", "/");

function executableImports(file) {
  if (file.startsWith("npm:")) return [];
  if (cache.has(file)) return cache.get(file);
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const edges = [];
  const add = (specifier) => {
    const local = specifier.startsWith(".") || specifier.startsWith("@/");
    if (!local) { edges.push(`npm:${specifier}`); return; }
    const target = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule?.resolvedFileName;
    if (!target) throw new Error(`Unresolved local import: ${normalize(file)} -> ${specifier}`);
    if (!target.endsWith(".d.ts")) edges.push(target);
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
      else throw new Error(`Non-literal executable import: ${normalize(file)}`);
    } else if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression;
      if (expression && ts.isStringLiteral(expression)) add(expression.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  cache.set(file, edges);
  return edges;
}

function closure(root, forbidden) {
  const visited = new Set();
  const pending = [[root]];
  while (pending.length) {
    const path = pending.pop();
    const current = path.at(-1);
    if (visited.has(current)) continue;
    visited.add(current);
    if (forbidden(normalize(current))) throw new Error(path.map(normalize).join(" -> "));
    for (const dependency of executableImports(current)) pending.push([...path, dependency]);
  }
  return visited.size;
}

export function checkJevDependencies() {
  cache.clear();
  const pilot = (file) => /(?:^|\/)semantic-review[^/]*\.[cm]?[jt]sx?$/.test(file);
  const commands = readdirSync(resolve(sourceRoot, "server/application"))
    .filter((name) => name.endsWith(".ts") && !name.includes(".test."))
    .map((name) => resolve(sourceRoot, "server/application", name));
  const protectedJobs = ["creative-work", "creative-work-carousel", "creative-work-layerization",
    "creative-work-layer-regeneration", "creative-work-source", "derivation", "image-worker-entry"];
  const protectedModules = ["creative-work/fact-pack", "creative-work/briefing-check", "creative-work/copy",
    "creative-work/prepared-plan", "generation/settlement-adapters"];
  const roots = [...commands, ...protectedJobs.map((name) => resolve(sourceRoot, `server/jobs/${name}.ts`)),
    ...protectedModules.map((name) => resolve(sourceRoot, `server/${name}.ts`))];
  for (const root of roots) closure(root, pilot);
  // Pure projection/validation and the existing diagnostic journal are allowed.
  // Business commands, billing and creative/learning executors are not.
  const businessEffect = (file) => /^src\/server\/(application|billing|generation|output-learning|memory)\//.test(file)
    || /^npm:(stripe|openai|@anthropic-ai\/sdk|mem0ai)(\/|$)/.test(file)
    || /^src\/server\/repositories\/(usage|credit-transactions|selection-decisions|output-decision-event)\./.test(file)
    || /^src\/server\/ai\/(image-generation|pipeline|providers|openai-text-client|text-client|model-call-observer)(\/|\.)/.test(file)
    || /^src\/server\/jobs\/(creative-work|derivation|image-worker|selection-effects|brand-memory|learning-proposal)/.test(file);
  const pilotRoots = ["src/server/jobs/semantic-review.ts",
    "src/server/creative-work/semantic-review-collector.ts", "src/server/creative-work/semantic-review-processor.ts",
    "src/server/creative-work/semantic-review-retention-repository.ts"];
  const pilotFiles = new Set();
  for (const root of pilotRoots) {
    const absolute = resolve(appRoot, root);
    closure(absolute, businessEffect);
    const pending = [absolute];
    while (pending.length) {
      const file = pending.pop();
      if (pilotFiles.has(file)) continue;
      if (!file.startsWith("npm:")) pilotFiles.add(file);
      else continue;
      pending.push(...executableImports(file));
    }
  }
  return { protectedRoots: roots.length, pilotExecutableFiles: pilotFiles.size, violations: 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log("JEV-DEPENDENCIES:", JSON.stringify(checkJevDependencies())); }
  catch (error) { console.error("JEV-DEPENDENCIES:", error.message); process.exitCode = 1; }
}
