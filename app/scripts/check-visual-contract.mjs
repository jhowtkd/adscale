#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const stylesheetPath = resolve(repoRoot, "app/src/app/globals.css");
const visualRoleDebtPath = resolve(scriptDir, "visual-role-debt.json");
export const LEGACY_DEBT_BASELINE_REVISION = "dda6504d2a0ad577662d6a262c6847504a5f3d8b";
export const LEGACY_DEBT_BASELINE_DIGEST = "aa61e78162e0b7de3dae0cb7ac3588682ab52f5165e7b1d5c473a036721d77df";

export const CANONICAL_THEME_TOKENS = [
  "canvas", "surface-base", "surface-raised", "surface-inset", "surface-overlay",
  "text-primary", "text-secondary", "text-muted", "text-disabled", "text-on-accent",
  "border-subtle", "border-default", "border-strong", "focus-ring",
  "accent-primary", "accent-primary-hover", "accent-primary-subtle", "accent-primary-text",
  "action-primary-bg", "action-primary-hover", "action-primary-text",
  "selection-bg", "selection-border", "selection-text",
  "active-navigation-bg", "active-navigation-text", "utility-icon",
  ...["neutral", "success", "warning", "danger", "info"].flatMap((state) =>
    ["bg", "border", "text", "dot"].map((role) => `${state}-${role}`)),
];

export const CANONICAL_GLOBAL_TOKENS = [
  ...Array.from({ length: 7 }, (_, index) => `space-${index + 1}`),
  "control-sm", "control-md", "control-lg", "control-touch",
  "text-caption", "text-label", "text-body", "text-body-lg", "text-section", "text-page", "text-display",
  "radius-control", "radius-panel", "radius-object", "radius-overlay", "radius-pill",
  "duration-fast", "duration-default", "duration-slow", "ease-product", "ease-emphasized",
  "shadow-floating", "shadow-overlay",
  "shell-topbar-mobile", "shell-topbar-desktop", "shell-sidebar-expanded", "shell-sidebar-rail",
  "shell-bottom-nav", "shell-sticky-gap", "shell-safe-bottom",
  "page-gutter-mobile", "page-gutter-tablet", "page-gutter-desktop", "page-gutter-wide",
  "content-reading", "content-form", "content-operational", "content-workspace", "content-wide",
  "layer-base", "layer-raised", "layer-sticky", "layer-shell", "layer-shell-floating",
  "layer-popover", "layer-backdrop", "layer-overlay", "layer-toast", "layer-tour", "layer-skip-link",
];
const LAYER_TOKENS = CANONICAL_GLOBAL_TOKENS.filter((token) => token.startsWith("layer-"));
const GEOMETRY_TOKENS = CANONICAL_GLOBAL_TOKENS.filter((token) => !token.startsWith("layer-"));

export const COMPATIBILITY_ALIASES = new Map([
  ["deep-bg", "canvas"], ["border-dim", "border-subtle"], ["border-medium", "border-default"],
  ["ghost", "text-muted"], ["accent-secondary", "neutral-text"],
]);
export const ROLE_TOKEN_ALIASES = new Map([
  ["action-primary-bg", "accent-primary"], ["action-primary-hover", "accent-primary-hover"], ["action-primary-text", "text-on-accent"],
  ["selection-bg", "neutral-bg"], ["selection-border", "neutral-border"], ["selection-text", "neutral-text"],
  ["active-navigation-bg", "neutral-bg"], ["active-navigation-text", "text-primary"], ["utility-icon", "text-muted"],
]);

