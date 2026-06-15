import { describe, it, expect } from "vitest";
import {
  CANONICAL_CAMPAIGNS,
  type CanonicalCampaignSlug,
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
