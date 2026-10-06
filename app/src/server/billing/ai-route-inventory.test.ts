// Inventory of the routes that reach a classic AI model (ticket 11, part 2). The free plan gets the Strategist (Equipe
// ledger, US$ 1 per account) and no classic AI that has no counter. So every API route that can reach a file that calls a
// model has to say which of three things it is:
//   (a) GUARDED: `refuseOnFreePlan(` at its entry, before anything is written or enqueued;
//   (b) CREDITED: its spend goes through the credits (`canSpend`), which refuses the free plan on its own;
//   (c) KEPT on purpose, with the reason (the Equipe's own ledger, event-driven jobs, a frozen module...).
// A route that reaches a model file and is in none of the lists fails here: that is the moment to decide. The graph is
// the static imports (`import`/`export ... from`, and `import()`), resolved from each route.ts through `@/` and relative
// paths; type-only imports do not count. Eight AI modules that every credited path reaches through a hub are the BASE:
// they are not counted as targets (they are only ever reached from routes that the credits or the guards already cover).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

const rel = (path: string) => relative(SRC, path).split(sep).join("/");
const TEXT = new Map(sourceFiles(SRC).map((path) => [path, readFileSync(path, "utf8")]));

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? join(dirname(from), spec) : null;
  if (!base) return null;
  return [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")].find((c) => existsSync(c) && statSync(c).isFile() && TEXT.has(c)) ?? null;
}

const importsCache = new Map<string, string[]>();
function importsOf(file: string): string[] {
  const cached = importsCache.get(file);
  if (cached) return cached;
  const text = TEXT.get(file)!;
  const found = new Set<string>();
  for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^"'`;]*?\sfrom\s*)?["']([^"']+)["']/g)) {
    if (m[1]) continue;
    const target = resolveImport(file, m[2]);
    if (target) found.add(target);
  }
  for (const m of text.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
    const target = resolveImport(file, m[1]);
    if (target) found.add(target);
  }
  const result = [...found];
  importsCache.set(file, result);
  return result;
}

function reachable(start: string): Set<string> {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) for (const next of importsOf(stack.pop()!)) if (!seen.has(next)) { seen.add(next); stack.push(next); }
  return seen;
}