const APPROVED_EXTERNAL_VARIABLES = new Set([
  "font-inter", "font-space-mono", "font-press-start",
]);
const RAW_LAYER = /(?<![\w-])(?:-?z-(?:\[(?!var\(--layer-)[^\]]+\]|\d+))/g;
const ARBITRARY_DIALECT = /(?:text-\[(?:\d|clamp\(|calc\()[^\]]*\]|rounded-\[(?:\d|clamp\(|calc\()[^\]]*\])/g;
const TAILWIND_COLOR_TARGET = "(?:bg|text|border|ring|accent|fill|stroke|from|via|to)";
const RAW_COLOR_FUNCTION_NAME = "(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)";
const VISUAL_ROLE = new RegExp(
  String.raw`var\(--(?:accent-primary(?:-(?:hover|subtle|text))?|accent-(?:green(?:-(?:light|dark|text|on-fill|dim))?|blue(?:-(?:light|dim))?|teal|purple|mint(?:-(?:light|dim))?|amber|rose)|pale|cream|color-(?:primary|sidebar-primary)(?:-foreground)?)\)|(?<![\w-])(?:(?:[\w-]+(?:-\[[^\]]+\])?|\[[^\]]+\]):)*${TAILWIND_COLOR_TARGET}-primary(?:-[\w-]+)?(?:\/(?:\[[^\]]+\]|[\w.-]+))?(?![\w-])`,
  "g",
);
const TAILWIND_VARIANT = "(?:(?:[\\w-]+(?:-\\[[^\\]]+\\])?|\\[[^\\]]+\\]):)*";
const TAILWIND_NAMED_HUE = new RegExp(
  `(?<![\\w-])${TAILWIND_VARIANT}${TAILWIND_COLOR_TARGET}-(?:red|green|emerald|lime|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|orange|amber|yellow)(?:-\\d{1,3})?(?:\\/(?:\\[[^\\]]+\\]|[\\w.-]+))?(?![\\w-])`,
  "g",
);
const TAILWIND_ARBITRARY_COLOR = new RegExp(
  `(?<![\\w-])${TAILWIND_VARIANT}${TAILWIND_COLOR_TARGET}-\\[([^\\]]+)\\](?:\\/(?:\\[[^\\]]+\\]|[\\w.-]+))?(?![\\w-])`,
  "gi",
);
const CSS_NAMED_COLOR = new Set("black blue brown cyan gold gray green indigo lime magenta maroon navy olive orange pink purple red silver teal violet white yellow".split(" "));
const RAW_HEX = /#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})(?![\da-f])/i;
const RAW_COLOR_FUNCTION = new RegExp(`\\b${RAW_COLOR_FUNCTION_NAME}\\(`, "i");
const GRADIENT_START = /\b(?:repeating-)?(?:linear|radial|conic)-gradient\(/gi;
const SOURCE_ROOTS = ["app/src"];
const LEGACY_DEBT_LIMITS = {
  rawLayer: 25,
  // origin/main dda6504d has 244 occurrence-exact entries; the prior 214 cap
  // deduplicated identical same-line contexts and was not the true benchmark.
  arbitraryDialect: 244,
};

// Exact legacy occurrences captured from dda6504d. Entries are fingerprints, not
// counts: deleting source debt is allowed, but changing the reference is not.
function loadLegacyDebtManifest() {
  if (!existsSync(visualRoleDebtPath)) return { entries: [] };
  const content = readFileSync(visualRoleDebtPath, "utf8").trim();
  if (!content) return { entries: [] };
  const parsed = JSON.parse(content);
  return Array.isArray(parsed) ? { entries: parsed } : { ...parsed, entries: parsed.entries ?? [] };
}

const LEGACY_DEBT_MANIFEST = loadLegacyDebtManifest();
const LEGACY_DEBT_ENTRIES = LEGACY_DEBT_MANIFEST.entries;
const LEGACY_DEBT_FINGERPRINTS = new Set(LEGACY_DEBT_ENTRIES.map(({ rule, file, match, occurrence }) => legacyFingerprint(rule, file, match, occurrence)));

function diagnostic(code, message, file) {
  return { code, message, ...(file ? { file } : {}) };
}

function compareCanonical(left, right) {
  return left === right ? 0 : left < right ? -1 : 1;
}

export function canonicalLegacyDebtEntries(entries) {
  return [...entries]
    .map(({ rule, file, match, occurrence }) => ({ rule, file, match, occurrence }))
    .sort((left, right) => compareCanonical(left.rule, right.rule)
      || compareCanonical(left.file, right.file)
      || compareCanonical(left.match, right.match)
      || left.occurrence - right.occurrence)
    .map(JSON.stringify)
    .join("\n");
}

export function legacyDebtDigest(entries) {
  return createHash("sha256").update(canonicalLegacyDebtEntries(entries)).digest("hex");
}

export function validateLegacyDebtEntries(entries = LEGACY_DEBT_ENTRIES, immutableFingerprints = LEGACY_DEBT_FINGERPRINTS) {
  const diagnostics = entries.flatMap(({ rule, file, match, occurrence }) => {
    if (rule === "visualRole") return [diagnostic(
      "FORBIDDEN_VISUAL_ROLE_BASELINE",
      "visualRole baseline entries are forbidden; the token scan is always strict",
      file,
    )];
    if (["rawLayer", "arbitraryDialect"].includes(rule) && (!Number.isInteger(occurrence) || occurrence < 1)) {
      return [diagnostic("INVALID_DEBT_OCCURRENCE", `${rule} baseline entries need a positive occurrence ordinal`, file)];
    }
    if (!["rawLayer", "arbitraryDialect"].includes(rule)) {
      return [diagnostic("INVALID_DEBT_RULE", `${rule} is not an allowlisted legacy debt rule`, file)];
    }
    if (typeof match !== "string" || !match) {
      return [diagnostic("INVALID_DEBT_MATCH", `${rule} baseline entries need an exact matched debt token`, file)];
    }
    return [];
  });
  const fingerprints = new Set();
  for (const entry of entries) {
    if (!["rawLayer", "arbitraryDialect"].includes(entry.rule) || !Number.isInteger(entry.occurrence)) continue;
    const fingerprint = legacyFingerprint(entry.rule, entry.file, entry.match, entry.occurrence);
    if (fingerprints.has(fingerprint)) diagnostics.push(diagnostic("DUPLICATE_DEBT_FINGERPRINT", "baseline entries must identify distinct occurrences", entry.file));
    fingerprints.add(fingerprint);
    if (!immutableFingerprints.has(fingerprint)) {
      diagnostics.push(diagnostic("UNKNOWN_IMMUTABLE_DEBT_FINGERPRINT", "baseline entry is not in the immutable origin snapshot", entry.file));
    }
  }
  for (const [rule, limit] of Object.entries(LEGACY_DEBT_LIMITS)) {
    const count = entries.filter((entry) => entry.rule === rule).length;
    if (count > limit) {
      diagnostics.push(diagnostic(
        "DEBT_BASELINE_INCREASE",
        `${rule} baseline has ${count} entries; maximum is ${limit}`,
      ));
    }
  }
  return diagnostics;
}

export function validateLegacyDebtManifest(manifest = LEGACY_DEBT_MANIFEST) {
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  const diagnostics = [];
  if (manifest.baselineRevision !== LEGACY_DEBT_BASELINE_REVISION) {
    diagnostics.push(diagnostic("IMMUTABLE_BASELINE_REVISION_MISMATCH", `baselineRevision must be ${LEGACY_DEBT_BASELINE_REVISION}`));
  }
  if (manifest.baselineDigest !== LEGACY_DEBT_BASELINE_DIGEST || legacyDebtDigest(entries) !== LEGACY_DEBT_BASELINE_DIGEST) {
    diagnostics.push(diagnostic("IMMUTABLE_BASELINE_DIGEST_MISMATCH", "baseline entries do not match the immutable origin snapshot"));
  }
  return [...diagnostics, ...validateLegacyDebtEntries(entries)];
}

function blockForSelector(css, selector) {
  const selectorPattern = new RegExp(`(?:^|\\n)\\s*${selector.replace(".", "\\.")}\\s*\\{`, "m");
  const match = selectorPattern.exec(css);
  if (!match) return null;
  const open = css.indexOf("{", match.index);
  if (open === -1) return null;
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(open + 1, index);
  }
  return null;
}

export function parseCustomProperties(css) {
  const braces = [...css].reduce((depth, character) => depth + (character === "{" ? 1 : character === "}" ? -1 : 0), 0);
  if (braces !== 0 || /--[\w-]+\s*:[^;{}]+(?=})/.test(css)) {
    throw new Error("MALFORMED_CSS: unbalanced braces or missing declaration terminator");
  }
  const declarations = new Map();
  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/gi)) {
    const values = declarations.get(match[1]) ?? [];
    values.push(match[2].trim());
    declarations.set(match[1], values);
  }
  const references = [...css.matchAll(/var\((--[a-z0-9-]+)(?:\s*,[^)]*)?\)/gi)].map((match) => match[1]);
  return { declarations, references };
}

