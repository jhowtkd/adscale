import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { checkJevDependencies } from "./check-jev-dependencies.mjs";

// Disposable fixture trees: the real gate runs against a minimal app root with
// the exact allowlisted file names. Nothing here touches the real source tree.
const roots = [];
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

const JOB = "src/server/jobs/semantic-review.ts";
const COLLECTOR = "src/server/creative-work/semantic-review-collector.ts";
const PROCESSOR = "src/server/creative-work/semantic-review-processor.ts";
const RETENTION = "src/server/creative-work/semantic-review-retention-repository.ts";
const ROUTE = "src/app/api/inngest/route.ts";

const BASE = {
  "tsconfig.json": JSON.stringify({ compilerOptions: { target: "es2022", module: "esnext", moduleResolution: "bundler", baseUrl: ".", paths: { "@/*": ["src/*"] } } }),
  [JOB]: `import "server-only";\nimport "../creative-work/semantic-review-collector";\nimport "../creative-work/semantic-review-processor";\nimport "../creative-work/semantic-review-retention-repository";\nexport const semanticReviewObserverJob = 1;\n`,
  [COLLECTOR]: `import "server-only";\nexport const collect = 1;\n`,
  [PROCESSOR]: `import "server-only";\nexport const processor = 1;\n`,
  [RETENTION]: `import "server-only";\nexport const retention = 1;\n`,
  [ROUTE]: `import { semanticReviewObserverJob } from "@/server/jobs/semantic-review";\nexport const functions = [semanticReviewObserverJob];\n`,
  "src/server/application/command.ts": `export const command = 1;\n`,
  "src/server/billing/credits.ts": `export const credits = 1;\n`,
  "src/server/repositories/usage.ts": `export const usage = 1;\n`,
  "src/server/jobs/selection-effects-processor.ts": `export const effects = 1;\n`,
  "src/server/services/export.ts": `export const exporter = 1;\n`,
  "src/server/creative-work/new-helper.ts": `export const helper = 1;\n`,
  "src/lib/logger.ts": `export const logger = 1;\n`,
};

