import { describe, it, expect } from "vitest";
import sourceManifest from "../../../exports/render-creatives/manifest.json";
import {
  CANONICAL_CAMPAIGNS,
  CORPUS_MANIFEST_INDEX,
  matchCanonicalCampaignSlug,
  resolveAllowedEntitiesForCampaign,
  type CanonicalCampaignSlug,
  type CorpusManifestEntry,
} from "@/server/ai/creative-corpus";

const EXPECTED_SLUGS: CanonicalCampaignSlug[] = [
  "smoke",
  "nova-campanha",
  "teste-3-nr1",
  "teste-campanha-nr1",
];

const BANNED_ENTITY_TOKENS = [
  "Cantona",
  "Manchester United",
  "Adidas",
  "Jackie Groenen",
];

describe("CANONICAL_CAMPAIGNS registry", () => {
  it("defines exactly four canonical campaign slugs", () => {
    expect(Object.keys(CANONICAL_CAMPAIGNS).sort()).toEqual(
      [...EXPECTED_SLUGS].sort()
    );
  });

  it("gives each campaign non-empty displayNames and allowed entity lists", () => {
    for (const slug of EXPECTED_SLUGS) {
      const campaign = CANONICAL_CAMPAIGNS[slug];
      expect(campaign.slug).toBe(slug);
      expect(campaign.displayNames.length).toBeGreaterThan(0);
      expect(campaign.typicalModes.length).toBeGreaterThan(0);
      expect(campaign.typicalFormats.length).toBeGreaterThan(0);

      const { people, brands, products, claims } = campaign.allowedEntities;
      const entityCount =
        people.length + brands.length + products.length + claims.length;
      expect(entityCount).toBeGreaterThan(0);
    }
  });

  it("excludes known hallucinated entities from every allowlist", () => {
    const serialized = JSON.stringify(CANONICAL_CAMPAIGNS);
    for (const token of BANNED_ENTITY_TOKENS) {
      expect(serialized).not.toContain(token);
    }
  });

  it("contains no absolute filesystem paths or customer secrets", () => {
    const serialized = JSON.stringify(CANONICAL_CAMPAIGNS);
    expect(serialized).not.toMatch(/\/Users\//);
    expect(serialized).not.toMatch(/r2\.dev/);
    expect(serialized).not.toMatch(/output_key/);
  });
});

/** Debug campaigns excluded from the four-campaign audit baseline. */
const UNMAPPED_CAMPAIGN_NAMES = ["Teste_debuf", "Teste 5"] as const;

describe("matchCanonicalCampaignSlug", () => {
  it("maps CENBRAP NR1 to teste-3-nr1", () => {
    expect(matchCanonicalCampaignSlug("CENBRAP NR1", null)).toBe("teste-3-nr1");
  });

  it("maps Teste 3 display name to teste-3-nr1", () => {
    expect(matchCanonicalCampaignSlug("Teste 3", "CENBRAP")).toBe("teste-3-nr1");
  });

  it("maps smoke campaign display name", () => {
    expect(matchCanonicalCampaignSlug("Smoke v11.6 CQA-02", null)).toBe("smoke");
  });

  it("maps nova-campanha display name", () => {
    expect(matchCanonicalCampaignSlug("Nova campanha", null)).toBe("nova-campanha");
  });

  it("maps teste-campanha-nr1 via Master NR1 display name", () => {
    expect(matchCanonicalCampaignSlug("Teste campanha", "Master NR1")).toBe(
      "teste-campanha-nr1"
    );
  });

  it("returns null for unmapped campaigns", () => {
    expect(matchCanonicalCampaignSlug("Teste_debuf", null)).toBeNull();
    expect(matchCanonicalCampaignSlug("Teste 5", null)).toBeNull();
    expect(matchCanonicalCampaignSlug(null, null)).toBeNull();
  });
});

describe("resolveAllowedEntitiesForCampaign", () => {
  it("returns allowedEntities for mapped CENBRAP NR1 campaign", () => {
    const entities = resolveAllowedEntitiesForCampaign({
      name: "CENBRAP NR1",
      client: "CENBRAP",
    });
    expect(entities).toEqual(CANONICAL_CAMPAIGNS["teste-3-nr1"].allowedEntities);
  });

  it("returns null when campaign is unmapped", () => {
    expect(resolveAllowedEntitiesForCampaign({ name: "Teste 5" })).toBeNull();
    expect(resolveAllowedEntitiesForCampaign(null)).toBeNull();
  });
});

describe("CORPUS_MANIFEST_INDEX", () => {
  it("indexes every export in the source manifest", () => {
    expect(CORPUS_MANIFEST_INDEX).toHaveLength(sourceManifest.length);
  });

  it("distinguishes preview vs final render tiers from is_preview", () => {
    const previews = CORPUS_MANIFEST_INDEX.filter(
      (entry) => entry.renderTier === "preview"
    );
    const finals = CORPUS_MANIFEST_INDEX.filter(
      (entry) => entry.renderTier === "final"
    );

    expect(previews.length + finals.length).toBe(CORPUS_MANIFEST_INDEX.length);
    for (const entry of CORPUS_MANIFEST_INDEX) {
      expect(entry.renderTier).toBe(entry.is_preview ? "preview" : "final");
    }
  });

  it("maps canonical campaigns or documents unmapped debug exports", () => {
    for (const entry of CORPUS_MANIFEST_INDEX) {
      const campaign = CANONICAL_CAMPAIGNS[entry.canonicalSlug as CanonicalCampaignSlug];
      if (entry.canonicalSlug === "unmapped") {
        expect(UNMAPPED_CAMPAIGN_NAMES).toContain(entry.campaign);
        continue;
      }
      expect(campaign.displayNames).toContain(entry.campaign);
    }
  });

  it("keeps preview exports at 1:1 per audit observations", () => {
    const previews = CORPUS_MANIFEST_INDEX.filter(
      (entry) => entry.renderTier === "preview"
    );
    expect(previews.length).toBeGreaterThan(0);
    for (const entry of previews) {
      expect(entry.format).toBe("1:1");
    }
  });

  it("stores slim metadata only — no secrets or absolute paths", () => {
    const serialized = JSON.stringify(CORPUS_MANIFEST_INDEX);
    expect(serialized).not.toMatch(/\/Users\//);
    expect(serialized).not.toMatch(/r2\.dev/);
    expect(serialized).not.toMatch(/output_key/);
    expect(serialized).not.toMatch(/public_url/);

    const allowedKeys = new Set([
      "id",
      "idPrefix",
      "fileName",
      "campaign",
      "generation_mode",
      "format",
      "is_preview",
      "renderTier",
      "canonicalSlug",
      "auditArchetype",
    ]);
    for (const entry of CORPUS_MANIFEST_INDEX as CorpusManifestEntry[]) {
      expect(Object.keys(entry).every((key) => allowedKeys.has(key))).toBe(true);
      expect(entry.idPrefix).toBe(entry.id.slice(0, 8));
    }
  });
});