function themeDeclarations(css, selector) {
  const block = blockForSelector(css, selector);
  if (block == null) return new Map();
  return parseCustomProperties(`x{${block}}`).declarations;
}

function occurrenceContext(content, index) {
  const lineStart = content.lastIndexOf("\n", index) + 1;
  const lineEnd = content.indexOf("\n", index);
  return content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd).trim().replace(/\s+/g, " ");
}

export function legacyFingerprint(rule, file, match, occurrence = 1) {
  return `${rule}:${createHash("sha256").update(`${rule}\0${file}\0${match}\0${occurrence}`).digest("hex").slice(0, 16)}`;
}

function checksForSection(section) {
  const visualRoleChecks = [
    ["visualRole", VISUAL_ROLE, "DIRECT_VISUAL_ROLE"],
    ["visualRole", TAILWIND_NAMED_HUE, "DIRECT_VISUAL_ROLE"],
    ["visualRole", TAILWIND_ARBITRARY_COLOR, "DIRECT_VISUAL_ROLE"],
  ];
  return section === "tokens" ? visualRoleChecks
    : section === "layers" ? [["rawLayer", RAW_LAYER, "RAW_GLOBAL_LAYER"]]
      : section === "dialect" ? [["arbitraryDialect", ARBITRARY_DIALECT, "ARBITRARY_VISUAL_DIALECT"]]
        : [...visualRoleChecks, ["rawLayer", RAW_LAYER, "RAW_GLOBAL_LAYER"], ["arbitraryDialect", ARBITRARY_DIALECT, "ARBITRARY_VISUAL_DIALECT"]];
}

