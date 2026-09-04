import { describe, expect, it } from "vitest";
import { detectEntryGaps } from "./detect-entry-gaps";
import type { EntryContext } from "./entry-types";

const emptyFacts = {
  protocol: null,
  offer: null,
  audience: null,
  tone: null,
  protocolCandidates: [],
  offerCandidates: [],
  audienceCandidates: [],
  toneCandidates: [],
  workCount: 0,
} satisfies EntryContext;

describe("detectEntryGaps", () => {
  it("returns generic protocol+offer+audience when workCount is 0", () => {
    const chips = detectEntryGaps({
      context: emptyFacts,
      request: "",
      hasAttachment: false,
      carouselEnabled: false,
    });
    expect(chips.map((chip) => chip.slot)).toEqual(["protocol", "offer", "audience"]);
    expect(chips[0]?.options).toEqual(["single", "variations", "format_adaptation", "restyle"]);
  });

  it("includes carousel in the generic protocol catalog when enabled", () => {
    const chips = detectEntryGaps({
      context: emptyFacts,
      request: "",
      hasAttachment: false,
      carouselEnabled: true,
    });
    expect(chips[0]?.options).toContain("carousel");
  });

  it("omits the protocol chip when every work shares single", () => {
    const chips = detectEntryGaps({
      context: {
        ...emptyFacts,
        workCount: 3,
        protocol: "single",
        offer: "imersão NR-1",
        tone: "institucional",
      },
      request: "",
      hasAttachment: false,
      carouselEnabled: false,
    });
    expect(chips.some((chip) => chip.slot === "protocol")).toBe(false);
    expect(chips.length).toBeLessThanOrEqual(3);
  });

  it("lists mixed protocols as chip options and drops social_post", () => {
    const chips = detectEntryGaps({
      context: {
        ...emptyFacts,
        workCount: 2,
        protocolCandidates: ["single", "variations"],
      },
      request: "",
      hasAttachment: false,
      carouselEnabled: false,
    });
    const protocol = chips.find((chip) => chip.slot === "protocol");
    expect(protocol?.options).toEqual(["single", "variations"]);
  });

  it("does not treat carousel as a fact or option when the gate is off", () => {
    const chips = detectEntryGaps({
      context: {
        ...emptyFacts,
        workCount: 2,
        protocol: "carousel",
        protocolCandidates: ["carousel", "single"],
      },
      request: "",
      hasAttachment: false,
      carouselEnabled: false,
    });
    const protocol = chips.find((chip) => chip.slot === "protocol");
    expect(protocol?.options).not.toContain("carousel");
    expect(chips.every((chip) => chip.slot !== "protocol" || chip.options.includes("single"))).toBe(true);
  });

  it("hides audience when the request already names a candidate", () => {
    const chips = detectEntryGaps({
      context: {
        ...emptyFacts,
        workCount: 2,
        protocol: "single",
        audienceCandidates: ["dentistas"],
      },
      request: "Peça para dentistas",
      hasAttachment: false,
      carouselEnabled: false,
    });
    expect(chips.some((chip) => chip.slot === "audience")).toBe(false);
  });

  it("does not close offer because an attachment exists", () => {
    const chips = detectEntryGaps({
      context: {
        ...emptyFacts,
        workCount: 2,
        protocol: "single",
      },
      request: "",
      hasAttachment: true,
      carouselEnabled: false,
    });
    expect(chips.some((chip) => chip.slot === "offer")).toBe(true);
  });

  it("caps chips at three and only then considers tone", () => {
    const chips = detectEntryGaps({
      context: {
        ...emptyFacts,
        workCount: 4,
        protocolCandidates: ["single", "restyle"],
        offerCandidates: ["A", "B"],
        audienceCandidates: ["X", "Y"],
        toneCandidates: ["direto"],
      },
      request: "",
      hasAttachment: false,
      carouselEnabled: false,
    });
    expect(chips).toHaveLength(3);
    expect(chips.map((chip) => chip.slot)).toEqual(["protocol", "offer", "audience"]);
  });
});
