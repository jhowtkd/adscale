import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { calibrationRules, calibrationSignals, campaignAssets, campaigns, clientProfiles, derivations, user, workspaces } from "@/server/db/schema";
import { __setImageProviderForTests } from "@/server/ai/image-generation";
import { E2EControlledImageProvider } from "@/server/ai/providers/e2e-controlled-provider";

vi.mock("./client", () => ({ inngest: {
  createFunction: (_options: unknown, fn: unknown) => ({ fn }),
  realtime: { publish: vi.fn().mockResolvedValue(undefined) },
} }));
vi.mock("@/server/storage", () => ({ objectStorage: {
  get: vi.fn().mockResolvedValue(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")),
  put: vi.fn().mockResolvedValue(undefined),
  getSignedUrl: vi.fn().mockResolvedValue(null),
} }));
vi.mock("../repositories/brand-kit", () => ({ getBrandKit: vi.fn().mockResolvedValue(null) }));
vi.mock("../memory/brand-memory-context", () => ({ getBrandMemoryContext: vi.fn().mockResolvedValue({ items: [], block: "" }) }));
vi.mock("../memory/campaign-memory-context", () => ({
  getCampaignMemoryPromptBlock: vi.fn().mockResolvedValue(""), recordCampaignMemoryEntry: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../repositories/usage", () => ({ trackUsage: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/server/generation/pipeline/post-generation", () => ({
  runDerivationScore: vi.fn().mockResolvedValue(undefined),
  runDerivationQualityGate: vi.fn().mockResolvedValue(undefined),
  runDerivationCorpusCapture: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../validation/env", async importOriginal => {
  const original = await importOriginal<typeof import("../validation/env")>();
  return { ...original, env: new Proxy(original.env, { get: (target, key) =>
    key === "OPENAI_API_KEY" ? "test-key" : key === "OPENAI_IMAGE_MODEL" ? "gpt-image-2-2026-04-21" : Reflect.get(target, key),
  }) };
});

import { derivationJob } from "./derivation";

const testUrl = process.env.TEST_DATABASE_URL ?? (process.env.CI ? process.env.DATABASE_URL : undefined);
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) {
    throw new Error("Legacy job guidance tests require matching local database URLs ending in _test");
  }
}
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
// The no-guidance fixture and six hashes were captured from the legacy job and verified on origin/main.
const baseline = readFileSync("tests/fixtures/legacy-derivation-prompt.txt", "utf8");
const baselineHashes = {
  uncalibrated: ["25123b58d731631dd8240a90fff5e8754f1b5c0a39dd437fd1547a52d99cc4fe", "780aad128597bd630939cf4fac2fccaca40730c757a0cae6c9853fa02e3cd869", "f2473c9536d4f86f03657ae33f99abd137e0b1e4eb08e981480371855cfcf959"],
  calibrated: ["7522f469f916d89683fe55d78047451966dd8eeb879628603299bcd36fabaf63", "eef9d882519286541e6aa619baee4ac6972438a6fcaf4cc241ce33229f30d9a5", "0c1f72d790940d819e6cf782816955dc6db1139692f6d4201504574fad663c6d"],
};

describe.skipIf(!testUrl)("Legacy job guidance through the real loader and freeze (Postgres)", () => {
  it.each([false, true].flatMap(calibrated => [0, 5, 10].map(count => ({ calibrated, count }))))(
    "delivers exact legacy bytes and persists exact identity with $count corpus rules and calibrated=$calibrated",
    async ({ calibrated, count }) => {
      const workspaceId = randomUUID(), clientProfileId = randomUUID(), campaignId = randomUUID(), derivationId = randomUUID(), reviewerId = randomUUID();
      const brandRules = ["figure", "gestalt", "voice", "invite", "hierarchy", "brand_nuance", "export_conflict"].map((category, index) => ({
        id: randomUUID(), category, rationale: `Literal ${category}`,
        updatedAt: new Date(Date.UTC(2026, 5, 20, 0, 0, -index)),
        baselineId: `brand-${category}`,
      }));
      const corpusRules = Array.from({ length: count }, (_, index) => ({
        id: randomUUID(), category: "corpus_quality", rationale: `Literal corpus ${index}`,
        approvedAt: new Date(Date.UTC(2026, 5, index + 1)), baselineId: `corpus-${index}`,
      }));
      const rules = [...(calibrated ? brandRules : []), ...corpusRules];
      const sections = [
        ...(calibrated ? [
          "BRAND TASTE CONSTRAINTS (approved calibration rules — bounded, do not override export safety):",
          ...brandRules.map(rule => `[brand-taste:${rule.baselineId}] ${rule.category}: ${rule.rationale}`),
          "These constraints refine brand-specific taste on top of global Olhar ADScale. Do not weaken factual text, CTA spelling, or export compliance.",
        ] : []),
        ...(count ? [
          "CORPUS QUALITY CONSTRAINTS (human-evaluated patterns for this brand):",
          ...corpusRules.map(rule => `[corpus-quality:${rule.baselineId}] corpus_quality: ${rule.rationale}`),
          "Do not weaken factual text, CTA spelling, or export compliance.",
        ] : []),
      ];
      let expectedPrompt = sections.length ? baseline.replace("\nMODE:", `\n${sections.join("\n")}\nMODE:`) : baseline;
      expect(sha256(expectedPrompt)).toBe(baselineHashes[calibrated ? "calibrated" : "uncalibrated"][count / 5]);
      // Substitute only fixture IDs in the expected bytes; the captured request remains untouched.
      for (const rule of rules) expectedPrompt = expectedPrompt.replaceAll(rule.baselineId, rule.id);
      const refs = rules.map(rule => ({ ruleId: rule.id, revision: "legacy", contentHash: sha256(rule.rationale) }));
      const canonicalRefs = [...refs].sort((a, b) => a.ruleId < b.ruleId ? -1 : 1)
        .map(ref => ({ contentHash: ref.contentHash, revision: ref.revision, ruleId: ref.ruleId }));
      const setHash = refs.length ? sha256(JSON.stringify(canonicalRefs)) : null;
      const provider = E2EControlledImageProvider.forUnitTests();
      const generate = vi.spyOn(provider, "generate");
      __setImageProviderForTests(provider);
      vi.stubEnv("E2E_PROVIDER_EVIDENCE_PATH", ".verification-672/r2-provider-calls.jsonl");
      try {
        await db.insert(workspaces).values({ id: workspaceId, name: "Legacy test", slug: workspaceId });
        await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Legacy test" });
        await db.insert(campaigns).values({ id: campaignId, workspaceId, clientProfileId, name: "Test Campaign", client: "Acme", product: "Widget", offer: "20% off", status: "generating" });
        await db.insert(derivations).values({ id: derivationId, campaignId, workspaceId, generationMode: "art_variation", format: "1:1", ctaText: "Shop Now", variantIndex: 0 });
        await db.insert(campaignAssets).values({ campaignId, workspaceId, key: "assets/campaign.png", type: "image/png", size: 1000, width: 1080, height: 1080, role: "base", analysisStatus: null });
        await db.insert(calibrationRules).values([...brandRules, ...corpusRules].map(rule => ({
          id: rule.id, category: rule.category, rationale: rule.rationale, workspaceId, clientProfileId, status: "approved",
          ...("updatedAt" in rule ? { updatedAt: rule.updatedAt } : { approvedAt: rule.approvedAt }),
        })));
        if (calibrated) {
          await db.insert(user).values({ id: reviewerId, name: "Legacy reviewer", email: `${reviewerId}@example.test` });
          const evidenceIds = Array.from({ length: 5 }, () => randomUUID());
          await db.insert(derivations).values(evidenceIds.map(id => ({ id, campaignId, workspaceId, status: "completed" })));
          await db.insert(calibrationSignals).values(evidenceIds.map(id => ({ workspaceId, clientProfileId, campaignId, derivationId: id, reviewerId, humanVerdict: "entra", sourceLabel: "synthetic_fixture", systemOlharVerdict: "pronta", systemExportStatus: "pronta", reviewedAt: new Date("2026-06-20T12:00:00Z") })));
        }
        const step = { run: async <T,>(_name: string, fn: () => Promise<T>) => fn(), realtime: { publish: async () => undefined } };
        const job = derivationJob as unknown as { fn: (input: { event: { data: Record<string, unknown> }; step: typeof step }) => Promise<unknown> };
        await job.fn({ event: { data: { derivationId, campaignId, workspaceId, locale: "en", generationMode: "art_variation", variantIndex: 0, ctaText: "Shop Now", format: "1:1" } }, step });
        expect(generate).toHaveBeenCalledTimes(1);
        expect(generate.mock.calls[0][0].prompt).toBe(expectedPrompt);
        const [row] = await db.select().from(derivations).where(eq(derivations.id, derivationId));
        expect(row.status).toBe("completed");
        expect(row.frozenLegacyGuidance?.appliedRefs).toEqual(refs);
        expect(row.legacyGuidanceApplications).toEqual([{
          callId: expect.any(String), callName: "initial", consumer: "legacy_derivation", role: "legacy_derivation",
          appliedRefs: refs, setHash, fixedPromptVersion: "unknown", situation: refs.length ? "applied" : "no_guidance",
        }]);
      } finally {
        __setImageProviderForTests(null);
        vi.unstubAllEnvs();
        await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
        await db.delete(user).where(eq(user.id, reviewerId));
      }
    },
  );
});
