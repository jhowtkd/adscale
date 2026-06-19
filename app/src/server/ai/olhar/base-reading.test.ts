import { describe, expect, it } from "vitest";
import {
  buildBaseReadingPromptSection,
  normalizeBaseCreativeReading,
  type BaseCreativeReading,
} from "./base-reading";

const validReading: BaseCreativeReading = {
  dominantIdea: "NR1 specialist grid as hero",
  gestaltRead: "Dense card field with a single warm focal column",
  inviteWeight: "balanced",
  thumbnailRead: "Specialist faces read before the offer line",
  brandPresence: "present",
  risks: ["Headline competes with grid density", "CTA may shrink on Stories"],
};

describe("normalizeBaseCreativeReading", () => {
  it("normalizes a complete base reading", () => {
    expect(normalizeBaseCreativeReading(validReading)).toEqual(validReading);
  });

  it("returns null when required fields are missing", () => {
    expect(normalizeBaseCreativeReading({})).toBeNull();
    expect(
      normalizeBaseCreativeReading({
        dominantIdea: "idea",
        gestaltRead: "gestalt",
      })
    ).toBeNull();
  });

  it("defaults invite and brand enums when invalid", () => {
    const result = normalizeBaseCreativeReading({
      ...validReading,
      inviteWeight: "loud",
      brandPresence: "unknown",
    });
    expect(result?.inviteWeight).toBe("weak");
    expect(result?.brandPresence).toBe("weak");
  });

  it("caps risks at two non-empty strings", () => {
    const result = normalizeBaseCreativeReading({
      ...validReading,
      risks: ["one", "two", "three", "", "  "],
    });
    expect(result?.risks).toEqual(["one", "two"]);
  });
});

describe("buildBaseReadingPromptSection", () => {
  it("renders Leitura do base with optional risks", () => {
    const section = buildBaseReadingPromptSection(validReading);
    expect(section).toContain("## Leitura do base");
    expect(section).toContain("Ideia dominante");
    expect(section).toContain("Gestalt");
    expect(section).toContain("Peso do convite");
    expect(section).toContain("Leitura em miniatura");
    expect(section).toContain("Presença de marca");
    expect(section).toContain("### Riscos pré-geração");
    expect(section).toContain("Headline competes with grid density");
  });

  it("omits risks section when empty", () => {
    const section = buildBaseReadingPromptSection({
      ...validReading,
      risks: [],
    });
    expect(section).not.toContain("### Riscos pré-geração");
  });
});