// What calls a model: the OpenAI and Anthropic clients and their endpoints, speech-to-text, image generation/editing,
// and the layerization provider (an image model behind its own client).
const MODEL_CALLS = [
  /\bgetOpenAI\(/, /new OpenAI\(/, /new Anthropic\(/, /\.responses\.create\(/, /\.chat\.completions\.create\(/,
  /audio\.transcriptions/, /\.images\.(generate|edit)\(/, /\bmessages\.create\(/,
];
const callsModel = (path: string) => MODEL_CALLS.some((pattern) => pattern.test(TEXT.get(path)!)) || rel(path) === "server/layerize/seedream-provider.ts";

const BASE = new Set([
  "server/ai/brand-kit-extractor.ts",
  "server/ai/competitor-analyzer.ts",
  "server/ai/creative-qa.ts",
  "server/ai/creative-score.ts",
  "server/ai/image-analysis.ts",
  "server/ai/preflight-analysis.ts",
  "server/ai/utils.ts",
  "server/ai/providers/openai-image-provider.ts",
]);

const MODEL_FILES = [...TEXT.keys()].filter(callsModel).filter((path) => !BASE.has(rel(path)));
const MODEL_SET = new Set(MODEL_FILES);
const ROUTES = [...TEXT.keys()].filter((path) => /^app\/api\/.*\/route\.ts$/.test(rel(path)));
const reachedModels = (route: string) => [...reachable(route)].filter((path) => MODEL_SET.has(path)).map(rel).sort();
const MODEL_ROUTES = ROUTES.filter((route) => reachedModels(route).length > 0).map(rel).sort();
const textOf = (file: string) => TEXT.get(join(SRC, file)) ?? "";

/** (a) Every route that carries the guard: the AI ones below and the routes that only write (training upload, Trabalho creation) or sell (checkout). */
const GUARDED_ROUTES = [
  "app/api/assistant/threads/[threadId]/guided-flow/commands/route.ts",
  "app/api/billing/checkout/route.ts",
  "app/api/campaigns/[id]/analyze/route.ts",
  "app/api/campaigns/[id]/smart-resize-preview/route.ts",
  "app/api/campaigns/[id]/suggest-ctas/route.ts",
  "app/api/client-profiles/[id]/brand-knowledge/route.ts",
  "app/api/client-profiles/[id]/training-assets/[referenceId]/route.ts",
  "app/api/client-profiles/[id]/training-assets/route.ts",
  "app/api/creative-work/[id]/carousel/plan/route.ts",
  "app/api/creative-work/[id]/carousel/revise/route.ts",
  "app/api/creative-work/[id]/carousel/slides/[slideId]/revise/route.ts",
  "app/api/creative-work/[id]/route.ts",
  "app/api/creative-work/[id]/suggest/route.ts",
  "app/api/creative-work/dictation/route.ts",
  "app/api/creative-work/entry-request/route.ts",
  "app/api/creative-work/route.ts",
];

/** (b) Routes whose AI is paid by credits: `canSpend` refuses the free plan before the debit, and the route answers with its code and CTA. */
const CREDITED_ROUTES = [
  "app/api/assistant/actions/[actionId]/confirm/route.ts",
  "app/api/campaigns/[id]/diagnosis/regenerate/route.ts",
  "app/api/campaigns/[id]/diagnosis/route.ts",
  "app/api/campaigns/[id]/plan/route.ts",
  "app/api/client-profiles/[id]/brand-knowledge/calibration/route.ts",
  "app/api/client-profiles/[id]/voice/extract/route.ts",
  "app/api/creative-work/[id]/copy/route.ts",
  "app/api/creative-work/[id]/generate/route.ts",
  "app/api/derivations/[id]/copy-variants/route.ts",
  "app/api/derivations/[id]/landing-page/route.ts",
];

/** (c) Kept on purpose. `match` picks the routes; `reason` says why; `evidence` is what the code must still show. */
const KEPT: Array<{ name: string; match: (route: string) => boolean; reason: string; evidence: () => void }> = [
  {
    name: "the Equipe's own routes",
    match: (route) => route.startsWith("app/api/equipe/"),
    reason: "the Strategist and the handoff reading run on the Equipe ledger (US$ 1 per account, 3 reads): the free plan's own product",
    evidence: () => {
      const offenders = [...TEXT.keys()].map(rel).filter((file) => (file.startsWith("app/api/equipe/") || file.startsWith("server/equipe/")) && textOf(file).includes("refuseOnFreePlan"));
      expect(offenders).toEqual([]);
    },
  },
  {
    name: "the Strategist's chat",
    match: (route) => route === "app/api/assistant/threads/[threadId]/chat/route.ts",
    reason: "an Equipe thread runs the Strategist; a campaign thread on the free plan is refused (403 free_plan) by findFreePlanAccount in the route itself",
    evidence: () => {
      const text = textOf("app/api/assistant/threads/[threadId]/chat/route.ts");
      expect(text).toContain("findFreePlanAccount(");
      expect(text).not.toContain("refuseOnFreePlan");
      expect(text).toContain("equipeMatch");
    },
  },
  {
    name: "the MCP",
    match: (route) => route === "app/api/mcp/route.ts",
    reason: "the tools that start work (criarTrabalho, gerarPeca) refuse the free plan at their entry inside server/mcp/tools.ts; the others only read",
    evidence: () => {
      const text = textOf("server/mcp/tools.ts");
      expect(text).toContain("findFreePlanAccount(");
      expect(text.match(/await freePlanRefusal\(/g)).toHaveLength(2);
    },
  },
  {
    name: "the Inngest endpoint",
    match: (route) => route === "app/api/inngest/route.ts",
    reason: "event-driven jobs: they only run for work that a guarded or credited route (or the Equipe) enqueued; the asset analysis job re-checks shouldAnalyzeWorkspaceAssets",
    evidence: () => expect(textOf("server/jobs/workspace-asset.ts")).toContain("shouldAnalyzeWorkspaceAssets("),
  },
  {
    name: "persona simulation",
    match: (route) => route === "app/api/creatives/[id]/persona-simulation/route.ts",
    reason: "frozen module (convergence gate, critical fixes only); it needs a generated derivation or landing page, which the free plan cannot make",
    evidence: () => expect(textOf("app/api/creatives/[id]/persona-simulation/route.ts")).not.toContain("refuseOnFreePlan"),
  },
  {
    name: "cancelling a plan proposal",
    match: (route) => route === "app/api/assistant/artifact-proposals/[proposalId]/cancel/route.ts",
    reason: "it only calls cancelPlanRevision (a state change); the model call of that module is proposePlanRevision, which this route never reaches",
    evidence: () => {
      const text = textOf("app/api/assistant/artifact-proposals/[proposalId]/cancel/route.ts");
      expect(text).toContain("cancelPlanRevision(");
      expect(text).not.toMatch(/proposePlanRevision|getOpenAI|chat\.completions/);
    },
  },
];

const groupOf = (route: string): string[] => [
  ...(GUARDED_ROUTES.includes(route) ? ["guarded"] : []),
  ...(CREDITED_ROUTES.includes(route) ? ["credited"] : []),
  ...KEPT.filter((entry) => entry.match(route)).map((entry) => `kept:${entry.name}`),
];

describe("the classic AI route inventory", () => {
  it("sees the source tree and the model files (the guards below are not vacuous)", () => {
    expect(ROUTES.length).toBeGreaterThan(150);
    expect(MODEL_FILES.length).toBeGreaterThan(25);
    expect(MODEL_FILES.map(rel)).toEqual(expect.arrayContaining(["server/layerize/seedream-provider.ts", "server/dictation/service.ts", "server/equipe/agents/anthropic-client.ts"]));
    for (const base of BASE) {
      expect(TEXT.has(join(SRC, base)), base).toBe(true);
      expect(callsModel(join(SRC, base)), base).toBe(true);
    }
  });

  it("every route that reaches a model file is in exactly one group: guarded, credited or kept on purpose", () => {
    const placed = MODEL_ROUTES.map((route) => [route, groupOf(route)] as const);
    const unplaced = placed.filter(([, groups]) => groups.length === 0).map(([route]) => route);
    const doubled = placed.filter(([, groups]) => groups.length > 1).map(([route, groups]) => `${route} -> ${groups.join(", ")}`);

    expect(unplaced, "a new route reaches a classic AI model with no free plan decision: guard it, credit it or keep it with a reason").toEqual([]);
    expect(doubled).toEqual([]);
  });

  it("no list has a stale entry: every listed route exists and still reaches a model file (guarded routes that only write are listed apart)", () => {
    const WRITE_ONLY_GUARDED = [
      "app/api/billing/checkout/route.ts",
      "app/api/client-profiles/[id]/training-assets/[referenceId]/route.ts",
      "app/api/client-profiles/[id]/training-assets/route.ts",
      "app/api/creative-work/route.ts",
    ];
    const modelRoutes = new Set(MODEL_ROUTES);
    for (const route of [...GUARDED_ROUTES, ...CREDITED_ROUTES, ...KEPT.flatMap((entry) => ROUTES.map(rel).filter(entry.match))]) {
      expect(TEXT.has(join(SRC, route)), `${route} does not exist`).toBe(true);
    }
    for (const route of [...GUARDED_ROUTES.filter((r) => !WRITE_ONLY_GUARDED.includes(r)), ...CREDITED_ROUTES]) {
      expect(modelRoutes.has(route), `${route} no longer reaches a model file: drop it from its list`).toBe(true);
    }
    for (const entry of KEPT) {
      expect(ROUTES.map(rel).some(entry.match), `${entry.name} matches no route`).toBe(true);
    }
  });

  it("the guard is on exactly the guarded routes: no other route calls refuseOnFreePlan, and none of them lost it", () => {
    const withGuard = [...TEXT.keys()].map(rel).filter((file) => file.startsWith("app/api/") && textOf(file).includes("refuseOnFreePlan(")).sort();

    expect(withGuard).toEqual([...GUARDED_ROUTES].sort());
  });

  it("outside the routes, only the paywall defines refuseOnFreePlan", () => {
    const outside = [...TEXT.keys()].map(rel).filter((file) => !file.startsWith("app/api/") && textOf(file).includes("refuseOnFreePlan(")).sort();

    expect(outside).toEqual(["server/billing/paywall.ts"]);
  });

  it.each(CREDITED_ROUTES)("credited route %s: its own file or a spend caller on its path charges the credits", (route) => {
    // The files that start a spend (the list of server/billing/spend-inventory.test.ts), minus the paywall and credits modules
    // that every route that imports them would match.
    const SPEND = /(?<![.\w])(spendOrApiError|spend|checkSpend|chargeForGeneration\w*)\(|creditBlockedApiError\(|recordUsage\(/;
    const own = SPEND.test(textOf(route));
    const onPath = [...reachable(join(SRC, route))].map(rel).filter((file) => !["server/billing/paywall.ts", "server/billing/credits.ts"].includes(file)).some((file) => SPEND.test(textOf(file)));

    expect(own || onPath).toBe(true);
  });

  it.each(KEPT.map((entry) => [entry.name, entry] as const))("kept on purpose: %s", (_name, entry) => {
    expect(entry.reason.length).toBeGreaterThan(20);
    entry.evidence();
  });
});
