// Static inventory of every place that spends credit (ticket 11, part 2). The free plan's refusal lives in ONE point,
// `canSpend` (credits.ts), which every debit passes. These guards fix that shape: nothing writes the grants outside the
// billing module, `recordUsage` has three callers, and the list of files that start a spend is explicit. A NEW file
// that spends credit has to be added here on purpose: that is the moment to check that it refuses on the free plan
// (the runtime test of one such route is app/api/campaigns/[id]/plan/route.test.ts) and that its 402 carries the CTA.
//
// The Estrategista is the other half of the rule: its spend is the Equipe ledger, so nothing under equipe/agents may
// reach this module (the free account runs on that ledger, US$ 1 per account).
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../../", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

const FILES = sourceFiles(SRC).map((path) => ({
  file: relative(SRC, path).split(sep).join("/"),
  text: readFileSync(path, "utf8"),
}));

const filesWhere = (test: (text: string) => boolean) => FILES.filter(({ text }) => test(text)).map(({ file }) => file).sort();

describe("the credit spend inventory", () => {
  it("sees the source tree (the guards below are not vacuous)", () => {
    expect(FILES.length).toBeGreaterThan(500);
    expect(FILES.map((f) => f.file)).toContain("server/billing/credits.ts");
  });

  it("the grants are written only by the billing module (and its repository's definition)", () => {
    expect(filesWhere((text) => /\bupdateCreditGrantRemaining\(/.test(text))).toEqual([
      "server/billing/credits.ts",
      "server/repositories/billing.ts",
    ]);
  });

  it("canSpend is called only by credits.ts itself (everyone else goes through recordUsage or checkSpend)", () => {
    expect(filesWhere((text) => /(?<![.\w])canSpend\(/.test(text))).toEqual(["server/billing/credits.ts"]);
  });

  it("recordUsage from the credits module is called only by credits.ts, paywall.ts and the settlement adapters", () => {
    const importsCreditsRecordUsage = (text: string) =>
      [...text.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)].some(
        ([, names, spec]) => /\brecordUsage\b/.test(names) && /(^|\/)billing\/credits$|^\.\/credits$/.test(spec),
      );
    const callers = filesWhere((text) => importsCreditsRecordUsage(text) && /\brecordUsage\(/.test(text));
    const definer = filesWhere((text) => /export async function recordUsage\(/.test(text));

    expect(definer).toEqual(["server/billing/credits.ts"]);
    expect([...new Set([...definer, ...callers])]).toEqual([
      "server/billing/credits.ts",
      "server/billing/paywall.ts",
      "server/generation/settlement-adapters.ts",
    ]);
  });

  it("the files that start a spend (spendOrApiError / spend / chargeForGeneration* / checkSpend) are exactly these", () => {
    expect(filesWhere((text) => /(?<![.\w])(spendOrApiError|spend|checkSpend|chargeForGeneration\w*)\(/.test(text))).toEqual([
      "app/api/campaigns/[id]/assets/[assetId]/preflight/route.ts",
      "app/api/campaigns/[id]/auto-briefing/route.ts",
      "app/api/campaigns/[id]/competitors/analyze/route.ts",
      "app/api/campaigns/[id]/competitors/strategy/route.ts",
      "app/api/campaigns/[id]/diagnosis/regenerate/route.ts",
      "app/api/campaigns/[id]/diagnosis/route.ts",
      "app/api/campaigns/[id]/plan/route.ts",
      "app/api/client-profiles/[id]/voice/extract/route.ts",
      "app/api/derivations/[id]/copy-variants/route.ts",
      "app/api/derivations/[id]/landing-page/route.ts",
      "app/api/derivations/[id]/qa/route.ts",
      "app/api/workspace/brand-kit/extract-multi/route.ts",
      "app/api/workspace/brand-kit/extract/route.ts",
      "server/application/generate-carousel-work.ts",
      "server/application/generate-social-post-copy.ts",
      "server/assistant/action-contracts/validate.ts",
      "server/assistant/action-execution/handlers/create-creative-plan.ts",
      "server/assistant/action-execution/handlers/start-complete-campaign.ts",
      "server/billing/paywall.ts",
      "server/generation/canonical/charge.ts",
      "server/generation/settlement-adapters.ts",
    ]);
  });

  it("the routes that answer a blocked spend with their own code go through creditBlockedApiError", () => {
    const own = [
      "app/api/creative-work/[id]/generate/route.ts",
      "app/api/creative-work/[id]/outputs/[outputId]/retry/route.ts",
      "app/api/assistant/actions/[actionId]/confirm/route.ts",
      "app/api/client-profiles/[id]/brand-knowledge/calibration/route.ts",
      "app/api/campaigns/[id]/derivations/route.ts",
    ];
    for (const file of own) {
      const text = FILES.find((f) => f.file === file)?.text ?? "";
      expect(text, file).toContain("creditBlockedApiError(");
      // No bare 402 for credit left behind in those routes, except the fallback for an error raised before the
      // workspace is known (`workspaceId ? creditBlockedApiError(...) : apiError(...)`).
      const withoutFallback = text.replace(/:\s*apiError\("insufficientCredits", 402\)/g, "");
      expect(withoutFallback, file).not.toMatch(/apiError\(\s*"(insufficientCredits|creditBlocked)"\s*,\s*402/);
    }
  });
});

describe("the Estrategista spends on the Equipe ledger, never on credits", () => {
  it("nothing under equipe/agents imports the credits or the paywall module", () => {
    const agents = FILES.filter(({ file }) => file.startsWith("server/equipe/agents/"));
    expect(agents.length).toBeGreaterThan(3);
    for (const { file, text } of agents) {
      expect(text, file).not.toMatch(/billing\/(credits|paywall)/);
      expect(text, file).not.toMatch(/from\s*["']\.{1,2}\/(\.\.\/)*billing\//);
    }
  });

  it("nothing under equipe imports them either: the Equipe module does not depend on the credit billing", () => {
    expect(filesWhere((text) => /billing\/(credits|paywall)/.test(text)).filter((file) => file.startsWith("server/equipe/"))).toEqual([]);
  });
});
