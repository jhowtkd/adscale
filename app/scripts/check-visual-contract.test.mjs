import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  COMPATIBILITY_ALIASES,
  LEGACY_DEBT_BASELINE_DIGEST,
  LEGACY_DEBT_BASELINE_REVISION,
  ROLE_TOKEN_ALIASES,
  collectDebtEntries,
  legacyDebtDigest,
  legacyFingerprint,
  loadAuthenticatedSources,
  validateContract,
  validateLegacyDebtEntries,
  validateLegacyDebtManifest,
} from "./check-visual-contract.mjs";

const minimal = `
:root { --canvas: oklch(0.98 0.004 145); --deep-bg: var(--canvas); }
.dark { --canvas: oklch(0.16 0.006 145); }
`;
const legacyDebtManifest = JSON.parse(readFileSync(new URL("./visual-role-debt.json", import.meta.url), "utf8"));

test("a valid minimal fixture exits without diagnostics", () => {
  assert.deepEqual(validateContract({ css: minimal, requireComplete: false }), []);
});

test("missing canonical tokens have a stable diagnostic", () => {
  const diagnostics = validateContract({ css: minimal, requireComplete: true });
  assert.ok(diagnostics.some(({ code, message }) => code === "MISSING_CANONICAL_TOKEN" && message.includes("--surface-base")));
});

test("undefined variables are distinguished", () => {
  const diagnostics = validateContract({ css: `${minimal}\nx { color: var(--not-defined); }`, requireComplete: false });
  assert.ok(diagnostics.some(({ code }) => code === "UNDEFINED_CSS_VARIABLE"));
});

test("reverse compatibility aliases are distinguished", () => {
  const diagnostics = validateContract({ css: `:root { --canvas: var(--deep-bg); --deep-bg: oklch(0.9 0 0); }`, requireComplete: false });
  assert.ok(diagnostics.some(({ code }) => code === "REVERSE_COMPAT_ALIAS"));
});

test("only consumed compatibility aliases remain contracted", () => {
  assert.deepEqual([...COMPATIBILITY_ALIASES], [
    ["deep-bg", "canvas"], ["border-dim", "border-subtle"], ["border-medium", "border-default"],
    ["ghost", "text-muted"], ["accent-secondary", "neutral-text"],
  ]);
});

test("raw global layers are distinguished", () => {
  const diagnostics = validateContract({
    css: minimal,
    sources: [{ file: "app/src/components/ui/example.tsx", content: `className="z-50"` }],
    section: "layers",
    requireComplete: false,
  });
  assert.ok(diagnostics.some(({ code }) => code === "RAW_GLOBAL_LAYER"));
});

test("adjacent context changes retain immutable nonvisual debt identity", () => {
  const file = "app/src/components/example.tsx";
  for (const { legacy, match, rule, section } of [
    { legacy: `const previous = "z-50";`, match: "z-50", rule: "rawLayer", section: "layers" },
    { legacy: `const previous = "text-[10px]";`, match: "text-[10px]", rule: "arbitraryDialect", section: "dialect" },
  ]) {
    const legacyFingerprints = new Set([legacyFingerprint(rule, file, match, 1)]);
    assert.deepEqual(validateContract({ css: minimal, sources: [{ file, content: legacy }], section, requireComplete: false, legacyFingerprints }), []);
    assert.deepEqual(validateContract({
      css: minimal,
      sources: [{ file, content: legacy.replace("previous", "replacement") }],
      section,
      requireComplete: false,
      legacyFingerprints,
    }), []);
  }
});

test("a retained debt token replacement fails", () => {
  const file = "app/src/components/example.tsx";
  const legacyFingerprints = new Set([legacyFingerprint("arbitraryDialect", file, "text-[13px]", 1)]);
  assert.ok(validateContract({
    css: minimal,
    sources: [{ file, content: `const replacement = "text-[14px]";` }],
    section: "dialect",
    requireComplete: false,
    legacyFingerprints,
  }).some(({ code }) => code === "ARBITRARY_VISUAL_DIALECT"));
});

test("legacy debt can shrink", () => {
  const file = "app/src/components/example.tsx";
  const legacyFingerprints = new Set([legacyFingerprint("rawLayer", file, "z-50", 1)]);
  assert.deepEqual(validateContract({ css: minimal, sources: [{ file, content: "" }], section: "layers", requireComplete: false, legacyFingerprints }), []);
});