/** Builds a fresh tree: BASE + overrides (null removes a file). */
function fixture(overrides = {}, ancestor = "") {
  const base = mkdtempSync(join(tmpdir(), "adscale-jev-deps-"));
  roots.push(base);
  // `ancestor` nests the app root under e.g. "tests/app": production-source filters must be root-relative.
  const root = ancestor ? join(base, ancestor) : base;
  const files = { ...BASE, ...overrides };
  for (const [path, content] of Object.entries(files)) {
    if (content === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}
const run = (overrides, ancestor) => checkJevDependencies({ appRoot: fixture(overrides, ancestor) });
const rejects = (overrides, pattern, ancestor) => assert.throws(() => run(overrides, ancestor), pattern);

test("the minimal fixture passes and reports closure counts", () => {
  const result = run();
  assert.equal(result.violations, 0);
  assert.equal(result.pilotExecutableFiles, 4);
  assert.equal(result.pilotPackages, 1);
  assert.ok(result.protectedFiles > 0);
});

test("the served route and the pilot internals may import the pilot", () => {
  assert.equal(run().violations, 0);
  assert.equal(run({ [PROCESSOR]: `import "server-only";\nimport "./semantic-review-http";\n`, "src/server/creative-work/semantic-review-http.ts": `export const http = 1;\n` }).violations, 0);
});

test("allowlisted helpers and packages are accepted (controls)", () => {
  assert.equal(run({ [PROCESSOR]: `import "server-only";\nimport { logger } from "@/lib/logger";\nimport { z } from "zod";\nexport const p = [logger, z];\n` }).pilotPackages, 2);
});

test("pilot -> protected business modules is rejected", () => {
  rejects({ [PROCESSOR]: `import { usage } from "@/server/repositories/usage";\nexport const x = usage;\n` }, /Unreviewed pilot dependency.*repositories\/usage/);
  rejects({ [PROCESSOR]: `import { credits } from "@/server/billing/credits";\nexport const x = credits;\n` }, /Unreviewed pilot dependency.*billing\/credits/);
  rejects({ [RETENTION]: `import { effects } from "../jobs/selection-effects-processor";\nexport const x = effects;\n` }, /Unreviewed pilot dependency.*selection-effects-processor/);
  rejects({ [COLLECTOR]: `import { exporter } from "@/server/services/export";\nexport const x = exporter;\n` }, /Unreviewed pilot dependency.*services\/export/);
  rejects({ [JOB]: BASE[JOB] + `import "../application/command";\n` }, /Unreviewed pilot dependency.*application\/command/);
});

test("an unknown new helper is rejected until reviewed", () => {
  rejects({ [PROCESSOR]: `import { helper } from "./new-helper";\nexport const x = helper;\n` }, /Unreviewed pilot dependency.*new-helper/);
});

test("an unreviewed npm package (stripe) is rejected", () => {
  rejects({ [COLLECTOR]: `import Stripe from "stripe";\nexport const x = Stripe;\n` }, /Unreviewed pilot dependency.*npm:stripe/);
  rejects({ [COLLECTOR]: `const s = require("openai");\nexport const x = s;\n` }, /Unreviewed pilot dependency.*npm:openai/);
});

test("re-exports and literal dynamic imports count as executable edges", () => {
  rejects({ [PROCESSOR]: `export * from "@/server/billing/credits";\n` }, /Unreviewed pilot dependency.*billing\/credits/);
  rejects({ [PROCESSOR]: `export { credits } from "@/server/billing/credits";\n` }, /Unreviewed pilot dependency.*billing\/credits/);
  rejects({ [PROCESSOR]: `export async function load() { return import("@/server/billing/credits"); }\n` }, /Unreviewed pilot dependency.*billing\/credits/);
  rejects({ [PROCESSOR]: `import credits = require("@/server/billing/credits");\nexport { credits };\n` }, /Unreviewed pilot dependency.*billing\/credits/);
});

test("type-only imports are erased and do not count, in either direction", () => {
  assert.equal(run({
    [PROCESSOR]: `import type { credits } from "@/server/billing/credits";\nimport { type usage } from "@/server/repositories/usage";\nexport type { credits as C } from "@/server/billing/credits";\nexport const p = 1;\nexport type U = typeof usage;\n`,
    "src/server/application/command.ts": `import type { processor } from "@/server/creative-work/semantic-review-processor";\nimport { type collect } from "@/server/creative-work/semantic-review-collector";\nexport const command = 1;\n`,
  }).violations, 0);
});

test("a computed import inside the pilot closure fails closed", () => {
  rejects({ [PROCESSOR]: `const name = "../billing/credits";\nexport const load = () => import(name);\n` }, /Unresolved pilot dependency.*non-literal/);
  rejects({ [COLLECTOR]: `declare const name: string;\nexport const load = () => require(name);\n` }, /Unresolved pilot dependency/);
});

test("an unresolvable local import inside the pilot closure fails closed", () => {
  rejects({ [PROCESSOR]: `import "./does-not-exist";\n` }, /Unresolved pilot dependency|Unreviewed pilot dependency/);
});

test("inbound: protected sources importing the pilot are rejected", () => {
  rejects({ "src/server/jobs/selection-effects-processor.ts": `import { semanticReviewObserverJob } from "./semantic-review";\nexport const x = semanticReviewObserverJob;\n` }, /Protected source imports pilot.*selection-effects-processor/);
  rejects({ "src/server/services/export.ts": `import { collect } from "../creative-work/semantic-review-collector";\nexport const x = collect;\n` }, /Protected source imports pilot.*services\/export/);
  rejects({ "src/server/application/command.ts": `import { semanticReviewObserverJob } from "@/server/jobs/semantic-review";\nexport const x = semanticReviewObserverJob;\n` }, /Protected source imports pilot.*application\/command/);
  rejects({ "src/server/billing/credits.ts": `export { retention } from "../creative-work/semantic-review-retention-repository";\n` }, /Protected source imports pilot.*billing\/credits/);
  rejects({ "src/server/billing/credits.ts": `export const load = () => import("../creative-work/semantic-review-processor");\n` }, /Protected source imports pilot/);
});

test("inbound: importing the served route transitively is also refused", () => {
  rejects({ "src/server/application/command.ts": `import { functions } from "@/app/api/inngest/route";\nexport const x = functions;\n` }, /Protected source imports pilot.*application\/command.*route/);
});

test("a protected file that does not touch the pilot is fine (control)", () => {
  assert.equal(run({ "src/server/application/command.ts": `import { credits } from "@/server/billing/credits";\nexport const command = credits;\n` }).violations, 0);
});

test("test files and helpers outside production source are ignored by the inversion", () => {
  assert.equal(run({
    "src/server/application/command.test.ts": `import "@/server/creative-work/semantic-review-collector";\n`,
    "src/server/creative-work/semantic-review-collection.pg-helpers.ts": `import "@/server/billing/credits";\n`,
  }).violations, 0);
});

const EXPORT_REPOSITORY = "src/server/creative-work/semantic-review-export-repository.ts";
const SCRIPT = "scripts/jev-evaluate.ts";

test("an app root under an ancestor named tests/ is still fully inspected (root-relative filters)", () => {
  assert.equal(run({}, "tests/app").violations, 0);
  rejects({ "src/server/application/command.ts": `import { semanticReviewObserverJob } from "@/server/jobs/semantic-review";\nexport const x = semanticReviewObserverJob;\n` },
    /Protected source imports pilot.*application\/command/, "tests/app");
  rejects({ [PROCESSOR]: `import { credits } from "@/server/billing/credits";\nexport const x = credits;\n` }, /Unreviewed pilot dependency/, "tests/app");
});

test("every pilot module is a root, not only the four entry files", () => {
  rejects({ [EXPORT_REPOSITORY]: `import "server-only";\nimport { charge } from "../billing/charge";\nexport const x = charge;\n`,
    "src/server/billing/charge.ts": `export const charge = 1;\n` }, /Unreviewed pilot dependency.*billing\/charge/);
  assert.equal(run({ [EXPORT_REPOSITORY]: `import "server-only";\nexport const exported = 1;\n` }).violations, 0);
});

test("jev operator scripts are roots too (script -> billing is rejected)", () => {
  rejects({ [SCRIPT]: `import { credits } from "../src/server/billing/credits";\nexport const x = credits;\n` }, /Unreviewed pilot dependency.*billing\/credits/);
});

test("the served route must exist and executably import the job", () => {
  rejects({ [ROUTE]: null }, /route/i);
  rejects({ [ROUTE]: `export const functions = [];\n` }, /route|semantic-review|job/i);
  rejects({ [ROUTE]: `import type { semanticReviewObserverJob } from "@/server/jobs/semantic-review";\nexport const functions = [];\n` }, /route|semantic-review|job/i);
});

test("a protected command cannot bridge into the pilot through an audited Jev CLI", () => {
  const bridge = {
    [SCRIPT]: `import { collect } from "../src/server/creative-work/semantic-review-collector";\nexport const main = collect;\n`,
    "src/server/application/example.ts": `import { main } from "../../../scripts/jev-evaluate";\nexport const example = main;\n`,
  };
  rejects(bridge, /Protected source imports pilot.*application\/example/);
  // The same bridge through the path alias-free relative form from a nested protected module.
  rejects({ ...bridge, "src/server/application/example.ts": null, "src/server/billing/credits.ts": `export { main } from "../../../scripts/jev-evaluate";\n` },
    /Protected source imports pilot.*billing\/credits/);
});

test("any src import of a Jev CLI is refused by name, even when the CLI is pure (conservative by design)", () => {
  rejects({
    [SCRIPT]: `export const main = 1;\n`,
    "src/server/application/example.ts": `import { main } from "../../../scripts/jev-evaluate";\nexport const example = main;\n`,
  }, /Protected source imports pilot.*application\/example.*jev-evaluate/);
});

test("a Jev CLI may import the pilot itself (control)", () => {
  assert.equal(run({ [SCRIPT]: `import { collect } from "../src/server/creative-work/semantic-review-collector";\nexport const main = collect;\n` }).violations, 0);
});