function isArbitraryColor(value) {
  const color = value.trim().replace(/^color:/i, "");
  return /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(color)
    || new RegExp(`^${RAW_COLOR_FUNCTION_NAME}\\(.+\\)$`, "i").test(color)
    || CSS_NAMED_COLOR.has(color.toLowerCase());
}

function skipQuoted(content, index) {
  const quote = content[index];
  for (index += 1; index < content.length; index += 1) {
    if (content[index] === "\\") index += 1;
    else if (content[index] === quote) return index + 1;
  }
  return index;
}

function blankRange(content, start, end) {
  return content.slice(start, end).replace(/[^\n]/g, " ");
}

export function stripComments(content, file = "") {
  let stripped = "";
  for (let index = 0; index < content.length;) {
    if (["'", '"', "`"].includes(content[index])) {
      const end = skipQuoted(content, index);
      stripped += content.slice(index, end);
      index = end;
    } else if (content.startsWith("/*", index)) {
      const end = content.indexOf("*/", index + 2);
      const next = end === -1 ? content.length : end + 2;
      stripped += blankRange(content, index, next);
      index = next;
    } else if (/\.[tj]sx?$/.test(file) && content.startsWith("//", index)) {
      const end = content.indexOf("\n", index);
      const next = end === -1 ? content.length : end;
      stripped += blankRange(content, index, next);
      index = next;
    } else {
      stripped += content[index];
      index += 1;
    }
  }
  return stripped;
}

function withoutCssCustomPropertyDeclarations(content) {
  let stripped = content;
  for (const declaration of content.matchAll(/--[\w-]+\s*:/g)) {
    let depth = 0;
    let end = declaration.index + declaration[0].length;
    for (; end < content.length; end += 1) {
      if (["'", '"'].includes(content[end])) {
        end = skipQuoted(content, end) - 1;
      } else if (content[end] === "(") depth += 1;
      else if (content[end] === ")") depth -= 1;
      else if (depth === 0 && ";}".includes(content[end])) {
        end += content[end] === ";" ? 1 : 0;
        break;
      }
    }
    stripped = `${stripped.slice(0, declaration.index)}${blankRange(content, declaration.index, end)}${stripped.slice(end)}`;
  }
  return stripped;
}

function withoutCssQuotedFragments(content) {
  let stripped = "";
  for (let index = 0; index < content.length;) {
    if (["'", '"'].includes(content[index])) {
      const end = skipQuoted(content, index);
      stripped += blankRange(content, index, end);
      index = end;
    } else {
      stripped += content[index];
      index += 1;
    }
  }
  return stripped;
}

function scanContent(source) {
  const content = stripComments(source.content, source.file);
  return source.file.endsWith(".css")
    ? withoutCssCustomPropertyDeclarations(withoutCssQuotedFragments(content))
    : content;
}