test("duplicating an identical allowlisted retained-debt line fails by occurrence", () => {
  const file = "app/src/components/example.tsx";
  for (const { code, legacy, match, rule, section } of [
    { code: "RAW_GLOBAL_LAYER", legacy: `const legacy = "z-50";`, match: "z-50", rule: "rawLayer", section: "layers" },
    { code: "ARBITRARY_VISUAL_DIALECT", legacy: `const legacy = "text-[10px]";`, match: "text-[10px]", rule: "arbitraryDialect", section: "dialect" },
  ]) {
    const legacyFingerprints = new Set([legacyFingerprint(rule, file, match, 1)]);
    const entries = collectDebtEntries([{ file, content: `${legacy}\n${legacy}` }], section);
    assert.deepEqual(entries.map(({ occurrence }) => occurrence), [1, 2]);
    assert.ok(validateContract({
      css: minimal,
      sources: [{ file, content: `${legacy}\n${legacy}` }],
      section,
      requireComplete: false,
      legacyFingerprints,
    }).some((diagnostic) => diagnostic.code === code));
  }
});

test("visualRole entries are forbidden in the debt baseline", () => {
  const diagnostics = validateLegacyDebtEntries([{
    rule: "visualRole",
    file: "app/src/components/example.tsx",
    context: `const legacy = "bg-primary";`,
  }]);
  assert.deepEqual(diagnostics.map(({ code, file }) => ({ code, file })), [{
    code: "FORBIDDEN_VISUAL_ROLE_BASELINE",
    file: "app/src/components/example.tsx",
  }]);
});

test("origin/main's occurrence-exact benchmark rejects retained-debt growth", () => {
  const diagnostics = validateLegacyDebtEntries([
    ...Array.from({ length: 26 }, (_, index) => ({ rule: "rawLayer", file: "raw.tsx", match: `z-${index}`, occurrence: index + 1 })),
    ...Array.from({ length: 245 }, (_, index) => ({ rule: "arbitraryDialect", file: "dialect.tsx", match: `text-[${index}px]`, occurrence: index + 1 })),
  ]);
  assert.deepEqual(diagnostics.filter(({ code }) => code === "DEBT_BASELINE_INCREASE").map(({ code, message }) => ({ code, message })), [
    { code: "DEBT_BASELINE_INCREASE", message: "rawLayer baseline has 26 entries; maximum is 25" },
    { code: "DEBT_BASELINE_INCREASE", message: "arbitraryDialect baseline has 245 entries; maximum is 244" },
  ]);
});

test("current occurrence-exact debt remains below the immutable origin/main benchmark", () => {
  assert.equal(legacyDebtManifest.baselineRevision, LEGACY_DEBT_BASELINE_REVISION);
  assert.equal(legacyDebtManifest.baselineDigest, LEGACY_DEBT_BASELINE_DIGEST);
  assert.equal(legacyDebtDigest(legacyDebtManifest.entries), LEGACY_DEBT_BASELINE_DIGEST);
  assert.deepEqual(legacyDebtManifest.entries.reduce((counts, { rule }) => ({ ...counts, [rule]: (counts[rule] ?? 0) + 1 }), {}), {
    arbitraryDialect: 244,
    rawLayer: 25,
  });
  assert.deepEqual(validateLegacyDebtManifest(), []);
});

test("immutable manifest rejects replacement and removal", () => {
  assert.ok(validateLegacyDebtManifest({ ...legacyDebtManifest, entries: legacyDebtManifest.entries.slice(1) })
    .some(({ code }) => code === "IMMUTABLE_BASELINE_DIGEST_MISMATCH"));
  assert.ok(validateLegacyDebtManifest({ ...legacyDebtManifest, baselineRevision: "dda6504d" })
    .some(({ code }) => code === "IMMUTABLE_BASELINE_REVISION_MISMATCH"));
});

test("unknown in-memory debt is rejected below the immutable cap", () => {
  const probe = { rule: "arbitraryDialect", file: "app/src/components/SolProbe.tsx", match: "text-[13px]", occurrence: 1 };
  const diagnostics = validateLegacyDebtEntries([...legacyDebtManifest.entries.slice(0, -2), probe]);
  assert.ok(diagnostics.some(({ code, file }) => code === "UNKNOWN_IMMUTABLE_DEBT_FINGERPRINT" && file === probe.file));
});

