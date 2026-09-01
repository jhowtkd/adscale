import { describe, expect, it } from "vitest";
import { projectStudioEntryContext } from "./entry-facts";
import type { StudioEntryHistoryRow } from "./entry-facts";

const inferred = (
  value: string,
  state: "sourced" | "inferred" | "unknown",
  confidence?: "high" | "medium" | "low",
) => state === "unknown"
  ? { value: null, state }
  : state === "inferred"
    ? { value, state, confidence }
    : { value, state };

function work(partial: Partial<StudioEntryHistoryRow> & Pick<StudioEntryHistoryRow, "id" | "updatedAt">): StudioEntryHistoryRow {
  return {
    origin: "creative_work",
    toolKind: "single",
    offer: null,
    audience: null,
    tone: null,
    ...partial,
  };
}

describe("projectStudioEntryContext", () => {
  it("treats a single shared protocol as a fact", () => {
    const context = projectStudioEntryContext({
      rows: [
        work({ id: "a", updatedAt: new Date("2026-09-01"), toolKind: "single" }),
        work({ id: "b", updatedAt: new Date("2026-08-01"), toolKind: "single" }),
      ],
      kit: { toneOfVoice: null, toneNotes: null, description: null },
      carouselEnabled: false,
    });
    expect(context.workCount).toBe(2);
    expect(context.protocol).toBe("single");
  });

  it("drops social_post and does not copy carousel when the gate is off", () => {
    const context = projectStudioEntryContext({
      rows: [
        work({ id: "a", updatedAt: new Date("2026-09-01"), toolKind: "social_post" }),
        work({ id: "b", updatedAt: new Date("2026-08-01"), toolKind: "carousel" }),
      ],
      kit: { toneOfVoice: null, toneNotes: null, description: null },
      carouselEnabled: false,
    });
    expect(context.protocol).toBeNull();
    expect(context.protocolCandidates).toEqual([]);
  });

  it("keeps inferred medium offer as a candidate, not a fact", () => {
    const context = projectStudioEntryContext({
      rows: [
        work({
          id: "a",
          updatedAt: new Date("2026-09-01"),
          inferredOffer: inferred("Oferta mágica", "inferred", "medium"),
        }),
      ],
      kit: { toneOfVoice: null, toneNotes: null, description: null },
      carouselEnabled: false,
    });
    expect(context.offer).toBeNull();
    expect(context.offerCandidates).toContain("Oferta mágica");
  });

  it("accepts sourced offer and lets briefingOverrides win", () => {
    const context = projectStudioEntryContext({
      rows: [
        work({
          id: "a",
          updatedAt: new Date("2026-09-01"),
          inferredOffer: inferred("Prepare", "inferred", "high"),
          offerOverride: "Override do operador",
        }),
      ],
      kit: { toneOfVoice: null, toneNotes: null, description: null },
      carouselEnabled: false,
    });
    expect(context.offer).toBe("Override do operador");
  });

  it("suppresses high inferred offer when offerOverride key is present but empty", () => {
    const context = projectStudioEntryContext({
      rows: [
        work({
          id: "a",
          updatedAt: new Date("2026-09-01"),
          inferredOffer: inferred("Oferta inferida", "inferred", "high"),
          offerOverride: "",
        }),
      ],
      kit: { toneOfVoice: null, toneNotes: null, description: null },
      carouselEnabled: false,
    });
    expect(context.offer).toBeNull();
    expect(context.offerCandidates).not.toContain("Oferta inferida");
  });

  it("suppresses high inferred offer when offerOverride key is present but null", () => {
    const context = projectStudioEntryContext({
      rows: [
        work({
          id: "a",
          updatedAt: new Date("2026-09-01"),
          inferredOffer: inferred("Oferta inferida", "inferred", "high"),
          offerOverride: null,
        }),
      ],
      kit: { toneOfVoice: null, toneNotes: null, description: null },
      carouselEnabled: false,
    });
    expect(context.offer).toBeNull();
  });

  it("uses brief.offer as a fact when no inferred offer exists", () => {
    const context = projectStudioEntryContext({
      rows: [
        work({
          id: "a",
          updatedAt: new Date("2026-09-01"),
          offer: "Oferta do brief",
        }),
      ],
      kit: { toneOfVoice: null, toneNotes: null, description: null },
      carouselEnabled: false,
    });
    expect(context.offer).toBe("Oferta do brief");
  });

  it("reads campaign columns as sourced facts and ignores campaign protocol", () => {
    const context = projectStudioEntryContext({
      rows: [
        {
          origin: "campaign",
          id: "c1",
          updatedAt: new Date("2026-09-01"),
          toolKind: null,
          offer: "Matrículas",
          audience: "Gestores",
          tone: "Acolhedor",
        },
      ],
      kit: { toneOfVoice: null, toneNotes: null, description: null },
      carouselEnabled: false,
    });
    expect(context.protocol).toBeNull();
    expect(context.offer).toBe("Matrículas");
    expect(context.audience).toBe("Gestores");
    expect(context.tone).toBe("Acolhedor");
  });

  it("uses kit tone when works have none", () => {
    const context = projectStudioEntryContext({
      rows: [work({ id: "a", updatedAt: new Date("2026-09-01") })],
      kit: { toneOfVoice: "Direto", toneNotes: null, description: null },
      carouselEnabled: false,
    });
    expect(context.tone).toBe("Direto");
  });
});