function scanGradientCall(content, start) {
  let depth = 1;
  let lexed = "";
  const ignoredRanges = [];
  for (let index = start; index < content.length; index += 1) {
    if (content.startsWith("/*", index)) {
      const end = content.indexOf("*/", index + 2);
      ignoredRanges.push([index, end === -1 ? content.length : end + 2]);
      index = end === -1 ? content.length : end + 1;
      continue;
    }
    if (["'", '"', "`"].includes(content[index])) {
      const end = skipQuoted(content, index);
      ignoredRanges.push([index, end]);
      index = end - 1;
      continue;
    }
    if (content[index] === "(") depth += 1;
    if (content[index] === ")" && --depth === 0) return { end: index + 1, ignoredRanges, lexed };
    lexed += content[index];
  }
  return null;
}

function directColorGradients(content) {
  const entries = [];
  const ignoredRanges = [];
  for (const start of content.matchAll(GRADIENT_START)) {
    if (ignoredRanges.some(([begin, end]) => start.index >= begin && start.index < end)) continue;
    const call = scanGradientCall(content, start.index + start[0].length);
    const gradient = call && content.slice(start.index, call.end);
    if (call) ignoredRanges.push(...call.ignoredRanges);
    if (call && (RAW_HEX.test(call.lexed) || RAW_COLOR_FUNCTION.test(call.lexed))) entries.push({
      context: gradient.replace(/\s+/g, " ").trim(),
      index: start.index,
      match: gradient,
    });
  }
  return entries;
}

export function collectDebtEntries(sources, section = "all") {
  const entries = [];
  for (const source of [...sources].sort((left, right) => left.file.localeCompare(right.file))) {
    const content = scanContent(source);
    for (const [rule, pattern, code] of checksForSection(section)) {
      for (const match of content.matchAll(new RegExp(pattern.source, pattern.flags))) {
        if (pattern === TAILWIND_ARBITRARY_COLOR && !isArbitraryColor(match[1])) continue;
        entries.push({
          code,
          context: occurrenceContext(content, match.index),
          file: source.file,
          match: match[0],
          rule,
        });
      }
    }
    if (section === "all" || section === "tokens") {
      for (const entry of directColorGradients(content)) {
        entries.push({ code: "DIRECT_VISUAL_ROLE", file: source.file, rule: "visualRole", ...entry });
      }
    }
  }
  const occurrences = new Map();
  return entries.map((entry) => {
    const key = `${entry.rule}\0${entry.file}\0${entry.match}`;
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    return { ...entry, occurrence };
  });
}

function validateRoleAlias(parsed, alias, canonical, diagnostics) {
  const values = parsed.declarations.get(`--${alias}`) ?? [];
  if (values.some((value) => value !== `var(--${canonical})`)) {
    diagnostics.push(diagnostic("REVERSE_COMPAT_ALIAS", `--${alias} must point one-way to --${canonical}`));
  }
  const canonicalValues = parsed.declarations.get(`--${canonical}`) ?? [];
  if (canonicalValues.some((value) => value.includes(`var(--${alias})`))) {
    diagnostics.push(diagnostic("REVERSE_COMPAT_ALIAS", `--${canonical} cannot depend on --${alias}`));
  }
}