test("Sol's text-[13px] probe fails at current 227/244", () => {
  const sources = loadAuthenticatedSources();
  const probe = { file: "app/src/components/SolProbe.tsx", content: `const probe = "text-[13px]";` };
  assert.equal(collectDebtEntries(sources, "dialect").length, 226);
  assert.equal(collectDebtEntries([...sources, probe], "dialect").length, 227);
  assert.ok(validateContract({ css: minimal, sources: [...sources, probe], section: "dialect", requireComplete: false })
    .some(({ code, file }) => code === "ARBITRARY_VISUAL_DIALECT" && file === probe.file));
});

test("all app/src visual sources include TS and CSS roots", () => {
  const sources = loadAuthenticatedSources();
  assert.ok(sources.some(({ file }) => file === "app/src/lib/derivation-display.ts"));
  assert.ok(sources.some(({ file }) => file === "app/src/app/globals.css"));
});

test("CTA and other role tokens, semantic statuses, and focus pass", () => {
  const source = `var(--action-primary-bg) var(--action-primary-hover) var(--action-primary-text) var(--selection-bg) var(--selection-border) var(--selection-text) var(--active-navigation-bg) var(--active-navigation-text) var(--utility-icon) var(--success-text) var(--focus-ring)`;
  assert.deepEqual(validateContract({ css: minimal, sources: [{ file: "app/src/components/example.tsx", content: source }], section: "tokens", requireComplete: false, legacyFingerprints: new Set() }), []);
});

test("selection roles are one-way aliases to neutral primitives", () => {
  assert.equal(ROLE_TOKEN_ALIASES.get("selection-bg"), "neutral-bg");
  assert.equal(ROLE_TOKEN_ALIASES.get("selection-border"), "neutral-border");
  assert.equal(ROLE_TOKEN_ALIASES.get("selection-text"), "neutral-text");

  const selection = `
    :root { --neutral-bg: x; --neutral-border: y; --neutral-text: z; --accent-primary: a; --selection-bg: var(--neutral-bg); --selection-border: var(--neutral-border); --selection-text: var(--neutral-text); }
    .dark { --neutral-bg: x; --neutral-border: y; --neutral-text: z; --accent-primary: a; --selection-bg: var(--neutral-bg); --selection-border: var(--neutral-border); --selection-text: var(--neutral-text); }
  `;
  assert.deepEqual(validateContract({ css: selection, requireComplete: false }), []);
  assert.ok(validateContract({ css: selection.replaceAll("var(--neutral-bg)", "var(--accent-primary)"), requireComplete: false })
    .some(({ code }) => code === "REVERSE_COMPAT_ALIAS"));
  assert.ok(validateContract({ css: selection.replaceAll("--neutral-bg: x", "--neutral-bg: var(--accent-primary)"), requireComplete: false })
    .some(({ code }) => code === "SELECTION_DEPENDS_ON_ACCENT"));
});

test("direct aliases and Tailwind primary utilities are detected", () => {
  const source = `var(--accent-green) var(--accent-primary) var(--color-primary) hover:bg-primary/50 dark:focus:ring-primary data-[state=active]:fill-primary fill-primary via-primary hover:via-primary/50`;
  const diagnostics = validateContract({ css: minimal, sources: [{ file: "app/src/components/example.tsx", content: source }], section: "tokens", requireComplete: false, legacyFingerprints: new Set() });
  assert.equal(diagnostics.filter(({ code }) => code === "DIRECT_VISUAL_ROLE").length, 9);
});

test("named Tailwind hue utilities include red and gradient via targets", () => {
  const source = `text-red-500 via-rose-500 hover:via-red-500/[.25]`;
  const diagnostics = validateContract({ css: minimal, sources: [{ file: "app/src/components/example.tsx", content: source }], section: "tokens", requireComplete: false, legacyFingerprints: new Set() });
  assert.equal(diagnostics.filter(({ code }) => code === "DIRECT_VISUAL_ROLE").length, 3);
});

test("untyped arbitrary Tailwind colors are detected while token and keyword escapes pass", () => {
  const source = [
    "bg-[rgb(255_0_0)]", "hover:bg-[green]", "dark:focus:via-[oklch(0.7_0.2_30)]",
    "border-[var(--border-default)]", "text-[transparent]", "ring-[currentColor]", "fill-[inherit]",
  ].join(" ");
  const diagnostics = validateContract({ css: minimal, sources: [{ file: "app/src/components/example.tsx", content: source }], section: "tokens", requireComplete: false, legacyFingerprints: new Set() });
  assert.equal(diagnostics.filter(({ code }) => code === "DIRECT_VISUAL_ROLE").length, 3);
});

