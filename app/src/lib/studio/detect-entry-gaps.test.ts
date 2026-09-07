import { describe, expect, it } from "vitest";
import { detectEntryGaps, firstVisitComposerIntent, shouldHideProtocolSwitcher } from "./detect-entry-gaps";
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
  it("returns generic protocol and audience when workCount is 0 without inventing an offer", () => {
    const chips = detectEntryGaps({
      context: emptyFacts,
      request: "",
      hasAttachment: false,
      carouselEnabled: false,
    });
    expect(chips.map((chip) => chip.slot)).toEqual(["protocol", "audience"]);
    expect(chips[0]?.options).toEqual(["single", "variations", "format_adaptation", "restyle"]);
    expect(chips.some((chip) => chip.slot === "offer")).toBe(false);
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

  it("does not re-ask protocol, offer or audience when the request already uses catalog labels", () => {
    const chips = detectEntryGaps({
      context: emptyFacts,
      request: "Peça única de lançamento para quem ainda não conhece.",
      hasAttachment: false,
      carouselEnabled: false,
    });
    expect(chips.map((chip) => chip.slot)).toEqual([]);
  });

  it("does not invent an offer from an attachment or empty catalog", () => {
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
    expect(chips.some((chip) => chip.slot === "offer")).toBe(false);
  });

  it("asks offer only from brand-supported candidates", () => {
    const chips = detectEntryGaps({
      context: {
        ...emptyFacts,
        workCount: 2,
        protocol: "single",
        offerCandidates: ["imersão NR-1"],
      },
      request: "",
      hasAttachment: false,
      carouselEnabled: false,
    });
    expect(chips.find((chip) => chip.slot === "offer")?.options).toEqual(["imersão NR-1"]);
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

  it("hides protocol radios while the first-task interview still owns the objective", () => {
    expect(shouldHideProtocolSwitcher({
      enabled: true,
      chips: [{ slot: "protocol" }],
      answers: {},
    })).toBe(true);
    expect(shouldHideProtocolSwitcher({
      enabled: true,
      showContinue: true,
      chips: [],
      answers: { protocol: "single" },
    })).toBe(true);
    expect(shouldHideProtocolSwitcher({
      enabled: true,
      chips: [],
      answers: { protocol: "single" },
    })).toBe(false);
    expect(shouldHideProtocolSwitcher(null, { placement: "center" })).toBe(true);
    expect(shouldHideProtocolSwitcher(null, { placement: "center", intent: "single" })).toBe(true);
    expect(shouldHideProtocolSwitcher(null, { placement: "center", intent: "variations" })).toBe(false);
    expect(shouldHideProtocolSwitcher(null, { placement: "center", suggestedProtocol: "single" })).toBe(false);
    expect(shouldHideProtocolSwitcher(null, { placement: "dock" })).toBe(false);
  });

  it("starts a first visit as a single piece so Começar does not demand a reference", () => {
    expect(firstVisitComposerIntent({})).toBe("single");
    expect(firstVisitComposerIntent({ studioMode: "briefing" })).toBe("single");
    expect(firstVisitComposerIntent({ studioMode: "arte" })).toBe("variations");
    expect(firstVisitComposerIntent({ workId: "opened-work" })).toBeUndefined();
    expect(firstVisitComposerIntent({ initialIntent: "restyle", workId: "opened-work" })).toBe("restyle");
  });
});
