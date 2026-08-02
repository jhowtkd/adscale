import test from "node:test";
import assert from "node:assert/strict";

import { validateContract } from "./check-visual-contract.mjs";

const minimal = `
:root { --canvas: oklch(0.98 0.004 145); --deep-bg: var(--canvas); }
.dark { --canvas: oklch(0.16 0.006 145); }
`;

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

test("raw global layers are distinguished", () => {
  const diagnostics = validateContract({
    css: minimal,
    sources: [{ file: "app/src/components/ui/example.tsx", content: `className="z-50"` }],
    section: "layers",
    requireComplete: false,
  });
  assert.ok(diagnostics.some(({ code }) => code === "RAW_GLOBAL_LAYER"));
});

test("baseline debt is capped per file", () => {
  const file = "app/src/app/(dashboard)/brand-kit/page.tsx";
  const oneExistingOccurrence = `className="text-[13px]"`;

  assert.deepEqual(validateContract({
    css: minimal,
    sources: [{ file, content: oneExistingOccurrence }],
    section: "dialect",
    requireComplete: false,
  }), []);
  assert.ok(validateContract({
    css: minimal,
    sources: [{ file, content: `${oneExistingOccurrence} ${oneExistingOccurrence}` }],
    section: "dialect",
    requireComplete: false,
  }).some(({ code }) => code === "ARBITRARY_VISUAL_DIALECT"));
});

test("malformed CSS is distinguished from contract assertions", () => {
  const diagnostics = validateContract({ css: `:root { --canvas: red`, requireComplete: false });
  assert.equal(diagnostics[0]?.code, "MALFORMED_CSS");
});

test("syntax and import failures remain non-assertion errors", async () => {
  await assert.rejects(import("data:text/javascript,export%20const%20=%201"), SyntaxError);
});
