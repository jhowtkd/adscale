import { describe, expect, it } from "vitest";
import {
  appendCampaignMemoryEntry,
  buildCampaignMemoryPromptBlock,
  normalizeCampaignMemory,
} from "./campaign-memory";

describe("campaign-memory", () => {
  it("builds a bounded prompt block from entries", () => {
    const memory = appendCampaignMemoryEntry(null, {
      type: "approved_cta",
      text: 'Approved CTA: "Ver lista completa"',
    });

    const block = buildCampaignMemoryPromptBlock(memory);
    expect(block).toContain("CAMPAIGN MEMORY");
    expect(block).toContain("Ver lista completa");
    expect(block).toContain("must not override the literal CTA");
  });

  it("deduplicates identical entries", () => {
    const first = appendCampaignMemoryEntry(null, {
      type: "text_rule",
      text: "Never misspell ESPECIALISTAS",
    });
    const second = appendCampaignMemoryEntry(first, {
      type: "text_rule",
      text: "Never misspell ESPECIALISTAS",
    });

    expect(normalizeCampaignMemory(second).entries).toHaveLength(1);
  });
});
