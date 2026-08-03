#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const stylesheetPath = resolve(repoRoot, "app/src/app/globals.css");

export const CANONICAL_THEME_TOKENS = [
  "canvas", "surface-base", "surface-raised", "surface-inset", "surface-overlay",
  "text-primary", "text-secondary", "text-muted", "text-disabled", "text-on-accent",
  "border-subtle", "border-default", "border-strong", "focus-ring",
  "accent-primary", "accent-primary-hover", "accent-primary-subtle", "accent-primary-text",
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
  ["accent-green", "accent-primary"], ["accent-green-light", "accent-primary-hover"],
  ["accent-green-dim", "accent-primary-subtle"], ["accent-green-text", "accent-primary-text"],
  ["accent-green-on-fill", "text-on-accent"],
]);

const APPROVED_EXTERNAL_VARIABLES = new Set([
  "font-inter", "font-space-mono", "font-press-start",
]);
const DEPRECATED_HUES = /var\(--(?:accent-(?:blue|blue-light|blue-dim|teal|purple|mint|mint-light|mint-dim)|pale|cream)\)/g;
const RAW_LAYER = /(?<![\w-])(?:-?z-(?:\[(?!var\(--layer-)[^\]]+\]|\d+))/g;
const ARBITRARY_DIALECT = /(?:text-\[(?:\d|clamp\(|calc\()[^\]]*\]|rounded-\[(?:\d|clamp\(|calc\()[^\]]*\])/g;
const AUTHENTICATED_ROOTS = [
  "app/src/app/(dashboard)",
  "app/src/components/campaigns", "app/src/components/layout", "app/src/components/providers",
  "app/src/components/restyling", "app/src/components/settings", "app/src/components/templates",
  "app/src/components/ui", "app/src/components/workspace",
];

// Counts are captured from the immutable first-wave baseline 3261b1b2. They permit
// existing debt only in the same file and rule; any added occurrence fails deterministically.
const DEBT_ALLOWLIST = {
  deprecatedHue: {
    "app/src/app/(dashboard)/library/page.tsx": 4,
    "app/src/app/(dashboard)/restyling/page.tsx": 2,
    "app/src/app/(dashboard)/templates/page.tsx": 2,
    "app/src/components/campaigns/CampaignNotFoundState.tsx": 1,
    "app/src/components/campaigns/CampaignsFilterToolbar.tsx": 1,
    "app/src/components/providers/ToastStack.tsx": 4,
    "app/src/components/restyling/RestylingForm.tsx": 8,
    "app/src/components/settings/BrandKitTab.tsx": 9,
    "app/src/components/settings/IntegrationsTab.tsx": 4,
    "app/src/components/settings/ProfileTab.tsx": 3,
    "app/src/components/settings/TeamTab.tsx": 6,
    "app/src/components/settings/WorkspaceTab.tsx": 4,
    "app/src/components/templates/SaveTemplateModal.tsx": 2,
    "app/src/components/templates/TemplateCard.tsx": 2,
    "app/src/components/workspace/AutoBriefingSheet.tsx": 3,
    "app/src/components/workspace/BriefingStep.tsx": 1,
    "app/src/components/workspace/DerivationCard.tsx": 9,
    "app/src/components/workspace/DerivationReviewSheet.tsx": 1,
    "app/src/components/workspace/GuidedBriefingPanel.tsx": 1,
  },
  rawLayer: {
    "app/src/components/campaigns/CampaignListCard.tsx": 3,
    "app/src/components/campaigns/CampaignsListView.tsx": 1,
    "app/src/components/layout/AppShell.tsx": 1,
    "app/src/components/layout/AppSidebar.tsx": 1,
    "app/src/components/layout/TopBar.tsx": 2,
    "app/src/components/providers/ToastStack.tsx": 1,
    "app/src/components/ui/LanguageSwitcher.tsx": 1,
    "app/src/components/ui/dialog.tsx": 3,
    "app/src/components/ui/dropdown-menu.tsx": 2,
    "app/src/components/ui/select.tsx": 4,
    "app/src/components/ui/sheet.tsx": 3,
    "app/src/components/ui/tooltip.tsx": 4,
    "app/src/components/workspace/DerivationCard.tsx": 1,
    "app/src/components/workspace/PilotUploadPanel.tsx": 3,
    "app/src/components/workspace/WorkspaceActionBar.tsx": 1,
  },
  arbitraryDialect: {
    "app/src/app/(dashboard)/brand-kit/page.tsx": 1,
    "app/src/app/(dashboard)/campaigns/[id]/page.tsx": 6,
    "app/src/app/(dashboard)/feedback/page.tsx": 3,
    "app/src/app/(dashboard)/library/page.tsx": 3,
    "app/src/app/(dashboard)/quick-tools/restyling/page.tsx": 1,
    "app/src/app/(dashboard)/restyling/page.tsx": 1,
    "app/src/components/campaigns/CampaignCard.tsx": 4,
    "app/src/components/campaigns/CampaignListCard.tsx": 1,
    "app/src/components/campaigns/CampaignTableRow.tsx": 4,
    "app/src/components/campaigns/CampaignsFilterToolbar.tsx": 3,
    "app/src/components/campaigns/CampaignsHeader.tsx": 1,
    "app/src/components/campaigns/CampaignsPagination.tsx": 1,
    "app/src/components/campaigns/ClientProfileLinkControl.tsx": 3,
    "app/src/components/campaigns/KanbanCard.tsx": 3,
    "app/src/components/campaigns/KanbanColumn.tsx": 1,
    "app/src/components/campaigns/LearningsPanel.tsx": 1,
    "app/src/components/campaigns/NewCampaignModal.tsx": 3,
    "app/src/components/campaigns/NextExperimentRecommendationCard.tsx": 2,
    "app/src/components/campaigns/OutputLearningRecommendationCard.tsx": 2,
    "app/src/components/campaigns/v6/CampaignsV6View.tsx": 6,
    "app/src/components/campaigns/v6/workspace/CampaignWorkspaceV6View.tsx": 2,
    "app/src/components/layout/AccountStatusBadge.tsx": 1,
    "app/src/components/layout/AppShell.tsx": 2,
    "app/src/components/layout/AppSidebar.tsx": 7,
    "app/src/components/layout/MobileMoreSheet.tsx": 1,
    "app/src/components/layout/SidebarAssistantModeSwitch.tsx": 5,
    "app/src/components/layout/SidebarBrandKitFeature.tsx": 4,
    "app/src/components/layout/SidebarRecentWorks.tsx": 7,
    "app/src/components/layout/TopBar.tsx": 3,
    "app/src/components/providers/ToastStack.tsx": 1,
    "app/src/components/restyling/RestylingForm.tsx": 1,
    "app/src/components/settings/BillingTab.tsx": 6,
    "app/src/components/settings/BrandKitTab.tsx": 3,
    "app/src/components/settings/IntegrationsTab.tsx": 1,
    "app/src/components/settings/PlansTab.tsx": 2,
    "app/src/components/settings/PrivacyTab.tsx": 3,
    "app/src/components/settings/v6/SettingsV6View.tsx": 1,
    "app/src/components/settings/TeamTab.tsx": 2,
    "app/src/components/settings/WorkspaceTab.tsx": 2,
    "app/src/components/templates/SaveTemplateModal.tsx": 3,
    "app/src/components/templates/TemplateCard.tsx": 1,
    "app/src/components/ui/EmptyState.tsx": 3,
    "app/src/components/ui/StatusBadge.tsx": 1,
    "app/src/components/ui/button.tsx": 1,
    "app/src/components/ui/tooltip.tsx": 1,
    "app/src/components/workspace/ClientApprovalPackagePanel.tsx": 6,
    "app/src/components/workspace/CreativeReadinessPanel.tsx": 4,
    "app/src/components/workspace/DerivationAutoRetryBadge.tsx": 1,
    "app/src/components/workspace/DerivationCard.tsx": 21,
    "app/src/components/workspace/DerivationGrid.tsx": 1,
    "app/src/components/workspace/DerivationPreviewGateFooter.tsx": 2,
    "app/src/components/workspace/DerivationReviewSheet.tsx": 6,
    "app/src/components/workspace/EstilizarModal.tsx": 2,
    "app/src/components/workspace/GuidedBriefingPanel.tsx": 1,
    "app/src/components/workspace/PersonaSimulationSheet.tsx": 5,
    "app/src/components/workspace/PilotSidebar.tsx": 4,
    "app/src/components/workspace/PilotUploadPanel.tsx": 5,
    "app/src/components/workspace/StrategyRecipePanel.tsx": 1,
    "app/src/components/workspace/WorkspaceActionBar.tsx": 1,
  },
};

function diagnostic(code, message, file) {
  return { code, message, ...(file ? { file } : {}) };
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

export function validateContract({ css, sources = [], section = "all", requireComplete = true }) {
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
    for (const [alias, canonical] of COMPATIBILITY_ALIASES) {
      const values = parsed.declarations.get(`--${alias}`) ?? [];
      if (values.length && values.some((value) => value !== `var(--${canonical})`)) {
        diagnostics.push(diagnostic("REVERSE_COMPAT_ALIAS", `--${alias} must point one-way to --${canonical}`));
      }
      const canonicalValues = parsed.declarations.get(`--${canonical}`) ?? [];
      if (canonicalValues.some((value) => value.includes(`var(--${alias})`))) {
        diagnostics.push(diagnostic("REVERSE_COMPAT_ALIAS", `--${canonical} cannot depend on --${alias}`));
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

  for (const source of sources) {
    const checks = section === "tokens" ? [["deprecatedHue", DEPRECATED_HUES, "DEPRECATED_HUE_ALIAS"]]
      : section === "layers" ? [["rawLayer", RAW_LAYER, "RAW_GLOBAL_LAYER"]]
        : section === "dialect" ? [["deprecatedHue", DEPRECATED_HUES, "DEPRECATED_HUE_ALIAS"], ["arbitraryDialect", ARBITRARY_DIALECT, "ARBITRARY_VISUAL_DIALECT"]]
          : [["deprecatedHue", DEPRECATED_HUES, "DEPRECATED_HUE_ALIAS"], ["rawLayer", RAW_LAYER, "RAW_GLOBAL_LAYER"], ["arbitraryDialect", ARBITRARY_DIALECT, "ARBITRARY_VISUAL_DIALECT"]];
    for (const [rule, pattern, code] of checks) {
      const count = [...source.content.matchAll(new RegExp(pattern.source, pattern.flags))].length;
      const allowed = DEBT_ALLOWLIST[rule][source.file] ?? 0;
      if (count > allowed) diagnostics.push(diagnostic(code, `${count} occurrences exceed allowlisted ${allowed}`, source.file));
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
  return AUTHENTICATED_ROOTS.flatMap((directory) => walk(resolve(root, directory)))
    .filter((path) => /\.(?:ts|tsx)$/.test(path) && !/\.test\./.test(path))
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
  const diagnostics = validateContract({ css, sources: loadAuthenticatedSources(), section });
  if (diagnostics.length) {
    for (const item of diagnostics) console.error(`${item.code}${item.file ? ` ${item.file}` : ""}: ${item.message}`);
    process.exitCode = 1;
  } else {
    console.log(`Visual contract ${section} section passed.`);
  }
  return diagnostics;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) runCli();