function dependsOnAccent(declarations, token, seen = new Set()) {
  if (seen.has(token)) return false;
  seen.add(token);
  return (declarations.get(`--${token}`) ?? []).some((value) =>
    [...value.matchAll(/var\(--([a-z0-9-]+)/gi)].some((match) =>
      match[1] === "accent-primary" || match[1].startsWith("accent-primary-") || dependsOnAccent(declarations, match[1], seen)));
}

export function validateContract({ css, sources = [], section = "all", requireComplete = true, legacyFingerprints = LEGACY_DEBT_FINGERPRINTS }) {
  const diagnostics = [];
  let parsed;
  try {
    parsed = parseCustomProperties(css);
  } catch (error) {
    return [diagnostic("MALFORMED_CSS", error instanceof Error ? error.message : String(error))];
  }
  const declared = new Set(parsed.declarations.keys());
  const root = themeDeclarations(css, ":root");
  const dark = themeDeclarations(css, ".dark");

  if (section === "all" || section === "tokens") {
    if (requireComplete) {
      for (const token of CANONICAL_THEME_TOKENS) {
        if (!root.has(`--${token}`) || !dark.has(`--${token}`)) {
          diagnostics.push(diagnostic("MISSING_CANONICAL_TOKEN", `--${token} must be declared in :root and .dark`));
        }
      }
    }
    for (const reference of parsed.references) {
      if (!declared.has(reference) && !APPROVED_EXTERNAL_VARIABLES.has(reference.slice(2))) {
        diagnostics.push(diagnostic("UNDEFINED_CSS_VARIABLE", `${reference} is referenced but never declared`));
      }
    }
    for (const [alias, canonical] of COMPATIBILITY_ALIASES) validateRoleAlias(parsed, alias, canonical, diagnostics);
    for (const [alias, canonical] of ROLE_TOKEN_ALIASES) validateRoleAlias(parsed, alias, canonical, diagnostics);
    for (const token of ["selection-bg", "selection-border", "selection-text"]) {
      if ([root, dark].some((theme) => dependsOnAccent(theme, token))) {
        diagnostics.push(diagnostic("SELECTION_DEPENDS_ON_ACCENT", `--${token} must not transitively depend on --accent-primary`));
      }
    }
    for (const token of CANONICAL_THEME_TOKENS) {
      for (const value of parsed.declarations.get(`--${token}`) ?? []) {
        if (/(?:^|\s)#(?:000|000000|fff|ffffff)(?:\s|$)/i.test(value)) {
          diagnostics.push(diagnostic("PURE_EXTREME_CANONICAL", `--${token} uses pure black or white`));
        }
      }
    }
  }

  if (section === "all" || section === "geometry") {
    if (requireComplete) {
      for (const token of GEOMETRY_TOKENS) {
        if (!declared.has(`--${token}`)) diagnostics.push(diagnostic("MISSING_CANONICAL_TOKEN", `--${token} is missing`));
      }
    }
    if (requireComplete && !/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css)) {
      diagnostics.push(diagnostic("MISSING_REDUCED_MOTION", "reduced-motion contract is missing"));
    }
  }

  if ((section === "all" || section === "layers") && requireComplete) {
    for (const token of LAYER_TOKENS) {
      if (!declared.has(`--${token}`)) diagnostics.push(diagnostic("MISSING_CANONICAL_TOKEN", `--${token} is missing`));
    }
    const layerValues = LAYER_TOKENS.map((token) => Number.parseInt(parsed.declarations.get(`--${token}`)?.[0] ?? "", 10));
    if (layerValues.some(Number.isNaN) || layerValues.some((value, index) => index > 0 && value <= layerValues[index - 1])) {
      diagnostics.push(diagnostic("INVALID_LAYER_ORDER", "global layer values must be numeric and strictly increasing"));
    }
  }

  for (const entry of collectDebtEntries(sources, section)) {
    if (entry.rule === "visualRole" || !legacyFingerprints.has(legacyFingerprint(entry.rule, entry.file, entry.match, entry.occurrence))) {
      diagnostics.push(diagnostic(entry.code, `${entry.match} in ${JSON.stringify(entry.context)} is not allowlisted`, entry.file));
    }
  }
  return diagnostics;
}

function walk(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

export function loadAuthenticatedSources(root = repoRoot) {
  return SOURCE_ROOTS.flatMap((directory) => walk(resolve(root, directory)))
    .filter((path) => /\.(?:css|ts|tsx)$/.test(path) && !/(?:^|\/)(?:__tests__|tests?)(?:\/|$)|\.(?:test|spec)\.[tj]sx?$/.test(path))
    .map((path) => ({ file: relative(root, path).replaceAll("\\", "/"), content: readFileSync(path, "utf8") }));
}

function parseArgs(argv) {
  const sectionIndex = argv.indexOf("--section");
  const section = sectionIndex === -1 ? "all" : argv[sectionIndex + 1];
  if (!new Set(["all", "tokens", "geometry", "layers", "dialect"]).has(section)) {
    throw new Error("Usage: check-visual-contract.mjs [--section tokens|geometry|layers|dialect]");
  }
  return { section };
}

export function runCli(argv = process.argv.slice(2)) {
  const { section } = parseArgs(argv);
  const css = readFileSync(stylesheetPath, "utf8");
  const diagnostics = [
    ...validateLegacyDebtManifest(),
    ...validateContract({ css, sources: loadAuthenticatedSources(), section }),
  ];
  if (diagnostics.length) {
    for (const item of diagnostics) console.error(`${item.code}${item.file ? ` ${item.file}` : ""}: ${item.message}`);
    process.exitCode = 1;
  } else {
    console.log(`Visual contract ${section} section passed.`);
  }
  return diagnostics;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) runCli();
