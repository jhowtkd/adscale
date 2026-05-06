import { describe, expect, it } from "vitest";
import {
  analyzeBriefingLocal,
  applyBriefingFieldPatch,
  type BriefingDoctorInput,
} from "@/lib/briefing-doctor";

const baseBriefing: BriefingDoctorInput = {
  name: "Summer Sale",
  client: "Acme",
  objective: "Drive purchases",
  audience: "Women 25-34 who buy fitness apparel online",
  platforms: ["Meta"],
  tone: "Energetic",
  offer: "20% off until Sunday",
  constraints: "Use brand colors",
  notes: "",
  generationMode: "art_variation",
  creativeLevel: "balanced",
  targetFormat: "",
  ctaVariants: ["Shop now", "", ""],
};

describe("briefing doctor local rules", () => {
  it("detects missing objective", () => {
    const result = analyzeBriefingLocal({ ...baseBriefing, objective: "" });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "objective", severity: "high" }),
      ])
    );
  });

  it("detects missing audience", () => {
    const result = analyzeBriefingLocal({ ...baseBriefing, audience: "" });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "audience", severity: "high" }),
      ])
    );
  });

  it("flags generic audience", () => {
    const result = analyzeBriefingLocal({ ...baseBriefing, audience: "todos" });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "audience", severity: "medium" }),
      ])
    );
  });

  it("detects weak offer", () => {
    const result = analyzeBriefingLocal({ ...baseBriefing, offer: "Great deal" });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "offer" }),
      ])
    );
  });

  it("detects generic CTA", () => {
    const result = analyzeBriefingLocal({
      ...baseBriefing,
      ctaVariants: ["Clique aqui", "", ""],
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "ctaVariants", severity: "medium" }),
      ])
    );
  });

  it("detects missing target format for format adaptation", () => {
    const result = analyzeBriefingLocal({
      ...baseBriefing,
      generationMode: "format_adaptation",
      targetFormat: "",
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "targetFormat", severity: "high" }),
      ])
    );
  });

  it("applies a patch to one field only", () => {
    const result = applyBriefingFieldPatch(baseBriefing, {
      field: "audience",
      value: "Parents 30-45 shopping for school supplies",
    });
    expect(result.audience).toBe("Parents 30-45 shopping for school supplies");
    expect(result.offer).toBe(baseBriefing.offer);
  });

  it("does not overwrite existing CTAs when applying CTA patches", () => {
    const result = applyBriefingFieldPatch(baseBriefing, {
      field: "ctaVariants",
      value: ["Get 20% off", "Buy before Sunday"],
    });
    expect(result.ctaVariants).toEqual(["Shop now", "Get 20% off", "Buy before Sunday"]);
  });
});