test("scanner ignores comments but retains quoted utility classes", () => {
  const source = `// bg-green-500\n/* via-primary */\nconst className = "bg-green-500";`;
  const diagnostics = validateContract({ css: minimal, sources: [{ file: "app/src/components/example.tsx", content: source }], section: "tokens", requireComplete: false, legacyFingerprints: new Set() });
  assert.equal(diagnostics.filter(({ code }) => code === "DIRECT_VISUAL_ROLE").length, 1);
});

test("CSS scans direct visual roles outside custom-property declarations only", () => {
  const source = `
    :root { --accent-green: var(--accent-primary); --semantic-success: oklch(0.7 0.15 145); }
    .neutral { color: var(--text-primary); background: oklch(0.95 0 0); }
    .legacy { color: var(--accent-green); background: var(--accent-primary); }
  `;
  const diagnostics = validateContract({ css: minimal, sources: [{ file: "app/src/app/example.css", content: source }], section: "tokens", requireComplete: false, legacyFingerprints: new Set() });
  assert.equal(diagnostics.filter(({ code }) => code === "DIRECT_VISUAL_ROLE").length, 2);
});

test("CSS gradients reject direct colors but ignore declarations, comments, and quoted content", () => {
  const direct = `
    :root { --canvas: oklch(0.98 0.004 145); --canonical-gradient: linear-gradient(rgb(255 0 0), #ff0000); }
    .decorative { background: linear-gradient(rgb(255 0 0), #ff0000); }
  `;
  const ignored = `
    :root { --canvas: oklch(0.98 0.004 145); --canonical-gradient: linear-gradient(rgb(255 0 0), #ff0000); }
    .tokens { background: linear-gradient(var(--canvas), var(--surface-base)); }
    .comment { background: linear-gradient(/* rgb(255 0 0), #ff0000 */ var(--canvas), var(--surface-base)); }
    .quoted { content: "linear-gradient(rgb(255 0 0), #ff0000)"; }
  `;
  const diagnostics = validateContract({ css: minimal, sources: [{ file: "app/src/app/example.css", content: direct }], section: "tokens", requireComplete: false, legacyFingerprints: new Set() });
  assert.equal(diagnostics.filter(({ code }) => code === "DIRECT_VISUAL_ROLE").length, 1);
  assert.deepEqual(validateContract({ css: minimal, sources: [{ file: "app/src/app/example.css", content: ignored }], section: "tokens", requireComplete: false, legacyFingerprints: new Set() }), []);
});

test("arbitrary Tailwind hex color utilities are detected", () => {
  const diagnostics = validateContract({ css: minimal, sources: [{ file: "app/src/components/example.tsx", content: `border-[#ff3b30]/80` }], section: "tokens", requireComplete: false, legacyFingerprints: new Set() });
  assert.ok(diagnostics.some(({ code }) => code === "DIRECT_VISUAL_ROLE"));
});

test("shared color grammar detects color-typed utilities and direct gradient colors", () => {
  const source = [
    "hover:bg-[color:#ff0000]", "dark:focus:ring-[color:rgb(255 0 0)]", "data-[state=active]:via-[color:oklch(0.7 0.2 30)]", "border-[color:var(--border-default)]",
    ...["rgb(255 0 0)", "rgba(255 0 0 / .5)", "hsl(0 100% 50%)", "hsla(0 100% 50% / .5)", "oklch(0.6 0.2 30)", "oklab(0.6 0.1 0.1)", "lab(50% 50 50)", "lch(50% 50 30)", "color(display-p3 1 0 0)"].map((color) => `linear-gradient(${color}, transparent)`),
    "linear-gradient(var(--canvas), transparent, currentColor)", "linear-gradient(var(--canvas), \"rgb(255 0 0)\")", "linear-gradient(var(--canvas), /* hsl(0 100% 50%) */ transparent)", "rgb(255 0 0)",
    "linear-gradient(var(--canvas), radial-gradient(lab(50% 0 0), transparent))",
  ].join("\n");
  const diagnostics = validateContract({ css: minimal, sources: [{ file: "app/src/components/example.tsx", content: source }], section: "tokens", requireComplete: false, legacyFingerprints: new Set() });
  assert.equal(diagnostics.filter(({ code }) => code === "DIRECT_VISUAL_ROLE").length, 14);
});

test("raw hex conic and radial gradients are detected while token-only gradients pass", () => {
  const source = `const a = "conic-gradient(#ff3b30, #ffcc00)"; const b = "radial-gradient(#12b981, transparent)"; const c = "linear-gradient(var(--canvas), var(--surface-base))";`;
  const diagnostics = validateContract({ css: minimal, sources: [{ file: "app/src/components/example.tsx", content: source }], section: "tokens", requireComplete: false, legacyFingerprints: new Set() });
  assert.equal(diagnostics.filter(({ code }) => code === "DIRECT_VISUAL_ROLE").length, 2);
});

test("raw hex gradients are detected across newlines without crossing a closed gradient", () => {
  const source = `
    const conic = \`conic-gradient(
      transparent 0deg,
      #ff3b30 90deg
    )\`;
    const radial = \`radial-gradient(
      transparent,
      #12b981
    )\`;
    const outside = \`linear-gradient(
      var(--canvas),
      var(--surface-base)
    )
    #ff3b30\`;
  `;
  const diagnostics = validateContract({ css: minimal, sources: [{ file: "app/src/components/example.tsx", content: source }], section: "tokens", requireComplete: false, legacyFingerprints: new Set() });
  assert.equal(diagnostics.filter(({ code }) => code === "DIRECT_VISUAL_ROLE").length, 2);
});

test("raw hex gradients detect stops after nested functions without crossing calls", () => {
  const source = `
    const nested = "linear-gradient(rgba(0,0,0,.2), #ff0000)";
    const multiline = \`radial-gradient(
      color-mix(in srgb, var(--canvas), transparent),
      #12b981
    )\`;
    const tokenOnly = \`linear-gradient(var(--canvas), var(--surface-base))
      #ff3b30\`;
  `;
  const diagnostics = validateContract({ css: minimal, sources: [{ file: "app/src/components/example.tsx", content: source }], section: "tokens", requireComplete: false, legacyFingerprints: new Set() });
  assert.equal(diagnostics.filter(({ code }) => code === "DIRECT_VISUAL_ROLE").length, 2);
});

test("gradient detection ignores gradient-looking quoted and commented CSS", () => {
  const source = `
    const quoted = 'linear-gradient("linear-gradient(#ff0000)", var(--canvas))';
    const commented = 'linear-gradient(var(--canvas) /* linear-gradient(#ff0000) */, var(--surface))';
  `;
  const diagnostics = validateContract({ css: minimal, sources: [{ file: "app/src/components/example.tsx", content: source }], section: "tokens", requireComplete: false, legacyFingerprints: new Set() });
  assert.equal(diagnostics.filter(({ code }) => code === "DIRECT_VISUAL_ROLE").length, 0);
});

test("gradient detection retains raw hex in outer and nested gradient calls", () => {
  const source = `
    const outer = 'linear-gradient(#ff0000, var(--canvas))';
    const nested = 'linear-gradient(var(--canvas), radial-gradient(#12b981, var(--surface)))';
  `;
  const diagnostics = validateContract({ css: minimal, sources: [{ file: "app/src/components/example.tsx", content: source }], section: "tokens", requireComplete: false, legacyFingerprints: new Set() });
  assert.equal(diagnostics.filter(({ code }) => code === "DIRECT_VISUAL_ROLE").length, 3);
});

test("gradient lexer ignores comments and quoted fragments while respecting nested calls", () => {
  const source = `
    const required = "linear-gradient(var(--canvas) /* ) */, #ff0000)";
    const nested = "linear-gradient(color-mix(in srgb, var(--canvas), transparent), #12b981)";
    const tokenOnly = "linear-gradient(var(--canvas), var(--surface-base)) #ff0000";
    const commented = "linear-gradient(var(--canvas), /* #ff0000 ) */ var(--surface-base))";
    const quoted = "linear-gradient(var(--canvas), \"#ff0000 )\")";
    const escaped = "linear-gradient(var(--canvas), \"escaped \\\"#ff0000 )\")";
    const url = "linear-gradient(var(--canvas), url(\"https://example.test/#ff0000)\"))";
  `;
  const diagnostics = validateContract({ css: minimal, sources: [{ file: "app/src/components/example.tsx", content: source }], section: "tokens", requireComplete: false, legacyFingerprints: new Set() });
  assert.equal(diagnostics.filter(({ code }) => code === "DIRECT_VISUAL_ROLE").length, 2);
});

test("malformed CSS is distinguished from contract assertions", () => {
  const diagnostics = validateContract({ css: `:root { --canvas: red`, requireComplete: false });
  assert.equal(diagnostics[0]?.code, "MALFORMED_CSS");
});

test("syntax and import failures remain non-assertion errors", async () => {
  await assert.rejects(import("data:text/javascript,export%20const%20=%201"), SyntaxError);
});
